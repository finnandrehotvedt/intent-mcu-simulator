// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { COMPONENT_CATALOG } from './component-catalog.mjs';
import { CANDIDATE_UI_COMPONENTS } from './candidate-existing-ui-adapter.mjs';
import { RP2040_PICO_COMPONENT_CATALOG } from './rp2040-pico-circuit.mjs';
import { ESP32C3_PUBLIC_COMPONENT_CATALOG } from './esp32c3-public-circuit.mjs';
import { STM32_PUBLIC_COMPONENT_CATALOG } from './stm32-public-circuit.mjs';
import { BOUNDED_3V3_UI_COMPONENTS } from './bounded-3v3-authoring-contracts.mjs';

export const COMPONENT_SUPPORT_MATRIX_SCHEMA = 'intent-mcu-component-support-matrix@1';

const AVR = 'board.atmega328p-16mhz-v1';
const PICO = 'board.rp2040-pico-v1';
const C3 = 'board.esp32-c3-devmodule-v1';
const STM32 = 'board.stm32f429zi-nucleo144-v1';
const LED = 'led.basic-v1';
const RESISTOR = 'resistor.fixed-v1';

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

export const COMPONENT_SUPPORT_PROFILES = deepFreeze([
  { id: AVR, label: 'ATmega328P', nominalVolts: 5, projectMode: 'AVR project-v2 or candidate-v3' },
  { id: PICO, label: 'RP2040 Pico', nominalVolts: 3.3, projectMode: 'bounded Pico project' },
  { id: C3, label: 'ESP32-C3', nominalVolts: 3.3, projectMode: 'bounded C3 project' },
  { id: STM32, label: 'STM32F429ZI', nominalVolts: 3.3, projectMode: 'bounded STM32 project' },
]);

const avrBase = Object.values(COMPONENT_CATALOG).filter((definition) => definition.selectable);
// CMP-020's AVR 5 V source is integrated for private candidate review but is
// intentionally excluded from the public matrix until that review and release
// gate complete. Candidate discovery is not public qualification.
const avrCandidate = Object.values(CANDIDATE_UI_COMPONENTS).filter((definition) =>
  definition.selectable && definition.type !== 'reference.power-5v-v1');
const narrowBoards = [
  RP2040_PICO_COMPONENT_CATALOG[PICO],
  ESP32C3_PUBLIC_COMPONENT_CATALOG[C3],
  STM32_PUBLIC_COMPONENT_CATALOG[STM32],
];

const definitions = new Map([...avrBase, ...avrCandidate, ...Object.values(BOUNDED_3V3_UI_COMPONENTS), ...narrowBoards]
  .map((definition) => [definition.type, definition]));

export const COMPONENT_SUPPORT_MODELS = deepFreeze([...definitions.values()].map((definition) => ({
  type: definition.type,
  name: definition.displayName,
  functions: [...definition.catalog.functions],
  interfaces: [...definition.catalog.interfaces],
  declaredSupplyVolts: { ...definition.catalog.supplyVolts },
  modelRef: definition.modelRef,
  limitations: [...definition.support.limitations],
})));

const AVR_BASE_TYPES = new Set(avrBase.map((definition) => definition.type));
const AVR_CANDIDATE_TYPES = new Set(avrCandidate.map((definition) => definition.type));
const NARROW_BOARDS = new Map([[PICO, PICO], [C3, C3], [STM32, STM32]]);
const NARROW_AUTHORING_TYPES = new Set(Object.keys(BOUNDED_3V3_UI_COMPONENTS));

