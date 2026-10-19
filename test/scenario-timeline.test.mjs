// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalProjectEnvelope, emptyProjectBrief, prepareProjectEnvelope } from '../src/project-envelope.mjs';
import {
  ScenarioTimelineEditor, defaultThermostatScenarioTimeline,
  evaluateScenarioTimelineObservation, normalizeScenarioTimeline, scenarioTimelineControls,
} from '../src/scenario-timeline.mjs';
import { THERMOSTAT_PROJECT_ADAPTER, createThermostatExperiment } from '../src/thermostat-experiment.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const adapters = Object.freeze({ [AVR]: THERMOSTAT_PROJECT_ADAPTER });

function snapshot(scenario, observedLevel) {
  const controls = scenarioTimelineControls(scenario).map((control, index) => ({
    sequence: index + 1, targetCycle: control.targetCycle, type: 'control',
    componentId: control.componentId, key: control.key, value: control.value,
  }));
  const expectation = scenario.events.at(-1);
  return {
    cycle: expectation.atMilliseconds * 16_000,
    pins: [{ pin: 'D13', mode: 'OUTPUT', level: observedLevel }],
    eventLog: { pending: [], log: controls, dropped: 0 },
    instruments: { serial: { text: 'UNTRUSTED EXPECTATION TEXT', dropped: 0 } },
  };
}

test('X17 default timeline is editable data and round-trips in the current envelope without authority', () => {
  const timeline = defaultThermostatScenarioTimeline();
  const experiment = createThermostatExperiment();
  const text = canonicalProjectEnvelope(AVR, experiment.project, adapters, emptyProjectBrief(), timeline);
  const opened = prepareProjectEnvelope(text, adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.scenarioTimeline, timeline);
  assert.equal(opened.canonical, text);
  assert.equal(JSON.parse(text).schema, 'intent-mcu-project-envelope@7');
  assert.doesNotMatch(text, /firmwareHex|runtimeState|experimentResults|"verdict"/u);
});

test('X17 editor adds renames edits and deletes authored scenarios with exact undo/redo', () => {
  const editor = new ScenarioTimelineEditor();
  const before = editor.timeline;
  const scenario = structuredClone(before.scenarios[0]);
  scenario.id = 'USER-BOUNDARY'; scenario.name = 'My authored boundary';
  scenario.events = scenario.events.map((event, index) => ({ ...event, id: `USER-EVENT-${index + 1}` }));
  assert.equal(editor.dispatch({ type: 'scenario.add', scenario }).ok, true);
  assert.equal(editor.timeline.scenarios.length, 5);
  assert.equal(editor.dispatch({ type: 'scenario.rename', scenarioId: scenario.id, name: 'Renamed boundary' }).ok, true);
  const expected = editor.timeline.scenarios.at(-1).events.at(-1);
  assert.equal(editor.dispatch({ type: 'event.update', scenarioId: scenario.id, eventId: expected.id,
    event: { ...expected, level: !expected.level, atMilliseconds: 180 } }).ok, true);
  assert.equal(editor.timeline.scenarios.at(-1).events.at(-1).level, !expected.level);
  assert.equal(editor.dispatch({ type: 'undo' }).ok, true);
  assert.equal(editor.timeline.scenarios.at(-1).events.at(-1).level, expected.level);
  assert.equal(editor.dispatch({ type: 'redo' }).ok, true);
  assert.equal(editor.timeline.scenarios.at(-1).events.at(-1).level, !expected.level);
  assert.equal(editor.dispatch({ type: 'scenario.delete', scenarioId: scenario.id }).ok, true);
  assert.deepEqual(editor.timeline.scenarios, before.scenarios);
});

test('X17 invalid deletion ordering pins ranges sizes and profiles reject atomically', () => {
  const editor = new ScenarioTimelineEditor();
  const before = editor.timeline;
  const scenario = before.scenarios[0];
  const temperature = scenario.events.find((event) => event.kind === 'input.temperature-c');
  assert.equal(editor.dispatch({ type: 'event.delete', scenarioId: scenario.id, eventId: temperature.id }).ok, false);
  assert.deepEqual(editor.timeline, before);
  for (const mutation of [
    (value) => { value.scenarios[0].events[0].atMilliseconds = 301; },
    (value) => { value.scenarios[0].events[0].valueC = 151; },
    (value) => { value.scenarios[0].events[0].componentId = 'unknown-sensor'; },
    (value) => { value.scenarios[0].events.at(-1).pin = 'D12'; },
    (value) => { value.scenarios[0].events.at(-1).throughMilliseconds = 159; },
    (value) => { value.scenarios[0].events.at(-1).throughMilliseconds = 351; },
    (value) => { value.scenarios[0].events.reverse(); },
    (value) => { value.scenarios[0].events.at(-1).runtime = { passed: true }; },
  ]) {
    const invalid = structuredClone(before); mutation(invalid);
    assert.throws(() => normalizeScenarioTimeline(invalid));
  }
  const wrongProfile = structuredClone(before); wrongProfile.profile = 'board.rp2040-pico-v1';
  assert.throws(() => normalizeScenarioTimeline(wrongProfile, 'board.rp2040-pico-v1'), /SCENARIO_TIMELINE_PROFILE/u);
  const tooManyScenarios = structuredClone(before);
  tooManyScenarios.scenarios = Array.from({ length: 9 }, (_, index) => ({
    ...structuredClone(before.scenarios[0]), id: `LIMIT-SCENARIO-${index + 1}`,
  }));
  assert.throws(() => normalizeScenarioTimeline(tooManyScenarios), /SCENARIO_TIMELINE_SHAPE/u);
  const tooManyEvents = structuredClone(before);
  tooManyEvents.scenarios[0].events = Array.from({ length: 25 }, (_, index) => ({
    id: `LIMIT-EVENT-${index + 1}`, atMilliseconds: index,
    kind: 'input.temperature-c', componentId: 'temperature-sensor-1', valueC: 20,
  }));
  assert.throws(() => normalizeScenarioTimeline(tooManyEvents), /SCENARIO_SHAPE/u);
  const tooMuchText = structuredClone(before); tooMuchText.scenarios[0].name = 'x'.repeat(81);
  assert.throws(() => normalizeScenarioTimeline(tooMuchText), /SCENARIO_TEXT/u);
});

