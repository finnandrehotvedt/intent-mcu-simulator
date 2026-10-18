// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNTEREXAMPLE_REDUCTION_SCHEMA, COUNTEREXAMPLE_REDUCTION_SEED,
  REDUCED_SCENARIO_TIMELINE_SCHEMA, normalizeCounterexampleReductionProvenance,
  reduceThermostatCounterexample,
} from '../src/counterexample-reduction.mjs';
import {
  ScenarioTimelineEditor, evaluateScenarioTimelineObservation, generateSeededThermostatTimeline,
  scenarioTimelineControls,
} from '../src/scenario-timeline.mjs';
import {
  canonicalProjectEnvelope, emptyProjectBrief, prepareProjectEnvelope,
} from '../src/project-envelope.mjs';
import {
  THERMOSTAT_PROJECT_ADAPTER, createThermostatExperiment,
} from '../src/thermostat-experiment.mjs';
import {
  runSavedHeadlessCounterexampleReduction,
} from '../src/headless-experiment-runner.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const INPUT = 'a'.repeat(64);
const ARTIFACT = 'b'.repeat(64);
const adapters = Object.freeze({ [AVR]: THERMOSTAT_PROJECT_ADAPTER });
const sourceTimeline = () => generateSeededThermostatTimeline(COUNTEREXAMPLE_REDUCTION_SEED);

function observations(timeline, variant = 'known-bad-equality') {
  return timeline.scenarios.map((scenario) => {
    const expectation = scenario.events.at(-1);
    const temperature = scenario.events.find((event) => event.kind === 'input.temperature-c');
    const button = scenario.events.find((event) => event.kind === 'input.button-pressed');
    const measured = Math.floor((Math.min(Math.max(Math.floor(((temperature.valueC + 50) / 200) * 1024), 0), 1023) * 200) / 1024) - 50;
    const actual = button.pressed && (variant === 'known-bad-equality' ? measured <= 30 : measured < 30);
    const controls = scenarioTimelineControls(scenario).map((control, index) => ({
      sequence: index + 1, targetCycle: control.targetCycle, type: 'control',
      componentId: control.componentId, key: control.key, value: control.value,
    }));
    return evaluateScenarioTimelineObservation(scenario, {
      cycle: expectation.atMilliseconds * 16_000,
      pins: [
        { pin: 'D13', mode: 'OUTPUT', level: actual },
        { pin: 'D2', mode: 'INPUT_PULLUP', level: !button.pressed, externalDrive: button.pressed ? 'LOW' : 'RELEASED' },
        { pin: 'A1', mode: 'INPUT', level: false, adc: 410, voltage: 2.004 },
      ],
      eventLog: { pending: [], log: controls, dropped: 0 },
      faultEvents: [],
    });
  });
}

async function reduction() {
  const timeline = sourceTimeline();
  let replayCalls = 0;
  const result = await reduceThermostatCounterexample({
    sourceTimeline: timeline,
    baselineObservations: observations(timeline),
    sourceBuildInputSha256: INPUT,
    artifactSha256: ARTIFACT,
    replay: async (candidate) => { replayCalls += 1; return observations(candidate); },
  });
  return { result, replayCalls };
}

test('X24 deterministically reduces 8 scenarios and 24 events to the producer-backed 3-event failure', async () => {
  const first = await reduction();
  const second = await reduction();
  assert.equal(first.result.schema, COUNTEREXAMPLE_REDUCTION_SCHEMA);
  assert.equal(first.replayCalls, 7);
  assert.deepEqual(second.result, first.result);
  assert.deepEqual(first.result.original, {
    scenarioCount: 8, eventCount: 24, timelineSha256: first.result.original.timelineSha256,
  });
  assert.equal(first.result.reduced.scenarioCount, 1);
  assert.equal(first.result.reduced.eventCount, 3);
  assert.equal(first.result.failureSignature.scenarioId, 'PROPERTY-CASE-08');
  assert.equal(first.result.failureSignature.academicStatus, 'failed');
  assert.equal(first.result.failureSignature.failingAssertionCode, 'EXPECTED_PIN_LEVEL_MISMATCH');
  assert.deepEqual([first.result.failureSignature.expectedD13, first.result.failureSignature.actualD13], [false, true]);
  assert.equal(first.result.attempts.length, 8);
  assert.equal(first.result.attempts.slice(0, 7).every((attempt) => (
    attempt.replayed && attempt.decision === 'removed' && attempt.code === 'FAILURE_SIGNATURE_PRESERVED'
  )), true);
  assert.deepEqual(first.result.attempts.at(-1), {
    scenarioId: 'PROPERTY-CASE-08', beforeScenarioCount: 1, candidateScenarioCount: 0,
    replayed: false, decision: 'retained', code: 'FINAL_SCENARIO_REQUIRED',
  });
  assert.equal(first.result.oneMinimality.length, 3);
  assert.equal(first.result.oneMinimality.every((attempt) => (
    !attempt.replayed && attempt.decision === 'retained' && attempt.code === 'SCENARIO_SHAPE'
  )), true);
  assert.equal(first.result.stopReason, 'ONE_MINIMAL_PRODUCER_FAILURE_PRESERVED');
});

