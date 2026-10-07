// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { randomBytes } from 'node:crypto';
import { parseIntelHex } from '../src/hex.mjs';
import {
  BuildProtocolError,
  buildInputIdentity,
  parseAndNormalizeBuildRequest,
  sha256,
} from './build-protocol.mjs';
import { BrokerError } from './docker-broker.mjs';

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'timeout']);

export class BuildCoordinator {
  constructor({ broker, imageLock, globalLimit = 1, perOriginLimit = 1, queueLimit = 3, rateLimit = 12, jobLimit = 16, cacheLimit = 8, jobTtlMs = 5 * 60_000 }) {
    this.broker = broker;
    this.imageLock = imageLock;
    this.globalLimit = globalLimit;
    this.perOriginLimit = perOriginLimit;
    this.queueLimit = queueLimit;
    this.rateLimit = rateLimit;
    this.jobLimit = jobLimit;
    this.cacheLimit = cacheLimit;
    this.jobTtlMs = jobTtlMs;
    this.jobs = new Map();
    this.queue = [];
    this.active = new Map();
    this.rate = new Map();
    this.cache = new Map();
  }

  enforceRate(origin) {
    const now = Date.now();
    const events = (this.rate.get(origin) ?? []).filter((at) => now - at < 60_000);
    if (events.length >= this.rateLimit) throw new BuildProtocolError('ORIGIN_RATE_LIMIT', 'Build rate limit reached', 429);
    events.push(now);
    this.rate.set(origin, events);
  }

  submit(raw, origin) {
    this.prune();
    this.enforceRate(origin);
    if (this.jobs.size >= this.jobLimit) throw new BuildProtocolError('JOB_CAPACITY', 'Build job capacity reached', 429);
    const request = parseAndNormalizeBuildRequest(raw);
    if (this.queue.length >= this.queueLimit) throw new BuildProtocolError('BUILD_QUEUE_FULL', 'Build queue is full', 429);
    const jobId = randomBytes(12).toString('hex');
    const capability = randomBytes(32).toString('base64url');
    const inputIdentity = buildInputIdentity(request, this.imageLock);
    const job = {
      jobId, capability, origin, request, inputIdentity,
      status: 'building', phase: 'queued', submittedAt: Date.now(), completedAt: null,
      cacheHit: false, result: null, error: null, controller: null,
    };
    this.jobs.set(jobId, job);
    const cached = this.cache.get(inputIdentity);
    if (cached) {
      job.status = 'succeeded';
      job.phase = 'complete';
      job.completedAt = Date.now();
      job.cacheHit = true;
      job.result = structuredClone(cached);
      job.request = null;
    } else {
      this.queue.push(job);
      this.pump();
    }
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
        };
        job.status = 'succeeded';
        job.phase = 'complete';
        job.result = result;
        if (this.cache.size >= this.cacheLimit) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(job.inputIdentity, structuredClone(result));
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
      job.completedAt = Date.now();
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
    job.completedAt = Date.now();
    job.request = null;
    job.controller?.abort();
    return this.status(jobId, capability, origin);
  }

  prune(now = Date.now()) {
    for (const [jobId, job] of this.jobs) {
      if (job.completedAt && now - job.completedAt > this.jobTtlMs) this.jobs.delete(jobId);
    }
  }
}
