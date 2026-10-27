// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TRAFFIC_LIGHT_DEFINITION,
  TRAFFIC_LIGHT_MODEL,
  TRAFFIC_LIGHT_RENDERER,
  TRAFFIC_LIGHT_TYPE,
  createTrafficLightComponent,
  projectTrafficLightModules,
  validateTrafficLightDefinition,
} from '../expansion-drafts/traffic-light-module-v1.mjs';
import { createTrafficLightArtwork } from '../expansion-drafts/traffic-light-module-artwork-v1.mjs';
import { createAvrReferenceStarter } from '../src/avr-reference-starters.mjs';
import { CANDIDATE_UI_COMPONENTS, createCandidateUiComponent, openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { COMPONENT_SUPPORT_CELLS } from '../src/component-support-matrix.mjs';
import { CURRENT_MODEL_LIBRARY_IMPLEMENTATION } from '../src/model-library-current-resolver.mjs';
import { CURRENT_MODEL_LIBRARY_MANIFEST } from '../src/model-library-snapshots.mjs';

class Node {
  constructor(name) { this.name = name; this.attributes = {}; this.children = []; this.textContent = ''; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  append(...children) { this.children.push(...children); }
}

test('CMP-041 owns one immutable distinct four-terminal traffic-light contract and original artwork', () => {
  assert.equal(validateTrafficLightDefinition(), true);
  assert.equal(Object.isFrozen(TRAFFIC_LIGHT_DEFINITION), true);
  assert.equal(TRAFFIC_LIGHT_DEFINITION.modelRef, TRAFFIC_LIGHT_MODEL);
  assert.equal(TRAFFIC_LIGHT_DEFINITION.artwork.renderer, TRAFFIC_LIGHT_RENDERER);
  assert.deepEqual(TRAFFIC_LIGHT_DEFINITION.pins.map(({ id }) => id), ['RED', 'AMBER', 'GREEN', 'COM']);
  assert.equal(CANDIDATE_UI_COMPONENTS[TRAFFIC_LIGHT_TYPE], TRAFFIC_LIGHT_DEFINITION);
  assert.deepEqual(createCandidateUiComponent(TRAFFIC_LIGHT_TYPE, 'traffic-light-2'),
    createTrafficLightComponent('traffic-light-2'));

  const documentObject = { createElementNS: (_namespace, name) => new Node(name) };
  const svg = createTrafficLightArtwork(documentObject, TRAFFIC_LIGHT_DEFINITION,
    createTrafficLightComponent('traffic-light-1', 'Workshop signal'));
  assert.equal(svg.attributes['data-artwork-key'], TRAFFIC_LIGHT_RENDERER);
  assert.deepEqual(svg.children.filter((item) => item.attributes['data-terminal-pin'])
    .map((item) => item.attributes['data-terminal-pin']), ['RED', 'AMBER', 'GREEN', 'COM']);
  assert.deepEqual(svg.children.filter((item) => item.attributes['data-traffic-channel'])
    .map((item) => item.attributes['data-traffic-channel']), ['RED', 'AMBER', 'GREEN']);
});

test('CMP-041 projects the starter into three independent current-limited runtime LEDs', () => {
  const starter = createAvrReferenceStarter('avr-traffic-light');
  const opened = openCandidateUiSession(starter.text);
  assert.equal(opened.ok, true, opened.code);
  assert.deepEqual(opened.session.runnable, { ok: true, code: 'OK', details: [] });
  const support = opened.session.runtimeSupport.find(({ type }) => type === TRAFFIC_LIGHT_TYPE);
  assert(support?.runtimeProjection);
  assert.deepEqual(Object.fromEntries(Object.entries(support.runtimeProjection.channels)
    .map(([channel, value]) => [channel, value.sourcePin])), {
    RED: 'D3', AMBER: 'D5', GREEN: 'D6',
  });
  assert.deepEqual(Object.fromEntries(Object.entries(support.runtimeProjection.channels)
    .map(([channel, value]) => [channel, value.color])), {
    RED: 'red', AMBER: 'yellow', GREEN: 'green',
  });
  const runtimeComponents = opened.session.runtimeProject.circuit.components.filter(
    ({ id }) => Object.values(support.runtimeProjection.channels).some(
      ({ runtimeComponentId }) => runtimeComponentId === id));
  assert.deepEqual(runtimeComponents.map(({ properties }) => properties.color).sort(), ['green', 'red', 'yellow']);
});

test('CMP-041 fails closed for missing current limiting and malformed state', () => {
  const project = createAvrReferenceStarter('avr-traffic-light').project.candidateCircuit;
  const missingResistor = structuredClone(project);
  missingResistor.components = missingResistor.components.filter(({ id }) => id !== 'traffic-resistor-1');
  missingResistor.nets = missingResistor.nets.filter(({ endpoints }) => !endpoints.some(
    ({ component }) => component === 'traffic-resistor-1'));
  const rejected = projectTrafficLightModules(missingResistor);
  assert.equal(rejected.ok, false);
  assert.match(rejected.code, /^TRAFFIC_LIGHT_/u);

  const malformed = structuredClone(project);
  malformed.components.find(({ type }) => type === TRAFFIC_LIGHT_TYPE).controls.extra = true;
  assert.deepEqual(projectTrafficLightModules(malformed), {
    ok: false, code: 'TRAFFIC_LIGHT_STATE', details: ['traffic-light-1'],
  });
});

test('CMP-041 has one manifest-owned simulated AVR cell and no narrow-profile claim', () => {
  const cells = COMPONENT_SUPPORT_CELLS.filter(({ model }) => model === TRAFFIC_LIGHT_TYPE);
  assert.equal(cells.length, 4);
  assert.deepEqual(cells.map(({ available }) => available), [true, false, false, false]);
  assert.equal(cells[0].status, 'simulated');
  assert.equal(cells[0].reference.starters[0], 'avr-traffic-light');
  assert(cells.slice(1).every(({ limitations }) => /does not yet admit/u.test(limitations[0])));
  const entries = CURRENT_MODEL_LIBRARY_MANIFEST.entries.filter(
    ({ componentType }) => componentType === TRAFFIC_LIGHT_TYPE);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].profile, 'board.atmega328p-16mhz-v1');
});

test('CMP-041 production observer preserves exact boolean lamp state and rejects malformed values', () => {
  assert.deepEqual(CURRENT_MODEL_LIBRARY_IMPLEMENTATION.observeTrafficLight({
    RED: true, AMBER: false, GREEN: true,
  }), { RED: true, AMBER: false, GREEN: true });
  assert.deepEqual(CURRENT_MODEL_LIBRARY_IMPLEMENTATION.evaluateProduction(TRAFFIC_LIGHT_TYPE, {
    levels: { RED: true, AMBER: true, GREEN: false },
  }), { ok: true, code: 'OK', result: { levels: { RED: true, AMBER: true, GREEN: false } } });
  assert.equal(CURRENT_MODEL_LIBRARY_IMPLEMENTATION.evaluateProduction(TRAFFIC_LIGHT_TYPE, {
    levels: { RED: 1, AMBER: false, GREEN: false },
  }).code, 'MODEL_LIBRARY_PRODUCTION_INPUT');
});
