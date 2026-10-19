// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  X36_REPLAY_REPORT_SCHEMA, X36_REPLAY_SUITE, X36_SUITE_ID,
  createX36ReplayRecipe, evaluateX36Repeat, semanticX36Projection,
  validateX36ReplayRecipe, validateX36ReplayReport, x36RepeatProjection,
  x36ReplayReportPassed, x36Sha256,
} from '../src/x36-failure-replay-contract.mjs';
import { RUNTIME_BINDING_SCHEMA, WORKER_RUNTIME_IDENTITY_SCHEMA } from '../src/runtime-identity.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const artifactIdentity = '7'.repeat(64);
const binding = (generation) => ({ schema: RUNTIME_BINDING_SCHEMA, projectGeneration: 1,
  runtimeGeneration: generation, artifactIdentity });
const identity = (generation, nonce) => ({ schema: WORKER_RUNTIME_IDENTITY_SCHEMA,
  projectGeneration: 1, runtimeGeneration: generation, artifactIdentity,
  workerInitialization: 2, workerInstanceNonce: nonce.repeat(32) });
const fault = () => ({ operation: 'write', peripheral: 'SPI', address: 0x4c, value: 0x40,
  producerCycle: 224, instructionOrdinal: 152, stoppedCycle: 225, paused: true,
  code: 'RUNTIME_CAPABILITY_UNSUPPORTED', postFaultAcceptedRecords: 0 });
const repeat = (label, generation, nonce) => ({ repeat: label, runtimeBinding: binding(generation),
  runtimeIdentity: identity(generation, nonce), anchor: structuredClone(X36_REPLAY_SUITE.anchor), fault: fault() });

async function report() {
  const repeats = [repeat('A', 1, 'a'), repeat('B', 2, 'b')];
  const value = { schema: X36_REPLAY_REPORT_SCHEMA, suiteId: X36_SUITE_ID,
    recipe: await createX36ReplayRecipe(artifactIdentity), repeats,
    repeatSemanticSha256: await x36Sha256(x36RepeatProjection(repeats[0])),
    classifications: {
      execution: { status: 'stopped-unsupported', academicStatus: 'unsupported', code: 'RUNTIME_CAPABILITY_UNSUPPORTED' },
      validation: { status: 'accepted', code: 'X36_REPLAY_EXACT' },
      infrastructure: { status: 'available', code: 'X36_TWO_WORKERS_RESPONDED' },
    }, snapshot: structuredClone(X36_REPLAY_SUITE.snapshot),
    limits: structuredClone(X36_REPLAY_SUITE.limits), semanticSha256: '' };
  value.semanticSha256 = await x36Sha256(semanticX36Projection(value));
  return value;
}

test('X36 recipe binds one exact reset replay and says full snapshot unavailable', async () => {
  const recipe = await createX36ReplayRecipe(artifactIdentity);
  assert.deepEqual(await validateX36ReplayRecipe(recipe), recipe);
  assert.equal(X36_REPLAY_SUITE.snapshot.capability, 'unavailable');
  assert.equal(X36_REPLAY_SUITE.snapshot.omittedStateClasses.length, 7);
  await assert.rejects(validateX36ReplayRecipe({ ...recipe, resetOrigin: 'snapshot' }),
    { code: 'X36_REPLAY_RECIPE_INVALID' });
  await assert.rejects(validateX36ReplayRecipe({ ...recipe, extra: true }),
    { code: 'X36_REPLAY_RECIPE_INVALID' });
});

test('X36 accepts two fresh exact workers and retains unsupported academic disposition', async () => {
  const accepted = await validateX36ReplayReport(await report());
  assert.equal(x36ReplayReportPassed(accepted), true);
  assert.equal(evaluateX36Repeat(accepted.repeats[0]).academicStatus, 'unsupported');
  assert.equal(accepted.repeats[0].anchor.pc, 315);
});

test('X36 rejects mixed generations, stale identities and semantic drift atomically', async () => {
  const same = await report(); same.repeats[1].runtimeBinding.runtimeGeneration = 1;
  same.repeats[1].runtimeIdentity.runtimeGeneration = 1;
  await assert.rejects(validateX36ReplayReport(same), { code: 'X36_REPLAY_WORKERS_NOT_FRESH' });
  const stale = await report(); stale.repeats[1].runtimeIdentity.workerInstanceNonce = 'a'.repeat(32);
  await assert.rejects(validateX36ReplayReport(stale), { code: 'X36_REPLAY_WORKERS_NOT_FRESH' });
  const drift = await report(); drift.repeats[1].anchor.pc = 316;
  await assert.rejects(validateX36ReplayReport(drift), { code: 'X36_REPLAY_JOIN_INVALID' });
});

test('X36 altered anchor, access, cycle, artifact, inputs or snapshot never passes', async (context) => {
  for (const [name, mutate] of [
    ['anchor', (value) => { value.repeats[0].anchor.instructionOrdinal = 150; }],
    ['access', (value) => { value.repeats[0].fault.address = 0x4d; }],
    ['cycle', (value) => { value.repeats[0].fault.stoppedCycle = 226; }],
    ['artifact', (value) => { value.repeats[0].runtimeBinding.artifactIdentity = '8'.repeat(64); }],
    ['inputs', (value) => { value.recipe.inputSchedule.push({ cycle: 1 }); }],
    ['snapshot', (value) => { value.snapshot.capability = 'available'; }],
  ]) await context.test(name, async () => {
    const value = await report(); mutate(value);
    await assert.rejects(validateX36ReplayReport(value));
  });
});

test('X36 final fault without anchor and anchor without next-step fault are indeterminate', () => {
  const onlyFault = repeat('A', 1, 'a'); delete onlyFault.anchor;
  const onlyAnchor = repeat('A', 1, 'a'); delete onlyAnchor.fault;
  assert.equal(evaluateX36Repeat(onlyFault).academicStatus, 'indeterminate');
  assert.equal(evaluateX36Repeat(onlyAnchor).academicStatus, 'indeterminate');
});
