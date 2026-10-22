// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANNOTATED_WORKSPACE_SCHEMA, CANVAS_ANNOTATIONS_SCHEMA, CanvasAnnotationReducer,
  LEGACY_ANNOTATED_WORKSPACE_SCHEMA, LEGACY_CANVAS_ANNOTATIONS_SCHEMA, NET_LABELS_SCHEMA,
  canonicalAnnotatedWorkspace, emptyCanvasAnnotations, normalizeCanvasAnnotations, parseAnnotatedWorkspace,
} from '../src/canvas-annotations.mjs';
import { emptySubcircuits } from '../src/bounded-subcircuits.mjs';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';

const components = ['board-1', 'led-1', 'resistor-1'];
const nets = ['ground', 'indicator', 'supply'];
const references = { componentIds: components, netIds: nets };
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
  ], netLabels: { schema: NET_LABELS_SCHEMA, labels: [] } }, references);
  const before = owner.snapshot();
  owner.apply({ type: 'references.reconcile' }, { componentIds: ['board-1', 'resistor-1'], netIds: nets });
  assert.deepEqual(owner.snapshot().groups[0].componentIds, ['resistor-1']);
  owner.apply({ type: 'references.reconcile' }, { componentIds: ['resistor-1'], netIds: nets });
  assert.equal(owner.snapshot().groups.length, 1);
  owner.restore(before, references);
  assert.deepEqual(owner.snapshot(), before);
});

test('X66 invalid undo or redo validates before consuming either history stack', () => {
  const owner = new CanvasAnnotationReducer({ schema: CANVAS_ANNOTATIONS_SCHEMA, notes: [], groups: [
    { id: 'group-output', label: 'Output', componentIds: ['led-1', 'resistor-1'] },
  ], netLabels: { schema: NET_LABELS_SCHEMA, labels: [] } }, references);
  owner.apply({ type: 'references.reconcile' }, { componentIds: ['board-1', 'resistor-1'], netIds: nets });
  const afterDelete = owner.snapshot(); const beforeRejectedUndo = owner.history();
  assert.throws(() => owner.undo({ componentIds: ['board-1', 'resistor-1'], netIds: nets }), { code: 'CANVAS_GROUP_DANGLING_COMPONENT' });
  assert.deepEqual(owner.snapshot(), afterDelete); assert.deepEqual(owner.history(), beforeRejectedUndo);
  owner.undo(references);
  const beforeRejectedRedo = owner.history(); const restored = owner.snapshot();
  assert.throws(() => owner.redo({ componentIds: ['board-1'], netIds: nets }), { code: 'CANVAS_GROUP_DANGLING_COMPONENT' });
  assert.deepEqual(owner.snapshot(), restored); assert.deepEqual(owner.history(), beforeRejectedRedo);
});

test('X66 strict validation rejects markup, unknown fields, bounds and dangling or duplicate members', () => {
  const valid = { schema: CANVAS_ANNOTATIONS_SCHEMA,
    notes: [{ id: 'note-one', text: 'Plain text', x: 0.1, y: 0.2 }],
    groups: [{ id: 'group-one', label: 'Inputs', componentIds: ['board-1'] }],
    netLabels: { schema: NET_LABELS_SCHEMA, labels: [] } };
  assert.deepEqual(normalizeCanvasAnnotations(valid, references), valid);
  for (const mutate of [
    (value) => { value.notes[0].text = '<b>unsafe</b>'; },
    (value) => { value.notes[0].x = 2; },
    (value) => { value.notes[0].authority = true; },
    (value) => { value.groups[0].componentIds = ['missing']; },
    (value) => { value.groups[0].componentIds = ['board-1', 'board-1']; },
  ]) { const value = structuredClone(valid); mutate(value); assert.throws(() => normalizeCanvasAnnotations(value, references)); }
});

test('X66 existing-net labels allow equal text on distinct nets without changing graph data', () => {
  const owner = new CanvasAnnotationReducer(emptyCanvasAnnotations(), references);
  const graph = { components: components.map((id) => ({ id })), nets: nets.map((id) => ({ id })) };
  const digestBefore = JSON.stringify(graph);
  owner.apply({ type: 'net-label.create', id: 'net-label-one', netId: 'indicator', text: 'SHARED', x: 0.4, y: 0.2 }, references);
  owner.apply({ type: 'net-label.create', id: 'net-label-two', netId: 'ground', text: 'SHARED', x: 0.6, y: 0.8 }, references);
  assert.deepEqual(owner.snapshot().netLabels.labels.map(({ netId, text }) => ({ netId, text })), [
    { netId: 'indicator', text: 'SHARED' }, { netId: 'ground', text: 'SHARED' },
  ]);
  assert.equal(JSON.stringify(graph), digestBefore);
  owner.undo(references); owner.redo(references);
  assert.equal(owner.snapshot().netLabels.labels.length, 2);
});

