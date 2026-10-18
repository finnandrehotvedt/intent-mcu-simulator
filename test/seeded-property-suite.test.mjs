// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalProjectEnvelope, emptyProjectBrief, prepareProjectEnvelope } from '../src/project-envelope.mjs';
import {
  ScenarioTimelineEditor, generateSeededThermostatTimeline, normalizeScenarioTimeline,
} from '../src/scenario-timeline.mjs';
import {
  SEEDED_PROPERTY_ALGORITHM, SEEDED_PROPERTY_CASE_COUNT, SEEDED_PROPERTY_RESOURCE_BUDGET,
  SEEDED_PROPERTY_VALID_INPUTS, thermostatMeasuredTemperatureC,
} from '../src/seeded-property-suite.mjs';
import {
  THERMOSTAT_PROJECT_ADAPTER, createThermostatExperiment,
} from '../src/thermostat-experiment.mjs';
import { prepareSavedHeadlessExperiment, runSavedHeadlessExperiment } from '../src/headless-experiment-runner.mjs';
import { completedExperimentOutcome } from '../src/experiment-outcomes.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const adapters = Object.freeze({ [AVR]: THERMOSTAT_PROJECT_ADAPTER });
const seedA = 0x1234_5678;
const seedB = 0x8765_4321;

function savedSeeded(variant = 'correct', seed = seedA) {
  const experiment = createThermostatExperiment(variant);
  return canonicalProjectEnvelope(AVR, experiment.project, adapters, emptyProjectBrief(),
    generateSeededThermostatTimeline(seed));
}

test('X22 same seed regenerates the identical bounded valid sequence and another seed differs', () => {
  const first = generateSeededThermostatTimeline(seedA);
  const replay = generateSeededThermostatTimeline(seedA);
  const different = generateSeededThermostatTimeline(seedB);
  assert.deepEqual(replay, first);
  assert.notDeepEqual(different.scenarios, first.scenarios);
  assert.equal(first.propertySuite.algorithm, SEEDED_PROPERTY_ALGORITHM);
  assert.equal(first.propertySuite.seed, seedA);
  assert.equal(first.propertySuite.caseCount, SEEDED_PROPERTY_CASE_COUNT);
  assert.deepEqual(first.propertySuite.validInputs, SEEDED_PROPERTY_VALID_INPUTS);
  assert.deepEqual(first.propertySuite.resourceBudget, SEEDED_PROPERTY_RESOURCE_BUDGET);
  assert.equal(first.scenarios.length, 8);
  assert.equal(first.scenarios.reduce((count, scenario) => count + scenario.events.length, 0), 24);
  for (const scenario of first.scenarios) {
    const temperature = scenario.events.find((event) => event.kind === 'input.temperature-c');
    const button = scenario.events.find((event) => event.kind === 'input.button-pressed');
    const expectation = scenario.events.at(-1);
    assert.equal(Number.isInteger(temperature.valueC), true);
    assert.equal(temperature.valueC >= -50 && temperature.valueC <= 150, true);
    assert.equal(typeof button.pressed, 'boolean');
    assert.equal(expectation.level, button.pressed && thermostatMeasuredTemperatureC(temperature.valueC) < 30);
    assert.deepEqual([expectation.atMilliseconds, expectation.throughMilliseconds], [160, 350]);
  }
  const equality = first.scenarios.filter((scenario) => {
    const temperature = scenario.events.find((event) => event.kind === 'input.temperature-c');
    const button = scenario.events.find((event) => event.kind === 'input.button-pressed');
    return temperature.valueC === 31 && button.pressed;
  });
  assert.equal(equality.length, 1, 'suite must retain one deterministic known-bad counterexample');
});

test('X22 strict seed metadata and generated sequence reject tampering while manual edit clears seed claim', () => {
  const original = generateSeededThermostatTimeline(seedA);
  for (const mutation of [
    (value) => { value.propertySuite.algorithm = 'Math.random'; },
    (value) => { value.propertySuite.seed = -1; },
    (value) => { value.propertySuite.caseCount = 7; },
    (value) => { value.propertySuite.validInputs.temperatureC.maximum = 151; },
    (value) => { value.propertySuite.resourceBudget.generatorSteps = 16; },
    (value) => { value.scenarios[0].events[0].valueC += 1; },
  ]) {
    const changed = structuredClone(original); mutation(changed);
    assert.throws(() => normalizeScenarioTimeline(changed));
  }
  assert.throws(() => generateSeededThermostatTimeline(0x1_0000_0000), /SEEDED_PROPERTY_SUITE_SHAPE/u);
  assert.throws(() => generateSeededThermostatTimeline(seedA, 'board.rp2040-pico-v1'),
    /SEEDED_PROPERTY_PROFILE_UNSUPPORTED/u);

  const editor = new ScenarioTimelineEditor(original);
  const scenario = editor.timeline.scenarios[0];
  assert.equal(editor.dispatch({ type: 'scenario.rename', scenarioId: scenario.id, name: 'Manual derivative' }).ok, true);
  assert.equal(editor.timeline.schema, 'intent-mcu-scenario-timeline@1');
  assert.equal(Object.hasOwn(editor.timeline, 'propertySuite'), false);
  assert.equal(editor.dispatch({ type: 'undo' }).ok, true);
  assert.deepEqual(editor.timeline, original);
});

test('X22 canonical data-only Save/Open preserves seed and sequence without authority', async () => {
  const text = savedSeeded();
  const opened = prepareProjectEnvelope(text, adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.scenarioTimeline, generateSeededThermostatTimeline(seedA));
  assert.equal(opened.canonical, text);
  assert.doesNotMatch(text, /authoredResults|runtimeBinding|firmwareHex|"verdict"/u);
  const prepared = await prepareSavedHeadlessExperiment(text);
  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.scenarioTimeline, opened.scenarioTimeline);
  assert.equal(prepared.authorityRestoredFromFile, false);
});

test('X22 headless path executes the saved generated sequence and retains producer outcomes', async () => {
  const timeline = generateSeededThermostatTimeline(seedA);
  const pass = completedExperimentOutcome();
  const observations = timeline.scenarios.map((scenario) => ({
    schema: 'intent-mcu-scenario-observation-result@1', scenarioId: scenario.id,
    status: 'passed', outcome: pass, virtualMilliseconds: 160,
    expected: { observationWindow: { startMilliseconds: 160, endMilliseconds: 350 } },
  }));
  const result = await runSavedHeadlessExperiment(savedSeeded(), {
    compile: async () => ({ inputIdentity: 'a'.repeat(64), artifactIdentity: 'b'.repeat(64),
      artifact: { hex: ':00000001FF' } }),
    execute: async (prepared) => {
      assert.equal(prepared.scenarioTimeline.propertySuite.seed, seedA);
      return observations;
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.compiledFresh, true);
  assert.equal(result.status, 'passed');
  assert.equal(result.observations.length, 8);
  assert.match(result.association.scenarioTimelineSha256, /^[a-f0-9]{64}$/u);
});
