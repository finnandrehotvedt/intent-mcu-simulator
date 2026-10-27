// SPDX-License-Identifier: Apache-2.0
import './resistive-divider-sensors-candidate.test.mjs';
import './resistive-divider-sensor-example-artifacts.test.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BALL_VIBRATION_SWITCH_TYPE, CONTACT_SENSOR_DEFINITIONS, FLOAT_SWITCH_TYPE,
  TILT_SWITCH_TYPE, contactSensorRuntimeState, createContactSensor,
  validateContactSensor } from '../expansion-drafts/contact-sensors-v1.mjs';
import { CANDIDATE_UI_COMPONENTS, candidateContactControl, createCandidateUiComponent,
  openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { resolveModelLibrary } from '../src/model-library.mjs';

const TYPES = [FLOAT_SWITCH_TYPE, TILT_SWITCH_TYPE, BALL_VIBRATION_SWITCH_TYPE];
const ROOT = new URL('../examples/contact-sensors/avr-contact-sensors.intent-mcu.json', import.meta.url);

test('CMP105/CMP130/CMP131 publish distinct original bounded contact definitions', () => {
  for (const type of TYPES) {
    const definition = CONTACT_SENSOR_DEFINITIONS[type];
    assert.equal(CANDIDATE_UI_COMPONENTS[type], definition);
    assert.equal(definition.support.status, 'partial');
    assert.deepEqual(definition.pins.map(({ id }) => id), ['A', 'B']);
    assert.match(definition.artwork.provenance, /Original IntentForce SVG/u);
    assert.equal(definition.artwork.license, 'Apache-2.0');
    assert.match(definition.support.limitations.join(' '), /No .* is modelled/u);
    const component = createCandidateUiComponent(type, `contact-${TYPES.indexOf(type) + 1}`);
    assert.equal(validateContactSensor(component), true);
    assert.deepEqual(contactSensorRuntimeState(component), { closed: false });
    const key = definition.controlKeys[0]; component.controls[key] = true;
    assert.deepEqual(contactSensorRuntimeState(component), { closed: true });
  }
});

test('contact controls are exact, atomic, model-backed, undoable and reopenable', async () => {
  const envelope = JSON.parse(await readFile(ROOT, 'utf8'));
  const opened = openCandidateUiSession(JSON.stringify(envelope.project));
  assert.equal(opened.ok, true, opened.code); const session = opened.session;
  assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
  const implementation = resolveModelLibrary(envelope.modelLibrary).implementation;
  for (const component of session.visualProject.circuit.components.filter((item) => TYPES.includes(item.type))) {
    const key = CONTACT_SENSOR_DEFINITIONS[component.type].controlKeys[0];
    const prepared = candidateContactControl(session, component.id, key, true);
    assert.equal(prepared.ok, true); const changed = session.apply({ ...prepared.command, revision: session.revision });
    assert.equal(changed.ok, true, changed.code);
    assert.deepEqual(implementation.evaluateProduction(component.type, { closed: true }).result, { connected: true });
    assert.equal(candidateContactControl(session, component.id, `${key}Invalid`, true).ok, false);
  }
  const expected = session.saveText();
  assert.equal(session.apply({ type: 'undo', revision: session.revision }).ok, true);
  assert.equal(session.apply({ type: 'redo', revision: session.revision }).ok, true);
  assert.equal(session.saveText(), expected);
  const reopened = openCandidateUiSession(expected); assert.equal(reopened.ok, true, reopened.code);
  assert.equal(reopened.session.saveText(), expected);
  const invalid = createContactSensor(FLOAT_SWITCH_TYPE, 'bad-contact'); invalid.controls.liquidHigh = 'yes';
  assert.equal(validateContactSensor(invalid), false);
});
