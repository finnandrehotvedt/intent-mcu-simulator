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
  AVR_PWM_PINS,
  COMMON_CATHODE_RGB_LED_DEFINITION,
  COMMON_CATHODE_RGB_LED_TYPE,
  createCommonCathodeRgbLedComponent,
  validateCommonCathodeRgbLedDefinition,
} from '../expansion-drafts/common-cathode-rgb-led-v1.mjs';
import {
  CANDIDATE_UI_COMPONENTS,
  createCandidateUiComponent,
  openCandidateUiSession,
} from '../src/candidate-existing-ui-adapter.mjs';
import { openPortableEditorSession } from '../src/candidate-project-session.mjs';

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

function addRgb(session, { ohms = 220, resistors = true } = {}) {
  apply(session, {
    type: 'component.add',
    component: createCommonCathodeRgbLedComponent('rgb-led-1', 'Workshop RGB indicator'),
    position: { x: 0.78, y: 0.7 },
  });
  if (!resistors) return;
  for (const [index, id] of ['resistor-3', 'resistor-4', 'resistor-5'].entries()) {
    apply(session, {
      type: 'component.add',
      component: createComponent(id, 'resistor.fixed-v1', {
        label: `RGB channel ${index + 1} resistor`, properties: { ohms },
      }),
      position: { x: 0.48, y: 0.58 + index * 0.1 },
    });
  }
}

function wireCommon(session, netId = 'net-ground-branch') {
  apply(session, {
    type: 'wire.branch', netId,
    endpoint: { component: 'rgb-led-1', pin: 'COM' },
    junctionId: 'junction-rgb-common',
  });
}

function wireChannel(session, {
  channel, resistorId, sourcePin, suffix = channel.toLowerCase(),
}) {
  apply(session, {
    type: 'wire.create',
    net: {
      id: `net-rgb-${suffix}-anode`,
      endpoints: [
        { component: 'rgb-led-1', pin: channel },
        { component: resistorId, pin: 'B' },
      ],
    },
  });
  apply(session, {
    type: 'wire.create',
    net: {
      id: `net-rgb-${suffix}-pwm`,
      endpoints: [
        { component: resistorId, pin: 'A' },
        { component: 'board-1', pin: sourcePin },
      ],
    },
  });
}

function wireAllChannels(session, pins = ['D3', 'D5', 'D6']) {
  for (const [index, channel] of ['R', 'G', 'B'].entries()) {
    wireChannel(session, {
      channel, resistorId: `resistor-${index + 3}`, sourcePin: pins[index],
    });
  }
}

test('common-cathode RGB LED is an original private four-terminal contract', () => {
  assert.equal(validateCommonCathodeRgbLedDefinition(), true);
  assert.equal(COMMON_CATHODE_RGB_LED_DEFINITION.type, COMMON_CATHODE_RGB_LED_TYPE);
  assert.deepEqual(COMMON_CATHODE_RGB_LED_DEFINITION.pins.map((pin) => pin.id), ['R', 'G', 'B', 'COM']);
  assert.deepEqual(AVR_PWM_PINS, ['D3', 'D5', 'D6', 'D9', 'D10', 'D11']);
  assert.match(COMMON_CATHODE_RGB_LED_DEFINITION.artwork.provenance, /Original IntentForce SVG/u);
  assert.match(COMMON_CATHODE_RGB_LED_DEFINITION.support.limitations.join(' '), /dedicated external series resistor/u);
  assert.match(COMMON_CATHODE_RGB_LED_DEFINITION.support.limitations.join(' '), /No wavelength/u);
  assert(!Object.hasOwn(COMPONENT_CATALOG, COMMON_CATHODE_RGB_LED_TYPE));
  assert.equal(Object.values(COMPONENT_CATALOG).length, 6);
  assert.equal(Object.values(COMPONENT_CATALOG).filter((definition) => definition.selectable).length, 5);
  assert.equal(Object.values(CANDIDATE_UI_COMPONENTS).filter((definition) => definition.selectable).length, 14);
  assert.equal(5 + Object.values(CANDIDATE_UI_COMPONENTS).filter((definition) => definition.selectable).length, 19);
  assert.deepEqual(createCandidateUiComponent(COMMON_CATHODE_RGB_LED_TYPE, 'rgb-led-2'), {
    id: 'rgb-led-2', type: COMMON_CATHODE_RGB_LED_TYPE,
    label: 'Common-cathode RGB LED', properties: {}, controls: {},
  });
});

