// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { DIP_SWITCH_4_TYPE, ROTARY_ENCODER_BUTTON_TYPE, advancedSwitchRuntimeState,
  createAdvancedSwitchInput, validateAdvancedSwitchInput } from '../expansion-drafts/advanced-switch-inputs-v1.mjs';
import { CandidateEditorSession, openPortableEditorSession } from '../src/candidate-project-session.mjs';
import { createContactPersistenceExample } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';

test('CMP024 DIP bank retains four independent maintained contacts', () => {
  const component = createAdvancedSwitchInput(DIP_SWITCH_4_TYPE, 'dip-1');
  component.controls.switch2 = true; component.controls.switch4 = true;
  assert.equal(validateAdvancedSwitchInput(component), true);
  assert.deepEqual(advancedSwitchRuntimeState(component).contacts.map((item) => item.closed), [false, true, false, true]);
});

test('CMP027 encoder includes a distinct momentary shaft button', () => {
  const component = createAdvancedSwitchInput(ROTARY_ENCODER_BUTTON_TYPE, 'encoder-button-1');
  component.controls.detent = -1; component.controls.pressed = true;
  assert.equal(validateAdvancedSwitchInput(component), true);
  assert.deepEqual(advancedSwitchRuntimeState(component), { detent: -1, buttonClosed: true });
  assert.deepEqual(Object.keys(component.controls), ['detent', 'pressed']);
});

test('advanced switch input validation rejects malformed state', () => {
  const dip = createAdvancedSwitchInput(DIP_SWITCH_4_TYPE, 'dip-1'); dip.controls.switch3 = 'on';
  const encoder = createAdvancedSwitchInput(ROTARY_ENCODER_BUTTON_TYPE, 'encoder-button-1'); encoder.controls.detent = 1000;
  assert.equal(validateAdvancedSwitchInput(dip), false); assert.equal(validateAdvancedSwitchInput(encoder), false);
});

test('DIP bank and encoder button add, control, undo, redo and reopen canonically', () => {
  const session = new CandidateEditorSession(createContactPersistenceExample().project);
  for (const [type, id] of [[DIP_SWITCH_4_TYPE, 'dip-1'], [ROTARY_ENCODER_BUTTON_TYPE, 'encoder-button-1']]) {
    const result = session.apply({ type: 'component.add', revision: session.revision,
      component: createAdvancedSwitchInput(type, id), position: { x: 0.7, y: 0.5, rotation: 0 } });
    assert.equal(result.ok, true, result.code);
  }
  for (const [componentId, key, value] of [['dip-1', 'switch3', true],
    ['encoder-button-1', 'detent', 1], ['encoder-button-1', 'pressed', true]]) {
    assert.equal(session.apply({ type: 'component.control.set', revision: session.revision,
      componentId, key, value }).ok, true);
  }
  const expected = session.saveText();
  assert.equal(session.apply({ type: 'undo', revision: session.revision }).ok, true);
  assert.equal(session.apply({ type: 'redo', revision: session.revision }).ok, true);
  assert.equal(session.saveText(), expected);
  const reopened = openPortableEditorSession(expected);
  assert.equal(reopened.ok, true, reopened.code); assert.equal(reopened.session.saveText(), expected);
});
