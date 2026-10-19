// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { randomBytes } from 'node:crypto';
import { parseIntelHex } from '../src/hex.mjs';
import {
  BuildProtocolError,
  RP2040_BOARD_PROFILE,
  buildInputIdentity,
  parseAndNormalizeBuildRequest,
  sha256,
} from './build-protocol.mjs';
import { loadRp2040FirmwareArtifact } from '../expansion-drafts/rp2040-firmware-artifact-v1.mjs';
import { BrokerError } from './docker-broker.mjs';
import {
  candidateArtifactIdentity,
  candidateCompilerTarget,
  validateCandidateCompileArtifact,
} from './candidate-target-contract.mjs';
import { retryAfterForCode } from '../src/retry-guidance.mjs';

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'timeout']);
const SHA256 = /^[0-9a-f]{64}$/u;
const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

async function validatedRp2040Artifact(artifact, request) {
  if (!exactKeys(artifact, ['schema', 'profile', 'sourceSha256', 'compiler', 'contract', 'elf', 'uf2'])
      || artifact.schema !== 'intent-mcu-rp2040-compile-artifact@1'
      || artifact.profile !== RP2040_BOARD_PROFILE || !SHA256.test(artifact.sourceSha256)
      || artifact.sourceSha256 !== sha256(request.files[0].content)
      || !exactKeys(artifact.compiler, ['id', 'version', 'release', 'archiveSha256'])
      || artifact.compiler.id !== 'arm-none-eabi-gcc' || artifact.compiler.version !== '14.3.1'
      || artifact.compiler.release !== '14.3.rel1'
      || artifact.compiler.archiveSha256 !== '8f6903f8ceb084d9227b9ef991490413014d991874a1e34074443c2a72b14dbd'
      || !exactKeys(artifact.elf, ['bytes', 'sha256']) || !SHA256.test(artifact.elf.sha256)
      || !Number.isSafeInteger(artifact.elf.bytes) || artifact.elf.bytes < 1 || artifact.elf.bytes > 4 * 1024 * 1024
      || !exactKeys(artifact.uf2, ['bytes', 'sha256', 'base64']) || !SHA256.test(artifact.uf2.sha256)
      || !Number.isSafeInteger(artifact.uf2.bytes) || artifact.uf2.bytes < 512 || artifact.uf2.bytes > 4 * 1024 * 1024
      || typeof artifact.uf2.base64 !== 'string' || artifact.uf2.base64.length > 6 * 1024 * 1024
      || artifact.uf2.base64.length % 4 !== 0 || !CANONICAL_BASE64.test(artifact.uf2.base64)
      || !artifact.contract || typeof artifact.contract !== 'object' || Array.isArray(artifact.contract)) {
    throw new BrokerError('RP2040_ARTIFACT_INVALID');
  }
  const bytes = Buffer.from(artifact.uf2.base64, 'base64');
  if (bytes.toString('base64') !== artifact.uf2.base64
      || bytes.byteLength !== artifact.uf2.bytes || sha256(bytes) !== artifact.uf2.sha256) {
    throw new BrokerError('RP2040_ARTIFACT_HASH_MISMATCH');
  }
  await loadRp2040FirmwareArtifact({ format: 'uf2', bytes: new Uint8Array(bytes), expectedSha256: artifact.uf2.sha256 });
  return artifact;
}

export class BuildCoordinator {
  constructor({ broker, imageLock, identityLockFor = null, globalLimit = 1, perOriginLimit = 1, queueLimit = 3, rateLimit = 12, jobLimit = 16, jobTtlMs = 5 * 60_000, now = () => Date.now() }) {
    this.broker = broker;
    this.imageLock = imageLock;
    this.identityLockFor = identityLockFor ?? (() => this.imageLock);
    this.globalLimit = globalLimit;
    this.perOriginLimit = perOriginLimit;
    this.queueLimit = queueLimit;
    this.rateLimit = rateLimit;
    this.jobLimit = jobLimit;
    this.jobTtlMs = jobTtlMs;
    this.rateWindowMs = 60_000;
    this.now = now;
    this.jobs = new Map();
    this.queue = [];
    this.active = new Map();
    this.rate = new Map();
  }

