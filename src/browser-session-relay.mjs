// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const BROWSER_SESSION_SCHEMA = 'intent-mcu-browser-session@1';
export const BROWSER_SESSION_REQUEST_SCHEMA = 'intent-mcu-browser-session-request@1';
export const BROWSER_SESSION_RESULT_SCHEMA = 'intent-mcu-browser-session-result@1';
export const BROWSER_SESSION_LIMITS = Object.freeze({
  bodyBytes: 48 * 1024, responseBytes: 40 * 1024, pairingTtlMs: 120_000,
  ownerLeaseMs: 130_000, clientIdleTtlMs: 120_000, clientAbsoluteTtlMs: 900_000,
  requestTtlMs: 30_000, transientResultTtlMs: 5_000, queueDepth: 16, requestCapacity: 64,
  rateWindowMs: 10_000, rateWindowCount: 20, burstWindowMs: 1_000, burstCount: 5,
  activeSessions: 32,
});
export const READ_ONLY_COMMANDS = Object.freeze([
  'capabilities.list', 'components.catalog', 'project.inspect', 'components.list',
  'component.pins', 'nets.list', 'circuit.validate',
]);
export const EDIT_COMMANDS = Object.freeze(['edit.batch', 'edit.undo', 'edit.redo']);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$/u;
const clone = (value) => structuredClone(value);
const digest = (secret) => createHash('sha256').update(secret).digest();
const secret = () => randomBytes(32).toString('base64url');
const equal = (candidate, expected) => {
  if (typeof candidate !== 'string') return false;
  const value = digest(candidate);
  return value.length === expected.length && timingSafeEqual(value, expected);
};
const failure = (code) => ({ ok: false, code });
const RETIRED_REQUEST_BITS = 4096;
const requestDigestIndexes = (id) => {
  const bytes = createHash('sha256').update(id).digest();
  return [bytes.readUInt32BE(0) % RETIRED_REQUEST_BITS, bytes.readUInt32BE(4) % RETIRED_REQUEST_BITS];
};
const retiredHas = (session, id) => requestDigestIndexes(id)
  .every((bit) => (session.retiredRequestBits[bit >>> 5] & (1 << (bit & 31))) !== 0);
const retiredAdd = (session, id) => requestDigestIndexes(id)
  .forEach((bit) => { session.retiredRequestBits[bit >>> 5] |= 1 << (bit & 31); });

