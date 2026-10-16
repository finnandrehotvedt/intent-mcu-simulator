// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import {
  BUILD_SCHEMA, COMMAND_SCHEMA, FQBN, PROFILE, sourceForGpio2, validateBoundedSource,
} from '../c3/protocol.mjs';
import { VALIDATED_LED_CIRCUIT, validateGpio2LedCircuit } from '../c3/gpio2-adapter.mjs';
import { parseStrictJson } from './strict-json.mjs';

export const C3_PUBLIC_PROJECT_SCHEMA = 'intent-mcu-esp32c3-public-project@1';
export const C3_PUBLIC_SOURCE = sourceForGpio2('C3_PUBLIC', 'OUTPUT', 'HIGH');
const clone = (value) => structuredClone(value);
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

function validName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80
    && !/[\u0000-\u001f\u007f]/u.test(value);
}
function defaultProject() {
  return {
    schema: C3_PUBLIC_PROJECT_SCHEMA,
    name: 'ESP32-C3 GPIO2 source project',
    profile: PROFILE,
    source: C3_PUBLIC_SOURCE,
    circuit: clone(VALIDATED_LED_CIRCUIT),
  };
}
function normalizeProject(value) {
  if (!exactKeys(value, ['schema', 'name', 'profile', 'source', 'circuit'])
    || value.schema !== C3_PUBLIC_PROJECT_SCHEMA || value.profile !== PROFILE
    || !validName(value.name)) throw new Error('C3_PROJECT_INVALID');
  validateBoundedSource(value.source);
  const circuit = validateGpio2LedCircuit(value.circuit);
  if (!circuit.accepted && circuit.code !== 'CIRCUIT_DISCONNECTED') {
    throw new Error('C3_PROJECT_INVALID');
  }
  return { ...value, name: value.name.trim(), circuit: clone(value.circuit) };
}
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export class Esp32C3PublicWorkbench {
  constructor({ elements, endpoint = '/api/c3', fetchFn = globalThis.fetch,
    onState = () => {} } = {}) {
    this.elements = elements;
    this.endpoint = endpoint.replace(/\/$/u, '');
    this.fetch = fetchFn.bind(globalThis);
    this.onState = onState;
    this.project = defaultProject();
    this.revision = 1;
    this.phase = 'editing';
    this.message = 'Edit the bounded values, then build fresh ESP32-C3 flash.';
    this.terminal = 'No QEMU UART output yet.';
    this.sessionId = null;
    this.capability = null;
    this.serverGeneration = 0;
    this.artifact = null;
    this.artifactRevision = null;
    this.lastRuntime = null;
    this.active = false;
    this.requestToken = 0;
    this.invalidationTimer = null;
    this.bind();
    this.render();
  }

  mutationHeaders() {
    return { 'Content-Type': 'application/json', 'X-Intent-MCU-C3': '1',
      ...(this.capability ? { Authorization: `Bearer ${this.capability}` } : {}) };
  }
  async response(response) {
    let value;
    try { value = await response.json(); } catch { throw new Error('C3_RESPONSE_INVALID'); }
    if (!response.ok) throw Object.assign(new Error(value.code ?? 'C3_REQUEST_FAILED'), value);
    return value;
  }
  bind() {
    this.elements.source.addEventListener('input', () => {
      this.project.source = this.elements.source.value;
      this.invalidate('Source changed. The previous flash was retired.');
    });
    this.elements.name.addEventListener('change', () => {
      if (!validName(this.elements.name.value)) this.elements.name.value = this.project.name;
      else { this.project.name = this.elements.name.value.trim(); this.render(); }
    });
    this.elements.build.addEventListener('click', () => { void this.build(); });
    this.elements.run.addEventListener('click', () => { void this.run(); });
    this.elements.stop.addEventListener('click', () => { void this.dispose('C3 session discarded.'); });
    this.elements.disconnect.addEventListener('click', () => this.disconnectLed());
    this.elements.reconnect.addEventListener('click', () => this.reconnectLed());
    this.elements.save.addEventListener('click', () => this.save());
    this.elements.open.addEventListener('click', () => this.elements.openInput.click());
    this.elements.openInput.addEventListener('change', async () => {
      const file = this.elements.openInput.files?.[0];
      this.elements.openInput.value = '';
      if (file) await this.open(file);
    });
  }
  snapshot() {
    const circuit = validateGpio2LedCircuit(this.project.circuit);
    return {
      profile: PROFILE, phase: this.phase, active: this.active, revision: this.revision,
      message: this.message, project: clone(this.project),
      artifact: this.artifact ? clone(this.artifact) : null,
      runnable: Boolean(this.artifact && this.artifactRevision === this.revision),
      circuitAccepted: circuit.accepted, circuitCode: circuit.code,
      runtime: this.lastRuntime ? clone(this.lastRuntime) : null,
      actualQemuCpuUart: true, qemuPinStateObserved: false,
      gpioPeripheralModel: 'IntentForce project-owned GPIO2 register adapter',
      durableServerProject: false, transientExecutableMemoryOnly: true,
    };
  }
  publish() { const state = this.snapshot(); this.onState(state); return state; }
  async ensureSession() {
    if (this.sessionId) return true;
    const value = await this.response(await this.fetch(`${this.endpoint}/session`, {
      method: 'POST', headers: this.mutationHeaders(), body: '{}',
    }));
    this.sessionId = value.sessionId;
    this.capability = value.capability;
    this.serverGeneration = value.generation;
    return true;
  }
  commandBody(command) {
    return {
      schema: COMMAND_SCHEMA, command, generation: this.serverGeneration,
      profile: PROFILE, fqbn: FQBN,
      sourceSha256: this.artifact?.sourceSha256 ?? null,
      artifactSha256: this.artifact?.flashSha256 ?? null,
      circuit: clone(this.project.circuit),
    };
  }
  async command(command) {
    return this.response(await this.fetch(`${this.endpoint}/session/${this.sessionId}/command`, {
      method: 'POST', headers: this.mutationHeaders(), body: JSON.stringify(this.commandBody(command)),
    }));
  }
  activate() {
    this.active = true;
    this.phase = 'editing';
    this.message = 'ESP32-C3 selected. Build this exact bounded source before Run.';
    this.render();
  }
  async deactivate() {
    this.active = false;
    await this.dispose('C3 draft preserved locally. Build fresh after returning.');
  }
  invalidate(message) {
    this.requestToken += 1;
    this.artifact = null;
    this.artifactRevision = null;
    this.lastRuntime = null;
    this.terminal = 'No QEMU UART output yet.';
    this.revision += 1;
    this.phase = 'editing';
    this.message = message;
    if (this.sessionId) {
      clearTimeout(this.invalidationTimer);
      this.invalidationTimer = setTimeout(async () => {
        this.invalidationTimer = null;
        try {
          const value = await this.command('invalidate');
          this.serverGeneration = value.generation;
        } catch { await this.dispose('Transient C3 session expired.'); }
      }, 120);
    }
    this.render();
  }
  async build() {
    if (!this.active || this.phase === 'building') return { ok: false, code: 'C3_BUILD_UNAVAILABLE' };
    let parsed;
    try { parsed = validateBoundedSource(this.project.source); }
    catch {
      this.phase = 'blocked';
      this.message = 'Source rejected. Keep the complete template and edit only GPIO2 mode/level and the uppercase marker.';
      this.render();
      return { ok: false, code: 'SOURCE_POLICY_REJECTED' };
    }
    clearTimeout(this.invalidationTimer);
    this.invalidationTimer = null;
    const token = ++this.requestToken;
    const revision = this.revision;
    this.artifact = null;
    this.artifactRevision = null;
    this.lastRuntime = null;
    this.phase = 'building';
    this.message = 'Compiling in the fixed network-disabled ESP32-C3 toolchain…';
    this.render();
    try {
      await this.ensureSession();
      const receipt = await this.response(await this.fetch(
        `${this.endpoint}/session/${this.sessionId}/build`, {
          method: 'POST', headers: this.mutationHeaders(),
          body: JSON.stringify({ schema: BUILD_SCHEMA, profile: PROFILE, fqbn: FQBN,
            source: parsed.source, sourceRevision: revision }),
        },
      ));
      this.serverGeneration = receipt.generation;
      let value;
      for (let attempt = 0; attempt < 720; attempt += 1) {
        if (token !== this.requestToken || !this.active) return { ok: false, code: 'C3_BUILD_STALE' };
        const result = await this.response(await this.fetch(
          `${this.endpoint}/session/${this.sessionId}/build/${receipt.buildJobId}`,
          { headers: { Authorization: `Bearer ${this.capability}` }, cache: 'no-store' },
        ));
        if (result.status === 'succeeded') { value = result.value; break; }
        if (result.status === 'failed') throw Object.assign(new Error(result.error.code), result.error);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!value) throw new Error('BUILD_POLL_TIMEOUT');
      if (token !== this.requestToken || revision !== this.revision || !this.active) {
        return { ok: false, code: 'C3_BUILD_STALE' };
      }
      this.serverGeneration = value.generation;
      this.artifact = clone(value.artifact);
      this.artifactRevision = revision;
      this.phase = 'built';
      this.message = 'Fresh source-bound flash ready. Run starts actual Espressif QEMU CPU/UART.';
      this.render();
      return { ok: true, code: 'OK', artifact: clone(this.artifact) };
    } catch (error) {
      if (token !== this.requestToken) return { ok: false, code: 'C3_BUILD_STALE' };
      this.artifact = null;
      this.artifactRevision = null;
      this.phase = 'failed';
      this.message = `Build failed (${error.code ?? error.message}). No older flash remains runnable.`;
      this.render();
      return { ok: false, code: error.code ?? error.message };
    }
  }
  async run() {
    if (!this.active || !this.artifact || this.artifactRevision !== this.revision) {
      this.message = 'Run blocked. Build this exact source again.';
      this.render();
      return { ok: false, code: 'RUN_REQUIRES_CURRENT_BUILD' };
    }
    const token = ++this.requestToken;
    this.phase = 'running';
    this.terminal = 'Booting actual Espressif QEMU…';
    this.message = 'QEMU is executing the compiled CPU/UART path; GPIO2 is interpreted separately.';
    this.render();
    try {
      const value = await this.command('run');
      if (token !== this.requestToken || !this.active) return { ok: false, code: 'C3_RUNTIME_STALE' };
      this.serverGeneration = value.generation;
      this.lastRuntime = clone(value.runtime);
      this.terminal = value.runtime.uart.bootEpochs.map((epoch, index) =>
        `boot ${index + 1} · ${epoch.marker} · ${epoch.mode}`).join('\n');
      this.phase = 'complete';
      this.message = value.runtime.modeledCircuit.validation.accepted
        ? 'Actual QEMU CPU/UART complete. LED result comes from the separately labelled IntentForce GPIO2 register model.'
        : 'Actual QEMU CPU/UART complete. LED model stayed off because the local wire is disconnected.';
      this.render();
      return { ok: true, code: 'OK', runtime: clone(value.runtime) };
    } catch (error) {
      if (token !== this.requestToken) return { ok: false, code: 'C3_RUNTIME_STALE' };
      this.phase = 'failed';
      this.message = `Run stopped (${error.code ?? error.message}).`;
      this.render();
      return { ok: false, code: error.code ?? error.message };
    }
  }
  async dispose(message = 'C3 session discarded.') {
    this.requestToken += 1;
    clearTimeout(this.invalidationTimer);
    this.invalidationTimer = null;
    const sessionId = this.sessionId;
    const headers = this.mutationHeaders();
    const body = sessionId ? JSON.stringify(this.commandBody('dispose')) : null;
    // Retire local executable authority before waiting for the disposal
    // acknowledgement. A slow or failed network response must never leave an
    // already-stopped flash artifact runnable in this browser.
    this.sessionId = null;
    this.capability = null;
    this.serverGeneration = 0;
    this.artifact = null;
    this.artifactRevision = null;
    this.lastRuntime = null;
    this.terminal = 'No QEMU UART output yet.';
    this.phase = 'editing';
    this.message = message;
    this.render();
    try {
      if (sessionId) await this.response(await this.fetch(
        `${this.endpoint}/session/${sessionId}/command`,
        { method: 'POST', headers, body },
      ));
    } catch {}
    return { ok: true, code: 'OK' };
  }
  disposeForPageExit() {
    if (!this.sessionId || !this.capability) return;
    void this.fetch(`${this.endpoint}/session/${this.sessionId}/command`, {
      method: 'POST', headers: this.mutationHeaders(), body: JSON.stringify(this.commandBody('dispose')),
      keepalive: true,
    }).catch(() => {});
    this.sessionId = null;
    this.capability = null;
  }
  disconnectLed() {
    this.project.circuit.connections = this.project.circuit.connections.slice(0, 2);
    this.invalidate('LED return wire disconnected. QEMU may run, but the project model will keep the LED off.');
  }
  reconnectLed() {
    this.project.circuit = clone(VALIDATED_LED_CIRCUIT);
    this.invalidate('Validated GPIO2 → 220 Ω → LED → GND path restored. Build fresh.');
  }
  save() {
    download(`${this.project.name.replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '').toLowerCase() || 'c3-project'}.json`,
      `${JSON.stringify(this.project, null, 2)}\n`);
  }
  async open(file) {
    try {
      if (file.size > 16 * 1024) throw new Error('C3_PROJECT_LIMIT');
      this.project = normalizeProject(parseStrictJson(await file.text()));
      this.elements.source.value = this.project.source;
      this.elements.name.value = this.project.name;
      this.invalidate('Local C3 project opened. Build fresh flash before Run.');
      return { ok: true, code: 'OK' };
    } catch (error) {
      this.message = `Open rejected (${error.code ?? error.message}). The current project is unchanged.`;
      this.render();
      return { ok: false, code: error.code ?? error.message };
    }
  }
  render() {
    const circuit = validateGpio2LedCircuit(this.project.circuit);
    const modeled = this.lastRuntime?.modeledCircuit;
    const led = modeled?.epochs?.at(-1)?.led;
    this.elements.name.value = this.project.name;
    if (this.elements.source.value !== this.project.source) this.elements.source.value = this.project.source;
    this.elements.state.textContent = this.phase;
    this.elements.message.textContent = this.message;
    this.elements.terminal.textContent = this.terminal;
    this.elements.sourceHash.textContent = this.artifact?.sourceSha256 ?? 'not built';
    this.elements.flashHash.textContent = this.artifact?.flashSha256 ?? 'not built';
    this.elements.build.disabled = !this.active || this.phase === 'building' || this.phase === 'running';
    this.elements.run.disabled = !this.active || !this.artifact
      || this.artifactRevision !== this.revision || this.phase === 'running';
    this.elements.stop.disabled = !this.sessionId;
    this.elements.disconnect.disabled = !circuit.accepted;
    this.elements.reconnect.disabled = circuit.accepted;
    this.elements.diagram.dataset.connected = String(circuit.accepted);
    this.elements.diagram.dataset.led = led?.on ? 'on' : 'off';
    this.elements.led.setAttribute('aria-label', led?.on
      ? 'Modeled external LED is on' : 'Modeled external LED is off');
    this.elements.circuitState.textContent = circuit.accepted
      ? `Project model accepted · GPIO2 → 220 Ω → LED → GND · ${led?.code ?? 'waiting for Run'}`
      : 'Project model disconnected · actual QEMU CPU/UART remains separate';
    this.publish();
  }
}
