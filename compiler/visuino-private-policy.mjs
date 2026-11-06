// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';

export const VISUINO_WATER_TANK_POLICY_ID = 'visuino-water-tank-exact-preview@1';
export const VISUINO_WATER_TANK_INTAKE_SOURCE_SHA256 = 'c62b54d819a86e7f413849c6f3941a5abf0a5bb44c3a4fb2fdbc90d057a48f87';
export const VISUINO_WATER_TANK_SOURCE_CONTENT_SHA256 = '5fc21984366a4b6cc146f7afefce9c05c158eef3f046f72ed35c3841185d81bc';
export const VISUINO_WATER_TANK_MANIFEST_SHA256 = '02a8440db5fed00f9fd6dc67ef29b33fb0f7f03d896b608b5c45dfe048130798';
export const VISUINO_PRIVATE_MOUNT_PATH = '/opt/intent-private';

export const VISUINO_WATER_TANK_SYSTEM_HEADERS = Object.freeze([
  'OpenWire.h',
  'Mitov.h',
  'Wire.h',
  'Mitov_Basic_I2C.h',
  'Mitov_I2C.h',
  'Mitov_ArduinoBasicDigitalInputChannel.h',
  'Mitov_ArduinoBasicDigitalInputOutputChannel.h',
  'Mitov_ArduinoBasicDigitalChannel.h',
  'Mitov_ArduinoBasicDigitalPWMChannel.h',
  'Mitov_ArduinoCombinedAnalogDigitalChannel.h',
  'Mitov_Math.h',
  'Mitov_Button.h',
  'Mitov_LogicGates.h',
  'Mitov_LogicFlipFlops.h',
  'Mitov_CommonMux.h',
  'Mitov_Converters.h',
  'Mitov_LiquidCrystalDisplay.h',
  'Mitov_LiquidCrystalDisplay_I2C.h',
  'Mitov_FormattedText.h',
  'Mitov_Timing.h',
]);

export const VISUINO_WATER_TANK_MANIFEST_CONTRACT = Object.freeze({
  purpose: 'PRIVATE user-owned build dependency intake for exact water-tank sketch; do not publish or put sources in public assets',
  library: 'Visuino',
  version: '8.0.0-169',
  files: 820,
});

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function isVisuinoWaterTankRequest(request, policyId) {
  return policyId === VISUINO_WATER_TANK_POLICY_ID
    && request?.board === 'board.atmega328p-16mhz-v1'
    && Array.isArray(request.files)
    && request.files.length === 1
    && request.files[0]?.name === 'main.ino'
    && typeof request.files[0]?.content === 'string'
    && sha256(request.files[0].content) === VISUINO_WATER_TANK_SOURCE_CONTENT_SHA256;
}

export function privateSystemHeadersForRequest(request, policyId) {
  return isVisuinoWaterTankRequest(request, policyId)
    ? VISUINO_WATER_TANK_SYSTEM_HEADERS : Object.freeze([]);
}
