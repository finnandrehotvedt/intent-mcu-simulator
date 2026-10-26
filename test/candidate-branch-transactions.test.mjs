// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { CandidateEditorSession } from '../src/candidate-project-session.mjs';
import { createGroundReferenceComponent } from '../expansion-drafts/ground-reference-integration-v1.mjs';
import { createContactPersistenceExample } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { createMaximumSupportedGraphFixture } from './maximum-supported-graph-fixture.mjs';

const clone = (value) => structuredClone(value);

function apply(session, command) {
  const result = session.apply({ ...command, revision: session.revision });
  assert.equal(result.ok, true, `${command.type}: ${result.code} ${JSON.stringify(result.details)}`);
  return result;
}

test('candidate branch reconnect is one exact undo/redo transaction', () => {
  const created = createContactPersistenceExample();
  assert.equal(created.ok, true);
  const session = new CandidateEditorSession(created.project);
  const netId = 'net-ground-branch';
  const branch = { component: 'ground-reference-branch', pin: 'REF' };
  const target = { component: 'ground-reference-target', pin: 'REF' };
  apply(session, { type: 'component.add', component: createGroundReferenceComponent(branch.component), position: { x: 0.88, y: 0.72 } });
  apply(session, { type: 'component.add', component: createGroundReferenceComponent(target.component), position: { x: 0.88, y: 0.86 } });
  const originalEndpointCount = session.accepted.project.candidateCircuit.nets
    .find((net) => net.id === netId).endpoints.length;
  apply(session, { type: 'wire.branch', netId, endpoint: branch, junctionId: 'junction-ground-extra' });
  const before = session.saveText();
  const revisionBefore = session.revision;
  const reconnect = apply(session, { type: 'wire.reconnect', netId, from: branch, to: target });
  assert.equal(reconnect.runtimeDirty, true);
  assert.equal(reconnect.changeRelevance, 'build');
  const after = session.saveText();
  assert.notEqual(after, before);
  assert.equal(session.revision, revisionBefore + 1);

  const connected = JSON.parse(after).candidateCircuit.nets.find((net) => net.id === netId);
  assert.equal(connected.endpoints.length, originalEndpointCount + 1);
  assert(connected.endpoints.some((endpoint) => endpoint.component === target.component && endpoint.pin === target.pin));
  assert(!connected.endpoints.some((endpoint) => endpoint.component === branch.component && endpoint.pin === branch.pin));
  assert(JSON.parse(after).candidateCircuit.junctions.some((junction) => junction.net === netId));

  apply(session, { type: 'undo' });
  assert.equal(session.saveText(), before);
  apply(session, { type: 'redo' });
  assert.equal(session.saveText(), after);

  const deleted = apply(session, { type: 'wire.branch.delete', netId, endpoint: target });
  assert.equal(deleted.runtimeDirty, true);
  const withoutBranch = session.saveText();
  const reduced = JSON.parse(withoutBranch).candidateCircuit.nets.find((net) => net.id === netId);
  assert.equal(reduced.endpoints.length, originalEndpointCount);
  assert(JSON.parse(withoutBranch).candidateCircuit.junctions.some((junction) => junction.net === netId));
  apply(session, { type: 'undo' });
  assert.equal(session.saveText(), after);
  apply(session, { type: 'redo' });
  assert.equal(session.saveText(), withoutBranch);
});

