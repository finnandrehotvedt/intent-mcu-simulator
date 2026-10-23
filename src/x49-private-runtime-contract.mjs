// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';
import {
  runtimeInitBinding, validateWorkerRuntimeIdentity, MODEL_RUNTIME_BINDING_SCHEMA,
} from './runtime-identity.mjs';
import {
  stableX49Stringify, x49Sha256, X49_CASES, X49_CASE_SCHEMA,
  X49_EVIDENCE_STATE_SCHEMA, X49_EXPERIMENT_BINDING_SCHEMA, X49_FIXTURE_CLASS,
  X49_INPUT_SCHEMA, X49_MODEL_OUTPUT_SCHEMA, X49_PROFILE, X49_RETENTION_SCHEMA,
  X49_TIME_SCHEMA,
} from './x49-sensor-offset.mjs';
import { validateX49RuntimeProbe } from './x49-instrumented-fixture-contract.mjs';

export const X49_PRIVATE_MANIFEST_SCHEMA = 'intent-mcu-x49-private-runtime-manifest@1';
export const X49_PRIVATE_IMPLEMENTATION_ID = 'intent-mcu-x49-private-avr-runtime@1';
export const X49_PRIVATE_IMPLEMENTATION_VERSION = '1.0.0-x49-private.1';
export const X49_PRIVATE_PROTOCOL = 'intent-mcu-x49-private-worker@1';
export const X49_PRIVATE_TERMINAL_SCHEMA = 'intent-mcu-x49-private-terminal@1';
export const X49_PRIVATE_TRUST_ANCHOR = 'src/x49-private-runtime-manifest.json';
export const X49_PRIVATE_WRITE_LIMIT = 8;
export const X49_PRIVATE_STARTUP_WRITE_LIMIT = 16;
export const X49_PRIVATE_STARTUP_CYCLE_LIMIT = 1_000_000;
export const X49_PRIVATE_SLICE_INSTRUCTIONS = 10_000;
export const X49_PRIVATE_RUNTIME_MEMBERS = Object.freeze([
  'src/x49-private.worker.mjs',
  'src/x49-private-instrumented-runtime.mjs',
  'src/x49-private-runtime-contract.mjs',
  'src/atmega328p-adapter.mjs',
  'src/hex.mjs',
  'src/x34-precision-observer.mjs',
  'src/x34-precision-fixture.mjs',
  'src/x35-causal-observer.mjs',
  'src/x35-causal-chain-contract.mjs',
  'src/x46-usart-configuration-producer.mjs',
  'src/x46-usart-rx-limits.mjs',
  'src/x49-instrumented-observer-core.mjs',
  'src/x49-instrumented-fixture-contract.mjs',
  'src/x49-sensor-offset.mjs',
  'src/runtime-identity.mjs',
  'src/strict-json.mjs',
  'src/thermostat-source.mjs',
]);
export const X49_PRIVATE_TOOL_MEMBERS = Object.freeze([
  'src/x49-avr-probe-symbol.mjs',
  'scripts/generate-x49-private-runtime-manifest.mjs',
]);
export const X49_PRIVATE_EXTERNAL_CONTRACTS = Object.freeze(['avr8js@0.21.1']);

const HASH = /^[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };

function validateMembers(value, expected) {
  if (!Array.isArray(value) || value.length !== expected.length) reject('X49_PRIVATE_MANIFEST_MEMBERS');
  for (const [index, item] of value.entries()) {
    if (!exactKeys(item, ['path', 'sha256']) || item.path !== expected[index]
        || !HASH.test(item.sha256 ?? '')) reject('X49_PRIVATE_MANIFEST_MEMBERS');
  }
  return clone(value);
}

