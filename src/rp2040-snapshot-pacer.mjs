// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const RP2040_PRESENTATION_SCHEMA = 'intent-mcu-rp2040-presentation@1';
export const RP2040_EXECUTION_DELAY_MS = 4;
export const RP2040_PRESENTATION_INTERVAL_MS = 50;

const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

function validArtifactIdentity(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}

function validGeneration(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function presentationAck(message) {
  const value = message?.presentation;
  if (!exactKeys(value, ['schema', 'artifactIdentity', 'generation', 'sequence', 'final'])
      || value.schema !== RP2040_PRESENTATION_SCHEMA
      || !validArtifactIdentity(value.artifactIdentity)
      || !validGeneration(value.generation)
      || !Number.isSafeInteger(value.sequence) || value.sequence < 1
      || typeof value.final !== 'boolean') return null;
  return {
    command: 'snapshot-ack',
    artifactIdentity: value.artifactIdentity,
    presentationGeneration: value.generation,
    sequence: value.sequence,
  };
}

export function acceptsPresentation(message, {
  artifactIdentity, presentationGeneration, lastSequence = 0,
}) {
  const ack = presentationAck(message);
  return ack !== null
    && ack.artifactIdentity === artifactIdentity
    && ack.presentationGeneration === presentationGeneration
    && ack.sequence > lastSequence;
}

export class Rp2040SnapshotPacer {
  constructor({
    artifactIdentity,
    advance,
    snapshot,
    emit,
    onError = () => {},
    now = () => performance.now(),
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = (timer) => clearTimeout(timer),
    executionDelayMs = RP2040_EXECUTION_DELAY_MS,
    presentationIntervalMs = RP2040_PRESENTATION_INTERVAL_MS,
  }) {
    if (!validArtifactIdentity(artifactIdentity) || typeof advance !== 'function'
        || typeof snapshot !== 'function' || typeof emit !== 'function'
        || typeof onError !== 'function' || typeof now !== 'function'
        || typeof setTimer !== 'function' || typeof clearTimer !== 'function'
        || !Number.isFinite(executionDelayMs) || executionDelayMs < 1
        || !Number.isFinite(presentationIntervalMs)
        || presentationIntervalMs < executionDelayMs) throw new TypeError('RP2040_PACER_CONFIGURATION');
    this.artifactIdentity = artifactIdentity;
    this.advance = advance;
    this.snapshot = snapshot;
    this.emit = emit;
    this.onError = onError;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.executionDelayMs = executionDelayMs;
    this.presentationIntervalMs = presentationIntervalMs;
    this.generation = 0;
    this.sequence = 0;
    this.running = false;
    this.dirty = false;
    this.inFlight = null;
    this.timer = null;
    this.nextPresentationAt = 0;
  }

  start(generation) {
    this.#transition(generation);
    this.running = true;
    this.nextPresentationAt = this.now() + this.presentationIntervalMs;
    this.#schedule();
  }

  acknowledge({ artifactIdentity, presentationGeneration, sequence }) {
    if (!this.inFlight || artifactIdentity !== this.artifactIdentity
        || presentationGeneration !== this.generation
        || sequence !== this.inFlight.sequence) return false;
    this.inFlight = null;
    if (this.running && this.dirty && this.now() >= this.nextPresentationAt) this.#publish('status', false);
    return true;
  }

  publishFinal(generation, kind, preparedSnapshot = null) {
    this.#transition(generation);
    this.running = false;
    this.dirty = false;
    return this.#publish(kind, true, preparedSnapshot);
  }

  cancel(generation = null) {
    if (generation !== null) this.#transition(generation);
    else this.#clearScheduled();
    this.running = false;
    this.dirty = false;
    this.inFlight = null;
  }

  #transition(generation) {
    if (!validGeneration(generation) || generation <= this.generation) {
      throw new Error('RP2040_PRESENTATION_GENERATION_STALE');
    }
    this.#clearScheduled();
    this.generation = generation;
    this.sequence = 0;
    this.dirty = false;
    this.inFlight = null;
  }

  #clearScheduled() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }

  #schedule() {
    if (!this.running || this.timer !== null) return;
    const activeGeneration = this.generation;
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.#tick(activeGeneration);
    }, this.executionDelayMs);
  }

  #tick(activeGeneration) {
    if (!this.running || activeGeneration !== this.generation) return;
    try {
      this.advance();
      this.dirty = true;
      if (!this.inFlight && this.now() >= this.nextPresentationAt) this.#publish('status', false);
      this.#schedule();
    } catch (error) {
      this.cancel();
      this.onError(error);
    }
  }

  #publish(kind, final, preparedSnapshot = null) {
    const snapshot = preparedSnapshot ?? this.snapshot(kind);
    if (snapshot?.artifactIdentity !== this.artifactIdentity) {
      throw new Error('RP2040_PRESENTATION_ARTIFACT_MISMATCH');
    }
    const presentation = Object.freeze({
      schema: RP2040_PRESENTATION_SCHEMA,
      artifactIdentity: this.artifactIdentity,
      generation: this.generation,
      sequence: ++this.sequence,
      final,
    });
    this.inFlight = presentation;
    this.dirty = false;
    this.nextPresentationAt = this.now() + this.presentationIntervalMs;
    this.emit({ ...snapshot, presentation });
    return presentation;
  }
}

