// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0

import { parseStrictJson } from './strict-json.mjs';
import {
  STM32_BUILD_RESPONSE_SCHEMA, STM32_BUILD_SCHEMA, STM32_PROFILE, STM32_PROJECT_SCHEMA,
  STM32_RUN_RESPONSE_SCHEMA, STM32_RUN_SCHEMA, exactKeys, sourceForStm32, validateStm32Source,
} from '../stm32/protocol.mjs';
import {
  Stm32CircuitEditor, createStm32CircuitDraft, normalizeStm32CircuitDraft, validateStm32Circuit,
} from './stm32-public-circuit.mjs';

export const STM32_PUBLIC_SOURCE = sourceForStm32('STM32 PUBLIC', true);
export const STM32_EDITABLE_PROJECT_SCHEMA = 'intent-mcu-stm32-public-project@2';
const clone = (value) => value === null || value === undefined ? value : structuredClone(value);

function validName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80
    && !/[\u0000-\u001f\u007f]/u.test(value);
}
function defaultProject() {
  return { schema: STM32_EDITABLE_PROJECT_SCHEMA, name: 'STM32F429 PB0 source project',
    profile: STM32_PROFILE, source: STM32_PUBLIC_SOURCE,
    circuit: normalizeStm32CircuitDraft(createStm32CircuitDraft()) };
}
function normalizeProject(value) {
  const legacy = value?.schema === STM32_PROJECT_SCHEMA;
  const keys = legacy ? ['schema', 'name', 'profile', 'source']
    : ['schema', 'name', 'profile', 'source', 'circuit'];
  if (!exactKeys(value, keys)
    || (!legacy && value.schema !== STM32_EDITABLE_PROJECT_SCHEMA)
    || value.profile !== STM32_PROFILE || !validName(value.name)) throw new Error('STM32_PROJECT_INVALID');
  validateStm32Source(value.source);
  return { schema: STM32_EDITABLE_PROJECT_SCHEMA, name: value.name.trim(), profile: STM32_PROFILE,
    source: value.source,
    circuit: legacy ? normalizeStm32CircuitDraft(createStm32CircuitDraft())
      : normalizeStm32CircuitDraft(value.circuit) };
}
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
function bytesFromBase64(value) {
  if (typeof value !== 'string' || value.length % 4 !== 0
    || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) throw new Error('STM32_ARTIFACT_ENCODING');
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function base64FromBytes(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}
async function sha256(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export class Stm32PublicWorkbench {
  constructor({ elements, endpoint = '/api/stm32', fetchFn = globalThis.fetch,
    onState = () => {} } = {}) {
    this.elements = elements;
    this.endpoint = endpoint.replace(/\/$/u, '');
    this.fetch = fetchFn.bind(globalThis);
    this.onState = onState;
    this.project = defaultProject();
    this.circuitEditor = new Stm32CircuitEditor(this.project.circuit);
    this.revision = 1;
    this.phase = 'editing';
    this.message = 'Edit the two bounded values, then build a fresh STM32 ELF.';
    this.artifact = null;
    this.artifactBytes = null;
    this.artifactRevision = null;
    this.result = null;
    this.terminal = 'No Renode execution yet.';
    this.active = false;
    this.requestToken = 0;
    this.operation = null;
    this.bind();
    this.render();
  }
  headers() { return { 'Content-Type': 'application/json', 'X-Intent-MCU-STM32': '1' }; }
  async response(response) {
    let value;
    try { value = await response.json(); } catch { throw new Error('STM32_RESPONSE_INVALID'); }
    if (!response.ok) throw Object.assign(new Error(value.code ?? 'STM32_REQUEST_FAILED'), value);
    return value;
  }
  bind() {
    this.elements.source.addEventListener('input', () => {
      this.project.source = this.elements.source.value;
      this.invalidate('Source changed. Earlier executable authority was retired.');
    });
    this.elements.name.addEventListener('change', () => {
      if (!validName(this.elements.name.value)) this.elements.name.value = this.project.name;
      else { this.project.name = this.elements.name.value.trim(); this.render(); }
    });
    this.elements.build.addEventListener('click', () => { void this.build(); });
    this.elements.run.addEventListener('click', () => { void this.run(false); });
    this.elements.reset.addEventListener('click', () => { void this.run(true); });
    this.elements.stop.addEventListener('click', () => this.stop('STM32 executable discarded.'));
    this.elements.save.addEventListener('click', () => this.save());
    this.elements.open.addEventListener('click', () => this.elements.openInput.click());
    this.elements.openInput.addEventListener('change', async () => {
      const file = this.elements.openInput.files?.[0];
      this.elements.openInput.value = '';
      if (file) await this.open(file);
    });
  }
  wipeArtifact() {
    this.artifactBytes?.fill(0);
    this.artifactBytes = null;
    this.artifact = null;
    this.artifactRevision = null;
    this.result = null;
    this.terminal = 'No Renode execution yet.';
  }
  snapshot() {
    const circuit = validateStm32Circuit(this.project.circuit);
    const wiringReady = this.circuitEditor.snapshot().wireDraft.mode === 'none';
    return {
      profile: STM32_PROFILE, phase: this.phase, active: this.active, revision: this.revision,
      message: this.message, project: clone(this.project), artifact: clone(this.artifact),
      circuitEditor: this.circuitEditor.snapshot(),
      runnable: Boolean(this.artifact && this.artifactRevision === this.revision && circuit.ok && wiringReady),
      circuitAccepted: circuit.ok && wiringReady,
      circuitCode: wiringReady ? circuit.code : 'STM32_WIRING_IN_PROGRESS',
      runtime: clone(this.result), actualRenodeExecution: true, actualPb0Observed: true,
      circuitModel: 'Ideal teaching LED path driven by Renode-observed PB0',
      transientExecutableMemoryOnly: true, durableServerProject: false,
    };
  }
  publish() { const state = this.snapshot(); this.onState(state); return state; }
  activate() {
    this.active = true;
    this.phase = 'editing';
    this.message = 'STM32F429ZI selected. Build this exact bounded source before Run.';
    this.render();
  }
  deactivate() {
    this.active = false;
    this.stop('STM32 draft preserved locally. Build fresh after returning.');
  }
  invalidate(message) {
    this.requestToken += 1;
    this.operation?.abort();
    this.operation = null;
    this.wipeArtifact();
    this.revision += 1;
    this.phase = 'editing';
    this.message = message;
    this.render();
  }
  async build() {
    if (!this.active || ['building', 'running'].includes(this.phase)) {
      return { ok: false, code: 'STM32_BUILD_UNAVAILABLE' };
    }
    if (this.circuitEditor.snapshot().wireDraft.mode !== 'none') {
      this.phase = 'blocked';
      this.message = 'Build blocked while a cable endpoint is being chosen. Finish the cable or press Escape, then build a fresh ELF.';
      this.render();
      return { ok: false, code: 'STM32_WIRING_IN_PROGRESS' };
    }
    const circuit = validateStm32Circuit(this.project.circuit);
    if (!circuit.ok) {
      this.wipeArtifact();
      this.phase = 'blocked';
      this.message = `Circuit blocked (${circuit.code}). Complete the exact PB0 CN11 pin 34 → resistor → LED → GND CN11 pin 35 path.`;
      this.render();
      return { ok: false, code: circuit.code };
    }
    let parsed;
    try { parsed = validateStm32Source(this.project.source); }
    catch {
      this.wipeArtifact();
      this.phase = 'blocked';
      this.message = 'Source rejected. Keep the complete template and edit only PB0 HIGH/LOW and the uppercase marker.';
      this.render();
      return { ok: false, code: 'SOURCE_POLICY_REJECTED' };
    }
    this.wipeArtifact();
    const token = ++this.requestToken;
    const revision = this.revision;
    const operation = new AbortController();
    this.operation = operation;
    this.phase = 'building';
    this.message = 'Compiling in the fixed network-disabled ARM GNU toolchain…';
    this.render();
    try {
      const value = await this.response(await this.fetch(`${this.endpoint}/build`, {
        method: 'POST', headers: this.headers(), signal: operation.signal,
        body: JSON.stringify({ schema: STM32_BUILD_SCHEMA, profile: STM32_PROFILE,
          sourceRevision: revision, source: parsed.source }),
      }));
      if (token !== this.requestToken || revision !== this.revision || !this.active) {
        return { ok: false, code: 'STM32_BUILD_STALE' };
      }
      if (value.schema !== STM32_BUILD_RESPONSE_SCHEMA || value.profile !== STM32_PROFILE
        || value.sourceRevision !== revision || value.sourceSha256 !== await sha256(parsed.source)
        || value.retainedServerBytes !== 0 || value.durableServerProject !== false
        || value.artifact?.format !== 'elf32') throw new Error('STM32_RESPONSE_INVALID');
      const bytes = bytesFromBase64(value.artifact.base64);
      const elfSha256 = await sha256(bytes);
      if (bytes.byteLength !== value.artifact.bytes || elfSha256 !== value.artifact.sha256) {
        bytes.fill(0);
        throw new Error('STM32_ARTIFACT_IDENTITY');
      }
      if (token !== this.requestToken || revision !== this.revision) {
        bytes.fill(0);
        return { ok: false, code: 'STM32_BUILD_STALE' };
      }
      this.artifactBytes = bytes;
      this.artifactRevision = revision;
      this.artifact = { format: 'elf32', bytes: bytes.byteLength, sha256: elfSha256,
        sourceSha256: value.sourceSha256, behavior: clone(value.behavior),
        compiler: clone(value.compiler) };
      this.phase = 'built';
      this.message = 'Fresh source-bound ELF ready. Run starts a new isolated Renode process.';
      this.render();
      return { ok: true, code: 'OK', artifact: clone(this.artifact) };
    } catch (error) {
      if (token !== this.requestToken) return { ok: false, code: 'STM32_BUILD_STALE' };
      this.wipeArtifact();
      this.phase = error.name === 'AbortError' ? 'editing' : 'blocked';
      this.message = error.name === 'AbortError' ? 'Build cancelled; no executable retained.'
        : `Build rejected: ${error.code ?? error.message}. No stale executable remains.`;
      this.render();
      return { ok: false, code: error.code ?? error.message };
    } finally { if (this.operation === operation) this.operation = null; }
  }
  async run(reset = false) {
    const circuit = validateStm32Circuit(this.project.circuit);
    if (!this.active || !this.artifact || !this.artifactBytes
      || this.artifactRevision !== this.revision || !circuit.ok || ['building', 'running'].includes(this.phase)) {
      return { ok: false, code: 'STM32_RUN_UNAVAILABLE' };
    }
    let parsed;
    try { parsed = validateStm32Source(this.project.source); }
    catch { this.invalidate('Source no longer passes policy.'); return { ok: false, code: 'SOURCE_POLICY_REJECTED' }; }
    const sourceSha256 = await sha256(parsed.source);
    if (sourceSha256 !== this.artifact.sourceSha256) {
      this.invalidate('Source identity changed.');
      return { ok: false, code: 'STM32_RUN_STALE' };
    }
    const token = ++this.requestToken;
    const operation = new AbortController();
    this.operation = operation;
    this.phase = 'running';
    this.message = reset ? 'Reset: replaying the same accepted ELF in a fresh Renode process…'
      : 'Running the accepted ELF in isolated Renode…';
    this.render();
    try {
      const value = await this.response(await this.fetch(`${this.endpoint}/run`, {
        method: 'POST', headers: this.headers(), signal: operation.signal,
        body: JSON.stringify({ schema: STM32_RUN_SCHEMA, profile: STM32_PROFILE,
          sourceRevision: this.revision, source: parsed.source, sourceSha256,
          artifact: { format: 'elf32', bytes: this.artifact.bytes,
            sha256: this.artifact.sha256, base64: base64FromBytes(this.artifactBytes) } }),
      }));
      if (token !== this.requestToken || this.artifactRevision !== this.revision) {
        return { ok: false, code: 'STM32_RUN_STALE' };
      }
      if (value.schema !== STM32_RUN_RESPONSE_SCHEMA || value.profile !== STM32_PROFILE
        || value.sourceSha256 !== sourceSha256 || value.elfSha256 !== this.artifact.sha256
        || value.engine?.id !== 'renode' || value.engine?.actualExecution !== true
        || value.resetReplay !== true || value.bootEpochs !== 2 || value.retainedServerBytes !== 0) {
        throw new Error('STM32_RUNTIME_RESPONSE_INVALID');
      }
      this.result = clone(value);
      this.phase = 'completed';
      const level = value.observed.pb0 ? 'HIGH' : 'LOW';
      this.message = `Actual Renode completed: PB0 ${level}; USART3 marker verified across two boot epochs.`;
      this.terminal = `ACTUAL RENODE ${value.engine.version}\nBOOT EPOCHS: 2 · RESET REPLAY VERIFIED\nPB0: ${level}\nUSART3> ${value.observed.uartText}`;
      this.render();
      return { ok: true, code: 'OK', result: clone(value) };
    } catch (error) {
      if (token !== this.requestToken) return { ok: false, code: 'STM32_RUN_STALE' };
      this.result = null;
      this.phase = error.name === 'AbortError' ? 'built' : 'blocked';
      this.message = error.name === 'AbortError' ? 'Run stopped. Accepted ELF remains available until discarded.'
        : `Run failed: ${error.code ?? error.message}.`;
      this.terminal = 'No accepted Renode result.';
      this.render();
      return { ok: false, code: error.code ?? error.message };
    } finally { if (this.operation === operation) this.operation = null; }
  }
  stop(message = 'STM32 executable discarded.') {
    this.requestToken += 1;
    this.operation?.abort();
    this.operation = null;
    this.wipeArtifact();
    this.phase = this.active ? 'editing' : 'inactive';
    this.message = `${message} Fresh Build is required before Run.`;
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
      return { ok: false, code: 'STM32_CIRCUIT_OPERATION_INVALID' };
    }
    const revision = this.circuitEditor.revision;
    const result = this.circuitEditor[operation](...args);
    if (!result.ok) {
      if (['addMissingComponent', 'setComponentProperty'].includes(operation)) {
        this.message = `Part change rejected (${result.code}). The circuit and ELF authority are unchanged.`;
      }
      this.render(); return result;
    }
    if (result.revision === revision) {
      if (result.wireDraft?.mode !== 'none') {
        this.invalidate('Wiring in progress. ELF and LED authority were retired; finish or cancel, then build fresh.');
      } else this.render();
      return result;
    }
    this.project.circuit = clone(result.draft);
    const messages = {
      deleteSelected: `Circuit changed (${result.code}). ELF and LED authority retired; restore valid wiring and build fresh.`,
      undo: 'Circuit Undo applied. ELF and LED authority retired; build fresh.',
      redo: 'Circuit Redo applied. ELF and LED authority retired; build fresh.',
      moveComponent: 'Component moved; named pin attachments and orthogonal wires were recomputed. Build fresh.',
      rotateComponent: 'Component rotated; named pin attachments and orthogonal wires were recomputed. Build fresh.',
      activateEndpoint: `Cable changed (${result.code}). ELF and LED authority retired; finish a valid circuit and build fresh.`,
      connectEndpoints: `Cable created (${result.code}). ELF and LED authority retired; finish a valid circuit and build fresh.`,
      reconnectEndpoint: `Cable endpoint reconnected (${result.code}). ELF and LED authority retired; finish a valid circuit and build fresh.`,
      addMissingComponent: `Added ${result.componentId} without inferred cables. Connect its named pins, then build fresh.`,
      setComponentProperty: `Updated ${result.componentId}.${result.key}. Electrical rules revalidated; build fresh.`,
    };
    this.invalidate(messages[operation] ?? `Circuit changed (${result.code}). ELF and LED authority retired; build fresh.`);
    return result;
  }
  save() {
    try {
      this.project.circuit = clone(this.circuitEditor.snapshot().draft);
      const project = normalizeProject({ ...this.project, source: this.elements.source.value,
        name: this.elements.name.value, circuit: this.project.circuit });
      this.project = project;
      download(`${project.name.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || 'stm32-project'}.json`,
        `${JSON.stringify(project, null, 2)}\n`);
      this.message = 'Saved project data only. ELF and runtime state were excluded.';
      this.render();
      return { ok: true, code: 'OK' };
    } catch (error) {
      this.message = `Save rejected: ${error.code ?? error.message}. Fix the project before saving.`;
      this.render();
      return { ok: false, code: error.code ?? error.message };
    }
  }
  async open(file) {
    try {
      if (file.size > 8192) throw new Error('STM32_PROJECT_SIZE');
      const project = normalizeProject(parseStrictJson(await file.text(), 8192));
      this.project = project;
      this.circuitEditor = new Stm32CircuitEditor(project.circuit);
      this.elements.name.value = project.name;
      this.elements.source.value = project.source;
      this.invalidate('Project data opened. Executable state was excluded.');
      return { ok: true, code: 'OK' };
    } catch (error) {
      this.message = `Open rejected: ${error.code ?? error.message}. Existing project preserved.`;
      this.render();
      return { ok: false, code: error.code ?? error.message };
    }
  }
  render() {
    const circuit = validateStm32Circuit(this.project.circuit);
    const wiringReady = this.circuitEditor.snapshot().wireDraft.mode === 'none';
    const runnable = Boolean(this.artifact && this.artifactRevision === this.revision && circuit.ok && wiringReady);
    this.elements.name.value = this.project.name;
    if (this.elements.source.value !== this.project.source) this.elements.source.value = this.project.source;
    this.elements.state.textContent = this.phase;
    this.elements.message.textContent = this.message;
    this.elements.sourceHash.textContent = this.artifact?.sourceSha256 ?? 'not built';
    this.elements.artifactHash.textContent = this.artifact?.sha256 ?? 'not built';
    this.elements.build.disabled = !this.active || ['building', 'running'].includes(this.phase) || !wiringReady;
    this.elements.run.disabled = !this.active || !runnable || ['building', 'running'].includes(this.phase);
    this.elements.reset.disabled = !this.active || !runnable || ['building', 'running'].includes(this.phase);
    this.elements.stop.disabled = !this.active || (!runnable && !this.operation);
    this.elements.terminal.textContent = this.terminal;
    const on = Boolean(circuit.ok && wiringReady && this.result?.observed?.pb0);
    this.elements.diagram.dataset.led = on ? 'on' : 'off';
    this.elements.led?.setAttribute('aria-label', `External teaching LED is ${on ? 'on' : 'off'}`);
    this.elements.diagram.dataset.connected = String(circuit.ok && wiringReady);
    this.elements.circuitState.textContent = !wiringReady
      ? 'Wiring in progress · ELF and LED authority retired · finish or cancel before Build'
      : !circuit.ok
      ? `Teaching circuit rejected (${circuit.code}) · stale ELF and LED authority retired`
      : this.result
        ? `Renode observed PB0 ${on ? 'HIGH' : 'LOW'} · ideal ${circuit.model.resistorOhms} Ω / ${circuit.model.ledColor} LED teaching path renders ${on ? 'ON' : 'OFF'}`
        : `Named path: PB0 CN11 pin 34 → ${circuit.model.resistorOhms} Ω → ${circuit.model.ledColor} LED → GND CN11 pin 35 · awaiting actual Renode observation`;
    this.publish();
  }
}
