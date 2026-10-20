// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';
import {
  X49_ADC_SCHEMA, X49_CASES, X49_CASE_SCHEMA, X49_EVIDENCE_STATE_SCHEMA,
  X49_FIRMWARE_PRODUCER_SCHEMA, X49_FIXTURE_CLASS, X49_INPUT_SCHEMA,
  X49_MODEL_OUTPUT_SCHEMA, X49_PIN_SCHEMA, X49_PROFILE, X49_RETENTION_SCHEMA,
  X49_TIME_SCHEMA,
} from './x49-sensor-offset.mjs';
import {
  X49_PROBE_BYTES, validateX49RuntimeProbe,
} from './x49-instrumented-fixture-contract.mjs';

export const X49_OBSERVER_STATE_SCHEMA = 'intent-mcu-x49-observer-state@1';
export const X49_WRITE_WITNESS_SCHEMA = 'intent-mcu-x49-mailbox-write@1';
const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };
const safeCycle = (value) => Number.isSafeInteger(value) && value >= 0;

function signed16(low, high) {
  const unsigned = low | (high << 8);
  return unsigned & 0x8000 ? unsigned - 0x10000 : unsigned;
}

function validAdc(value, expectedValue) {
  return exactKeys(value, ['schema', 'channel', 'value', 'startCycle', 'completionCycle'])
    && value.schema === X49_ADC_SCHEMA && value.channel === 1 && value.value === expectedValue
    && safeCycle(value.startCycle) && safeCycle(value.completionCycle)
    && value.startCycle <= value.completionCycle;
}

function validPin(value, cycle) {
  return exactKeys(value, ['schema', 'pin', 'mode', 'level', 'observedCycle'])
    && value.schema === X49_PIN_SCHEMA && value.pin === 'D13' && value.mode === 'OUTPUT'
    && typeof value.level === 'boolean' && value.observedCycle === cycle;
}

function validWriteWitness(value) {
  return exactKeys(value, ['schema', 'offset', 'oldValue', 'value', 'mask', 'pc', 'cycle'])
    && value.schema === X49_WRITE_WITNESS_SCHEMA
    && Number.isSafeInteger(value.offset) && value.offset >= 0 && value.offset < X49_PROBE_BYTES
    && [value.oldValue, value.value, value.mask].every((item) =>
      Number.isInteger(item) && item >= 0 && item <= 255)
    && safeCycle(value.pc) && safeCycle(value.cycle);
}

export class X49InstrumentedObserverCore {
  constructor({ probe, caseId, requireWriteWitnesses = false }) {
    const expected = X49_CASES.find((entry) => entry.caseId === caseId);
    if (!expected || typeof requireWriteWitnesses !== 'boolean') reject('X49_OBSERVER_CASE_INVALID');
    this.probe = validateX49RuntimeProbe(probe);
    this.expected = clone(expected);
    this.requireWriteWitnesses = requireWriteWitnesses;
    this.reset();
  }

  reset() {
    this.active = null;
    this.transaction = null;
    this.incompleteReason = null;
    this.sealed = false;
  }

  read(data) {
    const { dataAddress, size } = this.probe.symbol;
    if (!(data instanceof Uint8Array) || dataAddress + size > data.length) {
      reject('X49_RUNTIME_SRAM_INVALID');
    }
    return [...data.slice(dataAddress, dataAddress + size)];
  }

