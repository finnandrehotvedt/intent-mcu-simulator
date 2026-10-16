// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalContactPersistenceDraftJson,
  validateContactPersistenceDraft,
  validateContactPersistenceProject,
} from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import {
  createCandidateUiComponent,
  openCandidateUiSession,
} from '../expansion-drafts/candidate-existing-ui-adapter-v1.mjs';
import { openPortableEditorSession } from '../expansion-drafts/candidate-project-editor-integration-v1.mjs';

const clone = (value) => structuredClone(value);

function apply(session, command) {
  const result = session.apply({ ...command, revision: session.revision });
  assert.equal(result.ok, true, `${command.type}: ${result.code} ${JSON.stringify(result.details)}`);
  return result;
}

function addCandidateParts(session) {
  apply(session, {
    type: 'component.add',
    component: createCandidateUiComponent('reference.ground-v1', 'ground-reference-1'),
    position: { x: 0.18, y: 0.78 },
  });
  apply(session, {
    type: 'component.add',
    component: createCandidateUiComponent('switch.toggle-spst-v1', 'toggle-switch-1'),
    position: { x: 0.48, y: 0.78 },
  });
  apply(session, {
    type: 'component.add',
    component: createCandidateUiComponent('switch.changeover-spdt-v1', 'selector-1'),
    position: { x: 0.78, y: 0.78 },
  });
}

function completeCandidateWiring(session, { selectorB = 'board-1.5V' } = {}) {
  const endpoint = (text) => {
    const split = text.lastIndexOf('.');
    return { component: text.slice(0, split), pin: text.slice(split + 1) };
  };
  apply(session, {
    type: 'wire.branch', netId: 'net-ground-branch',
    endpoint: endpoint('ground-reference-1.REF'), junctionId: 'junction-ground-reference',
  });
  apply(session, {
    type: 'wire.branch', netId: 'net-ground-branch',
    endpoint: endpoint('toggle-switch-1.B'), junctionId: 'junction-toggle-ground',
  });
  apply(session, {
    type: 'wire.create', net: {
      id: 'net-toggle-d3', endpoints: [endpoint('toggle-switch-1.A'), endpoint('board-1.D3')],
    },
  });
  apply(session, {
    type: 'wire.branch', netId: 'net-ground-branch',
    endpoint: endpoint('selector-1.A'), junctionId: 'junction-selector-ground',
  });
  if (selectorB === 'board-1.5V') {
    apply(session, {
      type: 'wire.branch', netId: 'net-5v',
      endpoint: endpoint('selector-1.B'), junctionId: 'junction-selector-power',
    });
  } else {
    apply(session, {
      type: 'wire.create', net: {
        id: 'net-selector-floating', endpoints: [endpoint('selector-1.B'), endpoint(selectorB)],
      },
    });
  }
  apply(session, {
    type: 'wire.create', net: {
      id: 'net-selector-com', endpoints: [endpoint('selector-1.COM'), endpoint('board-1.D8')],
    },
  });
}

function assertNoDanglingReferences(project) {
  const componentIds = new Set(project.candidateCircuit.components.map((component) => component.id));
  const netIds = new Set(project.candidateCircuit.nets.map((net) => net.id));
  assert.deepEqual(Object.keys(project.candidateLayout.positions).sort(), [...componentIds].sort());
  for (const net of project.candidateCircuit.nets) {
    assert(net.endpoints.length >= 2, `${net.id} retained fewer than two endpoints`);
    for (const endpoint of net.endpoints) {
      assert(componentIds.has(endpoint.component), `${net.id} retained missing component ${endpoint.component}`);
    }
  }
  for (const junction of project.candidateCircuit.junctions) {
    assert(netIds.has(junction.net), `${junction.id} retained missing net ${junction.net}`);
  }
  for (const netId of Object.keys(project.candidateLayout.wireRoutes)) {
    assert(netIds.has(netId), `layout retained missing net ${netId}`);
  }
}