test('X66 existing-net labels reject dangling nets, authority, collisions, markup and bounds', () => {
  const valid = { schema: CANVAS_ANNOTATIONS_SCHEMA,
    notes: [{ id: 'note-one', text: 'Plain', x: 0.1, y: 0.2 }], groups: [],
    netLabels: { schema: NET_LABELS_SCHEMA,
      labels: [{ id: 'net-label-one', netId: 'indicator', text: 'HEATER_CTRL', x: 0.5, y: 0.4 }] } };
  for (const mutate of [
    (value) => { value.netLabels.labels[0].netId = 'missing'; },
    (value) => { value.netLabels.labels[0].authority = 'connect'; },
    (value) => { value.netLabels.labels[0].id = 'note-one'; },
    (value) => { value.netLabels.labels[0].text = '<b>wire</b>'; },
    (value) => { value.netLabels.labels[0].x = -1; },
    (value) => { value.netLabels.schema = 'intent-mcu-net-labels@999'; },
  ]) { const value = structuredClone(valid); mutate(value); assert.throws(() => normalizeCanvasAnnotations(value, references)); }
});

test('X66 net deletion deterministically removes labels and paired undo restores only with the exact net', () => {
  const owner = new CanvasAnnotationReducer({ schema: CANVAS_ANNOTATIONS_SCHEMA, notes: [], groups: [],
    netLabels: { schema: NET_LABELS_SCHEMA,
      labels: [{ id: 'net-label-one', netId: 'indicator', text: 'HEATER_CTRL', x: 0.5, y: 0.4 }] } }, references);
  owner.apply({ type: 'references.reconcile' }, { componentIds: components, netIds: ['ground', 'supply'] });
  assert.equal(owner.snapshot().netLabels.labels.length, 0);
  const history = owner.history();
  assert.throws(() => owner.undo({ componentIds: components, netIds: ['ground', 'supply'] }), { code: 'CANVAS_NET_LABEL_DANGLING_NET' });
  assert.deepEqual(owner.history(), history);
  owner.undo(references);
  assert.equal(owner.snapshot().netLabels.labels[0].netId, 'indicator');
});

test('X66 legacy annotation/workspace data upgrades with an empty strict net-label owner', () => {
  const legacy = { schema: LEGACY_CANVAS_ANNOTATIONS_SCHEMA, notes: [], groups: [] };
  assert.deepEqual(normalizeCanvasAnnotations(legacy, references), emptyCanvasAnnotations());
  const validator = (project) => ({ project, ...references, graph: DEFAULT_CIRCUIT,
    modelLibrary: CURRENT_MODEL_LIBRARY_LOCK });
  const opened = parseAnnotatedWorkspace(JSON.stringify({ schema: LEGACY_ANNOTATED_WORKSPACE_SCHEMA,
    profileId: 'board.atmega328p-16mhz-v1', project: { schema: 'legacy-project' }, annotations: legacy }), validator);
  assert.equal(opened.workspace.schema, ANNOTATED_WORKSPACE_SCHEMA);
  assert.deepEqual(opened.workspace.annotations, emptyCanvasAnnotations());
  assert.deepEqual(opened.workspace.subcircuits, emptySubcircuits());
});

test('X66 annotated workspace roundtrips only after project and references validate', () => {
  const validator = (project, profileId) => {
    assert.equal(profileId, 'board.atmega328p-16mhz-v1');
    if (project.schema !== 'project-envelope-test@1') throw new Error('PROJECT_INVALID');
    return { project, componentIds: components, netIds: nets, graph: DEFAULT_CIRCUIT,
      modelLibrary: CURRENT_MODEL_LIBRARY_LOCK, prepared: { ok: true } };
  };
  const value = { schema: ANNOTATED_WORKSPACE_SCHEMA, profileId: 'board.atmega328p-16mhz-v1',
    project: { schema: 'project-envelope-test@1' }, annotations: { schema: CANVAS_ANNOTATIONS_SCHEMA,
      notes: [{ id: 'note-one', text: 'Observe output', x: 0.7, y: 0.2 }],
      groups: [{ id: 'group-one', label: 'Output stage', componentIds: ['led-1', 'resistor-1'] }],
      netLabels: { schema: NET_LABELS_SCHEMA,
        labels: [{ id: 'net-label-one', netId: 'indicator', text: 'OUTPUT', x: 0.6, y: 0.3 }] } },
    subcircuits: emptySubcircuits() };
  const text = canonicalAnnotatedWorkspace(value, validator);
  assert.deepEqual(parseAnnotatedWorkspace(text, validator).workspace, value);
  const malformed = structuredClone(value); malformed.annotations.groups[0].componentIds.push('missing');
  assert.throws(() => canonicalAnnotatedWorkspace(malformed, validator));
});
