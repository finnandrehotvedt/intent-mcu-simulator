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
  'potentiometer.trimmer-v1': {
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
  'switch.float-no-v1': {
    liquidHigh: { kind: 'boolean', default: false, mutability: 'authored' },
  },
  'sensor.tilt-switch-no-v1': {
    tilted: { kind: 'boolean', default: false, mutability: 'authored' },
  },
  'sensor.ball-vibration-switch-no-v1': {
    vibrationDetected: { kind: 'boolean', default: false, mutability: 'authored' },
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
  'sensor.soil-moisture-resistive-analogue-v1': {
    moistureRatio: { kind: 'number', minimum: 0, maximum: 1, default: 0.5,
      unit: 'ratio', mutability: 'authored' },
  },
  'sensor.soil-moisture-capacitive-analogue-v1': {
    moistureRatio: { kind: 'number', minimum: 0, maximum: 1, default: 0.5,
      unit: 'ratio', mutability: 'authored' },
  },
  'sensor.water-level-analogue-v1': {
    waterLevelRatio: { kind: 'number', minimum: 0, maximum: 1, default: 0.5,
      unit: 'ratio', mutability: 'authored' },
  },
  'sensor.rain-analogue-v1': {
    wetnessRatio: { kind: 'number', minimum: 0, maximum: 1, default: 0.5,
      unit: 'ratio', mutability: 'authored' },
  },
  'sensor.sound-level-analogue-v1': {
    soundLevelRatio: { kind: 'number', minimum: 0, maximum: 1, default: 0.5,
      unit: 'ratio', mutability: 'authored' },
  },
  'sensor.flame-analogue-v1': {
    flameIntensityRatio: { kind: 'number', minimum: 0, maximum: 1, default: 0.5,
      unit: 'ratio', mutability: 'authored' },
  },
  'sensor.mq-gas-analogue-v1': {
    gasResponseRatio: { kind: 'number', minimum: 0, maximum: 1, default: 0.5,
      unit: 'ratio', mutability: 'authored' },
  },
  'sensor.co2-analogue-v1': {
    co2ResponseRatio: { kind: 'number', minimum: 0, maximum: 1, default: 0.5,
      unit: 'ratio', mutability: 'authored' },
  },
  'sensor.uv-analogue-v1': {
    uvResponseRatio: { kind: 'number', minimum: 0, maximum: 1, default: 0.5,
      unit: 'ratio', mutability: 'authored' },
  },
  'sensor.wind-direction-analogue-v1': {
    directionDegrees: { kind: 'number', minimum: 0, maximum: 360, default: 180,
      unit: '°', mutability: 'authored' },
  },
  'sensor.hall-magnetic-analogue-v1': {
    magneticFieldRatio: { kind: 'number', minimum: -1, maximum: 1, default: 0,
      unit: 'signed ratio', mutability: 'authored' },
  },
  'sensor.tmp36-temperature-analogue-v1': {
    temperatureC: { kind: 'number', minimum: -40, maximum: 125, default: 25,
      unit: '°C', mutability: 'authored' },
  },
  'sensor.lm35-temperature-analogue-v1': {
    temperatureC: { kind: 'number', minimum: 0, maximum: 150, default: 25,
      unit: '°C', mutability: 'authored' },
  },
  'sensor.ldr-divider-v1': {
    lightLevel: { kind: 'number', minimum: 0, maximum: 1, default: 0.5,
      unit: 'ratio', mutability: 'authored' },
  },
  'sensor.ntc-10k-divider-v1': {
    temperatureC: { kind: 'number', minimum: -40, maximum: 125, default: 25,
      unit: '°C', mutability: 'authored' },
  },
  'sensor.flex-divider-v1': {
    bendRatio: { kind: 'number', minimum: 0, maximum: 1, default: 0,
      unit: 'ratio', mutability: 'authored' },
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
  'input.capacitive-touch-button-v1': {
    touched: { kind: 'boolean', default: false, mutability: 'authored' },
  },
  'sensor.pir-motion-v1': {
    motionDetected: { kind: 'boolean', default: false, mutability: 'authored' },
  },
  'sensor.hall-switch-digital-v1': {
    magnetPresent: { kind: 'boolean', default: false, mutability: 'authored' },
  },
  'sensor.flow-pulse-digital-v1': {
    pulseHigh: { kind: 'boolean', default: false, mutability: 'authored' },
  },
  'sensor.wind-speed-pulse-digital-v1': {
    pulseHigh: { kind: 'boolean', default: false, mutability: 'authored' },
  },
  'sensor.ir-obstacle-reflective-v1': {
    obstacleDetected: { kind: 'boolean', default: false, mutability: 'authored' },
  },
  'sensor.line-tracking-reflective-v1': {
    lineDetected: { kind: 'boolean', default: false, mutability: 'authored' },
  },
  'sensor.dht11-temperature-humidity-v1': {
    temperatureC: { kind: 'integer', minimum: 0, maximum: 50, default: 25,
      unit: '°C', mutability: 'authored' },
    humidityPercent: { kind: 'integer', minimum: 20, maximum: 90, default: 50,
      unit: '%RH', mutability: 'authored' },
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
