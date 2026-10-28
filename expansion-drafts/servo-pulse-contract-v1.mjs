// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';

export const HOBBY_SERVO_TYPE = 'output.hobby-servo-v1';
export const CONTINUOUS_SERVO_TYPE = 'output.continuous-servo-v1';
export const AVR_SERVO_SIGNAL_PINS = Object.freeze(['D3', 'D5', 'D6', 'D9', 'D10', 'D11']);
export const SERVO_FRAME_MIN_US = 10_000;
export const SERVO_FRAME_MAX_US = 30_000;
export const SERVO_PULSE_MIN_US = 1_000;
export const SERVO_PULSE_NEUTRAL_US = 1_500;
export const SERVO_PULSE_MAX_US = 2_000;
export const SERVO_CLOCK_HZ = 16_000_000;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function decodeServoPulse(sample) {
  if (!exactKeys(sample, ['periodCycles', 'highCycles'])
      || !Number.isInteger(sample.periodCycles) || sample.periodCycles <= 0
      || !Number.isInteger(sample.highCycles) || sample.highCycles < 0
      || sample.highCycles > sample.periodCycles) {
    return { ok: false, code: 'SERVO_PULSE_SAMPLE_INVALID' };
  }
  const frameUs = sample.periodCycles * 1_000_000 / SERVO_CLOCK_HZ;
  const pulseUs = sample.highCycles * 1_000_000 / SERVO_CLOCK_HZ;
  if (frameUs < SERVO_FRAME_MIN_US || frameUs > SERVO_FRAME_MAX_US
      || pulseUs < SERVO_PULSE_MIN_US || pulseUs > SERVO_PULSE_MAX_US) {
    return { ok: false, code: 'SERVO_PULSE_OUT_OF_CONTRACT', frameUs, pulseUs };
  }
  const normalized = clamp((pulseUs - SERVO_PULSE_MIN_US)
    / (SERVO_PULSE_MAX_US - SERVO_PULSE_MIN_US), 0, 1);
  return { ok: true, code: 'OK', frameUs, pulseUs, normalized };
}

export function hobbyServoPosition(sample) {
  const decoded = decodeServoPulse(sample);
  if (!decoded.ok) return decoded;
  return { ...decoded, angleDegrees: decoded.normalized * 180 };
}

export function continuousServoCommand(sample, neutralDeadbandUs = 20) {
  const decoded = decodeServoPulse(sample);
  if (!decoded.ok) return decoded;
  if (!Number.isFinite(neutralDeadbandUs) || neutralDeadbandUs < 0 || neutralDeadbandUs > 200) {
    return { ok: false, code: 'SERVO_NEUTRAL_DEADBAND_INVALID' };
  }
  const deltaUs = decoded.pulseUs - SERVO_PULSE_NEUTRAL_US;
  const direction = Math.abs(deltaUs) <= neutralDeadbandUs ? 'stopped'
    : deltaUs < 0 ? 'reverse' : 'forward';
  const command = direction === 'stopped' ? 0
    : Math.sign(deltaUs) * clamp((Math.abs(deltaUs) - neutralDeadbandUs)
      / (500 - neutralDeadbandUs), 0, 1);
  return { ...decoded, direction, command };
}
