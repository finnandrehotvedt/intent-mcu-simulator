// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';

export const SEEDED_PROPERTY_SUITE_SCHEMA = 'intent-mcu-seeded-property-suite@1';
export const SEEDED_PROPERTY_ALGORITHM = 'lcg32-1664525-1013904223-v1';
export const SEEDED_PROPERTY_ALGORITHM_VERSION = 1;
export const SEEDED_PROPERTY_CASE_COUNT = 8;
export const SEEDED_PROPERTY_SEED = Object.freeze({ minimum: 0, maximum: 0xffff_ffff });
export const SEEDED_PROPERTY_VALID_INPUTS = Object.freeze({
  temperatureC: Object.freeze({ minimum: -50, maximum: 150, integer: true }),
  buttonPressed: Object.freeze([false, true]),
});
export const SEEDED_PROPERTY_RESOURCE_BUDGET = Object.freeze({
  generatorSteps: 15,
  scenarios: 8,
  eventsPerScenario: 3,
  totalEvents: 24,
  maximumVirtualMilliseconds: 350,
});

const clone = (value) => structuredClone(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function normalizeSeededPropertySuite(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, [
        'schema', 'algorithm', 'algorithmVersion', 'seed', 'caseCount', 'validInputs', 'resourceBudget',
      ])
      || value.schema !== SEEDED_PROPERTY_SUITE_SCHEMA
      || value.algorithm !== SEEDED_PROPERTY_ALGORITHM
      || value.algorithmVersion !== SEEDED_PROPERTY_ALGORITHM_VERSION
      || !Number.isSafeInteger(value.seed)
      || value.seed < SEEDED_PROPERTY_SEED.minimum || value.seed > SEEDED_PROPERTY_SEED.maximum
      || value.caseCount !== SEEDED_PROPERTY_CASE_COUNT
      || !same(value.validInputs, SEEDED_PROPERTY_VALID_INPUTS)
      || !same(value.resourceBudget, SEEDED_PROPERTY_RESOURCE_BUDGET)) {
    throw Object.assign(new Error('SEEDED_PROPERTY_SUITE_SHAPE'), { details: ['$scenarioTimeline.propertySuite'] });
  }
  return {
    schema: SEEDED_PROPERTY_SUITE_SCHEMA,
    algorithm: SEEDED_PROPERTY_ALGORITHM,
    algorithmVersion: SEEDED_PROPERTY_ALGORITHM_VERSION,
    seed: value.seed,
    caseCount: SEEDED_PROPERTY_CASE_COUNT,
    validInputs: clone(SEEDED_PROPERTY_VALID_INPUTS),
    resourceBudget: clone(SEEDED_PROPERTY_RESOURCE_BUDGET),
  };
}

export function seededPropertySuite(seed) {
  return normalizeSeededPropertySuite({
    schema: SEEDED_PROPERTY_SUITE_SCHEMA,
    algorithm: SEEDED_PROPERTY_ALGORITHM,
    algorithmVersion: SEEDED_PROPERTY_ALGORITHM_VERSION,
    seed,
    caseCount: SEEDED_PROPERTY_CASE_COUNT,
    validInputs: clone(SEEDED_PROPERTY_VALID_INPUTS),
    resourceBudget: clone(SEEDED_PROPERTY_RESOURCE_BUDGET),
  });
}

export function thermostatMeasuredTemperatureC(moduleTemperatureC) {
  if (!Number.isInteger(moduleTemperatureC)
      || moduleTemperatureC < SEEDED_PROPERTY_VALID_INPUTS.temperatureC.minimum
      || moduleTemperatureC > SEEDED_PROPERTY_VALID_INPUTS.temperatureC.maximum) {
    throw new TypeError('SEEDED_PROPERTY_TEMPERATURE_RANGE');
  }
  const normalized = (moduleTemperatureC + 50) / 200;
  const raw = Math.min(Math.max(Math.floor(normalized * 1024), 0), 1023);
  return Math.floor((raw * 200) / 1024) - 50;
}

export function generateSeededPropertyScenarios(value) {
  const suite = normalizeSeededPropertySuite(value);
  let state = suite.seed >>> 0;
  let steps = 0;
  const next = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    steps += 1;
    return state;
  };
  const anchorIndex = next() % suite.caseCount;
  const scenarios = [];
  for (let index = 0; index < suite.caseCount; index += 1) {
    let temperatureC; let buttonPressed;
    if (index === anchorIndex) {
      temperatureC = 31;
      buttonPressed = true;
    } else {
      temperatureC = SEEDED_PROPERTY_VALID_INPUTS.temperatureC.minimum
        + (next() % (SEEDED_PROPERTY_VALID_INPUTS.temperatureC.maximum
          - SEEDED_PROPERTY_VALID_INPUTS.temperatureC.minimum + 1));
      buttonPressed = Boolean(next() & 1);
      // Keep one unambiguous equality counterexample for the reviewed <= defect.
      if (temperatureC === 31 && buttonPressed) buttonPressed = false;
    }
    const measuredTemperatureC = thermostatMeasuredTemperatureC(temperatureC);
    const expectedLevel = buttonPressed && measuredTemperatureC < 30;
    const ordinal = String(index + 1).padStart(2, '0');
    const scenarioId = `PROPERTY-CASE-${ordinal}`;
    scenarios.push({
      id: scenarioId,
      name: `Seed ${suite.seed} · case ${index + 1}`,
      events: [
        { id: `${scenarioId}-TEMP`, atMilliseconds: 0, kind: 'input.temperature-c',
          componentId: 'temperature-sensor-1', valueC: temperatureC },
        { id: `${scenarioId}-BUTTON`, atMilliseconds: 0, kind: 'input.button-pressed',
          componentId: 'enable-button-1', pressed: buttonPressed },
        { id: `${scenarioId}-D13`, atMilliseconds: 160, throughMilliseconds: 350,
          kind: 'expect.pin-level', pin: 'D13', level: expectedLevel },
      ],
    });
  }
  if (steps !== SEEDED_PROPERTY_RESOURCE_BUDGET.generatorSteps) {
    throw new Error('SEEDED_PROPERTY_RESOURCE_BUDGET');
  }
  return scenarios;
}
