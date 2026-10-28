// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  continuousServoCommand, decodeServoPulse, hobbyServoPosition,
} from '../expansion-drafts/servo-pulse-contract-v1.mjs';

const pulse = (pulseUs, frameUs = 20_000) => ({
  periodCycles: frameUs * 16,
  highCycles: pulseUs * 16,
});

test('CMP-066 maps bounded AVR servo pulses to idealized 0–180 degree intent', () => {
  assert.equal(hobbyServoPosition(pulse(1_000)).angleDegrees, 0);
  assert.equal(hobbyServoPosition(pulse(1_500)).angleDegrees, 90);
  assert.equal(hobbyServoPosition(pulse(2_000)).angleDegrees, 180);
});

test('CMP-067 maps the same pulse contract to stopped/reverse/forward intent', () => {
  assert.deepEqual([1_000, 1_500, 2_000].map((width) => {
    const result = continuousServoCommand(pulse(width));
    return [result.direction, result.command];
  }), [['reverse', -1], ['stopped', 0], ['forward', 1]]);
});

test('servo decoder fails closed outside pulse, frame and sample boundaries', () => {
  assert.equal(decodeServoPulse(pulse(999)).code, 'SERVO_PULSE_OUT_OF_CONTRACT');
  assert.equal(decodeServoPulse(pulse(2_001)).code, 'SERVO_PULSE_OUT_OF_CONTRACT');
  assert.equal(decodeServoPulse(pulse(1_500, 9_999)).code, 'SERVO_PULSE_OUT_OF_CONTRACT');
  assert.equal(decodeServoPulse({ periodCycles: 1, highCycles: 2 }).code, 'SERVO_PULSE_SAMPLE_INVALID');
  assert.equal(continuousServoCommand(pulse(1_500), 201).code, 'SERVO_NEUTRAL_DEADBAND_INVALID');
});
