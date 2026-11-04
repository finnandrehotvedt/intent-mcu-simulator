// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  measuredOutputPwm,
  SOFTWARE_SERVO_PULSE_LIMITS,
} from '../src/atmega328p-adapter.mjs';

const pulse = (periodCycles, highCycles) => [
  { cycle: 100, level: true },
  { cycle: 100 + highCycles, level: false },
  { cycle: 100 + periodCycles, level: true },
];

test('software servo pulses expose exact worker-measured frame, high time and duty', () => {
  assert.deepEqual(SOFTWARE_SERVO_PULSE_LIMITS, {
    frameCyclesMinimum: 160_000,
    frameCyclesMaximum: 480_000,
    highCyclesMinimum: 16_000,
    highCyclesMaximum: 32_000,
  });
  assert.deepEqual(measuredOutputPwm(pulse(320_000, 16_000)), {
    periodCycles: 320_000, highCycles: 16_000, duty: 0.05,
  });
  assert.deepEqual(measuredOutputPwm(pulse(320_000, 24_000)), {
    periodCycles: 320_000, highCycles: 24_000, duty: 0.075,
  });
  assert.deepEqual(measuredOutputPwm(pulse(320_000, 32_000)), {
    periodCycles: 320_000, highCycles: 32_000, duty: 0.1,
  });
});

test('software waveform inference fails closed outside the servo pulse contract', () => {
  assert.equal(measuredOutputPwm(pulse(159_999, 16_000)), null);
  assert.equal(measuredOutputPwm(pulse(480_001, 16_000)), null);
  assert.equal(measuredOutputPwm(pulse(320_000, 15_999)), null);
  assert.equal(measuredOutputPwm(pulse(320_000, 32_001)), null);
  assert.equal(measuredOutputPwm([{ cycle: 1, level: true }]), null);
  assert.deepEqual(measuredOutputPwm(pulse(1_000, 500), { hardwarePwmActive: true }), {
    periodCycles: 1_000, highCycles: 500, duty: 0.5,
  });
});