test('candidate reconnect failures are byte-atomic and add no history', () => {
  const session = new CandidateEditorSession(createMaximumSupportedGraphFixture().project);
  const before = session.saveText();
  const revision = session.revision;
  const history = session.undoStack.length;
  const cases = [
    { command: { type: 'wire.reconnect', netId: 'net-missing', from: { component: 'lcd-1', pin: 'RS' }, to: { component: 'lcd-63', pin: 'D7' } }, code: 'EDITOR_NET_MISSING' },
    { command: { type: 'wire.reconnect', netId: 'net-0', from: { component: 'lcd-2', pin: 'RS' }, to: { component: 'lcd-63', pin: 'D7' } }, code: 'EDITOR_ENDPOINT_MISSING' },
    { command: { type: 'wire.reconnect', netId: 'net-0', from: { component: 'lcd-1', pin: 'RS' }, to: { component: 'lcd-1', pin: 'RS' } }, code: 'EDITOR_RECONNECT_SAME_ENDPOINT' },
    { command: { type: 'wire.reconnect', netId: 'net-0', from: { component: 'lcd-1', pin: 'RS' }, to: { component: 'lcd-2', pin: 'RS' } }, code: 'PROJECT_CONTACT_REUSED_ENDPOINT' },
    { command: { type: 'wire.reconnect', netId: 'net-0', from: { component: 'lcd-1', pin: 'RS' }, to: { component: 'lcd-63', pin: 'UNKNOWN' } }, code: 'PROJECT_CONTACT_UNKNOWN_PIN' },
  ];
  for (const item of cases) {
    const result = session.apply({ ...clone(item.command), revision: session.revision });
    assert.equal(result.ok, false);
    assert.equal(result.code, item.code);
    assert.equal(session.saveText(), before);
    assert.equal(session.revision, revision);
    assert.equal(session.undoStack.length, history);
  }
  const stale = session.apply({ ...cases[0].command, revision: revision + 1 });
  assert.equal(stale.code, 'EDITOR_STALE_REVISION');
  assert.equal(session.saveText(), before);
});

test('candidate junction removal preserves every endpoint and rejects unsafe multi-pin removal atomically', () => {
  const created = createContactPersistenceExample();
  assert.equal(created.ok, true);
  const session = new CandidateEditorSession(created.project);
  const net = session.accepted.project.candidateCircuit.nets.find((item) => item.id === 'net-ground-branch');
  const junction = session.accepted.project.candidateCircuit.junctions.find((item) => item.net === net.id);
  assert(net.endpoints.length > 2);
  assert(junction);
  const before = session.saveText();
  const revision = session.revision;
  const history = session.undoStack.length;

  const rejected = session.apply({
    type: 'junction.remove', revision,
    junctionId: junction.id, detachEndpoint: null,
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'EDITOR_JUNCTION_REQUIRED_FOR_MULTI_ENDPOINT_NET');
  assert.equal(session.saveText(), before);
  assert.equal(session.revision, revision);
  assert.equal(session.undoStack.length, history);

  const detachRejected = session.apply({
    type: 'junction.remove', revision,
    junctionId: junction.id, detachEndpoint: clone(net.endpoints.at(-1)),
  });
  assert.equal(detachRejected.ok, false);
  assert.equal(detachRejected.code, 'EDITOR_JUNCTION_BRANCH_REMOVAL_REQUIRES_EXPLICIT_BRANCH');
  assert.equal(session.saveText(), before);
  assert.equal(session.revision, revision);
  assert.equal(session.undoStack.length, history);
});

test('electrically unsafe candidate reconnect rejects before history commit', () => {
  const created = createContactPersistenceExample();
  assert.equal(created.ok, true);
  const session = new CandidateEditorSession(created.project);
  apply(session, {
    type: 'component.add',
    component: createGroundReferenceComponent('ground-reference-unsafe'),
    position: { x: 0.9, y: 0.9 },
  });
  const output = session.accepted.project.candidateCircuit.nets.find((net) => net.id === 'net-5v');
  const from = output.endpoints.find((endpoint) => endpoint.component === 'pot-1');
  assert(from);
  const before = session.saveText();
  const revision = session.revision;
  const history = session.undoStack.length;
  const rejected = session.apply({
    type: 'wire.reconnect', revision, netId: output.id, from,
    to: { component: 'ground-reference-unsafe', pin: 'REF' },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'PROJECT_CONTACT_POWER_SHORT');
  assert.equal(session.saveText(), before);
  assert.equal(session.revision, revision);
  assert.equal(session.undoStack.length, history);
});
