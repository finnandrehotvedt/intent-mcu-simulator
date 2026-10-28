// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import {
  PASSIVE_PIEZO_DEFINITION, PASSIVE_PIEZO_RUNTIME_ADAPTER, PASSIVE_PIEZO_TYPE,
  AVR_PASSIVE_PIEZO_PINS, createPassivePiezoComponent, projectPassivePiezos,
  validatePassivePiezoDefinition,
} from '../expansion-drafts/passive-piezo-v1.mjs';
import { CANDIDATE_UI_COMPONENTS, createCandidateUiComponent, openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { openPortableEditorSession } from '../src/candidate-project-session.mjs';
import { CURRENT_MODEL_LIBRARY_IMPLEMENTATION } from '../src/model-library-current-resolver.mjs';

function openSession() {
  const draft = createEditableContactDraft(); assert.equal(draft.ok, true);
  const opened = openPortableEditorSession(canonicalContactPersistenceDraftJson(draft.project)); assert.equal(opened.ok, true);
  return opened.session;
}
function apply(session, command) {
  const result = session.apply({ ...command, revision: session.revision });
  assert.equal(result.ok, true, `${command.type}: ${result.code} ${JSON.stringify(result.details)}`); return result;
}
function add(session) { apply(session, { type: 'component.add', component: createPassivePiezoComponent('piezo-1'), position: { x: 0.75, y: 0.66 } }); }
function wireGround(session) { apply(session, { type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: 'piezo-1', pin: 'GND' }, junctionId: 'junction-piezo-ground' }); }
function wireSignal(session, pin = 'D9') { apply(session, { type: 'wire.create', net: { id: 'net-piezo-signal', endpoints: [{ component: 'piezo-1', pin: 'SIGNAL' }, { component: 'board-1', pin }] } }); }

test('CMP-063 has exact identity, original two-terminal artwork contract and AVR-only support', () => {
  assert.equal(validatePassivePiezoDefinition(), true);
  assert.equal(PASSIVE_PIEZO_DEFINITION.type, PASSIVE_PIEZO_TYPE);
  assert.deepEqual(PASSIVE_PIEZO_DEFINITION.pins.map(({ id }) => id), ['SIGNAL', 'GND']);
  assert.deepEqual(AVR_PASSIVE_PIEZO_PINS, ['D3', 'D5', 'D6', 'D9', 'D10', 'D11']);
  assert.match(PASSIVE_PIEZO_DEFINITION.artwork.provenance, /Original IntentForce SVG/u);
  assert.match(PASSIVE_PIEZO_DEFINITION.support.limitations.join(' '), /no browser audio/u);
  assert.equal(CANDIDATE_UI_COMPONENTS[PASSIVE_PIEZO_TYPE], PASSIVE_PIEZO_DEFINITION);
  assert.deepEqual(createCandidateUiComponent(PASSIVE_PIEZO_TYPE, 'piezo-2'), {
    id: 'piezo-2', type: PASSIVE_PIEZO_TYPE, label: 'Passive piezo buzzer', properties: {}, controls: {},
  });
});

