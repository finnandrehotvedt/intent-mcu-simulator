// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';
import {
  HEADLESS_SUPPORTED_PROFILES, HEADLESS_UNAVAILABLE_PROFILES,
  prepareSavedHeadlessExperiment, runSavedHeadlessExperiment,
} from '../src/headless-experiment-runner.mjs';
import { compileHeadlessAvr } from '../src/headless-compiler-client.mjs';
import {
  THERMOSTAT_PROJECT_ADAPTER, createThermostatExperiment,
} from '../src/thermostat-experiment.mjs';
import { THERMOSTAT_SCENARIOS } from '../src/thermostat-experiment-contract.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const adapters = Object.freeze({ [AVR]: THERMOSTAT_PROJECT_ADAPTER });
const saved = (variant = 'correct') => {
  const experiment = createThermostatExperiment(variant);
  return canonicalProjectEnvelope(AVR, experiment.project, adapters, emptyProjectBrief());
};

test('X15 admits the canonical saved AVR thermostat without restoring executable authority', async () => {
  const prepared = await prepareSavedHeadlessExperiment(saved());
  assert.equal(prepared.ok, true);
  assert.equal(prepared.profile, AVR);
  assert.equal(prepared.firmwareVariant, 'correct');
  assert.equal(prepared.authorityRestoredFromFile, false);
  assert.match(prepared.projectSha256, /^[a-f0-9]{64}$/u);
  assert.match(prepared.sourceDigest, /^[a-f0-9]{64}$/u);
  assert.equal(prepared.buildRequest.files.some((file) => file.name === 'main.ino'), true);
  assert.deepEqual(HEADLESS_SUPPORTED_PROFILES, [AVR]);
  assert.deepEqual(Object.keys(HEADLESS_UNAVAILABLE_PROFILES).sort(), [
    'board.esp32-c3-devmodule-v1', 'board.rp2040-pico-v1', 'board.stm32f429zi-nucleo144-v1',
  ]);
});

test('X15 compiles fresh and binds result identity without accepting an artifact from the file', async () => {
  let compileCalls = 0; let executeCalls = 0;
  const observations = THERMOSTAT_SCENARIOS.scenarios.map((scenario) => ({
    schema: 'intent-mcu-thermostat-observation-result@1', scenarioId: scenario.id,
    status: 'passed', virtualMilliseconds: 160, observed: { d13: scenario.expectedD13 },
  }));
  const result = await runSavedHeadlessExperiment(saved(), {
    compile: async (request) => {
      compileCalls += 1;
      assert.equal(request.board, AVR);
      return { inputIdentity: 'a'.repeat(64), artifactIdentity: 'b'.repeat(64), artifact: { hex: ':00000001FF' } };
    },
    execute: async (prepared, artifact) => {
      executeCalls += 1;
      assert.equal(prepared.authorityRestoredFromFile, false);
      assert.equal(artifact.artifactIdentity, 'b'.repeat(64));
      return observations;
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.compiledFresh, true);
  assert.equal(result.authorityRestoredFromFile, false);
  assert.equal(result.association.compilerInputIdentity, 'a'.repeat(64));
  assert.equal(result.association.artifactIdentity, 'b'.repeat(64));
  assert.equal(compileCalls, 1); assert.equal(executeCalls, 1);
});

test('X15 compiler client submits the strict wire shape and rejects a mismatched result identity', async () => {
  const prepared = await prepareSavedHeadlessExperiment(saved());
  const inputIdentity = 'a'.repeat(64);
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (calls.length === 1) return new Response(JSON.stringify({
      jobId: '1'.repeat(24), capability: 'c'.repeat(43), inputIdentity,
    }), { status: 202, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ status: 'succeeded', result: {
      inputIdentity: 'd'.repeat(64), artifactIdentity: 'b'.repeat(64),
      artifact: { hex: ':00000001FF' },
    } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  await assert.rejects(
    compileHeadlessAvr(prepared.buildRequest, { fetchImpl }),
    (error) => error.code === 'HEADLESS_BUILD_RESULT_INVALID',
  );
  assert.deepEqual(Object.keys(JSON.parse(calls[0].options.body)).sort(), ['board', 'files', 'schema']);
});

test('X15 rejects malformed modified unsupported and authority-bearing saved files before execution', async () => {
  assert.equal((await prepareSavedHeadlessExperiment('{')).code, 'HEADLESS_PROJECT_REJECTED');

  const modified = JSON.parse(saved());
  modified.project.project.source.files.find((file) => file.name === 'main.ino').content += '\n// changed\n';
  assert.equal((await prepareSavedHeadlessExperiment(JSON.stringify(modified))).code,
    'HEADLESS_EXPERIMENT_SOURCE_MODIFIED');

  const unsupported = JSON.parse(saved());
  unsupported.profile = 'board.rp2040-pico-v1';
  assert.equal((await prepareSavedHeadlessExperiment(JSON.stringify(unsupported))).code,
    'HEADLESS_PROFILE_UNSUPPORTED');

  const stale = JSON.parse(saved());
  stale.project.project.artifact = {
    status: 'succeeded', inputIdentitySha256: 'a'.repeat(64), artifactIdentitySha256: 'b'.repeat(64),
  };
  const staleResult = await prepareSavedHeadlessExperiment(JSON.stringify(stale));
  assert.equal(staleResult.code, 'HEADLESS_PROJECT_REJECTED');
  assert.equal(staleResult.details.includes('PROJECT_ENVELOPE_EXECUTABLE_AUTHORITY'), true);
});
