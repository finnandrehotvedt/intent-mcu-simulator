// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { resolveDigitalDrivers } from './circuit-engine.mjs';
import { candidateCompilerTarget } from './compile-targets.mjs';
import { validateWorkerRuntimeIdentity } from './runtime-identity.mjs';
import { exactKeys } from './strict-json.mjs';

export const X33_RUNTIME_REPORT_SCHEMA = 'intent-mcu-x33-runtime-digital-state-report@1';
export const X33_RUNTIME_SUITE_ID = 'x33-runtime-avr-digital-state-producer-v1';
export const X33_RUNTIME_SOURCE = `void setup() {
  pinMode(2, INPUT);
  pinMode(5, INPUT);
  pinMode(3, OUTPUT);
  pinMode(4, OUTPUT);
  digitalWrite(3, HIGH);
  digitalWrite(4, LOW);
  Serial.begin(115200);
  Serial.println("X33_READY");
}
void loop() {}
`;
export const X33_RUNTIME_CIRCUIT = Object.freeze({
  schema: 'teach-lab-circuit@2',
  components: Object.freeze([Object.freeze({ id: 'board-1', type: 'board.atmega328p-16mhz-v1',
    label: 'X33 runtime board', properties: Object.freeze({}), controls: Object.freeze({}) })]),
  nets: Object.freeze([]),
  junctions: Object.freeze([]),
});

const clone = (value) => structuredClone(value);
const HASH = /^[a-f0-9]{64}$/u;
const IMAGE = /^sha256:[a-f0-9]{64}$/u;
const PIN_KEYS = ['pin', 'mode', 'level', 'externalDrive', 'pwm', 'diagnostic'];
const reject = (code) => { throw Object.assign(new Error(code), { code }); };

export const X33_RUNTIME_SUITE = Object.freeze({
  schema: 'intent-mcu-x33-runtime-digital-state-contract@1',
  suiteId: X33_RUNTIME_SUITE_ID,
  suiteVersion: '1.0.0',
  profile: 'board.atmega328p-16mhz-v1',
  sourceSha256: '423de6f58cb5df2ad796452d193ff8267f52198c9b3f0a809cd87566c2f7b235',
  runtimeCircuitSha256: 'ba7084e066f1f2d21b8bed95e5bee6c8c081789c53bde32630d7049ccb753e90',
  readyMarker: 'X33_READY',
  toolchainIdentitySha256: candidateCompilerTarget('board.atmega328p-16mhz-v1').toolchainIdentitySha256,
  toolchainImageId: 'sha256:62e4324594b63e88b17052a17eb9edf52593aff7d907647bc1e9c2fd809fbc74',
  runtime: Object.freeze({ engine: 'avr8js', version: '0.21.1',
    workerIdentitySchema: 'intent-mcu-worker-runtime-identity@1' }),
  rows: Object.freeze([
    Object.freeze({ rowId: 'X33-RUNTIME-HIGH-Z', netId: 'net-x33-runtime-high-z', pins: Object.freeze(['D2']) }),
    Object.freeze({ rowId: 'X33-RUNTIME-LOW', netId: 'net-x33-runtime-low', pins: Object.freeze(['D5']) }),
    Object.freeze({ rowId: 'X33-RUNTIME-CONFLICT', netId: 'net-x33-runtime-conflict', pins: Object.freeze(['D3', 'D4']) }),
  ]),
  topology: Object.freeze({
    netId: 'net-x33-runtime-conflict',
    endpoints: Object.freeze([
      Object.freeze({ component: 'board-1', pin: 'D3' }),
      Object.freeze({ component: 'board-1', pin: 'D4' }),
    ]),
  }),
  repeats: Object.freeze(['A', 'B']),
  limits: Object.freeze({ fixedSourceOnly: true, fixedPinsOnly: true, actualRuntimePinProducers: true,
    idealProjectNetClassification: true, avr8jsElectricalCoupling: false, physicalVoltageProof: false,
    currentOrDamagePrediction: false, analogueSolver: false, genericLiveNetSolver: false,
    otherProfilesNormalized: false }),
});

export function stableX33RuntimeStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableX33RuntimeStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stableX33RuntimeStringify(value[key])}`,
  ).join(',')}}`;
  return JSON.stringify(value);
}

