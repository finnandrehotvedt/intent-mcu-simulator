// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { COMPONENT_CATALOG } from '../src/component-catalog.mjs';
import {
  canonicalContactPersistenceDraftJson,
} from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import {
  AVR_CHARACTER_LCD_PINS,
  CHARACTER_LCD_DEFINITION,
  CHARACTER_LCD_INITIALIZATION,
  CHARACTER_LCD_SIGNALS,
  CHARACTER_LCD_TIMING,
  CHARACTER_LCD_TYPE,
  createCharacterLcd4BitDecoder,
  createCharacterLcdComponent,
  validateCharacterLcdDefinition,
} from '../expansion-drafts/character-lcd-16x2-4bit-v1.mjs';
import {
  CANDIDATE_UI_COMPONENTS,
  createCandidateUiComponent,
  openCandidateUiSession,
} from '../src/candidate-existing-ui-adapter.mjs';
import { openPortableEditorSession } from '../src/candidate-project-session.mjs';
import { prepareApiBatch } from '../src/browser-session-edit.mjs';

const SIGNAL_PINS = Object.freeze({ RS: 'D3', E: 'D4', D4: 'D5', D5: 'D6', D6: 'D7', D7: 'D8' });

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

function addDisplay(session) {
  apply(session, {
    type: 'component.add',
    component: createCharacterLcdComponent('character-lcd-1', 'Workshop 16x2 display'),
    position: { x: 0.72, y: 0.64 },
  });
}

function branch(session, netId, pin, junctionId) {
  apply(session, {
    type: 'wire.branch', netId,
    endpoint: { component: 'character-lcd-1', pin }, junctionId,
  });
}

function wirePower(session) {
  branch(session, 'net-5v', 'VCC', 'junction-lcd-vcc');
  branch(session, 'net-ground-branch', 'GND', 'junction-lcd-ground');
  branch(session, 'net-ground-branch', 'RW', 'junction-lcd-rw');
}

function wireSignals(session, mapping = SIGNAL_PINS) {
  for (const signal of CHARACTER_LCD_SIGNALS) {
    apply(session, {
      type: 'wire.create',
      net: {
        id: `net-lcd-${signal.toLowerCase()}`,
        endpoints: [
          { component: 'character-lcd-1', pin: signal },
          { component: 'board-1', pin: mapping[signal] },
        ],
      },
    });
  }
}

test('canonical API batch adds and wires direct LCD with exact transaction undo/redo', () => {
  const session = openSession();
  const operations = [
    { command: 'component.add', id: 'character-lcd-1', type: CHARACTER_LCD_TYPE,
      position: { x: 0.72, y: 0.64, rotation: 0 } },
    ...['VCC', 'GND', 'RW'].map((pin) => ({ command: 'wire.branch.connect',
      net_id: pin === 'VCC' ? 'net-5v' : 'net-ground-branch', endpoint: { component: 'character-lcd-1', pin } })),
    ...Object.entries(SIGNAL_PINS).map(([pin, boardPin]) => ({ command: 'wire.connect',
      net_id: `net-api-lcd-${pin.toLowerCase()}`, from: { component: 'character-lcd-1', pin },
      to: { component: 'board-1', pin: boardPin } })),
  ];
  const transactionId = 'transaction-character-lcd-api-1';
  const commands = prepareApiBatch({ profile: 'board.atmega328p-16mhz-v1', circuit: session.visualProject.circuit }, operations);
  assert.equal(session.apply({ type: 'edit.batch', revision: session.revision, transactionId, commands }).ok, true);
  assert.equal(session.runnable.ok, true);
  assert.equal(session.apply({ type: 'edit.undo', revision: session.revision, transactionId }).ok, true);
  assert.equal(session.visualProject.circuit.components.some((item) => item.id === 'character-lcd-1'), false);
  assert.equal(session.apply({ type: 'edit.redo', revision: session.revision, transactionId }).ok, true);
  assert.equal(session.runnable.ok, true);
});

