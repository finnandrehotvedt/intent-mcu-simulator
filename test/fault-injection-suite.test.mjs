// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalProjectEnvelope, emptyProjectBrief, prepareProjectEnvelope } from '../src/project-envelope.mjs';
import {
  ScenarioTimelineEditor, evaluateScenarioTimelineObservation, faultInjectionThermostatTimeline,
  normalizeScenarioTimeline, scenarioTimelineRuntimeEvents,
} from '../src/scenario-timeline.mjs';
import {
  BUTTON_BOUNCE_PATTERN_MS, FAULT_INJECTION_LIMITS, SUPPORTED_FAULTS, UNSUPPORTED_FAULTS,
} from '../src/fault-injection-suite.mjs';
import { THERMOSTAT_PROJECT_ADAPTER, createThermostatExperiment } from '../src/thermostat-experiment.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const adapters = Object.freeze({ [AVR]: THERMOSTAT_PROJECT_ADAPTER });

function snapshot(scenario, { actualFaults = null, d2Drive = 'RELEASED' } = {}) {
  const runtimeEvents = scenarioTimelineRuntimeEvents(scenario);
  const log = runtimeEvents.map((event, index) => event.command === 'fault'
    ? { sequence: index + 1, targetCycle: event.targetCycle, type: 'fault-request', event: event.event }
    : { sequence: index + 1, targetCycle: event.targetCycle, type: 'control',
      componentId: event.componentId, key: event.key, value: event.value });
  const fault = scenario.events.find((event) => event.kind.startsWith('fault.'));
  let faults = actualFaults;
  if (faults === null && fault.kind === 'fault.button-bounce-v1') faults = BUTTON_BOUNCE_PATTERN_MS.map(
    (offset, index) => ({ kind: 'button-bounce-transition', eventId: fault.id,
      requestedCycle: (fault.atMilliseconds + offset) * 16_000,
      appliedCycle: (fault.atMilliseconds + offset) * 16_000, drive: index % 2 ? 'HIGH' : 'LOW' }),
  );
  if (faults === null && fault.kind === 'fault.temperature-stuck-v1') faults = [
    { kind: 'temperature-stuck', eventId: fault.id, requestedCycle: 320_000,
      appliedCycle: 320_000, stuckValueC: 20, appliedVoltage: 1.75 },
    { kind: 'temperature-stuck-held', eventId: fault.id, requestedCycle: 640_000,
      appliedCycle: 640_000, requestedVoltage: 3.25, appliedVoltage: 1.75 },
  ];
  if (faults === null) faults = [{ kind: 'button-open-circuit', eventId: fault.id,
    requestedCycle: 640_000, appliedCycle: 640_000,
    externalDrive: 'RELEASED', resolvedBy: 'INPUT_PULLUP' }];
  return {
    cycle: 160 * 16_000,
    pins: [
      { pin: 'D13', mode: 'OUTPUT', level: scenario.events.at(-1).level },
      { pin: 'D2', mode: 'INPUT_PULLUP', level: true, externalDrive: d2Drive },
      { pin: 'A1', mode: 'ANALOG_INPUT', level: false, voltage: 1.75, adc: 358, faultState: 'STUCK' },
    ],
    eventLog: { pending: [], log, dropped: 0 }, faultEvents: faults,
    instruments: { serial: { text: 'producer text is corroborating only', dropped: 0 } },
  };
}

test('X23 thermostat fault suite stays at three cases and routes response faults to the separate fixture', () => {
  const timeline = faultInjectionThermostatTimeline();
  assert.equal(timeline.schema, 'intent-mcu-scenario-timeline@3');
  assert.deepEqual(timeline.faultSuite.supportedFaults, SUPPORTED_FAULTS);
  assert.deepEqual(timeline.faultSuite.unsupportedFaults, UNSUPPORTED_FAULTS);
  assert.deepEqual(timeline.faultSuite.limits, FAULT_INJECTION_LIMITS);
  assert.deepEqual(timeline.scenarios.map((scenario) => scenario.events.find(
    (event) => event.kind.startsWith('fault.'),
  ).kind), SUPPORTED_FAULTS);
  assert.deepEqual(timeline.scenarios[0].events[2].patternMilliseconds, BUTTON_BOUNCE_PATTERN_MS);
  assert.throws(() => faultInjectionThermostatTimeline('board.rp2040-pico-v1'),
    /FAULT_INJECTION_PROFILE_UNSUPPORTED/u);
});

test('X23 strict fault metadata and sequence reject drift while a manual edit clears suite provenance', () => {
  const timeline = faultInjectionThermostatTimeline();
  for (const mutation of [
    (value) => { value.faultSuite.modelVersion = 2; },
    (value) => { value.faultSuite.supportedFaults.push('fault.bus-response-v1'); },
    (value) => { value.scenarios[0].events[2].patternMilliseconds[1] = 3; },
    (value) => { value.scenarios[1].events[2].stuckValueC = 151; },
    (value) => { value.scenarios[2].events[2].componentId = 'other-button'; },
  ]) {
    const changed = structuredClone(timeline); mutation(changed);
    assert.throws(() => normalizeScenarioTimeline(changed));
  }
  const editor = new ScenarioTimelineEditor(timeline);
  const fault = editor.timeline.scenarios[1].events[2];
  assert.equal(editor.dispatch({ type: 'event.update', scenarioId: 'FAULT-TEMPERATURE-STUCK',
    eventId: fault.id, event: { ...fault, stuckValueC: 21 } }).ok, true);
  assert.equal(editor.timeline.schema, 'intent-mcu-scenario-timeline@1');
  assert.equal(Object.hasOwn(editor.timeline, 'faultSuite'), false);
  assert.equal(editor.dispatch({ type: 'undo' }).ok, true);
  assert.deepEqual(editor.timeline, timeline);
});

test('X23 canonical Save/Open stores only the exact fault schedule without authority', () => {
  const experiment = createThermostatExperiment();
  const timeline = faultInjectionThermostatTimeline();
  const text = canonicalProjectEnvelope(AVR, experiment.project, adapters, emptyProjectBrief(), timeline);
  const opened = prepareProjectEnvelope(text, adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.scenarioTimeline, timeline);
  assert.equal(opened.canonical, text);
  assert.doesNotMatch(text, /authoredResults|runtimeBinding|firmwareHex|"verdict"/u);
});

test('X23 evaluator separates requests from actual producer faults and refuses missing or mislabeled evidence', () => {
  const timeline = faultInjectionThermostatTimeline();
  for (const scenario of timeline.scenarios) {
    const result = evaluateScenarioTimelineObservation(scenario, snapshot(scenario));
    assert.equal(result.status, 'passed', scenario.id);
    assert.equal(result.checks.faultRequestsComplete, true);
    assert.equal(result.checks.faultProducerEvidenceComplete, true);
    assert.equal(result.checks.faultBehaviorMatched, true);
    assert.equal(result.observed.requestedFaults.length, 1);
    assert(result.observed.actualFaults.length >= 1);
  }
  const open = timeline.scenarios[2];
  const missing = evaluateScenarioTimelineObservation(open, snapshot(open, { actualFaults: [] }));
  assert.equal(missing.status, 'indeterminate');
  const injectedHigh = evaluateScenarioTimelineObservation(open, snapshot(open, { d2Drive: 'HIGH' }));
  assert.equal(injectedHigh.status, 'failed');
  assert.equal(injectedHigh.checks.faultBehaviorMatched, false);
});
