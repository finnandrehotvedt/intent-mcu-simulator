// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { validateWorkerRuntimeIdentity } from './runtime-identity.mjs';
import { exactKeys } from './strict-json.mjs';

export const X35_RUNTIME_PROBE_SCHEMA = 'intent-mcu-x35-runtime-probe@1';
export const X35_REPORT_SCHEMA = 'intent-mcu-x35-causal-chain-report@1';
export const X35_SUITE_ID = 'x35-avr-d13-causal-chain-v1';
const HASH = /^[a-f0-9]{64}$/u;
const EVENT_ID = /^x35-event-[0-9]+-[0-9]+$/u;
const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };

export const X35_CAUSAL_SUITE = Object.freeze({
  suiteId: X35_SUITE_ID,
  profile: 'board.atmega328p-16mhz-v1',
  scenarioId: 'THERM-SCENARIO-BELOW-ENABLED',
  sourceSha256: 'abc65e1212c72aaed7325c059cb785a8872b45fddc7ba67ceb0cb098d2c0da76',
  graphSha256: '775944599c6588b71fe83cf46e75fb7611c6655e7b43928609bb585ccb415100',
  selected: Object.freeze({ register: 'PORTB', registerAddress: 37, bit: 5,
    pin: 'D13', edge: 'LOW_TO_HIGH' }),
  path: Object.freeze(['board-1.D13', 'net-thermostat-heater-drive', 'heater-resistor-1',
    'net-thermostat-heater-led', 'heater-led-1.ANODE', 'heater-led-1.CATHODE',
    'net-thermostat-ground', 'board-1.GND1']),
  limits: Object.freeze({
    unmodifiedThermostatArtifactOnly: true,
    selectedEvents: 1,
    arbitraryRegisterAccess: false,
    debugger: false,
    sourceLineMapping: false,
    physicalCausality: false,
    otherProfiles: false,
  }),
});

export function stableX35Stringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableX35Stringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stableX35Stringify(value[key])}`,
  ).join(',')}}`;
  return JSON.stringify(value);
}

