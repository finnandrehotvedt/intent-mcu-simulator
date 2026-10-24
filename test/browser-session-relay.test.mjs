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
  assert.equal(relay.createPairing({ sessionId: ids.sessionId,
    ownerCapability: owner.ownerCapability }).code, 'API_PAIRING_EXISTS');
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
    requestId: value.request_id }).code, 'API_REQUEST_RETIRED');
  const reconciled = relay.submit({ sessionId: ids.sessionId,
    clientCapability: client.clientCapability, request: value });
  assert.equal(reconciled.code, 'API_REQUEST_RECONCILE');
  assert.deepEqual(reconciled.reconciliation, { request_id: value.request_id, status: 'accepted',
    code: 'API_PROJECT_INSPECTED', revision_after: 0 });
  assert.equal(relay.submit({ sessionId: ids.sessionId, clientCapability: client.clientCapability,
    request: { ...value, expected_revision: 1 } }).code, 'API_REQUEST_ID_CONFLICT');
  clock.value += 5_001; relay.sweep();
  assert.equal(relay.submit({ sessionId: ids.sessionId, clientCapability: client.clientCapability,
    request: value }).code, 'API_REQUEST_RECONCILE');
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
  const { relay, owner, client, clock } = paired();
  for (let sequence = 1; sequence <= 64; sequence += 1) {
    clock.value += 501;
    const value = request(sequence);
    assert.equal(relay.submit({ sessionId: ids.sessionId, clientCapability: client.clientCapability, request: value }).ok, true);
    assert.equal(relay.pull({ sessionId: ids.sessionId, ownerCapability: owner.ownerCapability }).ok, true);
    assert.equal(relay.complete({ sessionId: ids.sessionId, ownerCapability: owner.ownerCapability,
      result: { schema: BROWSER_SESSION_RESULT_SCHEMA, request_id: value.request_id, status: 'accepted',
        code: 'API_READ', revision_before: 0, revision_after: 0, changes: [] } }).ok, true);
  }
  clock.value += 10_001;
  assert.equal(relay.submit({ sessionId: ids.sessionId, clientCapability: client.clientCapability,
    request: request(65) }).code, 'API_SESSION_RENEW_REQUIRED');
  assert.equal(relay.submit({ sessionId: ids.sessionId, clientCapability: client.clientCapability,
    request: request(1) }).code, 'API_REQUEST_RECONCILE');
});

test('pairing, rate, queue TTL and retired session storage are bounded', () => {
  const clock = { value: 1_000 }; const { relay, owner, client } = paired(clock);
  assert.equal(relay.createPairing({ sessionId: ids.sessionId,
    ownerCapability: owner.ownerCapability }).code, 'API_CLIENT_EXISTS');
  for (let sequence = 1; sequence <= 5; sequence += 1) {
    assert.equal(relay.submit({ sessionId: ids.sessionId, clientCapability: client.clientCapability,
      request: request(sequence) }).ok, true);
  }
  assert.equal(relay.submit({ sessionId: ids.sessionId, clientCapability: client.clientCapability,
    request: request(6) }).code, 'API_RATE_LIMIT');
  clock.value += 30_001;
  assert.equal(relay.pull({ sessionId: ids.sessionId, ownerCapability: owner.ownerCapability }).code,
    'API_QUEUE_EMPTY');
  assert.equal(relay.readResult({ sessionId: ids.sessionId, clientCapability: client.clientCapability,
    requestId: request(1).request_id }).code, 'API_REQUEST_EXPIRED');

  relay.revoke({ sessionId: ids.sessionId, ownerCapability: owner.ownerCapability });
  for (let index = 0; index < 40; index += 1) {
    const sessionId = `session-prune-${String(index).padStart(3, '0')}`;
    const value = relay.registerOwner({ sessionId, projectId: 'project-prune', tabId: 'tab-prune', revision: 0 });
    assert.equal(value.ok, true);
    assert.equal(relay.revoke({ sessionId, ownerCapability: value.ownerCapability }).ok, true);
  }
  assert.deepEqual(relay.inspect(), { sessions: 0, pairings: 0 });
});

test('expired client clears queued commands before owner pull', () => {
  const state = paired();
  assert.equal(state.relay.submit({ sessionId: ids.sessionId,
    clientCapability: state.client.clientCapability, request: request() }).ok, true);
  state.clock.value += 120_001;
  assert.equal(state.relay.pull({ sessionId: ids.sessionId,
    ownerCapability: state.owner.ownerCapability }).code, 'API_CLIENT_GONE');
  assert.deepEqual(state.relay.inspect(), { sessions: 0, pairings: 0 });
});

