// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { Atmega328PAdapter } from './atmega328p-adapter.mjs';
import {
  X49InstrumentedObserverCore, X49_WRITE_WITNESS_SCHEMA,
} from './x49-instrumented-observer-core.mjs';
import { X49_VIRTUAL_WINDOW } from './x49-sensor-offset.mjs';
import { X49_PRIVATE_WRITE_LIMIT } from './x49-private-runtime-contract.mjs';

const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };

function adcObservation(value) {
  if (!value || value.channel !== 1 || !Number.isSafeInteger(value.startCycle)
      || !Number.isSafeInteger(value.completionCycle) || !Number.isInteger(value.value)) return null;
  return { schema: 'intent-mcu-x49-adc-observation@1', channel: 1, value: value.value,
    startCycle: value.startCycle, completionCycle: value.completionCycle };
}

function d13Observation(adapter) {
  const value = adapter.pinSnapshot().find((item) => item.pin === 'D13');
  if (!value || typeof value.level !== 'boolean' || value.mode !== 'OUTPUT') return null;
  return { schema: 'intent-mcu-x49-pin-observation@1', pin: 'D13', mode: 'OUTPUT',
    level: value.level, observedCycle: adapter.cpu.cycles };
}

export class X49PrivateInstrumentedRuntime {
  constructor({ hex, probe, caseId, adapterFactory = (source) => new Atmega328PAdapter(source) }) {
    if (typeof adapterFactory !== 'function') reject('X49_PRIVATE_ADAPTER_FACTORY_INVALID');
    this.adapter = adapterFactory(hex);
    if (!this.adapter?.cpu?.data || !Array.isArray(this.adapter.cpu.writeHooks)
        || typeof this.adapter.step !== 'function' || typeof this.adapter.setAnalogChannel !== 'function'
        || typeof this.adapter.setDigitalPin !== 'function' || typeof this.adapter.pinSnapshot !== 'function') {
      reject('X49_PRIVATE_ADAPTER_INVALID');
    }
    this.observer = new X49InstrumentedObserverCore({ probe, caseId, requireWriteWitnesses: true });
    this.probe = clone(probe);
    this.expected = clone(this.observer.expected);
    if (JSON.stringify(this.observer.read(this.adapter.cpu.data)) !== JSON.stringify([0, 0, 128, 255])) {
      reject('X49_PRIVATE_MAILBOX_SENTINEL_INVALID');
    }
    this.inputAppliedCycle = this.adapter.cpu.cycles;
    if (this.inputAppliedCycle !== 0) reject('X49_PRIVATE_INPUT_CYCLE_INVALID');
    this.adapter.setAnalogChannel(1, this.expected.calculated.modelVoltage);
    this.adapter.setDigitalPin(2, false);
    this.priorHooks = [];
    this.stepWrites = [];
    this.retainedWrites = [];
    this.hooksInstalled = false;
    this.transactionCaptured = false;
    this.terminal = null;
    this.disposed = false;
    this.#installHooks();
  }