test('each explicit terminal advances one deterministic draft diagnostic', () => {
  const session = openSession();
  addRgb(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_RGB_LED_COMMON_DISCONNECTED');
  wireCommon(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_RGB_LED_R_DISCONNECTED');
  wireChannel(session, { channel: 'R', resistorId: 'resistor-3', sourcePin: 'D3' });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_RGB_LED_G_DISCONNECTED');
  wireChannel(session, { channel: 'G', resistorId: 'resistor-4', sourcePin: 'D5' });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_RGB_LED_B_DISCONNECTED');
  wireChannel(session, { channel: 'B', resistorId: 'resistor-5', sourcePin: 'D6' });
  assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
});

test('missing current limiting, reversed polarity, channel shorts and unsupported drive fail closed', () => {
  const direct = openSession();
  addRgb(direct, { resistors: false });
  wireCommon(direct);
  apply(direct, {
    type: 'wire.create', net: {
      id: 'net-rgb-direct', endpoints: [
        { component: 'rgb-led-1', pin: 'R' }, { component: 'board-1', pin: 'D3' },
      ],
    },
  });
  assert.equal(direct.runnable.code, 'PROJECT_CONTACT_RGB_LED_R_CURRENT_LIMIT_REQUIRED');

  const reversed = openSession();
  addRgb(reversed);
  wireCommon(reversed, 'net-5v');
  assert.equal(reversed.runnable.code, 'PROJECT_CONTACT_RGB_LED_REVERSE_POLARITY');

  const shorted = openSession();
  addRgb(shorted);
  wireCommon(shorted);
  apply(shorted, {
    type: 'wire.branch', netId: 'net-ground-branch',
    endpoint: { component: 'rgb-led-1', pin: 'R' }, junctionId: 'junction-rgb-short',
  });
  assert.equal(shorted.runnable.code, 'PROJECT_CONTACT_RGB_LED_CHANNEL_SHORT');

  const unsupported = openSession();
  addRgb(unsupported);
  wireCommon(unsupported);
  wireChannel(unsupported, { channel: 'R', resistorId: 'resistor-3', sourcePin: 'D4' });
  assert.equal(unsupported.runnable.code, 'PROJECT_CONTACT_RGB_LED_R_REQUIRES_PWM');

  const beforePowerShort = unsupported.saveText();
  const rejected = unsupported.apply({
    type: 'wire.branch', revision: unsupported.revision, netId: 'net-5v',
    endpoint: { component: 'board-1', pin: 'GND2' }, junctionId: 'junction-power-short',
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'PROJECT_CONTACT_POWER_SHORT');
  assert.equal(unsupported.saveText(), beforePowerShort);
});

test('unsafe resistor values remain editable but cannot create a runnable RGB projection', () => {
  const session = openSession();
  addRgb(session, { ohms: 100 });
  wireCommon(session);
  wireAllChannels(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_LED_OVERCURRENT');
});

test('accepted RGB topology reuses three existing LED models and exposes firmware-driven channels', () => {
  const session = openSession();
  addRgb(session);
  wireCommon(session);
  wireAllChannels(session);
  assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
  const support = session.runtimeSupport.find((item) => item.componentId === 'rgb-led-1');
  assert.equal(support.runtimeAdapter, 'three-independent-led.basic-v1');
  assert.deepEqual(Object.fromEntries(Object.entries(support.runtimeProjection.channels).map(
    ([channel, record]) => [channel, [record.sourcePin, record.resistorId, record.color]],
  )), {
    R: ['D3', 'resistor-3', 'red'],
    G: ['D5', 'resistor-4', 'green'],
    B: ['D6', 'resistor-5', 'blue'],
  });
  const projectedIds = Object.values(support.runtimeProjection.channels).map(
    (channel) => channel.runtimeComponentId,
  );
  const runtimeProject = session.runtimeProject;
  assert.deepEqual(projectedIds.map((id) => runtimeProject.circuit.components.find(
    (component) => component.id === id,
  ).type), ['led.basic-v1', 'led.basic-v1', 'led.basic-v1']);
  assert(projectedIds.every((id) => runtimeProject.layout.positions[id].x === 0.78));

  const runtime = new CircuitRuntime(runtimeProject.circuit);
  const observation = runtime.observe({ digitalPins: { D3: true, D5: false, D6: true } });
  assert.deepEqual(projectedIds.map((id) => observation.leds.find(
    (led) => led.componentId === id,
  ).on), [true, false, true]);
});

test('save/open, movement and connected delete/undo preserve the exact RGB project', () => {
  const session = openSession();
  addRgb(session);
  wireCommon(session);
  wireAllChannels(session);
  apply(session, { type: 'component.move', componentId: 'rgb-led-1', x: 0.72, y: 0.64 });
  const before = session.saveText();
  const reopened = openCandidateUiSession(before);
  assert.equal(reopened.ok, true);
  assert.equal(reopened.session.runnable.ok, true);
  assert.deepEqual(reopened.session.visualProject.layout.positions['rgb-led-1'], {
    x: 0.72, y: 0.64, rotation: 0,
  });
  assert.equal(reopened.session.runtimeSupport.find(
    (item) => item.componentId === 'rgb-led-1',
  ).runtimeProjection.displayModel, 'relative-commanded-pwm-mix-only');

  const removed = apply(session, { type: 'component.remove', componentId: 'rgb-led-1' });
  assert.equal(removed.changeRelevance, 'build');
  assert(!JSON.parse(session.saveText()).candidateCircuit.nets.some(
    (net) => net.endpoints.some((endpoint) => endpoint.component === 'rgb-led-1'),
  ));
  const undone = apply(session, { type: 'undo' });
  assert.equal(undone.changeRelevance, 'build');
  assert.equal(session.saveText(), before);
});