test('X17 rejects ambiguous same-slot inputs and requires settling before an explicit observation window', () => {
  const original = defaultThermostatScenarioTimeline();
  const duplicate = structuredClone(original);
  duplicate.scenarios[0].events.splice(1, 0, {
    ...duplicate.scenarios[0].events[0], id: 'DUPLICATE-TEMPERATURE', valueC: 99,
  });
  assert.throws(() => normalizeScenarioTimeline(duplicate), /SCENARIO_INPUT_CONFLICT/u);
  const reversedAtSameTime = structuredClone(original);
  [reversedAtSameTime.scenarios[0].events[0], reversedAtSameTime.scenarios[0].events[1]]
    = [reversedAtSameTime.scenarios[0].events[1], reversedAtSameTime.scenarios[0].events[0]];
  assert.throws(() => normalizeScenarioTimeline(reversedAtSameTime), /SCENARIO_EVENT_ORDER/u);
  const unsettled = structuredClone(original);
  unsettled.scenarios[0].events[0].atMilliseconds = 160;
  unsettled.scenarios[0].events[1].atMilliseconds = 160;
  assert.throws(() => normalizeScenarioTimeline(unsettled), /SCENARIO_SETTLING_INTERVAL/u);
  const scenario = original.scenarios[0];
  const evaluated = evaluateScenarioTimelineObservation(scenario, snapshot(scenario, true));
  assert.deepEqual(evaluated.expected.observationWindow,
    { startMilliseconds: 160, endMilliseconds: 350 });
  assert.deepEqual(evaluated.observed.captureWindow,
    { minimumMilliseconds: 160, maximumMilliseconds: 350 });
});

test('X17 imported expectation never becomes observed evidence or a passing verdict', () => {
  const scenario = defaultThermostatScenarioTimeline().scenarios[1];
  const matching = evaluateScenarioTimelineObservation(scenario, snapshot(scenario, false));
  assert.equal(matching.status, 'passed');
  assert.equal(matching.observed.level, false);
  const wrongExpectation = structuredClone(scenario);
  wrongExpectation.events.at(-1).level = true;
  const caught = evaluateScenarioTimelineObservation(wrongExpectation, snapshot(wrongExpectation, false));
  assert.equal(caught.status, 'failed');
  assert.equal(caught.expected.level, true);
  assert.equal(caught.observed.level, false);
  assert.equal(caught.checks.primaryExecutedPin, false);
});

test('X18 incomplete or out-of-window authored evidence is indeterminate, never green or failed', () => {
  const scenario = defaultThermostatScenarioTimeline().scenarios[0];
  const missingPin = snapshot(scenario, true); missingPin.pins = [];
  const missing = evaluateScenarioTimelineObservation(scenario, missingPin);
  assert.equal(missing.status, 'indeterminate');
  assert.equal(missing.outcome.jobStatus, 'completed');
  assert(missing.outcome.reasons.includes('OBSERVATION_PIN_MISSING'));
  const lateSnapshot = snapshot(scenario, true);
  lateSnapshot.cycle = (scenario.events.at(-1).throughMilliseconds + 1) * 16_000;
  const late = evaluateScenarioTimelineObservation(scenario, lateSnapshot);
  assert.equal(late.status, 'indeterminate');
  assert(late.outcome.reasons.includes('OBSERVATION_TIME_OUT_OF_WINDOW'));
  const incomplete = snapshot(scenario, true); incomplete.eventLog.log = [];
  assert.equal(evaluateScenarioTimelineObservation(scenario, incomplete).status, 'indeterminate');
  const missingCounters = snapshot(scenario, true);
  delete missingCounters.eventLog.dropped;
  delete missingCounters.instruments.serial.dropped;
  const noCounters = evaluateScenarioTimelineObservation(scenario, missingCounters);
  assert.equal(noCounters.retention.inputEventsDropped, null);
  assert.equal(noCounters.retention.serialEventsDropped, null);
  assert.equal(noCounters.status, 'indeterminate');
});
