// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCircuit } from '../src/circuit-engine.mjs';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { explainError } from '../src/error-catalog.mjs';
import { faultDiagnostic } from '../src/fault-diagnostics.mjs';
import { CandidateEditorSession } from '../src/candidate-project-session.mjs';
import { createGroundReferenceComponent } from '../expansion-drafts/ground-reference-integration-v1.mjs';
import { createContactPersistenceExample } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { createTemperatureAnalogueSensorComponent } from '../expansion-drafts/temperature-analogue-sensor-v1.mjs';

const clone = (value) => structuredClone(value);

test('W10 detects only known opposing outputs and does not invent same-level or high-Z contention', () => {
  const graph = clone(DEFAULT_CIRCUIT);
  graph.nets.push({ id: 'net-two-output', endpoints: [
    { component: 'board-1', pin: 'D3' }, { component: 'board-1', pin: 'D4' },
  ] });
  assert.equal(validateCircuit(graph, { drivers: {
    'board-1.D3': 'HIGH', 'board-1.D4': 'LOW',
  } }).code, 'OUTPUT_CONTENTION');
  assert.equal(validateCircuit(graph, { drivers: {
    'board-1.D3': 'HIGH', 'board-1.D4': 'HIGH',
  } }).code, 'MULTIPLE_DIGITAL_IO_NET_UNSUPPORTED');
  assert.equal(validateCircuit(graph, { drivers: {
    'board-1.D3': 'HIGH', 'board-1.D4': 'HIGH_Z',
  } }).code, 'MULTIPLE_DIGITAL_IO_NET_UNSUPPORTED');
  assert.equal(validateCircuit(graph).code, 'MULTIPLE_DIGITAL_IO_NET_UNSUPPORTED');
});

test('W10 direct named-rail short reports bounded references and a corrective action', () => {
  const graph = clone(DEFAULT_CIRCUIT);
  graph.nets.find((net) => net.id === 'net-5v').endpoints[1] = { component: 'board-1', pin: 'GND2' };
  const validation = validateCircuit(graph);
  assert.equal(validation.code, 'POWER_SHORT');
  assert.equal(validation.diagnostics[0].netId, 'net-5v');
  const fault = faultDiagnostic(validation.code);
  assert.equal(fault.fault, 'supported-rail-short');
  assert.match(fault.action, /Disconnect.*supply.*ground/u);
  assert.match(fault.modelBoundary, /does not predict physical damage/u);
});

test('W10 actionable diagnostics preserve explicit model and cross-voltage boundaries', () => {
  const cases = [
    ['PROJECT_CONTACT_OUTPUT_CONTENTION', /opposing digital outputs/u, /known opposing logical drive/u],
    ['MULTIPLE_DIGITAL_IO_NET_UNSUPPORTED', /Separate the digital I\/O pins/u, /firmware can later change/u],
    ['PROJECT_CONTACT_TEMPERATURE_SENSOR_VCC_REQUIRES_5V', /supported 5 V reference/u, /cross-controller rail wiring is unavailable/u],
    ['RP2040_GROUND_REQUIRED', /declared ground terminal/u, /does not infer/u],
    ['C3_LED_REVERSE_POLARITY', /Reverse the LED/u, /ideal LED topology/u],
    ['STM32_SERIES_RESISTOR_REQUIRED', /required series resistor/u, /not a general analogue solver/u],
    ['LED_OVERCURRENT', /Increase the series resistance/u, /not a physical tolerance/u],
  ];
  for (const [code, action, boundary] of cases) {
    const fault = faultDiagnostic(code);
    assert.match(fault.action, action, code);
    assert.match(fault.modelBoundary, boundary, code);
    assert.equal(explainError(code).action, fault.action, code);
    assert.equal(explainError(code).technical, fault.modelBoundary, code);
  }
  assert.equal(faultDiagnostic('ARBITRARY_UNSUPPORTED_FAULT'), null);
});

test('W10 candidate supply-role mismatch is real validator behavior, not documentation-only', () => {
  const created = createContactPersistenceExample();
  const session = new CandidateEditorSession(created.project);
  const apply = (command) => {
    const value = session.apply({ ...command, revision: session.revision });
    assert.equal(value.ok, true, `${command.type}: ${value.code}`);
  };
  apply({ type: 'component.add',
    component: createTemperatureAnalogueSensorComponent('temperature-sensor-w10', 'Temperature', { temperatureC: 25 }),
    position: { x: 0.82, y: 0.78 } });
  apply({ type: 'wire.branch', netId: 'net-ground-branch',
    endpoint: { component: 'temperature-sensor-w10', pin: 'VCC' }, junctionId: 'junction-w10-vcc' });
  apply({ type: 'wire.branch', netId: 'net-ground-branch',
    endpoint: { component: 'temperature-sensor-w10', pin: 'GND' }, junctionId: 'junction-w10-ground' });
  apply({ type: 'wire.create', net: { id: 'net-w10-aout', endpoints: [
    { component: 'temperature-sensor-w10', pin: 'AOUT' }, { component: 'board-1', pin: 'A1' },
  ] } });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_TEMPERATURE_SENSOR_VCC_REQUIRES_5V');
  assert.match(explainError(session.runnable.code).action, /supported 5 V reference/u);
});

test('W10 unsafe candidate edit is byte-atomic and adds no history', () => {
  const created = createContactPersistenceExample();
  const session = new CandidateEditorSession(created.project);
  const add = session.apply({ type: 'component.add', revision: session.revision,
    component: createGroundReferenceComponent('ground-reference-w10'), position: { x: 0.9, y: 0.9 } });
  assert.equal(add.ok, true);
  const net = session.accepted.project.candidateCircuit.nets.find((item) => item.id === 'net-5v');
  const from = net.endpoints.find((endpoint) => endpoint.component === 'pot-1');
  const before = session.saveText();
  const revision = session.revision;
  const history = session.undoStack.length;
  const rejected = session.apply({ type: 'wire.reconnect', revision, netId: net.id, from,
    to: { component: 'ground-reference-w10', pin: 'REF' } });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'PROJECT_CONTACT_POWER_SHORT');
  assert.equal(session.saveText(), before);
  assert.equal(session.revision, revision);
  assert.equal(session.undoStack.length, history);
});