test('structurally valid candidate drafts save and reopen while Build remains blocked', () => {
  const created = createEditableContactDraft();
  assert.equal(created.ok, true);
  const opened = openPortableEditorSession(canonicalContactPersistenceDraftJson(created.project));
  assert.equal(opened.ok, true);
  assert.equal(opened.kind, 'candidate-project-v3');
  assert.deepEqual(opened.session.runnable, {
    ok: false, code: 'PROJECT_CONTACT_CANDIDATE_REQUIRED', details: [],
  });
  addCandidateParts(opened.session);
  assert.equal(opened.session.runnable.ok, false);
  assert.match(opened.session.runnable.code, /PROJECT_CONTACT_/u);

  const saved = opened.session.saveText();
  const validated = validateContactPersistenceDraft(JSON.parse(saved));
  assert.equal(validated.ok, true);
  assert.equal(validateContactPersistenceProject(JSON.parse(saved)).ok, false);
  const reopened = openCandidateUiSession(saved);
  assert.equal(reopened.ok, true);
  assert.equal(reopened.session.runnable.ok, false);
  assert.deepEqual(
    reopened.session.visualProject.circuit.components
      .filter((component) => component.type.startsWith('reference.') || component.type.startsWith('switch.'))
      .map((component) => component.type).sort(),
    ['reference.ground-v1', 'switch.changeover-spdt-v1', 'switch.toggle-spst-v1'],
  );
});

test('candidate add and wire commands transition one draft into a strict runnable projection', () => {
  const opened = openPortableEditorSession(canonicalContactPersistenceDraftJson(createEditableContactDraft().project));
  addCandidateParts(opened.session);
  completeCandidateWiring(opened.session);
  assert.deepEqual(opened.session.runnable, { ok: true, code: 'OK', details: [] });
  assert.equal(validateContactPersistenceProject(JSON.parse(opened.session.saveText())).ok, true);

  const runtime = opened.session.runtimeProject;
  assert(runtime.circuit.components.some(
    (component) => component.id === 'toggle-switch-1' && component.type === 'button.momentary-v1',
  ));
  assert(!runtime.circuit.components.some((component) => component.id === 'selector-1'));
  assert(!runtime.circuit.components.some((component) => component.id === 'ground-reference-1'));
  const selector = opened.session.evaluateSpdtRuntime('selector-1');
  assert.equal(selector.ok, true);
  assert.equal(selector.projection.boardPin, 'D8');
  assert.equal(selector.projection.level, false);
});