  #installHooks() {
    const base = this.probe.symbol.dataAddress;
    for (let offset = 0; offset < this.probe.symbol.size; offset += 1) {
      const address = base + offset;
      const prior = this.adapter.cpu.writeHooks[address] ?? null;
      this.priorHooks.push({ address, prior });
      this.adapter.cpu.writeHooks[address] = (value, oldValue, writtenAddress, mask) => {
        if (this.retainedWrites.length >= X49_PRIVATE_WRITE_LIMIT) {
          this.#finish('incomplete', 'dropped-evidence', null);
        } else if (!this.terminal) {
          const witness = { schema: X49_WRITE_WITNESS_SCHEMA, offset, oldValue, value, mask,
            pc: this.adapter.cpu.pc, cycle: this.adapter.cpu.cycles };
          this.stepWrites.push(witness); this.retainedWrites.push(witness);
        }
        return prior ? prior(value, oldValue, writtenAddress, mask) : false;
      };
    }
    this.hooksInstalled = true;
  }

  #removeHooks() {
    if (!this.hooksInstalled) return;
    for (const { address, prior } of this.priorHooks) {
      if (prior) this.adapter.cpu.writeHooks[address] = prior;
      else delete this.adapter.cpu.writeHooks[address];
    }
    this.hooksInstalled = false;
  }

  #evidence(pin) {
    return {
      caseId: this.expected.caseId,
      inputIdentity: this.expected.inputIdentity,
      inputAppliedCycle: this.inputAppliedCycle,
      inputRetainedThroughCycle: this.adapter.cpu.cycles,
      adc: this.observer.adc ? clone(this.observer.adc) : null,
      firmwareTransaction: this.observer.transaction ? clone(this.observer.transaction) : null,
      pin: pin ? clone(pin) : null,
      time: { cpuCycles: this.adapter.cpu.cycles,
        virtualMilliseconds: (this.adapter.cpu.cycles / X49_VIRTUAL_WINDOW.cpuHertz) * 1000 },
      retention: {
        completeThroughCycle: this.adapter.cpu.cycles,
        droppedTraceRows: this.adapter.retentionDrops?.logic ?? 0,
        droppedAdcCompletions: this.adapter.retentionDrops?.adc ?? 0,
        droppedMailboxTransactions: 0,
        retainedMailboxWrites: this.retainedWrites.length,
        mailboxWriteLimit: X49_PRIVATE_WRITE_LIMIT,
      },
    };
  }

  #finish(state, reason, evidence) {
    if (this.terminal) return { terminal: clone(this.terminal), newlyTerminal: false };
    this.#removeHooks();
    this.terminal = Object.freeze({ state, reason, evidence: evidence ? clone(evidence) : null });
    return { terminal: clone(this.terminal), newlyTerminal: true };
  }

  step() {
    if (this.disposed) reject('X49_PRIVATE_RUNTIME_DISPOSED');
    if (this.terminal) return { terminal: clone(this.terminal), newlyTerminal: false };
    this.stepWrites = [];
    const before = this.observer.read(this.adapter.cpu.data);
    const pcBefore = this.adapter.cpu.pc;
    const result = this.adapter.step();
    if (this.terminal) return { terminal: clone(this.terminal), newlyTerminal: true };
    const after = this.observer.read(this.adapter.cpu.data);
    const latest = [...(this.adapter.adcReads ?? [])].reverse()
      .find((item) => item.channel === 1 && item.completionCycle !== null);
    const latestAdc = adcObservation(latest);
    const pin = d13Observation(this.adapter);
    this.observer.observe({ before, after, pcBefore, pcAfter: result?.pcAfter ?? this.adapter.cpu.pc,
      cycle: this.adapter.cpu.cycles, latestAdc, d13: pin,
      writeWitnesses: this.stepWrites.map(clone) });
    const observed = this.observer.snapshot();
    if (observed.incompleteReason) {
      return this.#finish('incomplete', observed.incompleteReason, this.#evidence(pin));
    }
    if (observed.completed && !this.transactionCaptured) {
      this.transactionCaptured = true;
      this.#removeHooks();
    }
    if (this.adapter.cpu.cycles > X49_VIRTUAL_WINDOW.maximumCycles) {
      return this.#finish('incomplete', 'window-expired', this.#evidence(pin));
    }
    if (this.transactionCaptured && this.adapter.cpu.cycles >= X49_VIRTUAL_WINDOW.minimumCycles) {
      if (!pin) return this.#finish('incomplete', 'missing-evidence', this.#evidence(null));
      this.observer.retainSample(pin);
      const evidence = this.#evidence(pin);
      if (evidence.retention.droppedTraceRows || evidence.retention.droppedAdcCompletions) {
        return this.#finish('incomplete', 'dropped-evidence', evidence);
      }
      return this.#finish('complete', null, evidence);
    }
    return { terminal: null, newlyTerminal: false };
  }

  runSlice(limit) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100_000) reject('X49_PRIVATE_SLICE_INVALID');
    for (let index = 0; index < limit && !this.terminal; index += 1) this.step();
    return this.terminal ? clone(this.terminal) : null;
  }

  cancel(reason = 'cancelled') {
    if (!['cancelled', 'infrastructure-failure'].includes(reason)) reject('X49_PRIVATE_CANCEL_INVALID');
    return this.#finish('incomplete', reason, this.#evidence(d13Observation(this.adapter)));
  }

  dispose() {
    const result = this.terminal
      ? { terminal: clone(this.terminal), newlyTerminal: false }
      : this.cancel('cancelled');
    this.#removeHooks();
    this.disposed = true;
    this.adapter = null;
    return result;
  }

  snapshot() {
    return { caseId: this.expected.caseId, inputIdentity: this.expected.inputIdentity,
      cycle: this.adapter?.cpu?.cycles ?? null, transactionCaptured: this.transactionCaptured,
      retainedMailboxWrites: this.retainedWrites.length, hooksInstalled: this.hooksInstalled,
      disposed: this.disposed, terminal: this.terminal ? clone(this.terminal) : null };
  }
}
