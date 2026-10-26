// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMIT_SWITCH_TYPE, NC_BUTTON_TYPE, SLIDE_SWITCH_TYPE,
  createMechanicalInputComponent, mechanicalRuntimeState,
  validateMechanicalInputComponent,
} from '../expansion-drafts/mechanical-inputs-v1.mjs';
import { CandidateEditorSession, openPortableEditorSession } from '../src/candidate-project-session.mjs';
import { createContactPersistenceExample } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';

test('CMP023 slide switch retains an explicit break-before-make throw', () => {
  const component = createMechanicalInputComponent(SLIDE_SWITCH_TYPE, 'slide-1');
  assert.equal(validateMechanicalInputComponent(component), true);
  assert.deepEqual(mechanicalRuntimeState(component), { kind: 'spdt', selectedThrow: 'A' });
  component.controls.selectedThrow = 'B';
  assert.deepEqual(mechanicalRuntimeState(component), { kind: 'spdt', selectedThrow: 'B' });
  component.controls.selectedThrow = 'NO';
  assert.equal(validateMechanicalInputComponent(component), false);
});

test('CMP025 normally-closed button opens only while pressed', () => {
  const component = createMechanicalInputComponent(NC_BUTTON_TYPE, 'nc-button-1');
  assert.deepEqual(mechanicalRuntimeState(component), { kind: 'spst', closed: true });
  component.controls.pressed = true;
  assert.deepEqual(mechanicalRuntimeState(component), { kind: 'spst', closed: false });
  component.properties.normallyClosed = false;
  assert.equal(validateMechanicalInputComponent(component), false);
});

test('CMP032 limit switch returns from NO to NC', () => {
  const component = createMechanicalInputComponent(LIMIT_SWITCH_TYPE, 'limit-1');
  assert.deepEqual(mechanicalRuntimeState(component), { kind: 'spdt', selectedThrow: 'NC' });
  component.controls.actuated = true;
  assert.deepEqual(mechanicalRuntimeState(component), { kind: 'spdt', selectedThrow: 'NO' });
  component.controls.actuated = false;
  assert.deepEqual(mechanicalRuntimeState(component), { kind: 'spdt', selectedThrow: 'NC' });
});

test('all three mechanical inputs add, edit, undo, redo and reopen canonically', () => {
  const session = new CandidateEditorSession(createContactPersistenceExample().project);
  const cases = [
    [SLIDE_SWITCH_TYPE, 'slide-1', 'selectedThrow', 'B'],
    [NC_BUTTON_TYPE, 'nc-button-1', 'pressed', true],
    [LIMIT_SWITCH_TYPE, 'limit-1', 'actuated', true],
  ];
  for (const [type, id, key, value] of cases) {
    const added = session.apply({ type: 'component.add', revision: session.revision,
      component: createMechanicalInputComponent(type, id), position: { x: 0.5, y: 0.5, rotation: 0 } });
    assert.equal(added.ok, true, added.code);
    const changed = session.apply({ type: 'component.control.set', revision: session.revision,
      componentId: id, key, value });
    assert.equal(changed.ok, true, changed.code);
  }
  const expected = session.saveText();
  assert.equal(session.apply({ type: 'undo', revision: session.revision }).ok, true);
  assert.equal(session.apply({ type: 'redo', revision: session.revision }).ok, true);
  assert.equal(session.saveText(), expected);
  const opened = openPortableEditorSession(expected);
  assert.equal(opened.ok, true, opened.code);
  assert.equal(opened.session.saveText(), expected);
});

test('invalid mechanical state rejects without changing project bytes', () => {
  const session = new CandidateEditorSession(createContactPersistenceExample().project);
  const before = session.saveText();
  const invalid = createMechanicalInputComponent(LIMIT_SWITCH_TYPE, 'limit-invalid');
  invalid.controls.actuated = 'yes';
  const result = session.apply({ type: 'component.add', revision: session.revision,
    component: invalid, position: { x: 0.5, y: 0.5, rotation: 0 } });
  assert.equal(result.ok, false);
  assert.equal(session.saveText(), before);
});
