// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';
import {
  X34_FIXTURE_ID, X34_MAX_COMPLETED_TRANSACTIONS, X34_PROBE_BYTES, X34_PROBE_SYMBOL,
} from './x34-precision-fixture.mjs';

export const X34_RUNTIME_PROBE_SCHEMA = 'intent-mcu-x34-runtime-probe@1';
export const X34_OBSERVATION_SCHEMA = 'intent-mcu-x34-firmware-producer@1';
const HASH = /^[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
const SRAM_START = 0x100;
const SRAM_END = 0x900;
const clone = (value) => structuredClone(value);

function reject(code) { throw Object.assign(new Error(code), { code }); }
function validBinding(value) {
  return exactKeys(value, [
    'schema', 'projectGeneration', 'runtimeGeneration', 'artifactIdentity', 'workerInitialization',
    'workerInstanceNonce',
  ]) && value.schema === 'intent-mcu-worker-runtime-identity@1'
    && Number.isSafeInteger(value.projectGeneration) && value.projectGeneration >= 1
    && Number.isSafeInteger(value.runtimeGeneration) && value.runtimeGeneration >= 1
    && HASH.test(value.artifactIdentity)
    && Number.isSafeInteger(value.workerInitialization) && value.workerInitialization >= 1
    && NONCE.test(value.workerInstanceNonce);
}

export function validateX34RuntimeProbe(value) {
  if (!exactKeys(value, ['schema', 'fixtureId', 'sourceSha256', 'artifactIdentity', 'symbol'])
      || value.schema !== X34_RUNTIME_PROBE_SCHEMA || value.fixtureId !== X34_FIXTURE_ID
      || !HASH.test(value.sourceSha256) || !HASH.test(value.artifactIdentity)
      || !exactKeys(value.symbol, ['symbol', 'dataAddress', 'size', 'elfSha256', 'binding', 'type'])
      || value.symbol.symbol !== X34_PROBE_SYMBOL || value.symbol.size !== X34_PROBE_BYTES
      || value.symbol.binding !== 'global' || value.symbol.type !== 'object'
      || !HASH.test(value.symbol.elfSha256)
      || !Number.isSafeInteger(value.symbol.dataAddress)
      || value.symbol.dataAddress < SRAM_START
      || value.symbol.dataAddress + value.symbol.size > SRAM_END) reject('X34_RUNTIME_PROBE_INVALID');
  return clone(value);
}

function signed16(low, high) {
  const unsigned = low | (high << 8);
  return unsigned & 0x8000 ? unsigned - 0x10000 : unsigned;
}

export class X34PrecisionObserver {
  constructor(probe) {
    this.probe = validateX34RuntimeProbe(probe);
    this.reset();
  }

  reset() {
    this.active = null;
    this.completed = [];
    this.rejected = null;
    this.sealed = false;
  }

  read(data) {
    const { dataAddress, size } = this.probe.symbol;
    if (!(data instanceof Uint8Array) || dataAddress + size > data.length) reject('X34_RUNTIME_SRAM_INVALID');
    return [...data.slice(dataAddress, dataAddress + size)];
  }

  #fail(code) {
    this.rejected = code;
    this.active = null;
    this.sealed = true;
  }

  observe({ before, after, pcBefore, pcAfter, cycle, latestAdc, d13 }) {
    if (this.sealed || this.rejected) return;
    if (!Array.isArray(before) || !Array.isArray(after)
        || before.length !== X34_PROBE_BYTES || after.length !== X34_PROBE_BYTES
        || !before.every(Number.isInteger) || !after.every(Number.isInteger)
        || !Number.isSafeInteger(pcBefore) || !Number.isSafeInteger(pcAfter)
        || !Number.isSafeInteger(cycle)) return this.#fail('X34_OBSERVER_INPUT_INVALID');
    const changedOffsets = before.flatMap((value, offset) => value === after[offset] ? [] : [offset]);
    if (!changedOffsets.length) return;
    const write = { pcBefore, pcAfter, cycle, changedOffsets, before, after };
    const commitChanged = before[0] !== after[0];
    if (commitChanged) {
      const increment = (after[0] - before[0] + 256) % 256;
      if (increment !== 1) return this.#fail('X34_COMMIT_SEQUENCE_INVALID');
      if (before[0] === 255 && after[0] === 0) return this.#fail('X34_COMMIT_WRAP');
      if (after[0] % 2 === 1) {
        if (this.active || this.completed.length >= X34_MAX_COMPLETED_TRANSACTIONS
            || !latestAdc || latestAdc.channel !== 1 || latestAdc.value !== 414
            || !Number.isSafeInteger(latestAdc.startCycle)
            || !Number.isSafeInteger(latestAdc.completionCycle)
            || latestAdc.completionCycle > cycle) return this.#fail('X34_ODD_BEGIN_INVALID');
        this.active = {
          oddCommit: after[0], beginPc: pcBefore, beginCycle: cycle,
          adc: clone(latestAdc), writes: [write], changed: new Set(),
        };
        return;
      }
      if (!this.active || after[0] !== this.active.oddCommit + 1) {
        return this.#fail('X34_EVEN_WITHOUT_WITNESSED_ODD');
      }
      this.active.writes.push(write);
      if (![1, 2, 3].every((offset) => this.active.changed.has(offset))
          || !latestAdc || latestAdc.completionCycle !== this.active.adc.completionCycle
          || latestAdc.value !== this.active.adc.value
          || d13?.pin !== 'D13' || d13.mode !== 'OUTPUT' || typeof d13.level !== 'boolean') {
        return this.#fail('X34_TRANSACTION_INCOMPLETE');
      }
      const transaction = Object.freeze({
        schema: X34_OBSERVATION_SCHEMA,
        fixtureId: this.probe.fixtureId,
        sourceSha256: this.probe.sourceSha256,
        artifactIdentity: this.probe.artifactIdentity,
        symbol: clone(this.probe.symbol),
        commit: after[0],
        temperatureC: signed16(after[1], after[2]),
        d13Level: after[3],
        beginPc: this.active.beginPc,
        beginCycle: this.active.beginCycle,
        commitPc: pcBefore,
        commitPcAfter: pcAfter,
        commitCycle: cycle,
        adc: clone(this.active.adc),
        pinObservation: clone(d13),
        writes: this.active.writes.map(clone),
      });
      this.completed.push(transaction);
      this.active = null;
      this.sealed = true;
      return;
    }
    if (this.active) {
      this.active.writes.push(write);
      for (const offset of changedOffsets) if (offset > 0) this.active.changed.add(offset);
    }
  }

  snapshot(runtimeIdentity = null) {
    if (runtimeIdentity !== null && !validBinding(runtimeIdentity)) reject('X34_RUNTIME_IDENTITY_INVALID');
    return {
      schema: 'intent-mcu-x34-observer-state@1',
      fixtureId: this.probe.fixtureId,
      runtimeIdentity: runtimeIdentity ? clone(runtimeIdentity) : null,
      witnessedOdd: Boolean(this.active) || this.completed.length > 0,
      activeOddCommit: this.active?.oddCommit ?? null,
      completed: this.completed.map(clone),
      rejected: this.rejected,
      sealed: this.sealed,
      limits: {
        maximumCompletedTransactions: X34_MAX_COMPLETED_TRANSACTIONS,
        commitWrapAccepted: false,
        arbitraryMemoryExposed: false,
      },
    };
  }
}
