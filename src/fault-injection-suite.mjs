// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';

export const FAULT_INJECTION_SUITE_SCHEMA = 'intent-mcu-fault-injection-suite@1';
export const FAULT_SCENARIO_TIMELINE_SCHEMA = 'intent-mcu-scenario-timeline@3';
export const FAULT_MODEL_VERSION = 1;
export const BUTTON_BOUNCE_PATTERN_MS = Object.freeze([0, 2, 4, 6, 8]);
export const FAULT_INJECTION_LIMITS = Object.freeze({
  scenarios: 3,
  faultEvents: 3,
  maximumFaultEventsPerScenario: 1,
  maximumBounceTransitions: 5,
  maximumVirtualMilliseconds: 350,
});
export const SUPPORTED_FAULTS = Object.freeze([
  'fault.button-bounce-v1',
  'fault.temperature-stuck-v1',
  'fault.button-open-circuit-v1',
]);
export const UNSUPPORTED_FAULTS = Object.freeze([
  Object.freeze({ id: 'fault.bus-response-v1', reason: 'This thermostat timeline has no bus endpoint; use the separate bounded AVR USART0 response fixture.' }),
]);

const clone = (value) => structuredClone(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function normalizeFaultInjectionSuite(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, ['schema', 'modelVersion', 'supportedFaults', 'unsupportedFaults', 'limits'])
      || value.schema !== FAULT_INJECTION_SUITE_SCHEMA
      || value.modelVersion !== FAULT_MODEL_VERSION
      || !same(value.supportedFaults, SUPPORTED_FAULTS)
      || !same(value.unsupportedFaults, UNSUPPORTED_FAULTS)
      || !same(value.limits, FAULT_INJECTION_LIMITS)) {
    throw Object.assign(new Error('FAULT_INJECTION_SUITE_SHAPE'),
      { details: ['$scenarioTimeline.faultSuite'] });
  }
  return {
    schema: FAULT_INJECTION_SUITE_SCHEMA,
    modelVersion: FAULT_MODEL_VERSION,
    supportedFaults: clone(SUPPORTED_FAULTS),
    unsupportedFaults: clone(UNSUPPORTED_FAULTS),
    limits: clone(FAULT_INJECTION_LIMITS),
  };
}

export function faultInjectionSuite() {
  return normalizeFaultInjectionSuite({
    schema: FAULT_INJECTION_SUITE_SCHEMA,
    modelVersion: FAULT_MODEL_VERSION,
    supportedFaults: clone(SUPPORTED_FAULTS),
    unsupportedFaults: clone(UNSUPPORTED_FAULTS),
    limits: clone(FAULT_INJECTION_LIMITS),
  });
}

export function generateFaultInjectionScenarios() {
  return [
    {
      id: 'FAULT-BUTTON-BOUNCE', name: 'Ideal D2 contact bounce',
      events: [
        { id: 'FAULT-BOUNCE-TEMP', atMilliseconds: 0, kind: 'input.temperature-c',
          componentId: 'temperature-sensor-1', valueC: 20 },
        { id: 'FAULT-BOUNCE-BUTTON', atMilliseconds: 0, kind: 'input.button-pressed',
          componentId: 'enable-button-1', pressed: false },
        { id: 'FAULT-BOUNCE-INJECT', atMilliseconds: 20, kind: 'fault.button-bounce-v1',
          componentId: 'enable-button-1', finalPressed: true,
          patternMilliseconds: [...BUTTON_BOUNCE_PATTERN_MS] },
        { id: 'FAULT-BOUNCE-D13', atMilliseconds: 160, throughMilliseconds: 350,
          kind: 'expect.pin-level', pin: 'D13', level: true },
      ],
    },
    {
      id: 'FAULT-TEMPERATURE-STUCK', name: 'A1 sensor stuck below threshold',
      events: [
        { id: 'FAULT-STUCK-TEMP-INITIAL', atMilliseconds: 0, kind: 'input.temperature-c',
          componentId: 'temperature-sensor-1', valueC: 20 },
        { id: 'FAULT-STUCK-BUTTON', atMilliseconds: 0, kind: 'input.button-pressed',
          componentId: 'enable-button-1', pressed: true },
        { id: 'FAULT-STUCK-INJECT', atMilliseconds: 20, kind: 'fault.temperature-stuck-v1',
          componentId: 'temperature-sensor-1', stuckValueC: 20 },
        { id: 'FAULT-STUCK-TEMP-REQUEST', atMilliseconds: 40, kind: 'input.temperature-c',
          componentId: 'temperature-sensor-1', valueC: 80 },
        { id: 'FAULT-STUCK-D13', atMilliseconds: 160, throughMilliseconds: 350,
          kind: 'expect.pin-level', pin: 'D13', level: true },
      ],
    },
    {
      id: 'FAULT-D2-OPEN', name: 'D2 external drive released',
      events: [
        { id: 'FAULT-OPEN-TEMP', atMilliseconds: 0, kind: 'input.temperature-c',
          componentId: 'temperature-sensor-1', valueC: 20 },
        { id: 'FAULT-OPEN-BUTTON', atMilliseconds: 0, kind: 'input.button-pressed',
          componentId: 'enable-button-1', pressed: true },
        { id: 'FAULT-OPEN-INJECT', atMilliseconds: 40, kind: 'fault.button-open-circuit-v1',
          componentId: 'enable-button-1' },
        { id: 'FAULT-OPEN-D13', atMilliseconds: 160, throughMilliseconds: 350,
          kind: 'expect.pin-level', pin: 'D13', level: false },
      ],
    },
  ];
}
