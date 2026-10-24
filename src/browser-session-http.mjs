// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { BROWSER_SESSION_LIMITS } from './browser-session-relay.mjs';

const json = (response, status, value) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
  response.end(`${JSON.stringify(value)}\n`);
};
const bearer = (request) => {
  const value = request.headers.authorization;
  return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7) : null;
};
async function body(request) {
  const chunks = []; let bytes = 0; let aggregate = null;
  try {
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > BROWSER_SESSION_LIMITS.bodyBytes) throw Object.assign(new Error('API_REQUEST_LIMIT'), { status: 413 });
      chunks.push(chunk);
    }
    aggregate = Buffer.alloc(bytes); let offset = 0;
    for (const chunk of chunks) { chunk.copy(aggregate, offset); offset += chunk.length; }
    try { return JSON.parse(aggregate.toString('utf8')); }
    catch { throw Object.assign(new Error('API_ARGUMENTS_INVALID'), { status: 400 }); }
  } finally {
    aggregate?.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

export function createBrowserSessionHttpHandler(relay, { publicOrigin }) {
  if (!relay || typeof publicOrigin !== 'string') throw new TypeError('API_HTTP_CONFIGURATION');
  return async function handle(request, response) {
    const url = new URL(request.url, publicOrigin);
    if (url.pathname !== '/api/session/v1') return false;
    if (request.method !== 'POST') { json(response, 405, { ok: false, code: 'API_METHOD' }); return true; }
    const origin = request.headers.origin;
    if (origin && origin !== publicOrigin) { json(response, 403, { ok: false, code: 'API_ORIGIN' }); return true; }
    try {
      const value = await body(request);
      const capability = bearer(request);
      const operation = value?.operation;
      let result;
      if (operation === 'owner.register') result = relay.registerOwner(value);
      else if (operation === 'owner.heartbeat') result = relay.heartbeat({ ...value, ownerCapability: capability });
      else if (operation === 'pairing.create') result = relay.createPairing({ ...value, ownerCapability: capability });
      else if (operation === 'pairing.claim') result = relay.claimPairing(value);
      else if (operation === 'request.submit') result = relay.submit({ ...value, clientCapability: capability });
      else if (operation === 'owner.pull') result = relay.pull({ ...value, ownerCapability: capability });
      else if (operation === 'owner.complete') result = relay.complete({ ...value, ownerCapability: capability });
      else if (operation === 'result.read') result = relay.readResult({ ...value, clientCapability: capability });
      else if (operation === 'owner.revoke') result = relay.revoke({ ...value, ownerCapability: capability });
      else result = { ok: false, code: 'API_OPERATION_UNSUPPORTED' };
      json(response, result.ok ? 200 : 400, result); return true;
    } catch (error) {
      const code = ['API_REQUEST_LIMIT', 'API_ARGUMENTS_INVALID'].includes(error?.message)
        ? error.message : 'API_ARGUMENTS_INVALID';
      json(response, error?.status === 413 ? 413 : 400, { ok: false, code }); return true;
    }
  };
}