const referenceBindings = deepFreeze({
  [AVR]: {
    [AVR]: { starters: ['blink', 'button', 'adc', 'pwm', 'pwm-pulse', 'temperature-lcd-threshold', 'avr-thermostat-boundary-v1'], tests: ['test/circuit-model.test.mjs', 'test/starter-examples.cjs'] },
    [LED]: { starters: ['blink', 'pwm', 'pwm-pulse', 'avr-thermostat-boundary-v1'], tests: ['test/circuit-model.test.mjs', 'test/starter-examples.cjs', 'test/basic-component-example-artifacts.test.mjs'] },
    [RESISTOR]: { starters: ['blink', 'pwm', 'pwm-pulse', 'temperature-lcd-threshold', 'avr-thermostat-boundary-v1'], tests: ['test/circuit-model.test.mjs', 'test/starter-examples.cjs', 'test/basic-component-example-artifacts.test.mjs'] },
    'button.momentary-v1': { starters: ['button', 'avr-thermostat-boundary-v1'], tests: ['test/circuit-model.test.mjs', 'test/starter-examples.cjs', 'test/input-control-example-artifacts.test.mjs'] },
    'potentiometer.linear-v1': { starters: ['adc'], tests: ['test/circuit-model.test.mjs', 'test/starter-examples.cjs', 'test/basic-component-example-artifacts.test.mjs'] },
    'reference.ground-v1': { starters: ['avr-ground-reference-input'], tests: ['test/candidate-draft-runnable-transition.test.mjs'] },
    'switch.toggle-spst-v1': { starters: ['avr-toggle-input'], tests: ['test/candidate-draft-runnable-transition.test.mjs', 'test/input-control-example-artifacts.test.mjs'] },
    'switch.changeover-spdt-v1': { starters: ['avr-spdt-selector'], tests: ['test/candidate-draft-runnable-transition.test.mjs'] },
    'switch.slide-spdt-v1': { starters: ['avr-spdt-selector'], tests: ['test/mechanical-inputs-candidate.test.mjs'] },
    'button.momentary-nc-v1': { starters: ['button'], tests: ['test/mechanical-inputs-candidate.test.mjs'] },
    'switch.limit-spdt-v1': { starters: ['avr-spdt-selector'], tests: ['test/mechanical-inputs-candidate.test.mjs'] },
    'switch.dip-4-v1': { starters: ['avr-advanced-switch-inputs'], tests: ['test/advanced-switch-inputs-candidate.test.mjs'] },
    'input.rotary-encoder-button-v1': { starters: ['avr-advanced-switch-inputs'], tests: ['test/advanced-switch-inputs-candidate.test.mjs'] },
    'switch.reed-no-v1': { starters: ['avr-safety-pedal-inputs'], tests: ['test/safety-pedal-inputs-candidate.test.mjs'] },
    'switch.emergency-stop-nc-v1': { starters: ['avr-safety-pedal-inputs'], tests: ['test/safety-pedal-inputs-candidate.test.mjs'] },
    'switch.foot-pedal-no-v1': { starters: ['avr-safety-pedal-inputs'], tests: ['test/safety-pedal-inputs-candidate.test.mjs'] },
    'switch.rotary-selector-4-v1': { starters: ['avr-rotary-selector-4'], tests: ['test/rotary-selector-indicators-candidate.test.mjs'] },
    'sensor.light-analogue-v1': { starters: ['avr-light-analogue'], tests: ['test/light-analogue-sensor-candidate.test.mjs', 'test/light-analogue-sensor-ui-candidate.cjs'] },
    'sensor.temperature-analogue-v1': { starters: ['temperature-lcd-threshold', 'avr-thermostat-boundary-v1'], tests: ['test/temperature-analogue-sensor-candidate.test.mjs', 'test/temperature-analogue-sensor-ui-candidate.cjs'] },
    'sensor.light-threshold-digital-v1': { starters: ['avr-light-threshold'], tests: ['test/digital-light-threshold-candidate.test.mjs', 'test/digital-light-threshold-ui-candidate.cjs'] },
    'output.rgb-led-common-cathode-v1': { starters: ['temperature-lcd-threshold'], tests: ['test/common-cathode-rgb-led-candidate.test.mjs', 'test/common-cathode-rgb-led-ui-candidate.cjs', 'test/indicator-actuator-example-artifacts.test.mjs'] },
    'output.rgb-led-common-anode-v1': { starters: ['avr-rgb-common-anode'], tests: ['test/rotary-selector-indicators-candidate.test.mjs'] },
    'output.led-bar-graph-10-v1': { starters: ['avr-led-bar-graph'], tests: ['test/rotary-selector-indicators-candidate.test.mjs'] },
    'output.active-buzzer-module-v1': { starters: ['avr-active-buzzer'], tests: ['test/active-buzzer-candidate.test.mjs', 'test/active-buzzer-ui-candidate.cjs', 'test/indicator-actuator-example-artifacts.test.mjs'] },
    'output.seven-segment-common-cathode-v1': { starters: ['avr-seven-segment'], tests: ['test/seven-segment-common-cathode-candidate.test.mjs', 'test/seven-segment-common-cathode-ui-candidate.cjs', 'test/indicator-actuator-example-artifacts.test.mjs'] },
    'output.character-lcd-16x2-4bit-v1': { starters: ['temperature-lcd-threshold'], tests: ['test/character-lcd-16x2-4bit-candidate.test.mjs', 'test/character-lcd-16x2-4bit-ui-candidate.cjs'] },
    'output.character-lcd-20x4-4bit-v1': { starters: ['avr-character-lcd-20x4-cgram'], tests: ['test/character-lcd-20x4-cgram.test.mjs', 'test/character-lcd-20x4-cgram-ui-candidate.cjs'] },
    'output.character-lcd-16x2-pcf8574-v1': { starters: ['avr-pcf8574-lcd-hello'], tests: ['test/pcf8574-lcd-backpack.test.mjs', 'test/pcf8574-lcd-end-to-end-browser.cjs'] },
    'input.rotary-encoder-quadrature-v1': { starters: ['avr-rotary-encoder'], tests: ['test/component-support-matrix.test.mjs', 'test/input-control-example-artifacts.test.mjs'] },
    'input.analog-joystick-2axis-v1': { starters: ['avr-analog-joystick'], tests: ['test/joystick-keypads-candidate.test.mjs', 'test/joystick-keypad-example-artifacts.test.mjs'] },
    'input.matrix-keypad-3x4-v1': { starters: ['avr-matrix-keypad-3x4'], tests: ['test/joystick-keypads-candidate.test.mjs', 'test/joystick-keypad-example-artifacts.test.mjs'] },
    'input.matrix-keypad-4x4-v1': { starters: ['avr-matrix-keypad-4x4'], tests: ['test/joystick-keypads-candidate.test.mjs', 'test/joystick-keypad-example-artifacts.test.mjs'] },
    'input.capacitive-touch-button-v1': { starters: ['avr-digital-presence-sensors'], tests: ['test/digital-presence-sensors-candidate.test.mjs', 'test/digital-presence-sensor-example-artifacts.test.mjs'] },
    'sensor.pir-motion-v1': { starters: ['avr-digital-presence-sensors'], tests: ['test/digital-presence-sensors-candidate.test.mjs', 'test/digital-presence-sensor-example-artifacts.test.mjs'] },
    'sensor.hall-switch-digital-v1': { starters: ['avr-digital-presence-sensors'], tests: ['test/digital-presence-sensors-candidate.test.mjs', 'test/digital-presence-sensor-example-artifacts.test.mjs'] },
  },
  [PICO]: {
    [PICO]: { starters: ['pico-led-on', 'pico-led-off'], tests: ['test/rp2040-pico-circuit.test.mjs', 'test/supported-example-pack-browser.cjs'] },
    [LED]: { starters: ['pico-led-on', 'pico-led-off'], tests: ['test/rp2040-pico-circuit.test.mjs', 'test/bounded-component-recovery.test.mjs'] },
    [RESISTOR]: { starters: ['pico-led-on', 'pico-led-off'], tests: ['test/rp2040-pico-circuit.test.mjs', 'test/bounded-component-recovery.test.mjs'] },
  },
  [C3]: {
    [C3]: { starters: ['c3-led-on', 'c3-led-off'], tests: ['test/esp32c3-public.test.mjs', 'test/supported-example-pack-browser.cjs'] },
    [LED]: { starters: ['c3-led-on', 'c3-led-off'], tests: ['test/esp32c3-public.test.mjs', 'test/bounded-component-recovery.test.mjs'] },
    [RESISTOR]: { starters: ['c3-led-on', 'c3-led-off'], tests: ['test/esp32c3-public.test.mjs', 'test/bounded-component-recovery.test.mjs'] },
  },
  [STM32]: {
    [STM32]: { starters: ['stm32-led-on', 'stm32-led-off'], tests: ['test/stm32-public.test.mjs', 'test/supported-example-pack-browser.cjs'] },
    [LED]: { starters: ['stm32-led-on', 'stm32-led-off'], tests: ['test/stm32-public.test.mjs', 'test/bounded-component-recovery.test.mjs'] },
    [RESISTOR]: { starters: ['stm32-led-on', 'stm32-led-off'], tests: ['test/stm32-public.test.mjs', 'test/bounded-component-recovery.test.mjs'] },
  },
});

