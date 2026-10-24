// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys, parseStrictJson } from './strict-json.mjs';

export const X37_WORKBENCH_SCHEMA = 'intent-mcu-x37-workbench-project@2';
export const X37_LEGACY_WORKBENCH_SCHEMA = 'intent-mcu-x37-workbench-project@1';
export const X37_COORDINATED_LIFECYCLE_SCHEMA = 'intent-mcu-x37-coordinated-lifecycle@1';
export const X37_PUBLIC_CAPABILITY = Object.freeze({
  enabled: false,
  code: 'X37_PUBLIC_RP_TURNAROUND_GRAMMAR_UNAVAILABLE',
  message: 'Candidate only · the current public RP2040 compiler grammar does not accept the reviewed turnaround source.',
});

const clone = (value) => structuredClone(value);
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const forbidden = new Set(['artifact', 'artifactBytes', 'artifactSha256', 'build', 'capability',
  'elf', 'executable', 'firmware', 'flash', 'imageId', 'result', 'runtime', 'session',
  'trace', 'verdict', 'worker']);

function rejectAuthority(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) fail('X37_PROJECT_EXECUTABLE_AUTHORITY_FORBIDDEN');
    rejectAuthority(child);
  }
}

function participant(value, expected) {
  if (!exactKeys(value, ['id', 'profile', 'sourceFile', 'source']) || value.id !== expected.id
      || value.profile !== expected.profile || value.sourceFile !== expected.sourceFile
      || typeof value.source !== 'string' || value.source.length < 1
      || new TextEncoder().encode(value.source).length > 32_768) fail('X37_PROJECT_PARTICIPANT_INVALID');
  return clone(value);
}

function normalized(value) {
  rejectAuthority(value);
  if (!exactKeys(value, ['schema', 'name', 'participants', 'sharedDigitalNets'])
      || value.schema !== X37_WORKBENCH_SCHEMA || typeof value.name !== 'string'
      || value.name !== value.name.trim() || value.name.length < 1 || value.name.length > 80
      || !Array.isArray(value.participants) || value.participants.length !== 2
      || !Array.isArray(value.sharedDigitalNets) || value.sharedDigitalNets.length !== 1) {
    fail('X37_PROJECT_SHAPE_INVALID');
  }
  const participants = [
    participant(value.participants[0], { id: 'avr', profile: 'avr', sourceFile: 'main.ino' }),
    participant(value.participants[1], { id: 'rp', profile: 'rp2040', sourceFile: 'main.c' }),
  ];
  const net = value.sharedDigitalNets[0];
  if (!exactKeys(net, ['id', 'kind', 'bias', 'endpoints']) || net.id !== 'shared.digital.0'
      || net.kind !== 'ideal-boolean-open-drain' || net.bias !== 'pull-up'
      || !Array.isArray(net.endpoints) || net.endpoints.length !== 2
      || !exactKeys(net.endpoints[0], ['participantId', 'pin'])
      || net.endpoints[0].participantId !== 'avr' || net.endpoints[0].pin !== 'D2/D13'
      || !exactKeys(net.endpoints[1], ['participantId', 'pin'])
      || net.endpoints[1].participantId !== 'rp' || net.endpoints[1].pin !== 'GPIO1/GPIO0') {
    fail('X37_PROJECT_SHARED_NET_INVALID');
  }
  return { schema: X37_WORKBENCH_SCHEMA, name: value.name, participants,
    sharedDigitalNets: [clone(net)] };
}

export function defaultX37WorkbenchProject() {
  return normalized({ schema: X37_WORKBENCH_SCHEMA, name: 'Two-controller turnaround',
    participants: [
      { id: 'avr', profile: 'avr', sourceFile: 'main.ino', source: '// Candidate AVR turnaround source\n' },
      { id: 'rp', profile: 'rp2040', sourceFile: 'main.c', source: '/* Candidate RP2040 turnaround source */\n' },
    ],
    sharedDigitalNets: [{ id: 'shared.digital.0', kind: 'ideal-boolean-open-drain', bias: 'pull-up',
      endpoints: [{ participantId: 'avr', pin: 'D2/D13' }, { participantId: 'rp', pin: 'GPIO1/GPIO0' }] }],
  });
}