test('canonical API duplicate places an LCD exactly and remains one undo transaction', () => {
  const session = openSession(); addDisplay(session);
  const position = { x: 0.6, y: 0.55, rotation: 0 };
  const [command] = prepareApiBatch(
    { profile: 'board.atmega328p-16mhz-v1', circuit: session.visualProject.circuit },
    [{ command: 'component.duplicate', component_id: 'character-lcd-1',
      id: 'character-lcd-api-review-1', position }],
  );
  const transactionId = 'transaction-character-lcd-api-duplicate';
  const applied = session.apply({ type: 'edit.batch', revision: session.revision, transactionId,
    commands: [command] });
  assert.equal(applied.ok, true, applied.code);
  assert.deepEqual(session.visualProject.layout.positions['character-lcd-api-review-1'], position);
  assert.equal(session.visualProject.circuit.nets.some((net) => net.endpoints.some(
    (endpoint) => endpoint.component === 'character-lcd-api-review-1')),
  false);
  assert.equal(session.apply({ type: 'edit.undo', revision: session.revision, transactionId }).ok, true);
  assert.equal(session.visualProject.circuit.components.some(
    (component) => component.id === 'character-lcd-api-review-1'), false);
});

function traceWriter(mapping = SIGNAL_PINS) {
  const levels = Object.fromEntries(CHARACTER_LCD_SIGNALS.map((signal) => [signal, false]));
  const events = [];
  const pinNumber = (signal) => Number(mapping[signal].slice(1));
  function set(signal, level, cycle) {
    if (levels[signal] === Boolean(level)) return;
    levels[signal] = Boolean(level);
    events.push({ cycle, pin: pinNumber(signal), level: Boolean(level) });
  }
  function nibble(value, rs, cycle) {
    set('RS', rs, cycle);
    for (let bit = 0; bit < 4; bit += 1) set(`D${bit + 4}`, Boolean(value & (1 << bit)), cycle);
    set('E', true, cycle + 1);
    set('E', false, cycle + 9);
    return cycle + 9;
  }
  function byte(value, rs, cycle) {
    const first = nibble(value >> 4, rs, cycle);
    return nibble(value & 0x0f, rs, first + 16);
  }
  return { events, nibble, byte };
}

function initializedTrace() {
  const writer = traceWriter();
  let cycle = CHARACTER_LCD_TIMING.powerOnMinimumCycles;
  cycle = writer.nibble(0x3, false, cycle);
  cycle = writer.nibble(0x3, false, cycle + CHARACTER_LCD_TIMING.firstRepeatedInitGapCycles);
  cycle = writer.nibble(0x3, false, cycle + CHARACTER_LCD_TIMING.laterInitGapCycles);
  cycle = writer.nibble(0x2, false, cycle + CHARACTER_LCD_TIMING.laterInitGapCycles);
  for (const command of CHARACTER_LCD_INITIALIZATION.commands) {
    cycle = writer.byte(command, false, cycle + (command === 0x01
      ? CHARACTER_LCD_TIMING.instructionMinimumCycles
      : CHARACTER_LCD_TIMING.instructionMinimumCycles));
    cycle += command === 0x01
      ? CHARACTER_LCD_TIMING.clearHomeMinimumCycles
      : CHARACTER_LCD_TIMING.instructionMinimumCycles;
  }
  return { ...writer, cycle };
}

function writeLine(writer, line, address, cycle) {
  cycle = writer.byte(0x80 | address, false, cycle);
  cycle += CHARACTER_LCD_TIMING.instructionMinimumCycles;
  for (const character of line.padEnd(16).slice(0, 16)) {
    cycle = writer.byte(character.charCodeAt(0), true, cycle);
    cycle += CHARACTER_LCD_TIMING.instructionMinimumCycles;
  }
  return cycle;
}

