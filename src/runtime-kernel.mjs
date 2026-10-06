// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { Atmega328PAdapter } from './atmega328p-adapter.mjs';
import { CircuitRuntime } from './circuit-engine.mjs';

export const INPUT_EVENT_LIMIT = 10_000;
const LOGIC_TRANSITION_LIMIT = 100_000;
const LOGIC_CHANNEL_LIMIT = 8;
const SERIAL_HISTORY_MAX = 4_096;

const clone = (value) => structuredClone(value);

function validateCycle(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

export class OrderedInputQueue {
  constructor(limit = INPUT_EVENT_LIMIT) {
    if (!Number.isInteger(limit) || limit < 1 || limit > INPUT_EVENT_LIMIT) throw new TypeError('Invalid input event limit');
    this.limit = limit;
    this.nextSequence = 1;
    this.pending = [];
    this.log = [];
    this.dropped = 0;
  }

  enqueue(event, currentCycle, targetCycle = currentCycle) {
    if (!event || typeof event !== 'object' || Array.isArray(event)
        || !validateCycle(currentCycle) || !validateCycle(targetCycle, currentCycle)) {
      throw new TypeError('Invalid scheduled input event');
    }
    if (this.log.length >= this.limit) throw new Error('INPUT_EVENT_LIMIT');
    const normalized = clone({ sequence: this.nextSequence++, targetCycle, ...event });
    this.pending.push(normalized);
    this.pending.sort((left, right) => left.targetCycle - right.targetCycle || left.sequence - right.sequence);
    this.log.push(normalized);
    return clone(normalized);
  }

  drainThrough(cycle, apply) {
    if (!validateCycle(cycle) || typeof apply !== 'function') throw new TypeError('Invalid input queue drain');
    const applied = [];
    while (this.pending.length && this.pending[0].targetCycle <= cycle) {
      const event = this.pending.shift();
      apply(event);
      applied.push(clone(event));
    }
    return applied;
  }

  reset() {
    this.nextSequence = 1;
    this.pending = [];
    this.log = [];
    this.dropped = 0;
  }

  snapshot() {
    return { pending: clone(this.pending), log: clone(this.log), dropped: this.dropped };
  }
}

function byteText(value) {
  if (value === 10) return '\n';
  if (value === 13) return '\r';
  if (value >= 32 && value <= 126) return String.fromCharCode(value);
  return `\\x${value.toString(16).padStart(2, '0')}`;
}

export class RuntimeKernel {
  constructor(hex, circuit, options = {}) {
    this.adapter = new Atmega328PAdapter(hex, { speed: options.speed ?? 1 });
    this.circuit = new CircuitRuntime(circuit);
    this.circuit.applyControls(this.adapter);
    this.inputs = new OrderedInputQueue(options.inputEventLimit ?? INPUT_EVENT_LIMIT);
    this.logicChannels = this.#logicChannels(options.logicChannels ?? ['D13', 'D2']);
    this.selectedPin = options.selectedPin ?? 'D13';
    this.serialHistoryLimit = this.#serialLimit(options.serialHistoryLimit ?? 512);
    this.serialClearAbsolute = 0;
  }

  #serialLimit(value) {
    if (!Number.isInteger(value) || value < 16 || value > SERIAL_HISTORY_MAX) throw new TypeError('Invalid serial history limit');
    return value;
  }

  #logicChannels(value) {
    if (!Array.isArray(value) || value.length > LOGIC_CHANNEL_LIMIT
        || value.some((pin) => !/^D(?:[0-9]|1[0-3])$/.test(pin)) || new Set(value).size !== value.length) {
      throw new TypeError('Invalid logic channels');
    }
    return [...value];
  }

  setLogicChannels(channels) {
    this.logicChannels = this.#logicChannels(channels);
    return [...this.logicChannels];
  }

  #applyInput(event) {
    if (event.type === 'control') {
      this.circuit.setControl(event.componentId, event.key, event.value, this.adapter);
      return;
    }
    if (event.type === 'uart-rx') {
      this.adapter.scheduleUartRx(event.targetCycle, event.value);
      return;
    }
    throw new Error(`Unsupported input event: ${event.type}`);
  }

  #flushInputs() {
    return this.inputs.drainThrough(this.adapter.cpu.cycles, (event) => this.#applyInput(event));
  }

  queueControl(componentId, key, value) {
    const probe = new CircuitRuntime(this.circuit.graph);
    probe.controls = clone(this.circuit.controls);
    probe.setControl(componentId, key, value, { setDigitalPin() {}, setAnalogChannel() {} });
    const event = this.inputs.enqueue(
      { type: 'control', componentId, key, value: clone(value) }, this.adapter.cpu.cycles,
    );
    this.#flushInputs();
    return event;
  }

  queueUartRx(value) {
    if (!Number.isInteger(value) || value < 0 || value > 255) throw new TypeError('UART byte must be 0..255');
    const event = this.inputs.enqueue({ type: 'uart-rx', value }, this.adapter.cpu.cycles);
    this.#flushInputs();
    return event;
  }

  runInstructions(count) {
    this.#flushInputs();
    return this.adapter.runInstructions(count);
  }

  runUntilCycle(targetCycle, maxInstructions) {
    this.#flushInputs();
    return this.adapter.runUntilCycle(targetCycle, maxInstructions);
  }

  step() {
    this.#flushInputs();
    return this.adapter.step();
  }

  run() { this.adapter.run(); }
  pause() { this.adapter.pause(); }
  setSpeed(speed) { this.adapter.setSpeed(speed); }

  clearSerialView() {
    this.serialClearAbsolute = this.adapter.retentionDrops.serial + this.adapter.serial.length;
  }

  reset() {
    this.adapter.reset();
    this.circuit.applyControls(this.adapter);
    this.inputs.reset();
    this.serialClearAbsolute = 0;
    return this.snapshot();
  }

  snapshot() {
    const machine = this.adapter.snapshot();
    const serialStartAbsolute = machine.retentionDrops.serial;
    const serialOffset = Math.max(0, this.serialClearAbsolute - serialStartAbsolute);
    const serialAfterClear = machine.serial.slice(serialOffset);
    const viewDrops = Math.max(0, serialAfterClear.length - this.serialHistoryLimit);
    const serialRecords = serialAfterClear.slice(-this.serialHistoryLimit);
    const selectedNumbers = new Set(this.logicChannels.map((pin) => Number(pin.slice(1))));
    const logicTransitions = machine.trace
      .filter((entry) => typeof entry.pin === 'number' && selectedNumbers.has(entry.pin))
      .slice(-LOGIC_TRANSITION_LIMIT)
      .map((entry) => ({ ...entry, pin: `D${entry.pin}` }));
    const pin = machine.pins.find((entry) => entry.pin === this.selectedPin) ?? null;
    return {
      ...machine,
      circuit: this.circuit.observe(machine),
      eventLog: this.inputs.snapshot(),
      instruments: {
        serial: {
          records: serialRecords.map((entry) => ({
            ...entry,
            virtualMilliseconds: entry.cycle / 16_000,
            text: Number.isInteger(entry.value) ? byteText(entry.value) : '',
          })),
          text: serialRecords.filter((entry) => entry.direction === 'tx').map((entry) => byteText(entry.value)).join(''),
          retained: serialRecords.length,
          dropped: machine.retentionDrops.serial + viewDrops,
          machineDropped: machine.retentionDrops.serial,
          viewDropped: viewDrops,
        },
        logic: {
          channels: [...this.logicChannels],
          transitions: logicTransitions,
          dropped: machine.retentionDrops.logic,
        },
        pin: pin ? clone(pin) : null,
      },
    };
  }
}
