// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  RP2040_PICO_PROFILE,
  RP2040_PICO_BOARD_DEFINITION,
  Rp2040PicoCircuitEditor,
  createRp2040PicoCircuitDraft,
  normalizeRp2040PicoCircuitDraft,
} from './rp2040-pico-circuit.mjs';
import { validateBounded3v3AuthoringGraph } from './bounded-3v3-authoring-contracts.mjs';
import { parseStrictJson } from './strict-json.mjs';
import { boundedPolicyDiagnostic, normalizeSourceDiagnostics } from './source-diagnostics.mjs';
import { isRetryableCapacityCode, retryGuidanceFromResponse, retryMessage, retryResultFields } from './retry-guidance.mjs';
import {
  CURRENT_MODEL_LIBRARY_LOCK, modelLibraryExecutionIdentity, normalizeModelLibraryLock,
  resolveModelLibrary,
} from './model-library.mjs';
import { acceptsPresentation, presentationAck } from './rp2040-snapshot-pacer.mjs';

export const RP2040_PUBLIC_PROJECT_SCHEMA = 'intent-mcu-rp2040-public-project@1';
export const RP2040_PUBLIC_BUILD_SCHEMA = 'intent-mcu-rp2040-source-build-request@1';
export const RP2040_PUBLIC_SOURCE = `/* Intent MCU Simulator public RP2040 source v1 */
int main(void)
{
  intent_gpio0_output(1u);
  intent_uart0_text("PICO PUBLIC");
  intent_halt();
}
`;

const SOURCE_PATTERN = /^\/\* Intent MCU Simulator public RP2040 source v1 \*\/\nint main\(void\)\n\{\n  intent_gpio0_output\(([01])u\);\n  intent_uart0_text\("([A-Z0-9 _-]{1,24})"\);\n  intent_halt\(\);\n\}\n$/u;
const SOURCE_LINE_PATTERNS = Object.freeze([
  /^\/\* Intent MCU Simulator public RP2040 source v1 \*\/$/u,
  /^int main\(void\)$/u, /^\{$/u, /^  intent_gpio0_output\([01]u\);$/u,
  /^  intent_uart0_text\("[A-Z0-9 _-]{1,24}"\);$/u, /^  intent_halt\(\);$/u, /^\}$/u, /^$/u,
]);

export function describeRp2040PublicSource(source) {
  const match = typeof source === 'string' ? SOURCE_PATTERN.exec(source) : null;
  return match ? Object.freeze({
    recognized: true,
    pins: Object.freeze(['GP0']),
    apis: Object.freeze(['intent_gpio0_output', 'intent_uart0_text', 'intent_halt']),
  }) : Object.freeze({ recognized: false, pins: Object.freeze([]), apis: Object.freeze([]) });
}
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const clone = (value) => structuredClone(value);
function describeCircuitGap(code) {
  return ({
    RP2040_SERIES_RESISTOR_REQUIRED: 'Missing resistor: add the supported series resistor between GP0 and the LED anode path.',
    RP2040_GROUND_REQUIRED: 'Missing ground: connect LED cathode to Pico GND pin 3.',
    RP2040_LED_REVERSE_POLARITY: 'LED polarity is reversed: anode must face GP0 through the resistor; cathode must face GND.',
    RP2040_LED_OVERCURRENT: 'LED current is above the teaching limit: increase the series resistance.',
    RP2040_PATH_OPEN: 'Open LED path: complete GP0 → resistor → LED anode, then LED cathode → GND pin 3.',
  })[code] ?? `Circuit rejected (${code}). Inspect the highlighted supported parts and named pins.`;
}
const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

function ownerError(code) { return Object.assign(new Error(code), { code }); }
function requiredCounter(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) throw ownerError(code);
  return value;
}
function optionalFinite(value) { return Number.isFinite(value) ? value : null; }

export function projectRp2040PausedAck(message, artifactIdentity) {
  if (message?.kind !== 'paused' || message.paused !== true || message.presentation?.final !== true
      || message.presentation?.artifactIdentity !== artifactIdentity) throw ownerError('RP2040_BUDGET_PAUSE_ACK_INVALID');
  const serial = message.instruments?.serial;
  if (!serial || typeof serial.text !== 'string' || !Array.isArray(serial.records)) {
    throw ownerError('RP2040_BUDGET_PAUSE_SERIAL_INVALID');
  }
  const gpio0 = message.experimental?.gpio0;
  if (!gpio0 || typeof gpio0.mode !== 'string' || typeof gpio0.level !== 'boolean') {
    throw ownerError('RP2040_BUDGET_PAUSE_GPIO_INVALID');
  }
  return freeze({
    cycle: requiredCounter(message.cycle, 'RP2040_BUDGET_PAUSE_CYCLE_INVALID'),
    instructions: requiredCounter(message.instructions, 'RP2040_BUDGET_PAUSE_INSTRUCTIONS_INVALID'),
    gpio0: { mode: gpio0.mode, level: gpio0.level },
    pins: message.pins && typeof message.pins === 'object' && !Array.isArray(message.pins) ? clone(message.pins) : null,
    uart: {
      text: serial.text, records: clone(serial.records), count: serial.records.length,
      retained: requiredCounter(serial.retained, 'RP2040_BUDGET_PAUSE_UART_RETAINED_INVALID'),
      dropped: requiredCounter(serial.dropped, 'RP2040_BUDGET_PAUSE_UART_DROPPED_INVALID'),
    },
    virtualTime: {
      nanoseconds: optionalFinite(message.virtualNanoseconds),
      microseconds: optionalFinite(message.virtualMicroseconds),
      milliseconds: optionalFinite(message.virtualMilliseconds),
    },
    artifactIdentity,
  });
}