export async function validateX49PrivateManifest(value, cryptoImpl = globalThis.crypto,
  trustedManifest = null) {
  if (!exactKeys(value, ['schema', 'implementationId', 'version', 'runtimeMembers',
    'evidenceToolMembers', 'externalContracts', 'implementationSha256',
    'evidenceToolSha256', 'semanticSha256']) || value.schema !== X49_PRIVATE_MANIFEST_SCHEMA
      || value.implementationId !== X49_PRIVATE_IMPLEMENTATION_ID
      || value.version !== X49_PRIVATE_IMPLEMENTATION_VERSION
      || !HASH.test(value.implementationSha256 ?? '') || !HASH.test(value.evidenceToolSha256 ?? '')
      || !HASH.test(value.semanticSha256 ?? '')
      || JSON.stringify(value.externalContracts) !== JSON.stringify(X49_PRIVATE_EXTERNAL_CONTRACTS)) {
    reject('X49_PRIVATE_MANIFEST_INVALID');
  }
  const runtimeMembers = validateMembers(value.runtimeMembers, X49_PRIVATE_RUNTIME_MEMBERS);
  const evidenceToolMembers = validateMembers(value.evidenceToolMembers, X49_PRIVATE_TOOL_MEMBERS);
  const implementationSha256 = await x49Sha256(stableX49Stringify({
    runtimeMembers, externalContracts: value.externalContracts,
  }), cryptoImpl);
  const evidenceToolSha256 = await x49Sha256(stableX49Stringify({ evidenceToolMembers }), cryptoImpl);
  const semantic = { ...clone(value) }; delete semantic.semanticSha256;
  const semanticSha256 = await x49Sha256(stableX49Stringify(semantic), cryptoImpl);
  if (value.implementationSha256 !== implementationSha256
      || value.evidenceToolSha256 !== evidenceToolSha256
      || value.semanticSha256 !== semanticSha256) reject('X49_PRIVATE_MANIFEST_HASH_INVALID');
  if (!trustedManifest || stableX49Stringify(value) !== stableX49Stringify(trustedManifest)) {
    reject('X49_PRIVATE_MANIFEST_TRUST_INVALID');
  }
  return clone(value);
}

function validateExperiment(value, probe) {
  if (!exactKeys(value, ['schema', 'profile', 'projectGeneration', 'graphIdentity',
    'sourceSha256', 'artifactIdentity', 'modelImplementationSha256',
    'modelExecutionContextSha256', 'fixtureClass', 'componentId', 'boardPin'])
      || value.schema !== X49_EXPERIMENT_BINDING_SCHEMA || value.profile !== X49_PROFILE
      || !Number.isSafeInteger(value.projectGeneration) || value.projectGeneration < 1
      || !/^sha256:[a-f0-9]{64}$/u.test(value.graphIdentity ?? '')
      || value.sourceSha256 !== probe.sourceSha256 || value.artifactIdentity !== probe.artifactIdentity
      || !HASH.test(value.modelImplementationSha256 ?? '')
      || !HASH.test(value.modelExecutionContextSha256 ?? '')
      || value.fixtureClass !== X49_FIXTURE_CLASS
      || value.componentId !== 'temperature-sensor-1' || value.boardPin !== 'A1') {
    reject('X49_PRIVATE_EXPERIMENT_INVALID');
  }
  return clone(value);
}

export async function x49PrivateExecutionContext({ manifest, probe, experimentBinding,
  hexSha256 }, cryptoImpl = globalThis.crypto) {
  if (!HASH.test(hexSha256 ?? '')) reject('X49_PRIVATE_HEX_HASH_INVALID');
  return x49Sha256(stableX49Stringify({ protocol: X49_PRIVATE_PROTOCOL,
    implementationSha256: manifest.implementationSha256,
    sourceSha256: probe.sourceSha256, artifactIdentity: probe.artifactIdentity,
    elfSha256: probe.symbol.elfSha256, hexSha256, symbol: probe.symbol,
    projectGeneration: experimentBinding.projectGeneration,
    graphIdentity: experimentBinding.graphIdentity, profile: X49_PROFILE,
    fixtureClass: X49_FIXTURE_CLASS,
    canonicalInputs: X49_CASES.map(({ caseId, inputIdentity, authored }) =>
      ({ caseId, inputIdentity, authored })),
  }), cryptoImpl);
}

