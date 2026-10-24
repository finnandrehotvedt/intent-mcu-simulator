// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { X37PrivateRuntimeAdapter } from '../src/x37-private-runtime-adapter.mjs';
import { X37_SHARED_SCHEDULER_SCHEMA } from '../src/x37-shared-scheduler-contract.mjs';

class SyntheticParticipantDouble {
  constructor(participantId, projectGeneration, runtimeGeneration) {
    this.owner = { participantId, projectGeneration, runtimeGeneration };
    this.cycle = 0; this.advances = [];
  }
  identity() { return structuredClone(this.owner); }
  currentCycle() { return this.cycle; }
  advanceToLocalCycle(cycle, event) { this.cycle = cycle; this.advances.push(event.eventId); }
  retire() {}
  reset() { this.cycle = 0; this.advances = []; }
}

const contract = { schema: X37_SHARED_SCHEDULER_SCHEMA, schedulerId: 'x37-private-harness',
  startSchedulerTick: 0, participants: [
    { participantId: 'left-2x', projectGeneration: 21, runtimeGeneration: 31,
      localCyclesPerSchedulerTick: { numerator: 2, denominator: 1 } },
    { participantId: 'right-3x', projectGeneration: 22, runtimeGeneration: 32,
      localCyclesPerSchedulerTick: { numerator: 3, denominator: 1 } },
  ], sharedNet: { netId: 'shared-d0', driverParticipantIds: ['left-2x', 'right-3x'],
    readerParticipantIds: ['left-2x', 'right-3x'] }, limits: { eventLimit: 32, traceLimit: 32 } };
const seam = (id, project, runtime) => new SyntheticParticipantDouble(id, project, runtime);
const left = seam('left-2x', 21, 31); const right = seam('right-3x', 22, 32);
const adapter = new X37PrivateRuntimeAdapter({ contract, participants: [right, left], enabled: true });
const event = (eventId, participantId, projectGeneration, runtimeGeneration, localCycle, sequence,
  mode, level = null) => ({ eventId, participantId, projectGeneration, runtimeGeneration,
  localCycle, sequence, action: { netId: 'shared-d0', mode, level } });
const result = adapter.execute([
  event('left.low', 'left-2x', 21, 31, 2, 1, 'DRIVE', 'LOW'),
  event('right.high', 'right-3x', 22, 32, 3, 1, 'DRIVE', 'HIGH'),
  event('left.high', 'left-2x', 21, 31, 4, 2, 'DRIVE', 'HIGH'),
  event('left.release', 'left-2x', 21, 31, 6, 3, 'RELEASE'),
  event('right.release', 'right-3x', 22, 32, 12, 2, 'RELEASE'),
]);
assert.deepEqual(result.trace.map(({ wireState }) => wireState),
  ['LOW', 'CONFLICT', 'HIGH', 'HIGH', 'HIGH_Z']);
assert.deepEqual(left.advances, ['left.low', 'left.high', 'left.release']);
assert.deepEqual(right.advances, ['right.high', 'right.release']);
process.stdout.write(`${JSON.stringify({ result: 'pass', mode: 'synthetic-participant-test-doubles',
  actualMcuExecution: false,
  defaultPublicAuthority: false, firmwareBuilds: 0, nativeWorkers: 0, runs: 0,
  images: 0, deploys: 0, events: result.events.length,
  wireStates: result.trace.map(({ wireState }) => wireState) })}\n`);
