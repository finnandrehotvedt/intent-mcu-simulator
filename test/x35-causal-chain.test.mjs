// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { X35CausalObserver } from '../src/x35-causal-observer.mjs';
import {
  X35_CAUSAL_SUITE, X35_REPORT_SCHEMA, X35_RUNTIME_PROBE_SCHEMA,
  evaluateX35Repeat, semanticX35Projection, validateX35Probe, validateX35Report,
  x35RepeatProjection, x35ReportPassed, x35Sha256, x35SuiteIdentity,
} from '../src/x35-causal-chain-contract.mjs';
import { RUNTIME_BINDING_SCHEMA, WORKER_RUNTIME_IDENTITY_SCHEMA } from '../src/runtime-identity.mjs';

const artifactIdentity = '1'.repeat(64);
const probe = () => ({ schema: X35_RUNTIME_PROBE_SCHEMA, suiteId: X35_CAUSAL_SUITE.suiteId,
  scenarioId: X35_CAUSAL_SUITE.scenarioId, sourceSha256: X35_CAUSAL_SUITE.sourceSha256,
  artifactIdentity, graphSha256: X35_CAUSAL_SUITE.graphSha256,
  selected: structuredClone(X35_CAUSAL_SUITE.selected), path: [...X35_CAUSAL_SUITE.path] });
const step = (overrides = {}) => ({ pcBefore: 941, pcAfter: 942, opcode: 37612,
  cycleBefore: 6138, cycleAfter: 6140, portBefore: 0, portAfterInstruction: 32,
  portAfterTick: 32, instructionRecords: [{ cycle: 6138, pin: 13, level: true }],
  tickRecords: [], pin: { pin: 'D13', mode: 'OUTPUT', level: true },
  retentionDrops: { logic: 0, serial: 0, adc: 0, unsupported: 0 }, ...overrides });
function chain({ otherBit = false } = {}) {
  const observer = new X35CausalObserver(probe());
  observer.observeStep(step(otherBit ? { portAfterInstruction: 33, portAfterTick: 33 } : {}));
  observer.project({ graphSha256: X35_CAUSAL_SUITE.graphSha256, path: [...X35_CAUSAL_SUITE.path],
    component: { componentId: 'heater-led-1',
      model: 'project-owned ideal current-limited LED observation', on: true,
      capturedAtInstructionBoundary: true } });
  const state = observer.snapshot();
  assert.equal(state.rejected, null);
  assert.equal(state.completed.length, 1);
  return state.completed[0];
}
const binding = (generation) => ({ schema: RUNTIME_BINDING_SCHEMA, projectGeneration: 1,
  runtimeGeneration: generation, artifactIdentity });
const identity = (generation, nonce) => ({ schema: WORKER_RUNTIME_IDENTITY_SCHEMA,
  projectGeneration: 1, runtimeGeneration: generation, artifactIdentity,
  workerInitialization: 1, workerInstanceNonce: nonce.repeat(32) });
async function report(firstChain = chain(), secondChain = chain()) {
  const repeats = [
    { repeat: 'A', runtimeBinding: binding(1), runtimeIdentity: identity(1, 'a'),
      chain: firstChain, outcome: null },
    { repeat: 'B', runtimeBinding: binding(2), runtimeIdentity: identity(2, 'b'),
      chain: secondChain, outcome: null },
  ];
  for (const repeat of repeats) repeat.outcome = evaluateX35Repeat(repeat);
  const value = { schema: X35_REPORT_SCHEMA, suiteId: X35_CAUSAL_SUITE.suiteId,
    suiteSha256: await x35SuiteIdentity(), sourceSha256: X35_CAUSAL_SUITE.sourceSha256,
    artifactIdentity, graphSha256: X35_CAUSAL_SUITE.graphSha256, repeats,
    repeatSemanticSha256: await x35Sha256(x35RepeatProjection(repeats[0])),
    validationProbes: { staleIdentityRejected: true, tickAmbiguityRejected: true,
      finalStateAloneCannotPass: true, genericRegisterApiExposed: false },
    limits: structuredClone(X35_CAUSAL_SUITE.limits), semanticSha256: '' };
  value.semanticSha256 = await x35Sha256(semanticX35Projection(value));
  return value;
}