function availability(profile, type) {
  if (profile === AVR) {
    if (AVR_BASE_TYPES.has(type)) return { available: true, mode: 'project-v2-and-candidate-v3' };
    if (AVR_CANDIDATE_TYPES.has(type)) return { available: true, mode: 'candidate-v3-only' };
    return { available: false, mode: 'none' };
  }
  if (type === NARROW_BOARDS.get(profile) || type === LED || type === RESISTOR) {
    return { available: true, mode: 'bounded-profile-project' };
  }
  return { available: false, mode: 'none' };
}

function unavailableReason(profile, type) {
  if (type.startsWith('board.')) return 'A controller board belongs only to its exact profile.';
  if (profile !== AVR && NARROW_AUTHORING_TYPES.has(type)) return 'Authoring-only on this 3.3 V profile; no runtime adapter is available.';
  if (profile !== AVR) return 'This public profile does not yet admit this component model.';
  return 'This model is not part of the public AVR catalogue.';
}

export const COMPONENT_SUPPORT_CELLS = deepFreeze(COMPONENT_SUPPORT_PROFILES.flatMap((profile) =>
  COMPONENT_SUPPORT_MODELS.map((model) => {
    const state = availability(profile.id, model.type);
    const authoringAvailable = state.available || profile.id !== AVR && NARROW_AUTHORING_TYPES.has(model.type);
    const definition = definitions.get(model.type);
    const binding = referenceBindings[profile.id]?.[model.type] ?? null;
    return {
      schema: COMPONENT_SUPPORT_MATRIX_SCHEMA,
      profile: profile.id,
      model: model.type,
      available: state.available,
      authoringAvailable,
      executableAvailable: state.available,
      status: authoringAvailable ? definition.support.status : 'unavailable',
      projectMode: state.available ? state.mode : authoringAvailable ? 'authoring-only' : state.mode,
      functions: authoringAvailable ? [...definition.catalog.functions] : [],
      interfaces: authoringAvailable ? [...definition.catalog.interfaces] : [],
      nominalProfileVolts: profile.nominalVolts,
      limitations: state.available ? [...definition.support.limitations] : [unavailableReason(profile.id, model.type)],
      reference: binding ? { starters: [...binding.starters], tests: [...binding.tests] } : null,
    };
  })));