test('X24 rejects incomplete evidence and a correct suite rather than manufacturing a failure', async () => {
  const timeline = sourceTimeline();
  await assert.rejects(reduceThermostatCounterexample({
    sourceTimeline: timeline,
    baselineObservations: observations(timeline, 'correct'),
    sourceBuildInputSha256: INPUT, artifactSha256: ARTIFACT, replay: async () => [],
  }), /COUNTEREXAMPLE_FAILURE_SET_INVALID/u);
  const incomplete = observations(timeline);
  incomplete.at(-1).observed.level = null;
  incomplete.at(-1).checks.pinObserved = false;
  await assert.rejects(reduceThermostatCounterexample({
    sourceTimeline: timeline, baselineObservations: incomplete,
    sourceBuildInputSha256: INPUT, artifactSha256: ARTIFACT, replay: async () => [],
  }), /COUNTEREXAMPLE_PRODUCER_FAILURE_REQUIRED/u);
});

test('X24 reduced Save/Open keeps only inert timeline provenance and requires a fresh build', async () => {
  const { result } = await reduction();
  assert.equal(result.reducedTimeline.schema, REDUCED_SCENARIO_TIMELINE_SCHEMA);
  const experiment = createThermostatExperiment('known-bad-equality');
  const saved = canonicalProjectEnvelope(AVR, experiment.project, adapters, emptyProjectBrief(), result.reducedTimeline);
  assert.doesNotMatch(saved, /authoredResults|experimentResults|runtimeBinding|firmwareHex|"verdict"/u);
  const opened = prepareProjectEnvelope(saved, adapters);
  assert.equal(opened.ok, true, JSON.stringify(opened));
  assert.deepEqual(opened.scenarioTimeline, result.reducedTimeline);
  assert.equal(opened.project.project.artifact.status, 'dirty');
  assert.equal(opened.project.project.artifact.inputIdentitySha256, null);
  assert.equal(opened.project.project.artifact.artifactIdentitySha256, null);

  const editor = new ScenarioTimelineEditor(opened.scenarioTimeline);
  assert.equal(editor.dispatch({ type: 'scenario.rename', scenarioId: 'PROPERTY-CASE-08', name: 'Manual derivative' }).ok, true);
  assert.equal(editor.timeline.schema, 'intent-mcu-scenario-timeline@1');
  assert.equal(Object.hasOwn(editor.timeline, 'reductionProvenance'), false);

  const tampered = structuredClone(result.reducedTimeline.reductionProvenance);
  tampered.attempts[0].decision = 'retained';
  assert.throws(() => normalizeCounterexampleReductionProvenance(tampered));
});

test('X24 headless path compiles fresh and emits the same bounded reduction plus a replayable saved project', async () => {
  const experiment = createThermostatExperiment('known-bad-equality');
  const saved = canonicalProjectEnvelope(AVR, experiment.project, adapters, emptyProjectBrief(), sourceTimeline());
  let compileCalls = 0; let executeCalls = 0;
  const result = await runSavedHeadlessCounterexampleReduction(saved, {
    compile: async () => { compileCalls += 1; return {
      inputIdentity: INPUT, artifactIdentity: ARTIFACT, artifact: { hex: ':00000001FF' },
    }; },
    execute: async (prepared) => { executeCalls += 1; return observations(prepared.scenarioTimeline); },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.compiledFresh, true);
  assert.equal(result.authorityRestoredFromFile, false);
  assert.equal(compileCalls, 1);
  assert.equal(executeCalls, 8);
  assert.equal(result.reduction.reduced.scenarioCount, 1);
  assert.equal(result.reduction.reduced.eventCount, 3);
  const reopened = prepareProjectEnvelope(result.reducedProjectText, adapters);
  assert.equal(reopened.ok, true, JSON.stringify(reopened));
  assert.deepEqual(reopened.scenarioTimeline, result.reduction.reducedTimeline);
});
