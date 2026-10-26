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
