// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

import { imageIdMatches } from '../compiler/docker-broker.mjs';
import {
  FLASH_BYTES, QEMU_BINARY_SHA256, ROM_SHA256,
  validateBuiltArtifact,
} from './artifact.mjs';
import {
  BUILD_SCHEMA, COMMAND_SCHEMA, EDITOR_SCHEMA, FQBN, PROFILE,
  exactKeys, fault, validateBoundedSource,
} from './protocol.mjs';
import {
  VALIDATED_LED_CIRCUIT, resolveLed, validateGpio2LedCircuit,
} from './gpio2-adapter.mjs';
import { retryAfterForCode, retryFields, retryHeaders } from '../src/retry-guidance.mjs';

const execFileAsync = promisify(execFile);
const SHA256 = /^[0-9a-f]{64}$/u;
const FILE_KEYS = Object.freeze([
  'bootloader', 'partitions', 'bootApp0', 'application', 'elf',
  'mergedFlash', 'flashArgs', 'partitionCsv',
]);
export const C3_LIMITS = Object.freeze({
  requestBytes: 8192,
  compilerOutputBytes: 24 * 1024 * 1024,
  runtimeOutputBytes: 256 * 1024,
  sessions: 8,
  sessionsPerOrigin: 1,
  sessionTtlMs: 5 * 60 * 1000,
  buildTimeoutMs: 180_000,
  runtimeTimeoutMs: 30_000,
  concurrentBuilds: 1,
  concurrentRuntimes: 1,
});

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
});

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function token(bytes = 24) { return randomBytes(bytes).toString('base64url'); }
function bearer(request) {
  const match = /^Bearer ([A-Za-z0-9_-]{32})$/u.exec(request.headers.authorization ?? '');
  return match?.[1] ?? null;
}
function responseJson(response, status, value, headers = {}) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    ...headers,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(bytes.length),
  });
  response.end(bytes);
}
async function bodyJson(request, limit) {
  const declared = Number(request.headers['content-length'] ?? 0);
  if (!Number.isSafeInteger(declared) || declared < 0 || declared > limit) {
    throw fault('REQUEST_SIZE_LIMIT', 413);
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > limit) throw fault('REQUEST_SIZE_LIMIT', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw fault('REQUEST_JSON_INVALID'); }
}
function requestOrigin(request, trustProxy) {
  if (trustProxy) {
    const header = request.headers['x-forwarded-for'];
    const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0].trim();
    if (first && /^[0-9a-f:.]{3,64}$/iu.test(first)) return first;
  }
  return request.socket.remoteAddress ?? 'unknown';
}
function requireMutationContext(request, publicOrigin) {
  const expected = publicOrigin ?? `http://${request.headers.host}`;
  if (request.headers.origin !== expected || request.headers['x-intent-mcu-c3'] !== '1') {
    throw fault('REQUEST_CONTEXT_REJECTED', 403);
  }
  if ((request.headers['content-type'] ?? '').split(';')[0].trim() !== 'application/json') {
    throw fault('CONTENT_TYPE_REQUIRED', 415);
  }
}
async function ignoreDockerFailure(docker, args, dockerCommand) {
  try { await dockerCommand(docker, args, { timeout: 5_000 }); } catch { /* bounded cleanup */ }
}
async function exactContainerPresent(docker, name, dockerCommand) {
  let stdout;
  try {
    ({ stdout } = await dockerCommand(docker, ['container', 'ls', '-a',
      '--filter', `name=^/${name}$`, '--format', '{{.Names}}'], { timeout: 5_000 }));
  } catch {
    throw fault('OPERATION_CLEANUP_UNPROVEN', 502);
  }
  const names = stdout.trim() ? stdout.trim().split(/\r?\n/u) : [];
  if (names.length === 0) return false;
  if (names.length === 1 && names[0] === name) return true;
  throw fault('OPERATION_CLEANUP_UNPROVEN', 502);
}
export async function cleanupContainer(docker, name, racedCreation,
  dockerCommand = execFileAsync) {
  const attempts = racedCreation ? 60 : 1;
  for (let index = 0; index < attempts; index += 1) {
    await ignoreDockerFailure(docker, ['rm', '-f', name], dockerCommand);
    if (racedCreation) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!await exactContainerPresent(docker, name, dockerCommand)) return;
  await ignoreDockerFailure(docker, ['rm', '-f', name], dockerCommand);
  if (!await exactContainerPresent(docker, name, dockerCommand)) return;
  throw fault('OPERATION_CLEANUP_FAILED', 502);
}
export async function childJson({ docker, args, input, timeoutMs, outputLimit, signal, containerName,
  dockerCommand = execFileAsync, spawnProcess = spawn }) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(docker, args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let reason = null;
    let settled = false;
    const terminate = (nextReason) => {
      if (!reason) reason = nextReason;
      void ignoreDockerFailure(docker, ['kill', containerName], dockerCommand);
      if (!child.killed) child.kill('SIGKILL');
    };
    const abort = () => terminate('OPERATION_CANCELLED');
    const timer = setTimeout(() => terminate('OPERATION_TIMEOUT'), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > outputLimit) terminate('OPERATION_OUTPUT_LIMIT');
      else stdout.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= 64 * 1024) stderr.push(chunk);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    child.once('error', () => reject(fault('OPERATION_CHILD_FAILED', 502)));
    child.once('close', async (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      try {
        await cleanupContainer(docker, containerName, reason !== null, dockerCommand);
        if (reason) {
          const error = fault(reason, reason === 'OPERATION_CANCELLED' ? 409 : 504);
          error.cleanupConfirmed = true;
          throw error;
        }
        if (code !== 0) {
          const error = fault('OPERATION_CHILD_FAILED', 502);
          error.cleanupConfirmed = true;
          error.details = { diagnostic: Buffer.concat(stderr).toString('utf8').slice(-1200) };
          throw error;
        }
        let value;
        try { value = JSON.parse(Buffer.concat(stdout).toString('utf8').trim()); }
        catch {
          const error = fault('OPERATION_RESULT_INVALID', 502);
          error.cleanupConfirmed = true;
          throw error;
        }
        resolve(value);
      } catch (error) { reject(error); }
    });
  });
}

