// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { spawn, execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { BUILD_LIMITS, WORKER_JOB_SCHEMA, parseStrictJson, sourceDigest } from './build-protocol.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_LOCK = process.env.COMPILER_IMAGE_LOCK || new URL('./image-lock.json', import.meta.url);

export class BrokerError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'BrokerError';
    this.code = code;
  }
}

export async function loadImageLock(pathname = DEFAULT_LOCK) {
  const lock = JSON.parse(await readFile(pathname, 'utf8'));
  const runtimeImageIds = lock.runtimeImageIds ?? [];
  if (lock.schema !== 'teach-lab-compiler-image-lock@1'
      || !/^sha256:[0-9a-f]{64}$/.test(lock.imageId)
      || !Array.isArray(runtimeImageIds)
      || runtimeImageIds.length > 4
      || runtimeImageIds.some((value) => !/^sha256:[0-9a-f]{64}$/.test(value))
      || new Set([lock.imageId, ...runtimeImageIds]).size !== runtimeImageIds.length + 1
      || !/^[0-9a-f]{64}$/.test(lock.toolchainManifestSha256)
      || typeof lock.image !== 'string') {
    throw new BrokerError('INVALID_IMAGE_LOCK');
  }
  return Object.freeze({ ...lock, runtimeImageIds: Object.freeze(runtimeImageIds) });
}

export function imageIdMatches(imageLock, observed) {
  return imageLock.imageId === observed || (imageLock.runtimeImageIds ?? []).includes(observed);
}

async function ignoreDockerFailure(args) {
  try { await execFileAsync('docker', args, { timeout: 5_000 }); } catch { /* bounded cleanup */ }
}

async function cleanupContainer(name, racedCreation) {
  // A killed Docker CLI can race a create request already accepted by the
  // daemon. Keep removal exact-name and bounded, but cover the daemon's
  // observed delayed-create window before declaring cleanup complete.
  const attempts = racedCreation ? 60 : 1;
  for (let index = 0; index < attempts; index += 1) {
    await ignoreDockerFailure(['rm', '-f', name]);
    if (racedCreation) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  try { await execFileAsync('docker', ['container', 'inspect', name], { timeout: 5_000 }); }
  catch { return; }
  await ignoreDockerFailure(['rm', '-f', name]);
  try { await execFileAsync('docker', ['container', 'inspect', name], { timeout: 5_000 }); }
  catch { return; }
  throw new BrokerError('BUILD_CLEANUP_FAILED');
}

export class DockerBuildBroker {
  constructor({ imageLock, deadlineMs = 12_000, docker = 'docker' }) {
    this.imageLock = imageLock;
    this.deadlineMs = deadlineMs;
    this.docker = docker;
    this.verifiedImage = false;
    this.activeContainers = new Set();
  }

  async verifyImage() {
    const { stdout } = await execFileAsync(this.docker, ['image', 'inspect', '--format', '{{.Id}}', this.imageLock.image], { timeout: 5_000 });
    if (!imageIdMatches(this.imageLock, stdout.trim())) throw new BrokerError('TOOLCHAIN_IMAGE_MISMATCH');
    this.verifiedImage = true;
  }

  runtimeArguments(containerName) {
    return [
      'run', '--rm', '--name', containerName,
      '--label', 'com.intentforce.teach-lab.role=disposable-build-job',
      '--network', 'none', '--read-only', '--user', '10001:10001',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
      '--pids-limit', '64', '--memory', '256m', '--memory-swap', '256m', '--cpus', '1.0',
      '--ipc', 'none', '--ulimit', 'nofile=128:128', '--ulimit', 'core=0:0',
      '--tmpfs', '/workspace:rw,noexec,nosuid,nodev,size=32m,uid=10001,gid=10001,mode=0700',
      '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=16m,uid=10001,gid=10001,mode=0700',
      '--env', 'HOME=/tmp/home', '--env', 'NO_UPDATE_NOTIFIER=1',
      '-i', this.imageLock.image,
    ];
  }

  async compile(request, { signal } = {}) {
    if (!this.verifiedImage) await this.verifyImage();
    const containerName = `teach-lab-build-${randomBytes(10).toString('hex')}`;
    const wireRequest = {
      schema: request.schema,
      board: request.board,
      files: request.files.map(({ name, content }) => ({ name, content })),
    };
    const input = JSON.stringify({
      schema: WORKER_JOB_SCHEMA,
      request: wireRequest,
      sourceDigest: sourceDigest(request),
    });
    const child = spawn(this.docker, this.runtimeArguments(containerName), {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.activeContainers.add(containerName);
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let finishReason = null;
    let settled = false;

    const terminate = async (reason) => {
      if (finishReason === null) finishReason = reason;
      await ignoreDockerFailure(['kill', containerName]);
      if (!child.killed) child.kill('SIGKILL');
    };
    const timer = setTimeout(() => { void terminate('timeout'); }, this.deadlineMs);
    const abort = () => { void terminate('cancelled'); };
    signal?.addEventListener('abort', abort, { once: true });

    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > BUILD_LIMITS.outputBytes) void terminate('output-limit');
      else stdout.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > BUILD_LIMITS.diagnosticsBytes) void terminate('diagnostic-limit');
      else stderr.push(chunk);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);

    try {
      const exit = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, closeSignal) => resolve({ code, signal: closeSignal }));
      });
      settled = true;
      if (finishReason === 'timeout') throw new BrokerError('BUILD_TIMEOUT');
      if (finishReason === 'cancelled' || signal?.aborted) throw new BrokerError('BUILD_CANCELLED');
      if (finishReason === 'output-limit') throw new BrokerError('OUTPUT_LIMIT');
      if (finishReason === 'diagnostic-limit') throw new BrokerError('DIAGNOSTIC_LIMIT');
      const output = Buffer.concat(stdout).toString('utf8').trim();
      if (!output) {
        const bounded = Buffer.concat(stderr).toString('utf8').slice(0, 400);
        throw new BrokerError('BUILD_WORKER_FAILURE', bounded || `compiler exited ${exit.code}`);
      }
      let result;
      try { result = parseStrictJson(output); } catch { throw new BrokerError('INVALID_WORKER_RESPONSE'); }
      if (!result || !['succeeded', 'failed'].includes(result.status)) throw new BrokerError('INVALID_WORKER_RESPONSE');
      return { ...result, containerName, imageId: this.imageLock.imageId };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (!settled && !child.killed) child.kill('SIGKILL');
      await cleanupContainer(containerName, finishReason !== null);
      this.activeContainers.delete(containerName);
    }
  }
}
