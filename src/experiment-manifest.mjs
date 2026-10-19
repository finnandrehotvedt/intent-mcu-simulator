// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { COMPONENT_CATALOG } from './component-catalog.mjs';
import { candidateCompilerTarget } from './compile-targets.mjs';
import { exactKeys } from './strict-json.mjs';
import { MODEL_WORKER_RUNTIME_IDENTITY_SCHEMA, WORKER_RUNTIME_IDENTITY_SCHEMA } from './runtime-identity.mjs';
import { normalizeModelLibraryLock, resolveModelLibrary } from './model-library.mjs';
import { TEMPERATURE_ANALOGUE_SENSOR_DEFINITION } from '../expansion-drafts/temperature-analogue-sensor-v1.mjs';

export const EXPERIMENT_MANIFEST_SCHEMA = 'intent-mcu-experiment-manifest@2';
export const LEGACY_EXPERIMENT_MANIFEST_SCHEMA = 'intent-mcu-experiment-manifest@1';
export const AVR_TOOLCHAIN_MANIFEST_SHA256 = '098e57cc2da7f46f0abea657a33473ef7c2a3c2f556152640fb4862ad4de53d2';
export const AVR_EXPERIMENT_TOOL_VERSIONS = Object.freeze([
  Object.freeze({ id: 'arduino-cli', version: '1.5.1', role: 'compiler-driver',
    sourceSha256: '28a8e119c498a25607821c36cb2dc49e8463941b261a0d99091baa7bc692dd2b' }),
  Object.freeze({ id: 'arduino-avr-core', version: '1.8.8', role: 'framework',
    sourceSha256: 'a234c2a43dcd01ce54be665806f183b8e6ec4e966d2e3e0c3358b63023d6390c' }),
  Object.freeze({ id: 'avr-gcc', version: '7.3.0-atmel3.6.1-arduino7', role: 'compiler',
    sourceSha256: 'bd8c37f6952a2130ac9ee32c53f6a660feb79bee8353c8e289eb60fdcefed91e' }),
]);
export const AVR_EXPERIMENT_RUNTIME = Object.freeze({
  id: 'avr8js', version: '0.21.1', role: 'runtime',
  identitySchema: MODEL_WORKER_RUNTIME_IDENTITY_SCHEMA,
});
const LEGACY_AVR_EXPERIMENT_RUNTIME = Object.freeze({
  id: 'avr8js', version: '0.21.1', role: 'runtime',
  identitySchema: WORKER_RUNTIME_IDENTITY_SCHEMA,
});

const HASH = /^[a-f0-9]{64}$/u;
const IMAGE = /^sha256:[a-f0-9]{64}$/u;
const MODEL_KEYS = ['componentType', 'componentVersion', 'modelId', 'modelVersion'];
const TOOL_KEYS = ['id', 'version', 'role', 'sourceSha256'];
const MANIFEST_KEYS = ['schema', 'sourceSha256', 'circuitSha256', 'scenarioSha256',
  'testSha256', 'artifactSha256', 'models', 'modelsSha256', 'tools', 'toolsSha256',
  'modelLibrary', 'modelExecutionContextSha256', 'manifestSha256'];
const LEGACY_MANIFEST_KEYS = ['schema', 'sourceSha256', 'circuitSha256', 'scenarioSha256',
  'testSha256', 'artifactSha256', 'models', 'modelsSha256', 'tools', 'toolsSha256',
  'manifestSha256'];
const clone = (value) => structuredClone(value);
const reject = (code, details = []) => { throw Object.assign(new Error(code), { code, details }); };

function hash(value, path) {
  if (typeof value !== 'string' || !HASH.test(value)) reject('EXPERIMENT_MANIFEST_HASH', [path]);
  return value;
}

function projectMembers(prepared) {
  const envelope = prepared?.project;
  const payload = envelope?.project ?? envelope;
  const authored = payload?.project ?? payload;
  const source = authored?.source;
  const circuit = payload?.candidateCircuit ?? authored?.circuit;
  if (!source || !Array.isArray(source.files) || !circuit) reject('EXPERIMENT_MANIFEST_PROJECT');
  const names = new Set();
  const files = source.files.map((file, index) => {
    if (!exactKeys(file, ['name', 'content']) || typeof file.name !== 'string'
        || typeof file.content !== 'string' || names.has(file.name)) {
      reject('EXPERIMENT_MANIFEST_SOURCE', [`$source.files[${index}]`]);
    }
    names.add(file.name);
    return { name: file.name, content: file.content };
  }).sort((left, right) => left.name.localeCompare(right.name, 'en'));
  return { source: { schema: 'intent-mcu-authored-source-set@1', files }, circuit: clone(circuit) };
}