test('X35 accepts only the closed runtime probe', () => {
  assert.deepEqual(validateX35Probe(probe()), probe());
  assert.throws(() => validateX35Probe({ ...probe(), registerApi: true }),
    { code: 'X35_RUNTIME_PROBE_INVALID' });
  assert.throws(() => validateX35Probe({ ...probe(), graphSha256: '2'.repeat(64) }),
    { code: 'X35_RUNTIME_PROBE_INVALID' });
});

test('X35 observer preserves full PORTB values and selects only bit 5', () => {
  const accepted = chain({ otherBit: true });
  assert.deepEqual(accepted.register, {
    eventId: accepted.eventId, causedBy: accepted.eventId, name: 'PORTB', address: 37,
    selectedBit: 5, fullValueBefore: 0, fullValueAfterInstruction: 33,
    fullValueAfterTick: 33, otherBitsChangedMask: 1,
  });
  assert.equal(evaluateX35Repeat({ chain: accepted }).academicStatus, 'passed');
});

test('X35 distinguishes instruction-caused output from tick ambiguity', () => {
  const observer = new X35CausalObserver(probe());
  observer.observeStep(step({ portAfterTick: 0,
    tickRecords: [{ cycle: 6140, pin: 13, level: false }] }));
  assert.equal(observer.snapshot().rejected, 'X35_CAUSAL_BOUNDARY_AMBIGUOUS');
  assert.equal(observer.snapshot().completed.length, 0);
});

test('X35 requires synchronous topology/model projection', () => {
  const observer = new X35CausalObserver(probe()); observer.observeStep(step());
  observer.observeStep(step({ pcBefore: 942, cycleBefore: 6140, cycleAfter: 6141,
    portBefore: 32, instructionRecords: [] }));
  assert.equal(observer.snapshot().rejected, 'X35_PROJECTION_NOT_SYNCHRONOUS');
});

test('X35 one event identity propagates through every causal stage', () => {
  const accepted = chain();
  for (const stage of ['instruction', 'register', 'callback', 'pin', 'topology', 'componentProjection']) {
    assert.equal(accepted[stage].eventId, accepted.eventId);
  }
  for (const stage of ['register', 'callback', 'pin', 'topology', 'componentProjection']) {
    assert.equal(accepted[stage].causedBy, accepted.eventId);
  }
});

test('X35 strict two-worker report validates and passes', async () => {
  const accepted = await validateX35Report(await report());
  assert.equal(x35ReportPassed(accepted), true);
  assert.equal(accepted.repeats[0].chain.callback.rawCycle, 6138);
  assert.deepEqual(accepted.repeats[0].chain.instruction.cycleAfter, 6140);
});

test('X35 rejects stale worker identity and semantic drift', async () => {
  const stale = await report();
  stale.repeats[1].runtimeIdentity.workerInstanceNonce = 'a'.repeat(32);
  assert.rejects(validateX35Report(stale), { code: 'X35_RUNTIME_GENERATION_NOT_FRESH' });
  const drift = await report(); drift.repeats[1].chain.instruction.opcode += 1;
  drift.repeats[1].outcome = evaluateX35Repeat(drift.repeats[1]);
  assert.rejects(validateX35Report(drift), { code: 'X35_REPEAT_SEMANTICS_MISMATCH' });
});

test('X35 altered producer, pin or topology cannot pass', async (context) => {
  for (const [name, mutate] of [
    ['register', (value) => { value.register.address = 38; }],
    ['tick', (value) => { value.tickDistinction.tickChangedBit5 = true; }],
    ['pin', (value) => { value.pin.level = false; }],
    ['topology', (value) => { value.topology.path[1] = 'invented-net'; }],
    ['component', (value) => { value.componentProjection.on = false; }],
  ]) await context.test(name, () => {
    const value = chain(); mutate(value);
    assert.equal(evaluateX35Repeat({ chain: value }).academicStatus, 'failed');
  });
});

test('X35 final state or display text alone has no causal authority', () => {
  assert.throws(() => evaluateX35Repeat({ chain: {
    eventId: 'x35-event-941-6138', pin: { pin: 'D13', mode: 'OUTPUT', level: true },
    componentProjection: { componentId: 'heater-led-1', on: true }, display: 'LED ON',
  } }), { code: 'X35_CHAIN_INVALID' });
});