test('edit scope requires explicit owner grant and remains request scoped', () => {
  const relay = createBrowserSessionRelay(); const owner = relay.registerOwner(ids);
  const readPairing = relay.createPairing({ sessionId: ids.sessionId,
    ownerCapability: owner.ownerCapability });
  assert.equal(relay.claimPairing({ pairingSecret: readPairing.pairingSecret,
    scopes: ['discover', 'read_project', 'edit_circuit'] }).code, 'API_SCOPE_REQUIRED');
  const editPairing = relay.createPairing({ sessionId: ids.sessionId,
    ownerCapability: owner.ownerCapability, scopes: ['discover', 'read_project', 'edit_circuit'] });
  const client = relay.claimPairing({ pairingSecret: editPairing.pairingSecret,
    scopes: ['discover', 'read_project', 'edit_circuit'] });
  const edit = request(1, 'request-edit-0001', 'edit.batch');
  edit.arguments = { transaction_id: 'transaction-edit-0001', commands: [] };
  assert.equal(relay.submit({ sessionId: ids.sessionId, clientCapability: client.clientCapability,
    request: edit }).code, 'API_REQUEST_QUEUED');
});

test('pulled command requires a live final execution authorization', () => {
  const state = paired(); const value = request();
  assert.equal(state.relay.submit({ sessionId: ids.sessionId,
    clientCapability: state.client.clientCapability, request: value }).ok, true);
  const pulled = state.relay.pull({ sessionId: ids.sessionId,
    ownerCapability: state.owner.ownerCapability });
  assert.equal(pulled.code, 'API_COMMAND_AVAILABLE');
  assert.equal(state.relay.authorizeExecution({ sessionId: ids.sessionId,
    ownerCapability: state.owner.ownerCapability, requestId: value.request_id }).code,
  'API_EXECUTION_AUTHORIZED');
  state.clock.value += 30_001;
  assert.equal(state.relay.authorizeExecution({ sessionId: ids.sessionId,
    ownerCapability: state.owner.ownerCapability, requestId: value.request_id }).code,
  'API_REQUEST_EXPIRED');
  assert.equal(state.relay.complete({ sessionId: ids.sessionId,
    ownerCapability: state.owner.ownerCapability, result: { schema: BROWSER_SESSION_RESULT_SCHEMA,
      request_id: value.request_id, status: 'accepted', code: 'MUST_NOT_COMMIT' } }).code,
  'API_REQUEST_REPLAY');
});

test('lost result retry reconciles terminal mutation and response limit is reachable', () => {
  const state = paired(); const value = request();
  assert.equal(state.relay.submit({ sessionId: ids.sessionId,
    clientCapability: state.client.clientCapability, request: value }).ok, true);
  state.relay.pull({ sessionId: ids.sessionId, ownerCapability: state.owner.ownerCapability });
  const result = { schema: BROWSER_SESSION_RESULT_SCHEMA, request_id: value.request_id,
    status: 'accepted', code: 'API_BATCH_COMMITTED', revision_before: 0, revision_after: 1,
    transaction_id: 'api-tx:session-0001:request-0001', changes: [{ component_id: 'led-1' }] };
  assert.equal(state.relay.complete({ sessionId: ids.sessionId,
    ownerCapability: state.owner.ownerCapability, result }).ok, true);
  assert.deepEqual(state.relay.submit({ sessionId: ids.sessionId,
    clientCapability: state.client.clientCapability, request: value }), result);
  state.relay.readResult({ sessionId: ids.sessionId,
    clientCapability: state.client.clientCapability, requestId: value.request_id });
  const reconcile = state.relay.submit({ sessionId: ids.sessionId,
    clientCapability: state.client.clientCapability, request: value });
  assert.deepEqual(reconcile.reconciliation, { request_id: value.request_id, status: 'accepted',
    code: 'API_BATCH_COMMITTED', revision_after: 1,
    transaction_id: 'api-tx:session-0001:request-0001' });

  const next = request(2); state.clock.value += 1_001;
  assert.equal(state.relay.submit({ sessionId: ids.sessionId,
    clientCapability: state.client.clientCapability, request: next }).ok, true);
  state.relay.pull({ sessionId: ids.sessionId, ownerCapability: state.owner.ownerCapability });
  assert.equal(state.relay.complete({ sessionId: ids.sessionId,
    ownerCapability: state.owner.ownerCapability, result: { schema: BROWSER_SESSION_RESULT_SCHEMA,
      request_id: next.request_id, status: 'accepted', code: 'API_PROJECT_INSPECTED',
      project: { source: 'x'.repeat(41 * 1024) } } }).code, 'API_RESPONSE_LIMIT');
  const bounded = state.relay.readResult({ sessionId: ids.sessionId,
    clientCapability: state.client.clientCapability, requestId: next.request_id });
  assert.equal(bounded.code, 'API_RESPONSE_LIMIT'); assert.equal(bounded.status, 'indeterminate');
  assert.deepEqual(state.relay.submit({ sessionId: ids.sessionId,
    clientCapability: state.client.clientCapability, request: next }).reconciliation,
  { request_id: next.request_id, status: 'accepted', code: 'API_PROJECT_INSPECTED',
    revision_after: undefined });
});
