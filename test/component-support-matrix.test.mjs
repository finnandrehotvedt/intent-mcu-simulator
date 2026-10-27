// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  COMPONENT_SUPPORT_CELLS, COMPONENT_SUPPORT_MODELS, COMPONENT_SUPPORT_PROFILES,
  componentReferenceInventory, componentSupportSummary,
} from '../src/component-support-matrix.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import {
  candidateContactControl, candidateRuntimeInputs, createCandidateUiComponent, openCandidateUiSession,
} from '../src/candidate-existing-ui-adapter.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const endpoint = (component, pin) => ({ component, pin });

function apply(session, command) {
  const result = session.apply({ ...command, revision: session.revision });
  assert.equal(result.ok, true, `${command.type}: ${result.code} ${JSON.stringify(result.details)}`);
  return result;
}

function encoderSession({ phaseB = 'D3', common = 'GND2' } = {}) {
  const opened = openCandidateUiSession(canonicalContactPersistenceDraftJson(createEditableContactDraft().project));
  assert.equal(opened.ok, true);
  const { session } = opened;
  apply(session, { type: 'component.remove', componentId: 'button-1' });
  apply(session, {
    type: 'component.add', component: createCandidateUiComponent('input.rotary-encoder-quadrature-v1', 'encoder-1'),
    position: { x: 0.72, y: 0.64 },
  });
  apply(session, { type: 'wire.create', net: { id: 'net-encoder-a', endpoints: [endpoint('encoder-1', 'A'), endpoint('board-1', 'D2')] } });
  apply(session, { type: 'wire.create', net: { id: 'net-encoder-b', endpoints: [endpoint('encoder-1', 'B'), endpoint('board-1', phaseB)] } });
  if (common) apply(session, { type: 'wire.create', net: { id: 'net-encoder-com', endpoints: [endpoint('encoder-1', 'COM'), endpoint('board-1', common)] } });
  return session;
}

test('public component matrix separates executable and authoring-only support across 78 by 4 cells', () => {
  assert.equal(COMPONENT_SUPPORT_MODELS.length, 78);
  assert.equal(COMPONENT_SUPPORT_PROFILES.length, 4);
  assert.equal(COMPONENT_SUPPORT_CELLS.length, 312);
  assert.equal(COMPONENT_SUPPORT_CELLS.filter((cell) => cell.available).length, 67);
  assert.equal(COMPONENT_SUPPORT_CELLS.filter((cell) => !cell.available).length, 245);
  assert.equal(COMPONENT_SUPPORT_CELLS.filter((cell) => cell.authoringAvailable).length, 131);
  assert.equal(COMPONENT_SUPPORT_CELLS.filter((cell) => cell.status === 'simulated').length, 40);
  assert.equal(COMPONENT_SUPPORT_CELLS.filter((cell) => cell.status === 'partial').length, 27);
  assert.equal(COMPONENT_SUPPORT_CELLS.filter((cell) => cell.status === 'visual').length, 64);
  assert.deepEqual(componentSupportSummary(AVR), {
    profile: AVR, total: 78, available: 58, authoringAvailable: 71, executableAvailable: 58,
    simulated: 34, partial: 24, visual: 13, unavailable: 7,
  });
  for (const profile of COMPONENT_SUPPORT_PROFILES.filter((item) => item.id !== AVR)) {
    assert.deepEqual(componentSupportSummary(profile.id), {
      profile: profile.id, total: 78, available: 3, authoringAvailable: 20, executableAvailable: 3,
      simulated: 2, partial: 1, visual: 17, unavailable: 58,
    });
  }
  const avr = COMPONENT_SUPPORT_CELLS.filter((cell) => cell.profile === AVR && cell.available);
  assert.equal(avr.filter((cell) => cell.projectMode === 'project-v2-and-candidate-v3').length, 5);
  assert.equal(avr.filter((cell) => cell.projectMode === 'candidate-v3-only').length, 53);
  assert(COMPONENT_SUPPORT_CELLS.filter((cell) => !cell.available).every((cell) => cell.limitations[0]));
});

