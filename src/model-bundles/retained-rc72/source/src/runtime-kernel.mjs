// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  Atmega328PAdapter,
  SERIAL_LIMIT,
  TRACE_LIMIT,
} from './atmega328p-adapter.mjs';
import { CircuitRuntime } from './circuit-engine.mjs';
import { x35TopologyProjection } from './x35-causal-chain-contract.mjs';

export const INPUT_EVENT_LIMIT = 10_000;
export const LOGIC_TRANSITION_LIMIT = TRACE_LIMIT;
export const LOGIC_CHANNEL_LIMIT = 8;
export const SERIAL_HISTORY_MAX = SERIAL_LIMIT;
const DIGITAL_SEQUENCE_EVENT_MAX = 8;
const DIGITAL_SEQUENCE_OFFSET_MAX = 1_600_000;

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
    this.applied = [];
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
      const event = this.pending[0];
      apply(clone(event));
      this.pending.shift();
      const record = clone({ ...event, appliedCycle: cycle });
      this.applied.push(record);
      applied.push(clone(record));
    }
    return applied;
  }

  reset() {
    this.nextSequence = 1;
    this.pending = [];
    this.log = [];
    this.applied = [];
    this.dropped = 0;
  }

  snapshot() {
    return {
      pending: clone(this.pending),
      log: clone(this.log),
      applied: clone(this.applied),
      dropped: this.dropped,
      retention: {
        limit: this.limit,
        requested: { retained: this.log.length, dropped: this.dropped },
        applied: { retained: this.applied.length, dropped: 0 },
      },
    };
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
    this.adapter = new Atmega328PAdapter(hex, {
      speed: options.speed ?? 1,
      ...(options.x34Probe ? { x34Probe: options.x34Probe } : {}),
      ...(options.x35Probe ? { x35Probe: options.x35Probe } : {}),
    });
    this.x35Probe = options.x35Probe ?? null;
    this.circuit = new CircuitRuntime(circuit);
    this.circuit.applyControls(this.adapter);
    this.inputs = new OrderedInputQueue(options.inputEventLimit ?? INPUT_EVENT_LIMIT);
    this.logicChannels = this.#logicChannels(options.logicChannels ?? ['D13', 'D2']);
    this.selectedPin = options.selectedPin ?? 'D13';
    this.serialHistoryLimit = this.#serialLimit(options.serialHistoryLimit ?? 512);
    this.serialClearAbsolute = 0;
    this.digitalSequenceTailCycle = 0;
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
    if (event.type === 'uart-rx-scheduled') return;
    if (event.type === 'digital-scheduled') return;
    if (event.type === 'fault-request') return;
    throw new Error(`Unsupported input event: ${event.type}`);
  }

  #flushInputs() {
    return this.inputs.drainThrough(this.adapter.cpu.cycles, (event) => this.#applyInput(event));
  }

  queueControl(componentId, key, value) {
    return this.queueControlAtCycle(componentId, key, value, this.adapter.cpu.cycles);
  }

  queueControlAtCycle(componentId, key, value, targetCycle) {
    const probe = new CircuitRuntime(this.circuit.graph);
    probe.controls = clone(this.circuit.controls);
    probe.setControl(componentId, key, value, { setDigitalPin() {}, setAnalogChannel() {} });
    const event = this.inputs.enqueue(
      { type: 'control', componentId, key, value: clone(value) }, this.adapter.cpu.cycles, targetCycle,
    );
    this.#flushInputs();
    return event;
  }

  queueFaultAtCycle(value, targetCycle) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || !validateCycle(targetCycle, this.adapter.cpu.cycles)
        || !['fault.button-bounce-v1', 'fault.temperature-stuck-v1',
          'fault.button-open-circuit-v1'].includes(value.kind)
        || typeof value.id !== 'string') throw new TypeError('INVALID_FAULT_REQUEST');
    const event = this.inputs.enqueue(
      { type: 'fault-request', event: clone(value) }, this.adapter.cpu.cycles, targetCycle,
    );
    if (value.kind === 'fault.button-bounce-v1') {
      if (value.componentId !== 'enable-button-1' || value.finalPressed !== true
          || JSON.stringify(value.patternMilliseconds) !== JSON.stringify([0, 2, 4, 6, 8])) {
        throw new TypeError('INVALID_BUTTON_BOUNCE_FAULT');
      }
      this.adapter.scheduleButtonBounce(targetCycle, 2, value.id, value.patternMilliseconds);
    } else if (value.kind === 'fault.temperature-stuck-v1') {
      if (value.componentId !== 'temperature-sensor-1' || !Number.isInteger(value.stuckValueC)
          || value.stuckValueC < -50 || value.stuckValueC > 150) {
        throw new TypeError('INVALID_TEMPERATURE_STUCK_FAULT');
      }
      this.adapter.scheduleAnalogStuck(targetCycle, 1, value.stuckValueC, value.id);
    } else {
      if (value.componentId !== 'enable-button-1') throw new TypeError('INVALID_BUTTON_OPEN_FAULT');
      this.adapter.scheduleDigitalRelease(targetCycle, 2, value.id);
    }
    this.#flushInputs();
    return event;
  }

  queueUartRx(value) {
    if (!Number.isInteger(value) || value < 0 || value > 255) throw new TypeError('UART byte must be 0..255');
    const event = this.inputs.enqueue({ type: 'uart-rx', value }, this.adapter.cpu.cycles);
    this.#flushInputs();
    return event;
  }

  queueUartRxAfterCycles(value, delayCycles) {
    if (!Number.isInteger(value) || value < 0 || value > 255) throw new TypeError('UART byte must be 0..255');
    if (!Number.isSafeInteger(delayCycles) || delayCycles < 1 || delayCycles > 1_000_000) {
      throw new TypeError('UART delay must be 1..1000000 cycles');
    }
    const event = this.inputs.enqueue(
      { type: 'uart-rx-scheduled', value }, this.adapter.cpu.cycles,
      this.adapter.cpu.cycles + delayCycles,
    );
    this.adapter.scheduleUartRx(event.targetCycle, value);
    return event;
  }

  queueDigitalSequence(events) {
    if (!Array.isArray(events) || events.length < 1 || events.length > DIGITAL_SEQUENCE_EVENT_MAX
        || this.inputs.log.length + events.length > this.inputs.limit) {
      throw new TypeError('INVALID_DIGITAL_SEQUENCE');
    }
    let priorOffset = 0;
    const normalized = events.map((event) => {
      if (!event || typeof event !== 'object' || Array.isArray(event)
          || Object.keys(event).sort().join('|') !== 'level|offsetCycles|pin'
          || !Number.isSafeInteger(event.offsetCycles) || event.offsetCycles <= priorOffset
          || event.offsetCycles > DIGITAL_SEQUENCE_OFFSET_MAX
          || !Number.isInteger(event.pin) || event.pin < 0 || event.pin > 13
          || typeof event.level !== 'boolean') throw new TypeError('INVALID_DIGITAL_SEQUENCE');
      priorOffset = event.offsetCycles;
      return { offsetCycles: event.offsetCycles, pin: event.pin, level: event.level };
    });
    const baseCycle = Math.max(this.adapter.cpu.cycles, this.digitalSequenceTailCycle);
    const queued = normalized.map((event) => this.inputs.enqueue(
      { type: 'digital-scheduled', pin: event.pin, level: event.level },
      this.adapter.cpu.cycles,
      baseCycle + event.offsetCycles,
    ));
    for (const event of queued) this.adapter.scheduleDigital(event.targetCycle, event.pin, event.level);
    this.digitalSequenceTailCycle = queued.at(-1).targetCycle;
    return clone(queued);
  }

  runInstructions(count) {
    this.#flushInputs();
    if (this.adapter.x35Enabled) {
      if (!Number.isInteger(count) || count < 0) throw new Error('Instruction count must be a non-negative integer');
      for (let index = 0; index < count; index += 1) this.#stepAndProjectX35();
      return this.snapshot();
    }
    return this.adapter.runInstructions(count);
  }

  runUntilCycle(targetCycle, maxInstructions) {
    this.#flushInputs();
    if (this.adapter.x35Enabled) {
      if (!Number.isSafeInteger(targetCycle) || targetCycle < this.adapter.cpu.cycles) {
        throw new Error('Target cycle is invalid');
      }
      let count = 0;
      while (this.adapter.cpu.cycles < targetCycle) {
        this.#stepAndProjectX35(); count += 1;
        if (count >= (maxInstructions ?? 100_000_000)) throw new Error('Instruction slice limit reached');
      }
      return this.snapshot();
    }
    return this.adapter.runUntilCycle(targetCycle, maxInstructions);
  }

  step() {
    this.#flushInputs();
    return this.#stepAndProjectX35();
  }

  #stepAndProjectX35() {
    const result = this.adapter.step();
    if (this.adapter.x35ProjectionPending) {
      const machine = this.adapter.snapshot();
      this.adapter.projectX35(x35TopologyProjection(
        this.circuit.graph, this.circuit.observe(machine), this.x35Probe,
      ));
    }
    return result;
  }

  run() { this.adapter.run(); }
  pause() { this.adapter.pause(); }
  setSpeed(speed) { this.adapter.setSpeed(speed); }

  clearSerialView() {
    this.serialClearAbsolute = this.adapter.retentionDrops.serial + this.adapter.serial.length;
  }

  sample() {
    return this.snapshot();
  }

  reset() {
    this.adapter.reset();
    this.circuit.applyControls(this.adapter);
    this.inputs.reset();
    this.serialClearAbsolute = 0;
    this.digitalSequenceTailCycle = 0;
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