export function parseX37WorkbenchProject(source) {
  const value = parseStrictJson(source, 128 * 1024);
  if (value?.schema === X37_LEGACY_WORKBENCH_SCHEMA) {
    if (!exactKeys(value, ['schema', 'name', 'avrSource', 'rpSource', 'sharedWire'])) {
      fail('X37_LEGACY_PROJECT_INVALID');
    }
    value.schema = X37_WORKBENCH_SCHEMA;
    value.participants = [
      { id: 'avr', profile: 'avr', sourceFile: 'main.ino', source: value.avrSource },
      { id: 'rp', profile: 'rp2040', sourceFile: 'main.c', source: value.rpSource },
    ];
    value.sharedDigitalNets = [value.sharedWire];
    delete value.avrSource; delete value.rpSource; delete value.sharedWire;
  }
  return normalized(value);
}

export function serializeX37WorkbenchProject(value) {
  return `${JSON.stringify(normalized(value), null, 2)}\n`;
}

export function createX37CandidateBudget({ builds = 2, runs = 1 } = {}) {
  if (builds !== 2 || runs !== 1) fail('X37_BUDGET_CONFIGURATION_INVALID');
  let chargedBuilds = 0; let chargedRuns = 0; let reservation = null;
  return Object.freeze({
    preflight(capability = X37_PUBLIC_CAPABILITY) {
      if (!capability?.enabled) return { ok: false, code: capability?.code ?? 'X37_CAPABILITY_UNAVAILABLE', charged: false };
      if (reservation || chargedBuilds + 2 > builds || chargedRuns + 1 > runs) return { ok: false, code: 'X37_BUDGET_EXHAUSTED', charged: false };
      reservation = Object.freeze({ builds: 2, runs: 1 }); return { ok: true, reservation };
    },
    commit() { if (!reservation) fail('X37_BUDGET_RESERVATION_REQUIRED'); chargedBuilds += 2; chargedRuns += 1; reservation = null; },
    cancel() { reservation = null; },
    snapshot: () => ({ limits: { builds, runs }, charged: { builds: chargedBuilds, runs: chargedRuns }, reserved: clone(reservation) }),
  });
}

export function createX37CoordinatedLifecycle(projectGeneration = 1) {
  if (!Number.isSafeInteger(projectGeneration) || projectGeneration < 1) fail('X37_LIFECYCLE_GENERATION_INVALID');
  let state = { schema: X37_COORDINATED_LIFECYCLE_SCHEMA, projectGeneration,
    runtimeGeneration: 0, phase: 'authored', builds: {}, workers: {}, trace: [] };
  const snapshot = () => clone(state);
  const retire = (phase = 'authored') => { state.runtimeGeneration += 1; state.phase = phase;
    state.builds = {}; state.workers = {}; state.trace = []; };
  return Object.freeze({ snapshot,
    projectChanged() { state.projectGeneration += 1; retire(); return snapshot(); },
    acceptBuild(participantId, build) {
      if (!['avr', 'rp'].includes(participantId) || !build || build.projectGeneration !== state.projectGeneration
          || typeof build.artifactIdentity !== 'string' || !build.artifactIdentity) fail('X37_BUILD_STALE_OR_INVALID');
      state.builds[participantId] = clone(build); state.phase = Object.keys(state.builds).length === 2 ? 'build-ready' : 'build-partial';
      return snapshot();
    },
    start(workers) {
      if (state.phase !== 'build-ready' || !exactKeys(workers, ['avr', 'rp'])) fail('X37_RUN_NOT_READY');
      state.runtimeGeneration += 1; state.phase = 'running'; state.workers = clone(workers); state.trace = []; return snapshot();
    },
    pause() { if (state.phase !== 'running') fail('X37_RUNTIME_NOT_RUNNING'); state.phase = 'paused'; return snapshot(); },
    appendTrace(rows) { if (!['running', 'paused'].includes(state.phase) || !Array.isArray(rows)) fail('X37_TRACE_NOT_CURRENT');
      state.trace.push(...clone(rows)); return snapshot(); },
    stop() { retire('stopped'); return snapshot(); },
    reset() { retire('reset'); return snapshot(); },
    participantFailed() { retire('failed'); return snapshot(); },
    opened() { state.projectGeneration += 1; retire('authored'); return snapshot(); },
  });
}