  #incomplete(reason) {
    this.active = null;
    this.incompleteReason = reason;
    this.sealed = true;
  }

  observe({ before, after, pcBefore, pcAfter, cycle, latestAdc, d13,
    writeWitnesses = null }) {
    if (this.sealed) return;
    if (!Array.isArray(before) || !Array.isArray(after)
        || before.length !== X49_PROBE_BYTES || after.length !== X49_PROBE_BYTES
        || !before.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)
        || !after.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)
        || !safeCycle(pcBefore) || !safeCycle(pcAfter) || !safeCycle(cycle)
        || (writeWitnesses !== null && (!Array.isArray(writeWitnesses)
          || writeWitnesses.some((item) => !validWriteWitness(item))))) {
      reject('X49_OBSERVER_INPUT_INVALID');
    }
    const changed = before.flatMap((value, offset) => value === after[offset] ? [] : [offset]);
    const witnessed = writeWitnesses?.map((item) => item.offset) ?? [];
    if (writeWitnesses?.some((item) => item.mask !== 255 || item.pc !== pcBefore
        || item.cycle > cycle || item.oldValue !== before[item.offset]
        || item.value !== after[item.offset]) || new Set(witnessed).size !== witnessed.length) {
      reject('X49_WRITE_WITNESS_INVALID');
    }
    if (this.requireWriteWitnesses && writeWitnesses === null) {
      return this.#incomplete('missing-evidence');
    }
    if (!changed.length && !witnessed.length) return;
    const commitChanged = before[0] !== after[0];
    if (commitChanged) {
      if (this.requireWriteWitnesses && !witnessed.includes(0)) {
        return this.#incomplete('missing-evidence');
      }
      const increment = (after[0] - before[0] + 256) % 256;
      if (increment !== 1 || (before[0] === 255 && after[0] === 0)) {
        return this.#incomplete('truncated-evidence');
      }
      if (after[0] % 2 === 1) {
        if (this.active || !validAdc(latestAdc, this.expected.calculated.adcCount)
            || latestAdc.completionCycle > cycle) return this.#incomplete('missing-evidence');
        this.active = {
          oddCommit: after[0], beginCycle: cycle, adc: clone(latestAdc), changed: new Set(),
        };
        return;
      }
      if (!this.active || after[0] !== this.active.oddCommit + 1) {
        return this.#incomplete('truncated-evidence');
      }
      if (![1, 2, 3].every((offset) => this.active.changed.has(offset))) {
        return this.#incomplete('truncated-evidence');
      }
      if (!validAdc(latestAdc, this.expected.calculated.adcCount)
          || latestAdc.completionCycle !== this.active.adc.completionCycle
          || !validPin(d13, cycle)) return this.#incomplete('dropped-evidence');
      this.transaction = Object.freeze({
        schema: X49_FIRMWARE_PRODUCER_SCHEMA, fixtureClass: X49_FIXTURE_CLASS,
        sourceSha256: this.probe.sourceSha256, artifactIdentity: this.probe.artifactIdentity,
        commit: after[0], temperatureC: signed16(after[1], after[2]), d13Level: after[3],
        adcChannel: this.active.adc.channel, adcValue: this.active.adc.value,
        adcCompletionCycle: this.active.adc.completionCycle,
        beginCycle: this.active.beginCycle, commitCycle: cycle,
      });
      this.pin = clone(d13);
      this.adc = clone(this.active.adc);
      this.active = null;
      this.sealed = true;
      return;
    }
    if (this.active) {
      const offsets = this.requireWriteWitnesses ? witnessed : changed;
      for (const offset of offsets) if (offset > 0) this.active.changed.add(offset);
    }
  }

  retainSample(pin) {
    if (!this.transaction || !this.sealed || !validPin(pin, pin?.observedCycle)) {
      reject('X49_OBSERVER_SAMPLE_INVALID');
    }
    if (pin.observedCycle < this.transaction.commitCycle) reject('X49_OBSERVER_SAMPLE_INVALID');
    this.pin = clone(pin);
    return clone(this.pin);
  }

  observation({ input, modelOutput, runtimeBinding, runtimeIdentity, time, retention,
    incompleteReason = null }) {
    if (!exactKeys(arguments[0], ['input', 'modelOutput', 'runtimeBinding', 'runtimeIdentity',
      'time', 'retention', 'incompleteReason'])) reject('X49_OBSERVER_FINALIZE_INVALID');
    const reason = incompleteReason ?? this.incompleteReason
      ?? (this.transaction ? null : 'missing-evidence');
    return {
      schema: X49_CASE_SCHEMA, caseId: this.expected.caseId, profile: X49_PROFILE,
      input: clone(input), modelOutput: clone(modelOutput), runtimeBinding: clone(runtimeBinding),
      runtimeIdentity: clone(runtimeIdentity), adc: this.adc ? clone(this.adc) : null,
      firmwareTransaction: this.transaction ? clone(this.transaction) : null,
      pin: this.pin ? clone(this.pin) : null, time: clone(time), retention: clone(retention),
      evidence: { schema: X49_EVIDENCE_STATE_SCHEMA,
        state: reason === null ? 'complete' : 'incomplete', reason },
    };
  }

  snapshot() {
    return {
      schema: X49_OBSERVER_STATE_SCHEMA, caseId: this.expected.caseId,
      inputIdentity: this.expected.inputIdentity, expectedAdcValue: this.expected.calculated.adcCount,
      witnessedOdd: Boolean(this.active) || Boolean(this.transaction),
      completed: Boolean(this.transaction), incompleteReason: this.incompleteReason,
      sealed: this.sealed, requireWriteWitnesses: this.requireWriteWitnesses,
      nativeEvidence: false,
    };
  }
}

export const X49_OBSERVER_LIMITS = Object.freeze({
  pureUnconnectedCore: true,
  adapterImported: false,
  workerImported: false,
  syntheticTraceIsNativeEvidence: false,
  maximumTransactions: 1,
  commitWrapAccepted: false,
});
