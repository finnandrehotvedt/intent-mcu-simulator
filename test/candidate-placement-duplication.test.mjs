// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { CandidateEditorSession, openPortableEditorSession } from '../src/candidate-project-session.mjs';
import { createContactPersistenceExample } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';

const canonical = (value) => JSON.stringify(value);

function command(session, value) {
  return session.apply({ ...value, revision: session.revision });
}

test('candidate duplicate preserves every existing ID and reference while creating one disconnected copy', () => {
  const session = new CandidateEditorSession(createContactPersistenceExample().project);
  const before = session.project;
  const source = before.circuit.components.find((component) => component.id === 'toggle-switch-1');
  const references = before.circuit.nets.map((net) => ({
    id: net.id,
    endpoints: net.endpoints,
  }));

  const result = command(session, {
    type: 'component.duplicate', sourceId: source.id, newId: 'toggle-switch-2',
  });
  assert.equal(result.ok, true);
  assert.equal(result.runtimeDirty, true);
  assert.equal(result.changeRelevance, 'build');

  const after = session.project;
  const copy = after.circuit.components.find((component) => component.id === 'toggle-switch-2');
  assert.deepEqual(copy, { ...source, id: 'toggle-switch-2', label: `${source.label} copy` });
  assert.deepEqual(after.circuit.nets.map((net) => ({ id: net.id, endpoints: net.endpoints })), references);
  assert.equal(after.circuit.nets.some((net) => net.endpoints.some(
    (endpoint) => endpoint.component === copy.id,
  )), false);
  assert.deepEqual(after.layout.positions[copy.id], {
    x: before.layout.positions[source.id].x + 0.04,
    y: before.layout.positions[source.id].y + 0.04,
    rotation: before.layout.positions[source.id].rotation,
  });

  assert.equal(command(session, { type: 'undo' }).ok, true);
  assert.equal(canonical(session.project), canonical(before));
  assert.equal(command(session, { type: 'redo' }).ok, true);
  assert.equal(canonical(session.project), canonical(after));
});

test('candidate placement, move, rotation and deletion are exact one-step transactions and survive data-only open', () => {
  const session = new CandidateEditorSession(createContactPersistenceExample().project);
  const source = session.project.circuit.components.find((component) => component.id === 'toggle-switch-1');
  const added = { ...structuredClone(source), id: 'toggle-switch-placed', label: 'Placed toggle' };
  const states = [];
  for (const value of [
    { type: 'component.add', component: added, position: { x: 0.91, y: 0.12, rotation: 90 } },
    { type: 'component.move', componentId: added.id, x: 0.83, y: 0.24 },
    { type: 'component.rotate', componentId: added.id, rotation: 180 },
    { type: 'component.remove', componentId: added.id },
  ]) {
    const before = canonical(session.project);
    const result = command(session, value);
    assert.equal(result.ok, true, result.code);
    const after = canonical(session.project);
    assert.notEqual(after, before);
    states.push(after);
  }
  assert.equal(command(session, { type: 'undo' }).ok, true);
  assert.equal(canonical(session.project), states[2]);
  assert.equal(command(session, { type: 'redo' }).ok, true);
  assert.equal(canonical(session.project), states[3]);

  const opened = openPortableEditorSession(session.saveText());
  assert.equal(opened.ok, true);
  assert.equal(opened.kind, 'candidate-project-v3');
  assert.equal(canonical(opened.session.project), canonical(session.project));
  assert.equal(command(opened.session, { type: 'undo' }).ok, false);
  assert.equal(opened.session.revision, 0);
});

test('candidate duplicate rejection is byte-atomic and creates no history', () => {
  const cases = [
    { type: 'component.duplicate', sourceId: 'missing', newId: 'copy-1' },
    { type: 'component.duplicate', sourceId: 'board-1', newId: 'board-2' },
    { type: 'component.duplicate', sourceId: 'toggle-switch-1', newId: 'selector-1' },
    { type: 'component.duplicate', sourceId: 'toggle-switch-1', newId: '' },
  ];
  for (const value of cases) {
    const session = new CandidateEditorSession(createContactPersistenceExample().project);
    const before = session.saveText();
    const result = command(session, value);
    assert.equal(result.ok, false, canonical(value));
    assert.equal(session.saveText(), before);
    assert.equal(session.revision, 0);
    assert.equal(command(session, { type: 'undo' }).code, 'EDITOR_UNDO_EMPTY');
  }

  const stale = new CandidateEditorSession(createContactPersistenceExample().project);
  const before = stale.saveText();
  const result = stale.apply({
    type: 'component.duplicate', revision: 1, sourceId: 'toggle-switch-1', newId: 'toggle-switch-2',
  });
  assert.equal(result.code, 'EDITOR_STALE_REVISION');
  assert.equal(stale.saveText(), before);
});
