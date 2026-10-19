// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { validateWorkerRuntimeIdentity } from './runtime-identity.mjs';
import { exactKeys } from './strict-json.mjs';

export const X36_RECIPE_SCHEMA = 'intent-mcu-x36-failure-replay-recipe@1';
export const X36_REPLAY_REPORT_SCHEMA = 'intent-mcu-x36-failure-replay-report@1';
export const X36_SUITE_ID = 'x36-avr-spi-reset-replay-v1';
const HASH = /^[a-f0-9]{64}$/u;
const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };

export const X36_OMITTED_STATE_CLASSES = Object.freeze([
  'complete CPU data/register memory',
  'stack and status state',
  'pending CPU clock events',
  'timer peripheral internals',
  'ADC peripheral internals',
  'UART peripheral internals',
  'complete scheduler/peripheral object state',
]);

export const X36_REPLAY_SUITE = Object.freeze({
  suiteId: X36_SUITE_ID,
  profile: 'board.atmega328p-16mhz-v1',
  fixtureId: 'x32-avr-spi-enable-v1',
  sourceSha256: '1d3ae51f4aebd1e4c15f2eccab00742854dc39ecadee277b46075e91a78f6763',
  projectSha256: '44df07606fd0b1917c7b2c44372a8a6e7b968e400bbb8d7462190b92c1fc6530',
  resetOrigin: 'fresh-worker-reset',
  inputSchedule: Object.freeze([]),
  anchor: Object.freeze({ instructionOrdinal: 151, cycle: 224, pc: 315,
    paused: true, d13: Object.freeze({ mode: 'OUTPUT', level: true }),
    retentionDrops: Object.freeze({ logic: 0, serial: 0, adc: 0, unsupported: 0 }),
    pendingInputs: 0 }),
  fault: Object.freeze({ operation: 'write', peripheral: 'SPI', address: 0x4c,
    value: 0x40, producerCycle: 224, instructionOrdinal: 152, stoppedCycle: 225,
    code: 'RUNTIME_CAPABILITY_UNSUPPORTED' }),
  snapshot: Object.freeze({ capability: 'unavailable',
    omittedStateClasses: X36_OMITTED_STATE_CLASSES,
    reason: 'The runtime exposes an observation read model, not complete restorable CPU, peripheral and scheduler state.' }),
  limits: Object.freeze({ fixedCompilerGeneratedFixtureOnly: true, resetReplayOnly: true,
    fullSnapshot: false, restore: false, arbitrarySeek: false, debugger: false,
    memoryOrRegisterApi: false, sourceLineMapping: false, physicalHardwareProof: false,
    otherProfiles: false }),
});

export function stableX36Stringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableX36Stringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stableX36Stringify(value[key])}`,
  ).join(',')}}`;
  return JSON.stringify(value);
}

