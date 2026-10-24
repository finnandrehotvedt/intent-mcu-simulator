// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createBrowserSessionHttpHandler } from '../src/browser-session-http.mjs';
import { BROWSER_SESSION_REQUEST_SCHEMA, createBrowserSessionRelay } from '../src/browser-session-relay.mjs';

test('HTTP body limit fails truthfully and relay restart cannot replay queued work', async () => {
  let relay = createBrowserSessionRelay(); let origin;
  const server = createServer(async (request, response) => {
    if (await createBrowserSessionHttpHandler(relay, { publicOrigin: origin })(request, response)) return;
    response.writeHead(404); response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const post = async (value, capability = null) => {
    const response = await fetch(`${origin}/api/session/v1`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(capability
        ? { Authorization: `Bearer ${capability}` } : {}) }, body: JSON.stringify(value) });
    return { status: response.status, value: await response.json() };
  };
  try {
    const tooLarge = await post({ operation: 'pairing.claim', pairingSecret: 'x'.repeat(49 * 1024), scopes: [] });
    assert.equal(tooLarge.status, 413); assert.equal(tooLarge.value.code, 'API_REQUEST_LIMIT');

    const ids = { sessionId: 'session-api04-0001', projectId: 'project-api04-0001', tabId: 'tab-api04-0001' };
    const owner = (await post({ operation: 'owner.register', ...ids, revision: 0 })).value;
    const pairing = (await post({ operation: 'pairing.create', sessionId: ids.sessionId,
      scopes: ['discover', 'read_project'] }, owner.ownerCapability)).value;
    const client = (await post({ operation: 'pairing.claim', pairingSecret: pairing.pairingSecret,
      scopes: ['discover', 'read_project'] })).value;
    const request = { schema: BROWSER_SESSION_REQUEST_SCHEMA, request_id: 'request-api04-0001',
      session_id: ids.sessionId, project_id: ids.projectId, expected_revision: 0, sequence: 1,
      command: 'project.inspect', arguments: {} };
    assert.equal((await post({ operation: 'request.submit', sessionId: ids.sessionId, request },
      client.clientCapability)).value.code, 'API_REQUEST_QUEUED');

    relay = createBrowserSessionRelay();
    assert.equal((await post({ operation: 'request.submit', sessionId: ids.sessionId, request },
      client.clientCapability)).value.code, 'API_AUTH_REQUIRED');
    assert.equal((await post({ operation: 'owner.pull', sessionId: ids.sessionId },
      owner.ownerCapability)).value.code, 'API_OWNER_GONE');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
