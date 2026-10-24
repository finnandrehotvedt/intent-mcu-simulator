// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import {
  BUILD_SCHEMA, COMMAND_SCHEMA, FQBN, PROFILE, sourceForGpio2, validateBoundedSource,
} from '../c3/protocol.mjs';
import {
  Esp32C3CircuitEditor,
  createEsp32C3CircuitDraft,
  normalizeEsp32C3CircuitDraft,
} from './esp32c3-public-circuit.mjs';
import { parseStrictJson } from './strict-json.mjs';
import { boundedPolicyDiagnostic, normalizeSourceDiagnostics } from './source-diagnostics.mjs';
import { isRetryableCapacityCode, retryGuidanceFromResponse, retryMessage, retryResultFields } from './retry-guidance.mjs';
import {
  CURRENT_MODEL_LIBRARY_LOCK, modelLibraryExecutionIdentity, normalizeModelLibraryLock,
  resolveModelLibrary,
} from './model-library.mjs';
import { ESP32C3_EXECUTION_IDENTITIES } from './esp32c3-execution-identities.mjs';

export const C3_PUBLIC_PROJECT_SCHEMA = 'intent-mcu-esp32c3-public-project@1';
export const C3_PUBLIC_SOURCE = sourceForGpio2('C3_PUBLIC', 'OUTPUT', 'HIGH');
const SOURCE_LINE_PATTERNS = Object.freeze([
  /^\/\/ Copyright 2026 IntentForce$/u, /^\/\/ SPDX-License-Identifier: Apache-2\.0$/u, /^$/u,
  /^void setup\(\) \{$/u, /^  Serial\.begin\(115200\);$/u,
  /^  pinMode\(2, (?:OUTPUT|INPUT)\);$/u, /^  digitalWrite\(2, (?:HIGH|LOW)\);$/u,
  /^  Serial\.println\("[A-Z0-9][A-Z0-9:_-]{2,63}"\);$/u, /^\}$/u, /^$/u,
  /^void loop\(\) \{$/u, /^  delay\(1000\);$/u, /^\}$/u, /^$/u,
]);
const clone = (value) => structuredClone(value);
function describeCircuitGap(code) {
  return ({
    C3_SERIES_RESISTOR_REQUIRED: 'Missing resistor: add the supported series resistor between GPIO2 and the LED anode path.',
    C3_GROUND_REQUIRED: 'Missing ground: connect LED cathode to ESP32-C3 GND J1 pin 6.',
    C3_LED_REVERSE_POLARITY: 'LED polarity is reversed: anode must face GPIO2 through the resistor; cathode must face GND.',
    C3_LED_OVERCURRENT: 'LED current is above the teaching limit: increase the series resistance.',
    C3_PATH_OPEN: 'Open LED path: complete GPIO2 J1 pin 4 → resistor → LED anode, then LED cathode → GND J1 pin 6.',
  })[code] ?? `Circuit rejected (${code}). Inspect the highlighted supported parts and named pins.`;
}
const SHA256 = /^[0-9a-f]{64}$/u;
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
    circuit: normalizeEsp32C3CircuitDraft(createEsp32C3CircuitDraft()),
  };
}
export function validateEsp32C3Retirement(value, expected) {
  const hash = (actual, wanted) => actual === wanted
    && (actual === null || SHA256.test(actual));
  if (!exactKeys(value, ['schema', 'sessionId', 'generation', 'sourceSha256',
    'artifactSha256', 'state', 'retainedBytes', 'processExited', 'operationRetired'])
    || value.schema !== 'intent-mcu-c3-retirement@1'
    || value.sessionId !== expected.sessionId || value.generation !== expected.generation
    || !hash(value.sourceSha256, expected.sourceSha256)
    || !hash(value.artifactSha256, expected.artifactSha256)
    || value.state !== 'disposed' || value.retainedBytes !== 0
    || value.processExited !== true || value.operationRetired !== true) {
    throw new Error('C3_RETIREMENT_ACK_INVALID');
  }
  return { ok: true, code: 'C3_RETIREMENT_PROVEN' };
}
export function normalizeEsp32C3PublicProject(value) {
  if (!exactKeys(value, ['schema', 'name', 'profile', 'source', 'circuit'])
    || value.schema !== C3_PUBLIC_PROJECT_SCHEMA || value.profile !== PROFILE
    || !validName(value.name)) throw new Error('C3_PROJECT_INVALID');
  validateBoundedSource(value.source);
  return { ...value, name: value.name.trim(), circuit: normalizeEsp32C3CircuitDraft(value.circuit) };
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
    onState = () => {}, onDiagnostics = () => {}, onSave = null, onOpen = null,
    dispatchAction = (_action, task) => task(), advanceGuard = () => ({ ok: true }) } = {}) {
    this.elements = elements;
    this.endpoint = endpoint.replace(/\/$/u, '');
    this.fetch = fetchFn.bind(globalThis);
    this.onState = onState;
    this.onDiagnostics = onDiagnostics;
    this.onSave = onSave;
    this.onOpen = onOpen;
    this.dispatchAction = dispatchAction;
    this.advanceGuard = advanceGuard;
    this.project = defaultProject();
    this.modelLibraryLock = clone(CURRENT_MODEL_LIBRARY_LOCK);
    this.modelLibraryImplementation = resolveModelLibrary(this.modelLibraryLock).implementation;
    this.circuitEditor = new Esp32C3CircuitEditor(this.project.circuit);
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
    this.retirementOwner = null;
    this.sessionCreationOwner = null;
    this.diagnostics = [];
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
    if (!response.ok) {
      const code = value.code ?? 'C3_REQUEST_FAILED';
      const guidance = retryGuidanceFromResponse(response.headers.get('retry-after'), value);
      throw Object.assign(new Error(isRetryableCapacityCode(code) ? retryMessage(code, guidance) : code), value,
        guidance ? retryResultFields(value) : {});
    }
    return value;
  }
  bind() {
    this.elements.source.addEventListener('input', () => {
      this.project.source = this.elements.source.value;
      this.invalidate('Source changed. The previous flash was retired.');
    });
    this.elements.name.addEventListener('input', () => {
      if (validName(this.elements.name.value)) this.project.name = this.elements.name.value.trim();
    });
    this.elements.name.addEventListener('change', () => {
      if (!validName(this.elements.name.value)) this.elements.name.value = this.project.name;
      else { this.project.name = this.elements.name.value.trim(); this.render(); }
    });
    this.elements.build.addEventListener('click', () => { void this.dispatchAction('firmware.build',
      (permit) => this.build({ advancePermit: permit })); });
    this.elements.run.addEventListener('click', () => { void this.dispatchAction('runtime.run',
      (permit, binding) => this.run({ advancePermit: permit, x92Binding: binding })); });
    this.elements.stop.addEventListener('click', () => { void this.dispose('C3 session discarded.'); });
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
      PROFILE, this.project.circuit, { modelLibraryLock: this.modelLibraryLock },
    );
    const modelLibrary = modelLibraryExecutionIdentity(this.modelLibraryLock);
    const wiringReady = this.circuitEditor.snapshot().wireDraft.mode === 'none';
    return {
      profile: PROFILE, phase: this.phase, active: this.active, revision: this.revision,
      message: this.message, project: clone(this.project),
      circuitEditor: this.circuitEditor.snapshot(),
      artifact: this.artifact ? clone(this.artifact) : null,
      runnable: Boolean(this.artifact && this.artifactRevision === this.revision && circuit.ok && wiringReady),
      circuitAccepted: circuit.ok && wiringReady,
      circuitCode: wiringReady ? circuit.code : 'C3_WIRING_IN_PROGRESS',
      runtime: this.lastRuntime ? clone(this.lastRuntime) : null,
      actualQemuCpuUart: true, qemuPinStateObserved: false,
      gpioPeripheralModel: 'IntentForce project-owned GPIO2 register adapter',
      durableServerProject: false, transientExecutableMemoryOnly: true,
      diagnostics: clone(this.diagnostics),
      modelLibrary: modelLibrary.ok ? clone(modelLibrary.identity) : { code: modelLibrary.code },
    };
  }
  publish() { const state = this.snapshot(); this.onState(state); return state; }
  x92Binding({ projectGeneration, graphIdentity } = {}) {
    if (!this.sessionId || !this.artifact || this.artifactRevision !== this.revision
        || !Number.isSafeInteger(projectGeneration) || projectGeneration < 1
        || !/^sha256:[a-f0-9]{64}$/u.test(graphIdentity ?? '')) {
      throw Object.assign(new Error('X92_C3_BINDING_UNAVAILABLE'), { code: 'X92_C3_BINDING_UNAVAILABLE' });
    }
    return Object.freeze({
      schema: 'intent-mcu-x92-c3-execution-binding@1', profile: PROFILE,
      sessionId: this.sessionId, generation: this.serverGeneration, projectGeneration,
      sourceIdentity: `sha256:${this.artifact.sourceSha256}`,
      graphIdentity, flashIdentity: `sha256:${this.artifact.flashSha256}`,
      compiler: { imageIdentity: ESP32C3_EXECUTION_IDENTITIES.compilerImageIdentity,
        toolchainIdentity: ESP32C3_EXECUTION_IDENTITIES.compilerToolchainIdentity },
      runtime: { imageIdentity: ESP32C3_EXECUTION_IDENTITIES.runtimeImageIdentity,
        binaryIdentity: ESP32C3_EXECUTION_IDENTITIES.runtimeBinaryIdentity },
    });
  }
  async quiesceForX92(binding) {
    const current = this.x92Binding({ projectGeneration: binding.projectGeneration,
      graphIdentity: binding.graphIdentity });
    if (JSON.stringify(current) !== JSON.stringify(binding)) {
      throw Object.assign(new Error('X92_C3_BINDING_STALE'), { code: 'X92_C3_BINDING_STALE' });
    }
    return this.command('quiesce');
  }
  setModelLibraryLock(lock) {
    const normalized = normalizeModelLibraryLock(lock);
    if (!normalized.ok) throw Object.assign(new Error(normalized.code), normalized);
    this.modelLibraryLock = clone(normalized.lock);
    this.modelLibraryImplementation = resolveModelLibrary(this.modelLibraryLock).implementation;
  }
  async ensureSession() {
    if (this.retirementOwner?.status !== 'proven' && this.retirementOwner) {
      throw new Error('C3_RETIREMENT_UNPROVEN');
    }
    if (this.retirementOwner?.status === 'proven') this.retirementOwner = null;
    if (this.sessionId) return true;
    if (!this.sessionCreationOwner) {
      const ticket = {
        token: this.requestToken, revision: this.revision, active: this.active, retiring: false,
        circuit: this.modelLibraryImplementation.profileRuntimeCircuit(
          PROFILE, this.project.circuit, { modelLibraryLock: this.modelLibraryLock },
        ), promise: null,
      };
      ticket.promise = Promise.resolve().then(async () => {
        const value = await this.response(await this.fetch(`${this.endpoint}/session`, {
          method: 'POST', headers: this.mutationHeaders(), body: '{}',
        }));
        const identity = { sessionId: value.sessionId, capability: value.capability,
          generation: value.generation, sourceSha256: null, artifactSha256: null,
          circuit: ticket.circuit };
        if (ticket.retiring || ticket.token !== this.requestToken
          || ticket.revision !== this.revision || ticket.active !== this.active || !this.active) {
          const owner = this.retirementOwner ?? this.createRetirementOwner();
          if (!this.retirementOwner) this.retirementOwner = owner;
          return { installed: false, retirement: await this.settleRetirementOwner(owner, identity) };
        }
        this.sessionId = identity.sessionId;
        this.capability = identity.capability;
        this.serverGeneration = identity.generation;
        return { installed: true, identity };
      }).catch((error) => {
        if (ticket.retiring && this.retirementOwner?.status === 'pending') {
          this.failRetirementOwner(this.retirementOwner, error);
        }
        throw error;
      }).finally(() => {
        if (this.sessionCreationOwner === ticket) this.sessionCreationOwner = null;
      });
      this.sessionCreationOwner = ticket;
    }
    const result = await this.sessionCreationOwner.promise;
    if (!result.installed) throw Object.assign(new Error('C3_SESSION_CREATION_RETIRED'), result);
    return true;
  }
  async retireCapturedSession(identity, { keepalive = false } = {}) {
    const expected = { sessionId: identity.sessionId, generation: identity.generation,
      sourceSha256: identity.sourceSha256, artifactSha256: identity.artifactSha256 };
    const body = JSON.stringify({ schema: COMMAND_SCHEMA, command: 'dispose',
      generation: identity.generation, profile: PROFILE, fqbn: FQBN,
      sourceSha256: identity.sourceSha256, artifactSha256: identity.artifactSha256,
      circuit: identity.circuit });
    const retirement = await this.response(await this.fetch(
      `${this.endpoint}/session/${identity.sessionId}/command`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Intent-MCU-C3': '1',
          Authorization: `Bearer ${identity.capability}` }, body,
        ...(keepalive ? { keepalive: true } : {}),
      },
    ));
    return validateEsp32C3Retirement(retirement, expected);
  }
  createRetirementOwner() {
    let complete;
    const promise = new Promise((resolve) => { complete = resolve; });
    return { expected: null, status: 'pending', started: false, promise, resolve: complete };
  }
  failRetirementOwner(owner, error) {
    if (owner.status !== 'pending') return owner.promise;
    owner.status = 'unproven';
    owner.resolve({ ok: false, code: error.code ?? error.message ?? 'C3_RETIREMENT_UNPROVEN' });
    return owner.promise;
  }
  settleRetirementOwner(owner, identity, { keepalive = false } = {}) {
    if (owner.started) return owner.promise;
    owner.started = true;
    owner.expected = { sessionId: identity.sessionId, generation: identity.generation,
      sourceSha256: identity.sourceSha256, artifactSha256: identity.artifactSha256 };
    void this.retireCapturedSession(identity, { keepalive }).then((result) => {
      owner.status = 'proven';
      owner.resolve(result);
    }, (error) => { this.failRetirementOwner(owner, error); });
    return owner.promise;
  }
  commandBody(command) {
    return {
      schema: COMMAND_SCHEMA, command, generation: this.serverGeneration,
      profile: PROFILE, fqbn: FQBN,
      sourceSha256: this.artifact?.sourceSha256 ?? null,
      artifactSha256: this.artifact?.flashSha256 ?? null,
      circuit: this.modelLibraryImplementation.profileRuntimeCircuit(
        PROFILE, this.project.circuit, { modelLibraryLock: this.modelLibraryLock },
      ),
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
    this.diagnostics = [];
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
    this.diagnostics = [];
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
  async build({ advancePermit = null } = {}) {
    const advance = this.advanceGuard('firmware.build', advancePermit, null);
    if (!advance?.ok) return { ok: false, code: advance?.code ?? 'X92_C3_SHARED_GATE_BLOCKED' };
    if (!this.active || this.phase === 'building') return { ok: false, code: 'C3_BUILD_UNAVAILABLE' };
    if (this.retirementOwner && this.retirementOwner.status !== 'proven') {
      this.phase = 'blocked';
      this.message = 'Build blocked until the previous C3 process has authenticated retirement proof.';
      this.render();
      return { ok: false, code: 'C3_RETIREMENT_UNPROVEN' };
    }
    if (this.circuitEditor.snapshot().wireDraft.mode !== 'none') {
      this.phase = 'blocked';
      this.message = 'Build blocked while a cable endpoint is being chosen. Finish the cable or press Escape, then build fresh flash.';
      this.render();
      return { ok: false, code: 'C3_WIRING_IN_PROGRESS' };
    }
    const circuit = this.modelLibraryImplementation.validateProfile(
      PROFILE, this.project.circuit, { modelLibraryLock: this.modelLibraryLock },
    );
    if (!circuit.ok) {
      this.phase = 'blocked';
      this.message = `Circuit blocked (${circuit.code}). Complete the exact GPIO2 J1 pin 4 → resistor → LED → GND J1 pin 6 path.`;
      this.render();
      return { ok: false, code: circuit.code };
    }
    let parsed;
    try { parsed = validateBoundedSource(this.project.source); }
    catch {
      this.phase = 'failed';
      this.diagnostics = [boundedPolicyDiagnostic({
        profile: PROFILE, revision: this.revision, source: this.project.source,
        file: 'sketch.ino', linePatterns: SOURCE_LINE_PATTERNS,
      })];
      this.message = 'Source rejected. Keep the complete template and edit only GPIO2 mode/level and the uppercase marker.';
      this.render();
      return { ok: false, code: 'SOURCE_POLICY_REJECTED', diagnostics: clone(this.diagnostics) };
    }
    clearTimeout(this.invalidationTimer);
    this.invalidationTimer = null;
    const token = ++this.requestToken;
    const revision = this.revision;
    this.artifact = null;
    this.artifactRevision = null;
    this.lastRuntime = null;
    this.phase = 'building';
    this.diagnostics = [];
    this.message = 'Compiling in the fixed network-disabled ESP32-C3 toolchain…';
    this.render();
    try {
      if (token !== this.requestToken || revision !== this.revision || !this.active) {
        return { ok: false, code: 'C3_BUILD_STALE' };
      }
      await this.ensureSession();
      const sessionId = this.sessionId;
      if (token !== this.requestToken || revision !== this.revision || !this.active || !sessionId) {
        return { ok: false, code: 'C3_BUILD_STALE' };
      }
      const receipt = await this.response(await this.fetch(
        `${this.endpoint}/session/${sessionId}/build`, {
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
      this.artifact = { ...clone(value.artifact),
        modelLibrary: modelLibraryExecutionIdentity(this.modelLibraryLock).identity };
      this.artifactRevision = revision;
      this.phase = 'built';
      this.diagnostics = normalizeSourceDiagnostics(value.diagnostics ?? [], {
        profile: PROFILE, revision, source: this.project.source,
        files: [{ name: 'sketch.ino', content: this.project.source }],
      });
      this.message = 'Fresh source-bound flash ready. Run starts actual Espressif QEMU CPU/UART.';
      this.render();
      return { ok: true, code: 'OK', artifact: clone(this.artifact) };
    } catch (error) {
      if (token !== this.requestToken) return { ok: false, code: 'C3_BUILD_STALE' };
      this.artifact = null;
      this.artifactRevision = null;
      this.phase = 'failed';
      this.diagnostics = normalizeSourceDiagnostics(error.diagnostics ?? [{
        code: error.code ?? 'C3_BUILD_FAILED', severity: 'error', message: error.message,
      }], { profile: PROFILE, revision, source: this.project.source,
        files: [{ name: 'sketch.ino', content: this.project.source }] });
      this.message = `${error.message}. No older flash remains runnable.`;
      this.render();
      return { ok: false, code: error.code ?? error.message, ...retryResultFields(error) };
    }
  }
  async run({ advancePermit = null, x92Binding = null, x92PrivateResult = false } = {}) {
    const advance = this.advanceGuard('runtime.run', advancePermit, x92Binding);
    if (!advance?.ok) return { ok: false, code: advance?.code ?? 'X92_C3_SHARED_GATE_BLOCKED' };
    const circuit = this.modelLibraryImplementation.validateProfile(
      PROFILE, this.project.circuit, { modelLibraryLock: this.modelLibraryLock },
    );
    if (!this.active || !this.artifact || this.artifactRevision !== this.revision || !circuit.ok) {
      this.message = 'Run blocked. Restore the validated named-pin circuit and build this exact source again.';
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
      if (x92PrivateResult) {
        if (!x92Binding) return { ok: false, code: 'X92_C3_BINDING_REQUIRED' };
        const quiescence = await this.quiesceForX92(x92Binding);
        return { schema: 'intent-mcu-x92-c3-private-result@1', ok: true,
          code: 'C3_PRIVATE_PRODUCT_COMPLETE', executed: true,
          executionIdentity: clone(x92Binding), uart: clone(value.runtime.uart), quiescence };
      }
      return { ok: true, code: 'OK', runtime: clone(value.runtime) };
    } catch (error) {
      if (token !== this.requestToken) return { ok: false, code: 'C3_RUNTIME_STALE' };
      this.phase = 'failed';
      this.message = `Run stopped. ${error.message}`;
      this.render();
      return { ok: false, code: error.code ?? error.message, ...retryResultFields(error) };
    }
  }
  async dispose(message = 'C3 session discarded.', { keepalive = false } = {}) {
    if (this.retirementOwner) return this.retirementOwner.promise;
    this.requestToken += 1;
    clearTimeout(this.invalidationTimer);
    this.invalidationTimer = null;
    const creation = this.sessionCreationOwner;
    if (creation) {
      creation.retiring = true;
      const owner = this.createRetirementOwner();
      this.retirementOwner = owner;
      this.sessionId = null;
      this.capability = null;
      this.serverGeneration = 0;
      this.artifact = null;
      this.artifactRevision = null;
      this.lastRuntime = null;
      this.terminal = 'No QEMU UART output yet.';
      this.phase = 'editing';
      this.diagnostics = [];
      this.message = message;
      this.render();
      return owner.promise;
    }
    const sessionId = this.sessionId;
    const expected = sessionId ? {
      sessionId, generation: this.serverGeneration,
      sourceSha256: this.artifact?.sourceSha256 ?? null,
      artifactSha256: this.artifact?.flashSha256 ?? null,
    } : null;
    if (!sessionId) return this.capability || this.artifact
      ? { ok: false, code: 'C3_RETIREMENT_UNPROVEN' }
      : { ok: true, code: 'C3_RETIREMENT_IDLE' };
    const identity = sessionId ? { ...expected, capability: this.capability,
      circuit: this.modelLibraryImplementation.profileRuntimeCircuit(
        PROFILE, this.project.circuit, { modelLibraryLock: this.modelLibraryLock },
      ) } : null;
    const owner = identity ? { expected, status: 'pending', promise: null } : null;
    if (owner) {
      owner.promise = Promise.resolve().then(async () => {
        try {
          const result = await this.retireCapturedSession(identity, { keepalive });
          owner.status = 'proven';
          return result;
        } catch (error) {
          owner.status = 'unproven';
          return { ok: false, code: error.code ?? error.message ?? 'C3_RETIREMENT_UNPROVEN' };
        }
      });
      this.retirementOwner = owner;
    }
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
    this.diagnostics = [];
    this.message = message;
    this.render();
    return owner.promise;
  }
  disposeForPageExit() {
    if ((!this.sessionId || !this.capability) && !this.sessionCreationOwner) return;
    void this.dispose('C3 page-exit retirement pending.', { keepalive: true });
  }

  selectCircuit(selection) {
    const result = this.circuitEditor.select(selection);
    this.render();
    return result;
  }

  editCircuit(operation, ...args) {
    if (!['deleteSelected', 'undo', 'redo', 'moveComponent', 'rotateComponent',
      'activateEndpoint', 'beginReconnect', 'cancelWireDraft', 'connectEndpoints', 'reconnectEndpoint',
      'addMissingComponent', 'setComponentProperty', 'setComponentAppearance', 'setComponentAppearanceEdit',
      'setWireColor', 'setWireRoute', 'applyApiBatch', 'undoApi', 'redoApi'].includes(operation)) {
      return { ok: false, code: 'C3_CIRCUIT_OPERATION_INVALID' };
    }
    const revision = this.circuitEditor.revision;
    const result = this.circuitEditor[operation](...args);
    if (!result.ok) {
      if (['addMissingComponent', 'setComponentProperty', 'setComponentAppearance', 'setComponentAppearanceEdit'].includes(operation)) {
        this.message = `Part change rejected (${result.code}). The circuit and flash authority are unchanged.`;
      }
      this.render(); return result;
    }
    if (result.revision === revision) {
      if (result.wireDraft?.mode !== 'none') {
        this.invalidate('Wiring in progress. Flash and LED authority were retired; finish or cancel, then build fresh.');
      } else this.render();
      return result;
    }
    this.project.circuit = clone(result.draft);
    const layoutOnly = ['moveComponent', 'rotateComponent', 'setComponentAppearance', 'setComponentAppearanceEdit',
      'setWireColor', 'setWireRoute'].includes(operation)
      || ['undo', 'redo'].includes(operation) && result.changeKind === 'layout';
    if (layoutOnly) {
      this.message = `Layout changed (${result.code}). Flash and electrical authority are unchanged.`;
      this.render();
      return result;
    }
    const messages = {
      deleteSelected: `Circuit changed (${result.code}). Flash and LED authority retired; restore valid wiring and build fresh.`,
      undo: 'Circuit Undo applied. Flash and LED authority retired; build fresh.',
      redo: 'Circuit Redo applied. Flash and LED authority retired; build fresh.',
      activateEndpoint: `Cable changed (${result.code}). Flash and LED authority retired; finish a valid circuit and build fresh.`,
      connectEndpoints: `Cable created (${result.code}). Flash and LED authority retired; finish a valid circuit and build fresh.`,
      reconnectEndpoint: `Cable endpoint reconnected (${result.code}). Flash and LED authority retired; finish a valid circuit and build fresh.`,
      addMissingComponent: `Added ${result.componentId} without inferred cables. Connect its named pins, then build fresh.`,
      setComponentProperty: `Updated ${result.componentId}.${result.key}. Electrical rules revalidated; build fresh.`,
    };
    this.invalidate(messages[operation] ?? `Circuit changed (${result.code}). Flash and LED authority retired; build fresh.`);
    return result;
  }

  projectDocument() {
    this.project.circuit = clone(this.circuitEditor.snapshot().draft);
    return normalizeEsp32C3PublicProject({ ...this.project, source: this.elements.source.value,
      name: this.elements.name.value, circuit: this.project.circuit });
  }

  installPreparedProject(project, message = 'Local C3 project opened. Flash and QEMU authority were excluded; build fresh.') {
    this.project = normalizeEsp32C3PublicProject(project);
    this.circuitEditor = new Esp32C3CircuitEditor(this.project.circuit);
    this.elements.source.value = this.project.source;
    this.elements.name.value = this.project.name;
    this.invalidate(message);
    return { ok: true, code: 'OK' };
  }

  save() {
    const project = this.projectDocument();
    download(`${this.project.name.replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '').toLowerCase() || 'c3-project'}.json`,
      `${JSON.stringify(project, null, 2)}\n`);
    this.message = 'Saved a data-only local C3 project. Flash bytes and runtime authority were excluded.';
    this.render();
  }
  async open(file) {
    try {
      if (file.size > 16 * 1024) throw new Error('C3_PROJECT_LIMIT');
      const project = normalizeEsp32C3PublicProject(parseStrictJson(await file.text()));
      return this.installPreparedProject(project);
    } catch (error) {
      this.message = `Open rejected (${error.code ?? error.message}). The current project is unchanged.`;
      this.render();
      return { ok: false, code: error.code ?? error.message };
    }
  }
  render() {
    const circuit = this.modelLibraryImplementation.validateProfile(
      PROFILE, this.project.circuit, { modelLibraryLock: this.modelLibraryLock },
    );
    const wiringReady = this.circuitEditor.snapshot().wireDraft.mode === 'none';
    const modeled = this.lastRuntime?.modeledCircuit;
    const led = modeled?.epochs?.at(-1)?.led;
    this.elements.name.value = this.project.name;
    if (this.elements.source.value !== this.project.source) this.elements.source.value = this.project.source;
    this.elements.state.textContent = this.phase;
    this.elements.message.textContent = this.message;
    this.elements.terminal.textContent = this.terminal;
    this.elements.sourceHash.textContent = this.artifact?.sourceSha256 ?? 'not built';
    this.elements.flashHash.textContent = this.artifact?.flashSha256 ?? 'not built';
    this.elements.build.disabled = !this.active || this.phase === 'building' || this.phase === 'running' || !wiringReady;
    this.elements.run.disabled = !this.active || !this.artifact
      || this.artifactRevision !== this.revision || !circuit.ok || !wiringReady || this.phase === 'running';
    this.elements.stop.disabled = !this.sessionId;
    this.elements.diagram.dataset.connected = String(circuit.ok && wiringReady);
    this.elements.diagram.dataset.led = circuit.ok && wiringReady && led?.on ? 'on' : 'off';
    this.elements.led?.setAttribute('aria-label', circuit.ok && wiringReady && led?.on
      ? 'Modeled external LED is on' : 'Modeled external LED is off');
    this.elements.circuitState.textContent = !wiringReady
      ? 'Wiring in progress · flash and LED authority retired · finish or cancel before Build'
      : circuit.ok
      ? `Project model accepted · GPIO2 J1 pin 4 → ${circuit.model.resistorOhms} Ω → ${circuit.model.ledColor} LED → GND J1 pin 6 · ${led?.code ?? 'waiting for Run'}`
      : `${describeCircuitGap(circuit.code)} Stale flash and LED authority was retired.`;
    this.onDiagnostics({ profile: PROFILE, revision: this.revision, source: this.project.source,
      file: 'sketch.ino', diagnostics: clone(this.diagnostics) });
    this.publish();
  }
}
