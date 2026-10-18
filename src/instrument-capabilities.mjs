// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  AVR_PROFILE,
  ESP32C3_PROFILE,
  RP2040_PROFILE,
  STM32F429ZI_PROFILE,
} from './compile-targets.mjs';
import {
  INPUT_EVENT_LIMIT,
  LOGIC_CHANNEL_LIMIT,
  LOGIC_TRANSITION_LIMIT,
  SERIAL_HISTORY_MAX,
} from './runtime-kernel.mjs';

export const INSTRUMENT_CAPABILITY_SCHEMA = 'intent-mcu-instrument-capability@1';
export const INSTRUMENT_EVIDENCE_SCHEMA = 'intent-mcu-instrument-evidence@1';
export const SHARED_INSTRUMENT_SUMMARY_SCHEMA = 'intent-mcu-shared-instrument-summary@1';
export const SHARED_INSTRUMENT_VIEW_SCHEMA = 'intent-mcu-shared-instrument-view@1';

const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
};
const clone = (value) => structuredClone(value);

const unavailable = (reason) => ({ status: 'unavailable', surface: 'none', reason });

const contracts = freeze({
  [AVR_PROFILE]: {
    profile: AVR_PROFILE,
    label: 'ATmega328P · 16 MHz',
    runtimeProvenance: 'Compiled artifact → avr8js worker → project-owned circuit model',
    clockHertz: 16_000_000,
    serial: { status: 'recorded', surface: 'shared-console', source: 'USART0 TX/RX worker records', retained: SERIAL_HISTORY_MAX },
    pin: { status: 'recorded', surface: 'shared-inspector', source: 'worker pin snapshot D0–D13/A0–A5' },
    logic: { status: 'recorded', surface: 'shared-analyser', source: 'worker digital transition records', channels: LOGIC_CHANNEL_LIMIT, retained: LOGIC_TRANSITION_LIMIT },
    input: { status: 'recorded', surface: 'supported-controls-and-USART0-RX', source: 'ordered worker input event log', retained: INPUT_EVENT_LIMIT },
  },
  [RP2040_PROFILE]: {
    profile: RP2040_PROFILE,
    label: 'RP2040 Pico · bounded profile',
    runtimeProvenance: 'Compiled UF2 → rp2040js worker',
    clockHertz: 125_000_000,
    serial: { status: 'output-only', surface: 'profile-UART0-output', source: 'bounded worker UART0 output', reason: 'The shared Serial console and RX input are not public for this profile.' },
    pin: unavailable('No shared pin inspector is public for Pico.'),
    logic: unavailable('No shared logic analyser is public for Pico; dormant internal trace data is not a capability.'),
    input: unavailable('No public Pico button, analogue or Serial-input control is modelled.'),
  },
  [ESP32C3_PROFILE]: {
    profile: ESP32C3_PROFILE,
    label: 'ESP32-C3 · bounded profile',
    runtimeProvenance: 'Compiled flash → Espressif QEMU CPU/UART',
    clockHertz: null,
    serial: { status: 'output-only', surface: 'profile-QEMU-UART-output', source: 'actual QEMU UART boot output', reason: 'The shared Serial console and RX input are not public for this profile.' },
    pin: unavailable('No shared pin inspector is public; GPIO2 LED is a separately labelled project register model, not QEMU pin state.'),
    logic: unavailable('No public QEMU pin-level logic trace is available.'),
    input: unavailable('No public ESP32-C3 runtime input control is modelled.'),
  },
  [STM32F429ZI_PROFILE]: {
    profile: STM32F429ZI_PROFILE,
    label: 'STM32F429ZI · bounded profile',
    runtimeProvenance: 'Compiled ELF → Renode 1.17.0',
    clockHertz: null,
    serial: { status: 'output-only', surface: 'profile-Renode-USART3-output', source: 'actual Renode USART3 output', reason: 'The shared Serial console and RX input are not public for this profile.' },
    pin: unavailable('No shared pin inspector is public; only the bounded PB0 observation is accepted.'),
    logic: unavailable('No shared logic analyser is public for STM32F429ZI.'),
    input: unavailable('No public STM32F429ZI runtime input control is modelled.'),
  },
});

export function instrumentCapability(profile) {
  const contract = contracts[profile];
  return contract ? clone({ schema: INSTRUMENT_CAPABILITY_SCHEMA, ...contract }) : null;
}

export function instrumentCapabilities() {
  return [AVR_PROFILE, RP2040_PROFILE, ESP32C3_PROFILE, STM32F429ZI_PROFILE]
    .map(instrumentCapability);
}

