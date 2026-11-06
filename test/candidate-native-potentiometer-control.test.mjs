// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';

import { CandidateEditorSession } from '../src/candidate-project-session.mjs';
import { createContactPersistenceExample } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';

test('candidate projects propagate visible native potentiometer controls into the runtime graph', () => {
  const session = new CandidateEditorSession(createContactPersistenceExample().project);
  const before = session.saveText();
  const changed = session.apply({
    type: 'component.control.set', revision: session.revision,
    componentId: 'pot-1', key: 'position', value: 0.82,
  });
  assert.equal(changed.ok, true, changed.code);
  assert.equal(changed.changeRelevance, 'runtime');
  assert.equal(session.visualProject.circuit.components
    .find((component) => component.id === 'pot-1').controls.position, 0.82);
  assert.equal(session.runtimeProject.circuit.components
    .find((component) => component.id === 'pot-1').controls.position, 0.82);

  const rejected = session.apply({
    type: 'component.control.set', revision: session.revision,
    componentId: 'pot-1', key: 'position', value: 1.01,
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'PROJECT_CONTACT_POTENTIOMETER_STATE');
  assert.notEqual(session.saveText(), before);
  assert.equal(session.runtimeProject.circuit.components
    .find((component) => component.id === 'pot-1').controls.position, 0.82);
});
