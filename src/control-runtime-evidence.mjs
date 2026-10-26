// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { AVR_PROFILE } from './compile-targets.mjs';
import { controlPersistenceInventory } from './control-persistence-policy.mjs';

export const CONTROL_RUNTIME_EVIDENCE_SCHEMA = 'intent-mcu-control-runtime-evidence@1';

const rows = [
  ['button.momentary-v1', 'pressed', 'control · pressed', 'D2 input → executed firmware → USART/D13', 'actual-executed'],
  ['potentiometer.linear-v1', 'position', 'control · position', 'A0 ADC → executed firmware → USART/D13', 'actual-executed'],
  ['switch.toggle-spst-v1', 'closed', 'control · pressed', 'D2 input → executed firmware → USART/D13', 'actual-executed'],
  ['switch.changeover-spdt-v1', 'selectedThrow', 'digital-input · BREAK then selected throw', 'D2 input → executed firmware → USART/D13', 'actual-executed'],
  ['switch.slide-spdt-v1', 'selectedThrow', 'contact projection · selected throw', 'authored contact state → bounded AVR projection', 'model-projected'],
  ['button.momentary-nc-v1', 'pressed', 'control · inverted pressed', 'authored NC contact → bounded AVR projection', 'model-projected'],
  ['switch.limit-spdt-v1', 'actuated', 'contact projection · spring return', 'authored COM/NC/NO state → bounded AVR projection', 'model-projected'],
  ['switch.dip-4-v1', 'switch1', 'contact projection · maintained channel 1', 'authored DIP contact → bounded AVR projection', 'model-projected'],
  ['switch.dip-4-v1', 'switch2', 'contact projection · maintained channel 2', 'authored DIP contact → bounded AVR projection', 'model-projected'],
  ['switch.dip-4-v1', 'switch3', 'contact projection · maintained channel 3', 'authored DIP contact → bounded AVR projection', 'model-projected'],
  ['switch.dip-4-v1', 'switch4', 'contact projection · maintained channel 4', 'authored DIP contact → bounded AVR projection', 'model-projected'],
  ['input.rotary-encoder-button-v1', 'detent', 'digital-sequence · four ordered phases', 'A/B inputs → executed firmware', 'model-projected'],
  ['input.rotary-encoder-button-v1', 'pressed', 'contact projection · shaft button', 'authored SW contact → bounded AVR projection', 'model-projected'],
  ['switch.reed-no-v1', 'magnetPresent', 'contact projection · magnetic presence', 'authored reed contact → bounded AVR projection', 'model-projected'],
  ['switch.emergency-stop-nc-v1', 'latched', 'contact projection · instructional latch', 'authored NC stop contact → bounded AVR projection', 'model-projected'],
  ['switch.foot-pedal-no-v1', 'pressed', 'contact projection · pedal press', 'authored pedal contact → bounded AVR projection', 'model-projected'],
  ['switch.rotary-selector-4-v1', 'position', 'contact projection · selected one-of-four throw', 'authored COM/P1–P4 contact → bounded AVR projection', 'model-projected'],
  ['sensor.light-analogue-v1', 'lightLevel', 'control · position', 'A0 ADC → executed firmware → USART/D13', 'actual-executed'],
  ['sensor.temperature-analogue-v1', 'temperatureC', 'control · normalized position', 'A1 ADC → executed firmware → USART/D13', 'actual-executed'],
  ['sensor.light-threshold-digital-v1', 'lightLevelPercent', 'control · derived pressed', 'D2 module output → executed firmware → USART/D13', 'actual-executed'],
  ['sensor.light-threshold-digital-v1', 'thresholdPercent', 'control · derived pressed', 'D2 module output → executed firmware → USART/D13', 'actual-executed'],
  ['sensor.light-threshold-digital-v1', 'hysteresisPercentagePoints', 'control · derived pressed', 'D2 module output → executed firmware → USART/D13', 'actual-executed'],
  ['sensor.light-threshold-digital-v1', 'outputActive', 'derived state · emitted as control pressed', 'D2 module output → executed firmware → USART/D13', 'actual-executed-derived'],
  ['input.rotary-encoder-quadrature-v1', 'detent', 'digital-sequence · four ordered phases', 'D2/D3 inputs → executed firmware → USART', 'actual-executed'],
  ['input.analog-joystick-2axis-v1', 'x', 'control · X position', 'A0 ADC → executed firmware → USART', 'actual-executed'],
  ['input.analog-joystick-2axis-v1', 'y', 'control · Y position', 'A1 ADC → executed firmware → USART', 'actual-executed'],
  ['input.analog-joystick-2axis-v1', 'pressed', 'contact projection · shaft button', 'D2 input → executed firmware → USART', 'actual-executed'],
  ['input.matrix-keypad-3x4-v1', 'pressedKey', 'digital bridge · selected row and column', 'D2–D8 scan → executed firmware → USART', 'actual-executed'],
  ['input.matrix-keypad-4x4-v1', 'pressedKey', 'digital bridge · selected row and column', 'D2–D9 scan → executed firmware → USART', 'actual-executed'],
].map(([model, field, workerEvent, observable, evidence]) => Object.freeze({
  profile: AVR_PROFILE,
  model,
  field,
  authored: field !== 'outputActive',
  workerEvent,
  observable,
  evidence,
  evidenceSource: ['thresholdPercent', 'hysteresisPercentagePoints', 'outputActive'].includes(field)
    ? 'test/control-runtime-evidence-browser.cjs'
    : 'test/control-persistence-browser.cjs',
}));

const expected = controlPersistenceInventory()
  .filter((cell) => cell.profile === AVR_PROFILE && cell.available)
  .flatMap((cell) => cell.controls.map((control) => `${cell.type}.${control.key}`))
  .sort();
const actual = rows.map((row) => `${row.model}.${row.field}`).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('CONTROL_RUNTIME_EVIDENCE_MATRIX_MISMATCH');

export const CONTROL_RUNTIME_EVIDENCE = Object.freeze({
  schema: CONTROL_RUNTIME_EVIDENCE_SCHEMA,
  profile: AVR_PROFILE,
  models: new Set(rows.map((row) => row.model)).size,
  fields: rows.length,
  authority: 'current source-bound worker runtime only',
  excluded: Object.freeze(['saved model state alone', 'replayed event history', 'inferred pin values']),
  rows: Object.freeze(rows),
});

export function controlRuntimeEvidenceMatrix() {
  return structuredClone(CONTROL_RUNTIME_EVIDENCE);
}
