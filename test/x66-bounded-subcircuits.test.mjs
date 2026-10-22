// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  BoundedSubcircuitReducer, SUBCIRCUIT_DEFINITION_SCHEMA, SUBCIRCUIT_INSTANCE_SCHEMA,
  contractSubcircuits, createSeriesLedDefinition, emptySubcircuits, expandSubcircuits, normalizeSubcircuits,
  parseSubcircuits,
} from '../src/bounded-subcircuits.mjs';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import * as modelLibrary from '../src/model-library.mjs';
import { ProjectEditorReducer, projectFromCircuit } from '../src/project-editor.mjs';

const clone = structuredClone;
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const definition = () => createSeriesLedDefinition();
const instance = (id, source = 'net-d13-branch', ground = 'net-ground-branch') => ({
  schema: SUBCIRCUIT_INSTANCE_SCHEMA, id, definitionId: 'series-led-stage',
  bindings: [{ portId: 'ground', netId: ground }, { portId: 'source', netId: source }],
  x: 0.55, y: 0.35, collapsed: false,
});
const owner = (...instances) => ({ ...emptySubcircuits(), definitions: [definition()], instances });

test('X66 finite definition has explicit source and ground ports over one resistor and LED', () => {
  const normalized = normalizeSubcircuits(owner(instance('stage-one')));
  assert.equal(normalized.definitions[0].schema, SUBCIRCUIT_DEFINITION_SCHEMA);
  assert.deepEqual(normalized.definitions[0].ports, [
    { id: 'ground', netId: 'ground' }, { id: 'source', netId: 'source' },
  ]);
  assert.deepEqual(normalized.definitions[0].components.map(({ type }) => type),
    ['led.basic-v1', 'resistor.fixed-v1']);
});

test('X66 expansion is deterministic, namespaced and produces only the existing validated graph', () => {
  const first = expandSubcircuits(DEFAULT_CIRCUIT, owner(instance('stage-one')));
  const second = expandSubcircuits(clone(DEFAULT_CIRCUIT), clone(first.owner));
  assert.equal(digest(first.graph), digest(second.graph));
  assert(first.graph.components.some(({ id }) => id === 'stage-one-led'));
  assert(first.graph.components.some(({ id }) => id === 'stage-one-resistor'));
  assert(first.graph.nets.some(({ id }) => id === 'stage-one-series'));
  assert(first.graph.nets.find(({ id }) => id === 'net-d13-branch').endpoints
    .some(({ component, pin }) => component === 'stage-one-resistor' && pin === 'A'));
  assert(first.graph.nets.find(({ id }) => id === 'net-ground-branch').endpoints
    .some(({ component, pin }) => component === 'stage-one-led' && pin === 'CATHODE'));
});

test('X66 two reusable instances never collide and retain separate internal nets', () => {
  const result = expandSubcircuits(DEFAULT_CIRCUIT, owner(instance('stage-one'), instance('stage-two')));
  assert.deepEqual(result.graph.nets.filter(({ id }) => id.endsWith('-series')).map(({ id }) => id),
    ['stage-one-series', 'stage-two-series']);
  assert.equal(new Set(result.graph.components.map(({ id }) => id)).size, result.graph.components.length);
});

test('X66 reducer create delete and undo redo are atomic over owner and expanded graph', () => {
  const reducer = new BoundedSubcircuitReducer(DEFAULT_CIRCUIT);
  const baseline = reducer.snapshot();
  reducer.apply({ type: 'instance.create', id: 'stage-one', definition: definition(),
    bindings: instance('stage-one').bindings, x: 0.55, y: 0.35 });
  const created = reducer.snapshot(); assert.equal(created.owner.instances.length, 1);
  assert.notEqual(digest(created.graph), digest(baseline.graph));
  reducer.apply({ type: 'instance.remove', id: 'stage-one' });
  assert.deepEqual(reducer.snapshot().graph, baseline.graph);
  reducer.undo(); assert.deepEqual(reducer.snapshot(), created);
  reducer.undo(); assert.deepEqual(reducer.snapshot(), baseline);
  reducer.redo(); assert.deepEqual(reducer.snapshot(), created);
});

test('X66 move and collapse are presentation-only and preserve every endpoint and graph digest', () => {
  const expanded = expandSubcircuits(DEFAULT_CIRCUIT, owner(instance('stage-one')));
  const reducer = new BoundedSubcircuitReducer(expanded.graph, expanded.owner);
  const before = reducer.snapshot();
  reducer.apply({ type: 'instance.move', id: 'stage-one', x: 0.72, y: 0.66 });
  reducer.apply({ type: 'instance.collapse', id: 'stage-one', collapsed: true });
  const after = reducer.snapshot();
  assert.equal(digest(after.graph), digest(before.graph));
  assert.deepEqual(after.graph.nets, before.graph.nets);
  assert.deepEqual({ x: after.owner.instances[0].x, y: after.owner.instances[0].y,
    collapsed: after.owner.instances[0].collapsed }, { x: 0.72, y: 0.66, collapsed: true });
});

