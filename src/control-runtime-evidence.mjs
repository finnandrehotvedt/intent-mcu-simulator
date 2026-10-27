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
  ['switch.float-no-v1', 'liquidHigh', 'contact projection · liquid state', 'authored float contact → bounded AVR projection', 'model-projected'],
  ['sensor.tilt-switch-no-v1', 'tilted', 'contact projection · orientation state', 'authored tilt contact → bounded AVR projection', 'model-projected'],
  ['sensor.ball-vibration-switch-no-v1', 'vibrationDetected', 'contact projection · vibration snapshot', 'authored vibration contact → bounded AVR projection', 'model-projected'],
  ['switch.rotary-selector-4-v1', 'position', 'contact projection · selected one-of-four throw', 'authored COM/P1–P4 contact → bounded AVR projection', 'model-projected'],
  ['sensor.light-analogue-v1', 'lightLevel', 'control · position', 'A0 ADC → executed firmware → USART/D13', 'actual-executed'],
  ['sensor.temperature-analogue-v1', 'temperatureC', 'control · normalized position', 'A1 ADC → executed firmware → USART/D13', 'actual-executed'],
  ['sensor.soil-moisture-resistive-analogue-v1', 'moistureRatio', 'control · normalized position', 'A2 ADC → executed firmware → USART', 'actual-executed'],
  ['sensor.soil-moisture-capacitive-analogue-v1', 'moistureRatio', 'control · normalized position', 'A3 ADC → executed firmware → USART', 'actual-executed'],
  ['sensor.water-level-analogue-v1', 'waterLevelRatio', 'control · normalized position', 'A4 ADC → executed firmware → USART', 'actual-executed'],
  ['sensor.rain-analogue-v1', 'wetnessRatio', 'control · normalized position', 'A0 ADC → executed firmware → USART', 'actual-executed'],
  ['sensor.sound-level-analogue-v1', 'soundLevelRatio', 'control · normalized position', 'A1 ADC → executed firmware → USART', 'actual-executed'],
  ['sensor.flame-analogue-v1', 'flameIntensityRatio', 'control · normalized position', 'A5 ADC → executed firmware → USART', 'actual-executed'],
  ['sensor.mq-gas-analogue-v1', 'gasResponseRatio', 'control · normalized position', 'A2 ADC → executed firmware → USART', 'actual-executed'],
  ['sensor.co2-analogue-v1', 'co2ResponseRatio', 'control · normalized position', 'A3 ADC → executed firmware → USART', 'actual-executed'],
  ['sensor.uv-analogue-v1', 'uvResponseRatio', 'control · normalized position', 'A4 ADC → executed firmware → USART', 'actual-executed'],
  ['sensor.wind-direction-analogue-v1', 'directionDegrees', 'control · normalized direction position', 'A0 ADC → executed firmware → USART', 'actual-executed'],
  ['sensor.hall-magnetic-analogue-v1', 'magneticFieldRatio', 'control · normalized bipolar position', 'A1 ADC → executed firmware → USART', 'actual-executed'],
  ['sensor.tmp36-temperature-analogue-v1', 'temperatureC', 'control · TMP36 transfer position', 'A0 ADC → executed firmware → USART', 'actual-executed'],
  ['sensor.lm35-temperature-analogue-v1', 'temperatureC', 'control · LM35 transfer position', 'A1 ADC → executed firmware → USART', 'actual-executed'],
  ['sensor.ldr-divider-v1', 'lightLevel', 'control · LDR divider transfer position', 'A0 ADC → executed firmware → USART', 'actual-executed'],
  ['sensor.ntc-10k-divider-v1', 'temperatureC', 'control · B3950 divider transfer position', 'A1 ADC → executed firmware → USART', 'actual-executed'],
  ['sensor.flex-divider-v1', 'bendRatio', 'control · flex divider transfer position', 'A2 ADC → executed firmware → USART', 'actual-executed'],
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
  ['input.capacitive-touch-button-v1', 'touched', 'control · active-high digital state', 'D4 input → executed firmware → USART', 'actual-executed'],
  ['sensor.pir-motion-v1', 'motionDetected', 'control · active-high digital state', 'D5 input → executed firmware → USART', 'actual-executed'],
  ['sensor.hall-switch-digital-v1', 'magnetPresent', 'control · active-high digital state', 'D6 input → executed firmware → USART', 'actual-executed'],
  ['sensor.flow-pulse-digital-v1', 'pulseHigh', 'control · manual active-high pulse level', 'authored pulse snapshot → bounded AVR projection', 'model-projected'],
  ['sensor.wind-speed-pulse-digital-v1', 'pulseHigh', 'control · manual active-high pulse level', 'authored pulse snapshot → bounded AVR projection', 'model-projected'],
  ['sensor.ir-obstacle-reflective-v1', 'obstacleDetected', 'control · active-low digital state', 'D7 input → executed firmware → USART', 'actual-executed'],
  ['sensor.line-tracking-reflective-v1', 'lineDetected', 'control · active-low digital state', 'D8 input → executed firmware → USART', 'actual-executed'],
].map(([model, field, workerEvent, observable, evidence]) => Object.freeze({
  profile: AVR_PROFILE,
  model,
  field,
  authored: field !== 'outputActive',
  workerEvent,
  observable,
  evidence,
  evidenceSource: ['sensor.ldr-divider-v1', 'sensor.ntc-10k-divider-v1',
    'sensor.flex-divider-v1'].includes(model)
    ? 'test/resistive-divider-sensors-browser.cjs'
    : model === 'sensor.tmp36-temperature-analogue-v1'
      || model === 'sensor.lm35-temperature-analogue-v1'
    ? 'test/analogue-temperature-ic-sensors-browser.cjs'
    : ['directionDegrees', 'magneticFieldRatio'].includes(field)
    ? 'test/analogue-direction-field-sensors-browser.cjs'
    : ['gasResponseRatio', 'co2ResponseRatio', 'uvResponseRatio'].includes(field)
    ? 'test/analogue-exposure-sensors-browser.cjs'
    : ['wetnessRatio', 'soundLevelRatio', 'flameIntensityRatio'].includes(field)
    ? 'test/analogue-detection-sensors-browser.cjs'
    : ['moistureRatio', 'waterLevelRatio'].includes(field)
    ? 'test/analogue-moisture-level-sensors-browser.cjs'
    : ['obstacleDetected', 'lineDetected'].includes(field)
    ? 'test/digital-reflective-sensors-browser.cjs'
    : ['sensor.flow-pulse-digital-v1', 'sensor.wind-speed-pulse-digital-v1'].includes(model)
    ? 'test/digital-pulse-sensors-browser.cjs'
    : ['liquidHigh', 'tilted', 'vibrationDetected'].includes(field)
      ? 'test/contact-sensors-browser.cjs'
    : ['touched', 'motionDetected', 'magnetPresent'].includes(field)
      ? 'test/digital-presence-sensors-browser.cjs'
    : ['thresholdPercent', 'hysteresisPercentagePoints', 'outputActive'].includes(field)
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
