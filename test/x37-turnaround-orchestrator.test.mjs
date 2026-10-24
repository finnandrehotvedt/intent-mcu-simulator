import assert from 'node:assert/strict';
import test from 'node:test';

import { createObservedDigitalNetResolver } from '../src/x37-existing-runtime-seams.mjs';
import { runX37TurnaroundOrchestration } from '../src/x37-turnaround-orchestrator.mjs';

const contract = {
  schema: 'intent-mcu-x37-shared-scheduler-contract@1', schedulerId: 'turnaround-test', startSchedulerTick: 0,
  participants: ['avr', 'rp'].map((participantId) => ({ participantId, projectGeneration: 1,
    runtimeGeneration: 1, localCyclesPerSchedulerTick: { numerator: 1, denominator: 1 } })),
  sharedNet: { netId: 'shared.digital.0', driverParticipantIds: ['avr', 'rp'], readerParticipantIds: ['avr', 'rp'] },
  limits: { eventLimit: 32, traceLimit: 32 },
};
const observation = (participantId, watermark, localCycle, mode, level) => ({
  origin: 'executed-firmware-observation', participantId, netId: 'shared.digital.0',
  runtimeEpoch: 0, watermark, localCycle, mode, ...(mode === 'DRIVE' ? { level } : {}),
});

class RealisticApiDouble {
  constructor(participantId, batches) {
    this.participantId = participantId; this.cycle = 0; this.pending = [observation(participantId, 1, 0, 'RELEASE')];
    this.batches = batches; this.batch = 0; this.received = []; this.applied = new Set(); this.advanceCalls = 0;
  }
  currentCycle() { return this.cycle; }
  observeFirmwareGpio() { const values = this.pending; this.pending = []; return values; }
  advanceToLocalCycle(targetCycle) {
    assert(targetCycle >= this.cycle, 'no runtime rewind'); this.cycle = targetCycle; this.advanceCalls += 1;
    for (const record of this.received) this.applied.add(record);
    const next = this.batches[this.batch];
    if (typeof next === 'function') this.pending.push(...next(this));
    this.batch += 1; return { reachedCycle: this.cycle };
  }
  deliverResolvedLevel(level, source) {
    const record = { level, source, sequence: this.received.length + 1 };
    this.received.push(record); return { queued: [record] };
  }
  lifecycle() { return { advanceCalls: this.advanceCalls, totalInstructions: this.advanceCalls, retired: false, disposed: false }; }
}

function fixture({ disconnect = false, conflict = false, earlyResponse = false, missingRelease = false } = {}) {
  const avr = new RealisticApiDouble('avr', [
    () => [observation('avr', 2, 10, 'DRIVE', false), observation('avr', 3, 20, 'RELEASE')],
    () => [observation('avr', 4, 50, 'DRIVE', false), observation('avr', 5, 60, 'RELEASE')],
  ]);
  const rp = new RealisticApiDouble('rp', [
    () => earlyResponse || conflict ? [observation('rp', 2, 15, 'DRIVE', conflict)] : [],
    () => [],
    () => [observation('rp', 2, 30, 'DRIVE', false),
      ...(missingRelease ? [] : [observation('rp', 3, 40, 'RELEASE')])],
  ]);
  const net = createObservedDigitalNetResolver({ netId: 'shared.digital.0',
    driverParticipantIds: ['avr', 'rp'], idleLevel: disconnect ? null : true });
  const inputApplied = {
    avr: (record) => avr.applied.has(record.delivery.queued[0]),
    rp: (record) => rp.applied.has(record.delivery.queued[0]),
  };
  return { seams: { avr, rp }, schedulerContract: contract, net, inputApplied };
}

test('same worker orchestration preserves multi-phase batches and proves applied input before responses', () => {
  const value = runX37TurnaroundOrchestration(fixture());
  assert.equal(value.acceptance.accepted, true);
  assert.deepEqual(value.trace.map(({ phase }) => phase),
    ['idle', 'request', 'request-release', 'ack', 'ack-release', 'confirm', 'confirm-release']);
  assert.equal(value.applied.filter(({ inputApplied }) => inputApplied).length, 2);
});

test('initial peer release is sorted before later output and no target cycle rewinds', () => {
  const value = runX37TurnaroundOrchestration(fixture());
  assert.deepEqual(value.evidence.slice(0, 2).map(({ observation }) => observation.participantId), ['avr', 'rp']);
  assert(value.deliveries.every(({ targetCycle, source }) => targetCycle >= source.mappedTick));
});

test('orchestration source uses locale-independent ASCII participant ordering', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) =>
    readFile(new URL('../src/x37-turnaround-orchestrator.mjs', import.meta.url), 'utf8'));
  assert.match(source, /left < right \? -1 : 1/u);
  assert.doesNotMatch(source, /localeCompare/u);
});

test('disconnect conflict missing release and response-before-input fail closed', () => {
  assert.throws(() => runX37TurnaroundOrchestration(fixture({ disconnect: true })), { code: 'X37_TURNAROUND_HIGH_Z' });
  assert.throws(() => runX37TurnaroundOrchestration(fixture({ conflict: true })), { code: 'X37_TURNAROUND_CONFLICT' });
  assert.throws(() => runX37TurnaroundOrchestration(fixture({ missingRelease: true })), { code: 'X37_EXPECTED_FIRMWARE_OBSERVATION_MISSING' });
  assert.throws(() => runX37TurnaroundOrchestration(fixture({ earlyResponse: true })), { code: 'X37_TURNAROUND_RESPONSE_BEFORE_INPUT' });
});

test('adaptive bounded advances cross a startup longer than 16384 cycles without raising call cap', () => {
  const value = fixture();
  value.seams.avr.batches = [() => [], () => [], () => [], () => [], () => [],
    () => [observation('avr', 2, 20_000, 'DRIVE', false), observation('avr', 3, 21_000, 'RELEASE')],
    () => [observation('avr', 4, 50_000, 'DRIVE', false), observation('avr', 5, 51_000, 'RELEASE')]];
  value.seams.rp.batches = [() => [], () => [], () => [],
    () => [observation('rp', 2, 40_000, 'DRIVE', false), observation('rp', 3, 41_000, 'RELEASE')]];
  value.inputApplied = { avr: () => true, rp: () => true };
  assert.equal(runX37TurnaroundOrchestration(value).acceptance.accepted, true);
});

test('missing output preserves partial lifecycle and budget evidence', () => {
  const value = fixture(); value.seams.avr.batches = Array.from({ length: 32 }, () => () => []);
  assert.throws(() => runX37TurnaroundOrchestration(value), (error) => {
    assert(['X37_SEAM_INSTRUCTION_CAP', 'X37_SEAM_ADVANCE_CALL_CAP',
      'X37_EXPECTED_FIRMWARE_OBSERVATION_MISSING'].includes(error.code));
    assert.equal(error.x37Partial.evidence.length, 2);
    assert(error.x37Partial.seamLifecycle.avr.advanceCalls > 0); return true;
  });
});
