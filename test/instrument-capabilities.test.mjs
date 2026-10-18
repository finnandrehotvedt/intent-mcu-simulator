// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedPush, SERIAL_LIMIT, TRACE_LIMIT } from '../src/atmega328p-adapter.mjs';
import {
  AVR_PROFILE, ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE,
} from '../src/compile-targets.mjs';
import {
  avrInstrumentEvidence, instrumentCapabilities, instrumentCapability, sharedInstrumentSummary,
  sharedInstrumentView, SHARED_INSTRUMENT_SUMMARY_SCHEMA, SHARED_INSTRUMENT_VIEW_SCHEMA,
} from '../src/instrument-capabilities.mjs';
import {
  INPUT_EVENT_LIMIT, LOGIC_TRANSITION_LIMIT, SERIAL_HISTORY_MAX,
} from '../src/runtime-kernel.mjs';
import { cursorCycles, waveformPaths } from '../src/waveform-view.mjs';

test('four profiles expose immutable, explicit instrument boundaries', () => {
  const contracts = instrumentCapabilities();
  assert.deepEqual(contracts.map(({ profile }) => profile), [
    AVR_PROFILE, RP2040_PROFILE, ESP32C3_PROFILE, STM32F429ZI_PROFILE,
  ]);
  assert.equal(instrumentCapability(AVR_PROFILE).serial.status, 'recorded');
  assert.equal(instrumentCapability(RP2040_PROFILE).logic.status, 'recorded');
  assert.match(instrumentCapability(RP2040_PROFILE).logic.source, /rp2040js worker/u);
  assert.match(instrumentCapability(ESP32C3_PROFILE).pin.reason, /not QEMU pin state/u);
  assert.equal(instrumentCapability(STM32F429ZI_PROFILE).serial.status, 'output-only');
  assert.equal(instrumentCapability('unknown'), null);
});

test('AVR evidence is absent until a source-bound worker snapshot exists', () => {
  const absent = avrInstrumentEvidence(null, 'a'.repeat(64));
  assert.equal(absent.state, 'no-recorded-runtime');
  assert.equal(absent.artifactIdentity, null);
  assert.throws(() => avrInstrumentEvidence({
    cycle: 16_000, instruments: {}, eventLog: {}, pins: [],
  }, 'a'.repeat(64)), /INSTRUMENT_EVIDENCE_SHAPE/u);

  const recorded = avrInstrumentEvidence({
    cycle: 32_000,
    pins: [{ pin: 'D13', mode: 'output', level: true }],
    eventLog: { log: [{ type: 'control', cycle: 10 }], dropped: 0 },
    instruments: {
      serial: { records: [{ direction: 'tx', value: 65 }], dropped: 2 },
      logic: { transitions: [{ pin: 'D13', cycle: 20, level: true }], dropped: 3, channels: ['D2', 'D13'] },
      pin: { pin: 'D13', mode: 'output', level: true },
    },
  }, 'b'.repeat(64));
  assert.equal(recorded.state, 'recorded-runtime');
  assert.equal(recorded.virtualMilliseconds, 2);
  assert.deepEqual(recorded.serial, { retained: 1, dropped: 2 });
  assert.deepEqual(recorded.logic.channels, ['D2', 'D13']);
  assert.equal(recorded.input.recorded, 1);
});

test('serial and logic retention limits keep the newest exact bounded history', () => {
  assert.equal(SERIAL_HISTORY_MAX, SERIAL_LIMIT);
  assert.equal(LOGIC_TRANSITION_LIMIT, TRACE_LIMIT);
  assert.equal(INPUT_EVENT_LIMIT, 10_000);
  const serial = Array.from({ length: SERIAL_LIMIT }, (_, index) => index);
  assert.equal(boundedPush(serial, SERIAL_LIMIT, SERIAL_LIMIT), 1);
  assert.equal(serial.length, 4_096);
  assert.equal(serial[0], 1);
  const logic = Array.from({ length: TRACE_LIMIT }, (_, index) => index);
  assert.equal(boundedPush(logic, TRACE_LIMIT, TRACE_LIMIT), 1);
  assert.equal(logic.length, 100_000);
  assert.equal(logic[0], 1);
});

