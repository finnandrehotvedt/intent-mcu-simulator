// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { validateWorkerRuntimeIdentity } from './runtime-identity.mjs';
import { exactKeys } from './strict-json.mjs';

export const X23_USART_RECIPE_SCHEMA = 'intent-mcu-x23-usart-response-recipe@1';
export const X23_USART_REPORT_SCHEMA = 'intent-mcu-x23-usart-response-report@1';
export const X23_USART_SUITE_ID = 'x23-avr-usart0-single-byte-response-v1';
const HASH = /^[a-f0-9]{64}$/u;
const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };

export const X23_USART_SOURCE = `void setup() {
  pinMode(13, OUTPUT);
  digitalWrite(13, LOW);
  Serial.begin(9600);
  Serial.write('?');
}

void loop() {
  if (Serial.available() > 0) {
    const int response = Serial.read();
    if (response == 0x41) {
      digitalWrite(13, LOW);
      Serial.write("OK\\n");
    } else {
      digitalWrite(13, HIGH);
      Serial.write("ERR\\n");
    }
    for (;;) {}
  }
}
`;

export const X23_USART_KNOWN_BAD_SOURCE = X23_USART_SOURCE.replace(
  'if (response == 0x41) {', 'if (response == 0x41 || response == 0x42) {',
);

export const X23_USART_SUITE = Object.freeze({
  suiteId: X23_USART_SUITE_ID,
  profile: 'board.atmega328p-16mhz-v1',
  fixtureId: 'avr-usart0-single-byte-response-v1',
  sourceSha256: '1b3fa10abe827dea812c55f7a5251b6f5ef74b1a55c766a225437b44ada7f129',
  knownBadSourceSha256: '9ab837beef6e63c2b4feeed3adf8bf98cbc0df9305880ed46c318116e718aba8',
  artifactIdentity: 'cae86c0ec73a0459e7fa9f65cfe024c27c406c47e0844036050be749a93d95b2',
  knownBadArtifactIdentity: '86041d3e7929b707a375da6881424c0aa7eeaa164ca7a1f9a805fe0ff04249eb',
  hexSha256: '5ac54e69373317727744c71871b91b22c5ce8d9a93c93b19042eefc9bfcd06e2',
  knownBadHexSha256: '946fb61f2ee6195fb709094bfe621a051a0a007ebb604bd565f0c7f63bc1ba92',
  circuitSha256: '41e578e7716b2b88612053f6020eab2795e163ec10a499b2c0468366972114f6',
  uart: Object.freeze({ baud: 9600, dataBits: 8, parity: 'none', stopBits: 1 }),
  requestByte: 0x3f,
  expectedResponseByte: 0x41,
  incorrectResponseByte: 0x42,
  responseDelayCycles: 20,
  expectedBranch: Object.freeze({ d13: false, serialText: 'OK\n' }),
  incorrectBranch: Object.freeze({ d13: true, serialText: 'ERR\n' }),
  knownBadBranch: Object.freeze({ d13: false, serialText: 'OK\n' }),
  limits: Object.freeze({ requestBytes: 1, responseBytes: 1, localFixtureOnly: true,
    genericBus: false, i2cOrTwi: false, spi: false, physicalLineModel: false,
    otherProfiles: false, physicalHardwareProof: false }),
});

export function stableX23UsartStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableX23UsartStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stableX23UsartStringify(value[key])}`,
  ).join(',')}}`;
  return JSON.stringify(value);
}