function decodeFiles(result) {
  if (!result || result.status !== 'succeeded' || !exactKeys(result.fileData, FILE_KEYS)) {
    throw fault('BUILD_ARTIFACT_SHAPE_INVALID', 502);
  }
  const files = {};
  try {
    for (const name of FILE_KEYS) {
      const encoded = result.fileData[name];
      if (typeof encoded !== 'string' || encoded.length % 4 !== 0
        || !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)) throw fault('BUILD_ARTIFACT_ENCODING_INVALID', 502);
      const bytes = Buffer.from(encoded, 'base64');
      if (bytes.toString('base64') !== encoded) throw fault('BUILD_ARTIFACT_ENCODING_INVALID', 502);
      files[name] = bytes;
    }
    return files;
  } catch (error) {
    for (const value of Object.values(files)) value.fill(0);
    throw error;
  }
}
function wipeArtifact(session) {
  session.flash?.fill(0);
  session.flash = null;
  session.descriptor = null;
  session.sourceSha256 = null;
  session.marker = null;
  session.gpioSource = null;
}
function ownedOperation(session, controller) {
  session.operationOutcome = null;
  let finished = false;
  let finish;
  const owner = {
    abort: () => controller.abort(),
    settled: new Promise((resolve) => { finish = resolve; }),
    finish: (error = null) => {
      if (finished) return;
      finished = true;
      const outcome = Object.freeze({
        processExited: error === null || error?.cleanupConfirmed === true,
        cleanupConfirmed: error === null || error?.cleanupConfirmed === true,
        code: error?.code ?? 'OPERATION_COMPLETE',
      });
      session.operationOutcome = outcome;
      finish(outcome);
    },
  };
  session.operation = owner;
  return owner;
}
function abortOperation(session) { session.operation?.abort(); }
async function retireOperation(session) {
  const owner = session.operation;
  if (owner) owner.abort();
  const outcome = owner ? await owner.settled : session.operationOutcome;
  if (owner && session.operation === owner) session.operation = null;
  if (outcome && outcome.processExited === true && outcome.cleanupConfirmed === true) return outcome;
  if (!owner && !outcome) return Object.freeze({ processExited: true,
    cleanupConfirmed: true, code: 'NO_OPERATION_OWNED' });
  throw fault('OPERATION_RETIREMENT_UNPROVEN', 502);
}
function dispose(session) {
  abortOperation(session);
  wipeArtifact(session);
  session.state = 'disposed';
}
function acceptedRuntimeCircuit(value) {
  const result = validateGpio2LedCircuit(value);
  if (result.accepted) return result;
  if (result.code !== 'CIRCUIT_DISCONNECTED' || value?.schema !== VALIDATED_LED_CIRCUIT.schema
    || value?.supplyVolts !== 3.3 || value?.gpio !== 2 || value?.resistorOhms !== 220
    || value?.ledForwardVolts !== 2 || !Array.isArray(value?.connections)) {
    throw fault('RUNTIME_CIRCUIT_INVALID');
  }
  return result;
}