test('500 recorded edges produce a bounded waveform and exact virtual-time cursors', () => {
  const transitions = Array.from({ length: 500 }, (_, index) => ({
    pin: index % 2 ? 'D13' : 'D2', cycle: index * 160, level: Boolean(index % 4),
  }));
  const model = waveformPaths(transitions, ['D2', 'D13'], { edgeLimit: 500 });
  assert.equal(model.records.length, 500);
  assert.equal(model.paths.length, 2);
  const cursors = cursorCycles(model, 0.25, 0.75);
  assert.equal(cursors.deltaMilliseconds, cursors.deltaCycles / 16_000);
});

test('shared summary classifies only current existing evidence for all four profiles', () => {
  const hash = (character) => character.repeat(64);
  const avrRuntime = {
    cycle: 32_000, pins: [{ pin: 'D13', mode: 'output', level: true }],
    eventLog: { log: [{ type: 'control' }], dropped: 2 },
    instruments: {
      serial: { records: [{ text: 'A' }], dropped: 3 },
      logic: { transitions: [{ pin: 'D13', cycle: 1, level: true }], dropped: 4, channels: ['D13'] },
      pin: { pin: 'D13', mode: 'output', level: true },
    },
  };
  const avr = sharedInstrumentSummary(AVR_PROFILE, {
    lifecycle: { projectGeneration: 7 }, artifactIdentity: hash('a'), runtime: avrRuntime,
  });
  assert.equal(avr.schema, SHARED_INSTRUMENT_SUMMARY_SCHEMA);
  assert.equal(avr.revision, 7);
  assert.deepEqual(Object.values(avr.channels).map((channel) => channel.classification),
    ['recorded-runtime', 'recorded-runtime', 'recorded-runtime', 'recorded-runtime']);
  assert.deepEqual(avr.channels.serial.retention, { retained: 1, dropped: 3, limit: 4_096 });
  assert.equal(avr.channels.serial.time.virtualMilliseconds, 2);

  const pico = sharedInstrumentSummary(RP2040_PROFILE, {
    revision: 4, artifact: { uf2Sha256: hash('b') },
    runtime: { artifactIdentity: hash('b'), cycle: 250_000, cyclesPerMillisecond: 125_000,
      instruments: { serial: { records: [{ text: 'P' }], text: 'P', dropped: 1 },
        logic: { channels: ['GPIO0'], transitions: [{ pin: 'GPIO0', cycle: 125_000,
          virtualNanos: 1_000_000, level: true }], dropped: 0 } },
      experimental: { gpio0: { mode: 'output', level: true } } },
  });
  assert.deepEqual(Object.values(pico.channels).map((channel) => channel.classification),
    ['recorded-runtime', 'recorded-runtime', 'recorded-runtime', 'unavailable']);
  assert.equal(pico.channels.gpio.time.virtualMilliseconds, 2);
  assert.equal(pico.channels.serial.retention.dropped, 1);

  const c3 = sharedInstrumentSummary(ESP32C3_PROFILE, {
    revision: 8, artifact: { flashSha256: hash('c') },
    runtime: { flashSha256: hash('c'), uart: { exactApplicationText: 'C3', markerCount: 2,
      bootEpochs: [{ marker: 'C3' }, { marker: 'C3' }] }, modeledCircuit: {
      source: 'gpio2-adapter', epochs: [{ led: { on: true } }, { led: { on: true } }],
    } },
  });
  assert.deepEqual(Object.values(c3.channels).map((channel) => channel.classification),
    ['recorded-runtime', 'project-model', 'project-model', 'unavailable']);
  assert.match(c3.channels.gpio.provenance, /not QEMU pin state/u);
  assert.equal(c3.channels.serial.time.basis, 'reset-epoch-sequence');
  assert.match(c3.channels.logic.provenance, /not QEMU CPU GPIO/u);
  const c3View = sharedInstrumentView(sharedInstrumentSummary(ESP32C3_PROFILE, {
    revision: 8, artifact: { flashSha256: hash('c') },
    runtime: { flashSha256: hash('c'), uart: { exactApplicationText: 'C3', markerCount: 1,
      bootEpochs: [{ marker: 'C3' }] }, modeledCircuit: { source: 'gpio2-adapter',
      epochs: [{ adapter: { drive: 'high', volts: 3.3 }, led: { on: true } }] } },
  }));
  assert.deepEqual(c3View.pin.options, ['GPIO2']);
  assert.equal(c3View.pin.classification, 'project-model');
  assert.equal(c3View.pin.fields.mode.value, 'high');
  assert.equal(c3View.pin.fields.level.value, true);
  assert.equal(c3View.pin.fields.voltage.value, 3.3);
  assert.equal(c3View.pin.fields.pwm.status, 'unavailable');

  const stm32 = sharedInstrumentSummary(STM32F429ZI_PROFILE, {
    revision: 9, artifact: { sha256: hash('d') }, runtime: { elfSha256: hash('d'), bootEpochs: 2,
      observed: { pb0: true, uartText: 'STM32\n' } },
  });
  assert.deepEqual(Object.values(stm32.channels).map((channel) => channel.classification),
    ['recorded-runtime', 'recorded-runtime', 'recorded-runtime', 'unavailable']);
  assert.equal(stm32.channels.serial.time.basis, 'reset-epoch-sequence');
  assert.equal(stm32.channels.gpio.time.basis, 'instruction-order-only');
  const stm32View = sharedInstrumentView(stm32);
  assert.deepEqual(stm32View.pin.options, ['PB0']);
  assert.equal(stm32View.pin.fields.level.value, true);
  assert.equal(stm32View.pin.fields.mode.status, 'unavailable');
});

