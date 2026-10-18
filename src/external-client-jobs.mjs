// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const EXTERNAL_CLIENT_JOB_RESULT_SCHEMA = 'intent-mcu-external-client-job-result@1';
export const EXTERNAL_CLIENT_EVIDENCE_SCHEMA = 'intent-mcu-external-client-evidence@1';

const clone = (value) => structuredClone(value);

export function createExternalClientJobLedger({ now = () => Date.now(), schedule = setTimeout,
  unschedule = clearTimeout, tombstoneLimit = 64 } = {}) {
  const jobs = new Map();
  const expired = new Set();

  function rememberExpired(requestId) {
    expired.add(requestId);
    if (expired.size > tombstoneLimit) expired.delete(expired.values().next().value);
  }

  function removeExpired(requestId) {
    const job = jobs.get(requestId);
    if (!job) return false;
    unschedule(job.timer);
    jobs.delete(requestId);
    rememberExpired(requestId);
    return true;
  }

  function prune(at = now()) {
    for (const [requestId, job] of jobs) if (job.expiresAtMs <= at) removeExpired(requestId);
  }

  function begin(request, sourceIdentity) {
    prune();
    if (jobs.has(request.requestId) || expired.has(request.requestId)) return null;
    const job = {
      requestId: request.requestId, action: request.action, profile: request.profile,
      expectedGeneration: request.expectedGeneration, issuedAtMs: request.issuedAtMs,
      expiresAtMs: request.expiresAtMs, sourceIdentity: clone(sourceIdentity),
      state: 'active', result: null, timer: null,
    };
    job.timer = schedule(() => removeExpired(job.requestId), Math.max(1, job.expiresAtMs - now()));
    jobs.set(job.requestId, job);
    return snapshot(job);
  }

  function complete(requestId, result) {
    prune();
    const job = jobs.get(requestId);
    if (!job) return false;
    job.state = result.category === 'cancelled' ? 'cancelled'
      : result.category === 'timeout' ? 'timeout' : 'complete';
    job.result = clone(result);
    return true;
  }

  function cancellationRequested(requestId) {
    prune();
    const job = jobs.get(requestId);
    if (!job || job.state !== 'active') return false;
    job.state = 'cancellation-requested';
    return true;
  }

  function snapshot(job) {
    return {
      requestId: job.requestId, action: job.action, profile: job.profile,
      expectedGeneration: job.expectedGeneration, issuedAtMs: job.issuedAtMs,
      expiresAtMs: job.expiresAtMs, state: job.state,
      evidenceAvailable: Boolean(job.result), durableServerProject: false,
      artifactCacheRetainedSeparately: true,
    };
  }

  function inspect(requestId, operation) {
    prune();
    const job = jobs.get(requestId);
    if (!job) return {
      schema: EXTERNAL_CLIENT_JOB_RESULT_SCHEMA, ok: false,
      code: expired.has(requestId) ? 'JOB_EXPIRED' : 'JOB_NOT_FOUND',
      targetRequestId: requestId, operation,
    };
    if (operation === 'read') return {
      schema: EXTERNAL_CLIENT_JOB_RESULT_SCHEMA, ok: true, code: 'JOB_READ',
      targetRequestId: requestId, operation, job: snapshot(job),
    };
    if (!job.result) return {
      schema: EXTERNAL_CLIENT_JOB_RESULT_SCHEMA, ok: false, code: 'JOB_EVIDENCE_NOT_READY',
      targetRequestId: requestId, operation, job: snapshot(job),
    };
    return {
      schema: EXTERNAL_CLIENT_JOB_RESULT_SCHEMA, ok: true, code: 'JOB_EVIDENCE_EXPORTED',
      targetRequestId: requestId, operation,
      evidence: {
        schema: EXTERNAL_CLIENT_EVIDENCE_SCHEMA,
        exportedAtMs: now(), expiresAtMs: job.expiresAtMs,
        request: {
          requestId: job.requestId, action: job.action, profile: job.profile,
          expectedGeneration: job.expectedGeneration,
        },
        sourceIdentity: clone(job.sourceIdentity),
        result: clone(job.result),
        dataOnly: true, restoresRuntimeAuthority: false, restoresVerdictAuthority: false,
        durableServerProject: false, artifactCacheRetainedSeparately: true,
      },
    };
  }

  function dispose() {
    for (const job of jobs.values()) unschedule(job.timer);
    jobs.clear(); expired.clear();
  }

  return Object.freeze({ begin, complete, cancellationRequested, inspect, prune,
    dispose, activeCount: () => jobs.size, hasPayload: (requestId) => jobs.has(requestId) });
}
