// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import {
  candidateUiDefinition,
  createCandidateUiArtwork,
  createCandidateUiComponent,
  openCandidateUiSession,
} from '../src/candidate-existing-ui-adapter.mjs';
import { createAvrReferenceStarter } from '../src/avr-reference-starters.mjs';
import { prepareApiBatch } from '../src/browser-session-edit.mjs';
import {
  POWER_REFERENCE_DEFINITION,
  createPowerReferenceComponent,
  parsePowerReferenceCircuitText,
  validatePowerReferenceCircuit,
  validatePowerReferenceDefinition,
} from '../expansion-drafts/power-reference-integration-v1.mjs';

function candidate() {
  const graph = structuredClone(DEFAULT_CIRCUIT);
  graph.components.push(createPowerReferenceComponent('power-reference-1'));
  graph.nets.find((item) => item.id === 'net-5v').endpoints.push(
    { component: 'power-reference-1', pin: 'OUT' },
  );
  return graph;
}

test('CMP-020 power symbol is an explicit immutable 5 V source', () => {
  assert.equal(validatePowerReferenceDefinition(), true);
  assert.equal(POWER_REFERENCE_DEFINITION.pins[0].constraints.direction, 'source');
  assert.equal(POWER_REFERENCE_DEFINITION.pins[0].constraints.voltage, 5);
  assert.match(POWER_REFERENCE_DEFINITION.support.limitations.join(' '), /not an independent bench supply/u);
});

test('CMP-020 projects to the AVR 5 V source without becoming ground metadata', () => {
  const result = validatePowerReferenceCircuit(candidate());
  assert.equal(result.ok, true);
  assert.deepEqual(result.sourceReferences, [{ componentId: 'power-reference-1', voltageVolts: 5, direction: 'source' }]);
  assert.equal(result.runtimeGraph.components.some((item) => item.type === 'reference.power-5v-v1'), false);
  const projected = result.runtimeGraph.nets.find((item) => item.id === 'net-5v');
  assert.equal(projected.endpoints.some((item) => item.component === 'board-1' && item.pin === '5V'), true);
  assert.equal(projected.endpoints.some((item) => item.pin.startsWith('GND')), false);
});

test('CMP-020 rejects changed voltage, ground conflict, reuse and malformed JSON', () => {
  const voltage = candidate(); voltage.components.at(-1).properties.voltageVolts = 3.3;
  assert.equal(validatePowerReferenceCircuit(voltage).code, 'POWER_REFERENCE_FIXED_5V');
  const ground = candidate(); ground.nets.find((item) => item.id === 'net-5v')
    .endpoints.find((item) => item.component === 'board-1').pin = 'GND1';
  assert.equal(validatePowerReferenceCircuit(ground).code, 'POWER_REFERENCE_GROUND_CONFLICT');
  const reused = candidate(); reused.nets.push({ id: 'net-power-2', endpoints: [
    { component: 'power-reference-1', pin: 'OUT' }, { component: 'board-1', pin: 'A1' },
  ] });
  assert.equal(validatePowerReferenceCircuit(reused).code, 'POWER_REFERENCE_REUSED');
  assert.equal(parsePowerReferenceCircuitText('{').code, 'MALFORMED_JSON');
});

test('CMP-020 is discoverable and addable through the canonical editor and API contracts', () => {
  assert.equal(candidateUiDefinition('reference.power-5v-v1'), POWER_REFERENCE_DEFINITION);
  assert.deepEqual(createCandidateUiComponent('reference.power-5v-v1', 'power-reference-2'), {
    id: 'power-reference-2', type: 'reference.power-5v-v1', label: '5 V circuit source',
    properties: { voltageVolts: 5 }, controls: {},
  });
  const [command] = prepareApiBatch({ profile: 'board.atmega328p-16mhz-v1', circuit: structuredClone(DEFAULT_CIRCUIT) }, [{
    command: 'component.add', id: 'power-reference-3', type: 'reference.power-5v-v1',
    position: { x: 0.7, y: 0.2, rotation: 0 },
  }]);
  assert.equal(command.component.type, 'reference.power-5v-v1');
  assert.equal(command.component.properties.voltageVolts, 5);
});