export async function x35Sha256(value) {
  const input = typeof value === 'string' ? value : stableX35Stringify(value);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export async function x35SuiteIdentity() { return x35Sha256(X35_CAUSAL_SUITE); }

export function validateX35Probe(value) {
  if (!exactKeys(value, ['schema', 'suiteId', 'scenarioId', 'sourceSha256',
    'artifactIdentity', 'graphSha256', 'selected', 'path'])
      || value.schema !== X35_RUNTIME_PROBE_SCHEMA || value.suiteId !== X35_SUITE_ID
      || value.scenarioId !== X35_CAUSAL_SUITE.scenarioId
      || value.sourceSha256 !== X35_CAUSAL_SUITE.sourceSha256
      || value.graphSha256 !== X35_CAUSAL_SUITE.graphSha256
      || !HASH.test(value.artifactIdentity ?? '')
      || stableX35Stringify(value.selected) !== stableX35Stringify(X35_CAUSAL_SUITE.selected)
      || stableX35Stringify(value.path) !== stableX35Stringify(X35_CAUSAL_SUITE.path)) {
    reject('X35_RUNTIME_PROBE_INVALID');
  }
  return clone(value);
}

function endpointSet(graph, id) {
  return graph.nets.find((net) => net.id === id)?.endpoints
    .map((endpoint) => `${endpoint.component}.${endpoint.pin}`).sort() ?? [];
}

export function x35TopologyProjection(graph, circuitObservation, probe) {
  const accepted = validateX35Probe(probe);
  const components = new Map(graph?.components?.map((component) => [component.id, component]) ?? []);
  const exact = components.get('heater-resistor-1')?.type === 'resistor.fixed-v1'
    && components.get('heater-resistor-1')?.properties?.ohms === 220
    && components.get('heater-led-1')?.type === 'led.basic-v1'
    && stableX35Stringify(endpointSet(graph, 'net-thermostat-heater-drive'))
      === stableX35Stringify(['board-1.D13', 'heater-resistor-1.A'])
    && stableX35Stringify(endpointSet(graph, 'net-thermostat-heater-led'))
      === stableX35Stringify(['heater-led-1.ANODE', 'heater-resistor-1.B'])
    && endpointSet(graph, 'net-thermostat-ground').includes('heater-led-1.CATHODE')
    && endpointSet(graph, 'net-thermostat-ground').includes('board-1.GND1');
  const led = circuitObservation?.leds?.find((item) => item.componentId === 'heater-led-1') ?? null;
  if (!exact || !led || led.on !== true) reject('X35_SYNCHRONOUS_PROJECTION_INVALID');
  return {
    graphSha256: accepted.graphSha256,
    path: [...accepted.path],
    component: {
      componentId: 'heater-led-1', model: 'project-owned ideal current-limited LED observation',
      on: true, capturedAtInstructionBoundary: true,
    },
  };
}

function chainShape(chain) {
  if (!exactKeys(chain, ['eventId', 'instruction', 'register', 'callback', 'pin', 'topology',
    'componentProjection', 'tickDistinction', 'retentionDrops']) || !EVENT_ID.test(chain.eventId ?? '')) {
    reject('X35_CHAIN_INVALID');
  }
  const references = [chain.instruction, chain.register, chain.callback, chain.pin,
    chain.topology, chain.componentProjection];
  if (references.some((stage) => !stage || stage.eventId !== chain.eventId)
      || references.slice(1).some((stage) => stage.causedBy !== chain.eventId)) {
    reject('X35_EVENT_IDENTITY_BROKEN');
  }
  const shapes = [
    [chain.instruction, ['eventId', 'pcBefore', 'pcAfter', 'opcode', 'cycleBefore', 'cycleAfter']],
    [chain.register, ['eventId', 'causedBy', 'name', 'address', 'selectedBit',
      'fullValueBefore', 'fullValueAfterInstruction', 'fullValueAfterTick', 'otherBitsChangedMask']],
    [chain.callback, ['eventId', 'causedBy', 'rawCycle', 'instructionCycleBounds', 'pin', 'level']],
    [chain.pin, ['eventId', 'causedBy', 'pin', 'mode', 'level']],
    [chain.topology, ['eventId', 'causedBy', 'graphSha256', 'path']],
    [chain.componentProjection, ['eventId', 'causedBy', 'componentId', 'model', 'on',
      'capturedAtInstructionBoundary']],
    [chain.tickDistinction, ['instructionChangedBit5', 'tickChangedBit5',
      'd13DuringInstruction', 'd13DuringTick']],
    [chain.retentionDrops, ['logic', 'serial', 'adc', 'unsupported']],
  ];
  if (shapes.some(([value, keys]) => !exactKeys(value, keys))) reject('X35_CHAIN_STAGE_INVALID');
  return chain;
}

export function evaluateX35Repeat(input) {
  const chain = chainShape(input.chain);
  const { instruction, register, callback, pin, topology, componentProjection, tickDistinction } = chain;
  const checks = {
    exactInstruction: Number.isSafeInteger(instruction.pcBefore) && Number.isSafeInteger(instruction.pcAfter)
      && Number.isInteger(instruction.opcode) && Number.isSafeInteger(instruction.cycleBefore)
      && Number.isSafeInteger(instruction.cycleAfter) && instruction.cycleAfter > instruction.cycleBefore,
    opcodePortProducer: register.name === 'PORTB' && register.address === 37
      && register.selectedBit === 5 && !(register.fullValueBefore & 32)
      && Boolean(register.fullValueAfterInstruction & 32)
      && register.fullValueAfterTick === register.fullValueAfterInstruction,
    instructionNotTick: tickDistinction.instructionChangedBit5 === true
      && tickDistinction.tickChangedBit5 === false
      && tickDistinction.d13DuringInstruction === 1 && tickDistinction.d13DuringTick === 0,
    rawCallback: callback.pin === 'D13' && callback.level === true
      && callback.rawCycle >= instruction.cycleBefore && callback.rawCycle <= instruction.cycleAfter
      && stableX35Stringify(callback.instructionCycleBounds)
        === stableX35Stringify([instruction.cycleBefore, instruction.cycleAfter]),
    exactPin: pin.pin === 'D13' && pin.mode === 'OUTPUT' && pin.level === true,
    exactTopology: topology.graphSha256 === X35_CAUSAL_SUITE.graphSha256
      && stableX35Stringify(topology.path) === stableX35Stringify(X35_CAUSAL_SUITE.path),
    synchronousComponent: componentProjection.componentId === 'heater-led-1'
      && componentProjection.model === 'project-owned ideal current-limited LED observation'
      && componentProjection.on === true && componentProjection.capturedAtInstructionBoundary === true,
    completeRetention: chain.retentionDrops.logic === 0,
  };
  return { checks, academicStatus: Object.values(checks).every(Boolean) ? 'passed' : 'failed',
    jobStatus: 'completed' };
}

export function x35RepeatProjection(repeat) {
  return { chain: repeat.chain, outcome: repeat.outcome };
}

export function semanticX35Projection(report) {
  return { schema: report.schema, suiteId: report.suiteId, suiteSha256: report.suiteSha256,
    sourceSha256: report.sourceSha256, artifactIdentity: report.artifactIdentity,
    graphSha256: report.graphSha256, repeats: report.repeats.map(x35RepeatProjection),
    repeatSemanticSha256: report.repeatSemanticSha256,
    validationProbes: report.validationProbes, limits: report.limits };
}

export async function validateX35Report(value) {
  if (!exactKeys(value, ['schema', 'suiteId', 'suiteSha256', 'sourceSha256', 'artifactIdentity',
    'graphSha256', 'repeats', 'repeatSemanticSha256', 'validationProbes', 'limits', 'semanticSha256'])
      || value.schema !== X35_REPORT_SCHEMA || value.suiteId !== X35_SUITE_ID
      || value.sourceSha256 !== X35_CAUSAL_SUITE.sourceSha256
      || value.graphSha256 !== X35_CAUSAL_SUITE.graphSha256
      || !HASH.test(value.artifactIdentity ?? '') || !HASH.test(value.suiteSha256 ?? '')
      || !HASH.test(value.repeatSemanticSha256 ?? '') || !HASH.test(value.semanticSha256 ?? '')
      || !Array.isArray(value.repeats) || value.repeats.length !== 2
      || !exactKeys(value.validationProbes, ['staleIdentityRejected', 'tickAmbiguityRejected',
        'finalStateAloneCannotPass', 'genericRegisterApiExposed'])
      || value.validationProbes.staleIdentityRejected !== true
      || value.validationProbes.tickAmbiguityRejected !== true
      || value.validationProbes.finalStateAloneCannotPass !== true
      || value.validationProbes.genericRegisterApiExposed !== false
      || stableX35Stringify(value.limits) !== stableX35Stringify(X35_CAUSAL_SUITE.limits)
      || value.suiteSha256 !== await x35SuiteIdentity()) reject('X35_REPORT_INVALID');
  for (const repeat of value.repeats) {
    if (!exactKeys(repeat, ['repeat', 'runtimeBinding', 'runtimeIdentity', 'chain', 'outcome'])) {
      reject('X35_REPEAT_INVALID');
    }
    validateWorkerRuntimeIdentity(repeat.runtimeIdentity, repeat.runtimeBinding);
    if (repeat.runtimeBinding.artifactIdentity !== value.artifactIdentity
        || stableX35Stringify(evaluateX35Repeat(repeat)) !== stableX35Stringify(repeat.outcome)) {
      reject('X35_JOINED_EVIDENCE_INVALID');
    }
  }
  const [first, second] = value.repeats;
  if (first.runtimeBinding.runtimeGeneration === second.runtimeBinding.runtimeGeneration
      || first.runtimeIdentity.workerInstanceNonce === second.runtimeIdentity.workerInstanceNonce) {
    reject('X35_RUNTIME_GENERATION_NOT_FRESH');
  }
  const firstHash = await x35Sha256(x35RepeatProjection(first));
  const secondHash = await x35Sha256(x35RepeatProjection(second));
  if (firstHash !== secondHash || firstHash !== value.repeatSemanticSha256) {
    reject('X35_REPEAT_SEMANTICS_MISMATCH');
  }
  if (value.semanticSha256 !== await x35Sha256(semanticX35Projection(value))) {
    reject('X35_REPORT_HASH_INVALID');
  }
  return clone(value);
}

export function x35ReportPassed(report) {
  return report?.repeats?.length === 2 && report.repeats.every(
    (repeat) => repeat.outcome.academicStatus === 'passed' && repeat.outcome.jobStatus === 'completed',
  );
}