test('topology advances deterministically and accepts exactly six direct AVR PWM pins', () => {
  const session = openSession(); add(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_PASSIVE_PIEZO_SIGNAL_DISCONNECTED');
  wireSignal(session); assert.equal(session.runnable.code, 'PROJECT_CONTACT_PASSIVE_PIEZO_GND_DISCONNECTED');
  wireGround(session); assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
  const support = session.runtimeSupport.find(({ componentId }) => componentId === 'piezo-1');
  assert.equal(support.runtimeAdapter, PASSIVE_PIEZO_RUNTIME_ADAPTER);
  assert.equal(support.runtimeProjection.sourcePin, 'D9');
  assert.equal(support.runtimeProjection.displayModel, 'visual-driven-rest-and-transition-activity-only');
  for (const pin of AVR_PASSIVE_PIEZO_PINS) {
    const graph = { components: [createPassivePiezoComponent('piezo'), { id: 'board', type: 'board.atmega328p-16mhz-v1' }], junctions: [], nets: [
      { id: 'signal', endpoints: [{ component: 'piezo', pin: 'SIGNAL' }, { component: 'board', pin }] },
      { id: 'ground', endpoints: [{ component: 'piezo', pin: 'GND' }, { component: 'board', pin: 'GND1' }] },
    ] };
    assert.equal(projectPassivePiezos(graph).ok, true, pin);
  }
});

test('non-PWM and branched drive fail closed while malformed model edits reject atomically', () => {
  for (const [pin, code] of [['D8', 'PROJECT_CONTACT_PASSIVE_PIEZO_SIGNAL_REQUIRES_AVR_PWM_PIN']]) {
    const session = openSession(); add(session); wireGround(session); wireSignal(session, pin);
    assert.equal(session.runnable.code, code);
  }
  const branched = openSession(); add(branched); wireSignal(branched); wireGround(branched);
  const before = branched.saveText();
  const branchedResult = branched.apply({ type: 'wire.branch', revision: branched.revision, netId: 'net-piezo-signal', endpoint: { component: 'board-1', pin: 'D10' }, junctionId: 'junction-piezo-branch' });
  assert.equal(branchedResult.ok, true); assert.equal(branched.runnable.code, 'PROJECT_CONTACT_PASSIVE_PIEZO_SIGNAL_UNSUPPORTED_TOPOLOGY');
  apply(branched, { type: 'undo' });
  assert.equal(branched.saveText(), before);
  const malformed = branched.apply({ type: 'component.add', revision: branched.revision,
    component: { ...createPassivePiezoComponent('piezo-invalid'), properties: { frequencyHz: 440 } }, position: { x: 0.6, y: 0.6 } });
  assert.equal(malformed.ok, false); assert.equal(malformed.code, 'PROJECT_CONTACT_PASSIVE_PIEZO_STATE');
  assert.equal(branched.saveText(), before);
});

test('Save/Open, move, remove and exact Undo/Redo preserve model identity and nets', () => {
  const session = openSession(); add(session); wireSignal(session); wireGround(session);
  apply(session, { type: 'component.move', componentId: 'piezo-1', x: 0.71, y: 0.62 });
  const accepted = session.saveText();
  const reopened = openCandidateUiSession(accepted); assert.equal(reopened.ok, true, `${reopened.code} ${JSON.stringify(reopened.details)}`); assert.equal(reopened.session.runnable.ok, true);
  assert.equal(reopened.session.runtimeSupport.find(({ componentId }) => componentId === 'piezo-1').runtimeProjection.sourcePin, 'D9');
  apply(session, { type: 'component.remove', componentId: 'piezo-1' });
  apply(session, { type: 'undo' }); assert.equal(session.saveText(), accepted);
  apply(session, { type: 'redo' }); assert.notEqual(session.saveText(), accepted);
  apply(session, { type: 'undo' }); assert.equal(session.saveText(), accepted);
});

test('canonical model API exposes driven/rest and transition activity without frequency or audio', () => {
  const library = CURRENT_MODEL_LIBRARY_IMPLEMENTATION;
  assert.deepEqual(library.evaluateProduction(PASSIVE_PIEZO_TYPE, { level: false, transitionCount: 0 }),
    { ok: true, code: 'OK', result: { driven: false, transitionActive: false, transitionCount: 0 } });
  assert.deepEqual(library.evaluateProduction(PASSIVE_PIEZO_TYPE, { level: true, transitionCount: 4 }),
    { ok: true, code: 'OK', result: { driven: true, transitionActive: true, transitionCount: 4 } });
  assert.equal(library.evaluateProduction(PASSIVE_PIEZO_TYPE, { level: true, transitionCount: -1 }).ok, false);
});