export async function x33RuntimeSha256(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export async function validateX33RuntimeSuite(value = X33_RUNTIME_SUITE) {
  if (stableX33RuntimeStringify(value) !== stableX33RuntimeStringify(X33_RUNTIME_SUITE)) {
    reject('X33_RUNTIME_CONTRACT_DRIFT');
  }
  if (await x33RuntimeSha256(value.sourceSha256 === X33_RUNTIME_SUITE.sourceSha256
    ? X33_RUNTIME_SOURCE : '') !== value.sourceSha256) reject('X33_RUNTIME_SOURCE_HASH_STALE');
  if (await x33RuntimeSha256(stableX33RuntimeStringify(X33_RUNTIME_CIRCUIT))
      !== value.runtimeCircuitSha256) reject('X33_RUNTIME_CIRCUIT_HASH_STALE');
  return clone(value);
}

export async function x33RuntimeSuiteIdentity(value = X33_RUNTIME_SUITE) {
  return x33RuntimeSha256(stableX33RuntimeStringify(await validateX33RuntimeSuite(value)));
}

export async function x33RuntimeTopologyIdentity(topology = X33_RUNTIME_SUITE.topology) {
  if (stableX33RuntimeStringify(topology) !== stableX33RuntimeStringify(X33_RUNTIME_SUITE.topology)) {
    reject('X33_RUNTIME_TOPOLOGY_CHANGED');
  }
  return x33RuntimeSha256(stableX33RuntimeStringify(topology));
}

function pin(value, expectedPin) {
  if (!exactKeys(value, PIN_KEYS) || value.pin !== expectedPin || typeof value.level !== 'boolean'
      || typeof value.mode !== 'string' || typeof value.externalDrive !== 'string'
      || value.pwm !== null || value.diagnostic !== 'OK') reject('X33_RUNTIME_PIN_MALFORMED');
  return clone(value);
}

export function projectX33RuntimeRows(pinMap, topology = X33_RUNTIME_SUITE.topology) {
  if (!exactKeys(pinMap, ['D2', 'D3', 'D4', 'D5'])) reject('X33_RUNTIME_PIN_SET_INVALID');
  if (stableX33RuntimeStringify(topology) !== stableX33RuntimeStringify(X33_RUNTIME_SUITE.topology)) {
    reject('X33_RUNTIME_TOPOLOGY_CHANGED');
  }
  const d2 = pin(pinMap.D2, 'D2'); const d3 = pin(pinMap.D3, 'D3');
  const d4 = pin(pinMap.D4, 'D4'); const d5 = pin(pinMap.D5, 'D5');
  if (d2.mode !== 'INPUT' || d2.externalDrive !== 'RELEASED') reject('X33_RUNTIME_HIGH_Z_PRODUCER_INVALID');
  if (d5.mode !== 'INPUT' || d5.externalDrive !== 'LOW' || d5.level !== false) {
    reject('X33_RUNTIME_LOW_PRODUCER_INVALID');
  }
  if (d3.mode !== 'OUTPUT' || d3.level !== true || d4.mode !== 'OUTPUT' || d4.level !== false) {
    reject('X33_RUNTIME_CONFLICT_PRODUCERS_INVALID');
  }
  const rows = [
    { rowId: 'X33-RUNTIME-HIGH-Z', netId: 'net-x33-runtime-high-z', producerPins: [d2],
      annotations: [{ producerId: 'board-1.D2', level: 'HIGH_Z' }],
      resolution: resolveDigitalDrivers(['HIGH_Z']), validation: { status: 'accepted', code: 'OK' },
      requirement: { status: 'indeterminate', reason: 'INPUT_UNDRIVEN', academicVerdict: null } },
    { rowId: 'X33-RUNTIME-LOW', netId: 'net-x33-runtime-low', producerPins: [d5],
      annotations: [{ producerId: 'board-1.D5', level: 'LOW' }],
      resolution: resolveDigitalDrivers(['LOW']), validation: { status: 'accepted', code: 'OK' },
      requirement: { status: 'completed', reason: null, academicVerdict: 'passed' } },
    { rowId: 'X33-RUNTIME-CONFLICT', netId: 'net-x33-runtime-conflict', producerPins: [d3, d4],
      annotations: [{ producerId: 'board-1.D3', level: 'HIGH' }, { producerId: 'board-1.D4', level: 'LOW' }],
      resolution: resolveDigitalDrivers(['HIGH', 'LOW']),
      validation: { status: 'rejected-before-requirement', code: 'OUTPUT_CONTENTION' },
      requirement: { status: 'not-run', reason: 'OUTPUT_CONTENTION', academicVerdict: null } },
  ];
  if (rows[0].resolution !== 'HIGH_Z' || rows[1].resolution !== 'LOW'
      || rows[2].resolution !== 'CONFLICT') reject('X33_RUNTIME_RESOLVER_DRIFT');
  return rows;
}

export function x33RuntimeRepeatProjection(repeat) {
  return { marker: repeat.marker, pins: repeat.pins, rows: repeat.rows, drops: repeat.drops };
}

export function semanticX33RuntimeProjection(report) {
  return { schema: report.schema, suiteId: report.suiteId, suiteSha256: report.suiteSha256,
    profile: report.profile, sourceSha256: report.sourceSha256,
    artifactIdentity: report.artifactIdentity, inputIdentity: report.inputIdentity,
    toolchainImageId: report.toolchainImageId,
    toolchainIdentitySha256: report.toolchainIdentitySha256,
    runtime: report.runtime,
    topology: report.topology, topologySha256: report.topologySha256,
    repeats: report.repeats.map(x33RuntimeRepeatProjection),
    repeatSemanticSha256: report.repeatSemanticSha256,
    validationProbes: report.validationProbes, limits: report.limits };
}

function validateRepeat(repeat, report) {
  if (!exactKeys(repeat, ['repeat', 'runtimeBinding', 'runtimeIdentity', 'marker', 'pins', 'rows', 'drops'])
      || !['A', 'B'].includes(repeat.repeat)
      || !exactKeys(repeat.marker, ['text', 'observed', 'cycle'])
      || repeat.marker.text !== X33_RUNTIME_SUITE.readyMarker || repeat.marker.observed !== true
      || !Number.isSafeInteger(repeat.marker.cycle) || repeat.marker.cycle <= 0
      || !exactKeys(repeat.drops, ['logic', 'serial', 'adc', 'unsupported'])
      || Object.values(repeat.drops).some((value) => value !== 0)) reject('X33_RUNTIME_REPEAT_INVALID');
  validateWorkerRuntimeIdentity(repeat.runtimeIdentity, repeat.runtimeBinding);
  if (repeat.runtimeBinding.artifactIdentity !== report.artifactIdentity) reject('X33_RUNTIME_ARTIFACT_JOIN_INVALID');
  const projected = projectX33RuntimeRows(repeat.pins, report.topology);
  if (stableX33RuntimeStringify(projected) !== stableX33RuntimeStringify(repeat.rows)) {
    reject('X33_RUNTIME_ROWS_INVALID');
  }
}

export async function validateX33RuntimeReport(value) {
  if (!exactKeys(value, ['schema', 'suiteId', 'suiteSha256', 'profile', 'sourceSha256',
    'artifactIdentity', 'inputIdentity', 'toolchainImageId', 'toolchainIdentitySha256',
    'runtime', 'topology', 'topologySha256', 'repeats', 'repeatSemanticSha256', 'validationProbes',
    'limits', 'semanticSha256']) || value.schema !== X33_RUNTIME_REPORT_SCHEMA
      || value.suiteId !== X33_RUNTIME_SUITE_ID || value.profile !== X33_RUNTIME_SUITE.profile
      || value.sourceSha256 !== X33_RUNTIME_SUITE.sourceSha256
      || !HASH.test(value.artifactIdentity ?? '') || !HASH.test(value.inputIdentity ?? '')
      || !IMAGE.test(value.toolchainImageId ?? '') || value.toolchainImageId !== X33_RUNTIME_SUITE.toolchainImageId
      || value.toolchainIdentitySha256 !== X33_RUNTIME_SUITE.toolchainIdentitySha256
      || stableX33RuntimeStringify(value.runtime) !== stableX33RuntimeStringify(X33_RUNTIME_SUITE.runtime)
      || !HASH.test(value.suiteSha256 ?? '') || !HASH.test(value.topologySha256 ?? '')
      || !HASH.test(value.repeatSemanticSha256 ?? '') || !HASH.test(value.semanticSha256 ?? '')
      || !Array.isArray(value.repeats) || value.repeats.length !== 2
      || stableX33RuntimeStringify(value.limits) !== stableX33RuntimeStringify(X33_RUNTIME_SUITE.limits)) {
    reject('X33_RUNTIME_REPORT_STALE_OR_UNKNOWN');
  }
  if (value.suiteSha256 !== await x33RuntimeSuiteIdentity()
      || value.topologySha256 !== await x33RuntimeTopologyIdentity(value.topology)) {
    reject('X33_RUNTIME_REPORT_STALE_OR_UNKNOWN');
  }
  for (const repeat of value.repeats) validateRepeat(repeat, value);
  const [first, second] = value.repeats;
  if (first.repeat !== 'A' || second.repeat !== 'B'
      || first.runtimeBinding.runtimeGeneration === second.runtimeBinding.runtimeGeneration
      || first.runtimeIdentity.workerInstanceNonce === second.runtimeIdentity.workerInstanceNonce) {
    reject('X33_RUNTIME_WORKERS_NOT_FRESH');
  }
  const firstHash = await x33RuntimeSha256(stableX33RuntimeStringify(x33RuntimeRepeatProjection(first)));
  const secondHash = await x33RuntimeSha256(stableX33RuntimeStringify(x33RuntimeRepeatProjection(second)));
  if (firstHash !== secondHash || value.repeatSemanticSha256 !== firstHash) {
    reject('X33_RUNTIME_REPEAT_SEMANTICS_MISMATCH');
  }
  const probes = value.validationProbes;
  if (!exactKeys(probes, ['rawFalseRejected', 'releasedLowRejected', 'highLowRejected',
    'sameLevelConflictRejected', 'thirdEndpointRejected', 'staleRecordRejected',
    'crossWorkerRejected', 'extraRecordRejected', 'malformedRecordRejected'])
      || Object.values(probes).some((entry) => entry !== true)) reject('X33_RUNTIME_NEGATIVE_PROBES_INVALID');
  const hash = await x33RuntimeSha256(stableX33RuntimeStringify(semanticX33RuntimeProjection(value)));
  if (hash !== value.semanticSha256) reject('X33_RUNTIME_REPORT_HASH_INVALID');
  return clone(value);
}

export function x33RuntimeReportPassed(report) {
  return report?.repeats?.length === 2
    && report.repeats.every((repeat) => repeat.rows[1].requirement.academicVerdict === 'passed'
      && repeat.rows[0].requirement.status === 'indeterminate'
      && repeat.rows[2].validation.code === 'OUTPUT_CONTENTION');
}