test('CMP-020 renderer exposes the named OUT terminal using original SVG geometry', () => {
  class Node {
    constructor(name) { this.name = name; this.attributes = {}; this.children = []; this.textContent = ''; }
    setAttribute(key, value) { this.attributes[key] = value; }
    append(...children) { this.children.push(...children); }
  }
  const documentObject = { createElementNS: (_namespace, name) => new Node(name) };
  const component = createCandidateUiComponent('reference.power-5v-v1', 'power-reference-4');
  const svg = createCandidateUiArtwork(documentObject, POWER_REFERENCE_DEFINITION, component);
  assert.equal(svg.attributes['data-artwork-key'], 'power-reference-5v-symbol');
  assert.equal(svg.attributes.role, 'img');
  assert.equal(svg.children.some((item) => item.attributes['data-terminal-pin'] === 'OUT'), true);
  assert.match(svg.children.find((item) => item.name === 'title').textContent, /5 V circuit source/u);
});

test('CMP-020 composes with a retained 0 V reference and preserves exact history and persistence', () => {
  const starter = createAvrReferenceStarter('avr-ground-reference-input');
  const opened = openCandidateUiSession(starter.text);
  assert.equal(opened.ok, true);
  const session = opened.session;
  const original = session.saveText();
  const add = session.apply({
    type: 'component.add', revision: session.revision,
    component: createPowerReferenceComponent('power-reference-1'),
    position: { x: 0.18, y: 0.64, rotation: 0 },
  });
  assert.equal(add.ok, true, add.code);
  const wire = session.apply({
    type: 'wire.create', revision: session.revision,
    net: { id: 'net-power-reference-d3', endpoints: [
      { component: 'power-reference-1', pin: 'OUT' },
      { component: 'board-1', pin: 'D3' },
    ] },
  });
  assert.equal(wire.ok, true, wire.code);
  assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
  assert.equal(session.runtimeProject.circuit.components.some(
    (item) => ['reference.power-5v-v1', 'reference.ground-v1'].includes(item.type),
  ), false);
  const accepted = session.saveText();
  assert.equal(openCandidateUiSession(accepted).session.saveText(), accepted);
  assert.equal(session.apply({ type: 'undo', revision: session.revision }).ok, true);
  assert.equal(session.apply({ type: 'undo', revision: session.revision }).ok, true);
  assert.equal(session.saveText(), original);
  assert.equal(session.apply({ type: 'redo', revision: session.revision }).ok, true);
  assert.equal(session.apply({ type: 'redo', revision: session.revision }).ok, true);
  assert.equal(session.saveText(), accepted);
});

test('CMP-020 mixed projects reject changed voltage and power-to-ground conflicts atomically', () => {
  const opened = openCandidateUiSession(createAvrReferenceStarter('avr-ground-reference-input').text);
  const session = opened.session;
  assert.equal(session.apply({
    type: 'component.add', revision: session.revision,
    component: createPowerReferenceComponent('power-reference-1'),
    position: { x: 0.18, y: 0.64, rotation: 0 },
  }).ok, true);
  const beforeVoltage = session.saveText();
  const voltage = session.apply({
    type: 'component.property.set', revision: session.revision,
    componentId: 'power-reference-1', key: 'voltageVolts', value: 3.3,
  });
  assert.equal(voltage.ok, false);
  assert.equal(session.saveText(), beforeVoltage);
  const conflict = session.apply({
    type: 'wire.branch', revision: session.revision, netId: 'net-ground-branch',
    endpoint: { component: 'power-reference-1', pin: 'OUT' },
    junctionId: 'junction-power-ground-conflict',
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, 'PROJECT_CONTACT_POWER_SHORT');
  assert.equal(session.saveText(), beforeVoltage);
});
