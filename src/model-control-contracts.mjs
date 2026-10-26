// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

export const MODEL_CONTROL_CONTRACTS = freeze({
  'button.momentary-v1': {
    pressed: { kind: 'boolean', default: false, mutability: 'authored' },
  },
  'potentiometer.linear-v1': {
    position: { kind: 'number', minimum: 0, maximum: 1, default: 0.5,
      unit: 'ratio', mutability: 'authored' },
  },
  'switch.toggle-spst-v1': {
    closed: { kind: 'boolean', default: false, mutability: 'authored' },
  },
  'switch.changeover-spdt-v1': {
    selectedThrow: { kind: 'enum', values: ['A', 'B'], default: 'A',
      mutability: 'authored' },
  },
  'switch.slide-spdt-v1': {
    selectedThrow: { kind: 'enum', values: ['A', 'B'], default: 'A', mutability: 'authored' },
  },
  'button.momentary-nc-v1': {
    pressed: { kind: 'boolean', default: false, mutability: 'authored' },
  },
  'switch.limit-spdt-v1': {
    actuated: { kind: 'boolean', default: false, mutability: 'authored' },
  },
  'switch.dip-4-v1': {
    switch1: { kind: 'boolean', default: false, mutability: 'authored' },
    switch2: { kind: 'boolean', default: false, mutability: 'authored' },
    switch3: { kind: 'boolean', default: false, mutability: 'authored' },
    switch4: { kind: 'boolean', default: false, mutability: 'authored' },
  },
  'input.rotary-encoder-button-v1': {
    detent: { kind: 'integer', minimum: -999, maximum: 999, default: 0,
      unit: 'detent', mutability: 'transition-only' },
    pressed: { kind: 'boolean', default: false, mutability: 'authored' },
  },
  'switch.reed-no-v1': {
    magnetPresent: { kind: 'boolean', default: false, mutability: 'authored' },
  },
  'switch.emergency-stop-nc-v1': {
    latched: { kind: 'boolean', default: false, mutability: 'authored' },
  },
  'switch.foot-pedal-no-v1': {
    pressed: { kind: 'boolean', default: false, mutability: 'authored' },
  },
  'switch.rotary-selector-4-v1': {
    position: { kind: 'integer', minimum: 1, maximum: 4, default: 1,
      unit: 'position', mutability: 'authored' },
  },
  'input.analog-joystick-2axis-v1': {
    x: { kind: 'number', minimum: 0, maximum: 1, default: 0.5, unit: 'ratio', mutability: 'authored' },
    y: { kind: 'number', minimum: 0, maximum: 1, default: 0.5, unit: 'ratio', mutability: 'authored' },
    pressed: { kind: 'boolean', default: false, mutability: 'authored' },
  },
  'input.matrix-keypad-3x4-v1': {
    pressedKey: { kind: 'enum', values: ['none', 'R1C1', 'R1C2', 'R1C3', 'R2C1', 'R2C2', 'R2C3', 'R3C1', 'R3C2', 'R3C3', 'R4C1', 'R4C2', 'R4C3'], default: 'none', mutability: 'authored' },
  },
  'input.matrix-keypad-4x4-v1': {
    pressedKey: { kind: 'enum', values: ['none', 'R1C1', 'R1C2', 'R1C3', 'R1C4', 'R2C1', 'R2C2', 'R2C3', 'R2C4', 'R3C1', 'R3C2', 'R3C3', 'R3C4', 'R4C1', 'R4C2', 'R4C3', 'R4C4'], default: 'none', mutability: 'authored' },
  },
  'sensor.light-analogue-v1': {
    lightLevel: { kind: 'number', minimum: 0, maximum: 1, default: 0.5,
      unit: 'ratio', mutability: 'authored' },
  },
  'sensor.temperature-analogue-v1': {
    temperatureC: { kind: 'number', minimum: -50, maximum: 150, default: 25,
      unit: '°C', mutability: 'authored' },
  },
  'sensor.light-threshold-digital-v1': {
    lightLevelPercent: { kind: 'number', minimum: 0, maximum: 100, default: 40,
      unit: '%', mutability: 'authored' },
    thresholdPercent: { kind: 'number', minimum: 10, maximum: 100, default: 50,
      unit: '%', mutability: 'authored' },
    hysteresisPercentagePoints: { kind: 'number', minimum: 0, maximum: 10, default: 5,
      unit: 'percentage-point', mutability: 'authored' },
    outputActive: { kind: 'boolean', default: false, mutability: 'derived' },
  },
  'input.rotary-encoder-quadrature-v1': {
    detent: { kind: 'integer', minimum: -999, maximum: 999, default: 0,
      unit: 'detent', mutability: 'transition-only' },
  },
});

export function controlContractsFor(type, controlKeys = []) {
  const contracts = MODEL_CONTROL_CONTRACTS[type] ?? {};
  const keys = Object.keys(contracts);
  if (JSON.stringify([...keys].sort()) !== JSON.stringify([...controlKeys].sort())) {
    throw new Error(`MODEL_CONTROL_CONTRACT_MISMATCH:${type}`);
  }
  return structuredClone(contracts);
}