test('unsafe shorts reject atomically while high-impedance throws remain saved but unrunnable', () => {
  const shortSession = openPortableEditorSession(
    canonicalContactPersistenceDraftJson(createEditableContactDraft().project),
  ).session;
  apply(shortSession, {
    type: 'component.add',
    component: createCandidateUiComponent('reference.ground-v1', 'ground-reference-1'),
    position: { x: 0.2, y: 0.8 },
  });
  const before = shortSession.saveText();
  const rejected = shortSession.apply({
    type: 'wire.branch', netId: 'net-5v',
    endpoint: { component: 'ground-reference-1', pin: 'REF' },
    junctionId: 'junction-illegal-short', revision: shortSession.revision,
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'PROJECT_CONTACT_POWER_SHORT');
  assert.equal(shortSession.saveText(), before);

  const highZ = openPortableEditorSession(
    canonicalContactPersistenceDraftJson(createEditableContactDraft().project),
  ).session;
  addCandidateParts(highZ);
  completeCandidateWiring(highZ, { selectorB: 'board-1.D9' });
  assert.equal(highZ.runnable.ok, false);
  assert.equal(highZ.runnable.code, 'CANDIDATE_UI_RUNTIME_UNSUPPORTED');
  assert.equal(validateContactPersistenceDraft(JSON.parse(highZ.saveText())).ok, true);
  assert.throws(() => highZ.runtimeProject, /CANDIDATE_UI_RUNTIME_UNSUPPORTED/u);
});

test('unknown components profiles and malformed draft shape remain fail-closed', () => {
  const draft = createEditableContactDraft().project;
  const unknown = clone(draft);
  unknown.candidateCircuit.components.push({
    id: 'unknown-1', type: 'unknown.part-v1', label: 'Unknown', properties: {}, controls: {},
  });
  unknown.candidateLayout.positions['unknown-1'] = { x: 0.5, y: 0.5, rotation: 0 };
  assert.equal(validateContactPersistenceDraft(unknown).code, 'PROJECT_CONTACT_UNKNOWN_COMPONENT');

  const profile = clone(draft);
  profile.project.controller.profile = 'board.future-v1';
  assert.equal(validateContactPersistenceDraft(profile).code, 'PROJECT_CONTACT_PROJECT_V3_CONTROLLER_UNSUPPORTED');

  const malformed = clone(draft);
  malformed.candidateCircuit.nets.push({ id: 'net-bad', endpoints: [{ component: 'board-1', pin: 'D8' }] });
  assert.equal(validateContactPersistenceDraft(malformed).code, 'PROJECT_CONTACT_NET');
});

test('project-v2 open and canonical save remain byte-compatible', () => {
  const draft = createEditableContactDraft().project;
  const v2 = {
    schema: 'teach-lab-project@2',
    metadata: clone(draft.project.metadata),
    boardProfile: draft.project.controller.profile,
    source: clone(draft.project.source),
    circuit: clone(draft.project.circuit),
    layout: clone(draft.project.layout),
    instruments: clone(draft.project.instruments),
    build: { status: 'dirty', inputIdentity: null, artifactIdentity: null },
  };
  const source = JSON.stringify(v2);
  const opened = openPortableEditorSession(source);
  assert.equal(opened.ok, true);
  assert.equal(opened.kind, 'project-v2');
  assert.equal(opened.session.saveText(), source);
});

test('connected candidate deletion becomes a canonical draft and undo restores exact routes and contact state', () => {
  const session = openPortableEditorSession(
    canonicalContactPersistenceDraftJson(createEditableContactDraft().project),
  ).session;
  addCandidateParts(session);
  completeCandidateWiring(session);
  apply(session, {
    type: 'component.control.set', componentId: 'toggle-switch-1', key: 'closed', value: true,
  });
  apply(session, {
    type: 'component.control.set', componentId: 'selector-1', key: 'selectedThrow', value: 'B',
  });
  const runnable = session.saveText();

  const removed = apply(session, { type: 'component.remove', componentId: 'selector-1' });
  assert.equal(removed.changeRelevance, 'build');
  assert.equal(removed.runnable.ok, true);
  const partial = session.saveText();
  const partialProject = JSON.parse(partial);
  assert(!partialProject.candidateCircuit.components.some((component) => component.id === 'selector-1'));
  assert(!partialProject.candidateCircuit.nets.some(
    (net) => net.endpoints.some((endpoint) => endpoint.component === 'selector-1'),
  ));
  assertNoDanglingReferences(partialProject);
  const reopened = openCandidateUiSession(partial);
  assert.equal(reopened.ok, true);
  assert.equal(reopened.session.runnable.ok, true);
  assert.equal(reopened.session.saveText(), partial);

  const undone = apply(session, { type: 'undo' });
  assert.equal(undone.changeRelevance, 'build');
  assert.equal(session.saveText(), runnable);
  assert.equal(session.runnable.ok, true);
  assert.equal(session.evaluateSpdtRuntime('selector-1').projection.level, true);
  assert.equal(session.visualProject.circuit.components.find(
    (component) => component.id === 'toggle-switch-1',
  ).controls.closed, true);

  const redone = apply(session, { type: 'redo' });
  assert.equal(redone.changeRelevance, 'build');
  assert.equal(session.saveText(), partial);
  assertNoDanglingReferences(JSON.parse(session.saveText()));
  apply(session, { type: 'undo' });
  assert.equal(session.saveText(), runnable);
});

test('whole-wire and branch deletion are canonical drafts with exact topology undo', () => {
  const session = openPortableEditorSession(
    canonicalContactPersistenceDraftJson(createEditableContactDraft().project),
  ).session;
  addCandidateParts(session);
  completeCandidateWiring(session);
  apply(session, {
    type: 'component.control.set', componentId: 'selector-1', key: 'selectedThrow', value: 'B',
  });
  const runnable = session.saveText();

  const wireDeleted = apply(session, { type: 'wire.delete', netId: 'net-selector-com' });
  assert.equal(wireDeleted.changeRelevance, 'build');
  assert.equal(wireDeleted.runnable.ok, false);
  assert(!JSON.parse(session.saveText()).candidateCircuit.nets.some((net) => net.id === 'net-selector-com'));
  assertNoDanglingReferences(JSON.parse(session.saveText()));
  const wireUndo = apply(session, { type: 'undo' });
  assert.equal(wireUndo.changeRelevance, 'build');
  assert.equal(session.saveText(), runnable);

  const branchDeleted = apply(session, {
    type: 'wire.branch.delete', netId: 'net-5v', endpoint: { component: 'selector-1', pin: 'B' },
  });
  assert.equal(branchDeleted.changeRelevance, 'build');
  assert.equal(branchDeleted.runnable.ok, false);
  assertNoDanglingReferences(JSON.parse(session.saveText()));
  const branchUndo = apply(session, { type: 'undo' });
  assert.equal(branchUndo.changeRelevance, 'build');
  assert.equal(session.saveText(), runnable);
});
