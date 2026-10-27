// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const BINARY_RUNTIME_KEYS = Object.freeze({
  'switch.float-no-v1': 'liquidHigh',
  'sensor.tilt-switch-no-v1': 'tilted',
  'sensor.ball-vibration-switch-no-v1': 'vibrationDetected',
  'input.capacitive-touch-button-v1': 'touched',
  'sensor.pir-motion-v1': 'motionDetected',
  'sensor.hall-switch-digital-v1': 'magnetPresent',
  'sensor.ir-obstacle-reflective-v1': 'obstacleDetected',
  'sensor.line-tracking-reflective-v1': 'lineDetected',
  'sensor.flow-pulse-digital-v1': 'pulseHigh',
  'sensor.wind-speed-pulse-digital-v1': 'pulseHigh',
  'switch.reed-no-v1': 'magnetPresent',
  'switch.emergency-stop-nc-v1': 'latched',
});

export function selectedBinaryRuntimeControl(component) {
  const key = BINARY_RUNTIME_KEYS[component?.type];
  if (!key || typeof component.controls?.[key] !== 'boolean') return null;
  return Object.freeze({ key, momentary: false });
}