export function avrInstrumentEvidence(runtime, artifactIdentity) {
  const capability = contracts[AVR_PROFILE];
  if (!runtime || !Number.isSafeInteger(runtime.cycle) || runtime.cycle < 0
      || !/^[0-9a-f]{64}$/u.test(artifactIdentity ?? '')) {
    return {
      schema: INSTRUMENT_EVIDENCE_SCHEMA,
      profile: AVR_PROFILE,
      state: 'no-recorded-runtime',
      provenance: capability.runtimeProvenance,
      artifactIdentity: null,
      cycle: null,
      virtualMilliseconds: null,
    };
  }
  const serial = runtime.instruments?.serial;
  const logic = runtime.instruments?.logic;
  const pin = runtime.instruments?.pin;
  const input = runtime.eventLog;
  if (!Array.isArray(serial?.records) || !Array.isArray(logic?.transitions)
      || !Array.isArray(input?.log) || !Array.isArray(runtime.pins)) {
    throw new Error('INSTRUMENT_EVIDENCE_SHAPE');
  }
  return {
    schema: INSTRUMENT_EVIDENCE_SCHEMA,
    profile: AVR_PROFILE,
    state: 'recorded-runtime',
    provenance: capability.runtimeProvenance,
    artifactIdentity,
    cycle: runtime.cycle,
    virtualMilliseconds: runtime.cycle / 16_000,
    serial: { retained: serial.records.length, dropped: serial.dropped ?? 0 },
    logic: { retained: logic.transitions.length, dropped: logic.dropped ?? 0, channels: [...(logic.channels ?? [])] },
    pin: pin ? { pin: pin.pin, mode: pin.mode, cycle: runtime.cycle } : null,
    input: { recorded: input.log.length, dropped: input.dropped ?? 0 },
  };
}

const noValue = (provenance) => ({
  classification: 'unavailable', provenance,
  time: { basis: 'unavailable', cycle: null, virtualMilliseconds: null },
  retention: { retained: null, dropped: null, limit: null }, value: null,
});

const observed = (classification, provenance, value, {
  cycle = null, virtualMilliseconds = null, retained = 0, dropped = 0, limit = null,
  timeBasis = cycle === null ? 'sequence-only' : 'virtual-cycle',
} = {}) => ({
  classification, provenance,
  time: { basis: timeBasis, cycle, virtualMilliseconds },
  retention: { retained, dropped, limit }, value,
});

function emptySummary(profile, state, artifactIdentity = null) {
  return {
    schema: SHARED_INSTRUMENT_SUMMARY_SCHEMA,
    profile,
    revision: Number.isSafeInteger(state?.revision) ? state.revision
      : Number.isSafeInteger(state?.lifecycle?.projectGeneration) ? state.lifecycle.projectGeneration : null,
    artifactIdentity,
    state: 'no-current-runtime',
    provenance: contracts[profile]?.runtimeProvenance ?? 'Unavailable profile',
    channels: {},
  };
}

/**
 * Project only evidence already present in the selected workbench state. This
 * function never runs a producer, interprets missing values, or retains an
 * older snapshot. Every returned channel states its evidence class explicitly.
 */
