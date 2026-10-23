// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0

import { execFile, spawn } from 'node:child_process';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { imageIdMatches } from '../compiler/docker-broker.mjs';
import { parseStrictJson } from '../src/strict-json.mjs';
import { loadStm32F429FirmwareArtifact } from './artifact.mjs';
import {
  STM32_BUILD_RESPONSE_SCHEMA, STM32_BUILD_SCHEMA, STM32_ELF_LIMIT, STM32_PROFILE,
  STM32_RUN_RESPONSE_SCHEMA, STM32_RUN_SCHEMA, exactKeys, fault, validateStm32Source,
} from './protocol.mjs';
import { parseStm32RuntimeResult } from './runtime-result.mjs';
import { retryAfterForCode, retryFields, retryHeaders } from '../src/retry-guidance.mjs';
import {
  X92_STM32_COMPLETION_SCHEMA, normalizeX92Stm32Binding,
} from '../src/x92-stm32-budget-integration.mjs';
import { STM32_EXECUTION_IDENTITIES } from '../src/stm32-execution-identities.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';

const execFileAsync = promisify(execFile);
const SHA256 = /^[0-9a-f]{64}$/u;
const BUILDER_RESULT_SCHEMA = 'intent-mcu-stm32-builder-result@1';
export const STM32_LIMITS = Object.freeze({
  requestBytes: 96 * 1024,
  buildTimeoutMs: 15_000,
  runtimeTimeoutMs: 90_000,
  compilerOutputBytes: 96 * 1024,
  runtimeOutputBytes: 256 * 1024,
  concurrentBuilds: 1,
  concurrentRuntimes: 1,
  rateWindowMs: 60_000,
  rateLimit: 12,
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
function token() { return randomBytes(8).toString('hex'); }
function responseJson(response, status, value, headers = {}) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  response.writeHead(status, { ...SECURITY_HEADERS, ...headers,
    'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(bytes.length) });
  response.end(bytes);
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
  if (request.headers.origin !== expected || request.headers['x-intent-mcu-stm32'] !== '1') {
    throw fault('REQUEST_CONTEXT_REJECTED', 403);
  }
  if ((request.headers['content-type'] ?? '').split(';')[0].trim() !== 'application/json') {
    throw fault('CONTENT_TYPE_REQUIRED', 415);
  }
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
  try { return parseStrictJson(Buffer.concat(chunks).toString('utf8'), limit); }
  catch (error) { throw fault(error.code ?? 'REQUEST_JSON_INVALID'); }
}
async function ignoreDockerFailure(docker, args) {
  try { await execFileAsync(docker, args, { timeout: 5_000 }); } catch { /* bounded cleanup */ }
}
async function cleanupContainer(docker, name) {
  await ignoreDockerFailure(docker, ['rm', '-f', name]);
}
async function daemonContainerAbsent(docker, name) {
  try {
    await execFileAsync(docker, ['container', 'inspect', '--format', '{{.Id}}', name], { timeout: 5_000 });
    return false;
  } catch (error) {
    return /No such (?:object|container)/iu.test(`${error?.stderr ?? ''}${error?.message ?? ''}`);
  }
}
export async function childOutput({ docker, args, input = '', timeoutMs, outputLimit, signal, containerName }) {
  return new Promise((resolve, reject) => {
    const child = spawn(docker, args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    let reason = null;
    let settled = false;
    const terminate = (nextReason) => {
      if (!reason) reason = nextReason;
      void ignoreDockerFailure(docker, ['kill', containerName]);
      if (!child.killed) child.kill('SIGKILL');
    };
    const abort = () => terminate('OPERATION_CANCELLED');
    const timer = setTimeout(() => terminate('OPERATION_TIMEOUT'), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > outputLimit) terminate('OPERATION_OUTPUT_LIMIT');
      else stdout.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      if (Buffer.concat(stderr).length < 64 * 1024) stderr.push(chunk);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    child.once('error', () => reject(fault('OPERATION_CHILD_FAILED', 502)));
    child.once('close', async (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      await cleanupContainer(docker, containerName);
      const containerAbsent = await daemonContainerAbsent(docker, containerName);
      signal?.removeEventListener('abort', abort);
      if (reason) return reject(fault(reason, reason === 'OPERATION_CANCELLED' ? 409 : 504));
      if (signal?.aborted) return reject(fault('OPERATION_CANCELLED', 409));
      if (!containerAbsent) return reject(fault('OPERATION_CONTAINER_RETIREMENT_UNPROVEN', 502));
      const output = Buffer.concat(stdout).toString('utf8').trim();
      if (code !== 0) {
        const error = fault('OPERATION_CHILD_FAILED', 502);
        error.detail = Buffer.concat(stderr).toString('utf8').slice(-1200);
        return reject(error);
      }
      resolve({ output, processExited: true, daemonContainerAbsent: true, containerName });
    });
  });
}

function decodeElf(value) {
  if (!exactKeys(value, ['format', 'bytes', 'sha256', 'base64']) || value.format !== 'elf32'
    || !Number.isSafeInteger(value.bytes) || value.bytes < 52 || value.bytes > STM32_ELF_LIMIT
    || !SHA256.test(value.sha256 ?? '') || typeof value.base64 !== 'string'
    || value.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value.base64)) {
    throw fault('FIRMWARE_INPUT_INVALID', 422);
  }
  const bytes = Buffer.from(value.base64, 'base64');
  if (bytes.byteLength !== value.bytes || bytes.toString('base64') !== value.base64
    || sha256(bytes) !== value.sha256) {
    bytes.fill(0);
    throw fault('FIRMWARE_HASH_MISMATCH', 422);
  }
  return bytes;
}

export function createStm32PublicService({
  builderImageLock, runtimeImageLock, docker = '/usr/bin/docker', publicOrigin = null,
  trustProxy = false, now = () => Date.now(), limits = STM32_LIMITS,
  builder = null, runtime = null, testMode = false,
} = {}) {
  if (!builderImageLock || !runtimeImageLock) throw new TypeError('STM32_IMAGE_LOCKS_REQUIRED');
  let imagesVerified = testMode;
  let buildInFlight = 0;
  let runtimeInFlight = 0;
  let operationSequence = 0;
  const completionSecret = randomBytes(32);
  const completions = new Map();
  const active = new Set();
  const rates = new Map();
  const metrics = { builds: 0, runs: 0, failures: 0, cancelled: 0 };

  async function verifyImages() {
    const inspect = async (lock) => {
      const { stdout } = await execFileAsync(docker, ['image', 'inspect', '--format', '{{.Id}}', lock.image],
        { timeout: 5_000 });
      if (!imageIdMatches(lock, stdout.trim())) throw fault('STM32_IMAGE_MISMATCH', 503);
    };
    await Promise.all([inspect(builderImageLock), inspect(runtimeImageLock)]);
    imagesVerified = true;
    return true;
  }
  function rate(origin) {
    const cutoff = now() - limits.rateWindowMs;
    const recent = (rates.get(origin) ?? []).filter((time) => time > cutoff);
    if (recent.length >= limits.rateLimit) {
      const retryAfterSeconds = Math.max(1,
        Math.ceil((recent[0] + limits.rateWindowMs - now()) / 1000));
      throw fault('RATE_LIMIT', 429, '', retryAfterSeconds);
    }
    recent.push(now());
    rates.set(origin, recent);
  }
  async function executeBuild({ source, sourceSha256, signal }) {
    const containerName = `intent-mcu-stm32-build-${token()}`;
    const args = [
      'run', '--rm', '-i', '--pull=never', '--name', containerName,
      '--label', 'com.intentforce.teach-lab.role=disposable-stm32-public-build-job',
      '--network', 'none', '--read-only', '--user', '65534:65534', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges:true', '--pids-limit', '32', '--memory', '256m',
      '--memory-swap', '256m', '--cpus', '1', '--ipc', 'none', '--ulimit', 'nofile=64:64',
      '--ulimit', 'fsize=98304:98304',
      '--tmpfs', '/workspace:rw,nosuid,nodev,size=16m,uid=65534,gid=65534,mode=0700',
      '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=8m,uid=65534,gid=65534,mode=0700',
      '--env', 'HOME=/tmp', builderImageLock.image,
    ];
    const execution = await childOutput({ docker, args, timeoutMs: limits.buildTimeoutMs,
      outputLimit: limits.compilerOutputBytes, signal, containerName,
      input: JSON.stringify({ schema: 'intent-mcu-stm32-builder-job@1',
        profile: STM32_PROFILE, source, sourceSha256 }) });
    let value;
    try { value = parseStrictJson(execution.output, limits.compilerOutputBytes); }
    catch { throw fault('BUILD_RESULT_INVALID', 502); }
    return value;
  }
  function validateBuildOutput(value, sourceSha256, source) {
    if (value?.schema !== BUILDER_RESULT_SCHEMA || value.status !== 'succeeded'
      || value.profile !== STM32_PROFILE || value.sourceSha256 !== sourceSha256
      || JSON.stringify(value.behavior) !== JSON.stringify({
        pb0: source.pb0, marker: source.marker, uartText: source.uartText,
      })) {
      throw fault(value?.code ?? 'BUILD_RESULT_INVALID', value?.status === 'failed' ? 422 : 502);
    }
    const elf = decodeElf(value.elf);
    try {
      const loaded = loadStm32F429FirmwareArtifact({ profile: STM32_PROFILE, format: 'elf32',
        bytes: elf, expectedSha256: value.elf.sha256 });
      if (loaded.descriptor.initialStackPointer !== value.vector?.initialStackPointer
        || loaded.descriptor.resetVector !== value.vector?.resetVector) throw fault('BUILD_RESULT_INVALID', 502);
      return value;
    } finally { elf.fill(0); }
  }
  async function executeRuntime({ elf, expected, signal }) {
    const containerName = `intent-mcu-stm32-runtime-${token()}`;
    const args = [
      'run', '--rm', '--pull=never', '--name', containerName,
      '--label', 'com.intentforce.teach-lab.role=disposable-stm32-public-runtime-job',
      '--network', 'none', '--read-only', '--user', '65534:65534', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges:true', '--pids-limit', '256', '--memory', '512m',
      '--memory-swap', '512m', '--cpus', '1.5', '--ipc', 'none', '--ulimit', 'nofile=1024:1024',
      '--ulimit', 'core=0:0', '--tmpfs', '/tmp:rw,exec,nosuid,nodev,size=64m,uid=65534,gid=65534,mode=0700',
      '--env', 'HOME=/tmp', '--env', 'PYTHONDONTWRITEBYTECODE=1', runtimeImageLock.image,
      '--fixture', 'elf-source', '--budget', '4096', '--elf-base64', elf.toString('base64'),
      '--expected-sha256', expected.elfSha256, '--expected-pb0', expected.pb0 ? '1' : '0',
      '--expected-uart-base64', Buffer.from(expected.uartText, 'ascii').toString('base64'),
    ];
    const execution = await childOutput({ docker, args, timeoutMs: limits.runtimeTimeoutMs,
      outputLimit: limits.runtimeOutputBytes, signal, containerName });
    return { value: parseStm32RuntimeResult(execution.output, expected), lifecycle: execution };
  }
  function completionSignature(operationId, binding) {
    return createHmac('sha256', completionSecret)
      .update(`${operationId}\n${JSON.stringify(binding)}`, 'utf8').digest('hex');
  }
  function issueCompletion(binding, lifecycle) {
    if (lifecycle?.processExited !== true || lifecycle?.daemonContainerAbsent !== true) {
      throw fault('OPERATION_CONTAINER_RETIREMENT_UNPROVEN', 502);
    }
    const operationId = `stm32-operation-${++operationSequence}`;
    const completion = Object.freeze({ schema: X92_STM32_COMPLETION_SCHEMA, operationId,
      binding: structuredClone(binding), state: 'quiescent', processExited: true,
      daemonContainerAbsent: true, artifactPreserved: true, completedNaturally: true,
      signature: completionSignature(operationId, binding) });
    completions.set(operationId, completion);
    if (completions.size > 32) completions.delete(completions.keys().next().value);
    return completion;
  }
  function verifyCompletion(value) {
    const binding = normalizeX92Stm32Binding(value?.binding);
    const expected = completions.get(value?.operationId);
    const supplied = Buffer.from(value?.signature ?? '', 'hex');
    const authentic = expected && supplied.byteLength === 32
      && timingSafeEqual(supplied, Buffer.from(completionSignature(value.operationId, binding), 'hex'));
    if (!authentic || JSON.stringify(expected) !== JSON.stringify(value)) {
      throw fault('X92_STM32_COMPLETION_UNAUTHENTICATED', 409);
    }
    completions.delete(value.operationId);
    return expected;
  }
  function abortFor(request, response) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.once('aborted', abort);
    response.once('close', abort);
    if (request.aborted || response.destroyed) controller.abort();
    active.add(controller);
    return { controller, done() {
      request.off('aborted', abort);
      response.off('close', abort);
      active.delete(controller);
    } };
  }
  async function buildRequest(request, response) {
    const body = await bodyJson(request, limits.requestBytes);
    if (!exactKeys(body, ['schema', 'profile', 'sourceRevision', 'source'])
      || body.schema !== STM32_BUILD_SCHEMA || body.profile !== STM32_PROFILE
      || !Number.isSafeInteger(body.sourceRevision) || body.sourceRevision < 1) {
      throw fault('BUILD_REQUEST_INVALID');
    }
    const source = validateStm32Source(body.source);
    if (buildInFlight >= limits.concurrentBuilds) throw fault('BUILD_CONCURRENCY_LIMIT', 429, '',
      retryAfterForCode('BUILD_CONCURRENCY_LIMIT'));
    const sourceSha256 = sha256(Buffer.from(source.source, 'utf8'));
    const operation = abortFor(request, response);
    if (operation.controller.signal.aborted) throw fault('OPERATION_CANCELLED', 409);
    buildInFlight += 1;
    metrics.builds += 1;
    try {
      const rawValue = await (builder ?? executeBuild)({ source: source.source, sourceSha256,
        signal: operation.controller.signal });
      const value = validateBuildOutput(rawValue, sourceSha256, source);
      return {
        schema: STM32_BUILD_RESPONSE_SCHEMA, profile: STM32_PROFILE,
        sourceRevision: body.sourceRevision, sourceSha256, behavior: value.behavior,
        artifact: value.elf, compiler: value.compiler,
        retainedServerBytes: 0, durableServerProject: false, boundedPublicSupport: true,
      };
    } finally { buildInFlight -= 1; operation.done(); }
  }
  async function runRequest(request, response) {
    const body = await bodyJson(request, limits.requestBytes);
    const keys = body?.x92Binding
      ? ['schema', 'profile', 'sourceRevision', 'source', 'sourceSha256', 'artifact', 'x92Binding']
      : ['schema', 'profile', 'sourceRevision', 'source', 'sourceSha256', 'artifact'];
    if (!exactKeys(body, keys)
      || body.schema !== STM32_RUN_SCHEMA || body.profile !== STM32_PROFILE
      || !Number.isSafeInteger(body.sourceRevision) || body.sourceRevision < 1
      || !SHA256.test(body.sourceSha256 ?? '')) throw fault('RUN_REQUEST_INVALID');
    const source = validateStm32Source(body.source);
    if (sha256(Buffer.from(source.source, 'utf8')) !== body.sourceSha256) {
      throw fault('RUN_SOURCE_IDENTITY_MISMATCH', 409);
    }
    const binding = body.x92Binding ? normalizeX92Stm32Binding(body.x92Binding) : null;
    if (binding && (binding.profile !== STM32_PROFILE
      || binding.sourceIdentity !== `sha256:${body.sourceSha256}`
      || binding.elfIdentity !== `sha256:${body.artifact?.sha256 ?? ''}`
      || binding.modelIdentity !== `sha256:${CURRENT_MODEL_LIBRARY_LOCK.implementationSha256}`
      || binding.compiler.imageIdentity !== STM32_EXECUTION_IDENTITIES.compilerImageIdentity
      || binding.compiler.toolchainIdentity !== STM32_EXECUTION_IDENTITIES.compilerToolchainIdentity
      || binding.runtime.imageIdentity !== STM32_EXECUTION_IDENTITIES.runtimeImageIdentity
      || binding.runtime.binaryIdentity !== STM32_EXECUTION_IDENTITIES.runtimeBinaryIdentity)) {
      throw fault('X92_STM32_BINDING_MISMATCH', 409);
    }
    if (runtimeInFlight >= limits.concurrentRuntimes) throw fault('RUNTIME_CONCURRENCY_LIMIT', 429, '',
      retryAfterForCode('RUNTIME_CONCURRENCY_LIMIT'));
    const elf = decodeElf(body.artifact);
    try {
      loadStm32F429FirmwareArtifact({ profile: STM32_PROFILE, format: 'elf32', bytes: elf,
        expectedSha256: body.artifact.sha256 });
      const operation = abortFor(request, response);
      if (operation.controller.signal.aborted) throw fault('OPERATION_CANCELLED', 409);
      runtimeInFlight += 1;
      metrics.runs += 1;
      try {
        const expected = { pb0: source.pb0, uartText: source.uartText,
          elfSha256: body.artifact.sha256, elfBytes: body.artifact.bytes };
        const execution = await (runtime ?? executeRuntime)({ elf, expected,
          signal: operation.controller.signal });
        const value = execution?.value ?? execution;
        const lifecycle = execution?.lifecycle ?? (testMode
          ? { processExited: true, daemonContainerAbsent: true } : null);
        const response = {
          schema: STM32_RUN_RESPONSE_SCHEMA, profile: STM32_PROFILE,
          sourceRevision: body.sourceRevision, sourceSha256: body.sourceSha256,
          elfSha256: body.artifact.sha256,
          engine: { id: 'renode', version: value.engine.version, actualExecution: true },
          observed: { pb0: value.observed.pb0, uartText: value.observed.uartText },
          resetReplay: value.resetReplay, bootEpochs: 2,
          instructionOrdinalsNotPhysicalCycles: true, retainedServerBytes: 0,
          durableServerProject: false, boundedPublicSupport: true, fullStm32Support: false,
        };
        return binding ? { ...response, completion: issueCompletion(binding, lifecycle) } : response;
      } finally { runtimeInFlight -= 1; operation.done(); }
    } finally { elf.fill(0); }
  }

  async function handle(request, response) {
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/stm32')) return false;
    try {
      if (!imagesVerified) throw fault('STM32_IMAGES_UNVERIFIED', 503);
      if (request.method !== 'POST'
          || !['/api/stm32/build', '/api/stm32/run', '/api/stm32/quiescence'].includes(url.pathname)) {
        throw fault('ROUTE_NOT_FOUND', 404);
      }
      requireMutationContext(request, publicOrigin);
      rate(requestOrigin(request, trustProxy));
      let value;
      if (url.pathname.endsWith('/build')) value = await buildRequest(request, response);
      else if (url.pathname.endsWith('/run')) value = await runRequest(request, response);
      else {
        const body = await bodyJson(request, limits.requestBytes);
        if (!exactKeys(body, ['schema', 'binding', 'completion'])
            || body.schema !== 'intent-mcu-x92-stm32-quiescence-request@1'
            || JSON.stringify(normalizeX92Stm32Binding(body.binding))
              !== JSON.stringify(body.completion?.binding)) {
          throw fault('X92_STM32_QUIESCENCE_REQUEST_INVALID', 422);
        }
        value = { schema: 'intent-mcu-x92-stm32-quiescence-response@1',
          completion: verifyCompletion(body.completion) };
      }
      responseJson(response, 200, value);
    } catch (error) {
      metrics.failures += 1;
      if (error?.code === 'OPERATION_CANCELLED') metrics.cancelled += 1;
      if (!response.headersSent && !response.destroyed) {
        const code = error.code ?? 'STM32_REQUEST_FAILED';
        responseJson(response, error.httpStatus ?? 400, { ok: false, code,
          ...retryFields(code, error?.retryAfterSeconds) },
        retryHeaders(code, error?.retryAfterSeconds));
      }
    }
    return true;
  }
  async function close() {
    for (const controller of active) controller.abort();
    active.clear();
    completionSecret.fill(0);
    completions.clear();
  }
  function attestation() {
    return structuredClone({
      schema: 'intent-mcu-stm32-service-attestation@1',
      defaultProviders: builder === null && runtime === null && testMode === false,
      imagesVerified,
      compilerImageIdentity: builderImageLock.imageId,
      compilerToolchainIdentity: `sha256:${builderImageLock.toolchainManifestSha256}`,
      runtimeImageIdentity: runtimeImageLock.imageId,
      runtimeBinaryIdentity: `sha256:${STM32_EXECUTION_IDENTITIES.runtimeBinaryIdentity.replace(/^sha256:/u, '')}`,
    });
  }
  return { handle, verifyImages, close, attestation, metrics: () => structuredClone({ ...metrics,
    buildInFlight, runtimeInFlight, retainedServerBytes: 0 }) };
}
