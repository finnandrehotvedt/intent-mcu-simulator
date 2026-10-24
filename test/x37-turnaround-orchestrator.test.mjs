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
  constructor(participantId, scheduled, { instructionMultiplier = 1 } = {}) {
    this.participantId = participantId; this.cycle = 0; this.pending = [observation(participantId, 1, 0, 'RELEASE')];
    this.scheduled = scheduled; this.received = []; this.applied = new Set(); this.advanceCalls = 0;
    this.instructions = 0; this.instructionMultiplier = instructionMultiplier;
  }
  currentCycle() { return this.cycle; }
  observeFirmwareGpio() { const values = this.pending; this.pending = []; return values; }
  advanceToLocalCycle(targetCycle) {
    assert(targetCycle >= this.cycle, 'no runtime rewind');
    this.instructions += (targetCycle - this.cycle) * this.instructionMultiplier;
    if (this.instructions > 1_000_000) throw Object.assign(new Error('X37_SEAM_INSTRUCTION_CAP'),
      { code: 'X37_SEAM_INSTRUCTION_CAP' });
    this.cycle = targetCycle; this.advanceCalls += 1;
    for (const record of this.received) this.applied.add(record);
    while (this.scheduled.length && this.scheduled[0].cycle <= this.cycle
        && this.applied.size >= (this.scheduled[0].minimumApplied ?? 0)) {
      const next = this.scheduled.shift();
      this.pending.push(observation(this.participantId, next.watermark, next.cycle, next.mode, next.level));
    }
    return { reachedCycle: this.cycle };
  }
  deliverResolvedLevel(level, source) {
    const record = { level, source, sequence: this.received.length + 1 };
    this.received.push(record); return { queued: [record] };
  }
  lifecycle() { return { advanceCalls: this.advanceCalls, totalInstructions: this.instructions, retired: false, disposed: false }; }
}

function fixture({ disconnect = false, conflict = false, earlyResponse = false, missingRelease = false } = {}) {
  const avr = new RealisticApiDouble('avr', [
    { watermark: 2, cycle: 10, mode: 'DRIVE', level: false },
    { watermark: 3, cycle: 20, mode: 'RELEASE' },
    { watermark: 4, cycle: 50, mode: 'DRIVE', level: false, minimumApplied: 3 },
    { watermark: 5, cycle: 60, mode: 'RELEASE' },
  ]);
  const rp = new RealisticApiDouble('rp', [
    ...(earlyResponse || conflict ? [{ watermark: 2, cycle: 15, mode: 'DRIVE', level: conflict }] : []),
    ...(!earlyResponse && !conflict ? [{ watermark: 2, cycle: 30, mode: 'DRIVE', level: false, minimumApplied: 3 },
      ...(missingRelease ? [] : [{ watermark: 3, cycle: 40, mode: 'RELEASE' }])] : []),
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
  assert.throws(() => runX37TurnaroundOrchestration(fixture({ conflict: true })), { code: 'X37_SEAM_NET_INPUT_INVALID' });
  assert.throws(() => runX37TurnaroundOrchestration(fixture({ missingRelease: true })), { code: 'X37_SEAM_INSTRUCTION_CAP' });
  assert.throws(() => runX37TurnaroundOrchestration(fixture({ earlyResponse: true })), { code: 'X37_SEAM_NET_INPUT_INVALID' });
});

test('adaptive bounded advances cross a startup longer than 16384 cycles without raising call cap', () => {
  const value = fixture();
  value.seams.avr.scheduled = [{ watermark: 2, cycle: 20_000, mode: 'DRIVE', level: false },
    { watermark: 3, cycle: 21_000, mode: 'RELEASE' },
    { watermark: 4, cycle: 50_000, mode: 'DRIVE', level: false, minimumApplied: 3 },
    { watermark: 5, cycle: 51_000, mode: 'RELEASE' }];
  value.seams.rp.scheduled = [{ watermark: 2, cycle: 40_000, mode: 'DRIVE', level: false, minimumApplied: 3 },
    { watermark: 3, cycle: 41_000, mode: 'RELEASE' }];
  value.inputApplied = { avr: () => true, rp: () => true };
  assert.equal(runX37TurnaroundOrchestration(value).acceptance.accepted, true);
});

test('missing output preserves partial lifecycle and budget evidence', () => {
  const value = fixture(); value.seams.avr.scheduled = [];
  assert.throws(() => runX37TurnaroundOrchestration(value), (error) => {
    assert(['X37_SEAM_INSTRUCTION_CAP', 'X37_SEAM_ADVANCE_CALL_CAP',
      'X37_EXPECTED_FIRMWARE_OBSERVATION_MISSING',
      'X37_TURNAROUND_RESPONSE_BEFORE_INPUT'].includes(error.code));
    assert.equal(error.x37Partial.evidence.length, 2);
    assert(error.x37Partial.seamLifecycle.avr.advanceCalls > 0); return true;
  });
});

test('shared horizons advance the waiting peer before the producer release', () => {
  const value = fixture();
  const result = runX37TurnaroundOrchestration({ ...value, advanceWindow: 4 });
  assert.equal(result.acceptance.accepted, true);
  const requestRelease = result.evidence.find(({ observation }) => observation.participantId === 'avr'
    && observation.localCycle === 20);
  assert(requestRelease);
  assert(value.seams.rp.currentCycle() >= 20);
  assert(value.seams.rp.received.some(({ source }) => source.localCycle === 10));
});

test('instruction-cap risk fails closed even when mapped-time chronology is fair', () => {
  const value = fixture();
  value.seams.rp = new RealisticApiDouble('rp', [
    { watermark: 2, cycle: 900_000, mode: 'DRIVE', level: false, minimumApplied: 3 },
    { watermark: 3, cycle: 900_010, mode: 'RELEASE' },
  ], { instructionMultiplier: 100_000 });
  value.inputApplied.rp = (record) => value.seams.rp.applied.has(record.delivery.queued[0]);
  assert.throws(() => runX37TurnaroundOrchestration(value), { code: 'X37_SEAM_INSTRUCTION_CAP' });
});

test('full protocol fixture remains causal at finite wait and hold boundaries', () => {
  const value = fixture();
  value.seams.avr.scheduled = [
    { watermark: 2, cycle: 100, mode: 'DRIVE', level: false },
    { watermark: 3, cycle: 4_196, mode: 'RELEASE' },
    { watermark: 4, cycle: 16_384, mode: 'DRIVE', level: false, minimumApplied: 3 },
    { watermark: 5, cycle: 20_480, mode: 'RELEASE' },
  ];
  value.seams.rp.scheduled = [
    { watermark: 2, cycle: 8_192, mode: 'DRIVE', level: false, minimumApplied: 3 },
    { watermark: 3, cycle: 12_288, mode: 'RELEASE' },
  ];
  const result = runX37TurnaroundOrchestration({ ...value, advanceWindow: 64 });
  assert.equal(result.acceptance.accepted, true);
  assert.deepEqual(result.trace.slice(1).map(({ mappedTick }) => mappedTick),
    [100, 4_196, 8_192, 12_288, 16_384, 20_480]);
  assert.equal(4_196 - 100, 4_096);
  assert.equal(12_288 - 8_192, 4_096);
  assert.equal(20_480 - 16_384, 4_096);
});