export function createBrowserSessionRelay({ now = () => Date.now() } = {}) {
  const sessions = new Map();
  const pairings = new Map();

  function live(session) {
    const time = now();
    if (!session || session.revoked || session.ownerLeaseExpiresAt <= time) return false;
    return true;
  }
  function clientLive(session) {
    const time = now();
    return live(session) && session.client && !session.client.revoked
      && session.client.absoluteExpiresAt > time && session.client.idleExpiresAt > time;
  }
  function retire(session) {
    if (!session) return;
    session.revoked = true;
    session.commands.length = 0;
    session.pending.clear();
    session.results.clear();
    session.outcomes.clear();
    session.requestIds.clear();
    session.client = null;
    for (const [key, pairing] of pairings) if (pairing.sessionId === session.id) pairings.delete(key);
    sessions.delete(session.id);
  }
  function prune() {
    const time = now();
    for (const [key, pairing] of pairings) if (pairing.expiresAt <= time) pairings.delete(key);
    for (const session of [...sessions.values()]) {
      if (!live(session) || (session.client && !clientLive(session))) retire(session);
    }
  }
  function authorizeOwner(sessionId, token) {
    const session = sessions.get(sessionId);
    if (!live(session) || !equal(token, session.ownerHash)) { if (session && !live(session)) retire(session); return null; }
    return session;
  }
  function authorizeClient(sessionId, token, scope) {
    const session = sessions.get(sessionId);
    if (!clientLive(session)) { if (session?.client) retire(session); return null; }
    if (!equal(token, session.client.hash) || !session.client.scopes.includes(scope)) return null;
    session.client.idleExpiresAt = Math.min(session.client.absoluteExpiresAt,
      now() + BROWSER_SESSION_LIMITS.clientIdleTtlMs);
    return session;
  }

  function registerOwner({ sessionId, projectId, tabId, revision = 0 }) {
    prune();
    if (![sessionId, projectId, tabId].every((value) => ID.test(value))) return failure('API_ARGUMENTS_INVALID');
    if (!Number.isInteger(revision) || revision < 0) return failure('API_ARGUMENTS_INVALID');
    if (sessions.size >= BROWSER_SESSION_LIMITS.activeSessions) return failure('API_SESSION_LIMIT');
    if (sessions.has(sessionId)) return failure('API_SESSION_EXISTS');
    const ownerCapability = secret();
    sessions.set(sessionId, {
      id: sessionId, projectId, tabId, ownerHash: digest(ownerCapability),
      revision,
      ownerLeaseExpiresAt: now() + BROWSER_SESSION_LIMITS.ownerLeaseMs,
      client: null, revoked: false, commands: [], pending: new Map(), results: new Map(), outcomes: new Map(),
      requestIds: new Set(), nextSequence: 1, pairingKey: null, requestTimes: [],
      retiredRequestBits: new Uint32Array(RETIRED_REQUEST_BITS / 32),
    });
    return { ok: true, code: 'API_OWNER_REGISTERED', schema: BROWSER_SESSION_SCHEMA,
      ownerCapability, ownerLeaseExpiresAt: sessions.get(sessionId).ownerLeaseExpiresAt };
  }
  function heartbeat({ sessionId, ownerCapability, revision }) {
    const session = authorizeOwner(sessionId, ownerCapability);
    if (!session) return failure('API_OWNER_GONE');
    if (!Number.isInteger(revision) || revision < 0) return failure('API_ARGUMENTS_INVALID');
    session.revision = revision;
    session.ownerLeaseExpiresAt = now() + BROWSER_SESSION_LIMITS.ownerLeaseMs;
    return { ok: true, code: 'API_OWNER_LEASE_RENEWED', ownerLeaseExpiresAt: session.ownerLeaseExpiresAt,
      clientPaired: Boolean(session.client), clientExpiresAt: session.client?.absoluteExpiresAt ?? null };
  }
  function createPairing({ sessionId, ownerCapability, scopes = ['discover', 'read_project'] }) {
    prune();
    const session = authorizeOwner(sessionId, ownerCapability);
    if (!session) return failure('API_OWNER_GONE');
    if (session.client) return failure('API_CLIENT_EXISTS');
    if (!Array.isArray(scopes) || !scopes.length
        || scopes.some((scope) => !['discover', 'read_project', 'edit_circuit'].includes(scope))) {
      return failure('API_SCOPE_REQUIRED');
    }
    if (session.pairingKey && pairings.has(session.pairingKey)) return failure('API_PAIRING_EXISTS');
    const pairingSecret = secret();
    session.pairingKey = digest(pairingSecret).toString('base64url');
    pairings.set(session.pairingKey, {
      sessionId, scopes: [...new Set(scopes)], expiresAt: now() + BROWSER_SESSION_LIMITS.pairingTtlMs,
    });
    return { ok: true, code: 'API_PAIRING_CREATED', pairingSecret,
      expiresAt: now() + BROWSER_SESSION_LIMITS.pairingTtlMs };
  }
  function claimPairing({ pairingSecret, scopes }) {
    const pairingKey = typeof pairingSecret === 'string'
      ? digest(pairingSecret).toString('base64url') : '';
    const pairing = pairings.get(pairingKey);
    pairings.delete(pairingKey); // atomic one-shot, including failed/expired claims
    if (!pairing || pairing.expiresAt <= now()) return failure('API_PAIRING_EXPIRED');
    const session = sessions.get(pairing.sessionId);
    if (session) session.pairingKey = null;
    if (!live(session) || session.client) return failure('API_OWNER_GONE');
    if (!Array.isArray(scopes) || !scopes.length
        || scopes.some((scope) => !pairing.scopes.includes(scope))) {
      return failure('API_SCOPE_REQUIRED');
    }
    const clientCapability = secret();
    session.client = { hash: digest(clientCapability), scopes: [...new Set(scopes)], revoked: false,
      absoluteExpiresAt: now() + BROWSER_SESSION_LIMITS.clientAbsoluteTtlMs,
      idleExpiresAt: now() + BROWSER_SESSION_LIMITS.clientIdleTtlMs };
    return { ok: true, code: 'API_CLIENT_PAIRED', sessionId: session.id,
      projectId: session.projectId, clientCapability, scopes: clone(session.client.scopes),
      revision: session.revision, expiresAt: session.client.absoluteExpiresAt };
  }
  function clientHeartbeat({ sessionId, clientCapability }) {
    const session = sessions.get(sessionId);
    if (!clientLive(session) || !equal(clientCapability, session.client.hash)) {
      if (session?.client && !clientLive(session)) retire(session);
      return failure('API_AUTH_REQUIRED');
    }
    const time = now();
    session.client.idleExpiresAt = time + BROWSER_SESSION_LIMITS.clientIdleTtlMs;
    session.client.absoluteExpiresAt = time + BROWSER_SESSION_LIMITS.clientAbsoluteTtlMs;
    return { ok: true, code: 'API_CLIENT_LEASE_RENEWED',
      idleExpiresAt: session.client.idleExpiresAt, expiresAt: session.client.absoluteExpiresAt };
  }
  function submit({ sessionId, clientCapability, request }) {
    const requiredScope = request?.command === 'capabilities.list' || request?.command === 'components.catalog'
      ? 'discover' : EDIT_COMMANDS.includes(request?.command) ? 'edit_circuit' : 'read_project';
    const session = authorizeClient(sessionId, clientCapability, requiredScope);
    if (!session) return failure('API_AUTH_REQUIRED');
    if (!request || request.schema !== BROWSER_SESSION_REQUEST_SCHEMA || request.session_id !== session.id
        || request.project_id !== session.projectId || !ID.test(request.request_id)
        || !Number.isInteger(request.expected_revision) || !Number.isInteger(request.sequence)
        || ![...READ_ONLY_COMMANDS, ...EDIT_COMMANDS].includes(request.command) || typeof request.arguments !== 'object'
        || Array.isArray(request.arguments)) return failure('API_ARGUMENTS_INVALID');
    if (!live(session) || !clientLive(session)) return failure('API_EXPIRED');
    const canonical = JSON.stringify(request);
    if (session.outcomes.has(request.request_id)) {
      const prior = session.outcomes.get(request.request_id);
      if (prior.canonical !== canonical) return failure('API_REQUEST_ID_CONFLICT');
      if (prior.result && prior.expiresAt <= now()) prior.result = null;
      if (prior.result) return clone(prior.result);
      return prior.reconciliation ? { ok: true, code: 'API_REQUEST_RECONCILE',
        reconciliation: clone(prior.reconciliation) }
        : failure(prior.retiredCode ?? 'API_REQUEST_RETIRED');
    }
    if (retiredHas(session, request.request_id)) return failure('API_REQUEST_REPLAY');
    if (session.requestIds.has(request.request_id)) {
      const active = session.commands.find((item) => item.request.request_id === request.request_id)
        ?? (session.pending.has(request.request_id)
          ? { canonical: session.pending.get(request.request_id).canonical } : null);
      if (!active || active.canonical !== canonical) return failure('API_REQUEST_ID_CONFLICT');
      return { ok: true, code: 'API_REQUEST_RECONCILE',
        reconciliation: { request_id: request.request_id, status: 'pending' } };
    }
    const time = now();
    session.requestTimes = session.requestTimes.filter((value) => value > time - BROWSER_SESSION_LIMITS.rateWindowMs);
    if (session.requestTimes.length >= BROWSER_SESSION_LIMITS.rateWindowCount
        || session.requestTimes.filter((value) => value > time - BROWSER_SESSION_LIMITS.burstWindowMs).length
          >= BROWSER_SESSION_LIMITS.burstCount) return failure('API_RATE_LIMIT');
    while (session.requestIds.size >= BROWSER_SESSION_LIMITS.requestCapacity) {
      const oldest = session.requestIds.values().next().value;
      const outcome = session.outcomes.get(oldest);
      const active = session.commands.some((item) => item.request.request_id === oldest)
        || session.pending.has(oldest) || session.results.has(oldest);
      if (!outcome || active) return failure('API_SESSION_BUSY');
      retiredAdd(session, oldest);
      session.requestIds.delete(oldest);
      session.outcomes.delete(oldest);
    }
    if (request.sequence !== session.nextSequence) return failure('API_SEQUENCE_REQUIRED');
    if (session.commands.length >= BROWSER_SESSION_LIMITS.queueDepth) return failure('API_QUEUE_FULL');
    session.requestTimes.push(time);
    session.requestIds.add(request.request_id); session.nextSequence += 1;
    session.commands.push({ request: clone(request), canonical,
      expiresAt: time + BROWSER_SESSION_LIMITS.requestTtlMs });
    return { ok: true, code: 'API_REQUEST_QUEUED', request_id: request.request_id };
  }
  function pull({ sessionId, ownerCapability }) {
    const session = authorizeOwner(sessionId, ownerCapability);
    if (!session) return failure('API_OWNER_GONE');
    if (!session.client) return { ok: true, code: 'API_QUEUE_EMPTY' };
    if (!clientLive(session)) { retire(session); return failure('API_CLIENT_GONE'); }
    let item = session.commands.shift();
    while (item && item.expiresAt <= now()) {
      session.outcomes.set(item.request.request_id, { canonical: item.canonical, result: null,
        retiredCode: 'API_REQUEST_EXPIRED', expiresAt: item.expiresAt });
      item = session.commands.shift();
    }
    if (item) session.pending.set(item.request.request_id,
      { canonical: item.canonical, expiresAt: item.expiresAt });
    return item ? { ok: true, code: 'API_COMMAND_AVAILABLE', request: item.request,
      requestExpiresAt: item.expiresAt }
      : { ok: true, code: 'API_QUEUE_EMPTY' };
  }
  function authorizeExecution({ sessionId, ownerCapability, requestId }) {
    const session = authorizeOwner(sessionId, ownerCapability);
    if (!session || !clientLive(session)) return failure('API_OWNER_GONE');
    const pending = session.pending.get(requestId);
    if (!pending) return failure('API_REQUEST_REPLAY');
    if (pending.expiresAt <= now()) {
      session.pending.delete(requestId);
      session.outcomes.set(requestId, { canonical: pending.canonical, result: null,
        retiredCode: 'API_REQUEST_EXPIRED', expiresAt: pending.expiresAt });
      return failure('API_REQUEST_EXPIRED');
    }
    return { ok: true, code: 'API_EXECUTION_AUTHORIZED', requestExpiresAt: pending.expiresAt };
  }
  function complete({ sessionId, ownerCapability, result }) {
    const session = authorizeOwner(sessionId, ownerCapability);
    if (!session || !clientLive(session)) return failure('API_OWNER_GONE');
    if (!result || result.schema !== BROWSER_SESSION_RESULT_SCHEMA || !ID.test(result.request_id)) {
      return failure('API_ARGUMENTS_INVALID');
    }
    const pending = session.pending.get(result.request_id);
    if (!pending || session.outcomes.has(result.request_id)) return failure('API_REQUEST_REPLAY');
    session.pending.delete(result.request_id);
    if (pending.expiresAt <= now()) {
      session.outcomes.set(result.request_id, { canonical: pending.canonical, result: null,
        retiredCode: 'API_REQUEST_EXPIRED', expiresAt: pending.expiresAt });
      return failure('API_REQUEST_EXPIRED');
    }
    const publicResult = clone(result);
    const responseBytes = Buffer.byteLength(JSON.stringify(publicResult));
    if (responseBytes > BROWSER_SESSION_LIMITS.responseBytes) {
      const rejected = { schema: BROWSER_SESSION_RESULT_SCHEMA, request_id: result.request_id,
        status: 'indeterminate', code: 'API_RESPONSE_LIMIT' };
      const reconciliation = { request_id: result.request_id, status: publicResult.status,
        code: publicResult.code, revision_after: publicResult.revision_after,
        ...(typeof publicResult.transaction_id === 'string'
          ? { transaction_id: publicResult.transaction_id } : {}) };
      session.outcomes.set(result.request_id, { canonical: pending.canonical, result: rejected,
        reconciliation,
        retiredCode: 'API_REQUEST_RETIRED', expiresAt: now() + BROWSER_SESSION_LIMITS.transientResultTtlMs });
      session.results.set(result.request_id, { value: rejected,
        expiresAt: now() + BROWSER_SESSION_LIMITS.transientResultTtlMs });
      return failure('API_RESPONSE_LIMIT');
    }
    const reconciliation = { request_id: result.request_id, status: publicResult.status,
      code: publicResult.code, revision_after: publicResult.revision_after,
      ...(typeof publicResult.transaction_id === 'string'
        ? { transaction_id: publicResult.transaction_id } : {}) };
    session.outcomes.set(result.request_id, { canonical: pending.canonical, result: publicResult, reconciliation,
      retiredCode: 'API_REQUEST_RETIRED', expiresAt: now() + BROWSER_SESSION_LIMITS.transientResultTtlMs });
    session.results.set(result.request_id, { value: publicResult,
      expiresAt: now() + BROWSER_SESSION_LIMITS.transientResultTtlMs });
    return { ok: true, code: 'API_RESULT_ACCEPTED' };
  }
  function readResult({ sessionId, clientCapability, requestId }) {
    const session = authorizeClient(sessionId, clientCapability, 'read_project')
      ?? authorizeClient(sessionId, clientCapability, 'discover');
    if (!session) return failure('API_AUTH_REQUIRED');
    const item = session.results.get(requestId);
    if (!item) {
      const outcome = session.outcomes.get(requestId);
      return outcome && !outcome.result ? failure(outcome.retiredCode ?? 'API_REQUEST_RETIRED')
        : { ok: true, code: 'API_RESULT_PENDING' };
    }
    session.results.delete(requestId);
    if (item.expiresAt <= now()) return failure('API_RESULT_EXPIRED');
    const outcome = session.outcomes.get(requestId);
    if (outcome) { outcome.result = null; outcome.retiredCode = 'API_REQUEST_RETIRED'; }
    return clone(item.value);
  }
  function revoke({ sessionId, ownerCapability }) {
    const session = authorizeOwner(sessionId, ownerCapability);
    if (!session) return failure('API_OWNER_GONE');
    retire(session);
    return { ok: true, code: 'API_SESSION_REVOKED' };
  }
  function sweep() {
    prune();
    for (const session of sessions.values()) {
      if (live(session)) {
        for (const [id, value] of session.results) if (value.expiresAt <= now()) session.results.delete(id);
        for (const value of session.outcomes.values()) {
          if (value.result && value.expiresAt <= now()) value.result = null;
        }
      }
    }
  }
  return Object.freeze({ registerOwner, heartbeat, createPairing, claimPairing, clientHeartbeat, submit, pull, authorizeExecution,
    complete, readResult, revoke, sweep,
    inspect: () => ({ sessions: sessions.size, pairings: pairings.size }) });
}
