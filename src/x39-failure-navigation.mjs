// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';
import { validateWorkerRuntimeIdentity } from './runtime-identity.mjs';

export const X39_FAILURE_LOCATION_SCHEMA = 'intent-mcu-x39-failure-navigation@1';
export const X39_PROFILE = 'board.atmega328p-16mhz-v1';
export const X39_EXPERIMENT_ID = 'avr-thermostat-boundary-v1';
export const X39_SCENARIO_ID = 'THERM-SCENARIO-EQUALITY-ENABLED';
export const X39_SOURCE_SHA256 = 'f5486cbebb429b224dc64f08953e8ba40a6cf9b2c734823d5dc1768cbb5758b0';
export const X39_INPUT_IDENTITY = 'c4d8ca8c6040529f4bacdbc2e451e66d9640db7f0c97e5f1acca806c1023d431';
export const X39_NET_ID = 'net-thermostat-heater-drive';
export const X39_NET_ENDPOINTS = Object.freeze(['board-1.D13', 'heater-resistor-1.A']);
const REQUIREMENTS = Object.freeze(['THERM-REQ-02', 'THERM-REQ-04', 'THERM-REQ-05']);
const HASH = /^[a-f0-9]{64}$/u;
const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };

export function stableX39Stringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableX39Stringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stableX39Stringify(value[key])}`,
  ).join(',')}}`;
  return JSON.stringify(value);
}

