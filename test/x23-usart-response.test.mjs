// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  X23_USART_KNOWN_BAD_SOURCE, X23_USART_REPORT_SCHEMA, X23_USART_SOURCE,
  X23_USART_SUITE, X23_USART_SUITE_ID, createX23UsartRecipe, evaluateX23UsartRun,
  semanticX23UsartProjection, validateX23UsartRecipe, validateX23UsartReport,
  x23UsartReportPassed, x23UsartRunProjection, x23UsartSha256,
} from '../src/x23-usart-response-contract.mjs';
import { RUNTIME_BINDING_SCHEMA, WORKER_RUNTIME_IDENTITY_SCHEMA } from '../src/runtime-identity.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const classification = (mode) => ({
  academic: mode === 'expected'
    ? { academicStatus: 'passed', code: 'EXPECTED_RESPONSE_ACCEPTED' }
    : mode === 'incorrect'
      ? { academicStatus: 'passed', code: 'INCORRECT_RESPONSE_DETECTED' }
      : { academicStatus: 'failed', code: 'INCORRECT_RESPONSE_ACCEPTED' },
  validation: { status: 'accepted', code: 'X23_USART_EVIDENCE_COMPLETE' },
  infrastructure: { status: 'completed', code: 'X23_USART_WORKER_COMPLETED' },
});

function run(label, generation, nonce) {
  const mode = label.startsWith('expected') ? 'expected'
    : label.startsWith('incorrect') ? 'incorrect' : 'known-bad-incorrect';
  const firmware = mode === 'known-bad-incorrect' ? 'known-bad' : 'correct';
  const artifactIdentity = firmware === 'known-bad'
    ? X23_USART_SUITE.knownBadArtifactIdentity : X23_USART_SUITE.artifactIdentity;
  const responseByte = mode === 'expected' ? 0x41 : 0x42;
  const branch = mode === 'incorrect' ? { serialText: 'ERR\n', d13: true }
    : { serialText: 'OK\n', d13: false };
  return { label, mode, firmware,
    runtimeBinding: { schema: RUNTIME_BINDING_SCHEMA, projectGeneration: 1,
      runtimeGeneration: generation, artifactIdentity },
    runtimeIdentity: { schema: WORKER_RUNTIME_IDENTITY_SCHEMA, projectGeneration: 1,
      runtimeGeneration: generation, artifactIdentity, workerInitialization: 1,
      workerInstanceNonce: nonce.repeat(32) },
    request: { value: 0x3f, producerCycle: 1648, baud: 9615, frameCycles: 16640 },
    fixture: { matchedRequest: true, responseByte, responseDelayCycles: 20,
      scheduledFromCycle: 1651, targetCycle: 1671 },
    rxRequest: { value: responseByte, cycle: 1671, targetCycle: 1671, accepted: true },
    rxComplete: { cycle: 18311 },
    consumer: { ...branch, instructions: mode === 'incorrect' ? 800 : 790, finalCycle: 19000 },
    retentionDrops: { logic: 0, serial: 0, adc: 0, unsupported: 0 },
    classifications: classification(mode),
  };
}

async function report() {
  const runs = [run('expected-A', 1, 'a'), run('expected-B', 2, 'b'),
    run('incorrect-A', 3, 'c'), run('incorrect-B', 4, 'd'),
    run('known-bad-incorrect', 5, 'e')];
  const value = { schema: X23_USART_REPORT_SCHEMA, suiteId: X23_USART_SUITE_ID,
    recipe: await createX23UsartRecipe(), runs,
    repeatHashes: { expected: await x23UsartSha256(x23UsartRunProjection(runs[0])),
      incorrect: await x23UsartSha256(x23UsartRunProjection(runs[2])) },
    limits: structuredClone(X23_USART_SUITE.limits), semanticSha256: '' };
  value.semanticSha256 = await x23UsartSha256(semanticX23UsartProjection(value));
  return value;
}

test('X23 USART recipe locks prerequisite source, artifacts, bytes, 8-N-1 and delay', async () => {
  assert.equal(await x23UsartSha256(X23_USART_SOURCE), X23_USART_SUITE.sourceSha256);
  assert.equal(await x23UsartSha256(X23_USART_KNOWN_BAD_SOURCE), X23_USART_SUITE.knownBadSourceSha256);
  assert.deepEqual(await validateX23UsartRecipe(await createX23UsartRecipe()), await createX23UsartRecipe());
  const changed = await createX23UsartRecipe(); changed.responseDelayCycles = 21;
  await assert.rejects(validateX23UsartRecipe(changed), { code: 'X23_USART_RECIPE_INVALID' });
  await assert.rejects(validateX23UsartRecipe({ ...await createX23UsartRecipe(), extra: true }),
    { code: 'X23_USART_RECIPE_INVALID' });
});

test('X23 USART report accepts expected/incorrect repeats and requires known-bad academic failure', async () => {
  const accepted = await validateX23UsartReport(await report());
  assert.equal(x23UsartReportPassed(accepted), true);
  assert.equal(evaluateX23UsartRun(accepted.runs[2]).academicStatus, 'passed');
  assert.equal(evaluateX23UsartRun(accepted.runs[4]).academicStatus, 'failed');
});

test('X23 USART missing producer, rejected RX, wrong consumer, drops and stale joins never pass', async (context) => {
  for (const [name, mutate] of [
    ['request', (value) => { delete value.runs[0].request; }],
    ['rejected-rx', (value) => { value.runs[0].rxRequest.accepted = false; }],
    ['wrong-consumer', (value) => { value.runs[2].consumer.d13 = false; }],
    ['drop', (value) => { value.runs[1].retentionDrops.serial = 1; }],
    ['stale-artifact', (value) => { value.runs[3].runtimeBinding.artifactIdentity = 'f'.repeat(64); }],
    ['mixed-generation', (value) => { value.runs[1].runtimeBinding.runtimeGeneration = 1;
      value.runs[1].runtimeIdentity.runtimeGeneration = 1; }],
  ]) await context.test(name, async () => {
    const changed = await report(); mutate(changed);
    await assert.rejects(validateX23UsartReport(changed));
  });
});

test('X23 USART incomplete evidence is indeterminate, never an infrastructure or academic pass', () => {
  const incomplete = run('incorrect-A', 1, 'a'); delete incomplete.rxComplete;
  assert.deepEqual(evaluateX23UsartRun(incomplete), {
    validationStatus: 'rejected', evidenceStatus: 'incomplete', academicStatus: 'indeterminate',
    jobStatus: 'completed', code: 'X23_USART_EVIDENCE_INVALID',
  });
});