function legacyModelOwnersFor(circuit) {
  if (!Array.isArray(circuit.components)) reject('EXPERIMENT_MANIFEST_CIRCUIT');
  const owners = { ...COMPONENT_CATALOG,
    [TEMPERATURE_ANALOGUE_SENSOR_DEFINITION.type]: TEMPERATURE_ANALOGUE_SENSOR_DEFINITION };
  const types = [...new Set(circuit.components.map((component) => component?.type))].sort();
  return types.map((type) => {
    const owner = owners[type];
    if (!owner || owner.type !== type || !Number.isSafeInteger(owner.version)
        || owner.version < 1 || typeof owner.modelRef !== 'string'
        || !/^model\.[a-z0-9.-]+-v[1-9][0-9]*$/u.test(owner.modelRef)) {
      reject('EXPERIMENT_MANIFEST_MODEL_OWNER', [type ?? null]);
    }
    return { componentType: type, componentVersion: owner.version,
      modelId: owner.modelRef, modelVersion: owner.version };
  });
}

function modelOwnersFor(circuit, lock) {
  if (!Array.isArray(circuit.components)) reject('EXPERIMENT_MANIFEST_CIRCUIT');
  const resolved = resolveModelLibrary(lock);
  if (!resolved.ok) reject(resolved.code, resolved.details);
  const byType = new Map(resolved.manifest.entries
    .filter((entry) => entry.profile === 'board.atmega328p-16mhz-v1')
    .map((entry) => [entry.componentType, entry]));
  return [...new Set(circuit.components.map((component) => component?.type))].sort().map((type) => {
    const owner = byType.get(type);
    if (!owner) reject('EXPERIMENT_MANIFEST_MODEL_OWNER', [type ?? null]);
    return { componentType: type, componentVersion: owner.componentVersion,
      modelId: owner.modelId, modelVersion: owner.modelVersion };
  });
}

function validateProducer(producer, artifactIdentitySha256) {
  if (!exactKeys(producer, ['artifactIdentitySha256', 'inputIdentitySha256',
    'toolchainImageId', 'toolchainIdentitySha256', 'projectGeneration',
    'buildGeneration', 'runtimeGeneration', 'runtimeIdentity',
    'modelImplementationSha256', 'modelExecutionContextSha256'])
      || producer.artifactIdentitySha256 !== artifactIdentitySha256
      || !HASH.test(producer.inputIdentitySha256 ?? '')
      || !IMAGE.test(producer.toolchainImageId ?? '')
      || producer.toolchainIdentitySha256 !== AVR_TOOLCHAIN_MANIFEST_SHA256
      || candidateCompilerTarget('board.atmega328p-16mhz-v1').toolchainIdentitySha256
        !== producer.toolchainIdentitySha256
      || !Number.isSafeInteger(producer.projectGeneration) || producer.projectGeneration < 1
      || !Number.isSafeInteger(producer.buildGeneration) || producer.buildGeneration < 1
      || !Number.isSafeInteger(producer.runtimeGeneration) || producer.runtimeGeneration < 1) {
    reject('EXPERIMENT_MANIFEST_PRODUCER');
  }
  const identity = producer.runtimeIdentity;
  if (!HASH.test(producer.modelImplementationSha256 ?? '')
      || !HASH.test(producer.modelExecutionContextSha256 ?? '')
      || !exactKeys(identity, ['schema', 'projectGeneration', 'runtimeGeneration',
        'artifactIdentity', 'modelImplementationSha256', 'modelExecutionContextSha256',
        'workerInitialization', 'workerInstanceNonce'])
      || identity.schema !== MODEL_WORKER_RUNTIME_IDENTITY_SCHEMA
      || identity.projectGeneration !== producer.projectGeneration
      || identity.runtimeGeneration !== producer.runtimeGeneration
      || identity.artifactIdentity !== artifactIdentitySha256
      || identity.modelImplementationSha256 !== producer.modelImplementationSha256
      || identity.modelExecutionContextSha256 !== producer.modelExecutionContextSha256
      || !Number.isSafeInteger(identity.workerInitialization) || identity.workerInitialization < 1
      || !/^[a-f0-9]{32}$/u.test(identity.workerInstanceNonce ?? '')) {
    reject('EXPERIMENT_MANIFEST_RUNTIME_IDENTITY');
  }
  return clone(producer);
}

