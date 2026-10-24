// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BROWSER_SESSION_REQUEST_SCHEMA, BROWSER_SESSION_RESULT_SCHEMA,
  createBrowserSessionRelay,
} from '../src/browser-session-relay.mjs';

const ids = { sessionId: 'session-0001', projectId: 'project-0001', tabId: 'tab-owner-0001' };
const request = (sequence = 1, id = `request-${String(sequence).padStart(4, '0')}`, command = 'project.inspect') => ({
  schema: BROWSER_SESSION_REQUEST_SCHEMA, request_id: id, session_id: ids.sessionId,
  project_id: ids.projectId, expected_revision: 0, sequence, command, arguments: {},
});

function paired(clock = { value: 1_000 }) {
  const relay = createBrowserSessionRelay({ now: () => clock.value });
  const owner = relay.registerOwner(ids); assert.equal(owner.ok, true);
  const pairing = relay.createPairing({ sessionId: ids.sessionId, ownerCapability: owner.ownerCapability });
  const client = relay.claimPairing({ pairingSecret: pairing.pairingSecret,
    scopes: ['discover', 'read_project'] });
  return { relay, owner, client, clock };
}

test('pairing is one-shot, separates owner/client capabilities and excludes edit scope', () => {
  const clock = { value: 1_000 }; const relay = createBrowserSessionRelay({ now: () => clock.value });
  const owner = relay.registerOwner(ids);
  const pairing = relay.createPairing({ sessionId: ids.sessionId, ownerCapability: owner.ownerCapability });
  assert.equal(relay.claimPairing({ pairingSecret: pairing.pairingSecret, scopes: ['edit_circuit'] }).code, 'API_SCOPE_REQUIRED');
  assert.equal(relay.claimPairing({ pairingSecret: pairing.pairingSecret, scopes: ['read_project'] }).code, 'API_PAIRING_EXPIRED');
  const fresh = relay.createPairing({ sessionId: ids.sessionId, ownerCapability: owner.ownerCapability });
  const client = relay.claimPairing({ pairingSecret: fresh.pairingSecret, scopes: ['read_project'] });
  assert.equal(client.ok, true); assert.notEqual(client.clientCapability, owner.ownerCapability);
});

test('read-only request is correlated, transient and duplicate-safe', () => {
  const { relay, owner, client, clock } = paired(); const value = request();
  assert.equal(relay.submit({ sessionId: ids.sessionId, clientCapability: client.clientCapability, request: value }).code, 'API_REQUEST_QUEUED');
  assert.deepEqual(relay.pull({ sessionId: ids.sessionId, ownerCapability: owner.ownerCapability }).request, value);
  const result = { schema: BROWSER_SESSION_RESULT_SCHEMA, request_id: value.request_id, status: 'accepted',
    code: 'API_PROJECT_INSPECTED', revision_before: 0, revision_after: 0,
    changes: [], project: { profile: 'board.atmega328p-16mhz-v1' } };
  assert.equal(relay.complete({ sessionId: ids.sessionId, ownerCapability: owner.ownerCapability, result }).ok, true);
  assert.deepEqual(relay.readResult({ sessionId: ids.sessionId, clientCapability: client.clientCapability,
    requestId: value.request_id }), result);
  assert.equal(relay.readResult({ sessionId: ids.sessionId, clientCapability: client.clientCapability,
    requestId: value.request_id }).code, 'API_RESULT_PENDING');
  assert.deepEqual(relay.submit({ sessionId: ids.sessionId, clientCapability: client.clientCapability, request: value }), result);
  assert.equal(relay.submit({ sessionId: ids.sessionId, clientCapability: client.clientCapability,
    request: { ...value, expected_revision: 1 } }).code, 'API_REQUEST_ID_CONFLICT');
  clock.value += 5_001; relay.sweep();
  assert.equal(relay.submit({ sessionId: ids.sessionId, clientCapability: client.clientCapability,
    request: value }).code, 'API_REQUEST_RETIRED');
});

test('wrong project, sequence, expired client, owner loss and revoke fail closed', () => {
  const first = paired();
  assert.equal(first.relay.submit({ sessionId: ids.sessionId, clientCapability: 'wrong', request: request() }).code, 'API_AUTH_REQUIRED');
  assert.equal(first.relay.submit({ sessionId: ids.sessionId, clientCapability: first.client.clientCapability,
    request: { ...request(), project_id: 'project-wrong' } }).code, 'API_ARGUMENTS_INVALID');
  assert.equal(first.relay.submit({ sessionId: ids.sessionId, clientCapability: first.client.clientCapability,
    request: request(2) }).code, 'API_SEQUENCE_REQUIRED');
  first.clock.value += 120_001;
  assert.equal(first.relay.submit({ sessionId: ids.sessionId, clientCapability: first.client.clientCapability,
    request: request() }).code, 'API_AUTH_REQUIRED');

  const second = paired();
  assert.equal(second.relay.revoke({ sessionId: ids.sessionId, ownerCapability: second.owner.ownerCapability }).ok, true);
  assert.equal(second.relay.submit({ sessionId: ids.sessionId, clientCapability: second.client.clientCapability,
    request: request() }).code, 'API_AUTH_REQUIRED');
  assert.equal(second.relay.pull({ sessionId: ids.sessionId, ownerCapability: second.owner.ownerCapability }).code, 'API_OWNER_GONE');
});

test('bounded request tombstones never evict into re-execution', () => {
  const { relay, owner, client } = paired();
  for (let sequence = 1; sequence <= 64; sequence += 1) {
    const value = request(sequence);
    assert.equal(relay.submit({ sessionId: ids.sessionId, clientCapability: client.clientCapability, request: value }).ok, true);
    assert.equal(relay.pull({ sessionId: ids.sessionId, ownerCapability: owner.ownerCapability }).ok, true);
    assert.equal(relay.complete({ sessionId: ids.sessionId, ownerCapability: owner.ownerCapability,
      result: { schema: BROWSER_SESSION_RESULT_SCHEMA, request_id: value.request_id, status: 'accepted',
        code: 'API_READ', revision_before: 0, revision_after: 0, changes: [] } }).ok, true);
  }
  assert.equal(relay.submit({ sessionId: ids.sessionId, clientCapability: client.clientCapability,
    request: request(65) }).code, 'API_SESSION_RENEW_REQUIRED');
  assert.equal(relay.submit({ sessionId: ids.sessionId, clientCapability: client.clientCapability,
    request: request(1) }).code, 'API_READ');
});
