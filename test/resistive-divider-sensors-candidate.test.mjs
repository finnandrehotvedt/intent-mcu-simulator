// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { CircuitRuntime } from '../src/circuit-engine.mjs';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { CANDIDATE_UI_COMPONENTS, candidateContactControl,
  createCandidateUiComponent, openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { FLEX_DIVIDER_TYPE, LDR_DIVIDER_TYPE, NTC_DIVIDER_TYPE,
  RESISTIVE_DIVIDER_SENSOR_DEFINITIONS, resistiveDividerSensorResistance,
  resistiveDividerSensorVoltage, validateResistiveDividerSensor } from '../expansion-drafts/resistive-divider-sensors-v1.mjs';

const TYPES = [LDR_DIVIDER_TYPE, NTC_DIVIDER_TYPE, FLEX_DIVIDER_TYPE];
function session() { const draft = createEditableContactDraft(); assert.equal(draft.ok, true);
  const active = openCandidateUiSession(canonicalContactPersistenceDraftJson(draft.project)).session;
  for (const component of active.visualProject.circuit.components) {
    if (component.id !== 'board-1') apply(active, { type: 'component.remove', componentId: component.id });
  }
  return active; }
function apply(active, command) { const result = active.apply({ ...command, revision: active.revision });
  assert.equal(result.ok, true, `${command.type}:${result.code}`); return result; }
function addAndWire(active, type, id, pin) {
  apply(active, { type: 'component.add', component: createCandidateUiComponent(type, id),
    position: { x: 0.7, y: 0.6, rotation: 0 } });
  apply(active, { type: 'wire.create', net: { id: 'net-5v', endpoints: [
    { component: 'board-1', pin: '5V' }, { component: id, pin: 'VCC' }] } });
  apply(active, { type: 'wire.create', net: { id: 'net-ground-branch', endpoints: [
    { component: 'board-1', pin: 'GND1' }, { component: id, pin: 'GND' }] } });
  apply(active, { type: 'wire.create', net: { id: `${id}-out`, endpoints: [{ component: id, pin: 'AOUT' }, { component: 'board-1', pin }] } });
}

test('CMP085/CMP088/CMP116 expose distinct original bounded divider contracts', () => {
  assert.equal(new Set(TYPES.map((type) => RESISTIVE_DIVIDER_SENSOR_DEFINITIONS[type].modelRef)).size, 3);
  assert.equal(new Set(TYPES.map((type) => RESISTIVE_DIVIDER_SENSOR_DEFINITIONS[type].artwork.renderer)).size, 3);
  for (const type of TYPES) {
    const definition = RESISTIVE_DIVIDER_SENSOR_DEFINITIONS[type];
    assert.equal(CANDIDATE_UI_COMPONENTS[type], definition);
    assert.deepEqual(definition.pins.map(({ id }) => id), ['VCC', 'GND', 'AOUT']);
    assert.equal(definition.support.status, 'simulated');
    assert.match(definition.artwork.provenance, /Original IntentForce SVG/u);
    assert.match(definition.support.limitations.join(' '), /not a general two-terminal resistor/u);
    assert.equal(validateResistiveDividerSensor(createCandidateUiComponent(type, `unit-${type.split('.')[1]}`)), true);
  }
  assert.ok(resistiveDividerSensorVoltage(LDR_DIVIDER_TYPE, 1) > resistiveDividerSensorVoltage(LDR_DIVIDER_TYPE, 0));
  assert.equal(resistiveDividerSensorResistance(NTC_DIVIDER_TYPE, 25), 10000);
  assert.equal(resistiveDividerSensorResistance(FLEX_DIVIDER_TYPE, 1), 40000);
});

test('each divider projects exact controls through the AVR ADC adapter and survives Save/Open', () => {
  const cases = [[LDR_DIVIDER_TYPE, 'lightLevel', 0.75, 'A0', 0],
    [NTC_DIVIDER_TYPE, 'temperatureC', 55, 'A1', 1], [FLEX_DIVIDER_TYPE, 'bendRatio', 0.7, 'A2', 2]];
  for (const [index, [type, key, value, pin, channel]] of cases.entries()) {
    const active = session(); const id = `divider-${index}`; addAndWire(active, type, id, pin);
    const prepared = candidateContactControl(active, id, key, value); assert.equal(prepared.ok, true);
    apply(active, prepared.command); assert.deepEqual(active.runnable, { ok: true, code: 'OK', details: [] });
    const voltage = resistiveDividerSensorVoltage(type, value);
    assert.ok(Math.abs(prepared.worker.value - voltage / 5) < 1e-12);
    assert.ok(Math.abs(active.runtimeProject.circuit.components.find((item) => item.id === id).controls.position - voltage / 5) < 1e-12);
    const calls = []; new CircuitRuntime(active.runtimeProject.circuit).applyControls({ setDigitalPin() {}, setAnalogChannel(c, v) { calls.push([c, v]); } });
    assert.deepEqual(calls.find(([c]) => c === channel), [channel, voltage]);
    const reopened = openCandidateUiSession(active.saveText()); assert.equal(reopened.ok, true);
    assert.equal(reopened.session.visualProject.circuit.components.find((item) => item.id === id).controls[key], value);
  }
});

test('invalid control is atomic and remove/undo/redo remain exact', () => {
  const active = session(); addAndWire(active, NTC_DIVIDER_TYPE, 'ntc-1', 'A3');
  const before = active.saveText();
  const rejected = active.apply({ type: 'component.control.set', revision: active.revision,
    componentId: 'ntc-1', key: 'temperatureC', value: 126 });
  assert.equal(rejected.ok, false); assert.equal(rejected.code, 'PROJECT_CONTACT_RESISTIVE_DIVIDER_SENSOR_STATE');
  assert.equal(active.saveText(), before);
  apply(active, { type: 'component.remove', componentId: 'ntc-1' });
  apply(active, { type: 'undo' }); assert.equal(active.saveText(), before);
  apply(active, { type: 'redo' }); assert(!active.visualProject.circuit.components.some((item) => item.id === 'ntc-1'));
});
