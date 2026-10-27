// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { ANALOG_JOYSTICK_DEFINITION, ANALOG_JOYSTICK_TYPE, KEYPAD_3X4_DEFINITION, KEYPAD_3X4_TYPE,
  KEYPAD_4X4_DEFINITION, KEYPAD_4X4_TYPE, createJoystickKeypad, joystickVoltages, keypadContact,
  projectJoystickKeypads, validateJoystickKeypad } from '../expansion-drafts/joystick-keypads-v1.mjs';
import { CIRCUIT_SCHEMA, CircuitRuntime, createComponent, validateCircuit } from '../src/circuit-engine.mjs';
import { portDConfig } from 'avr8js';
import { Atmega328PAdapter } from '../src/atmega328p-adapter.mjs';

test('CMP028 joystick exposes supply, two analogue axes and one active-low push contact', () => {
  const joystick = createJoystickKeypad(ANALOG_JOYSTICK_TYPE, 'joystick-1');
  assert.equal(validateJoystickKeypad(joystick), true);
  assert.deepEqual(ANALOG_JOYSTICK_DEFINITION.pins.map(({ id }) => id), ['VCC', 'GND', 'VRX', 'VRY', 'SW']);
  joystick.controls = { x: 0.25, y: 0.8, pressed: true };
  assert.deepEqual(joystickVoltages(joystick), { VRX: 1.25, VRY: 4, switchClosed: true });
});

test('CMP029 and CMP030 preserve exact passive matrix dimensions and contacts', () => {
  assert.deepEqual(KEYPAD_3X4_DEFINITION.pins.map(({ id }) => id), ['R1','R2','R3','R4','C1','C2','C3']);
  assert.deepEqual(KEYPAD_4X4_DEFINITION.pins.map(({ id }) => id), ['R1','R2','R3','R4','C1','C2','C3','C4']);
  const keypad3 = createJoystickKeypad(KEYPAD_3X4_TYPE, 'keypad-3x4-1'); keypad3.controls.pressedKey = 'R4C3';
  assert.deepEqual(keypadContact(keypad3), { row: 'R4', column: 'C3' });
  const keypad4 = createJoystickKeypad(KEYPAD_4X4_TYPE, 'keypad-4x4-1'); keypad4.controls.pressedKey = 'R2C4';
  assert.deepEqual(keypadContact(keypad4), { row: 'R2', column: 'C4' });
  keypad3.controls.pressedKey = 'R1C4'; assert.equal(validateJoystickKeypad(keypad3), false);
});

test('all three use original graphics provenance and refuse physical-accuracy claims', () => {
  for (const definition of [ANALOG_JOYSTICK_DEFINITION, KEYPAD_3X4_DEFINITION, KEYPAD_4X4_DEFINITION]) {
    assert.match(definition.artwork.provenance, /Original IntentForce SVG/u);
    assert.equal(definition.artwork.license, 'Apache-2.0');
    assert(definition.support.limitations.length >= 2);
  }
});

test('joystick projects to two analogue channels and an active-low switch without losing shared rails', () => {
  const joystick = createJoystickKeypad(ANALOG_JOYSTICK_TYPE, 'joystick-1');
  const graph = { schema: CIRCUIT_SCHEMA, components: [joystick], junctions: [], nets: [
    { id: 'vcc', endpoints: [{ component: 'source', pin: '5V' }, { component: joystick.id, pin: 'VCC' }] },
    { id: 'gnd', endpoints: [{ component: 'source', pin: 'GND' }, { component: joystick.id, pin: 'GND' }] },
    { id: 'x', endpoints: [{ component: 'source', pin: 'A0' }, { component: joystick.id, pin: 'VRX' }] },
    { id: 'y', endpoints: [{ component: 'source', pin: 'A1' }, { component: joystick.id, pin: 'VRY' }] },
    { id: 'sw', endpoints: [{ component: 'source', pin: 'D2' }, { component: joystick.id, pin: 'SW' }] },
  ] };
  const projected = projectJoystickKeypads(graph);
  assert.deepEqual(projected.runtimeGraph.components.map(({ type }) => type),
    ['potentiometer.linear-v1', 'potentiometer.linear-v1', 'button.momentary-v1']);
  assert.equal(projected.runtimeGraph.nets.find(({ id }) => id === 'vcc').endpoints.length, 3);
  assert.equal(projected.runtimeGraph.nets.find(({ id }) => id === 'gnd').endpoints.length, 4);
});

test('matrix keypad projects only its selected row-column contact', () => {
  const keypad = createJoystickKeypad(KEYPAD_4X4_TYPE, 'keypad-1'); keypad.controls.pressedKey = 'R2C4';
  const endpoints = ['R1','R2','R3','R4','C1','C2','C3','C4'].map((pin, index) => ({
    id: `n${index}`, endpoints: [{ component: 'board', pin: `D${index + 2}` }, { component: keypad.id, pin }],
  }));
  const projected = projectJoystickKeypads({ schema: CIRCUIT_SCHEMA, components: [keypad], nets: endpoints, junctions: [] });
  assert.equal(projected.runtimeGraph.components.length, 1);
  assert.deepEqual(projected.runtimeGraph.nets.map(({ id }) => id), ['n1', 'n7']);
  assert.deepEqual(projected.runtimeGraph.components[0].controls, { pressed: true });
});

test('runtime treats a digital-to-digital momentary contact as a GPIO bridge', () => {
  const board = createComponent('board-1', 'board.atmega328p-16mhz-v1');
  const button = createComponent('key-1', 'button.momentary-v1'); button.controls.pressed = true;
  const graph = { schema: CIRCUIT_SCHEMA, components: [board, button], junctions: [], nets: [
    { id: 'row', endpoints: [{ component: board.id, pin: 'D2' }, { component: button.id, pin: 'A' }] },
    { id: 'column', endpoints: [{ component: board.id, pin: 'D5' }, { component: button.id, pin: 'B' }] },
  ] };
  assert.equal(validateCircuit(graph).ok, true);
  const runtime = new CircuitRuntime(graph); const calls = [];
  runtime.applyControls({ setDigitalBridge: (...args) => calls.push(args) });
  assert.deepEqual(calls, [['key-1', 2, 5, true]]);
});

test('AVR bridge propagates a scanned row output to a keypad column input', () => {
  const adapter = new Atmega328PAdapter(':00000001FF');
  adapter.cpu.data[portDConfig.DDR] |= (1 << 2);
  adapter.cpu.data[portDConfig.PORT] &= ~(1 << 2);
  adapter.setDigitalBridge('key-1', 2, 5, true);
  assert.equal(Boolean(adapter.cpu.data[portDConfig.PIN] & (1 << 5)), false);
  adapter.cpu.data[portDConfig.PORT] |= (1 << 2);
  adapter.setDigitalBridge('key-1', 2, 5, true);
  assert.equal(Boolean(adapter.cpu.data[portDConfig.PIN] & (1 << 5)), true);
});
