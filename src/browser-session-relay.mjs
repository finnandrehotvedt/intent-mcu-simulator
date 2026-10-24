// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const BROWSER_SESSION_SCHEMA = 'intent-mcu-browser-session@1';
export const BROWSER_SESSION_REQUEST_SCHEMA = 'intent-mcu-browser-session-request@1';
export const BROWSER_SESSION_RESULT_SCHEMA = 'intent-mcu-browser-session-result@1';
export const BROWSER_SESSION_LIMITS = Object.freeze({
  bodyBytes: 48 * 1024, responseBytes: 384 * 1024, pairingTtlMs: 120_000,
  ownerLeaseMs: 130_000, clientIdleTtlMs: 120_000, clientAbsoluteTtlMs: 900_000,
  transientResultTtlMs: 5_000, queueDepth: 16, requestCapacity: 64,
  activeSessions: 32,
});
export const READ_ONLY_COMMANDS = Object.freeze([
  'capabilities.list', 'components.catalog', 'project.inspect', 'components.list',
  'component.pins', 'nets.list',
]);
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
  }
  function authorizeOwner(sessionId, token) {
    const session = sessions.get(sessionId);
    if (!live(session) || !equal(token, session.ownerHash)) return null;
    return session;
  }
  function authorizeClient(sessionId, token, scope) {
    const session = sessions.get(sessionId);
    if (!clientLive(session) || !equal(token, session.client.hash)
        || !session.client.scopes.includes(scope)) return null;
    session.client.idleExpiresAt = Math.min(session.client.absoluteExpiresAt,
      now() + BROWSER_SESSION_LIMITS.clientIdleTtlMs);
    return session;
  }

  function registerOwner({ sessionId, projectId, tabId, revision = 0 }) {
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
      requestIds: new Set(), nextSequence: 1,
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
  function createPairing({ sessionId, ownerCapability }) {
    const session = authorizeOwner(sessionId, ownerCapability);
    if (!session) return failure('API_OWNER_GONE');
    if (session.client) return failure('API_CLIENT_EXISTS');
    const pairingSecret = secret();
    pairings.set(digest(pairingSecret).toString('base64url'), {
      sessionId, expiresAt: now() + BROWSER_SESSION_LIMITS.pairingTtlMs,
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
    if (!live(session) || session.client) return failure('API_OWNER_GONE');
    if (!Array.isArray(scopes) || !scopes.length
        || scopes.some((scope) => !['discover', 'read_project'].includes(scope))) {
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
  function submit({ sessionId, clientCapability, request }) {
    const session = authorizeClient(sessionId, clientCapability,
      request?.command === 'capabilities.list' || request?.command === 'components.catalog' ? 'discover' : 'read_project');
    if (!session) return failure('API_AUTH_REQUIRED');
    if (!request || request.schema !== BROWSER_SESSION_REQUEST_SCHEMA || request.session_id !== session.id
        || request.project_id !== session.projectId || !ID.test(request.request_id)
        || !Number.isInteger(request.expected_revision) || !Number.isInteger(request.sequence)
        || !READ_ONLY_COMMANDS.includes(request.command) || typeof request.arguments !== 'object'
        || Array.isArray(request.arguments)) return failure('API_ARGUMENTS_INVALID');
    if (!live(session) || !clientLive(session)) return failure('API_EXPIRED');
    const canonical = JSON.stringify(request);
    if (session.outcomes.has(request.request_id)) {
      const prior = session.outcomes.get(request.request_id);
      if (prior.canonical !== canonical) return failure('API_REQUEST_ID_CONFLICT');
      return prior.result ? clone(prior.result) : failure('API_REQUEST_RETIRED');
    }
    if (session.requestIds.has(request.request_id)) return failure('API_REQUEST_REPLAY');
    if (session.requestIds.size >= BROWSER_SESSION_LIMITS.requestCapacity) return failure('API_SESSION_RENEW_REQUIRED');
    if (request.sequence !== session.nextSequence) return failure('API_SEQUENCE_REQUIRED');
    if (session.commands.length >= BROWSER_SESSION_LIMITS.queueDepth) return failure('API_QUEUE_FULL');
    session.requestIds.add(request.request_id); session.nextSequence += 1;
    session.commands.push({ request: clone(request), canonical, queuedAt: now() });
    return { ok: true, code: 'API_REQUEST_QUEUED', request_id: request.request_id };
  }
  function pull({ sessionId, ownerCapability }) {
    const session = authorizeOwner(sessionId, ownerCapability);
    if (!session) return failure('API_OWNER_GONE');
    const item = session.commands.shift();
    if (item) session.pending.set(item.request.request_id, item.canonical);
    return item ? { ok: true, code: 'API_COMMAND_AVAILABLE', request: item.request }
      : { ok: true, code: 'API_QUEUE_EMPTY' };
  }
  function complete({ sessionId, ownerCapability, result }) {
    const session = authorizeOwner(sessionId, ownerCapability);
    if (!session || !clientLive(session)) return failure('API_OWNER_GONE');
    if (!result || result.schema !== BROWSER_SESSION_RESULT_SCHEMA || !ID.test(result.request_id)) {
      return failure('API_ARGUMENTS_INVALID');
    }
    const requestCanonical = session.pending.get(result.request_id);
    if (!requestCanonical || session.outcomes.has(result.request_id)) return failure('API_REQUEST_REPLAY');
    session.pending.delete(result.request_id);
    const publicResult = clone(result);
    const responseBytes = Buffer.byteLength(JSON.stringify(publicResult));
    if (responseBytes > BROWSER_SESSION_LIMITS.responseBytes) return failure('API_RESPONSE_LIMIT');
    session.outcomes.set(result.request_id, { canonical: requestCanonical, result: publicResult,
      expiresAt: now() + BROWSER_SESSION_LIMITS.transientResultTtlMs });
    session.results.set(result.request_id, { value: publicResult,
      expiresAt: now() + BROWSER_SESSION_LIMITS.transientResultTtlMs });
    return { ok: true, code: 'API_RESULT_ACCEPTED' };
  }
  function readResult({ sessionId, clientCapability, requestId }) {
    const session = authorizeClient(sessionId, clientCapability, 'read_project')
      ?? authorizeClient(sessionId, clientCapability, 'discover');
    if (!session) return failure('API_AUTH_REQUIRED');
    const item = session.results.get(requestId);
    if (!item) return { ok: true, code: 'API_RESULT_PENDING' };
    session.results.delete(requestId);
    if (item.expiresAt <= now()) return failure('API_RESULT_EXPIRED');
    return clone(item.value);
  }
  function revoke({ sessionId, ownerCapability }) {
    const session = authorizeOwner(sessionId, ownerCapability);
    if (!session) return failure('API_OWNER_GONE');
    retire(session);
    return { ok: true, code: 'API_SESSION_REVOKED' };
  }
  function sweep() {
    for (const [key, pairing] of pairings) if (pairing.expiresAt <= now()) pairings.delete(key);
    for (const session of sessions.values()) {
      if (!live(session)) retire(session);
      else {
        for (const [id, value] of session.results) if (value.expiresAt <= now()) session.results.delete(id);
        for (const value of session.outcomes.values()) {
          if (value.result && value.expiresAt <= now()) value.result = null;
        }
      }
    }
  }
  return Object.freeze({ registerOwner, heartbeat, createPairing, claimPairing, submit, pull,
    complete, readResult, revoke, sweep,
    inspect: () => ({ sessions: [...sessions.values()].filter(live).length, pairings: pairings.size }) });
}