export async function validateX49PrivateInit(value, cryptoImpl = globalThis.crypto,
  trustedManifest = null) {
  if (!exactKeys(value, ['command', 'manifest', 'hex', 'hexSha256', 'probe', 'caseId',
    'experimentBinding', 'runtimeBinding', 'receiptNonce']) || value.command !== 'init'
      || typeof value.hex !== 'string' || value.hex.length < 1 || value.hex.length > 2_000_000
      || !HASH.test(value.hexSha256 ?? '')
      || !NONCE.test(value.receiptNonce ?? '')) reject('X49_PRIVATE_INIT_INVALID');
  const manifest = await validateX49PrivateManifest(value.manifest, cryptoImpl, trustedManifest);
  if (await x49Sha256(value.hex, cryptoImpl) !== value.hexSha256) reject('X49_PRIVATE_HEX_HASH_INVALID');
  const probe = validateX49RuntimeProbe(value.probe);
  const expected = X49_CASES.find((item) => item.caseId === value.caseId);
  if (!expected) reject('X49_PRIVATE_CASE_INVALID');
  let runtimeBinding; try { runtimeBinding = runtimeInitBinding(value.runtimeBinding); }
  catch { return reject('X49_PRIVATE_RUNTIME_BINDING_INVALID'); }
  if (runtimeBinding.schema !== MODEL_RUNTIME_BINDING_SCHEMA) reject('X49_PRIVATE_RUNTIME_BINDING_INVALID');
  const experimentBinding = validateExperiment(value.experimentBinding, probe);
  const context = await x49PrivateExecutionContext({ manifest, probe, experimentBinding,
    hexSha256: value.hexSha256 }, cryptoImpl);
  if (runtimeBinding.projectGeneration !== experimentBinding.projectGeneration
      || runtimeBinding.artifactIdentity !== probe.artifactIdentity
      || runtimeBinding.modelImplementationSha256 !== manifest.implementationSha256
      || runtimeBinding.modelExecutionContextSha256 !== context
      || experimentBinding.modelImplementationSha256 !== manifest.implementationSha256
      || experimentBinding.modelExecutionContextSha256 !== context) {
    reject('X49_PRIVATE_BINDING_MISMATCH');
  }
  return { command: 'init', manifest, hex: value.hex, hexSha256: value.hexSha256,
    probe, caseId: value.caseId,
    expected: clone(expected), experimentBinding, runtimeBinding,
    receiptNonce: value.receiptNonce };
}

export function validateX49PrivateCommand(value) {
  if (exactKeys(value, ['command', 'receiptNonce']) && value.command === 'observe-first'
      && NONCE.test(value.receiptNonce ?? '')) return clone(value);
  if (exactKeys(value, ['command', 'receiptNonce']) && value.command === 'cancel'
      && NONCE.test(value.receiptNonce ?? '')) return clone(value);
  if (exactKeys(value, ['command', 'disposeToken']) && value.command === 'dispose'
      && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value.disposeToken ?? '')) return clone(value);
  reject('X49_PRIVATE_COMMAND_INVALID');
}

export function x49PrivateTerminal({ receiptNonce, runtimeIdentity, experimentBinding,
  state, reason, evidence }) {
  if (!NONCE.test(receiptNonce ?? '') || !['complete', 'incomplete'].includes(state)
      || !experimentBinding || typeof experimentBinding !== 'object'
      || (state === 'complete' ? reason !== null : typeof reason !== 'string')) {
    reject('X49_PRIVATE_TERMINAL_INVALID');
  }
  return Object.freeze({ schema: X49_PRIVATE_TERMINAL_SCHEMA, protocol: X49_PRIVATE_PROTOCOL,
    receiptNonce, runtimeIdentity: clone(runtimeIdentity),
    experimentBinding: clone(experimentBinding), state, reason,
    evidence: evidence === null ? null : clone(evidence) });
}