export function sharedInstrumentSummary(profile, state = {}) {
  if (!contracts[profile]) return null;
  if (profile === AVR_PROFILE) {
    const artifactIdentity = state.artifactIdentity ?? state.project?.build?.artifactIdentity ?? null;
    const summary = emptySummary(profile, state, artifactIdentity);
    const evidence = avrInstrumentEvidence(state.runtime, artifactIdentity);
    if (evidence.state !== 'recorded-runtime') {
      summary.artifactIdentity = null;
      summary.channels = {
        serial: noValue('No current source-bound USART0 worker snapshot.'),
        gpio: noValue('No current source-bound GPIO worker snapshot.'),
        logic: noValue('No current source-bound transition snapshot.'),
        input: noValue('No current source-bound input event snapshot.'),
      };
      return summary;
    }
    summary.state = 'current-runtime';
    summary.channels = {
      serial: observed('recorded-runtime', 'USART0 TX/RX records from the current avr8js worker snapshot',
        { records: clone(state.runtime.instruments.serial.records) }, { cycle: evidence.cycle, virtualMilliseconds: evidence.virtualMilliseconds,
          retained: evidence.serial.retained, dropped: evidence.serial.dropped, limit: SERIAL_HISTORY_MAX }),
      gpio: observed('recorded-runtime', 'D0–D13/A0–A5 pin state from the current avr8js worker snapshot',
        { pins: clone(state.runtime.pins), selectedPin: evidence.pin?.pin ?? null },
        { cycle: evidence.cycle, virtualMilliseconds: evidence.virtualMilliseconds,
          retained: state.runtime.pins.length, dropped: 0, limit: state.runtime.pins.length }),
      logic: observed('recorded-runtime', 'Digital transitions from the current avr8js worker snapshot',
        { channels: evidence.logic.channels }, { cycle: evidence.cycle, virtualMilliseconds: evidence.virtualMilliseconds,
          retained: evidence.logic.retained, dropped: evidence.logic.dropped, limit: LOGIC_TRANSITION_LIMIT }),
      input: observed('recorded-runtime', 'Ordered controls and USART0 RX from the current avr8js worker snapshot',
        { records: evidence.input.recorded }, { cycle: evidence.cycle, virtualMilliseconds: evidence.virtualMilliseconds,
          retained: evidence.input.recorded, dropped: evidence.input.dropped, limit: INPUT_EVENT_LIMIT }),
    };
    return summary;
  }

  if (profile === RP2040_PROFILE) {
    const runtime = state.runtime;
    const artifactIdentity = state.artifact?.uf2Sha256 ?? null;
    const current = runtime && artifactIdentity && runtime.artifactIdentity === artifactIdentity;
    const summary = emptySummary(profile, state, current ? artifactIdentity : null);
    if (current) summary.state = 'current-runtime';
    const cycle = current && Number.isSafeInteger(runtime.cycle) ? runtime.cycle : null;
    const milliseconds = cycle === null ? null : cycle / (runtime.cyclesPerMillisecond || 125_000);
    const serial = current && Array.isArray(runtime.instruments?.serial?.records) ? runtime.instruments.serial : null;
    summary.channels = {
      serial: serial ? observed('recorded-runtime', 'UART0 output from the current rp2040js worker snapshot',
        { records: clone(serial.records), text: serial.text ?? '' }, { cycle, virtualMilliseconds: milliseconds, retained: serial.records.length,
          dropped: serial.dropped ?? 0, limit: 4_096 }) : noValue('No current source-bound UART0 worker snapshot.'),
      gpio: current && ((Array.isArray(runtime.pins) && runtime.pins.some((pin) => pin.pin === 'GPIO0'))
        || runtime.experimental?.gpio0) ? observed('recorded-runtime',
        'GPIO0 state from the current rp2040js worker snapshot',
        { pins: Array.isArray(runtime.pins) && runtime.pins.some((pin) => pin.pin === 'GPIO0')
          ? clone(runtime.pins.filter((pin) => pin.pin === 'GPIO0'))
          : [{ pin: 'GPIO0', ...clone(runtime.experimental.gpio0) }], selectedPin: 'GPIO0' },
        { cycle, virtualMilliseconds: milliseconds, retained: 1, dropped: 0, limit: 1 })
        : noValue('No current source-bound GPIO0 worker snapshot.'),
      logic: noValue('No shared RP2040 logic-analyser evidence is approved.'),
      input: noValue('No public RP2040 runtime input evidence is approved.'),
    };
    return summary;
  }

  if (profile === ESP32C3_PROFILE) {
    const runtime = state.runtime;
    const identity = state.artifact?.flashSha256 ?? null;
    const current = runtime && identity && runtime.flashSha256 === identity;
    const summary = emptySummary(profile, state, current ? identity : null);
    if (current) summary.state = 'current-runtime';
    summary.channels = {
      serial: current && runtime.uart ? observed('recorded-runtime',
        'Actual Espressif QEMU UART output from the current flash execution',
        { text: runtime.uart.exactApplicationText, bootEpochs: runtime.uart.bootEpochs },
        { retained: runtime.uart.markerCount ?? runtime.uart.bootEpochs?.length ?? 0, dropped: 0,
          limit: null, timeBasis: 'reset-epoch-sequence' })
        : noValue('No current source-bound QEMU UART execution.'),
      gpio: current && runtime.modeledCircuit ? observed('project-model',
        'Project-owned GPIO2 register adapter; not QEMU pin state',
        { pins: [{ pin: 'GPIO2', ...(clone(runtime.modeledCircuit.epochs?.at(-1)?.adapter
          ?? runtime.modeledCircuit.epochs?.at(-1)) ?? {}) }], selectedPin: 'GPIO2',
          source: runtime.modeledCircuit.source },
        { retained: runtime.modeledCircuit.epochs?.length ?? 0, dropped: 0, limit: null,
          timeBasis: 'adapter-epoch-sequence' })
        : noValue('No current source-bound GPIO2 project-model result.'),
      logic: noValue('QEMU pin-level logic transitions are unavailable.'),
      input: noValue('No public ESP32-C3 runtime input evidence is available.'),
    };
    return summary;
  }

  const runtime = state.runtime;
  const identity = state.artifact?.sha256 ?? null;
  const current = runtime && identity && runtime.elfSha256 === identity;
  const summary = emptySummary(profile, state, current ? identity : null);
  if (current) summary.state = 'current-runtime';
  summary.channels = {
    serial: current && typeof runtime.observed?.uartText === 'string' ? observed('recorded-runtime',
      'Actual Renode USART3 output from the current ELF execution', { text: runtime.observed.uartText },
      { retained: runtime.bootEpochs ?? 0, dropped: 0, limit: 2, timeBasis: 'reset-epoch-sequence' })
      : noValue('No current source-bound Renode USART3 execution.'),
    gpio: current && typeof runtime.observed?.pb0 === 'boolean' ? observed('recorded-runtime',
      'PB0 level observed by Renode in the current ELF execution',
      { pins: [{ pin: 'PB0', level: runtime.observed.pb0 }], selectedPin: 'PB0' },
      { retained: 1, dropped: 0, limit: 1, timeBasis: 'instruction-order-only' })
      : noValue('No current source-bound Renode PB0 observation.'),
    logic: noValue('No shared STM32 logic-analyser evidence is available.'),
    input: noValue('No public STM32 runtime input evidence is available.'),
  };
  return summary;
}

