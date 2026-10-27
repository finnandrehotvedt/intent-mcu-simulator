// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPONENT_CATALOG } from '../src/component-catalog.mjs';
import { CircuitRuntime } from '../src/circuit-engine.mjs';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson,
  validateContactPersistenceDraft } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import {
  ANALOGUE_TEMPERATURE_IC_DEFINITIONS,
  LM35_TEMPERATURE_TYPE,
  TMP36_TEMPERATURE_TYPE,
  analogueTemperatureIcValue,
  analogueTemperatureIcVoltage,
  createAnalogueTemperatureIcSensor,
  validateAnalogueTemperatureIcSensor,
} from '../expansion-drafts/analogue-temperature-ic-sensors-v1.mjs';
import { createAnalogueTemperatureIcArtwork } from '../expansion-drafts/analogue-temperature-ic-sensors-artwork-v1.mjs';
import {
  CANDIDATE_UI_COMPONENTS, candidateContactControl, createCandidateUiComponent,
  openCandidateUiSession,
} from '../src/candidate-existing-ui-adapter.mjs';
import { openPortableEditorSession } from '../src/candidate-project-session.mjs';

const TYPES = [TMP36_TEMPERATURE_TYPE, LM35_TEMPERATURE_TYPE];

class ArtworkNode {
  constructor(name) { this.name = name; this.attributes = {}; this.children = []; this.textContent = ''; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  append(...children) { this.children.push(...children); }
}

function openSession() {
  const draft = createEditableContactDraft(); assert.equal(draft.ok, true);
  const opened = openPortableEditorSession(canonicalContactPersistenceDraftJson(draft.project));
  assert.equal(opened.ok, true); return opened.session;
}
function apply(session, command) {
  const result = session.apply({ ...command, revision: session.revision });
  assert.equal(result.ok, true, `${command.type}: ${result.code} ${JSON.stringify(result.details)}`);
  return result;
}
function addSensor(session, type = TMP36_TEMPERATURE_TYPE, id = 'temperature-ic-1') {
  apply(session, { type: 'component.add', component: createAnalogueTemperatureIcSensor(type, id),
    position: { x: 0.76, y: 0.58, rotation: 0 } });
}
function wireSensor(session, id = 'temperature-ic-1', outputPin = 'A0') {
  apply(session, { type: 'wire.branch', netId: 'net-5v', endpoint: { component: id, pin: 'VCC' },
    junctionId: `junction-${id}-vcc` });
  apply(session, { type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: id, pin: 'GND' },
    junctionId: `junction-${id}-ground` });
  apply(session, { type: 'wire.create', net: { id: `net-${id}-aout`, endpoints: [
    { component: id, pin: 'AOUT' }, { component: 'board-1', pin: outputPin },
  ] } });
}

test('CMP089/CMP090 are distinct original TMP36 and LM35 transfer contracts', () => {
  assert(!TYPES.some((type) => Object.hasOwn(COMPONENT_CATALOG, type)));
  assert.equal(new Set(TYPES.map((type) => ANALOGUE_TEMPERATURE_IC_DEFINITIONS[type].modelRef)).size, 2);
  assert.equal(new Set(TYPES.map((type) => ANALOGUE_TEMPERATURE_IC_DEFINITIONS[type].artwork.renderer)).size, 2);
  for (const type of TYPES) {
    const definition = ANALOGUE_TEMPERATURE_IC_DEFINITIONS[type];
    assert.deepEqual(definition.pins.map(({ id }) => id), ['VCC', 'GND', 'AOUT']);
    assert.equal(definition.support.status, 'simulated');
    assert.match(definition.support.limitations.join(' '), /terminal order is not a physical package-orientation guide/u);
    assert.match(definition.support.limitations.join(' '), /A0–A5/u);
    assert.match(definition.artwork.provenance, /Original IntentForce SVG/u);
    assert.equal(CANDIDATE_UI_COMPONENTS[type], definition);
    const component = createCandidateUiComponent(type, `temperature-${type}`);
    assert.equal(validateAnalogueTemperatureIcSensor(component), true);
    assert.equal(analogueTemperatureIcValue(component), 25);
    const artwork = createAnalogueTemperatureIcArtwork(
      { createElementNS: (_namespace, name) => new ArtworkNode(name) },
      { ...definition, displayName: `${definition.displayName} preview` }, component,
    );
    assert.equal(artwork.attributes['data-artwork-key'], definition.artwork.renderer);
  }
  assert.match(ANALOGUE_TEMPERATURE_IC_DEFINITIONS[TMP36_TEMPERATURE_TYPE].support.limitations.join(' '), /0\.5 V/u);
  assert.match(ANALOGUE_TEMPERATURE_IC_DEFINITIONS[LM35_TEMPERATURE_TYPE].support.limitations.join(' '), /Negative-temperature circuitry/u);
  assert.ok(Math.abs(analogueTemperatureIcVoltage(TMP36_TEMPERATURE_TYPE, -40) - 0.1) < 1e-12);
  assert.equal(analogueTemperatureIcVoltage(TMP36_TEMPERATURE_TYPE, 125), 1.75);
  assert.equal(analogueTemperatureIcVoltage(LM35_TEMPERATURE_TYPE, 0), 0);
  assert.equal(analogueTemperatureIcVoltage(LM35_TEMPERATURE_TYPE, 150), 1.5);
});

