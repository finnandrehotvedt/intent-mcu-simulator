import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { portBConfig } from 'avr8js';

import { Atmega328PAdapter } from '../src/atmega328p-adapter.mjs';
import {
  createAvrX37RuntimeSeam, createObservedDigitalNetResolver, createRp2040X37RuntimeSeam,
  mapX37RuntimeObservation,
} from '../src/x37-existing-runtime-seams.mjs';
import { Rp2040ExperimentalRuntime } from '../src/rp2040-experimental-runtime.mjs';

const owner = (participantId) => {
  const value = { participantId, projectGeneration: 1, runtimeGeneration: 1 };
  return { value, get: () => ({ ...value }) };
};
const schedulerContract = {
  schema: 'intent-mcu-x37-shared-scheduler-contract@1', schedulerId: 'x37-ready', startSchedulerTick: 0,
  participants: ['avr', 'rp'].map((participantId) => ({ participantId, projectGeneration: 1,
    runtimeGeneration: 1, localCyclesPerSchedulerTick: { numerator: 1, denominator: 1 } })),
  sharedNet: { netId: 'shared.digital.0', driverParticipantIds: ['avr', 'rp'], readerParticipantIds: ['avr', 'rp'] },
  limits: { eventLimit: 32, traceLimit: 32 },
};
const seamOwner = (participantId) => ({ identityOwner: owner(participantId).get, schedulerContract });

class SyntheticRealisticSchemaRuntime {
  constructor({ profile = 'avr', stepCycles = 3, states = [] } = {}) {
    this.profile = profile; this.stepCycles = stepCycles; this.states = states;
    this.cycle = 0; this.instructions = 0; this.index = 0; this.dropped = 0;
    this.transitions = []; this.queued = []; this.paused = false;
    this.pin = profile === 'avr' ? 'D13' : 'GPIO0';
    this.output = { mode: 'INPUT', level: false };
  }
  snapshot() {
    return {
      cycle: this.cycle, instructions: this.instructions,
      pins: [{ pin: this.pin, mode: this.output.mode, level: this.output.level }],
      instruments: { logic: { channels: [this.pin], transitions: structuredClone(this.transitions), dropped: this.dropped } },
      ...(this.profile === 'rp2040' ? { trace: structuredClone(this.transitions) } : {}),
    };
  }
  step() {
    this.cycle += this.stepCycles; this.instructions += 1;
    if (this.states[this.index]) this.output = { ...this.states[this.index++] };
    return this.snapshot();
  }
  x37Step() {
    this.cycle += this.stepCycles; this.instructions += 1;
    if (this.states[this.index]) this.output = { ...this.states[this.index++] };
    return { cycle: this.cycle, instructions: this.instructions };
  }
  queueDigitalSequence(events) { this.queued.push(...events); return structuredClone(events); }
  queueDigitalInput(pin, level) {
    const envelope = { schema: 'intent-mcu-runtime-command@1', type: 'digital-input', pin, level, targetCycle: this.cycle };
    this.queued.push(envelope); return envelope;
  }
  pause() { this.paused = true; }
  reset() {
    this.cycle = 0; this.instructions = 0; this.index = 0; this.dropped = 0;
    this.transitions = []; this.output = { mode: 'INPUT', level: false };
    return this.snapshot();
  }
  dispose() { this.disposed = true; }
}

const mapped = (participantId, watermark, mappedTick, mode, level, runtimeEpoch = 0) => ({
  origin: 'executed-firmware-observation', participantId, netId: 'shared.digital.0',
  runtimeEpoch, watermark, localCycle: mappedTick, mappedTick, mode,
  ...(mode === 'DRIVE' ? { level } : {}),
});

