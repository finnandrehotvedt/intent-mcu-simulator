// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANNOTATED_WORKSPACE_SCHEMA, CANVAS_ANNOTATIONS_SCHEMA, CanvasAnnotationReducer,
  canonicalAnnotatedWorkspace, emptyCanvasAnnotations, normalizeCanvasAnnotations, parseAnnotatedWorkspace,
} from '../src/canvas-annotations.mjs';

const components = ['board-1', 'led-1', 'resistor-1'];
test('X66 note and group create edit delete have exact local undo and redo', () => {
  const owner = new CanvasAnnotationReducer(emptyCanvasAnnotations(), components);
  owner.apply({ type: 'note.create', id: 'note-threshold', text: 'Equality boundary', x: 0.4, y: 0.2 }, components);
  owner.apply({ type: 'note.edit', id: 'note-threshold', text: 'Equality boundary at 30 C', x: 0.42, y: 0.21 }, components);
  owner.apply({ type: 'group.create', id: 'group-output', label: 'Indicator output', componentIds: ['resistor-1', 'led-1'] }, components);
  const complete = owner.snapshot();
  owner.apply({ type: 'note.remove', id: 'note-threshold' }, components);
  owner.apply({ type: 'group.remove', id: 'group-output' }, components);
  owner.undo(components); owner.undo(components);
  assert.deepEqual(owner.snapshot(), complete);
  owner.redo(components); owner.redo(components);
  assert.deepEqual(owner.snapshot(), emptyCanvasAnnotations());
});

test('X66 component deletion removes dangling membership atomically and restore returns exact document', () => {
  const owner = new CanvasAnnotationReducer({ schema: CANVAS_ANNOTATIONS_SCHEMA, notes: [], groups: [
    { id: 'group-output', label: 'Output', componentIds: ['led-1', 'resistor-1'] },
    { id: 'group-controller', label: 'Controller', componentIds: ['board-1'] },
  ] }, components);
  const before = owner.snapshot();
  owner.apply({ type: 'components.reconcile' }, ['board-1', 'resistor-1']);
  assert.deepEqual(owner.snapshot().groups[0].componentIds, ['resistor-1']);
  owner.apply({ type: 'components.reconcile' }, ['resistor-1']);
  assert.equal(owner.snapshot().groups.length, 1);
  owner.restore(before, components);
  assert.deepEqual(owner.snapshot(), before);
});

test('X66 strict validation rejects markup, unknown fields, bounds and dangling or duplicate members', () => {
  const valid = { schema: CANVAS_ANNOTATIONS_SCHEMA,
    notes: [{ id: 'note-one', text: 'Plain text', x: 0.1, y: 0.2 }],
    groups: [{ id: 'group-one', label: 'Inputs', componentIds: ['board-1'] }] };
  assert.deepEqual(normalizeCanvasAnnotations(valid, components), valid);
  for (const mutate of [
    (value) => { value.notes[0].text = '<b>unsafe</b>'; },
    (value) => { value.notes[0].x = 2; },
    (value) => { value.notes[0].authority = true; },
    (value) => { value.groups[0].componentIds = ['missing']; },
    (value) => { value.groups[0].componentIds = ['board-1', 'board-1']; },
  ]) { const value = structuredClone(valid); mutate(value); assert.throws(() => normalizeCanvasAnnotations(value, components)); }
});

test('X66 annotated workspace roundtrips only after project and references validate', () => {
  const validator = (project, profileId) => {
    assert.equal(profileId, 'board.atmega328p-16mhz-v1');
    if (project.schema !== 'project-envelope-test@1') throw new Error('PROJECT_INVALID');
    return { project, componentIds: components, prepared: { ok: true } };
  };
  const value = { schema: ANNOTATED_WORKSPACE_SCHEMA, profileId: 'board.atmega328p-16mhz-v1',
    project: { schema: 'project-envelope-test@1' }, annotations: { schema: CANVAS_ANNOTATIONS_SCHEMA,
      notes: [{ id: 'note-one', text: 'Observe output', x: 0.7, y: 0.2 }],
      groups: [{ id: 'group-one', label: 'Output stage', componentIds: ['led-1', 'resistor-1'] }] } };
  const text = canonicalAnnotatedWorkspace(value, validator);
  assert.deepEqual(parseAnnotatedWorkspace(text, validator).workspace, value);
  const malformed = structuredClone(value); malformed.annotations.groups[0].componentIds.push('missing');
  assert.throws(() => canonicalAnnotatedWorkspace(malformed, validator));
});
