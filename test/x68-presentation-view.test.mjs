// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESENTATION_DRAFT_SCHEMA,
  PRESENTATION_INSTRUMENTS,
  PRESENTATION_LIMITS,
  PRESENTATION_PROFILE,
  createPresentationViewOwner,
  normalizePresentationDraft,
  parsePresentationDraft,
} from '../src/presentation-view.mjs';

const draft = () => ({ schema: PRESENTATION_DRAFT_SCHEMA, profileId: PRESENTATION_PROFILE,
  selectedInstrumentIds: ['recorded-evidence', 'serial-output'],
  steps: [
    { id: 'observe-inputs', title: 'Observe inputs', text: 'Read the current owner-provided labels.' },
    { id: 'compare-output', title: 'Compare output', text: 'Move forward manually; no test is executed.' },
  ] });

test('X68 accepts one bounded plain-text AVR thermostat presentation draft', () => {
  const value = normalizePresentationDraft(draft());
  assert.equal(value.schema, PRESENTATION_DRAFT_SCHEMA);
  assert.deepEqual(value.selectedInstrumentIds, ['recorded-evidence', 'serial-output']);
  assert.equal(value.steps.length, 2);
  assert(Object.isFrozen(value)); assert(Object.isFrozen(value.steps));
  assert.equal(PRESENTATION_INSTRUMENTS.length, PRESENTATION_LIMITS.instruments);
});

test('X68 rejects unknown fields, duplicate IDs, unknown instruments, markup and bounds', () => {
  assert.throws(() => normalizePresentationDraft({ ...draft(), executable: true }), /PRESENTATION_DRAFT_SHAPE/u);
  const duplicateInstrument = draft(); duplicateInstrument.selectedInstrumentIds[1] = 'recorded-evidence';
  assert.throws(() => normalizePresentationDraft(duplicateInstrument), /PRESENTATION_INSTRUMENT_DUPLICATE/u);
  const unknown = draft(); unknown.selectedInstrumentIds = ['runtime-owner-path'];
  assert.throws(() => normalizePresentationDraft(unknown), /PRESENTATION_INSTRUMENT_UNKNOWN/u);
  const duplicateStep = draft(); duplicateStep.steps[1].id = duplicateStep.steps[0].id;
  assert.throws(() => normalizePresentationDraft(duplicateStep), /PRESENTATION_STEP_SHAPE/u);
  const markup = draft(); markup.steps[0].text = '<script>run()</script>';
  assert.throws(() => normalizePresentationDraft(markup), /PRESENTATION_STEP_TEXT/u);
  const oversized = draft(); oversized.steps = Array.from({ length: 13 }, (_, index) => ({
    id: `step-${index}`, title: 'Step', text: 'Text',
  }));
  assert.throws(() => normalizePresentationDraft(oversized), /PRESENTATION_STEP_LIMIT/u);
  assert.throws(() => parsePresentationDraft('{"schema":"intent-mcu-presentation-draft@1","schema":"x"}'),
    /DUPLICATE_KEY/u);
});

test('X68 progression is manual view state and binding invalidation closes atomically', () => {
  const owner = createPresentationViewOwner();
  const opened = owner.open(draft(), 'avr-project-revision-7');
  assert.equal(opened.selectedStep, 0); assert.equal(opened.step.id, 'observe-inputs');
  assert(Object.values(opened.authority).every((value) => value === false));
  assert.equal(owner.next().step.id, 'compare-output');
  assert.equal(owner.next().step.id, 'compare-output');
  assert.equal(owner.previous().step.id, 'observe-inputs');
  assert.equal(owner.invalidate('avr-project-revision-7'), false);
  assert.equal(owner.snapshot().active, true);
  assert.equal(owner.invalidate('avr-project-revision-8'), true);
  assert.deepEqual(owner.snapshot(), { active: false, draft: null, selectedStep: null, step: null,
    binding: null, authority: { apply: false, build: false, run: false, scenario: false, runtime: false,
      verdict: false } });
});
