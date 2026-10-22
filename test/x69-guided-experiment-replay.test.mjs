// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import {
  GUIDED_EXPERIMENT_REPLAY_SCHEMA,
  createGuidedExperimentReplay,
} from '../src/guided-experiment-replay.mjs';
import { EXPERIMENT_PACKAGE_LIMIT } from '../src/experiment-package.mjs';
import { THERMOSTAT_PROJECT_ADAPTER } from '../src/thermostat-experiment.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const PROFILE = 'board.atmega328p-16mhz-v1';
const adapters = Object.freeze({ [PROFILE]: THERMOSTAT_PROJECT_ADAPTER });
const correctUrl = new URL('./fixtures/x69-correct.intent-mcu-experiment.json', import.meta.url);
const knownBadUrl = new URL('./fixtures/x69-known-bad.intent-mcu-experiment.json', import.meta.url);
const source = (url) => readFile(url, 'utf8');

test('X69 opens the retained correct package as a frozen historical walkthrough', async () => {
  const result = await createGuidedExperimentReplay(await source(correctUrl), adapters);
  assert.equal(result.ok, true, result.code);
  assert.equal(result.replay.schema, GUIDED_EXPERIMENT_REPLAY_SCHEMA);
  assert.equal(result.packageSha256,
    '4b7d85dd0d0fce4d5b521c16c798730af6547d554f32c5f8895668f887530fc5');
  assert.equal(result.replay.historical, true);
  assert.equal(result.replay.profile, PROFILE);
  assert.equal(result.replay.projectName, 'Thermostat boundary test');
  assert.equal(result.replay.capture.capturedAt, null);
  assert.equal(result.replay.capture.capturedAtState, 'unavailable-not-recorded');
  assert.equal(result.replay.capture.timeBasis, 'virtual-millisecond');
  assert.equal(result.replay.capture.completeness.allEvidenceComplete, true);
  assert.equal(result.replay.steps.length, 4);
  assert.equal(result.replay.steps[0].beginning, true);
  assert.equal(result.replay.steps[3].end, true);
  assert.deepEqual(result.replay.steps.map((step) => step.scenarioId), [
    'THERM-SCENARIO-BELOW-ENABLED',
    'THERM-SCENARIO-EQUALITY-ENABLED',
    'THERM-SCENARIO-ABOVE-ENABLED',
    'THERM-SCENARIO-BELOW-DISABLED',
  ]);
  const equality = result.replay.steps[1];
  assert.deepEqual(equality.inputs.map(({ value, unit }) => [value, unit]), [[31, '°C'], [true, null]]);
  assert.equal(equality.requirementState, 'unavailable');
  assert.equal(equality.expected.level, false);
  assert.equal(equality.observed.level, false);
  assert.equal(equality.recordedOutcome, 'passed');
  assert.match(equality.explanation, /Recorded D13 LOW matched expected LOW/u);
  assert.deepEqual(result.replay.authority,
    { currentVerdict: false, build: false, run: false, runtime: false, mutation: false });
  assert.equal(Object.isFrozen(result.replay.steps[0].inputs), true);
});

test('X69 shows the retained known-bad equality observation and recorded failure reason', async () => {
  const result = await createGuidedExperimentReplay(await source(knownBadUrl), adapters);
  assert.equal(result.ok, true, result.code);
  assert.equal(result.packageSha256,
    'a0f6d2d40e8ade683e860a7d9767cd8ebd2109b6acdd0df7fd38081e2278b521');
  assert.equal(result.replay.sourceVariant, 'known-bad-equality');
  assert.equal(result.replay.recordedAggregate.academicStatus, 'failed');
  const equality = result.replay.steps[1];
  assert.equal(equality.expected.level, false);
  assert.equal(equality.observed.level, true);
  assert.equal(equality.recordedOutcome, 'failed');
  assert.deepEqual(equality.reasons, ['EXPECTED_PIN_LEVEL_MISMATCH']);
  assert.match(equality.explanation,
    /Recorded D13 HIGH did not match expected LOW.*EXPECTED_PIN_LEVEL_MISMATCH/u);
});

test('X69 rejects tampering, missing evidence, altered order, unit fields and oversized input', async (suite) => {
  const original = await source(correctUrl);
  const mutations = [
    ['identity', (value) => { value.profile = 'board.rp2040-pico-v1'; }],
    ['scenario order', (value) => { value.project.scenarioTimeline.scenarios.reverse(); }],
    ['required observation', (value) => { delete value.report.results[0].observed; }],
    ['unit', (value) => { value.project.scenarioTimeline.scenarios[0].events[0].unit = 'kelvin'; }],
    ['unknown field', (value) => { value.execute = { command: 'run' }; }],
  ];
  for (const [name, mutate] of mutations) await suite.test(name, async () => {
    const value = JSON.parse(original); mutate(value);
    const result = await createGuidedExperimentReplay(`${JSON.stringify(value, null, 2)}\n`, adapters);
    assert.equal(result.ok, false, `${name} was accepted`);
  });
  assert.equal((await createGuidedExperimentReplay('x'.repeat(EXPERIMENT_PACKAGE_LIMIT + 1), adapters)).ok, false);
});

test('X69 rejects historical package schemas instead of weakening identity evidence', async () => {
  const original = await source(correctUrl);
  const result = await createGuidedExperimentReplay(
    original.replace('intent-mcu-experiment-package@3', 'intent-mcu-experiment-package@2'), adapters,
  );
  assert.equal(result.ok, false);
});

