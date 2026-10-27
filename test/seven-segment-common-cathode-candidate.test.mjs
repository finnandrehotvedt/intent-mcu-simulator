// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { COMPONENT_CATALOG } from '../src/component-catalog.mjs';
import { CircuitRuntime, createComponent } from '../src/circuit-engine.mjs';
import {
  canonicalContactPersistenceDraftJson,
} from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import {
  AVR_SEVEN_SEGMENT_PINS,
  SEVEN_SEGMENT_DEFINITION,
  SEVEN_SEGMENT_DIGITS,
  SEVEN_SEGMENT_TYPE,
  createSevenSegmentComponent,
  validateSevenSegmentDefinition,
} from '../expansion-drafts/seven-segment-common-cathode-v1.mjs';
import {
  CANDIDATE_UI_COMPONENTS,
  createCandidateUiComponent,
  openCandidateUiSession,
} from '../src/candidate-existing-ui-adapter.mjs';
import { openPortableEditorSession } from '../src/candidate-project-session.mjs';

const SEGMENTS = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
const OUTPUT_PINS = Object.freeze(['D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9']);

function openSession() {
  const draft = createEditableContactDraft();
  assert.equal(draft.ok, true);
  const opened = openPortableEditorSession(canonicalContactPersistenceDraftJson(draft.project));
  assert.equal(opened.ok, true);
  return opened.session;
}

function apply(session, command) {
  const result = session.apply({ ...command, revision: session.revision });
  assert.equal(result.ok, true, `${command.type}: ${result.code} ${JSON.stringify(result.details)}`);
  return result;
}

function addDisplay(session, { ohms = 220, resistors = true } = {}) {
  apply(session, {
    type: 'component.add',
    component: createSevenSegmentComponent('seven-segment-1', 'Workshop digit'),
    position: { x: 0.74, y: 0.66 },
  });
  if (!resistors) return;
  SEGMENTS.forEach((segment, index) => apply(session, {
    type: 'component.add',
    component: createComponent(`resistor-${index + 3}`, 'resistor.fixed-v1', {
      label: `Segment ${segment} resistor`, properties: { ohms },
    }),
    position: { x: 0.4 + (index % 4) * 0.1, y: 0.48 + Math.floor(index / 4) * 0.1 },
  }));
}

function wireCommon(session, netId = 'net-ground-branch') {
  apply(session, {
    type: 'wire.branch', netId,
    endpoint: { component: 'seven-segment-1', pin: 'COM' },
    junctionId: 'junction-seven-common',
  });
}

function wireSegment(session, segment, resistorId, sourcePin) {
  apply(session, {
    type: 'wire.create',
    net: {
      id: `net-seven-${segment}-anode`,
      endpoints: [
        { component: 'seven-segment-1', pin: segment },
        { component: resistorId, pin: 'B' },
      ],
    },
  });
  apply(session, {
    type: 'wire.create',
    net: {
      id: `net-seven-${segment}-output`,
      endpoints: [
        { component: resistorId, pin: 'A' },
        { component: 'board-1', pin: sourcePin },
      ],
    },
  });
}

function wireAllSegments(session, pins = OUTPUT_PINS) {
  SEGMENTS.forEach((segment, index) => wireSegment(
    session, segment, `resistor-${index + 3}`, pins[index],
  ));
}

test('single-digit seven-segment display is an original explicit eight-terminal contract', () => {
  assert.equal(validateSevenSegmentDefinition(), true);
  assert.equal(SEVEN_SEGMENT_DEFINITION.type, SEVEN_SEGMENT_TYPE);
  assert.deepEqual(SEVEN_SEGMENT_DEFINITION.pins.map((pin) => pin.id), [
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'COM',
  ]);
  assert.deepEqual(AVR_SEVEN_SEGMENT_PINS, [
    'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13',
  ]);
  assert.deepEqual(SEVEN_SEGMENT_DIGITS[2], ['a', 'b', 'd', 'e', 'g']);
  assert.match(SEVEN_SEGMENT_DEFINITION.artwork.provenance, /Original IntentForce SVG/u);
  assert.match(SEVEN_SEGMENT_DEFINITION.support.limitations.join(' '), /dedicated external series resistor/u);
  assert.match(SEVEN_SEGMENT_DEFINITION.support.limitations.join(' '), /No decimal point, multiplexing, driver IC/u);
  assert(!Object.hasOwn(COMPONENT_CATALOG, SEVEN_SEGMENT_TYPE));
  assert.equal(Object.values(COMPONENT_CATALOG).length, 6);
  assert.equal(Object.values(COMPONENT_CATALOG).filter((definition) => definition.selectable).length, 5);
  assert.equal(Object.values(CANDIDATE_UI_COMPONENTS).filter((definition) => definition.selectable).length, 44);
  assert.equal(5 + Object.values(CANDIDATE_UI_COMPONENTS).filter((definition) => definition.selectable).length, 49);
  assert.deepEqual(createCandidateUiComponent(SEVEN_SEGMENT_TYPE, 'seven-segment-2'), {
    id: 'seven-segment-2', type: SEVEN_SEGMENT_TYPE,
    label: 'Single-digit seven-segment display', properties: {}, controls: {},
  });
});