test('shared summary rejects stale identities and never fills missing values', () => {
  const stale = sharedInstrumentSummary(RP2040_PROFILE, {
    revision: 5, artifact: { uf2Sha256: 'a'.repeat(64) },
    runtime: { artifactIdentity: 'b'.repeat(64), cycle: 5,
      instruments: { serial: { records: [{ text: 'stale' }] } },
      experimental: { gpio0: { level: true } } },
  });
  assert.equal(stale.state, 'no-current-runtime');
  assert.equal(stale.artifactIdentity, null);
  assert.equal(stale.channels.serial.classification, 'unavailable');
  assert.deepEqual(stale.channels.serial.retention, { retained: null, dropped: null, limit: null });
  assert.equal(stale.channels.serial.value, null);
  assert.equal(sharedInstrumentSummary('unknown', {}), null);
});

test('shared viewer is a truthful local projection with bounded pin choices', () => {
  const hash = 'e'.repeat(64);
  const summary = sharedInstrumentSummary(AVR_PROFILE, {
    artifactIdentity: hash,
    runtime: {
      cycle: 16_000,
      pins: [
        { pin: 'D13', mode: 'OUTPUT', level: true, pwm: null, diagnostic: 'OK' },
        { pin: 'A0', mode: 'ANALOG_INPUT', level: false, voltage: 2.5, adc: 512, pwm: null },
      ],
      eventLog: { log: [], dropped: 0 },
      instruments: {
        serial: { records: [{ direction: 'tx', value: 79 }, { direction: 'tx', value: 75 }], dropped: 0 },
        logic: { transitions: [], dropped: 0, channels: [] },
        pin: { pin: 'D13', mode: 'OUTPUT', level: true },
      },
    },
  });
  const initial = sharedInstrumentView(summary);
  assert.equal(initial.schema, SHARED_INSTRUMENT_VIEW_SCHEMA);
  assert.equal(initial.serial.text, 'OK');
  assert.deepEqual(initial.pin.options, ['D13', 'A0']);
  assert.equal(initial.pin.selectedPin, 'D13');
  assert.equal(initial.pin.fields.voltage.status, 'unavailable');
  assert.equal(initial.trace.schema, 'intent-mcu-runtime-trace@1');
  assert.deepEqual(initial.trace.channels, []);

  const local = sharedInstrumentView(summary, { ...initial.local, cleared: true, selectedPin: 'A0' });
  assert.equal(local.serial.text, '');
  assert.equal(local.serial.retainedTextLength, 2);
  assert.equal(local.pin.selectedPin, 'A0');
  assert.equal(local.pin.fields.voltage.value, 2.5);
  assert.equal(local.pin.fields.adc.value, 512);

  const retired = sharedInstrumentView(sharedInstrumentSummary(AVR_PROFILE, {}), local.local);
  assert.equal(retired.state, 'no-current-runtime');
  assert.equal(retired.local.cleared, false);
  assert.deepEqual(retired.pin.options, []);
  assert.equal(retired.trace.classification, 'unavailable');
});