test('every available cell has tracked evidence and a public reference starter', () => {
  const inventory = componentReferenceInventory();
  assert.equal(inventory.length, 67);
  assert(inventory.every((item) => item.hasTrackedTests));
  for (const item of inventory) for (const path of item.tests) assert(existsSync(path), path);
  assert.equal(inventory.filter((item) => !item.hasPositiveReference).length, 0);
  assert(inventory.every((item) => item.starters.length >= 1));
});

test('crawlable documentation contains one row for every public model', () => {
  const html = readFileSync('staging/components.html', 'utf8');
  const rows = [...html.matchAll(/<tr data-model="([^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual(rows.sort(), COMPONENT_SUPPORT_MODELS.map((model) => model.type).sort());
  assert.match(html, /67 executable cells, 64 additional authoring-only cells and 181 unavailable cells/u);
});

test('rotary encoder accepts exact D2 D3 ground wiring and emits deterministic worker sequences', () => {
  const session = encoderSession();
  assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
  assert.deepEqual(candidateRuntimeInputs(session).map(({ pinLabel, encoderPhase }) => ({ pinLabel, encoderPhase })), [
    { pinLabel: 'D2', encoderPhase: 'A' }, { pinLabel: 'D3', encoderPhase: 'B' },
  ]);
  const clockwise = candidateContactControl(session, 'encoder-1', 'detent', 1);
  assert.equal(clockwise.ok, true); assert.equal(clockwise.direction, 'cw');
  assert.equal(clockwise.worker.command, 'digital-sequence');
  assert.deepEqual(clockwise.worker.events, [
    { offsetCycles: 16_000, pin: 2, level: false }, { offsetCycles: 32_000, pin: 3, level: false },
    { offsetCycles: 48_000, pin: 2, level: true }, { offsetCycles: 64_000, pin: 3, level: true },
  ]);
  apply(session, clockwise.command);
  const counterclockwise = candidateContactControl(session, 'encoder-1', 'detent', 0);
  assert.equal(counterclockwise.ok, true); assert.equal(counterclockwise.direction, 'ccw');
  assert.deepEqual(counterclockwise.worker.events, [
    { offsetCycles: 16_000, pin: 3, level: false }, { offsetCycles: 32_000, pin: 2, level: false },
    { offsetCycles: 48_000, pin: 3, level: true }, { offsetCycles: 64_000, pin: 2, level: true },
  ]);
});

test('rotary encoder rejects wrong phase and common pins before runtime', () => {
  const wrongPhase = encoderSession({ phaseB: 'D4' });
  assert.equal(wrongPhase.runnable.ok, false);
  assert.match(wrongPhase.runnable.code, /ROTARY_ENCODER|CANDIDATE_UI_RUNTIME_UNSUPPORTED/u);
  assert.throws(() => candidateRuntimeInputs(wrongPhase), /ROTARY_ENCODER|CANDIDATE_UI_RUNTIME_UNSUPPORTED/u);
  const wrongCommon = encoderSession({ common: 'D4' });
  assert.equal(wrongCommon.runnable.ok, false);
  assert.match(wrongCommon.runnable.code, /ROTARY_ENCODER|POWER|GROUND|CANDIDATE_UI_RUNTIME_UNSUPPORTED/u);

  const poweredCommon = encoderSession({ common: null });
  apply(poweredCommon, {
    type: 'wire.branch', netId: 'net-5v', endpoint: endpoint('encoder-1', 'COM'),
    junctionId: 'junction-encoder-illegal-power',
  });
  assert.equal(poweredCommon.runnable.ok, false);
  assert.equal(poweredCommon.runnable.code, 'PROJECT_CONTACT_ROTARY_ENCODER_COM_REQUIRES_GROUND');
  assert.throws(() => candidateRuntimeInputs(poweredCommon), /PROJECT_CONTACT_ROTARY_ENCODER_COM_REQUIRES_GROUND/u);
});