test('real source snapshot and input envelopes match fixture fields without instantiation', async () => {
  const avr = await readFile(new URL('../src/runtime-kernel.mjs', import.meta.url), 'utf8');
  const avrAdapter = await readFile(new URL('../src/atmega328p-adapter.mjs', import.meta.url), 'utf8');
  const rp = await readFile(new URL('../src/rp2040-experimental-runtime.mjs', import.meta.url), 'utf8');
  const seams = await readFile(new URL('../src/x37-existing-runtime-seams.mjs', import.meta.url), 'utf8');
  const bridge = await readFile(new URL('../expansion-drafts/controller-runtime-bridge-v1.mjs', import.meta.url), 'utf8');
  assert.match(avr, /instruments:[\s\S]*logic:[\s\S]*transitions: logicTransitions,[\s\S]*dropped:/u);
  assert.match(avr, /const machine = this\.adapter\.snapshot\(\)/u);
  assert.match(avrAdapter, /pins: this\.pinSnapshot\(\)/u);
  assert.match(rp, /pins: \[/u);
  assert.match(rp, /instruments:[\s\S]*logic:[\s\S]*transitions:/u);
  assert.match(seams, /createRuntimeCommand\(runtime\.requestId, 'digital-input'/u);
  assert.match(bridge, /exactKeys\(value, \['schema', 'requestId', 'type', 'pin', 'level', 'targetCycle'\]\)/u);
});

test('single driver temporal toggles update latest state instead of creating false conflict', () => {
  const net = createObservedDigitalNetResolver({ netId: 'shared.digital.0', driverParticipantIds: ['avr', 'rp'] });
  const result = net.apply([mapped('avr', 1, 4, 'DRIVE', false), mapped('avr', 2, 8, 'DRIVE', true)]);
  assert.equal(result.state, 'HIGH');
  assert.deepEqual(result.drivers, [{ participantId: 'avr', level: true }]);
});

test('other driver persists across batches, conflicts, then release restores first driver', () => {
  const net = createObservedDigitalNetResolver({ netId: 'shared.digital.0', driverParticipantIds: ['avr', 'rp'] });
  assert.equal(net.apply([mapped('avr', 1, 4, 'DRIVE', false)]).state, 'LOW');
  assert.equal(net.apply([mapped('rp', 1, 8, 'DRIVE', true)]).state, 'CONFLICT');
  const released = net.apply([mapped('rp', 2, 9, 'RELEASE')]);
  assert.equal(released.state, 'LOW'); assert.equal(released.deliverable, true);
});

test('stale driver watermark and globally out-of-order mapped ticks reject', () => {
  const stale = createObservedDigitalNetResolver({ netId: 'shared.digital.0', driverParticipantIds: ['avr'] });
  stale.apply([mapped('avr', 1, 8, 'DRIVE', true)]);
  assert.throws(() => stale.apply([mapped('avr', 1, 9, 'DRIVE', false)]), { code: 'X37_SEAM_OBSERVATION_STALE' });
  const order = createObservedDigitalNetResolver({ netId: 'shared.digital.0', driverParticipantIds: ['avr', 'rp'] });
  order.apply([mapped('avr', 1, 8, 'DRIVE', true)]);
  assert.throws(() => order.apply([mapped('rp', 1, 7, 'DRIVE', true)]), { code: 'X37_SEAM_NET_INPUT_INVALID' });
});

test('valid prefix plus invalid tail is atomic and leaves byte-identical net snapshot', () => {
  const net = createObservedDigitalNetResolver({ netId: 'shared.digital.0', driverParticipantIds: ['avr', 'rp'] });
  const before = JSON.stringify(net.snapshot());
  assert.throws(() => net.apply([
    mapped('avr', 1, 4, 'DRIVE', false),
    { ...mapped('rp', 1, 5, 'DRIVE', true), netId: 'wrong.net' },
  ]), { code: 'X37_SEAM_NET_INPUT_INVALID' });
  assert.equal(JSON.stringify(net.snapshot()), before);
});

test('watermarks are contiguous and epoch changes require explicit participant reset', () => {
  const net = createObservedDigitalNetResolver({ netId: 'shared.digital.0', driverParticipantIds: ['avr'] });
  net.apply([mapped('avr', 1, 1, 'DRIVE', false)]);
  const beforeGap = JSON.stringify(net.snapshot());
  assert.throws(() => net.apply([mapped('avr', 3, 2, 'DRIVE', true)]), { code: 'X37_SEAM_OBSERVATION_STALE' });
  assert.equal(JSON.stringify(net.snapshot()), beforeGap);
  assert.throws(() => net.apply([mapped('avr', 1, 2, 'DRIVE', true, 1)]), { code: 'X37_SEAM_OBSERVATION_STALE' });
  assert.equal(net.resetParticipant('avr', 1).state, 'HIGH_Z');
  assert.equal(net.apply([mapped('avr', 1, 3, 'DRIVE', true, 1)]).state, 'HIGH');
});

test('mapped tick is derived from the reviewed rational contract', () => {
  const contract = structuredClone(schedulerContract);
  contract.participants.find(({ participantId }) => participantId === 'avr').localCyclesPerSchedulerTick =
    { numerator: 2, denominator: 1 };
  const observation = mapped('avr', 1, 4, 'DRIVE', true); delete observation.mappedTick;
  assert.equal(mapX37RuntimeObservation(observation, contract).mappedTick, 2);
  observation.localCycle = 3;
  assert.throws(() => mapX37RuntimeObservation(observation, contract), { code: 'X37_CLOCK_INEXACT' });
});

test('same-length retained-ring rollover fails closed from dropped watermark', () => {
  const runtime = new SyntheticRealisticSchemaRuntime({ states: [{ mode: 'OUTPUT', level: true }] });
  runtime.transitions = [{ pin: 'D13', level: false, cycle: 1 }, { pin: 'D13', level: true, cycle: 2 }];
  const seam = createAvrX37RuntimeSeam({ runtime, ...seamOwner('avr') });
  const originalStep = runtime.x37Step.bind(runtime);
  runtime.x37Step = () => { const value = originalStep(); runtime.dropped = 3; return value; };
  assert.throws(() => seam.advanceToLocalCycle(3), { code: 'X37_SEAM_OBSERVATION_HISTORY_LOST' });
});

test('reset starts new observation epoch without resurrecting retired seam', () => {
  const runtime = new SyntheticRealisticSchemaRuntime({ profile: 'rp2040', states: [{ mode: 'OUTPUT', level: true }] });
  const seam = createRp2040X37RuntimeSeam({ runtime, ...seamOwner('rp') });
  seam.advanceToLocalCycle(3);
  assert.equal(seam.observeFirmwareGpio()[0].runtimeEpoch, 0);
  seam.retire(); assert.equal(seam.reset().runtimeEpoch, 1);
  assert.deepEqual(seam.lifecycle(), { retired: true, disposed: false, epoch: 1, totalInstructions: 1, advanceCalls: 1 });
  assert.throws(() => seam.advanceToLocalCycle(3), { code: 'X37_SEAM_RETIRED' });
});

test('causal delivery rejects hidden future input and queues only at or after mapped tick', () => {
  const runtime = new SyntheticRealisticSchemaRuntime({ profile: 'rp2040' });
  const seam = createRp2040X37RuntimeSeam({ runtime, ...seamOwner('rp') });
  const source = mapped('avr', 1, 8, 'DRIVE', true); delete source.mappedTick;
  assert.throws(() => seam.deliverResolvedLevel(true, source), { code: 'X37_SEAM_CAUSAL_DELIVERY_INVALID' });
  runtime.cycle = 8;
  const delivery = seam.deliverResolvedLevel(true, source);
  assert.equal(delivery.deliveredAtMappedTick, 8);
  assert.equal(delivery.queued.type, 'digital-input');
});

test('advance reports overshoot and enforces total instruction and advance-call caps', () => {
  const runtime = new SyntheticRealisticSchemaRuntime({ profile: 'rp2040', stepCycles: 3 });
  const seam = createRp2040X37RuntimeSeam({ runtime, ...seamOwner('rp'),
    maxTotalInstructions: 2, maxAdvanceCalls: 1 });
  assert.deepEqual(seam.advanceToLocalCycle(5), { requestedBoundaryCycle: 5, reachedCycle: 6,
    steps: 2, exact: false, overshootCycles: 1, totalInstructions: 2, advanceCalls: 1 });
  assert.throws(() => seam.advanceToLocalCycle(6), { code: 'X37_SEAM_ADVANCE_CALL_CAP' });
});

test('a stepping runtime with no cycle progress fails immediately', () => {
  const runtime = new SyntheticRealisticSchemaRuntime({ stepCycles: 0 });
  const seam = createAvrX37RuntimeSeam({ runtime, ...seamOwner('avr') });
  assert.throws(() => seam.advanceToLocalCycle(1), { code: 'X37_SEAM_NO_PROGRESS' });
});

test('low-cost probe avoids rebuilding large full snapshots while preserving transitions', () => {
  const runtime = new SyntheticRealisticSchemaRuntime({ states: [{ mode: 'OUTPUT', level: false }] });
  runtime.transitions = Array.from({ length: 10_000 }, (_, cycle) => ({ pin: 'D13', level: Boolean(cycle % 2), cycle }));
  let fullSnapshots = 0; const original = runtime.snapshot.bind(runtime);
  runtime.x37ProbeSnapshot = () => original(); runtime.snapshot = () => { fullSnapshots += 1; return original(); };
  const seam = createAvrX37RuntimeSeam({ runtime, ...seamOwner('avr') });
  seam.advanceToLocalCycle(3);
  assert.equal(fullSnapshots, 0); assert(seam.observeFirmwareGpio().length >= 1);
});

test('lean stepping observes output-to-input release without calling public step or full snapshot', () => {
  const runtime = new SyntheticRealisticSchemaRuntime({ states: [
    { mode: 'OUTPUT', level: false }, { mode: 'INPUT', level: false },
  ] });
  let publicSteps = 0; let fullSnapshots = 0; const original = runtime.snapshot.bind(runtime);
  runtime.step = () => { publicSteps += 1; return original(); };
  runtime.x37ProbeSnapshot = () => ({ cycle: runtime.cycle, instructions: runtime.instructions,
    pins: [{ pin: 'D13', ...runtime.output }], instruments: { logic: { transitions: [], dropped: 0 } } });
  runtime.snapshot = () => { fullSnapshots += 1; return original(); };
  const seam = createAvrX37RuntimeSeam({ runtime, ...seamOwner('avr') });
  seam.advanceToLocalCycle(6);
  assert.equal(publicSteps, 0); assert.equal(fullSnapshots, 0);
  assert.deepEqual(seam.observeFirmwareGpio().map(({ mode }) => mode), ['RELEASE', 'DRIVE', 'RELEASE']);
});

test('RP lean step avoids public snapshots and preserves bounded-ring drop authority and mode', () => {
  const adapter = {
    cycle: 0, instructions: 0, handleCalls: 0, commits: 0,
    snapshot: () => ({ descriptor: { capabilities: ['gpio'] } }),
    handleX37Step(command) {
      assert.equal(command.type, 'advance'); this.handleCalls += 1;
      this.cycle += 2; this.instructions += 1;
    },
    commitX37AdvanceProgress() { this.commits += 1; return this.machineStatus(); },
    machineStatus() { return { cycle: this.cycle, instructions: this.instructions, blocked: false }; },
    x37ProbeSnapshot() {
      return { cycle: this.cycle, instructions: this.instructions, blocked: false,
        gpio: [{ cycle: this.cycle, pin: 'GPIO0', mode: 'input', level: false }], gpioDropped: 7 };
    },
  };
  const runtime = new Rp2040ExperimentalRuntime(adapter, {
    artifactIdentity: 'a'.repeat(64), firmwareFormat: 'uf2', firmwareOrigin: 'test',
  });
  assert.deepEqual(runtime.x37Step(), { cycle: 2, instructions: 1 });
  runtime.x37CommitAdvanceProgress();
  const probe = runtime.x37ProbeSnapshot();
  assert.equal(adapter.handleCalls, 1); assert.equal(adapter.commits, 1);
  assert.equal(probe.instruments.logic.dropped, 7);
  assert.deepEqual(probe.pins[0], { pin: 'GPIO0', mode: 'INPUT', level: false });
  assert.equal(probe.instruments.logic.transitions[0].mode, 'input');
});

test('large lean-step interval has linear bounded probes and zero public snapshot projections', () => {
  const steps = 20_000; const runtime = new SyntheticRealisticSchemaRuntime({ stepCycles: 1 });
  let probes = 0; let snapshots = 0;
  runtime.x37ProbeSnapshot = () => { probes += 1; return { cycle: runtime.cycle,
    instructions: runtime.instructions, pins: [{ pin: 'D13', ...runtime.output }],
    instruments: { logic: { transitions: [], dropped: 0 } } }; };
  runtime.snapshot = () => { snapshots += 1; throw new Error('PUBLIC_SNAPSHOT_FORBIDDEN'); };
  const seam = createAvrX37RuntimeSeam({ runtime, ...seamOwner('avr'),
    maxInstructionsPerAdvance: steps, maxTotalInstructions: steps });
  assert.equal(seam.advanceToLocalCycle(steps).steps, steps);
  assert.equal(snapshots, 0); assert.equal(probes, steps * 2 + 4);
});

test('actual AVR X37 pin probe retains a fixed ring and reports exact rollover drops', () => {
  const adapter = new Atmega328PAdapter(':00000001FF'); const mask = 1 << 5;
  adapter.x37ProbeSnapshot('D13');
  for (let index = 0; index < 65; index += 1) {
    adapter.cpu.cycles += 1;
    adapter.cpu.data[portBConfig.DDR] = index % 2 === 0
      ? adapter.cpu.data[portBConfig.DDR] | mask : adapter.cpu.data[portBConfig.DDR] & ~mask;
    adapter.x37ProbeSnapshot('D13');
  }
  const probe = adapter.x37ProbeSnapshot('D13');
  assert.equal(probe.instruments.logic.transitions.length, 64);
  assert.equal(probe.instruments.logic.dropped, 1);
});

test('RP lean-step ledger double crosses 100k instructions with one boundary progress and all non-progress events', () => {
  const adapter = {
    cycle: 0, instructions: 0, records: [],
    snapshot: () => ({ descriptor: { capabilities: ['gpio', 'uart'] } }),
    handleX37Step() {
      this.cycle += 1; this.instructions += 1;
      if (this.instructions === 25_000) this.records.push({ type: 'digital-input-applied', cycle: this.cycle });
      if (this.instructions === 50_000) this.records.push({ type: 'gpio', cycle: this.cycle });
      if (this.instructions === 75_000) this.records.push({ type: 'uart-tx', cycle: this.cycle });
    },
    commitX37AdvanceProgress() {
      this.records.push({ type: 'progress', cycle: this.cycle, instructions: this.instructions });
      return this.machineStatus();
    },
    handle() { throw new Error('NOT_USED'); },
    machineSnapshot() { return { cycle: this.cycle }; },
    machineStatus() { return { cycle: this.cycle, instructions: this.instructions, blocked: false }; },
    x37ProbeSnapshot() { return { ...this.machineStatus(), gpio: [], gpioDropped: 0 }; },
  };
  const runtime = new Rp2040ExperimentalRuntime(adapter, {
    artifactIdentity: 'a'.repeat(64), firmwareFormat: 'uf2', firmwareOrigin: 'test',
  });
  const seam = createRp2040X37RuntimeSeam({ runtime, ...seamOwner('rp'),
    maxStepsPerAdvance: 100_001, maxTotalInstructions: 100_001 });
  const result = seam.advanceToLocalCycle(100_001);
  assert.equal(result.steps, 100_001); assert.equal(result.totalInstructions, 100_001);
  assert.deepEqual(adapter.records.map(({ type }) => type),
    ['digital-input-applied', 'gpio', 'uart-tx', 'progress']);
  assert.deepEqual(adapter.records.at(-1), { type: 'progress', cycle: 100_001, instructions: 100_001 });
});

test('RP lean-step double retains injected unsupported error and stops before boundary progress', () => {
  const failure = Object.assign(new Error('RUNTIME_CAPABILITY_UNSUPPORTED'),
    { code: 'RUNTIME_CAPABILITY_UNSUPPORTED' });
  const adapter = {
    cycle: 0, instructions: 0, records: [],
    snapshot: () => ({ descriptor: { capabilities: ['gpio'] } }),
    handleX37Step() {
      this.cycle += 1; this.instructions += 1;
      if (this.instructions === 3) { this.records.push({ type: 'error', cycle: 3 }); throw failure; }
    },
    commitX37AdvanceProgress() { this.records.push({ type: 'progress' }); },
    handle() { throw new Error('NOT_USED'); },
    machineSnapshot() { return { cycle: this.cycle }; },
    machineStatus() { return { cycle: this.cycle, instructions: this.instructions, blocked: false }; },
    x37ProbeSnapshot() { return { ...this.machineStatus(), gpio: [], gpioDropped: 0 }; },
  };
  const runtime = new Rp2040ExperimentalRuntime(adapter, {
    artifactIdentity: 'a'.repeat(64), firmwareFormat: 'uf2', firmwareOrigin: 'test',
  });
  const seam = createRp2040X37RuntimeSeam({ runtime, ...seamOwner('rp') });
  assert.throws(() => seam.advanceToLocalCycle(10), { code: 'RUNTIME_CAPABILITY_UNSUPPORTED' });
  assert.deepEqual(adapter.records, [{ type: 'error', cycle: 3 }]);
});

test('firmware observations are capped at the shared 32-event ceiling', () => {
  const runtime = new SyntheticRealisticSchemaRuntime({ profile: 'rp2040', stepCycles: 1,
    states: [{ mode: 'OUTPUT', level: false }, { mode: 'OUTPUT', level: true }] });
  const seam = createRp2040X37RuntimeSeam({ runtime, ...seamOwner('rp'),
    maxObservations: 1 });
  assert.throws(() => seam.advanceToLocalCycle(2), { code: 'X37_SEAM_OBSERVATION_CAP' });
});

test('AVR without dispose is paused and detached without leak-free claim', () => {
  const runtime = new SyntheticRealisticSchemaRuntime();
  runtime.dispose = undefined;
  const seam = createAvrX37RuntimeSeam({ runtime, ...seamOwner('avr') });
  assert.deepEqual(seam.dispose(), { disposed: true, runtimeDisposed: false, detached: true });
  assert.equal(runtime.paused, true);
});

test('fixtures are explicitly synthetic realistic-schema doubles, not MCU evidence', () => {
  assert.equal(new SyntheticRealisticSchemaRuntime().constructor.name, 'SyntheticRealisticSchemaRuntime');
});