test('X66 strict owner rejects nesting, hidden authority, limits, unresolved ports and profile drift', () => {
  const valid = owner(instance('stage-one'));
  const cases = [
    (value) => { value.definitions[0].subcircuits = []; },
    (value) => { value.instances[0].run = true; },
    (value) => { value.instances[0].bindings.pop(); },
    (value) => { value.instances[0].bindings[0].portId = 'missing'; },
    (value) => { value.profileId = 'board.rp2040-pico-v1'; },
    (value) => { value.instances[0].x = 2; },
    (value) => { value.definitions[0].components[0].type = 'board.atmega328p-16mhz-v1'; },
    (value) => { value.definitions[0].nets[1].endpoints[0].pin = 'CATHODE'; },
  ];
  for (const mutate of cases) { const value = clone(valid); mutate(value); assert.throws(() => normalizeSubcircuits(value)); }
  assert.throws(() => parseSubcircuits(JSON.stringify({ ...valid, authority: { build: true } })));
});

test('X66 expansion rejects missing external nets, component collisions and tampered saved expansion', () => {
  const missing = owner(instance('stage-one', 'missing')); assert.throws(() => expandSubcircuits(DEFAULT_CIRCUIT, missing), { code: 'SUBCIRCUIT_EXTERNAL_NET_MISSING' });
  const collisionGraph = clone(DEFAULT_CIRCUIT); collisionGraph.components.push({
    id: 'stage-one-led', type: 'led.basic-v1', label: 'Collision LED', properties: { color: 'red' }, controls: {},
  });
  assert.throws(() => expandSubcircuits(collisionGraph, owner(instance('stage-one'))));
  const expanded = expandSubcircuits(DEFAULT_CIRCUIT, owner(instance('stage-one')));
  expanded.graph.nets.find(({ id }) => id === 'net-d13-branch').endpoints = expanded.graph.nets
    .find(({ id }) => id === 'net-d13-branch').endpoints.filter(({ component }) => component !== 'stage-one-resistor');
  assert.throws(() => new BoundedSubcircuitReducer(expanded.graph, expanded.owner));
});

test('X66 every exported historical trusted lock is rejected as stale owner identity', () => {
  const locks = Object.entries(modelLibrary).filter(([name, value]) => name.endsWith('_MODEL_LIBRARY_LOCK')
    && value && typeof value === 'object' && value.schema === CURRENT_MODEL_LIBRARY_LOCK.schema);
  assert(locks.length >= 20);
  for (const [name, lock] of locks) {
    const value = owner(); value.modelLibrary = clone(lock);
    if (JSON.stringify(lock) === JSON.stringify(CURRENT_MODEL_LIBRARY_LOCK)) assert.doesNotThrow(() => normalizeSubcircuits(value));
    else assert.throws(() => normalizeSubcircuits(value), { code: 'SUBCIRCUIT_OWNER_SHAPE' }, name);
  }
});

test('X66 empty owner remains inert over an independently validated retained candidate graph', () => {
  const candidateGraph = { schema: 'teach-lab-circuit@1',
    components: [{ id: 'retained-sensor', type: 'sensor.retained-candidate-v1', label: 'Retained sensor', properties: {}, controls: {} }],
    nets: [], junctions: [] };
  const result = contractSubcircuits(candidateGraph, emptySubcircuits());
  assert.deepEqual(result.graph, candidateGraph);
  assert.deepEqual(result.baseGraph, candidateGraph);
  assert.notStrictEqual(result.graph, candidateGraph);
});

test('X66 project editor commits electrical replacement and presentation movement as atomic history', () => {
  const session = new ProjectEditorReducer(projectFromCircuit(DEFAULT_CIRCUIT));
  const before = clone(session.project);
  const expanded = expandSubcircuits(DEFAULT_CIRCUIT, owner(instance('stage-one'))).graph;
  const positions = clone(before.layout.positions);
  positions['stage-one-resistor'] = { x: 0.56, y: 0.34, rotation: 0 };
  positions['stage-one-led'] = { x: 0.68, y: 0.34, rotation: 0 };
  const created = session.apply({ type: 'subcircuit.graph.replace', graph: expanded, positions, revision: 0 });
  assert.equal(created.ok, true); assert.equal(created.buildRelevant, true);
  const moved = session.apply({ type: 'subcircuit.presentation.set',
    positions: [{ componentId: 'stage-one-resistor', x: 0.66, y: 0.54 },
      { componentId: 'stage-one-led', x: 0.78, y: 0.54 }], revision: 1 });
  assert.equal(moved.ok, true); assert.equal(moved.buildRelevant, false);
  assert.deepEqual(moved.project.circuit, created.project.circuit);
  const undoMove = session.apply({ type: 'undo', revision: 2 });
  assert.deepEqual(undoMove.project.circuit, created.project.circuit);
  const undoCreate = session.apply({ type: 'undo', revision: 3 });
  assert.deepEqual(undoCreate.project.circuit, before.circuit);
});