test('character LCD is an original explicit nine-terminal bounded candidate', () => {
  assert.equal(validateCharacterLcdDefinition(), true);
  assert.equal(CHARACTER_LCD_DEFINITION.type, CHARACTER_LCD_TYPE);
  assert.deepEqual(CHARACTER_LCD_DEFINITION.pins.map((pin) => pin.id), [
    'VCC', 'GND', 'RS', 'RW', 'E', 'D4', 'D5', 'D6', 'D7',
  ]);
  assert.deepEqual(AVR_CHARACTER_LCD_PINS, [
    'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13',
  ]);
  const limits = CHARACTER_LCD_DEFINITION.support.limitations.join(' ');
  assert.match(limits, /Supported initialization/u);
  assert.match(limits, /Reads, busy flag, RW-high operation/u);
  assert.match(limits, /I²C, backpacks/u);
  assert.match(CHARACTER_LCD_DEFINITION.artwork.provenance, /Original IntentForce SVG/u);
  assert(!Object.hasOwn(COMPONENT_CATALOG, CHARACTER_LCD_TYPE));
  assert.equal(Object.values(CANDIDATE_UI_COMPONENTS).filter((item) => item.selectable).length, 67);
  assert.deepEqual(createCandidateUiComponent(CHARACTER_LCD_TYPE, 'character-lcd-2'), {
    id: 'character-lcd-2', type: CHARACTER_LCD_TYPE,
    label: '16×2 character LCD 4-bit GPIO', properties: {}, controls: {},
  });
});