export async function x36Sha256(value) {
  const input = typeof value === 'string' ? value : stableX36Stringify(value);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export async function x36SuiteIdentity() { return x36Sha256(X36_REPLAY_SUITE); }

export async function createX36ReplayRecipe(artifactIdentity) {
  if (!HASH.test(artifactIdentity ?? '')) reject('X36_ARTIFACT_IDENTITY_INVALID');
  return {
    schema: X36_RECIPE_SCHEMA, suiteId: X36_SUITE_ID,
    suiteSha256: await x36SuiteIdentity(), profile: X36_REPLAY_SUITE.profile,
    fixtureId: X36_REPLAY_SUITE.fixtureId, sourceSha256: X36_REPLAY_SUITE.sourceSha256,
    artifactIdentity, projectSha256: X36_REPLAY_SUITE.projectSha256,
    resetOrigin: X36_REPLAY_SUITE.resetOrigin, inputSchedule: [],
    anchor: clone(X36_REPLAY_SUITE.anchor),
  };
}

export async function validateX36ReplayRecipe(value) {
  if (!exactKeys(value, ['schema', 'suiteId', 'suiteSha256', 'profile', 'fixtureId',
    'sourceSha256', 'artifactIdentity', 'projectSha256', 'resetOrigin', 'inputSchedule', 'anchor'])
      || value.schema !== X36_RECIPE_SCHEMA || value.suiteId !== X36_SUITE_ID
      || value.suiteSha256 !== await x36SuiteIdentity()
      || value.profile !== X36_REPLAY_SUITE.profile || value.fixtureId !== X36_REPLAY_SUITE.fixtureId
      || value.sourceSha256 !== X36_REPLAY_SUITE.sourceSha256
      || value.projectSha256 !== X36_REPLAY_SUITE.projectSha256
      || !HASH.test(value.artifactIdentity ?? '')
      || value.resetOrigin !== X36_REPLAY_SUITE.resetOrigin
      || stableX36Stringify(value.inputSchedule) !== '[]'
      || stableX36Stringify(value.anchor) !== stableX36Stringify(X36_REPLAY_SUITE.anchor)) {
    reject('X36_REPLAY_RECIPE_INVALID');
  }
  return clone(value);
}

function exactAnchor(value) {
  return exactKeys(value, ['instructionOrdinal', 'cycle', 'pc', 'paused', 'd13',
    'retentionDrops', 'pendingInputs'])
    && stableX36Stringify(value) === stableX36Stringify(X36_REPLAY_SUITE.anchor);
}

function exactFault(value) {
  return exactKeys(value, ['operation', 'peripheral', 'address', 'value', 'producerCycle',
    'instructionOrdinal', 'stoppedCycle', 'paused', 'code', 'postFaultAcceptedRecords'])
    && value.operation === X36_REPLAY_SUITE.fault.operation
    && value.peripheral === X36_REPLAY_SUITE.fault.peripheral
    && value.address === X36_REPLAY_SUITE.fault.address
    && value.value === X36_REPLAY_SUITE.fault.value
    && value.producerCycle === X36_REPLAY_SUITE.fault.producerCycle
    && value.instructionOrdinal === X36_REPLAY_SUITE.fault.instructionOrdinal
    && value.stoppedCycle === X36_REPLAY_SUITE.fault.stoppedCycle
    && value.paused === true && value.code === X36_REPLAY_SUITE.fault.code
    && value.postFaultAcceptedRecords === 0;
}

export function x36RepeatProjection(repeat) {
  return { anchor: repeat.anchor, fault: repeat.fault };
}

export function evaluateX36Repeat(repeat) {
  const exact = exactKeys(repeat, ['repeat', 'runtimeBinding', 'runtimeIdentity', 'anchor', 'fault'])
    && ['A', 'B'].includes(repeat.repeat) && exactAnchor(repeat.anchor) && exactFault(repeat.fault);
  return { validationStatus: exact ? 'accepted' : 'rejected',
    academicStatus: exact ? 'unsupported' : 'indeterminate',
    jobStatus: exact ? 'completed' : 'rejected',
    code: exact ? 'RUNTIME_CAPABILITY_UNSUPPORTED' : 'X36_REPLAY_EVIDENCE_INVALID' };
}

export function semanticX36Projection(report) {
  return { schema: report.schema, suiteId: report.suiteId, recipe: report.recipe,
    repeats: report.repeats.map(x36RepeatProjection), repeatSemanticSha256: report.repeatSemanticSha256,
    classifications: report.classifications, snapshot: report.snapshot, limits: report.limits };
}

export async function validateX36ReplayReport(value) {
  if (!exactKeys(value, ['schema', 'suiteId', 'recipe', 'repeats', 'repeatSemanticSha256',
    'classifications', 'snapshot', 'limits', 'semanticSha256'])
      || value.schema !== X36_REPLAY_REPORT_SCHEMA || value.suiteId !== X36_SUITE_ID
      || !HASH.test(value.repeatSemanticSha256 ?? '') || !HASH.test(value.semanticSha256 ?? '')
      || !Array.isArray(value.repeats) || value.repeats.length !== 2
      || stableX36Stringify(value.snapshot) !== stableX36Stringify(X36_REPLAY_SUITE.snapshot)
      || stableX36Stringify(value.limits) !== stableX36Stringify(X36_REPLAY_SUITE.limits)
      || !exactKeys(value.classifications, ['execution', 'validation', 'infrastructure'])
      || stableX36Stringify(value.classifications) !== stableX36Stringify({
        execution: { status: 'stopped-unsupported', academicStatus: 'unsupported', code: 'RUNTIME_CAPABILITY_UNSUPPORTED' },
        validation: { status: 'accepted', code: 'X36_REPLAY_EXACT' },
        infrastructure: { status: 'available', code: 'X36_TWO_WORKERS_RESPONDED' },
      })) reject('X36_REPLAY_REPORT_INVALID');
  const recipe = await validateX36ReplayRecipe(value.recipe);
  for (const repeat of value.repeats) {
    validateWorkerRuntimeIdentity(repeat.runtimeIdentity, repeat.runtimeBinding);
    if (repeat.runtimeBinding.artifactIdentity !== recipe.artifactIdentity
        || evaluateX36Repeat(repeat).validationStatus !== 'accepted') reject('X36_REPLAY_JOIN_INVALID');
  }
  const [first, second] = value.repeats;
  if (first.repeat !== 'A' || second.repeat !== 'B'
      || first.runtimeBinding.runtimeGeneration === second.runtimeBinding.runtimeGeneration
      || first.runtimeIdentity.workerInstanceNonce === second.runtimeIdentity.workerInstanceNonce) {
    reject('X36_REPLAY_WORKERS_NOT_FRESH');
  }
  const firstHash = await x36Sha256(x36RepeatProjection(first));
  const secondHash = await x36Sha256(x36RepeatProjection(second));
  if (firstHash !== secondHash || firstHash !== value.repeatSemanticSha256) {
    reject('X36_REPLAY_SEMANTIC_MISMATCH');
  }
  if (value.semanticSha256 !== await x36Sha256(semanticX36Projection(value))) {
    reject('X36_REPLAY_REPORT_HASH_INVALID');
  }
  return clone(value);
}

export function x36ReplayReportPassed(report) {
  return report?.repeats?.length === 2
    && report.repeats.every((repeat) => evaluateX36Repeat(repeat).academicStatus === 'unsupported')
    && report.snapshot?.capability === 'unavailable';
}