function completeEvidenceIsExact(raw) {
  return raw && exactKeys(raw, ['caseId', 'inputIdentity', 'inputAppliedCycle',
    'inputRetainedThroughCycle', 'adc', 'firmwareTransaction', 'pin', 'time', 'retention'])
    && Number.isSafeInteger(raw.inputRetainedThroughCycle)
    && exactKeys(raw.adc, ['schema', 'channel', 'value', 'startCycle', 'completionCycle'])
    && raw.adc.schema === 'intent-mcu-x49-adc-observation@1'
    && Number.isSafeInteger(raw.adc.channel) && Number.isSafeInteger(raw.adc.value)
    && Number.isSafeInteger(raw.adc.startCycle) && Number.isSafeInteger(raw.adc.completionCycle)
    && exactKeys(raw.firmwareTransaction, ['schema', 'fixtureClass', 'sourceSha256',
      'artifactIdentity', 'commit', 'temperatureC', 'd13Level', 'adcChannel', 'adcValue',
      'adcCompletionCycle', 'beginCycle', 'commitCycle'])
    && raw.firmwareTransaction.schema === 'intent-mcu-x34-firmware-producer@1'
    && Object.entries(raw.firmwareTransaction).filter(([key]) => !['schema', 'fixtureClass',
      'sourceSha256', 'artifactIdentity'].includes(key)).every(([, value]) => Number.isSafeInteger(value))
    && exactKeys(raw.pin, ['schema', 'pin', 'mode', 'level', 'observedCycle'])
    && raw.pin.schema === 'intent-mcu-x49-pin-observation@1'
    && typeof raw.pin.pin === 'string' && typeof raw.pin.mode === 'string'
    && typeof raw.pin.level === 'boolean' && Number.isSafeInteger(raw.pin.observedCycle)
    && exactKeys(raw.time, ['cpuCycles', 'virtualMilliseconds'])
    && Number.isSafeInteger(raw.time.cpuCycles) && Number.isFinite(raw.time.virtualMilliseconds)
    && exactKeys(raw.retention, ['completeThroughCycle', 'droppedTraceRows',
      'droppedAdcCompletions', 'droppedMailboxTransactions', 'retainedMailboxWrites',
      'mailboxWriteLimit'])
    && Object.values(raw.retention).every(Number.isSafeInteger);
}

export function x49PrivateObservation(acceptedInit, terminal) {
  if (!acceptedInit?.expected || !exactKeys(terminal, ['schema', 'protocol', 'receiptNonce',
    'runtimeIdentity', 'experimentBinding', 'state', 'reason', 'evidence'])
      || terminal.schema !== X49_PRIVATE_TERMINAL_SCHEMA || terminal.protocol !== X49_PRIVATE_PROTOCOL
      || terminal.receiptNonce !== acceptedInit.receiptNonce
      || stableX49Stringify(terminal.experimentBinding)
        !== stableX49Stringify(acceptedInit.experimentBinding)) reject('X49_PRIVATE_TERMINAL_BINDING_INVALID');
  let runtimeIdentity;
  try { runtimeIdentity = validateWorkerRuntimeIdentity(terminal.runtimeIdentity,
    acceptedInit.runtimeBinding); } catch { return reject('X49_PRIVATE_TERMINAL_BINDING_INVALID'); }
  const expected = acceptedInit.expected; const raw = terminal.evidence;
  const complete = terminal.state === 'complete';
  if (complete && (!completeEvidenceIsExact(raw) || raw.caseId !== expected.caseId
      || raw.inputIdentity !== expected.inputIdentity || raw.inputAppliedCycle !== 0)) {
    reject('X49_PRIVATE_TERMINAL_EVIDENCE_INVALID');
  }
  return {
    schema: X49_CASE_SCHEMA, caseId: expected.caseId, profile: X49_PROFILE,
    input: complete ? { schema: X49_INPUT_SCHEMA, inputIdentity: expected.inputIdentity,
      graphIdentity: acceptedInit.experimentBinding.graphIdentity, authored: clone(expected.authored),
      targetCycle: 0, appliedCycle: raw.inputAppliedCycle,
      retainedThroughCycle: raw.inputRetainedThroughCycle } : null,
    modelOutput: complete ? { schema: X49_MODEL_OUTPUT_SCHEMA,
      componentId: acceptedInit.experimentBinding.componentId,
      boardPin: acceptedInit.experimentBinding.boardPin,
      voltage: expected.calculated.modelVoltage } : null,
    runtimeBinding: clone(acceptedInit.runtimeBinding), runtimeIdentity,
    adc: complete ? clone(raw.adc) : null,
    firmwareTransaction: complete ? clone(raw.firmwareTransaction) : null,
    pin: complete ? clone(raw.pin) : null,
    time: complete ? { schema: X49_TIME_SCHEMA, ...clone(raw.time) } : null,
    retention: complete ? { schema: X49_RETENTION_SCHEMA,
      completeThroughCycle: raw.retention.completeThroughCycle,
      droppedTraceRows: raw.retention.droppedTraceRows,
      droppedAdcCompletions: raw.retention.droppedAdcCompletions,
      droppedMailboxTransactions: raw.retention.droppedMailboxTransactions } : null,
    evidence: { schema: X49_EVIDENCE_STATE_SCHEMA, state: complete ? 'complete' : 'incomplete',
      reason: complete ? null : terminal.reason },
  };
}
