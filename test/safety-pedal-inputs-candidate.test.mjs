// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'; import assert from 'node:assert/strict';
import { EMERGENCY_STOP_TYPE, FOOT_PEDAL_TYPE, REED_SWITCH_TYPE, createSafetyPedalInput,
  safetyPedalRuntimeState, validateSafetyPedalInput } from '../expansion-drafts/safety-pedal-inputs-v1.mjs';
import { CandidateEditorSession, openPortableEditorSession } from '../src/candidate-project-session.mjs';
import { createContactPersistenceExample } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
test('CMP033 reed contact follows magnetic presence', () => { const item = createSafetyPedalInput(REED_SWITCH_TYPE, 'reed-1');
  assert.deepEqual(safetyPedalRuntimeState(item), { closed: false }); item.controls.magnetPresent = true; assert.deepEqual(safetyPedalRuntimeState(item), { closed: true }); });
test('CMP034 emergency stop latches an instructional NC contact open', () => { const item = createSafetyPedalInput(EMERGENCY_STOP_TYPE, 'estop-1');
  assert.deepEqual(safetyPedalRuntimeState(item), { closed: true }); item.controls.latched = true; assert.deepEqual(safetyPedalRuntimeState(item), { closed: false }); });
test('CMP035 foot pedal is momentary normally-open', () => { const item = createSafetyPedalInput(FOOT_PEDAL_TYPE, 'pedal-1');
  item.controls.pressed = true; assert.deepEqual(safetyPedalRuntimeState(item), { closed: true }); item.controls.pressed = 'yes'; assert.equal(validateSafetyPedalInput(item), false); });
test('all three safety and pedal inputs add, control, undo, redo and reopen', () => {
  const session = new CandidateEditorSession(createContactPersistenceExample().project);
  for (const [type, id] of [[REED_SWITCH_TYPE, 'reed-1'], [EMERGENCY_STOP_TYPE, 'estop-1'], [FOOT_PEDAL_TYPE, 'pedal-1']]) {
    const result = session.apply({ type: 'component.add', revision: session.revision,
      component: createSafetyPedalInput(type, id), position: { x: 0.7, y: 0.6, rotation: 0 } });
    assert.equal(result.ok, true, result.code);
  }
  for (const [componentId, key] of [['reed-1', 'magnetPresent'], ['estop-1', 'latched'], ['pedal-1', 'pressed']]) {
    assert.equal(session.apply({ type: 'component.control.set', revision: session.revision,
      componentId, key, value: true }).ok, true);
  }
  const expected = session.saveText(); assert.equal(session.apply({ type: 'undo', revision: session.revision }).ok, true);
  assert.equal(session.apply({ type: 'redo', revision: session.revision }).ok, true); assert.equal(session.saveText(), expected);
  const reopened = openPortableEditorSession(expected); assert.equal(reopened.ok, true, reopened.code);
  assert.equal(reopened.session.saveText(), expected);
});