export function componentSupportCell(profile, model) {
  return COMPONENT_SUPPORT_CELLS.find((cell) => cell.profile === profile && cell.model === model) ?? null;
}

export function componentSupportSummary(profile) {
  const cells = COMPONENT_SUPPORT_CELLS.filter((cell) => cell.profile === profile);
  return {
    profile,
    total: cells.length,
    available: cells.filter((cell) => cell.available).length,
    authoringAvailable: cells.filter((cell) => cell.authoringAvailable).length,
    executableAvailable: cells.filter((cell) => cell.executableAvailable).length,
    simulated: cells.filter((cell) => cell.status === 'simulated').length,
    partial: cells.filter((cell) => cell.status === 'partial').length,
    visual: cells.filter((cell) => cell.status === 'visual').length,
    unavailable: cells.filter((cell) => !cell.authoringAvailable).length,
  };
}

export function componentReferenceInventory() {
  return COMPONENT_SUPPORT_CELLS.filter((cell) => cell.available).map((cell) => ({
    profile: cell.profile,
    model: cell.model,
    status: cell.status,
    hasPositiveReference: Boolean(cell.reference?.starters.length),
    hasTrackedTests: Boolean(cell.reference?.tests.length),
    starters: [...(cell.reference?.starters ?? [])],
    tests: [...(cell.reference?.tests ?? [])],
  }));
}
