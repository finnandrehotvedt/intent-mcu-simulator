// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  RP2040_PICO_PROFILE,
  Rp2040PicoCircuitEditor,
  createRp2040PicoCircuitDraft,
  normalizeRp2040PicoCircuitDraft,
  observeRp2040PicoCircuit,
  validateRp2040PicoCircuit,
} from './rp2040-pico-circuit.mjs';
import { parseStrictJson } from './strict-json.mjs';
import { boundedPolicyDiagnostic, normalizeSourceDiagnostics } from './source-diagnostics.mjs';

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
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const clone = (value) => structuredClone(value);

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
  constructor({ elements, onState = () => {}, onDiagnostics = () => {}, onSave = null, onOpen = null } = {}) {
    this.elements = elements;
    this.onState = onState;
    this.onDiagnostics = onDiagnostics;
    this.onSave = onSave;
    this.onOpen = onOpen;
    this.project = defaultProject();
    this.circuitEditor = new Rp2040PicoCircuitEditor(this.project.circuit);
    this.revision = 1;
    this.phase = 'editing';
    this.message = 'Edit the two bounded values, then build fresh firmware.';
    this.artifact = null;
    this.artifactBytes = null;
    this.artifactRevision = null;
    this.worker = null;
    this.workerGeneration = 0;
    this.abort = null;
    this.active = false;
    this.lastRuntime = null;
    this.diagnostics = [];
    this.bind();
    this.render();
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
    const circuit = validateRp2040PicoCircuit(this.project.circuit);
    const wiringReady = this.circuitEditor.snapshot().wireDraft.mode === 'none';
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
      circuitObservation: observeRp2040PicoCircuit(this.project.circuit, this.lastRuntime),
      artifact: this.artifact ? clone(this.artifact) : null,
      runnable: Boolean(this.artifact && this.artifactRevision === this.revision && circuit.ok && wiringReady),
      runtime: this.lastRuntime ? clone(this.lastRuntime) : null,
      diagnostics: clone(this.diagnostics),
      durableServerProject: false,
      transientExecutableMemoryOnly: true,
    };
  }

  publish() {
    const state = this.snapshot();
    this.onState(state);
    return state;
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
    this.workerGeneration += 1;
    if (this.worker) {
      this.worker.postMessage({ command: 'dispose' });
      this.worker.terminate();
    }
    this.worker = null;
    this.lastRuntime = null;
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
    if (!response.ok) throw Object.assign(new Error(value.code ?? 'RP2040_BUILD_FAILED'), value);
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

  async build() {
    if (!this.active || this.phase === 'building') return { ok: false, code: 'RP2040_BUILD_UNAVAILABLE' };
    if (this.circuitEditor.snapshot().wireDraft.mode !== 'none') {
      this.phase = 'blocked';
      this.message = 'Build blocked while a cable endpoint is being chosen. Finish the cable or press Escape, then build fresh firmware.';
      this.render();
      return { ok: false, code: 'RP2040_WIRING_IN_PROGRESS' };
    }
    const circuit = validateRp2040PicoCircuit(this.project.circuit);
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
      this.message = `Build failed (${error.code ?? error.message}). No older artifact remains runnable.`;
      this.render();
      return { ok: false, code: error.code ?? error.message };
    }
  }

  async run() {
    const circuit = validateRp2040PicoCircuit(this.project.circuit);
    if (!this.active || !this.artifact || this.artifactRevision !== this.revision
        || !(this.artifactBytes instanceof Uint8Array) || !circuit.ok) {
      this.message = 'Run blocked. Reconnect the validated circuit and build this exact source again.';
      this.render();
      return { ok: false, code: 'RUN_REQUIRES_CURRENT_BUILD' };
    }
    if (this.worker && this.phase === 'paused') {
      this.worker.postMessage({ command: 'run' });
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
      this.lastRuntime = data;
      if (data.kind === 'ready') {
        this.phase = 'running';
        this.message = 'Pico runtime started. GPIO0 and UART0 come from the compiled source.';
        worker.postMessage({ command: 'run' });
      } else if (data.kind === 'stopped-error' || data.kind === 'error') {
        this.phase = 'failed';
        this.message = `Runtime stopped (${data.message ?? 'bounded runtime error'}).`;
      } else this.phase = data.paused ? 'paused' : 'running';
      this.render();
    });
    worker.addEventListener('error', (event) => {
      if (generation !== this.workerGeneration) return;
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
    if (!this.worker) return { ok: false, code: 'RUNTIME_NOT_ACTIVE' };
    this.worker.postMessage({ command: 'pause' });
    return { ok: true, code: 'OK' };
  }

  reset() {
    if (!this.worker) return { ok: false, code: 'RUNTIME_NOT_ACTIVE' };
    this.worker.postMessage({ command: 'reset' });
    this.message = 'Pico runtime reset to the source-bound artifact entry point.';
    this.render();
    return { ok: true, code: 'OK' };
  }

  stop() {
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

  selectCircuit(selection) {
    const result = this.circuitEditor.select(selection);
    this.render();
    return result;
  }

  editCircuit(operation, ...args) {
    if (!['deleteSelected', 'undo', 'redo', 'moveComponent', 'rotateComponent',
      'activateEndpoint', 'beginReconnect', 'cancelWireDraft', 'connectEndpoints', 'reconnectEndpoint',
      'addMissingComponent', 'setComponentProperty'].includes(operation)) {
      return { ok: false, code: 'RP2040_CIRCUIT_OPERATION_INVALID' };
    }
    const revision = this.circuitEditor.revision;
    const result = this.circuitEditor[operation](...args);
    if (!result.ok) {
      if (['addMissingComponent', 'setComponentProperty'].includes(operation)) {
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
    const messages = {
      deleteSelected: `Circuit changed (${result.code}). Executable authority retired; build fresh firmware.`,
      undo: 'Circuit Undo applied. Executable authority retired; build fresh firmware.',
      redo: 'Circuit Redo applied. Executable authority retired; build fresh firmware.',
      moveComponent: 'Component moved; named pin attachments and orthogonal wires were recomputed. Build fresh firmware.',
      rotateComponent: 'Component rotated; named pin attachments and orthogonal wires were recomputed. Build fresh firmware.',
      activateEndpoint: `Cable changed (${result.code}). Executable authority retired; finish a valid circuit and build fresh firmware.`,
      connectEndpoints: `Cable created (${result.code}). Executable authority retired; finish a valid circuit and build fresh firmware.`,
      reconnectEndpoint: `Cable endpoint reconnected (${result.code}). Executable authority retired; finish a valid circuit and build fresh firmware.`,
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
    const circuit = validateRp2040PicoCircuit(this.project.circuit);
    const wiringReady = this.circuitEditor.snapshot().wireDraft.mode === 'none';
    const runtimeCircuit = observeRp2040PicoCircuit(this.project.circuit, this.lastRuntime);
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
      : `Disconnected / rejected: ${circuit.code}`;
    this.elements.externalLed?.classList.toggle('on', Boolean(runtimeCircuit.on));
    this.elements.externalLed?.setAttribute('aria-label', `External LED is ${runtimeCircuit.on ? 'on' : 'off'}`);
    const serial = this.lastRuntime?.instruments?.serial;
    this.elements.serial.textContent = serial?.text || 'No Pico UART output yet.';
    this.onDiagnostics({ profile: RP2040_PICO_PROFILE, revision: this.revision,
      source: this.project.source, file: 'main.c', diagnostics: clone(this.diagnostics) });
    this.publish();
  }
}