export function createC3PublicService({
  builderImageLock, runtimeImageLock, docker = '/usr/bin/docker', publicOrigin = null,
  trustProxy = false, now = () => Date.now(), limits = C3_LIMITS,
  builder = null, runtime = null, testMode = false, dockerCommand = execFileAsync,
  spawnProcess = spawn,
} = {}) {
  if (!builderImageLock || !runtimeImageLock) throw new TypeError('C3_IMAGE_LOCKS_REQUIRED');
  const sessions = new Map();
  const metrics = {
    builds: 0, buildFailures: 0, runtimes: 0, staleResults: 0, disposed: 0,
    buildInFlight: 0, runtimeInFlight: 0,
  };
  let imagesVerified = false;

  async function verifyImages() {
    const inspect = async (lock) => {
      const { stdout } = await dockerCommand(docker, [
        'image', 'inspect', '--format', '{{.Id}}', lock.image,
      ], { timeout: 5_000 });
      if (!imageIdMatches(lock, stdout.trim())) throw fault('C3_IMAGE_MISMATCH', 503);
    };
    await Promise.all([inspect(builderImageLock), inspect(runtimeImageLock)]);
    imagesVerified = true;
    return true;
  }

  async function executeBuild({ source, marker, sourceSha256, signal }) {
    const containerName = `intent-mcu-c3-build-${token(8)}`;
    const args = [
      'run', '--rm', '-i', '--name', containerName, '--pull=never',
      '--label', 'com.intentforce.teach-lab.role=disposable-c3-build-job',
      '--network', 'none', '--read-only', '--user', '10001:10001',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
      '--pids-limit', '512', '--memory', '2g', '--memory-swap', '2g', '--cpus', '2',
      '--ipc', 'none', '--ulimit', 'nofile=256:256', '--ulimit', 'core=0:0',
      '--tmpfs', '/workspace:rw,nosuid,nodev,size=384m,uid=10001,gid=10001,mode=0700',
      '--tmpfs', '/tmp:rw,exec,nosuid,nodev,size=256m,uid=10001,gid=10001,mode=0700',
      '--env', 'HOME=/tmp/home', '--env', 'NO_UPDATE_NOTIFIER=1',
      '--entrypoint', 'python3', builderImageLock.image,
      '/opt/intent-mcu/c3/builder-worker.py',
    ];
    const manifest = await childJson({
      docker, args, timeoutMs: limits.buildTimeoutMs,
      outputLimit: limits.compilerOutputBytes, signal, containerName,
      dockerCommand, spawnProcess, input: JSON.stringify({ schema: 'intent-mcu-esp32c3-builder-job@1',
        profile: PROFILE, fqbn: FQBN, source, sourceSha256, marker }),
    });
    if (manifest.status !== 'succeeded') return { manifest, files: null };
    const files = decodeFiles(manifest);
    delete manifest.fileData;
    return { manifest, files };
  }

  async function executeRuntime({ flash, descriptor, mode, signal }) {
    const containerName = `intent-mcu-c3-runtime-${token(8)}`;
    const args = [
      'run', '--rm', '-i', '--name', containerName, '--pull=never',
      '--label', 'com.intentforce.teach-lab.role=disposable-c3-runtime-job',
      '--network', 'none', '--read-only', '--user', '65534:65534',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
      '--pids-limit', '256', '--memory', '768m', '--memory-swap', '768m', '--cpus', '1.5',
      '--ipc', 'none', '--ulimit', 'nofile=256:256', '--ulimit', 'core=0:0',
      '--tmpfs', '/tmp:rw,nosuid,nodev,size=128m,uid=65534,gid=65534,mode=0700',
      '--env', 'HOME=/tmp', runtimeImageLock.image,
    ];
    const input = JSON.stringify({
      schema: 'intent-mcu-esp32c3-runtime-job@1', mode,
      sourceSha256: descriptor.sourceSha256, flashSha256: descriptor.flash.sha256,
      marker: descriptor.marker, flashBase64: flash.toString('base64'),
    });
    return childJson({ docker, args, input, timeoutMs: limits.runtimeTimeoutMs, dockerCommand, spawnProcess,
      outputLimit: limits.runtimeOutputBytes, signal, containerName });
  }

  function sweep() {
    const cutoff = now() - limits.sessionTtlMs;
    for (const [id, session] of sessions) if (session.lastAccess < cutoff) {
      dispose(session);
      sessions.delete(id);
      metrics.disposed += 1;
    }
  }
  function authorized(request, id) {
    sweep();
    const session = sessions.get(id);
    if (!session || bearer(request) !== session.capability) throw fault('SESSION_NOT_FOUND', 404);
    if (requestOrigin(request, trustProxy) !== session.origin) throw fault('SESSION_NOT_FOUND', 404);
    session.lastAccess = now();
    return session;
  }
  function publicState(session) {
    return {
      schema: EDITOR_SCHEMA, sessionId: session.id, generation: session.generation,
      state: session.state, profile: PROFILE, fqbn: FQBN,
      artifact: session.descriptor ? {
        sourceSha256: session.descriptor.sourceSha256,
        flashSha256: session.descriptor.flash.sha256,
        applicationSha256: session.descriptor.flash.applicationSha256,
        flashBytes: session.descriptor.flash.bytes,
        marker: session.descriptor.marker,
      } : null,
      transientMemoryOnly: true, gpioPinStateObserved: false,
      generalEsp32Support: false, publicSupport: true, boundedPublicSupport: true,
    };
  }
  function validateBuildRequest(request) {
    if (!exactKeys(request, ['schema', 'profile', 'fqbn', 'source', 'sourceRevision'])
      || request.schema !== BUILD_SCHEMA || request.profile !== PROFILE || request.fqbn !== FQBN
      || !Number.isSafeInteger(request.sourceRevision) || request.sourceRevision < 1) {
      throw fault('BUILD_REQUEST_INVALID');
    }
  }

  async function build(session, request, { operationRetired = false } = {}) {
    validateBuildRequest(request);
    if (metrics.buildInFlight >= limits.concurrentBuilds) throw fault('BUILD_CONCURRENCY_LIMIT', 429,
      retryAfterForCode('BUILD_CONCURRENCY_LIMIT'));
    if (!operationRetired) await retireOperation(session);
    wipeArtifact(session);
    session.generation += 1;
    const generation = session.generation;
    session.state = 'building';
    let parsed;
    try { parsed = validateBoundedSource(request.source); }
    catch (error) {
      session.state = 'build-failed';
      metrics.buildFailures += 1;
      error.details = { diagnostics: [], generation };
      throw error;
    }
    const sourceSha256 = sha256(Buffer.from(parsed.source, 'utf8'));
    const controller = new AbortController();
    const operation = ownedOperation(session, controller);
    metrics.builds += 1;
    metrics.buildInFlight += 1;
    let output;
    let operationError = null;
    try {
      output = await (builder ?? executeBuild)({ source: parsed.source,
        marker: parsed.marker, sourceSha256, signal: controller.signal });
    } catch (error) {
      operationError = error;
      throw error;
    } finally {
      metrics.buildInFlight -= 1;
      operation.finish(operationError);
      if (session.operation === operation) session.operation = null;
    }
    if (!sessions.has(session.id) || session.generation !== generation) {
      output.files?.mergedFlash?.fill(0);
      metrics.staleResults += 1;
      throw fault('BUILD_RESULT_STALE', 409);
    }
    if (output.manifest?.status !== 'succeeded' || !output.files) {
      session.state = 'build-failed';
      metrics.buildFailures += 1;
      const error = fault(output.manifest?.code ?? 'BUILD_FAILED', 422);
      error.details = { diagnostics: output.manifest?.diagnostics ?? [], generation };
      throw error;
    }
    let descriptor;
    try {
      descriptor = validateBuiltArtifact({ source: parsed.source, marker: parsed.marker,
        manifest: output.manifest, files: output.files });
    } finally {
      for (const [name, value] of Object.entries(output.files)) if (name !== 'mergedFlash') value.fill(0);
    }
    session.flash = Buffer.from(output.files.mergedFlash);
    output.files.mergedFlash.fill(0);
    session.descriptor = descriptor;
    session.sourceSha256 = sourceSha256;
    session.marker = parsed.marker;
    session.gpioSource = parsed.gpio;
    session.state = 'built';
    session.lastAccess = now();
    return { ...publicState(session), sourceRevision: request.sourceRevision,
      toolchain: descriptor.toolchain, diagnostics: output.manifest.diagnostics };
  }

  function validateRuntime(result, descriptor) {
    if (!result || result.schema !== 'intent-mcu-esp32c3-public-runtime@1'
      || result.profile !== PROFILE || result.fqbn !== FQBN
      || result.sourceSha256 !== descriptor.sourceSha256
      || result.flashSha256 !== descriptor.flash.sha256 || result.marker !== descriptor.marker
      || result.engine?.provider !== 'Espressif' || result.engine?.machine !== 'esp32c3'
      || result.engine?.actualExecution !== true || result.engine?.binarySha256 !== QEMU_BINARY_SHA256
      || result.rom?.sha256 !== ROM_SHA256 || result.mode !== 'run'
      || result.uart?.exactApplicationText !== descriptor.marker || result.uart?.markerCount !== 2
      || result.resetReplay !== true || result.watchdog !== false
      || result.lifecycle?.cpuPauseSupported !== false
      || result.isolation?.network !== 'none' || result.isolation?.durableSourceStorage !== false
      || result.gpioPinStateObserved !== false || result.generalEsp32Support !== false
      || result.publicSupport !== true || result.boundedPublicSupport !== true
      || result.gpio?.qemuPinStateObserved !== false
      || result.gpio?.cpuExecution !== 'Espressif QEMU esp32c3'
      || result.gpio?.peripheralInterpretation !== 'IntentForce project-owned ESP32-C3 GPIO2 adapter'
      || !Number.isSafeInteger(result.gpio?.executedWrites)
      || !Array.isArray(result.gpio?.adapterEpochs) || result.gpio.adapterEpochs.length !== 2
      || result.gpio.adapterEpochs.some((epoch) => epoch?.provenance?.qemuPinStateObserved !== false)) {
      throw fault('RUNTIME_RESULT_INVALID', 502);
    }
    return structuredClone(result);
  }
  async function run(session, request) {
    if (metrics.runtimeInFlight >= limits.concurrentRuntimes) throw fault('RUNTIME_CONCURRENCY_LIMIT', 429,
      retryAfterForCode('RUNTIME_CONCURRENCY_LIMIT'));
    if (!session.flash || !session.descriptor) throw fault('RUN_REQUIRES_CURRENT_BUILD', 409);
    if (request.profile !== PROFILE || request.fqbn !== FQBN
      || request.sourceSha256 !== session.sourceSha256
      || request.artifactSha256 !== session.descriptor.flash.sha256
      || !SHA256.test(request.sourceSha256) || !SHA256.test(request.artifactSha256)
      || sha256(session.flash) !== session.descriptor.flash.sha256
      || session.flash.length !== FLASH_BYTES) throw fault('RUN_IDENTITY_MISMATCH', 409);
    const circuitValidation = acceptedRuntimeCircuit(request.circuit);
    const generation = session.generation;
    const descriptor = session.descriptor;
    const controller = new AbortController();
    const operation = ownedOperation(session, controller);
    session.state = 'running';
    metrics.runtimeInFlight += 1;
    metrics.runtimes += 1;
    let result;
    let operationError = null;
    try {
      result = await (runtime ?? executeRuntime)({ flash: session.flash,
        descriptor, mode: 'run', signal: controller.signal });
    } catch (error) {
      operationError = error;
      throw error;
    } finally {
      metrics.runtimeInFlight -= 1;
      operation.finish(operationError);
      if (session.operation === operation) session.operation = null;
    }
    if (!sessions.has(session.id) || session.generation !== generation) {
      metrics.staleResults += 1;
      throw fault('RUNTIME_RESULT_STALE', 409);
    }
    const accepted = validateRuntime(result, descriptor);
    accepted.modeledCircuit = {
      schema: 'intent-mcu-c3-modeled-led-result@1',
      source: session.gpioSource,
      validation: circuitValidation,
      epochs: accepted.gpio.adapterEpochs.map((adapter) => ({
        adapter, led: resolveLed(adapter, request.circuit),
      })),
      voltageSource: 'compiled-register-writes-through-project-owned-adapter',
      qemuPinStateObserved: false,
    };
    session.state = 'complete';
    session.lastAccess = now();
    return { ...publicState(session), runtime: accepted };
  }

  async function handle(request, response) {
    const url = new URL(request.url, `http://${request.headers.host ?? '127.0.0.1'}`);
    if (!url.pathname.startsWith('/api/c3/') && url.pathname !== '/api/c3') return false;
    try {
      if (url.pathname === '/api/c3/session' && request.method === 'POST') {
        requireMutationContext(request, publicOrigin);
        await bodyJson(request, limits.requestBytes);
        sweep();
        const origin = requestOrigin(request, trustProxy);
        if (sessions.size >= limits.sessions
          || [...sessions.values()].filter((session) => session.origin === origin).length >= limits.sessionsPerOrigin) {
          throw fault('SESSION_LIMIT', 429, retryAfterForCode('SESSION_LIMIT'));
        }
        const session = { id: token(12), capability: token(), origin, generation: 0,
          state: 'editing', flash: null, descriptor: null, sourceSha256: null,
          gpioSource: null, marker: null, operation: null, operationOutcome: null, lastAccess: now() };
        sessions.set(session.id, session);
        responseJson(response, 201, { ...publicState(session), capability: session.capability });
        return true;
      }
      const buildMatch = /^\/api\/c3\/session\/([A-Za-z0-9_-]{16})\/build$/u.exec(url.pathname);
      if (buildMatch && request.method === 'POST') {
        requireMutationContext(request, publicOrigin);
        const session = authorized(request, buildMatch[1]);
        if (metrics.buildInFlight >= limits.concurrentBuilds) {
          throw fault('BUILD_CONCURRENCY_LIMIT', 429, retryAfterForCode('BUILD_CONCURRENCY_LIMIT'));
        }
        const buildRequest = await bodyJson(request, limits.requestBytes);
        validateBuildRequest(buildRequest);
        await retireOperation(session);
        const job = { id: token(8), status: 'pending', value: null, error: null };
        session.buildJob = job;
        const buildPromise = build(session, buildRequest, { operationRetired: true });
        const acceptedGeneration = session.generation;
        buildPromise.then((value) => {
          if (session.buildJob === job) { job.status = 'succeeded'; job.value = value; }
        }, (error) => {
          if (session.buildJob === job) {
            job.status = 'failed';
            job.error = { code: typeof error?.code === 'string' ? error.code : 'BUILD_FAILED',
              ...(error?.details ?? {}) };
          }
        });
        responseJson(response, 202, { ...publicState(session), generation: acceptedGeneration, buildJobId: job.id,
          buildStatus: job.status });
        return true;
      }
      const pollMatch = /^\/api\/c3\/session\/([A-Za-z0-9_-]{16})\/build\/([A-Za-z0-9_-]{11})$/u.exec(url.pathname);
      if (pollMatch && request.method === 'GET') {
        const session = authorized(request, pollMatch[1]);
        const job = session.buildJob;
        if (!job || job.id !== pollMatch[2]) throw fault('BUILD_JOB_NOT_FOUND', 404);
        responseJson(response, job.status === 'pending' ? 202 : 200,
          job.status === 'succeeded' ? { status: job.status, value: job.value }
            : job.status === 'failed' ? { status: job.status, error: job.error }
              : { status: job.status });
        return true;
      }
      const commandMatch = /^\/api\/c3\/session\/([A-Za-z0-9_-]{16})\/command$/u.exec(url.pathname);
      if (commandMatch && request.method === 'POST') {
        requireMutationContext(request, publicOrigin);
        const session = authorized(request, commandMatch[1]);
        const command = await bodyJson(request, limits.requestBytes);
        if (!exactKeys(command, ['schema', 'command', 'generation', 'profile', 'fqbn',
          'sourceSha256', 'artifactSha256', 'circuit']) || command.schema !== COMMAND_SCHEMA
          || !['run', 'invalidate', 'dispose'].includes(command.command)
          || command.generation !== session.generation) throw fault('RUNTIME_COMMAND_INVALID');
        if (command.command === 'run') {
          responseJson(response, 200, await run(session, command));
          return true;
        }
        if (command.command === 'dispose') {
          const retirement = {
            schema: 'intent-mcu-c3-retirement@1', sessionId: session.id,
            generation: session.generation, sourceSha256: session.sourceSha256,
            artifactSha256: session.descriptor?.flash.sha256 ?? null,
          };
          session.state = 'disposing';
          let outcome;
          try { outcome = await retireOperation(session); }
          catch (error) {
            wipeArtifact(session);
            session.state = 'retirement-unproven';
            throw error;
          }
          wipeArtifact(session);
          session.state = 'disposed';
          sessions.delete(session.id);
          metrics.disposed += 1;
          responseJson(response, 200, { ...retirement, state: 'disposed', retainedBytes: 0,
            processExited: outcome.processExited, operationRetired: outcome.cleanupConfirmed });
          return true;
        }
        await retireOperation(session);
        wipeArtifact(session);
        session.generation += 1;
        session.state = 'editing';
        responseJson(response, 200, publicState(session));
        return true;
      }
      if (testMode && url.pathname === '/api/c3/__test/state' && request.method === 'GET') {
        sweep();
        responseJson(response, 200, { ...metrics, activeSessions: sessions.size,
          retainedFlashBytes: [...sessions.values()].reduce((sum, value) => sum + (value.flash?.length ?? 0), 0),
          imagesVerified });
        return true;
      }
      throw fault('NOT_FOUND', 404);
    } catch (error) {
      const code = typeof error?.code === 'string' ? error.code : 'C3_SERVICE_ERROR';
      responseJson(response, Number.isInteger(error?.status) ? error.status : 500,
        { code, ...(error?.details ?? {}), ...retryFields(code, error?.retryAfterSeconds) },
        retryHeaders(code, error?.retryAfterSeconds));
      return true;
    }
  }

  return {
    handle,
    verifyImages,
    readiness: () => ({ ready: imagesVerified, code: imagesVerified ? 'READY' : 'C3_IMAGES_UNVERIFIED' }),
    metrics: () => ({ ...metrics, activeSessions: sessions.size }),
    close: async () => {
      for (const session of sessions.values()) dispose(session);
      sessions.clear();
    },
  };
}