  enforceRate(origin) {
    const now = this.now();
    const events = (this.rate.get(origin) ?? []).filter((at) => now - at < this.rateWindowMs);
    if (events.length >= this.rateLimit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((events[0] + this.rateWindowMs - now) / 1000));
      throw new BuildProtocolError('ORIGIN_RATE_LIMIT', 'Build rate limit reached', 429, retryAfterSeconds);
    }
    events.push(now);
    this.rate.set(origin, events);
  }

  submit(raw, origin) {
    this.prune();
    this.enforceRate(origin);
    if (this.jobs.size >= this.jobLimit) throw new BuildProtocolError('JOB_CAPACITY', 'Build job capacity reached', 429, retryAfterForCode('JOB_CAPACITY'));
    const request = parseAndNormalizeBuildRequest(raw);
    if (this.queue.length >= this.queueLimit) throw new BuildProtocolError('BUILD_QUEUE_FULL', 'Build queue is full', 429, retryAfterForCode('BUILD_QUEUE_FULL'));
    const jobId = randomBytes(12).toString('hex');
    const capability = randomBytes(32).toString('base64url');
    const identityLock = this.identityLockFor(request.board);
    if (!identityLock) throw new BuildProtocolError('UNKNOWN_COMPILER_TARGET');
    const inputIdentity = buildInputIdentity(request, identityLock);
    const job = {
      jobId, capability, origin, request, inputIdentity,
      status: 'building', phase: 'queued', submittedAt: this.now(), completedAt: null,
      cacheHit: false, result: null, error: null, controller: null,
    };
    this.jobs.set(jobId, job);
    this.queue.push(job);
    this.pump();
    return { jobId, capability, status: job.status, inputIdentity };
  }

  activeForOrigin(origin) {
    return [...this.active.values()].filter((job) => job.origin === origin).length;
  }

  pump() {
    while (this.active.size < this.globalLimit) {
      const index = this.queue.findIndex((job) => this.activeForOrigin(job.origin) < this.perOriginLimit);
      if (index < 0) return;
      const [job] = this.queue.splice(index, 1);
      this.start(job);
    }
  }

  async start(job) {
    const controller = new AbortController();
    job.controller = controller;
    job.phase = 'compiling';
    this.active.set(job.jobId, job);
    try {
      const worker = await this.broker.compile(job.request, { signal: controller.signal });
      if (job.status === 'cancelled') return;
      if (worker.status === 'failed') {
        job.status = 'failed';
        job.phase = 'complete';
        job.result = {
          code: worker.code,
          diagnostics: worker.diagnostics ?? [],
          text: worker.text ?? 'Compilation failed.',
          isolation: worker.isolation ?? null,
        };
      } else {
        const artifact = worker.artifact;
        const target = candidateCompilerTarget(job.request.board);
        if (job.request.board === RP2040_BOARD_PROFILE) {
          const artifact = await validatedRp2040Artifact(worker.artifact, job.request);
          const result = {
            code: worker.code,
            inputIdentity: job.inputIdentity,
            artifactIdentity: sha256(JSON.stringify({
              inputIdentity: job.inputIdentity,
              sourceSha256: artifact.sourceSha256,
              uf2Sha256: artifact.uf2.sha256,
            })),
            artifact,
            compileOnly: false,
            diagnostics: worker.diagnostics ?? [],
            text: worker.text ?? '',
            isolation: worker.isolation,
            toolchainImageId: worker.imageId,
            toolchainIdentitySha256: target.toolchainIdentitySha256,
          };
          job.status = 'succeeded';
          job.phase = 'complete';
          job.result = result;
        } else if (target?.compileOnly) {
          if (!validateCandidateCompileArtifact(artifact, target.profile)) {
            throw new BrokerError('CANDIDATE_ARTIFACT_INVALID');
          }
          const result = {
            code: worker.code,
            inputIdentity: job.inputIdentity,
            artifactIdentity: candidateArtifactIdentity({
              inputIdentity: job.inputIdentity, target, artifact,
            }),
            artifact,
            compileOnly: true,
            runtimeStatus: target.runtimeStatus,
            runtimeRejectCode: artifact.runtimeRejectCode,
            diagnostics: worker.diagnostics ?? [],
            text: worker.text ?? '',
            isolation: worker.isolation,
            toolchainImageId: worker.imageId,
            toolchainIdentitySha256: target.toolchainIdentitySha256,
          };
          job.status = 'succeeded';
          job.phase = 'complete';
          job.result = result;
        } else {
          if (!artifact || sha256(artifact.hex) !== artifact.hexSha256
            || sha256(Buffer.from(artifact.elfBase64, 'base64')) !== artifact.elfSha256) {
            throw new BrokerError('ARTIFACT_HASH_MISMATCH');
          }
          parseIntelHex(artifact.hex);
          const result = {
            code: worker.code,
            inputIdentity: job.inputIdentity,
            artifactIdentity: sha256(JSON.stringify({
              inputIdentity: job.inputIdentity,
              hexSha256: artifact.hexSha256,
              elfSha256: artifact.elfSha256,
            })),
            artifact,
            diagnostics: worker.diagnostics ?? [],
            text: worker.text ?? '',
            isolation: worker.isolation,
            toolchainImageId: worker.imageId,
            toolchainIdentitySha256: target.toolchainIdentitySha256,
          };
          job.status = 'succeeded';
          job.phase = 'complete';
          job.result = result;
        }
      }
    } catch (error) {
      if (job.status === 'cancelled' || error.code === 'BUILD_CANCELLED') {
        job.status = 'cancelled';
        job.error = 'BUILD_CANCELLED';
      } else if (error.code === 'BUILD_TIMEOUT') {
        job.status = 'timeout';
        job.error = 'BUILD_TIMEOUT';
      } else {
        job.status = 'failed';
        job.error = typeof error.code === 'string' && /^[A-Z0-9_]{3,64}$/u.test(error.code)
          ? error.code : 'BUILD_BROKER_FAILURE';
        job.result = { code: job.error, diagnostics: [], text: 'The isolated build could not complete.' };
      }
      job.phase = 'complete';
    } finally {
      job.completedAt = this.now();
      job.request = null;
      job.controller = null;
      this.active.delete(job.jobId);
      this.pump();
    }
  }

  authorize(jobId, capability, origin) {
    const job = this.jobs.get(jobId);
    if (!job || job.capability !== capability || job.origin !== origin) throw new BuildProtocolError('JOB_NOT_FOUND', 'Build job not found', 404);
    return job;
  }

  status(jobId, capability, origin) {
    const job = this.authorize(jobId, capability, origin);
    return {
      jobId: job.jobId,
      status: job.status,
      phase: job.phase,
      inputIdentity: job.inputIdentity,
      cacheHit: job.cacheHit,
      result: TERMINAL.has(job.status) ? job.result : null,
      error: job.error,
    };
  }

  cancel(jobId, capability, origin) {
    const job = this.authorize(jobId, capability, origin);
    if (TERMINAL.has(job.status)) return this.status(jobId, capability, origin);
    const queueIndex = this.queue.indexOf(job);
    if (queueIndex >= 0) this.queue.splice(queueIndex, 1);
    job.status = 'cancelled';
    job.phase = 'complete';
    job.error = 'BUILD_CANCELLED';
    job.completedAt = this.now();
    job.request = null;
    job.controller?.abort();
    return this.status(jobId, capability, origin);
  }

  prune(now = this.now()) {
    for (const [jobId, job] of this.jobs) {
      if (job.completedAt && now - job.completedAt > this.jobTtlMs) this.jobs.delete(jobId);
    }
  }
}