function serialOutput(value) {
  if (typeof value?.text === 'string') return value.text.replace(/\r\n?/gu, '\n');
  if (!Array.isArray(value?.records)) return '';
  const bytes = value.records
    .filter((record) => record?.direction === 'tx' && Number.isInteger(record.value)
      && record.value >= 0 && record.value <= 255)
    .map((record) => record.value)
    .slice(-16_384);
  if (bytes.length) return new TextDecoder('utf-8', { fatal: false })
    .decode(Uint8Array.from(bytes)).replace(/\r\n?/gu, '\n');
  return value.records.map((record) => typeof record?.text === 'string' ? record.text : '').join('')
    .replace(/\r\n?/gu, '\n');
}

function field(value, classification, unavailableReason) {
  return value === undefined || value === null
    ? { status: 'unavailable', value: null, reason: unavailableReason }
    : { status: 'available', classification, value: clone(value) };
}

/**
 * Build the one browser/UI model used by the visible shared Serial viewer and
 * pin inspector. Clear is deliberately view-local: the accepted summary and
 * worker/runtime state are never modified here.
 */
export function sharedInstrumentView(summary, local = {}) {
  if (!summary || summary.schema !== SHARED_INSTRUMENT_SUMMARY_SCHEMA) return null;
  const identity = `${summary.profile}:${summary.state}:${summary.artifactIdentity ?? 'none'}`;
  const localCurrent = local.identity === identity ? local : { identity, cleared: false, selectedPin: null };
  const serial = summary.channels.serial;
  const gpio = summary.channels.gpio;
  const availablePins = Array.isArray(gpio?.value?.pins) ? clone(gpio.value.pins) : [];
  const requestedPin = localCurrent.selectedPin ?? gpio?.value?.selectedPin ?? availablePins[0]?.pin ?? null;
  const selected = availablePins.find((pin) => pin.pin === requestedPin) ?? availablePins[0] ?? null;
  const classification = gpio?.classification ?? 'unavailable';
  const missing = 'Not exposed by the current runtime evidence for this pin.';
  const c3Model = summary.profile === ESP32C3_PROFILE && classification === 'project-model';
  const mode = selected?.mode ?? (c3Model ? selected?.drive : undefined);
  const level = selected?.level ?? (c3Model && ['high', 'low'].includes(selected?.drive)
    ? selected.drive === 'high' : undefined);
  const voltage = selected?.voltage ?? (c3Model ? selected?.volts : undefined);
  const text = serial?.classification === 'unavailable' ? '' : serialOutput(serial.value);
  return {
    schema: SHARED_INSTRUMENT_VIEW_SCHEMA,
    profile: summary.profile,
    identity,
    state: summary.state,
    artifactIdentity: summary.artifactIdentity,
    serial: {
      classification: serial?.classification ?? 'unavailable',
      provenance: serial?.provenance ?? 'Unavailable.',
      input: summary.profile === AVR_PROFILE
        ? { status: 'available-in-existing-console', reason: 'USART0 RX remains in the existing AVR Serial console.' }
        : { status: 'unavailable', reason: 'RX is not exposed for this bounded profile.' },
      cleared: Boolean(localCurrent.cleared),
      text: localCurrent.cleared ? '' : text,
      retainedTextLength: text.length,
      time: clone(serial?.time ?? { basis: 'unavailable', cycle: null, virtualMilliseconds: null }),
    },
    pin: {
      classification,
      provenance: gpio?.provenance ?? 'Unavailable.',
      options: availablePins.map((pin) => pin.pin),
      selectedPin: selected?.pin ?? null,
      fields: {
        mode: field(mode, classification, missing),
        level: field(level, classification, c3Model
          ? 'Actual QEMU pin level is not observed; no project-model drive is currently available.' : missing),
        voltage: field(voltage, classification, missing),
        pwm: field(selected?.pwm, classification, missing),
        adc: field(selected?.adc, classification, missing),
      },
    },
    local: { identity, cleared: Boolean(localCurrent.cleared), selectedPin: selected?.pin ?? null },
  };
}