function toolsFromProducer(producer) {
  return {
    compiler: {
      profile: 'board.atmega328p-16mhz-v1',
      imageId: producer.toolchainImageId,
      manifestSha256: producer.toolchainIdentitySha256,
      versions: AVR_EXPERIMENT_TOOL_VERSIONS.map(clone),
    },
    runtime: clone(AVR_EXPERIMENT_RUNTIME),
  };
}

function normalizeModels(value) {
  if (!Array.isArray(value) || !value.length) reject('EXPERIMENT_MANIFEST_MODELS');
  const sorted = [...value].sort((a, b) => a.componentType.localeCompare(b.componentType, 'en'));
  if (JSON.stringify(sorted) !== JSON.stringify(value)) reject('EXPERIMENT_MANIFEST_MODEL_ORDER');
  const seen = new Set();
  return value.map((item, index) => {
    if (!exactKeys(item, MODEL_KEYS) || typeof item.componentType !== 'string'
        || !Number.isSafeInteger(item.componentVersion) || item.componentVersion < 1
        || typeof item.modelId !== 'string' || !Number.isSafeInteger(item.modelVersion)
        || item.modelVersion < 1 || seen.has(item.componentType)) {
      reject('EXPERIMENT_MANIFEST_MODELS', [`$manifest.models[${index}]`]);
    }
    seen.add(item.componentType);
    return clone(item);
  });
}

function normalizeTools(value, legacy = false) {
  const runtime = legacy ? LEGACY_AVR_EXPERIMENT_RUNTIME : AVR_EXPERIMENT_RUNTIME;
  if (!exactKeys(value, ['compiler', 'runtime'])
      || !exactKeys(value.compiler, ['profile', 'imageId', 'manifestSha256', 'versions'])
      || value.compiler.profile !== 'board.atmega328p-16mhz-v1'
      || !IMAGE.test(value.compiler.imageId ?? '')
      || value.compiler.manifestSha256 !== AVR_TOOLCHAIN_MANIFEST_SHA256
      || !Array.isArray(value.compiler.versions)
      || JSON.stringify(value.compiler.versions) !== JSON.stringify(AVR_EXPERIMENT_TOOL_VERSIONS)
      || value.compiler.versions.some((tool) => !exactKeys(tool, TOOL_KEYS) || !HASH.test(tool.sourceSha256 ?? ''))
      || !exactKeys(value.runtime, ['id', 'version', 'role', 'identitySchema'])
      || JSON.stringify(value.runtime) !== JSON.stringify(runtime)) {
    reject('EXPERIMENT_MANIFEST_TOOLS');
  }
  return clone(value);
}

export async function createExperimentManifest({ prepared, expectation, artifactIdentitySha256,
  producer, sha256 }) {
  hash(artifactIdentitySha256, '$artifactIdentitySha256');
  const acceptedProducer = validateProducer(producer, artifactIdentitySha256);
  const members = projectMembers(prepared);
  const modelLibrary = normalizeModelLibraryLock(prepared.modelLibrary);
  if (!modelLibrary.ok) reject(modelLibrary.code, modelLibrary.details);
  if (modelLibrary.lock.implementationSha256 !== acceptedProducer.modelImplementationSha256) {
    reject('EXPERIMENT_MANIFEST_MODEL_IMPLEMENTATION');
  }
  const models = modelOwnersFor(members.circuit, modelLibrary.lock);
  const tools = toolsFromProducer(acceptedProducer);
  const manifest = {
    schema: EXPERIMENT_MANIFEST_SCHEMA,
    sourceSha256: await sha256(members.source),
    circuitSha256: await sha256(members.circuit),
    scenarioSha256: await sha256(prepared.scenarioTimeline),
    testSha256: await sha256(expectation.reference),
    artifactSha256: artifactIdentitySha256,
    models,
    modelsSha256: await sha256(models),
    tools,
    toolsSha256: await sha256(tools),
    modelLibrary: modelLibrary.lock,
    modelExecutionContextSha256: acceptedProducer.modelExecutionContextSha256,
    manifestSha256: '',
  };
  manifest.manifestSha256 = await sha256(Object.fromEntries(
    Object.entries(manifest).filter(([key]) => key !== 'manifestSha256'),
  ));
  return { manifest, members };
}