test('COM and a through g advance one deterministic draft diagnostic', () => {
  const session = openSession();
  addDisplay(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_SEVEN_SEGMENT_COMMON_DISCONNECTED');
  wireCommon(session);
  for (const [index, segment] of SEGMENTS.entries()) {
    assert.equal(session.runnable.code, `PROJECT_CONTACT_SEVEN_SEGMENT_${segment.toUpperCase()}_DISCONNECTED`);
    wireSegment(session, segment, `resistor-${index + 3}`, OUTPUT_PINS[index]);
  }
  assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
});

test('missing resistors, reversed polarity, segment shorts and unsupported outputs fail closed', () => {
  const direct = openSession();
  addDisplay(direct, { resistors: false });
  wireCommon(direct);
  apply(direct, {
    type: 'wire.create', net: {
      id: 'net-seven-direct', endpoints: [
        { component: 'seven-segment-1', pin: 'a' }, { component: 'board-1', pin: 'D3' },
      ],
    },
  });
  assert.equal(direct.runnable.code, 'PROJECT_CONTACT_SEVEN_SEGMENT_A_CURRENT_LIMIT_REQUIRED');

  const reversed = openSession();
  addDisplay(reversed);
  wireCommon(reversed, 'net-5v');
  assert.equal(reversed.runnable.code, 'PROJECT_CONTACT_SEVEN_SEGMENT_REVERSE_POLARITY');

  const shorted = openSession();
  addDisplay(shorted); wireCommon(shorted);
  apply(shorted, {
    type: 'wire.branch', netId: 'net-ground-branch',
    endpoint: { component: 'seven-segment-1', pin: 'a' },
    junctionId: 'junction-seven-short',
  });
  assert.equal(shorted.runnable.code, 'PROJECT_CONTACT_SEVEN_SEGMENT_SEGMENT_SHORT');

  const unsupported = openSession();
  addDisplay(unsupported); wireCommon(unsupported);
  wireSegment(unsupported, 'a', 'resistor-3', 'D1');
  assert.equal(unsupported.runnable.code, 'PROJECT_CONTACT_SEVEN_SEGMENT_A_UNSUPPORTED_OUTPUT');

  const beforePowerShort = unsupported.saveText();
  const rejected = unsupported.apply({
    type: 'wire.branch', revision: unsupported.revision, netId: 'net-5v',
    endpoint: { component: 'board-1', pin: 'GND2' }, junctionId: 'junction-power-short',
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'PROJECT_CONTACT_POWER_SHORT');
  assert.equal(unsupported.saveText(), beforePowerShort);
});

test('unsafe resistor values remain editable but cannot produce a runnable display', () => {
  const session = openSession();
  addDisplay(session, { ohms: 100 });
  wireCommon(session);
  wireAllSegments(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_LED_OVERCURRENT');
});

test('accepted display reuses seven LED models and maps the compiled digit-two pattern', () => {
  const session = openSession();
  addDisplay(session); wireCommon(session); wireAllSegments(session);
  assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
  const support = session.runtimeSupport.find((item) => item.componentId === 'seven-segment-1');
  assert.equal(support.runtimeAdapter, 'seven-independent-led.basic-v1');
  assert.equal(support.runtimeProjection.electricalModel, 'seven-independent-current-limited-led-channels');
  assert.equal(support.runtimeProjection.displayModel, 'ideal-commanded-seven-segment-pattern-only');
  assert.deepEqual(Object.fromEntries(Object.entries(support.runtimeProjection.segments).map(
    ([segment, record]) => [segment, [record.sourcePin, record.resistorId]],
  )), Object.fromEntries(SEGMENTS.map((segment, index) => [
    segment, [OUTPUT_PINS[index], `resistor-${index + 3}`],
  ])));
  const projectedIds = Object.values(support.runtimeProjection.segments).map(
    (segment) => segment.runtimeComponentId,
  );
  const runtimeProject = session.runtimeProject;
  assert.deepEqual(projectedIds.map((id) => runtimeProject.circuit.components.find(
    (component) => component.id === id,
  ).type), Array(7).fill('led.basic-v1'));
  assert(projectedIds.every((id) => runtimeProject.layout.positions[id].x === 0.74));

  const digitTwo = new Set(SEVEN_SEGMENT_DIGITS[2]);
  const runtime = new CircuitRuntime(runtimeProject.circuit);
  const observation = runtime.observe({
    digitalPins: Object.fromEntries(SEGMENTS.map((segment, index) => [
      OUTPUT_PINS[index], digitTwo.has(segment),
    ])),
  });
  assert.deepEqual(projectedIds.map((id) => observation.leds.find(
    (led) => led.componentId === id,
  ).on), [true, true, false, true, true, false, true]);
});

test('save/open, movement and connected delete/undo preserve the exact display project', () => {
  const session = openSession();
  addDisplay(session); wireCommon(session); wireAllSegments(session);
  apply(session, { type: 'component.move', componentId: 'seven-segment-1', x: 0.69, y: 0.61 });
  const before = session.saveText();
  const reopened = openCandidateUiSession(before);
  assert.equal(reopened.ok, true);
  assert.equal(reopened.session.runnable.ok, true);
  assert.deepEqual(reopened.session.visualProject.layout.positions['seven-segment-1'], {
    x: 0.69, y: 0.61, rotation: 0,
  });
  assert.equal(reopened.session.runtimeSupport.find(
    (item) => item.componentId === 'seven-segment-1',
  ).runtimeProjection.segments.g.sourcePin, 'D9');

  const removed = apply(session, { type: 'component.remove', componentId: 'seven-segment-1' });
  assert.equal(removed.changeRelevance, 'build');
  assert(!JSON.parse(session.saveText()).candidateCircuit.nets.some(
    (net) => net.endpoints.some((endpoint) => endpoint.component === 'seven-segment-1'),
  ));
  const undone = apply(session, { type: 'undo' });
  assert.equal(undone.changeRelevance, 'build');
  assert.equal(session.saveText(), before);
});
