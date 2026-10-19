// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';
import { validateX35Probe } from './x35-causal-chain-contract.mjs';

const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };

export class X35CausalObserver {
  constructor(probe) { this.probe = validateX35Probe(probe); this.reset(); }

  reset() { this.pending = null; this.completed = []; this.rejected = null; this.sealed = false; }

  #fail(code) { this.pending = null; this.rejected = code; this.sealed = true; }

  observeStep(value) {
    if (this.sealed || this.rejected) return;
    if (!exactKeys(value, ['pcBefore', 'pcAfter', 'opcode', 'cycleBefore', 'cycleAfter',
      'portBefore', 'portAfterInstruction', 'portAfterTick', 'instructionRecords',
      'tickRecords', 'pin', 'retentionDrops'])) return this.#fail('X35_STEP_RECORD_INVALID');
    if (this.pending) return this.#fail('X35_PROJECTION_NOT_SYNCHRONOUS');
    const mask = 1 << this.probe.selected.bit;
    const selectedRise = !(value.portBefore & mask) && Boolean(value.portAfterInstruction & mask);
    if (!selectedRise) return;
    const instructionRecords = value.instructionRecords.filter(
      (entry) => entry.pin === 13 && entry.level === true,
    );
    const tickPinRecords = value.tickRecords.filter((entry) => entry.pin === 13);
    const tickChangedBit5 = Boolean((value.portAfterInstruction ^ value.portAfterTick) & mask);
    if (instructionRecords.length !== 1 || tickPinRecords.length !== 0 || tickChangedBit5
        || value.pin?.pin !== 'D13' || value.pin.mode !== 'OUTPUT' || value.pin.level !== true
        || instructionRecords[0].cycle < value.cycleBefore
        || instructionRecords[0].cycle > value.cycleAfter) return this.#fail('X35_CAUSAL_BOUNDARY_AMBIGUOUS');
    const eventId = `x35-event-${value.pcBefore}-${value.cycleBefore}`;
    this.pending = {
      eventId,
      instruction: { eventId, pcBefore: value.pcBefore, pcAfter: value.pcAfter,
        opcode: value.opcode, cycleBefore: value.cycleBefore, cycleAfter: value.cycleAfter },
      register: { eventId, causedBy: eventId, name: 'PORTB', address: this.probe.selected.registerAddress,
        selectedBit: this.probe.selected.bit, fullValueBefore: value.portBefore,
        fullValueAfterInstruction: value.portAfterInstruction, fullValueAfterTick: value.portAfterTick,
        otherBitsChangedMask: (value.portBefore ^ value.portAfterInstruction) & ~mask },
      callback: { eventId, causedBy: eventId, rawCycle: instructionRecords[0].cycle,
        instructionCycleBounds: [value.cycleBefore, value.cycleAfter], pin: 'D13', level: true },
      pin: { eventId, causedBy: eventId, pin: value.pin.pin, mode: value.pin.mode, level: value.pin.level },
      tickDistinction: { instructionChangedBit5: true, tickChangedBit5: false,
        d13DuringInstruction: instructionRecords.length, d13DuringTick: tickPinRecords.length },
      retentionDrops: clone(value.retentionDrops),
    };
  }

  project(projection) {
    if (this.sealed || this.rejected || !this.pending) return;
    if (!exactKeys(projection, ['graphSha256', 'path', 'component'])
        || projection.graphSha256 !== this.probe.graphSha256
        || JSON.stringify(projection.path) !== JSON.stringify(this.probe.path)
        || !exactKeys(projection.component, ['componentId', 'model', 'on',
          'capturedAtInstructionBoundary']) || projection.component.componentId !== 'heater-led-1'
        || projection.component.on !== true
        || projection.component.capturedAtInstructionBoundary !== true) {
      return this.#fail('X35_SYNCHRONOUS_PROJECTION_INVALID');
    }
    const { eventId } = this.pending;
    this.completed.push(Object.freeze({
      ...clone(this.pending),
      topology: { eventId, causedBy: eventId, graphSha256: projection.graphSha256,
        path: [...projection.path] },
      componentProjection: { eventId, causedBy: eventId, ...clone(projection.component) },
    }));
    this.pending = null; this.sealed = true;
  }

  snapshot() {
    return { schema: 'intent-mcu-x35-observer-state@1', suiteId: this.probe.suiteId,
      selectedEventPendingProjection: this.pending !== null,
      completed: this.completed.map(clone), rejected: this.rejected, sealed: this.sealed,
      limits: { selectedEvents: 1, arbitraryRegisterAccess: false, debugger: false } };
  }
}