test('VCC, GND, RW and six signal terminals advance deterministic draft diagnostics', () => {
  const session = openSession();
  addDisplay(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_CHARACTER_LCD_VCC_DISCONNECTED');
  branch(session, 'net-5v', 'VCC', 'junction-lcd-vcc');
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_CHARACTER_LCD_GND_DISCONNECTED');
  branch(session, 'net-ground-branch', 'GND', 'junction-lcd-ground');
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_CHARACTER_LCD_RW_DISCONNECTED');
  branch(session, 'net-ground-branch', 'RW', 'junction-lcd-rw');
  for (const signal of CHARACTER_LCD_SIGNALS) {
    assert.equal(session.runnable.code, `PROJECT_CONTACT_CHARACTER_LCD_${signal}_DISCONNECTED`);
    apply(session, {
      type: 'wire.create', net: {
        id: `net-lcd-${signal.toLowerCase()}`,
        endpoints: [
          { component: 'character-lcd-1', pin: signal },
          { component: 'board-1', pin: SIGNAL_PINS[signal] },
        ],
      },
    });
  }
  assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
});

test('wrong power, unshared RW, D0/D1 and branched signal topologies fail closed', () => {
  const wrongPower = openSession(); addDisplay(wrongPower);
  branch(wrongPower, 'net-ground-branch', 'VCC', 'junction-lcd-wrong-vcc');
  assert.equal(wrongPower.runnable.code, 'PROJECT_CONTACT_CHARACTER_LCD_VCC_REQUIRES_5V');

  const separateGround = openSession(); addDisplay(separateGround);
  branch(separateGround, 'net-5v', 'VCC', 'junction-lcd-vcc');
  apply(separateGround, { type: 'wire.create', net: { id: 'net-lcd-ground', endpoints: [
    { component: 'character-lcd-1', pin: 'GND' }, { component: 'board-1', pin: 'GND2' },
  ] } });
  apply(separateGround, { type: 'wire.create', net: { id: 'net-lcd-rw', endpoints: [
    { component: 'character-lcd-1', pin: 'RW' }, { component: 'board-1', pin: 'GND3' },
  ] } });
  assert.equal(separateGround.runnable.code, 'PROJECT_CONTACT_CHARACTER_LCD_RW_REQUIRES_SHARED_GROUND');

  const unsupported = openSession(); addDisplay(unsupported); wirePower(unsupported);
  wireSignals(unsupported, { ...SIGNAL_PINS, RS: 'D0' });
  assert.equal(unsupported.runnable.code, 'PROJECT_CONTACT_CHARACTER_LCD_RS_UNSUPPORTED_OUTPUT');

  const branched = openSession(); addDisplay(branched); wirePower(branched);
  apply(branched, { type: 'wire.create', net: { id: 'net-lcd-rs', endpoints: [
    { component: 'character-lcd-1', pin: 'RS' }, { component: 'board-1', pin: 'D3' },
  ] } });
  apply(branched, { type: 'wire.branch', netId: 'net-lcd-rs',
    endpoint: { component: 'character-lcd-1', pin: 'E' }, junctionId: 'junction-lcd-signal-short' });
  assert.equal(branched.runnable.code, 'PROJECT_CONTACT_CHARACTER_LCD_RS_UNSUPPORTED_TOPOLOGY');
});

test('accepted LCD is projected as a high-impedance trace observer, not a pretend peripheral', () => {
  const session = openSession(); addDisplay(session); wirePower(session); wireSignals(session);
  assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
  const support = session.runtimeSupport.find((item) => item.componentId === 'character-lcd-1');
  assert.equal(support.runtimeAdapter, 'avr-gpio-hd44780-write-only-decoder-v1');
  assert.deepEqual(Object.fromEntries(Object.entries(support.runtimeProjection.signals).map(
    ([signal, record]) => [signal, record.sourcePin],
  )), SIGNAL_PINS);
  assert.equal(session.runtimeProject.circuit.components.some(
    (component) => component.id === 'character-lcd-1',
  ), false);
  assert.equal(session.runtimeProject.circuit.nets.some(
    (net) => net.endpoints.some((endpoint) => endpoint.component === 'character-lcd-1'),
  ), false);
});

test('decoder renders compiled-style Hello text and a later updated two-line value', () => {
  const decoder = createCharacterLcd4BitDecoder(SIGNAL_PINS);
  const writer = initializedTrace();
  writer.cycle = writeLine(writer, 'Hello, Company!', 0x00, writer.cycle);
  writer.cycle = writeLine(writer, 'GPIO 4-bit ready', 0x40, writer.cycle);
  let snapshot = decoder.consume(writer.events);
  assert.equal(snapshot.status, 'ready');
  assert.equal(snapshot.initialized, true);
  assert.deepEqual(snapshot.lines, ['Hello, Company! ', 'GPIO 4-bit ready']);

  const priorLength = writer.events.length;
  writer.cycle = writeLine(writer, 'Updated by AVR', 0x00, writer.cycle);
  writer.cycle = writeLine(writer, 'Count: 42', 0x40, writer.cycle);
  snapshot = decoder.consume(writer.events.slice(priorLength));
  assert.deepEqual(snapshot.lines, ['Updated by AVR  ', 'Count: 42       ']);
});

test('display control, cursor, blink, clear, home and 16x2 wrapping update incrementally', () => {
  const decoder = createCharacterLcd4BitDecoder(SIGNAL_PINS);
  const writer = initializedTrace();
  let offset = 0;
  let snapshot = decoder.consume(writer.events);
  offset = writer.events.length;
  assert.deepEqual({ displayOn: snapshot.displayOn, cursorOn: snapshot.cursorOn, blinkOn: snapshot.blinkOn },
    { displayOn: true, cursorOn: false, blinkOn: false });

  writer.cycle = writer.byte(0x0f, false, writer.cycle);
  writer.cycle += CHARACTER_LCD_TIMING.instructionMinimumCycles;
  snapshot = decoder.consume(writer.events.slice(offset)); offset = writer.events.length;
  assert.deepEqual({ displayOn: snapshot.displayOn, cursorOn: snapshot.cursorOn, blinkOn: snapshot.blinkOn },
    { displayOn: true, cursorOn: true, blinkOn: true });

  writer.cycle = writer.byte(0x80, false, writer.cycle);
  writer.cycle += CHARACTER_LCD_TIMING.instructionMinimumCycles;
  for (const character of 'ABCDEFGHIJKLMNOPq') {
    writer.cycle = writer.byte(character.charCodeAt(0), true, writer.cycle);
    writer.cycle += CHARACTER_LCD_TIMING.instructionMinimumCycles;
  }
  snapshot = decoder.consume(writer.events.slice(offset)); offset = writer.events.length;
  assert.deepEqual(snapshot.lines, ['ABCDEFGHIJKLMNOP', 'q               ']);
  assert.equal(snapshot.address, 0x41);

  writer.cycle = writer.byte(0x02, false, writer.cycle);
  writer.cycle += CHARACTER_LCD_TIMING.clearHomeMinimumCycles;
  writer.cycle = writer.byte('H'.charCodeAt(0), true, writer.cycle);
  writer.cycle += CHARACTER_LCD_TIMING.instructionMinimumCycles;
  snapshot = decoder.consume(writer.events.slice(offset)); offset = writer.events.length;
  assert.deepEqual(snapshot.lines, ['HBCDEFGHIJKLMNOP', 'q               ']);

  writer.cycle = writer.byte(0x08, false, writer.cycle);
  writer.cycle += CHARACTER_LCD_TIMING.instructionMinimumCycles;
  writer.cycle = writer.byte(0x01, false, writer.cycle);
  snapshot = decoder.consume(writer.events.slice(offset));
  assert.deepEqual(snapshot.lines, ['                ', '                ']);
  assert.deepEqual({ displayOn: snapshot.displayOn, cursorOn: snapshot.cursorOn, blinkOn: snapshot.blinkOn },
    { displayOn: false, cursorOn: false, blinkOn: false });
});

test('unsupported command, inadequate timing and trace loss are explicit terminal errors', () => {
  const commandDecoder = createCharacterLcd4BitDecoder(SIGNAL_PINS);
  const commandTrace = initializedTrace();
  commandTrace.cycle = commandTrace.byte(0x10, false, commandTrace.cycle);
  assert.equal(commandDecoder.consume(commandTrace.events).error.code, 'CHARACTER_LCD_COMMAND_UNSUPPORTED');

  const timingDecoder = createCharacterLcd4BitDecoder(SIGNAL_PINS);
  const timing = traceWriter();
  timing.nibble(0x3, false, 1_000);
  assert.equal(timingDecoder.consume(timing.events).error.code, 'CHARACTER_LCD_POWER_ON_TIMING');

  const droppedDecoder = createCharacterLcd4BitDecoder(SIGNAL_PINS);
  assert.equal(droppedDecoder.consume([], { logicDrops: 1 }).error.code, 'CHARACTER_LCD_TRACE_DROPPED');
});

test('save/open, movement and connected delete/undo preserve the exact LCD project', () => {
  const session = openSession(); addDisplay(session); wirePower(session); wireSignals(session);
  apply(session, { type: 'component.move', componentId: 'character-lcd-1', x: 0.67, y: 0.59 });
  const before = session.saveText();
  const reopened = openCandidateUiSession(before);
  assert.equal(reopened.ok, true);
  assert.equal(reopened.session.runnable.ok, true);
  assert.deepEqual(reopened.session.visualProject.layout.positions['character-lcd-1'], {
    x: 0.67, y: 0.59, rotation: 0,
  });
  assert.equal(reopened.session.runtimeSupport.find(
    (item) => item.componentId === 'character-lcd-1',
  ).runtimeProjection.signals.D7.sourcePin, 'D8');

  apply(session, { type: 'component.remove', componentId: 'character-lcd-1' });
  assert(!JSON.parse(session.saveText()).candidateCircuit.nets.some(
    (net) => net.endpoints.some((endpoint) => endpoint.component === 'character-lcd-1'),
  ));
  apply(session, { type: 'undo' });
  assert.equal(session.saveText(), before);
});
