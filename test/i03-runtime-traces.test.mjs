// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RUNTIME_TRACE_SCHEMA,
  sharedInstrumentSummary,
  sharedInstrumentView,
} from '../src/instrument-capabilities.mjs';
import {
  AVR_PROFILE,
  ESP32C3_PROFILE,
  RP2040_PROFILE,
  STM32F429ZI_PROFILE,
} from '../src/compile-targets.mjs';

const hash = (value) => value.repeat(64);

test('I03 AVR trace binds exact worker cycles, channels, retention and generation', () => {
  const summary = sharedInstrumentSummary(AVR_PROFILE, {
    revision: 12, artifactIdentity: hash('a'), runtime: {
      cycle: 32_000, pins: [{ pin: 'D13', mode: 'OUTPUT', level: false }],
      eventLog: { log: [], dropped: 0 },
      instruments: {
        serial: { records: [], dropped: 0 }, pin: { pin: 'D13', mode: 'OUTPUT', level: false },
        logic: { channels: ['D2', 'D13'], dropped: 7, transitions: [
          { pin: 'D2', cycle: 8_000, level: true },
          { pin: 'D13', cycle: 16_000, level: true },
          { pin: 'D13', cycle: 24_000, level: false },
        ] },
      },
    },
  });
  const initial = sharedInstrumentView(summary);
  const view = sharedInstrumentView(summary, { ...initial.local, selectedTraceChannel: 'D13' });
  assert.equal(view.trace.schema, RUNTIME_TRACE_SCHEMA);
  assert.equal(view.trace.classification, 'recorded-runtime');
  assert.equal(view.trace.revision, 12);
  assert.equal(view.trace.artifactIdentity, hash('a'));
  assert.equal(view.trace.time.basis, 'virtual-cycle');
  assert.deepEqual(view.trace.channels, ['D2', 'D13']);
  assert.deepEqual(view.trace.records.map(({ cycle, level }) => ({ cycle, level })), [
    { cycle: 16_000, level: true }, { cycle: 24_000, level: false },
  ]);
  assert.deepEqual(view.trace.retention, { retained: 3, dropped: 7, limit: 100_000 });
});

test('I03 Pico trace uses only current rp2040js cycles and supplied virtual nanoseconds', () => {
  const summary = sharedInstrumentSummary(RP2040_PROFILE, {
    revision: 3, artifact: { uf2Sha256: hash('b') }, runtime: {
      artifactIdentity: hash('b'), cycle: 250_000, cyclesPerMillisecond: 125_000,
      pins: [{ pin: 'GPIO0', mode: 'OUTPUT', level: true }],
      instruments: {
        serial: { records: [], text: '', dropped: 0 },
        logic: { channels: ['GPIO0'], dropped: 2, transitions: [
          { pin: 'GPIO0', cycle: 125_000, virtualNanos: 1_000_000, level: true },
          { pin: 'GPIO0', cycle: 250_000, virtualNanos: 2_000_000, level: false },
        ] },
      },
    },
  });
  const trace = sharedInstrumentView(summary).trace;
  assert.equal(trace.classification, 'recorded-runtime');
  assert.equal(trace.time.basis, 'virtual-cycle-and-nanoseconds');
  assert.equal(trace.records[1].virtualNanos, 2_000_000);
  assert.equal(trace.retention.dropped, 2);
  assert.match(trace.provenance, /rp2040js worker/u);
});

test('I03 C3 trace remains a separately labelled model and never QEMU pin evidence', () => {
  const summary = sharedInstrumentSummary(ESP32C3_PROFILE, {
    revision: 8, artifact: { flashSha256: hash('c') }, runtime: {
      flashSha256: hash('c'), uart: { exactApplicationText: 'C3', markerCount: 2,
        bootEpochs: [{ marker: 'C3' }, { marker: 'C3' }] },
      modeledCircuit: { source: 'executed-register-writes', epochs: [
        { adapter: { drive: 'high' } }, { adapter: { drive: 'low' } },
      ] },
    },
  });
  const trace = sharedInstrumentView(summary).trace;
  assert.equal(trace.classification, 'project-model');
  assert.equal(trace.time.basis, 'adapter-epoch-sequence');
  assert.deepEqual(trace.records.map(({ sequence, level }) => ({ sequence, level })), [
    { sequence: 1, level: true }, { sequence: 2, level: false },
  ]);
  assert.match(trace.provenance, /not QEMU CPU GPIO or pin timing/u);
});

test('I03 STM32 shows one actual final Renode PB0 observation without invented timing', () => {
  const summary = sharedInstrumentSummary(STM32F429ZI_PROFILE, {
    revision: 9, artifact: { sha256: hash('d') }, runtime: {
      elfSha256: hash('d'), bootEpochs: 2, observed: { pb0: true, uartText: 'STM32\n' },
    },
  });
  const trace = sharedInstrumentView(summary).trace;
  assert.equal(trace.classification, 'recorded-runtime');
  assert.equal(trace.time.basis, 'instruction-order-only');
  assert.deepEqual(trace.records, [{ channel: 'PB0', sequence: 1, level: true,
    state: 'final-observation' }]);
  assert.match(trace.provenance, /no timed transition waveform/u);
});

test('I03 stale artifact authority yields no channels, records or implied retention', () => {
  const summary = sharedInstrumentSummary(RP2040_PROFILE, {
    revision: 4, artifact: { uf2Sha256: hash('e') }, runtime: {
      artifactIdentity: hash('f'), cycle: 1,
      instruments: { logic: { channels: ['GPIO0'], transitions: [
        { pin: 'GPIO0', cycle: 1, virtualNanos: 8, level: true },
      ] } },
    },
  });
  const trace = sharedInstrumentView(summary).trace;
  assert.equal(trace.classification, 'unavailable');
  assert.deepEqual(trace.channels, []);
  assert.deepEqual(trace.records, []);
  assert.deepEqual(trace.retention, { retained: null, dropped: null, limit: null });
});
