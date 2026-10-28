// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const PASSIVE_PIEZO_TYPE = 'output.passive-piezo-v1';
export const PASSIVE_PIEZO_CONTRACT = Object.freeze({
  schema: 'intent-mcu-passive-piezo-contract@1',
  requirementId: 'CMP-063',
  type: PASSIVE_PIEZO_TYPE,
  profile: 'board.atmega328p-16mhz-v1',
  terminals: Object.freeze(['SIGNAL', 'GND']),
  supportedSignalPins: Object.freeze(['D3', 'D5', 'D6', 'D9', 'D10', 'D11']),
  runtime: Object.freeze({
    input: 'observed AVR PWM/digital output transitions',
    output: 'visual driven/rest state and observed transition activity only',
  }),
  exclusions: Object.freeze([
    'audio playback', 'loudness', 'sound pressure', 'resonance', 'frequency calibration',
    'capacitance', 'current draw', 'acoustic coupling', 'physical piezo accuracy',
  ]),
});

export function validatePassivePiezoContract(value = PASSIVE_PIEZO_CONTRACT) {
  return value?.schema === 'intent-mcu-passive-piezo-contract@1'
    && value.requirementId === 'CMP-063'
    && value.type === PASSIVE_PIEZO_TYPE
    && value.profile === 'board.atmega328p-16mhz-v1'
    && JSON.stringify(value.terminals) === JSON.stringify(['SIGNAL', 'GND'])
    && JSON.stringify(value.supportedSignalPins) === JSON.stringify(['D3', 'D5', 'D6', 'D9', 'D10', 'D11'])
    && value.runtime?.output === 'visual driven/rest state and observed transition activity only'
    && value.exclusions?.includes('audio playback')
    && value.exclusions?.includes('frequency calibration')
    && value.exclusions?.includes('physical piezo accuracy');
}