export async function normalizeExperimentManifest(value, { prepared, expectation,
  artifactIdentitySha256, sha256 }) {
  if (!exactKeys(value, MANIFEST_KEYS) || value.schema !== EXPERIMENT_MANIFEST_SCHEMA) {
    reject('EXPERIMENT_MANIFEST_SHAPE');
  }
  const members = projectMembers(prepared);
  const models = normalizeModels(value.models);
  const modelLibrary = normalizeModelLibraryLock(value.modelLibrary);
  if (!modelLibrary.ok || JSON.stringify(modelLibrary.lock) !== JSON.stringify(prepared.modelLibrary)) {
    reject('EXPERIMENT_MANIFEST_MODEL_LIBRARY');
  }
  const expectedModels = modelOwnersFor(members.circuit, modelLibrary.lock);
  if (JSON.stringify(models) !== JSON.stringify(expectedModels)) reject('EXPERIMENT_MANIFEST_MODEL_OWNER');
  const tools = normalizeTools(value.tools);
  const expected = {
    sourceSha256: await sha256(members.source),
    circuitSha256: await sha256(members.circuit),
    scenarioSha256: await sha256(prepared.scenarioTimeline),
    testSha256: await sha256(expectation.reference),
    artifactSha256: artifactIdentitySha256,
    modelsSha256: await sha256(models),
    toolsSha256: await sha256(tools),
    modelExecutionContextSha256: value.modelExecutionContextSha256,
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    hash(value[key], `$manifest.${key}`);
    if (value[key] !== expectedValue) reject('EXPERIMENT_MANIFEST_BINDING', [key]);
  }
  const normalized = { schema: EXPERIMENT_MANIFEST_SCHEMA,
    sourceSha256: value.sourceSha256, circuitSha256: value.circuitSha256,
    scenarioSha256: value.scenarioSha256, testSha256: value.testSha256,
    artifactSha256: value.artifactSha256, models, modelsSha256: value.modelsSha256,
    tools, toolsSha256: value.toolsSha256, modelLibrary: modelLibrary.lock,
    modelExecutionContextSha256: value.modelExecutionContextSha256,
    manifestSha256: value.manifestSha256 };
  hash(normalized.manifestSha256, '$manifest.manifestSha256');
  const aggregate = await sha256(Object.fromEntries(
    Object.entries(normalized).filter(([key]) => key !== 'manifestSha256'),
  ));
  if (normalized.manifestSha256 !== aggregate) reject('EXPERIMENT_MANIFEST_AGGREGATE');
  return normalized;
}

export async function normalizeLegacyExperimentManifest(value, { prepared, expectation,
  artifactIdentitySha256, sha256 }) {
  if (!exactKeys(value, LEGACY_MANIFEST_KEYS) || value.schema !== LEGACY_EXPERIMENT_MANIFEST_SCHEMA) {
    reject('EXPERIMENT_MANIFEST_SHAPE');
  }
  const members = projectMembers(prepared);
  const models = normalizeModels(value.models);
  if (JSON.stringify(models) !== JSON.stringify(legacyModelOwnersFor(members.circuit))) {
    reject('EXPERIMENT_MANIFEST_MODEL_OWNER');
  }
  const tools = normalizeTools(value.tools, true);
  const expected = {
    sourceSha256: await sha256(members.source),
    circuitSha256: await sha256(members.circuit),
    scenarioSha256: await sha256(prepared.scenarioTimeline),
    testSha256: await sha256(expectation.reference),
    artifactSha256: artifactIdentitySha256,
    modelsSha256: await sha256(models),
    toolsSha256: await sha256(tools),
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    hash(value[key], `$manifest.${key}`);
    if (value[key] !== expectedValue) reject('EXPERIMENT_MANIFEST_BINDING', [key]);
  }
  const normalized = { schema: LEGACY_EXPERIMENT_MANIFEST_SCHEMA,
    sourceSha256: value.sourceSha256, circuitSha256: value.circuitSha256,
    scenarioSha256: value.scenarioSha256, testSha256: value.testSha256,
    artifactSha256: value.artifactSha256, models, modelsSha256: value.modelsSha256,
    tools, toolsSha256: value.toolsSha256, manifestSha256: value.manifestSha256 };
  hash(normalized.manifestSha256, '$manifest.manifestSha256');
  const aggregate = await sha256(Object.fromEntries(
    Object.entries(normalized).filter(([key]) => key !== 'manifestSha256'),
  ));
  if (normalized.manifestSha256 !== aggregate) reject('EXPERIMENT_MANIFEST_AGGREGATE');
  return normalized;
}
