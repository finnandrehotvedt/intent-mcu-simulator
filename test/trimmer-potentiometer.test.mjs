// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { createComponentArtwork } from '../staging/component-artwork.mjs';
import { COMPONENT_CATALOG, defaultControls, defaultProperties } from '../src/component-catalog.mjs';
import { CircuitRuntime, validateCircuit } from '../src/circuit-engine.mjs';
import { prepareApiBatch } from '../src/browser-session-edit.mjs';
import { COMPONENT_SUPPORT_CELLS } from '../src/component-support-matrix.mjs';
import { createExampleProject } from '../src/example-projects.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK, trustedModelLibraryManifests } from '../src/model-library.mjs';
import { ProjectEditorReducer, newComponent } from '../src/project-editor.mjs';

const TYPE = 'potentiometer.trimmer-v1';
const clone = (value) => structuredClone(value);

test('CMP-003 is a distinct immutable top-adjust trimmer contract with original artwork', () => {
  const definition = COMPONENT_CATALOG[TYPE];
  assert.equal(Object.isFrozen(definition), true);
  assert.equal(definition.modelRef, 'model.trimmer-divider-v1');
  assert.equal(definition.artwork.renderer, 'potentiometer-trimmer');
  assert.notEqual(definition.artwork.renderer, COMPONENT_CATALOG['potentiometer.linear-v1'].artwork.renderer);
  assert.deepEqual(definition.pins.map(({ id }) => id), ['HIGH', 'WIPER', 'LOW']);
  assert.deepEqual(defaultProperties(TYPE), { ohms: 10_000, taper: 'linear' });
  assert.deepEqual(defaultControls(TYPE), { position: 0.5 });

  class Node {
    constructor(name) { this.name = name; this.attributes = {}; this.children = []; this.textContent = ''; }
    setAttribute(key, value) { this.attributes[key] = value; }
    append(...children) { this.children.push(...children); }
  }
  globalThis.document = { createElementNS: (_namespace, name) => new Node(name) };
  try {
    const svg = createComponentArtwork(definition, {
      id: 'trimmer-1', type: TYPE, label: 'Calibration trimmer',
      properties: defaultProperties(TYPE), controls: { position: 0.75 },
    });
    assert.equal(svg.attributes['data-artwork-key'], 'potentiometer-trimmer');
    assert.deepEqual(svg.children.filter((item) => item.attributes['data-terminal-pin'])
      .map((item) => item.attributes['data-terminal-pin']), ['HIGH', 'WIPER', 'LOW']);
    assert(svg.children.some((item) => item.name === 'text' && item.textContent === 'TRIM'));
  } finally {
    delete globalThis.document;
  }
});

test('CMP-003 has one simulated AVR cell and no narrow-profile claim', () => {
  const cells = COMPONENT_SUPPORT_CELLS.filter(({ model }) => model === TYPE);
  assert.equal(cells.length, 4);
  assert.deepEqual(cells.map(({ available }) => available), [true, false, false, false]);
  assert.equal(cells[0].status, 'simulated');
  assert(cells.slice(1).every(({ limitations }) => /does not yet admit/u.test(limitations[0])));
  const entries = trustedModelLibraryManifests()[1].entries.filter(({ componentType }) => componentType === TYPE);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].profile, 'board.atmega328p-16mhz-v1');
  assert.equal(entries[0].owner.pipelineId, 'avr-base-circuit-runtime-v1');
});

test('CMP-003 validates exact divider data and rejects malformed values or topology', () => {
  const graph = createExampleProject('trimmer').project.circuit;
  const valid = validateCircuit(graph, { modelLibraryLock: CURRENT_MODEL_LIBRARY_LOCK });
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.models.potentiometers.map(({ modelType, boardPin, voltage }) => ({ modelType, boardPin, voltage })), [
    { modelType: TYPE, boardPin: 'A1', voltage: 2.5 },
  ]);
  for (const mutate of [
    (component) => { component.properties.ohms = 0; },
    (component) => { component.properties.taper = 'log'; },
    (component) => { component.controls.position = 1.1; },
    (component) => { component.controls.extra = true; },
  ]) {
    const invalid = clone(graph); mutate(invalid.components.find(({ type }) => type === TYPE));
    assert.equal(validateCircuit(invalid).code, 'INVALID_COMPONENT_PROPERTIES');
  }
  const disconnected = clone(graph);
  disconnected.nets = disconnected.nets.filter(({ endpoints }) => !endpoints.some(
    ({ component, pin }) => component === 'trimmer-1' && pin === 'LOW'));
  assert.equal(validateCircuit(disconnected).code, 'UNSUPPORTED_ANALOG_TOPOLOGY');
});

test('CMP-003 runtime drives A1 from retained position and reports the same voltage', () => {
  const graph = createExampleProject('trimmer').project.circuit;
  const runtime = new CircuitRuntime(graph);
  const writes = [];
  const adapter = { setAnalogChannel: (channel, voltage) => writes.push({ channel, voltage }) };
  runtime.applyControls(adapter);
  assert.deepEqual(writes.at(-1), { channel: 1, voltage: 2.5 });
  runtime.setControl('trimmer-1', 'position', 0.8, adapter);
  assert.deepEqual(writes.at(-1), { channel: 1, voltage: 4 });
  assert.deepEqual(runtime.observe({}).analogue, [{ componentId: 'trimmer-1', boardPin: 'A1', voltage: 4 }]);
  assert.throws(() => runtime.setControl('trimmer-1', 'position', -0.1, adapter), /INVALID_COMPONENT_PROPERTIES/u);
});

test('CMP-003 is addable through editor and browser API with undo/redo-safe defaults', () => {
  const base = createExampleProject('adc').project;
  const editor = new ProjectEditorReducer(base);
  const component = newComponent(TYPE, editor.project.circuit);
  assert.equal(component.id, 'trimmer-1');
  const added = editor.apply({ type: 'component.add', revision: editor.revision, component,
    position: { x: 0.55, y: 0.72, rotation: 0 } });
  assert.equal(added.ok, true, added.code);
  assert.equal(editor.project.circuit.components.at(-1).type, TYPE);
  assert.equal(editor.apply({ type: 'undo', revision: editor.revision }).ok, true);
  assert.equal(editor.project.circuit.components.some(({ type }) => type === TYPE), false);
  assert.equal(editor.apply({ type: 'redo', revision: editor.revision }).ok, true);
  assert.equal(editor.project.circuit.components.some(({ type }) => type === TYPE), true);

  const [command] = prepareApiBatch({ profile: 'board.atmega328p-16mhz-v1', circuit: base.circuit }, [{
    command: 'component.add', id: 'trimmer-2', type: TYPE,
    position: { x: 0.6, y: 0.72, rotation: 0 },
  }]);
  assert.deepEqual(command.component.properties, { ohms: 10_000, taper: 'linear' });
  assert.deepEqual(command.component.controls, { position: 0.5 });
});
