// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AVR_FOUR_DIGIT_SEVEN_SEGMENT_PINS,
  FOUR_DIGIT_SEVEN_SEGMENT_DEFINITION,
  FOUR_DIGIT_SEVEN_SEGMENT_MODEL,
  FOUR_DIGIT_SEVEN_SEGMENT_RENDERER,
  FOUR_DIGIT_SEVEN_SEGMENT_TYPE,
  createFourDigitSevenSegmentComponent,
  projectFourDigitSevenSegmentDisplays,
  validateFourDigitSevenSegmentDefinition,
} from '../expansion-drafts/seven-segment-four-digit-common-cathode-v1.mjs';
import { createFourDigitSevenSegmentArtwork } from '../expansion-drafts/seven-segment-four-digit-common-cathode-artwork-v1.mjs';
import { createAvrReferenceStarter } from '../src/avr-reference-starters.mjs';
import { CANDIDATE_UI_COMPONENTS, createCandidateUiComponent, openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { COMPONENT_SUPPORT_CELLS } from '../src/component-support-matrix.mjs';
import { CURRENT_MODEL_LIBRARY_IMPLEMENTATION } from '../src/model-library-current-resolver.mjs';
import { CURRENT_MODEL_LIBRARY_MANIFEST } from '../src/model-library-snapshots.mjs';

class Node {
  constructor(name) { this.name = name; this.attributes = {}; this.children = []; this.textContent = ''; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  append(...children) { this.children.push(...children); }
}

const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
const DIGITS = ['DIG1', 'DIG2', 'DIG3', 'DIG4'];

test('CMP-043 owns one immutable distinct twelve-terminal four-digit contract and original artwork', () => {
  assert.equal(validateFourDigitSevenSegmentDefinition(), true);
  assert.equal(Object.isFrozen(FOUR_DIGIT_SEVEN_SEGMENT_DEFINITION), true);
  assert.equal(FOUR_DIGIT_SEVEN_SEGMENT_DEFINITION.modelRef, FOUR_DIGIT_SEVEN_SEGMENT_MODEL);
  assert.equal(FOUR_DIGIT_SEVEN_SEGMENT_DEFINITION.artwork.renderer, FOUR_DIGIT_SEVEN_SEGMENT_RENDERER);
  assert.deepEqual(FOUR_DIGIT_SEVEN_SEGMENT_DEFINITION.pins.map(({ id }) => id), [
    ...SEGMENTS, ...DIGITS,
  ]);
  assert.deepEqual(AVR_FOUR_DIGIT_SEVEN_SEGMENT_PINS, [
    'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13',
  ]);
  assert.equal(CANDIDATE_UI_COMPONENTS[FOUR_DIGIT_SEVEN_SEGMENT_TYPE],
    FOUR_DIGIT_SEVEN_SEGMENT_DEFINITION);
  assert.deepEqual(createCandidateUiComponent(FOUR_DIGIT_SEVEN_SEGMENT_TYPE, 'display-2'),
    createFourDigitSevenSegmentComponent('display-2'));

  const documentObject = { createElementNS: (_namespace, name) => new Node(name) };
  const svg = createFourDigitSevenSegmentArtwork(documentObject,
    FOUR_DIGIT_SEVEN_SEGMENT_DEFINITION,
    createFourDigitSevenSegmentComponent('display-1', 'Workshop counter'));
  assert.equal(svg.attributes['data-artwork-key'], FOUR_DIGIT_SEVEN_SEGMENT_RENDERER);
  assert.deepEqual(svg.children.filter((item) => item.attributes['data-terminal-pin'])
    .map((item) => item.attributes['data-terminal-pin']), [...SEGMENTS, ...DIGITS]);
  assert.equal(svg.children.filter((item) => item.attributes['data-four-digit-segment']).length, 32);
});

test('CMP-043 starter projects eight shared current-limited channels and four active-low selects', () => {
  const starter = createAvrReferenceStarter('avr-four-digit-seven-segment');
  const opened = openCandidateUiSession(starter.text);
  assert.equal(opened.ok, true, opened.code);
  assert.deepEqual(opened.session.runnable, { ok: true, code: 'OK', details: [] });
  const support = opened.session.runtimeSupport.find(
    ({ type }) => type === FOUR_DIGIT_SEVEN_SEGMENT_TYPE,
  );
  assert(support?.runtimeProjection);
  assert.deepEqual(Object.fromEntries(Object.entries(support.runtimeProjection.segments)
    .map(([segment, value]) => [segment, value.sourcePin])), Object.fromEntries(
    SEGMENTS.map((segment, index) => [segment, `D${index + 2}`]),
  ));
  assert.deepEqual(Object.fromEntries(Object.entries(support.runtimeProjection.digits)
    .map(([digit, value]) => [digit, [value.sourcePin, value.activeLevel]])), {
    DIG1: ['D10', 'LOW'], DIG2: ['D11', 'LOW'], DIG3: ['D12', 'LOW'], DIG4: ['D13', 'LOW'],
  });
  const runtimeIds = Object.values(support.runtimeProjection.segments)
    .map(({ runtimeComponentId }) => runtimeComponentId);
  assert.deepEqual(runtimeIds.map((id) => opened.session.runtimeProject.circuit.components
    .find((component) => component.id === id)?.type), Array(8).fill('led.basic-v1'));
});

test('CMP-043 fails closed for missing current limiting, repeated GPIO and malformed state', () => {
  const project = createAvrReferenceStarter('avr-four-digit-seven-segment').project.candidateCircuit;
  const missingResistor = structuredClone(project);
  missingResistor.components = missingResistor.components.filter(
    ({ id }) => id !== 'four-digit-resistor-1',
  );
  missingResistor.nets = missingResistor.nets.filter(({ endpoints }) => !endpoints.some(
    ({ component }) => component === 'four-digit-resistor-1',
  ));
  assert.match(projectFourDigitSevenSegmentDisplays(missingResistor).code,
    /^FOUR_DIGIT_SEVEN_SEGMENT_A_/u);

  const repeated = structuredClone(project);
  repeated.nets.find(({ id }) => id === 'net-starter-four-digit-select-4')
    .endpoints.find(({ component }) => component === 'board-1').pin = 'D12';
  assert.equal(projectFourDigitSevenSegmentDisplays(repeated).code,
    'FOUR_DIGIT_SEVEN_SEGMENT_INDEPENDENT_OUTPUTS_REQUIRED');

  const malformed = structuredClone(project);
  malformed.components.find(({ type }) => type === FOUR_DIGIT_SEVEN_SEGMENT_TYPE)
    .controls.extra = true;
  assert.deepEqual(projectFourDigitSevenSegmentDisplays(malformed), {
    ok: false, code: 'FOUR_DIGIT_SEVEN_SEGMENT_STATE', details: ['four-digit-seven-segment-1'],
  });
});

test('CMP-043 has one manifest-owned simulated AVR cell and no narrow-profile claim', () => {
  const cells = COMPONENT_SUPPORT_CELLS.filter(
    ({ model }) => model === FOUR_DIGIT_SEVEN_SEGMENT_TYPE,
  );
  assert.equal(cells.length, 4);
  assert.deepEqual(cells.map(({ available }) => available), [true, false, false, false]);
  assert.equal(cells[0].status, 'simulated');
  assert.equal(cells[0].reference.starters[0], 'avr-four-digit-seven-segment');
  assert(cells.slice(1).every(({ limitations }) => /does not yet admit/u.test(limitations[0])));
  const entries = CURRENT_MODEL_LIBRARY_MANIFEST.entries.filter(
    ({ componentType }) => componentType === FOUR_DIGIT_SEVEN_SEGMENT_TYPE,
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0].profile, 'board.atmega328p-16mhz-v1');
});

test('CMP-043 production observer preserves exact canonical digit state and rejects malformed values', () => {
  assert.deepEqual(CURRENT_MODEL_LIBRARY_IMPLEMENTATION.observeFourDigitSevenSegment(
    ['bc', 'abdeg', 'abcdg', 'bcfg'], [false, false, false, false],
  ), { digits: ['bc', 'abdeg', 'abcdg', 'bcfg'], decimalPoints: [false, false, false, false] });
  assert.deepEqual(CURRENT_MODEL_LIBRARY_IMPLEMENTATION.evaluateProduction(
    FOUR_DIGIT_SEVEN_SEGMENT_TYPE,
    { digits: ['bc', 'abdeg', 'abcdg', 'bcfg'], decimalPoints: [false, false, false, false] },
  ), { ok: true, code: 'OK', result: {
    digits: ['bc', 'abdeg', 'abcdg', 'bcfg'], decimalPoints: [false, false, false, false],
  } });
  assert.equal(CURRENT_MODEL_LIBRARY_IMPLEMENTATION.evaluateProduction(
    FOUR_DIGIT_SEVEN_SEGMENT_TYPE,
    { digits: ['cb', 'abdeg', 'abcdg', 'bcfg'], decimalPoints: [false, false, false, false] },
  ).code, 'MODEL_LIBRARY_PRODUCTION_INPUT');
});
