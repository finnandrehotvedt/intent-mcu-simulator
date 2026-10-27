// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { selectedBinaryRuntimeControl } from '../src/selected-runtime-control.mjs';

const cases = [
  ['switch.float-no-v1', 'liquidHigh'], ['sensor.tilt-switch-no-v1', 'tilted'],
  ['sensor.ball-vibration-switch-no-v1', 'vibrationDetected'],
  ['input.capacitive-touch-button-v1', 'touched'],
  ['sensor.pir-motion-v1', 'motionDetected'],
  ['sensor.hall-switch-digital-v1', 'magnetPresent'],
  ['sensor.ir-obstacle-reflective-v1', 'obstacleDetected'],
  ['sensor.line-tracking-reflective-v1', 'lineDetected'],
  ['sensor.flow-pulse-digital-v1', 'pulseHigh'],
  ['sensor.wind-speed-pulse-digital-v1', 'pulseHigh'],
  ['switch.reed-no-v1', 'magnetPresent'], ['switch.emergency-stop-nc-v1', 'latched'],
];

test('selected Run control exposes exact bounded binary sensor keys', () => {
  for (const [type, key] of cases) {
    assert.deepEqual(selectedBinaryRuntimeControl({ type, controls: { [key]: false } }),
      { key, momentary: false });
    assert.equal(selectedBinaryRuntimeControl({ type, controls: { [key]: 'false' } }), null);
  }
});

test('unknown and numeric controls remain unavailable to the binary Space path', () => {
  assert.equal(selectedBinaryRuntimeControl({ type: 'sensor.unknown-v1', controls: { active: false } }), null);
  assert.equal(selectedBinaryRuntimeControl({ type: 'sensor.flow-pulse-digital-v1', controls: { pulseHigh: 0 } }), null);
});