export async function x39Sha256(value) {
  const input = typeof value === 'string' ? value : stableX39Stringify(value);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

function endpointKey(endpoint) { return `${endpoint.component}.${endpoint.pin}`; }

function validateContext(value) {
  if (!exactKeys(value, ['profile', 'projectGeneration', 'runtimeBinding', 'runtimeIdentity',
    'inputIdentity', 'artifactIdentity', 'source', 'graph', 'result', 'timeline', 'retention'])
      || value.profile !== X39_PROFILE
      || !Number.isSafeInteger(value.projectGeneration) || value.projectGeneration < 1
      || value.inputIdentity !== X39_INPUT_IDENTITY || !HASH.test(value.artifactIdentity ?? '')
      || !exactKeys(value.source, ['file', 'text']) || value.source.file !== 'main.ino'
      || !exactKeys(value.retention, ['inputDrops', 'serialDrops'])
      || value.retention.inputDrops !== 0 || value.retention.serialDrops !== 0) {
    reject('X39_CONTEXT_INVALID');
  }
  const identity = validateWorkerRuntimeIdentity(value.runtimeIdentity, value.runtimeBinding);
  if (value.runtimeBinding.projectGeneration !== value.projectGeneration
      || value.runtimeBinding.artifactIdentity !== value.artifactIdentity
      || identity.projectGeneration !== value.projectGeneration
      || identity.artifactIdentity !== value.artifactIdentity) reject('X39_RUNTIME_IDENTITY_STALE');
  return identity;
}

function validateSource(source) {
  const lines = source.text.split('\n');
  if (lines[17] !== '  bool heating = enabled && temperatureC <= SETPOINT_C;'
      || lines[18] !== '  digitalWrite(HEATER_LED_PIN, heating ? HIGH : LOW);') {
    reject('X39_SOURCE_RANGE_INVALID');
  }
}

function validateTopology(graph) {
  const net = graph?.nets?.find((item) => item.id === X39_NET_ID);
  const endpoints = net?.endpoints?.map(endpointKey);
  if (!net || stableX39Stringify(endpoints) !== stableX39Stringify(X39_NET_ENDPOINTS)) {
    reject('X39_TOPOLOGY_INVALID');
  }
}

function validateTimeline(timeline) {
  const scenario = timeline?.scenarios?.find((item) => item.id === X39_SCENARIO_ID);
  const expectation = scenario?.events?.at(-1);
  if (!expectation || expectation.kind !== 'expect.pin-level' || expectation.pin !== 'D13'
      || expectation.level !== false || expectation.atMilliseconds !== 160
      || expectation.throughMilliseconds !== 350) reject('X39_TIME_WINDOW_INVALID');
}

function validateResult(result) {
  const controls = result?.observed?.inputControls;
  if (result?.schema !== 'intent-mcu-thermostat-observation-result@1'
      || result.experimentId !== X39_EXPERIMENT_ID || result.scenarioId !== X39_SCENARIO_ID
      || stableX39Stringify(result.requirementIds) !== stableX39Stringify(REQUIREMENTS)
      || result.status !== 'failed' || result.outcome?.academicStatus !== 'failed'
      || result.outcome?.jobStatus !== 'completed' || result.outcome?.evidenceStatus !== 'complete'
      || result.expected?.d13 !== false || result.observed?.d13Mode !== 'OUTPUT'
      || result.observed?.d13 !== true || !Number.isFinite(result.virtualMilliseconds)
      || result.virtualMilliseconds < 160 || result.virtualMilliseconds > 350
      || result.checks?.timeInWindow !== true || result.checks?.inputsComplete !== true
      || result.checks?.pinObserved !== true || result.checks?.serialObserved !== true
      || result.checks?.primaryExecutedPin !== false || result.checks?.corroboratingSerial !== false
      || !Array.isArray(controls) || controls.length !== 2
      || controls[0]?.componentId !== 'temperature-sensor-1' || controls[0]?.key !== 'position'
      || controls[0]?.value !== 0.405 || controls[0]?.targetCycle !== 0
      || controls[1]?.componentId !== 'enable-button-1' || controls[1]?.key !== 'pressed'
      || controls[1]?.value !== true || controls[1]?.targetCycle !== 0
      || !result.observed.serialText.includes('TEMP_C=30 BUTTON=PRESSED HEATER=ON STATE=HEAT')) {
    reject('X39_FAILURE_EVIDENCE_INVALID');
  }
}

export function semanticX39Projection(value) {
  return {
    schema: value.schema, profile: value.profile, projectGeneration: value.projectGeneration,
    runtimeBinding: value.runtimeBinding, runtimeIdentity: value.runtimeIdentity,
    inputIdentity: value.inputIdentity, artifactIdentity: value.artifactIdentity,
    source: value.source, experimentId: value.experimentId, scenarioId: value.scenarioId,
    requirementIds: value.requirementIds, outcome: value.outcome, pin: value.pin,
    net: value.net, observation: value.observation, completeness: value.completeness,
  };
}

export async function createX39FailureLocator(context) {
  const identity = validateContext(context);
  validateSource(context.source);
  if (await x39Sha256(context.source.text) !== X39_SOURCE_SHA256) reject('X39_SOURCE_IDENTITY_INVALID');
  validateTopology(context.graph);
  validateTimeline(context.timeline);
  validateResult(context.result);
  const locator = {
    schema: X39_FAILURE_LOCATION_SCHEMA,
    profile: context.profile,
    projectGeneration: context.projectGeneration,
    runtimeBinding: clone(context.runtimeBinding),
    runtimeIdentity: clone(identity),
    inputIdentity: context.inputIdentity,
    artifactIdentity: context.artifactIdentity,
    source: { file: 'main.ino', sha256: X39_SOURCE_SHA256, startLine: 18, endLine: 18,
      reviewedReference: 'fixture-bound; not emulator-derived source mapping' },
    experimentId: X39_EXPERIMENT_ID,
    scenarioId: X39_SCENARIO_ID,
    requirementIds: [...REQUIREMENTS],
    outcome: { academicStatus: 'failed', jobStatus: 'completed', evidenceStatus: 'complete' },
    pin: { id: 'D13', mode: 'OUTPUT', expectedLevel: false, actualLevel: true,
      provenance: 'historical producer observation; does not replace the current pin value' },
    net: { id: X39_NET_ID, endpoints: [...X39_NET_ENDPOINTS] },
    observation: { windowStartMilliseconds: 160, windowEndMilliseconds: 350,
      actualMilliseconds: context.result.virtualMilliseconds, provenance: 'worker-derived virtual time' },
    completeness: { inputDrops: 0, serialDrops: 0, inputsComplete: true, serialObserved: true },
    semanticSha256: '',
  };
  locator.semanticSha256 = await x39Sha256(semanticX39Projection(locator));
  return locator;
}

export async function validateX39FailureLocator(value, currentContext) {
  if (!exactKeys(value, ['schema', 'profile', 'projectGeneration', 'runtimeBinding', 'runtimeIdentity',
    'inputIdentity', 'artifactIdentity', 'source', 'experimentId', 'scenarioId', 'requirementIds',
    'outcome', 'pin', 'net', 'observation', 'completeness', 'semanticSha256'])
      || value.schema !== X39_FAILURE_LOCATION_SCHEMA || !HASH.test(value.semanticSha256 ?? '')
      || value.semanticSha256 !== await x39Sha256(semanticX39Projection(value))) {
    reject('X39_LOCATOR_INVALID');
  }
  const expected = await createX39FailureLocator(currentContext);
  if (stableX39Stringify(value) !== stableX39Stringify(expected)) reject('X39_FAILURE_LOCATION_STALE');
  return clone(value);
}