test('missing sensor terminals and a digital output target fail exactly', () => {
  const session = openSession(); addSensor(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_ANALOGUE_TEMPERATURE_IC_SENSOR_VCC_DISCONNECTED');
  apply(session, { type: 'wire.branch', netId: 'net-5v', endpoint: { component: 'temperature-ic-1', pin: 'VCC' },
    junctionId: 'junction-temperature-ic-vcc' });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_ANALOGUE_TEMPERATURE_IC_SENSOR_GND_DISCONNECTED');
  apply(session, { type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: 'temperature-ic-1', pin: 'GND' },
    junctionId: 'junction-temperature-ic-ground' });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_ANALOGUE_TEMPERATURE_IC_SENSOR_AOUT_DISCONNECTED');
  apply(session, { type: 'wire.create', net: { id: 'net-temperature-ic-aout', endpoints: [
    { component: 'temperature-ic-1', pin: 'AOUT' }, { component: 'board-1', pin: 'D7' },
  ] } });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_ANALOGUE_TEMPERATURE_IC_SENSOR_AOUT_REQUIRES_ANALOGUE');
  assert.equal(validateContactPersistenceDraft(JSON.parse(session.saveText())).ok, true);
});

test('both temperature ICs project their exact transfer functions through the AVR ADC adapter', () => {
  const cases = [
    [TMP36_TEMPERATURE_TYPE, -10, 0.08, 0.4, 'A4', 4],
    [LM35_TEMPERATURE_TYPE, 75, 0.15, 0.75, 'A5', 5],
  ];
  for (const [index, [type, value, position, voltage, pin, channel]] of cases.entries()) {
    const session = openSession(); const id = `temperature-ic-${index}`;
    addSensor(session, type, id); wireSensor(session, id, pin);
    assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
    const support = session.runtimeSupport.find((item) => item.componentId === id);
    assert.equal(support.runtimeAdapter, 'potentiometer.linear-v1-ideal-analogue-sensor-adapter');
    const prepared = candidateContactControl(session, id, 'temperatureC', value);
    assert.deepEqual(prepared.worker, { command: 'control', componentId: id, key: 'position', value: position });
    assert.equal(apply(session, prepared.command).changeRelevance, 'runtime');
    const projected = session.runtimeProject.circuit.components.find((component) => component.id === id);
    assert.deepEqual(projected.controls, { position });
    assert.equal(session.runtimeSupport.find((item) => item.componentId === id).runtimeProjection.voltage, voltage);
    const calls = [];
    new CircuitRuntime(session.runtimeProject.circuit).applyControls({ setDigitalPin() {},
      setAnalogChannel(adcChannel, volts) { calls.push([adcChannel, volts]); } });
    assert.deepEqual(calls.find(([adcChannel]) => adcChannel === channel), [channel, voltage]);
    assert.deepEqual(session.evaluateModel(type, { temperatureC: value }), {
      ok: true, code: 'OK', result: { temperatureC: value, outputVolts: voltage },
    });
  }
});

test('device-specific ranges reject atomically and Save/Open plus remove/undo/redo preserve state', () => {
  const session = openSession();
  addSensor(session, LM35_TEMPERATURE_TYPE, 'lm35-1'); wireSensor(session, 'lm35-1', 'A1');
  const beforeInvalid = session.saveText();
  assert.equal(candidateContactControl(session, 'lm35-1', 'temperatureC', -0.5).ok, false);
  const rejected = session.apply({ type: 'component.control.set', revision: session.revision,
    componentId: 'lm35-1', key: 'temperatureC', value: -0.5 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'PROJECT_CONTACT_ANALOGUE_TEMPERATURE_IC_SENSOR_STATE');
  assert.equal(session.saveText(), beforeInvalid);
  apply(session, candidateContactControl(session, 'lm35-1', 'temperatureC', 36.5).command);
  const activeText = session.saveText();
  const reopened = openCandidateUiSession(activeText); assert.equal(reopened.ok, true, reopened.code);
  assert.equal(reopened.session.visualProject.circuit.components.find(
    (component) => component.id === 'lm35-1',
  ).controls.temperatureC, 36.5);
  assert.equal(reopened.session.runtimeProject.circuit.components.find(
    (component) => component.id === 'lm35-1',
  ).controls.position, 0.073);
  apply(session, { type: 'component.remove', componentId: 'lm35-1' });
  apply(session, { type: 'undo' }); assert.equal(session.saveText(), activeText);
  apply(session, { type: 'redo' });
  assert(!JSON.parse(session.saveText()).candidateCircuit.components.some(
    (component) => component.id === 'lm35-1'));
});