function stablePausedProjection(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function sha256(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((part) => part.toString(16).padStart(2, '0')).join('');
}

function decodeBase64(value) {
  if (typeof value !== 'string' || value.length < 4 || value.length % 4 !== 0
      || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) throw new Error('RP2040_BUILD_ARTIFACT_ENCODING');
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (btoa(binary) !== value) throw new Error('RP2040_BUILD_ARTIFACT_ENCODING');
  return bytes;
}

function validName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

export function normalizeRp2040PublicProject(value) {
  if (!exactKeys(value, ['schema', 'name', 'profile', 'source', 'circuit'])
      || value.schema !== RP2040_PUBLIC_PROJECT_SCHEMA || value.profile !== RP2040_PICO_PROFILE
      || !validName(value.name) || typeof value.source !== 'string'
      || new TextEncoder().encode(value.source).byteLength > 4096 || !SOURCE_PATTERN.test(value.source)) {
    throw new Error('RP2040_PROJECT_INVALID');
  }
  return {
    schema: RP2040_PUBLIC_PROJECT_SCHEMA,
    name: value.name.trim(),
    profile: RP2040_PICO_PROFILE,
    source: value.source,
    circuit: normalizeRp2040PicoCircuitDraft(value.circuit),
  };
}

function defaultProject() {
  return normalizeRp2040PublicProject({
    schema: RP2040_PUBLIC_PROJECT_SCHEMA,
    name: 'Pico GPIO0 source project',
    profile: RP2040_PICO_PROFILE,
    source: RP2040_PUBLIC_SOURCE,
    circuit: createRp2040PicoCircuitDraft(),
  });
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export class Rp2040PublicWorkbench {
  constructor({ elements, onState = () => {}, onDiagnostics = () => {}, onSave = null, onOpen = null,
    pauseProof = {}, advanceGuard = () => ({ ok: true, code: 'RP2040_ADVANCE_ALLOWED' }) } = {}) {
    this.elements = elements;
    this.onState = onState;
    this.onDiagnostics = onDiagnostics;
    this.onSave = onSave;
    this.onOpen = onOpen;
    this.advanceGuard = advanceGuard;
    this.project = defaultProject();
    this.modelLibraryLock = clone(CURRENT_MODEL_LIBRARY_LOCK);
    this.modelLibraryImplementation = resolveModelLibrary(this.modelLibraryLock).implementation;
    this.circuitEditor = new Rp2040PicoCircuitEditor(this.project.circuit);
    this.revision = 1;
    this.phase = 'editing';
    this.message = 'Edit the two bounded values, then build fresh firmware.';
    this.artifact = null;
    this.artifactBytes = null;
    this.artifactRevision = null;
    this.worker = null;
    this.workerGeneration = 0;
    this.presentationGeneration = 0;
    this.acceptedPresentationSequence = 0;
    this.abort = null;
    this.active = false;
    this.lastRuntime = null;
    this.diagnostics = [];
    this.pauseProofNow = pauseProof.now ?? (() => performance.now());
    this.pauseProofSchedule = pauseProof.schedule ?? ((callback, delay) => setTimeout(callback, delay));
    this.pauseProofUnschedule = pauseProof.unschedule ?? ((timer) => clearTimeout(timer));
    this.pauseProofMinimumMs = pauseProof.minimumMs ?? 250;
    this.pauseProofTimeoutMs = pauseProof.timeoutMs ?? 2_000;
    this.pauseProofSequence = 0;
    this.pauseProofOperation = null;
    this.bind();
    this.render();
  }

  advancingBlocked(action, advancePermit = null) {
    let result;
    try { result = this.advanceGuard(action, advancePermit); }
    catch { result = { ok: false, code: 'RP2040_ADVANCE_GUARD_FAILED' }; }
    if (!result || result.ok !== false) return null;
    this.message = `${action} blocked (${result.code}). The prior budgeted producer must acknowledge pause or retirement first.`;
    this.render();
    return { ...clone(result), ok: false };
  }

  bind() {
    this.elements.source.addEventListener('input', () => {
      this.project.source = this.elements.source.value;
      this.invalidate('Source changed. The previous artifact was retired.');
    });
    this.elements.name.addEventListener('input', () => {
      if (validName(this.elements.name.value)) this.project.name = this.elements.name.value.trim();
    });
    this.elements.name.addEventListener('change', () => {
      if (!validName(this.elements.name.value)) this.elements.name.value = this.project.name;
      else { this.project.name = this.elements.name.value.trim(); this.render(); }
    });
    this.elements.build.addEventListener('click', () => { void this.build(); });
    this.elements.run.addEventListener('click', () => { void this.run(); });
    this.elements.pause.addEventListener('click', () => this.pause());
    this.elements.reset.addEventListener('click', () => this.reset());
    this.elements.stop.addEventListener('click', () => this.stop());
    this.elements.save.addEventListener('click', () => this.onSave ? this.onSave() : this.save());
    this.elements.open.addEventListener('click', () => this.elements.openInput.click());
    this.elements.openInput.addEventListener('change', async () => {
      const file = this.elements.openInput.files?.[0];
      this.elements.openInput.value = '';
      if (file) await (this.onOpen ? this.onOpen(file) : this.open(file));
    });
  }

  snapshot() {
    const circuit = this.modelLibraryImplementation.validateProfile(
      RP2040_PICO_PROFILE, this.project.circuit, { modelLibraryLock: this.modelLibraryLock },
    );
    const modelLibrary = modelLibraryExecutionIdentity(this.modelLibraryLock);
    const wiringReady = this.circuitEditor.snapshot().wireDraft.mode === 'none';
    const authoring = validateBounded3v3AuthoringGraph({ board: RP2040_PICO_BOARD_DEFINITION,
      components: this.project.circuit.components, nets: this.project.circuit.nets });
    return {
      profile: RP2040_PICO_PROFILE,
      phase: this.phase,
      message: this.message,
      revision: this.revision,
      active: this.active,
      source: this.project.source,
      circuit: clone(this.project.circuit),
      circuitEditor: this.circuitEditor.snapshot(),
      circuitValid: circuit.ok && wiringReady,
      circuitCode: wiringReady ? circuit.code : 'RP2040_WIRING_IN_PROGRESS',
      authoringAccepted: authoring.ok && wiringReady,
      authoringCode: wiringReady ? authoring.code : 'RP2040_WIRING_IN_PROGRESS',
      circuitObservation: this.modelLibraryImplementation.observeRp2040(
        this.project.circuit, this.lastRuntime, { modelLibraryLock: this.modelLibraryLock },
      ),
      artifact: this.artifact ? clone(this.artifact) : null,
      runnable: Boolean(this.artifact && this.artifactRevision === this.revision && circuit.ok && wiringReady),
      runtime: this.lastRuntime ? clone(this.lastRuntime) : null,
      diagnostics: clone(this.diagnostics),
      modelLibrary: modelLibrary.ok ? clone(modelLibrary.identity) : { code: modelLibrary.code },
      durableServerProject: false,
      transientExecutableMemoryOnly: true,
    };
  }

  publish() {
    const state = this.snapshot();
    this.onState(state);
    return state;
  }

  setModelLibraryLock(lock) {
    const normalized = normalizeModelLibraryLock(lock);
    if (!normalized.ok) throw Object.assign(new Error(normalized.code), normalized);
    this.modelLibraryLock = clone(normalized.lock);
    this.modelLibraryImplementation = resolveModelLibrary(this.modelLibraryLock).implementation;
  }

  activate() {
    this.active = true;
    this.render();
  }

  deactivate() {
    this.active = false;
    this.terminateWorker();
    this.wipeArtifact();
    this.diagnostics = [];
    this.phase = 'editing';
    this.message = 'Pico draft preserved. Build fresh firmware after returning.';
    this.render();
  }

  wipeArtifact() {
    this.artifactBytes?.fill(0);
    this.artifactBytes = null;
    this.artifact = null;
    this.artifactRevision = null;
  }

  terminateWorker() {
    this.rejectPauseProof('RP2040_BUDGET_PAUSE_WORKER_RETIRED');
    this.workerGeneration += 1;
    this.presentationGeneration += 1;
    this.acceptedPresentationSequence = 0;
    if (this.worker) {
      this.worker.postMessage({ command: 'dispose' });
      this.worker.terminate();
    }
    this.worker = null;
    this.lastRuntime = null;
  }

  beginPresentationGeneration() {
    this.presentationGeneration += 1;
    this.acceptedPresentationSequence = 0;
    return this.presentationGeneration;
  }

  invalidate(message) {
    this.abort?.abort();
    this.abort = null;
    this.terminateWorker();
    this.wipeArtifact();
    this.revision += 1;
    this.phase = 'editing';
    this.diagnostics = [];
    this.message = message;
    this.render();
  }

  async response(response) {
    let value;
    try { value = await response.json(); } catch { throw new Error('RP2040_BUILD_RESPONSE_INVALID'); }
    if (!response.ok) {
      const code = value.code ?? 'RP2040_BUILD_FAILED';
      const guidance = retryGuidanceFromResponse(response.headers.get('retry-after'), value);
      throw Object.assign(new Error(isRetryableCapacityCode(code) ? retryMessage(code, guidance) : code), value,
        guidance ? retryResultFields(value) : {});
    }
    return value;
  }

  async poll(job, revision, source) {
    while (this.active && revision === this.revision) {
      const value = await this.response(await fetch(`/api/build/${job.jobId}`, {
        headers: { Authorization: `Bearer ${job.capability}` },
        cache: 'no-store', signal: this.abort.signal,
      }));
      if (value.status === 'building') {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      if (value.status !== 'succeeded') {
        throw Object.assign(new Error(value.error ?? value.result?.code ?? 'RP2040_BUILD_FAILED'), value.result ?? {});
      }
      const result = value.result;
      const artifact = result?.artifact;
      if (artifact?.schema !== 'intent-mcu-rp2040-compile-artifact@1'
          || artifact.profile !== RP2040_PICO_PROFILE || artifact.uf2?.bytes > 4 * 1024 * 1024) {
        throw new Error('RP2040_BUILD_RESPONSE_INVALID');
      }
      const bytes = decodeBase64(artifact.uf2.base64);
      const [sourceHash, artifactHash] = await Promise.all([sha256(source), sha256(bytes)]);
      if (revision !== this.revision || !this.active) { bytes.fill(0); return null; }
      if (sourceHash !== artifact.sourceSha256 || artifactHash !== artifact.uf2.sha256
          || bytes.byteLength !== artifact.uf2.bytes) {
        bytes.fill(0);
        throw new Error('RP2040_BUILD_IDENTITY_MISMATCH');
      }
      this.artifactBytes = bytes;
      this.artifactRevision = revision;
      this.artifact = {
        sourceSha256: sourceHash,
        uf2Sha256: artifactHash,
        bytes: bytes.byteLength,
        artifactIdentity: result.artifactIdentity,
        compiler: clone(artifact.compiler),
        modelLibrary: modelLibraryExecutionIdentity(this.modelLibraryLock).identity,
      };
      this.phase = 'built';
      this.diagnostics = [];
      this.message = 'Fresh source-bound UF2 ready. Run starts one browser worker.';
      this.abort = null;
      this.render();
      return this.artifact;
    }
    return null;
  }

  async build({ advancePermit = null } = {}) {
    const boundary = this.advancingBlocked('Build', advancePermit); if (boundary) return boundary;
    if (this.pauseProofOperation) return { ok: false, code: 'RP2040_BUDGET_PAUSE_BUSY' };
    if (!this.active || this.phase === 'building') return { ok: false, code: 'RP2040_BUILD_UNAVAILABLE' };
    if (this.circuitEditor.snapshot().wireDraft.mode !== 'none') {
      this.phase = 'blocked';
      this.message = 'Build blocked while a cable endpoint is being chosen. Finish the cable or press Escape, then build fresh firmware.';
      this.render();
      return { ok: false, code: 'RP2040_WIRING_IN_PROGRESS' };
    }
    const circuit = this.modelLibraryImplementation.validateProfile(
      RP2040_PICO_PROFILE, this.project.circuit, { modelLibraryLock: this.modelLibraryLock },
    );
    if (!circuit.ok) {
      this.phase = 'blocked';
      this.message = `Circuit blocked (${circuit.code}). Reconnect the exact GP0 → resistor → LED → GND path.`;
      this.render();
      return { ok: false, code: circuit.code };
    }
    if (!SOURCE_PATTERN.test(this.project.source)) {
      this.phase = 'failed';
      this.diagnostics = [boundedPolicyDiagnostic({
        profile: RP2040_PICO_PROFILE, revision: this.revision, source: this.project.source,
        file: 'main.c', linePatterns: SOURCE_LINE_PATTERNS,
      })];
      this.message = 'Source rejected. Keep the complete template and line breaks exactly as shown; edit only GPIO0 level (0/1) and the uppercase UART text.';
      this.render();
      return { ok: false, code: 'SOURCE_POLICY_REJECTED', diagnostics: clone(this.diagnostics) };
    }
    this.abort?.abort();
    this.terminateWorker();
    this.wipeArtifact();
    const revision = this.revision;
    const source = this.project.source;
    this.abort = new AbortController();
    this.phase = 'building';
    this.diagnostics = [];
    this.message = 'Queued in the bounded public Arm compiler (one global build, one per visitor).';
    this.render();
    try {
      const job = await this.response(await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1' },
        signal: this.abort.signal,
        body: JSON.stringify({
          schema: RP2040_PUBLIC_BUILD_SCHEMA,
          board: RP2040_PICO_PROFILE,
          files: [{ name: 'main.c', content: source }],
        }),
      }));
      const artifact = await this.poll(job, revision, source);
      return artifact ? { ok: true, code: 'OK', artifact: clone(artifact) }
        : { ok: false, code: 'RP2040_BUILD_STALE' };
    } catch (error) {
      if (revision !== this.revision || error.name === 'AbortError') return { ok: false, code: 'RP2040_BUILD_STALE' };
      this.abort = null;
      this.wipeArtifact();
      this.phase = 'failed';
      this.diagnostics = normalizeSourceDiagnostics(error.diagnostics ?? [{
        code: error.code ?? 'RP2040_BUILD_FAILED', severity: 'error', message: error.message,
      }], { profile: RP2040_PICO_PROFILE, revision, source, files: [{ name: 'main.c', content: source }] });
      this.message = `${error.message}. No older artifact remains runnable.`;
      this.render();
      return { ok: false, code: error.code ?? error.message, ...retryResultFields(error) };
    }
  }

  async run({ advancePermit = null } = {}) {
    const boundary = this.advancingBlocked('Run', advancePermit); if (boundary) return boundary;
    if (this.pauseProofOperation) return { ok: false, code: 'RP2040_BUDGET_PAUSE_BUSY' };
    const circuit = this.modelLibraryImplementation.validateProfile(
      RP2040_PICO_PROFILE, this.project.circuit, { modelLibraryLock: this.modelLibraryLock },
    );
    if (!this.active || !this.artifact || this.artifactRevision !== this.revision
        || !(this.artifactBytes instanceof Uint8Array) || !circuit.ok) {
      this.message = 'Run blocked. Reconnect the validated circuit and build this exact source again.';
      this.render();
      return { ok: false, code: 'RUN_REQUIRES_CURRENT_BUILD' };
    }
    if (this.worker && this.phase === 'paused') {
      this.worker.postMessage({ command: 'run',
        presentationGeneration: this.beginPresentationGeneration() });
      this.phase = 'running';
      this.message = 'Pico runtime resumed from the current source-bound artifact.';
      this.render();
      return { ok: true, code: 'OK' };
    }
    this.terminateWorker();
    const generation = ++this.workerGeneration;
    const worker = new Worker('./simulator.worker.js', { type: 'module' });
    this.worker = worker;
    this.phase = 'starting';
    this.message = 'Loading the hash-verified UF2 in one browser worker…';
    this.render();
    worker.addEventListener('message', ({ data }) => {
      if (generation !== this.workerGeneration || worker !== this.worker) return;
      if (data.kind === 'disposed') return;
      if (data.artifactIdentity !== this.artifact?.uf2Sha256) {
        if (data.kind === 'stopped-error' || data.kind === 'error') {
          this.phase = 'failed';
          this.message = `Runtime stopped (${data.message ?? 'unbound runtime error'}).`;
          this.terminateWorker();
          this.render();
        }
        return;
      }
      const ack = data.presentation ? presentationAck(data) : null;
      if (data.presentation && !acceptsPresentation(data, {
        artifactIdentity: this.artifact.uf2Sha256,
        presentationGeneration: this.presentationGeneration,
        lastSequence: this.acceptedPresentationSequence,
      })) return;
      if (ack) this.acceptedPresentationSequence = ack.sequence;
      this.lastRuntime = data;
      if (ack) this.acceptPauseProofMessage(data, worker, generation);
      if (data.kind === 'ready') {
        if (this.phase === 'starting') {
          this.phase = 'running';
          this.message = 'Pico runtime started. GPIO0 and UART0 come from the compiled source.';
          worker.postMessage({ command: 'run',
            presentationGeneration: this.beginPresentationGeneration() });
        }
      } else if (data.kind === 'stopped-error' || data.kind === 'error') {
        this.phase = 'failed';
        this.message = `Runtime stopped (${data.message ?? 'bounded runtime error'}).`;
      } else this.phase = data.paused ? 'paused' : 'running';
      this.render();
      if (ack && generation === this.workerGeneration && worker === this.worker) worker.postMessage(ack);
    });
    worker.addEventListener('error', (event) => {
      if (generation !== this.workerGeneration) return;
      this.rejectPauseProof('RP2040_BUDGET_PAUSE_WORKER_ERROR');
      this.phase = 'failed';
      this.message = `Runtime worker failed (${event.message}).`;
      this.terminateWorker();
      this.render();
    });
    worker.postMessage({
      command: 'init', runtimeProfile: RP2040_PICO_PROFILE,
      firmware: { format: 'uf2', bytes: new Uint8Array(this.artifactBytes), expectedSha256: this.artifact.uf2Sha256 },
    });
    return { ok: true, code: 'OK' };
  }

  pause() {
    if (this.pauseProofOperation) return { ok: false, code: 'RP2040_BUDGET_PAUSE_BUSY' };
    if (!this.worker) return { ok: false, code: 'RUNTIME_NOT_ACTIVE' };
    this.worker.postMessage({ command: 'pause',
      presentationGeneration: this.beginPresentationGeneration() });
    this.phase = 'pausing';
    this.message = 'Pause requested. Waiting for the final current runtime snapshot.';
    this.render();
    return { ok: true, code: 'OK' };
  }

  reset({ advancePermit = null } = {}) {
    const boundary = this.advancingBlocked('Reset', advancePermit); if (boundary) return boundary;
    if (this.pauseProofOperation) return { ok: false, code: 'RP2040_BUDGET_PAUSE_BUSY' };
    if (!this.worker) return { ok: false, code: 'RUNTIME_NOT_ACTIVE' };
    this.lastRuntime = null;
    this.worker.postMessage({ command: 'reset',
      presentationGeneration: this.beginPresentationGeneration() });
    this.phase = 'resetting';
    this.message = 'Pico reset requested. Earlier evidence was retired while the fresh reset snapshot is pending.';
    this.render();
    return { ok: true, code: 'OK' };
  }

  stop() {
    this.rejectPauseProof('RP2040_BUDGET_PAUSE_STOPPED');
    this.abort?.abort();
    this.abort = null;
    this.terminateWorker();
    this.wipeArtifact();
    this.diagnostics = [];
    this.phase = 'editing';
    this.message = 'Stopped and discarded executable authority. Build fresh firmware to run again.';
    this.render();
    return { ok: true, code: 'OK' };
  }

  rejectPauseProof(code, operation = this.pauseProofOperation) {
    if (!operation || operation.settled) return false;
    operation.settled = true;
    if (operation.timer !== null) this.pauseProofUnschedule(operation.timer);
    if (operation.deadlineTimer !== null) this.pauseProofUnschedule(operation.deadlineTimer);
    operation.signal?.removeEventListener('abort', operation.onAbort);
    if (this.pauseProofOperation === operation) this.pauseProofOperation = null;
    operation.reject(ownerError(code));
    return true;
  }

  finishPauseProof(operation, second, endedAt) {
    if (operation.settled || this.pauseProofOperation !== operation) return;
    if (!Number.isFinite(endedAt) || endedAt >= operation.deadlineAt) {
      this.rejectPauseProof('RP2040_BUDGET_PAUSE_DEADLINE', operation); return;
    }
    if (endedAt - operation.first.acceptedAt < this.pauseProofMinimumMs) {
      this.rejectPauseProof('RP2040_BUDGET_PAUSE_INTERVAL_SHORT', operation); return;
    }
    if (!stablePausedProjection(operation.first.projection, second.projection)) {
      this.rejectPauseProof('RP2040_BUDGET_PAUSE_STATE_CHANGED', operation); return;
    }
    operation.settled = true;
    if (operation.timer !== null) this.pauseProofUnschedule(operation.timer);
    if (operation.deadlineTimer !== null) this.pauseProofUnschedule(operation.deadlineTimer);
    operation.signal?.removeEventListener('abort', operation.onAbort);
    this.pauseProofOperation = null;
    operation.resolve(freeze({
      schema: 'intent-mcu-rp2040-owner-pause-proof@1', requestId: operation.requestId,
      dispatchToken: operation.dispatchToken, operationId: operation.operationId,
      workerGeneration: operation.workerGeneration, sourceSha256: operation.sourceSha256,
      artifactSha256: operation.artifactSha256, revision: operation.revision,
      startedAt: operation.startedAt, endedAt, durationMs: endedAt - operation.startedAt,
      first: operation.first, second, producerState: 'paused',
    }));
  }

  issueOwnedPause(operation, stage) {
    if (this.pauseProofOperation !== operation || operation.settled) return;
    if (this.pauseProofNow() >= operation.deadlineAt) {
      this.rejectPauseProof('RP2040_BUDGET_PAUSE_DEADLINE', operation); return;
    }
    const generation = this.beginPresentationGeneration();
    operation.waiting = { stage, generation };
    operation.worker.postMessage({ command: 'pause', presentationGeneration: generation });
    this.phase = 'pausing';
    this.message = 'Budget owner requested a fresh final Pause acknowledgement.';
    this.render();
  }

  acceptPauseProofMessage(message, worker, workerGeneration) {
    const operation = this.pauseProofOperation;
    if (!operation || operation.settled || worker !== operation.worker
        || workerGeneration !== operation.workerGeneration || this.worker !== operation.worker
        || this.artifact?.uf2Sha256 !== operation.artifactSha256 || this.revision !== operation.revision) return false;
    const waiting = operation.waiting;
    if (!waiting || message.presentation?.generation !== waiting.generation
        || message.presentation?.sequence !== this.acceptedPresentationSequence) return false;
    if (message.kind !== 'paused' || message.paused !== true || message.presentation.final !== true) return false;
    let projection;
    try { projection = projectRp2040PausedAck(message, operation.artifactSha256); }
    catch (error) { this.rejectPauseProof(error.code ?? 'RP2040_BUDGET_PAUSE_ACK_INVALID', operation); return false; }
    const acceptedAt = this.pauseProofNow();
    if (!Number.isFinite(acceptedAt) || acceptedAt >= operation.deadlineAt) {
      this.rejectPauseProof('RP2040_BUDGET_PAUSE_DEADLINE', operation); return true;
    }
    const accepted = freeze({ presentationGeneration: waiting.generation,
      presentationSequence: message.presentation.sequence, acceptedAt, projection });
    operation.waiting = null;
    if (waiting.stage === 'first') {
      operation.first = accepted;
      const remaining = operation.deadlineAt - acceptedAt;
      const delay = this.pauseProofMinimumMs;
      if (remaining <= delay) { this.rejectPauseProof('RP2040_BUDGET_PAUSE_DEADLINE', operation); return true; }
      operation.timer = this.pauseProofSchedule(() => {
        operation.timer = null;
        this.issueOwnedPause(operation, 'second');
      }, delay);
    } else this.finishPauseProof(operation, accepted, acceptedAt);
    return true;
  }

  pauseForBudget({ signal = null, deadlineAt, requestId, dispatchToken } = {}) {
    const ownerKey = `${requestId}\u0000${dispatchToken}`;
    if (this.pauseProofOperation) {
      if (this.pauseProofOperation.ownerKey === ownerKey) return this.pauseProofOperation.promise;
      return Promise.reject(ownerError('RP2040_BUDGET_PAUSE_OWNER_CONFLICT'));
    }
    const now = this.pauseProofNow();
    if (signal?.aborted) return Promise.reject(ownerError('RP2040_BUDGET_PAUSE_CANCELLED'));
    if (!Number.isFinite(deadlineAt) || deadlineAt <= now) return Promise.reject(ownerError('RP2040_BUDGET_PAUSE_DEADLINE'));
    if (!this.active || !this.worker || !this.artifact || this.artifactRevision !== this.revision
        || typeof this.artifact.sourceSha256 !== 'string' || typeof this.artifact.uf2Sha256 !== 'string') {
      return Promise.reject(ownerError('RP2040_BUDGET_PAUSE_AUTHORITY_UNAVAILABLE'));
    }
    let resolve; let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const operation = {
      ownerKey, requestId, dispatchToken, operationId: `rp2040-pause-owner-${++this.pauseProofSequence}`,
      worker: this.worker, workerGeneration: this.workerGeneration, artifactSha256: this.artifact.uf2Sha256,
      sourceSha256: this.artifact.sourceSha256, revision: this.revision, startedAt: now,
      deadlineAt: Math.min(deadlineAt, now + this.pauseProofTimeoutMs), signal, timer: null, deadlineTimer: null,
      waiting: null, first: null, settled: false, resolve, reject, promise,
    };
    operation.onAbort = () => this.rejectPauseProof('RP2040_BUDGET_PAUSE_CANCELLED', operation);
    signal?.addEventListener('abort', operation.onAbort, { once: true });
    this.pauseProofOperation = operation;
    operation.deadlineTimer = this.pauseProofSchedule(() => {
      operation.deadlineTimer = null;
      this.rejectPauseProof('RP2040_BUDGET_PAUSE_DEADLINE', operation);
    }, operation.deadlineAt - now);
    this.issueOwnedPause(operation, 'first');
    return promise;
  }

  selectCircuit(selection) {
    const result = this.circuitEditor.select(selection);
    this.render();
    return result;
  }

  editCircuit(operation, ...args) {
    if (this.pauseProofOperation) this.rejectPauseProof('RP2040_BUDGET_PAUSE_CIRCUIT_CHANGED');
    if (!['deleteSelected', 'undo', 'redo', 'moveComponent', 'rotateComponent',
      'activateEndpoint', 'beginReconnect', 'beginBranch', 'cancelWireDraft', 'connectEndpoints', 'reconnectEndpoint', 'branchEndpoint', 'deleteBranch',
      'newProject', 'addComponent', 'duplicateComponent', 'addMissingComponent', 'setComponentProperty', 'setComponentAppearance', 'setComponentAppearanceEdit',
      'setWireColor', 'setWireRoute', 'applyApiBatch', 'undoApi', 'redoApi'].includes(operation)) {
      return { ok: false, code: 'RP2040_CIRCUIT_OPERATION_INVALID' };
    }
    const revision = this.circuitEditor.revision;
    const result = this.circuitEditor[operation](...args);
    if (!result.ok) {
      if (['addMissingComponent', 'setComponentProperty', 'setComponentAppearance', 'setComponentAppearanceEdit'].includes(operation)) {
        this.message = `Part change rejected (${result.code}). The circuit and executable authority are unchanged.`;
      }
      this.render(); return result;
    }
    if (result.revision === revision) {
      if (result.wireDraft?.mode !== 'none') {
        this.invalidate('Wiring in progress. Executable and LED authority were retired; finish or cancel, then build fresh firmware.');
      } else this.render();
      return result;
    }
    this.project.circuit = clone(result.draft);
    const layoutOnly = ['moveComponent', 'rotateComponent', 'setComponentAppearance', 'setComponentAppearanceEdit',
      'setWireColor', 'setWireRoute'].includes(operation)
      || ['undo', 'redo'].includes(operation) && result.changeKind === 'layout';
    if (layoutOnly) {
      this.message = `Layout changed (${result.code}). Firmware and electrical authority are unchanged.`;
      this.render();
      return result;
    }
    const messages = {
      deleteSelected: `Circuit changed (${result.code}). Executable authority retired; build fresh firmware.`,
      undo: 'Circuit Undo applied. Executable authority retired; build fresh firmware.',
      redo: 'Circuit Redo applied. Executable authority retired; build fresh firmware.',
      activateEndpoint: `Cable changed (${result.code}). Executable authority retired; finish a valid circuit and build fresh firmware.`,
      connectEndpoints: `Cable created (${result.code}). Executable authority retired; finish a valid circuit and build fresh firmware.`,
      reconnectEndpoint: `Cable endpoint reconnected (${result.code}). Executable authority retired; finish a valid circuit and build fresh firmware.`,
      newProject: 'New controller-only circuit started. Add supported parts and connect named pins.',
      addComponent: `Added ${result.componentId} without inferred cables. Connect its named pins, then build fresh firmware.`,
      duplicateComponent: `Duplicated ${result.sourceComponentId} as ${result.componentId} without inferred cables. Connect its named pins, then build fresh firmware.`,
      addMissingComponent: `Added ${result.componentId} without inferred cables. Connect its named pins, then build fresh firmware.`,
      setComponentProperty: `Updated ${result.componentId}.${result.key}. Electrical rules revalidated; build fresh firmware.`,
    };
    this.invalidate(messages[operation] ?? `Circuit changed (${result.code}). Executable authority retired; build fresh firmware.`);
    return result;
  }

  projectDocument() {
    this.project.circuit = clone(this.circuitEditor.snapshot().draft);
    return normalizeRp2040PublicProject(this.project);
  }

  installPreparedProject(project, message = 'Local project revalidated. Executable state was excluded; build fresh firmware.') {
    this.project = normalizeRp2040PublicProject(project);
    this.circuitEditor = new Rp2040PicoCircuitEditor(this.project.circuit);
    this.elements.source.value = this.project.source;
    this.elements.name.value = this.project.name;
    this.invalidate(message);
    return { ok: true, code: 'OK' };
  }

  save() {
    const text = `${JSON.stringify(this.projectDocument(), null, 2)}\n`;
    const filename = `${this.project.name.replace(/[^A-Za-z0-9_.-]+/gu, '-').slice(0, 64) || 'pico-project'}.intent-mcu.json`;
    download(filename, text);
    this.message = 'Saved a data-only local project. Executable bytes were excluded.';
    this.render();
  }

  async open(file) {
    try {
      if (!file || file.size > 160 * 1024) throw new Error('RP2040_PROJECT_SIZE_LIMIT');
      const value = parseStrictJson(await file.text(), 160 * 1024);
      return this.installPreparedProject(normalizeRp2040PublicProject(value));
    } catch (error) {
      this.message = `Open rejected (${error.code ?? error.message}). The current draft is unchanged.`;
      this.render();
      return { ok: false, code: error.code ?? error.message };
    }
  }

  render() {
    const circuit = this.modelLibraryImplementation.validateProfile(
      RP2040_PICO_PROFILE, this.project.circuit, { modelLibraryLock: this.modelLibraryLock },
    );
    const wiringReady = this.circuitEditor.snapshot().wireDraft.mode === 'none';
    const authoring = validateBounded3v3AuthoringGraph({ board: RP2040_PICO_BOARD_DEFINITION,
      components: this.project.circuit.components, nets: this.project.circuit.nets });
    const runtimeCircuit = this.modelLibraryImplementation.observeRp2040(
      this.project.circuit, this.lastRuntime, { modelLibraryLock: this.modelLibraryLock },
    );
    const runnable = Boolean(this.artifact && this.artifactRevision === this.revision && circuit.ok && wiringReady);
    const building = this.phase === 'building';
    this.elements.source.value = this.project.source;
    this.elements.name.value = this.project.name;
    this.elements.state.textContent = this.phase;
    this.elements.message.textContent = this.message;
    this.elements.sourceHash.textContent = this.artifact?.sourceSha256?.slice(0, 16) ?? 'not built';
    this.elements.artifactHash.textContent = this.artifact?.uf2Sha256?.slice(0, 16) ?? 'not built';
    this.elements.build.disabled = !this.active || building || !wiringReady;
    this.elements.run.disabled = !this.active || !runnable || building
      || ['running', 'starting'].includes(this.phase);
    this.elements.pause.disabled = !this.worker;
    this.elements.reset.disabled = !this.worker;
    this.elements.stop.disabled = !this.worker && !this.artifact && !building;
    this.elements.diagram.dataset.connected = String(circuit.ok && wiringReady);
    this.elements.circuitState.textContent = !wiringReady
      ? 'Wiring in progress · executable and LED authority retired · finish or cancel before Build'
      : circuit.ok
      ? `Validated: GP0 pin 1 → ${circuit.model.resistorOhms} Ω → ${circuit.model.ledColor} LED anode/cathode → GND pin 3`
      : authoring.ok
      ? 'Authoring accepted · data-only components are structurally valid · runtime unavailable for this mixed graph'
      : describeCircuitGap(circuit.code);
    this.elements.externalLed?.classList.toggle('on', Boolean(runtimeCircuit.on));
    this.elements.externalLed?.setAttribute('aria-label', `External LED is ${runtimeCircuit.on ? 'on' : 'off'}`);
    const serial = this.lastRuntime?.instruments?.serial;
    this.elements.serial.textContent = serial?.text || 'No Pico UART output yet.';
    this.onDiagnostics({ profile: RP2040_PICO_PROFILE, revision: this.revision,
      source: this.project.source, file: 'main.c', diagnostics: clone(this.diagnostics) });
    this.publish();
  }
}