export async function x23UsartSha256(value) {
  const input = typeof value === 'string' ? value : stableX23UsartStringify(value);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export async function x23UsartSuiteIdentity() { return x23UsartSha256(X23_USART_SUITE); }

export async function createX23UsartRecipe() {
  return {
    schema: X23_USART_RECIPE_SCHEMA, suiteId: X23_USART_SUITE_ID,
    suiteSha256: await x23UsartSuiteIdentity(), profile: X23_USART_SUITE.profile,
    fixtureId: X23_USART_SUITE.fixtureId, sourceSha256: X23_USART_SUITE.sourceSha256,
    knownBadSourceSha256: X23_USART_SUITE.knownBadSourceSha256,
    artifactIdentity: X23_USART_SUITE.artifactIdentity,
    knownBadArtifactIdentity: X23_USART_SUITE.knownBadArtifactIdentity,
    hexSha256: X23_USART_SUITE.hexSha256,
    knownBadHexSha256: X23_USART_SUITE.knownBadHexSha256,
    circuitSha256: X23_USART_SUITE.circuitSha256, uart: clone(X23_USART_SUITE.uart),
    requestByte: X23_USART_SUITE.requestByte,
    expectedResponseByte: X23_USART_SUITE.expectedResponseByte,
    incorrectResponseByte: X23_USART_SUITE.incorrectResponseByte,
    responseDelayCycles: X23_USART_SUITE.responseDelayCycles,
  };
}

export async function validateX23UsartRecipe(value) {
  const expected = await createX23UsartRecipe();
  if (!exactKeys(value, Object.keys(expected))
      || stableX23UsartStringify(value) !== stableX23UsartStringify(expected)) {
    reject('X23_USART_RECIPE_INVALID');
  }
  return clone(value);
}

const labelMode = Object.freeze({
  'expected-A': 'expected', 'expected-B': 'expected',
  'incorrect-A': 'incorrect', 'incorrect-B': 'incorrect',
  'known-bad-incorrect': 'known-bad-incorrect',
});

function expectedClassification(mode) {
  if (mode === 'expected') return { academicStatus: 'passed', code: 'EXPECTED_RESPONSE_ACCEPTED' };
  if (mode === 'incorrect') return { academicStatus: 'passed', code: 'INCORRECT_RESPONSE_DETECTED' };
  return { academicStatus: 'failed', code: 'INCORRECT_RESPONSE_ACCEPTED' };
}

export function evaluateX23UsartRun(value) {
  if (!value || typeof value !== 'object') return { validationStatus: 'rejected',
    evidenceStatus: 'incomplete', academicStatus: 'indeterminate', jobStatus: 'rejected',
    code: 'X23_USART_EVIDENCE_INVALID' };
  const expectedMode = labelMode[value.label];
  const branch = expectedMode === 'expected' ? X23_USART_SUITE.expectedBranch
    : expectedMode === 'incorrect' ? X23_USART_SUITE.incorrectBranch : X23_USART_SUITE.knownBadBranch;
  const responseByte = expectedMode === 'expected' ? X23_USART_SUITE.expectedResponseByte
    : X23_USART_SUITE.incorrectResponseByte;
  const exact = Boolean(expectedMode)
    && exactKeys(value, ['label', 'mode', 'firmware', 'runtimeBinding', 'runtimeIdentity',
      'request', 'fixture', 'rxRequest', 'rxComplete', 'consumer', 'retentionDrops', 'classifications'])
    && value.mode === expectedMode
    && value.firmware === (expectedMode === 'known-bad-incorrect' ? 'known-bad' : 'correct')
    && exactKeys(value.request, ['value', 'producerCycle', 'baud', 'frameCycles'])
    && value.request.value === X23_USART_SUITE.requestByte
    && Number.isSafeInteger(value.request.producerCycle) && value.request.producerCycle >= 0
    && Number.isFinite(value.request.baud) && value.request.baud > 0
    && Number.isSafeInteger(value.request.frameCycles) && value.request.frameCycles > 0
    && exactKeys(value.fixture, ['matchedRequest', 'responseByte', 'responseDelayCycles',
      'scheduledFromCycle', 'targetCycle'])
    && value.fixture.matchedRequest === true && value.fixture.responseByte === responseByte
    && value.fixture.responseDelayCycles === X23_USART_SUITE.responseDelayCycles
    && value.fixture.targetCycle === value.fixture.scheduledFromCycle + X23_USART_SUITE.responseDelayCycles
    && value.fixture.scheduledFromCycle >= value.request.producerCycle
    && exactKeys(value.rxRequest, ['value', 'cycle', 'targetCycle', 'accepted'])
    && value.rxRequest.value === responseByte && value.rxRequest.accepted === true
    && value.rxRequest.targetCycle === value.fixture.targetCycle
    && value.rxRequest.cycle >= value.rxRequest.targetCycle
    && exactKeys(value.rxComplete, ['cycle']) && value.rxComplete.cycle > value.rxRequest.cycle
    && exactKeys(value.consumer, ['serialText', 'd13', 'instructions', 'finalCycle'])
    && value.consumer.serialText === branch.serialText && value.consumer.d13 === branch.d13
    && Number.isSafeInteger(value.consumer.instructions) && value.consumer.instructions > 0
    && Number.isSafeInteger(value.consumer.finalCycle) && value.consumer.finalCycle >= value.rxComplete.cycle
    && exactKeys(value.retentionDrops, ['logic', 'serial', 'adc', 'unsupported'])
    && Object.values(value.retentionDrops).every((entry) => entry === 0)
    && exactKeys(value.classifications, ['academic', 'validation', 'infrastructure'])
    && stableX23UsartStringify(value.classifications) === stableX23UsartStringify({
      academic: expectedClassification(expectedMode),
      validation: { status: 'accepted', code: 'X23_USART_EVIDENCE_COMPLETE' },
      infrastructure: { status: 'completed', code: 'X23_USART_WORKER_COMPLETED' },
    });
  if (!exact) return { validationStatus: 'rejected', evidenceStatus: 'incomplete',
    academicStatus: 'indeterminate', jobStatus: 'completed', code: 'X23_USART_EVIDENCE_INVALID' };
  return { validationStatus: 'accepted', evidenceStatus: 'complete',
    academicStatus: value.classifications.academic.academicStatus, jobStatus: 'completed',
    code: value.classifications.academic.code };
}

export function x23UsartRunProjection(value) {
  return { mode: value.mode, firmware: value.firmware, request: value.request,
    fixture: value.fixture, rxRequest: value.rxRequest, rxComplete: value.rxComplete,
    consumer: value.consumer, retentionDrops: value.retentionDrops,
    classifications: value.classifications };
}

export function semanticX23UsartProjection(report) {
  return { schema: report.schema, suiteId: report.suiteId, recipe: report.recipe,
    runs: report.runs.map(x23UsartRunProjection), repeatHashes: report.repeatHashes,
    limits: report.limits };
}

export async function validateX23UsartReport(value) {
  if (!exactKeys(value, ['schema', 'suiteId', 'recipe', 'runs', 'repeatHashes', 'limits',
    'semanticSha256']) || value.schema !== X23_USART_REPORT_SCHEMA
      || value.suiteId !== X23_USART_SUITE_ID || !Array.isArray(value.runs)
      || value.runs.length !== 5 || !exactKeys(value.repeatHashes, ['expected', 'incorrect'])
      || !HASH.test(value.repeatHashes.expected ?? '') || !HASH.test(value.repeatHashes.incorrect ?? '')
      || !HASH.test(value.semanticSha256 ?? '')
      || stableX23UsartStringify(value.limits) !== stableX23UsartStringify(X23_USART_SUITE.limits)) {
    reject('X23_USART_REPORT_INVALID');
  }
  const recipe = await validateX23UsartRecipe(value.recipe);
  const labels = ['expected-A', 'expected-B', 'incorrect-A', 'incorrect-B', 'known-bad-incorrect'];
  for (const [index, run] of value.runs.entries()) {
    if (run.label !== labels[index] || evaluateX23UsartRun(run).validationStatus !== 'accepted') {
      reject('X23_USART_RUN_INVALID');
    }
    validateWorkerRuntimeIdentity(run.runtimeIdentity, run.runtimeBinding);
    const artifact = run.firmware === 'known-bad' ? recipe.knownBadArtifactIdentity : recipe.artifactIdentity;
    if (run.runtimeBinding.artifactIdentity !== artifact) reject('X23_USART_ARTIFACT_JOIN_INVALID');
  }
  const generations = new Set(value.runs.map((run) => run.runtimeBinding.runtimeGeneration));
  const nonces = new Set(value.runs.map((run) => run.runtimeIdentity.workerInstanceNonce));
  if (generations.size !== 5 || nonces.size !== 5) reject('X23_USART_WORKERS_NOT_FRESH');
  const expectedA = await x23UsartSha256(x23UsartRunProjection(value.runs[0]));
  const expectedB = await x23UsartSha256(x23UsartRunProjection(value.runs[1]));
  const incorrectA = await x23UsartSha256(x23UsartRunProjection(value.runs[2]));
  const incorrectB = await x23UsartSha256(x23UsartRunProjection(value.runs[3]));
  if (expectedA !== expectedB || expectedA !== value.repeatHashes.expected
      || incorrectA !== incorrectB || incorrectA !== value.repeatHashes.incorrect) {
    reject('X23_USART_REPEAT_MISMATCH');
  }
  if (value.semanticSha256 !== await x23UsartSha256(semanticX23UsartProjection(value))) {
    reject('X23_USART_REPORT_HASH_INVALID');
  }
  return clone(value);
}

export function x23UsartReportPassed(report) {
  return report?.runs?.length === 5
    && report.runs.slice(0, 4).every((run) => evaluateX23UsartRun(run).academicStatus === 'passed')
    && evaluateX23UsartRun(report.runs[4]).academicStatus === 'failed';
}
