// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
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
