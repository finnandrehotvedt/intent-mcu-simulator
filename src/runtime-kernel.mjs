// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  Atmega328PAdapter,
  SERIAL_LIMIT,
  TRACE_LIMIT,
} from './atmega328p-adapter.mjs';
import { CircuitRuntime } from './circuit-engine.mjs';
import { x35TopologyProjection } from './x35-causal-chain-contract.mjs';
import {
  X47_CANCEL_RECEIPT_SCHEMA,
  X47_EXECUTION_RECEIPT_SCHEMA,
  X47_QUEUE_RECEIPT_SCHEMA,
  canonicalX47ApplyRequest,
  validateX47ApplyRequest,
  validateX47CancelReceipt,
  validateX47ExecutionReceipt,
  validateX47QueueReceipt,
  validateX47RuntimeAuthority,
  validateX47WorkerBinding,
} from './x47-runtime-transaction.mjs';
import { createX43AvrStackTracker } from './x43-avr-stack-profile.mjs';

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

  removePending(predicate) {
    if (typeof predicate !== 'function') throw new TypeError('Invalid input queue removal');
    const removed = this.pending.filter(predicate).map(clone);
    this.pending = this.pending.filter((event) => !predicate(event));
    return removed;
  }

  rollbackTail(sequences) {
    if (!Array.isArray(sequences) || sequences.length === 0
        || sequences.some((value) => !Number.isSafeInteger(value))) throw new TypeError('Invalid rollback');
    const ordered = [...sequences].sort((a, b) => a - b);
    if (ordered.at(-1) !== this.nextSequence - 1
        || ordered.some((value, index) => value !== ordered[0] + index)) throw new Error('INPUT_ROLLBACK_NOT_TAIL');
    const selected = new Set(ordered);
    if (this.applied.some((event) => selected.has(event.sequence))) throw new Error('INPUT_ROLLBACK_APPLIED');
    this.pending = this.pending.filter((event) => !selected.has(event.sequence));
    this.log = this.log.filter((event) => !selected.has(event.sequence));
    this.nextSequence = ordered[0];
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
      ...(options.runtimeIdentity ? { runtimeIdentity: options.runtimeIdentity } : {}),
    });
    this.x43StackTracker = createX43AvrStackTracker({
      pointer: this.adapter.cpu.SP, cycle: this.adapter.cpu.cycles,
      instructions: this.adapter.instructions,
    });
    this.x35Probe = options.x35Probe ?? null;
    this.modelLibraryLock = options.modelLibraryLock ?? null;
    this.modelExecutionContextSha256 = options.modelExecutionContextSha256 ?? null;
    this.circuit = new CircuitRuntime(circuit, {
      ...(this.modelLibraryLock ? { modelLibraryLock: this.modelLibraryLock } : {}),
    });
    this.circuit.applyControls(this.adapter);
    this.inputs = new OrderedInputQueue(options.inputEventLimit ?? INPUT_EVENT_LIMIT);
    this.logicChannels = this.#logicChannels(options.logicChannels ?? ['D13', 'D2']);
    this.selectedPin = options.selectedPin ?? 'D13';
    this.serialHistoryLimit = this.#serialLimit(options.serialHistoryLimit ?? 512);
    this.serialClearAbsolute = 0;
    this.digitalSequenceTailCycle = 0;
    this.x47RuntimeIdentity = options.runtimeIdentity ? clone(options.runtimeIdentity) : null;
    this.x47Authority = options.x47RuntimeAuthority
      ? validateX47RuntimeAuthority(options.x47RuntimeAuthority, this.x47RuntimeIdentity) : null;
    this.x47Transactions = new Map();
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
    const probe = new CircuitRuntime(this.circuit.graph, {
      ...(this.modelLibraryLock ? { modelLibraryLock: this.modelLibraryLock } : {}),
    });
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

  queueX47Transaction(value) {
    if (!this.x47Authority || !this.x47RuntimeIdentity) throw new Error('X47_RUNTIME_AUTHORITY_UNAVAILABLE');
    const existing = typeof value?.transactionId === 'string'
      ? this.x47Transactions.get(value.transactionId) : null;
    if (existing) {
      validateX47WorkerBinding(value.binding, this.x47Authority, this.x47RuntimeIdentity);
      if (existing.canonical !== canonicalX47ApplyRequest(value)) {
        throw new Error('X47_TRANSACTION_ID_CONFLICT');
      }
      if (existing.cancelReceipt) throw new Error('X47_TRANSACTION_CANCELLED');
      return clone(existing.queueReceipt);
    }
    const request = validateX47ApplyRequest(value, {
      authority: this.x47Authority,
      runtimeIdentity: this.x47RuntimeIdentity,
      profile: 'board.atmega328p-16mhz-v1',
      paused: this.adapter.paused,
      currentCycle: this.adapter.cpu.cycles,
      pendingDigitalTailCycle: this.digitalSequenceTailCycle,
    });
    const canonical = canonicalX47ApplyRequest(request);
    const before = this.inputs.snapshot();
    if (before.log.length + request.events.length > before.retention.limit
        || this.x47Transactions.size >= 32) throw new Error('X47_TRANSACTION_RETENTION_LIMIT');
    const predicted = request.events.map((event, eventIndex) => ({
      eventIndex, pin: event.pin, level: event.level, offsetCycles: event.offsetCycles,
      targetCycle: request.expectedBaseCycle + event.offsetCycles,
      queueSequence: this.inputs.nextSequence + eventIndex,
    }));
    const predictedReceipt = {
      schema: X47_QUEUE_RECEIPT_SCHEMA,
      transactionId: request.transactionId,
      canonicalPulseSha256: request.canonicalPulseSha256,
      binding: clone(request.binding),
      baseCycle: request.expectedBaseCycle,
      events: predicted,
      retention: {
        limit: before.retention.limit,
        beforeRequestedRetained: before.retention.requested.retained,
        beforeRequestedDropped: before.retention.requested.dropped,
        afterRequestedRetained: before.retention.requested.retained + request.events.length,
        afterRequestedDropped: before.retention.requested.dropped,
      },
    };
    validateX47QueueReceipt(predictedReceipt, { authority: this.x47Authority,
      runtimeIdentity: this.x47RuntimeIdentity, request });
    const queued = [];
    try {
      for (const [eventIndex, event] of request.events.entries()) {
        const item = this.inputs.enqueue(
          { type: 'digital-scheduled', pin: event.pin, level: event.level,
            transactionId: request.transactionId, eventIndex },
          this.adapter.cpu.cycles, request.expectedBaseCycle + event.offsetCycles,
        );
        queued.push(item);
        this.adapter.scheduleDigital(item.targetCycle, item.pin, item.level,
          { transactionId: request.transactionId, eventIndex });
      }
    } catch (error) {
      this.adapter.cancelX47Transactions([request.transactionId]);
      if (queued.length) this.inputs.rollbackTail(queued.map((event) => event.sequence));
      throw error;
    }
    this.digitalSequenceTailCycle = queued.at(-1).targetCycle;
    const receipt = validateX47QueueReceipt(predictedReceipt, { authority: this.x47Authority,
      runtimeIdentity: this.x47RuntimeIdentity, request });
    this.x47Transactions.set(request.transactionId,
      { canonical, request: clone(request), queueReceipt: clone(receipt), cancelReceipt: null });
    return clone(receipt);
  }

  x47ExecutionReceipt(transactionId) {
    const transaction = this.x47Transactions.get(transactionId);
    if (!transaction) throw new Error('X47_TRANSACTION_UNKNOWN');
    const eventLog = this.inputs.snapshot();
    const adapter = this.adapter.x47DigitalTransitionSnapshot();
    const requested = eventLog.log.filter((event) => event.transactionId === transactionId);
    const drained = eventLog.applied.filter((event) => event.transactionId === transactionId);
    const transitions = adapter.records.filter((event) => event.transactionId === transactionId);
    let discontinuities = eventLog.dropped + eventLog.retention.applied.dropped + adapter.dropped;
    const events = transaction.queueReceipt.events.map((event) => {
      const appliedMatches = drained.filter((item) => item.sequence === event.queueSequence);
      const adapterMatches = transitions.filter((item) => item.eventIndex === event.eventIndex);
      if (appliedMatches.length > 1 || adapterMatches.length > 1) discontinuities += 1;
      const applied = appliedMatches[0] ?? null;
      const observed = adapterMatches[0] ?? null;
      if (observed && (observed.targetCycle !== event.targetCycle || observed.pin !== event.pin
          || observed.level !== event.level)) discontinuities += 1;
      return { ...clone(event), drainAppliedCycle: applied?.appliedCycle ?? null,
        adapterAppliedCycle: observed?.appliedCycle ?? null,
        transitionCycle: observed?.transitionCycle ?? null,
        transitioned: observed?.transitioned ?? null };
    });
    if (requested.length !== 2) discontinuities += Math.abs(2 - requested.length);
    const complete = events.every((event) => event.drainAppliedCycle !== null
      && event.adapterAppliedCycle !== null) && discontinuities === 0;
    return validateX47ExecutionReceipt({
      schema: X47_EXECUTION_RECEIPT_SCHEMA,
      transactionId,
      canonicalPulseSha256: transaction.request.canonicalPulseSha256,
      binding: clone(transaction.request.binding),
      baseCycle: transaction.request.expectedBaseCycle,
      complete,
      events,
      retention: {
        requested: { expected: 2, retained: requested.length, dropped: eventLog.dropped },
        drained: { expected: 2, retained: drained.length, dropped: eventLog.retention.applied.dropped },
        adapter: { expected: 2, retained: transitions.length, dropped: adapter.dropped },
        discontinuities,
      },
    }, { authority: this.x47Authority, runtimeIdentity: this.x47RuntimeIdentity,
      request: transaction.request, queueReceipt: transaction.queueReceipt });
  }

  cancelX47Transactions(reason, transactionId = null, binding = null) {
    if (!this.x47Authority || !this.x47RuntimeIdentity) return [];
    if (binding !== null) validateX47WorkerBinding(binding, this.x47Authority, this.x47RuntimeIdentity);
    const selected = [...this.x47Transactions.entries()].filter(([id, value]) =>
      (transactionId === null || id === transactionId) && !value.cancelReceipt);
    if (transactionId !== null && selected.length === 0) throw new Error('X47_TRANSACTION_UNKNOWN');
    const cycle = this.adapter.cpu.cycles;
    const eventLog = this.inputs.snapshot();
    const adapter = this.adapter.x47DigitalTransitionSnapshot();
    const applied = new Set(eventLog.applied.map((event) => event.sequence));
    const receipts = selected.map(([id, transaction]) => validateX47CancelReceipt({
      schema: X47_CANCEL_RECEIPT_SCHEMA,
      transactionId: id,
      canonicalPulseSha256: transaction.request.canonicalPulseSha256,
      binding: clone(transaction.request.binding),
      baseCycle: transaction.request.expectedBaseCycle,
      reason,
      cancelCycle: cycle,
      state: 'cancelled',
      queuePending: transaction.queueReceipt.events
        .filter((event) => !applied.has(event.queueSequence))
        .map((event) => ({ eventIndex: event.eventIndex, queueSequence: event.queueSequence,
          targetCycle: event.targetCycle })),
      adapterScheduled: adapter.scheduled.filter((event) => event.transactionId === id)
        .map((event) => ({ eventIndex: event.eventIndex, targetCycle: event.targetCycle })),
      adapterApplied: adapter.records.filter((event) => event.transactionId === id)
        .map((event) => ({ eventIndex: event.eventIndex, targetCycle: event.targetCycle,
          appliedCycle: event.appliedCycle, transitioned: event.transitioned,
          transitionCycle: event.transitionCycle })),
      retention: {
        requested: { expected: 2, retained: eventLog.log.filter((event) =>
          event.transactionId === id).length, dropped: eventLog.dropped },
        drained: { expected: 2, retained: eventLog.applied.filter((event) =>
          event.transactionId === id).length, dropped: eventLog.retention.applied.dropped },
        adapter: { expected: 2, retained: adapter.scheduled.filter((event) =>
          event.transactionId === id).length + adapter.records.filter((event) =>
          event.transactionId === id).length, dropped: adapter.dropped },
        discontinuities: eventLog.dropped + eventLog.retention.applied.dropped + adapter.dropped,
      },
      evidenceComplete: eventLog.dropped === 0 && eventLog.retention.applied.dropped === 0
        && adapter.dropped === 0
        && transaction.queueReceipt.events.every((event) => applied.has(event.queueSequence))
        && adapter.scheduled.filter((event) => event.transactionId === id).length === 0
        && adapter.scheduled.filter((event) => event.transactionId === id).length
          + adapter.records.filter((event) => event.transactionId === id).length === 2,
    }, { authority: this.x47Authority, runtimeIdentity: this.x47RuntimeIdentity,
      request: transaction.request, queueReceipt: transaction.queueReceipt }));
    const ids = receipts.map((receipt) => receipt.transactionId);
    const selectedIds = new Set(ids);
    this.inputs.removePending((event) => selectedIds.has(event.transactionId));
    this.adapter.cancelX47Transactions(ids);
    this.digitalSequenceTailCycle = Math.max(this.adapter.cpu.cycles,
      ...this.inputs.pending.filter((event) => event.type === 'digital-scheduled')
        .map((event) => event.targetCycle));
    for (const receipt of receipts) this.x47Transactions.get(receipt.transactionId).cancelReceipt = clone(receipt);
    return clone(receipts);
  }

  x47Snapshot() {
    if (!this.x47Authority) return null;
    return {
      authority: clone(this.x47Authority),
      transactions: [...this.x47Transactions.values()].map((transaction) => ({
        queueReceipt: clone(transaction.queueReceipt),
        executionReceipt: this.x47ExecutionReceipt(transaction.request.transactionId),
        cancelReceipt: transaction.cancelReceipt ? clone(transaction.cancelReceipt) : null,
      })),
    };
  }

  runInstructions(count) {
    this.#flushInputs();
    if (!Number.isInteger(count) || count < 0) throw new Error('Instruction count must be a non-negative integer');
    for (let index = 0; index < count; index += 1) this.#stepAndProjectX35();
    return this.snapshot();
  }

  runUntilCycle(targetCycle, maxInstructions) {
    this.#flushInputs();
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

  step() {
    this.#flushInputs();
    return this.#stepAndProjectX35();
  }

  x37ProbeSnapshot(outputPin = 'D13') { return this.adapter.x37ProbeSnapshot(outputPin); }

  #stepAndProjectX35() {
    const result = this.adapter.step();
    this.x43StackTracker.observe(
      this.adapter.cpu.SP, this.adapter.cpu.cycles, this.adapter.instructions,
    );
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

  startX43StackObservation(token) {
    this.x43StackTracker.start(token);
    return this.snapshot();
  }

  captureX43StackObservation(token) {
    this.x43StackTracker.capture(token);
    return this.snapshot();
  }

  reset() {
    const hadX47Authority = Boolean(this.x47Authority);
    const x47CancellationReceipts = this.cancelX47Transactions('RESET');
    this.adapter.reset();
    this.x43StackTracker = createX43AvrStackTracker({
      pointer: this.adapter.cpu.SP, cycle: this.adapter.cpu.cycles,
      instructions: this.adapter.instructions,
    });
    this.circuit.applyControls(this.adapter);
    this.inputs.reset();
    this.serialClearAbsolute = 0;
    this.digitalSequenceTailCycle = 0;
    this.x47Transactions = new Map();
    this.x47Authority = null;
    return { ...this.snapshot(), ...(hadX47Authority ? { x47CancellationReceipts } : {}) };
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
      x43Stack: this.x43StackTracker.snapshot(),
      ...(this.modelExecutionContextSha256 ? {
        modelExecutionContextSha256: this.modelExecutionContextSha256,
      } : {}),
      circuit: this.circuit.observe(machine),
      eventLog: this.inputs.snapshot(),
      ...(this.x47Authority ? { x47: this.x47Snapshot() } : {}),
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
