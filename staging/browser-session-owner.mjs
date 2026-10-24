// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { validateCircuit } from '../src/circuit-engine.mjs';
import { COMPONENT_CATALOG } from '../src/component-catalog.mjs';
import { RP2040_PICO_COMPONENT_CATALOG, validateRp2040PicoCircuit } from '../src/rp2040-pico-circuit.mjs';
import { ESP32C3_PUBLIC_COMPONENT_CATALOG, validateEsp32C3Circuit } from '../src/esp32c3-public-circuit.mjs';
import { STM32_PUBLIC_COMPONENT_CATALOG, validateStm32Circuit } from '../src/stm32-public-circuit.mjs';
import { API03_PROFILE_MATRIX, prepareApiBatch, summarizeApiChanges } from '../src/browser-session-edit.mjs';
import { API_SESSION_CLIENT_URL, API_SESSION_PROTOCOL_URL,
  CODEX_PAIRING_INSTRUCTIONS } from '../src/browser-session-codex-instructions.mjs';

const endpoint = '/api/session/v1';
const makeId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const post = async (operation, value = {}, capability = null) => {
  const response = await fetch(endpoint, { method: 'POST', cache: 'no-store', credentials: 'omit',
    headers: { 'Content-Type': 'application/json', ...(capability ? { Authorization: `Bearer ${capability}` } : {}) },
    body: JSON.stringify({ operation, ...value }) });
  return response.json();
};
const active = () => document.querySelector('#board-select')?.value ?? null;
const catalogueFor = (profile) => ({
  'board.atmega328p-16mhz-v1': COMPONENT_CATALOG,
  'board.rp2040-pico-v1': { ...COMPONENT_CATALOG, ...RP2040_PICO_COMPONENT_CATALOG },
  'board.esp32-c3-devmodule-v1': { ...COMPONENT_CATALOG, ...ESP32C3_PUBLIC_COMPONENT_CATALOG },
  'board.stm32f429zi-nucleo144-v1': { ...COMPONENT_CATALOG, ...STM32_PUBLIC_COMPONENT_CATALOG },
})[profile] ?? null;
const projectNameId = (profile) => ({ 'board.rp2040-pico-v1': 'pico-project-name',
  'board.esp32-c3-devmodule-v1': 'c3-project-name',
  'board.stm32f429zi-nucleo144-v1': 'stm32-project-name' })[profile];
async function snapshot() {
  const profile = active();
  let project;
  if (profile === 'board.atmega328p-16mhz-v1') {
    const canonical = window.__BROWSER_SESSION_CANONICAL_OWNER__?.snapshot?.();
    if (canonical?.ok) return { profile, project: canonical.project,
      projectId: canonical.projectId, revision: canonical.revision,
      supportsEdit: canonical.supportsEdit, fingerprint: canonical.projectId };
    project = window.__M6_PROJECT__?.() ?? null;
  }
  else {
  const key = profile === 'board.rp2040-pico-v1' ? '__RP2040_PUBLIC_WORKBENCH__'
    : profile === 'board.esp32-c3-devmodule-v1' ? '__ESP32C3_PUBLIC_WORKBENCH__' : '__STM32_PUBLIC_WORKBENCH__';
  const state = window[key]?.state?.();
    project = state?.project ?? (state ? { profile, name: document.querySelector(`#${projectNameId(profile)}`)?.value,
      source: state.source, circuit: state.circuit ?? state.circuitEditor?.draft } : null);
  }
  if (!profile || !project) throw new Error('API_PROJECT_UNAVAILABLE');
  const bytes = new TextEncoder().encode(JSON.stringify(project));
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((value) => value.toString(16).padStart(2, '0')).join('');
  return { profile, project, fingerprint: hash,
    projectId: `project-${hash.slice(0, 32)}`, revision: Number.parseInt(hash.slice(0, 12), 16),
    supportsEdit: false };
}
function execute(request, current, context) {
  if (request.expected_revision !== current.revision) return { status: 'rejected', code: 'API_STALE_REVISION' };
  const components = current.project?.circuit?.components ?? [];
  const nets = current.project?.circuit?.nets ?? [];
  if (request.command === 'project.inspect') return { status: 'accepted', code: 'API_PROJECT_INSPECTED', project: current.project };
  if (request.command === 'components.list') return { status: 'accepted', code: 'API_COMPONENTS_LISTED', components };
  if (request.command === 'nets.list') return { status: 'accepted', code: 'API_NETS_LISTED', nets };
  if (request.command === 'component.pins') {
    const component = components.find((item) => item.id === request.arguments.component_id);
    if (!component) return { status: 'rejected', code: 'API_COMPONENT_MISSING' };
    const definition = catalogueFor(current.profile)?.[component.type];
    if (!definition?.pins) return { status: 'rejected', code: 'API_COMPONENT_MODEL_MISSING' };
    const pins = definition.pins.map((pin) => ({ id: pin.id, label: pin.label, role: pin.role,
      capabilities: structuredClone(pin.capabilities ?? pin.signals ?? []),
      constraints: structuredClone(pin.constraints ?? {}),
      connected: nets.some((net) => net.endpoints?.some(
        (point) => point.component === component.id && point.pin === pin.id)) }));
    return { status: 'accepted', code: 'API_COMPONENT_PINS_LISTED', component_id: component.id, pins };
  }
  if (request.command === 'circuit.validate') {
    const validators = { 'board.atmega328p-16mhz-v1': validateCircuit,
      'board.rp2040-pico-v1': validateRp2040PicoCircuit,
      'board.esp32-c3-devmodule-v1': validateEsp32C3Circuit,
      'board.stm32f429zi-nucleo144-v1': validateStm32Circuit };
    const validation = validators[current.profile]?.(current.project?.circuit);
    return validation ? { status: 'accepted', code: 'API_VALIDATION_READ_ONLY', validation }
      : { status: 'rejected', code: 'API_PROFILE_UNSUPPORTED' };
  }
  if (request.command === 'edit.batch') {
    if (!current.supportsEdit) return { status: 'rejected', code: 'API_PROFILE_READ_ONLY' };
    if (!request.arguments || Object.keys(request.arguments).join('|') !== 'commands') {
      return { status: 'rejected', code: 'API_BATCH_SHAPE' };
    }
    let commands;
    try { commands = prepareApiBatch(current.project, request.arguments.commands); }
    catch (error) { return { status: 'rejected', code: error.code ?? 'API_BATCH_REJECTED' }; }
    const transactionId = `api-tx:${context.sessionId}:${request.request_id}`;
    const result = window.__BROWSER_SESSION_CANONICAL_OWNER__.batch({ expectedProjectId: current.projectId,
      expectedRevision: request.expected_revision, transactionId, commands });
    return result.ok ? { status: 'accepted', code: 'API_BATCH_COMMITTED',
      transaction_id: transactionId, changes: summarizeApiChanges(request.arguments.commands) }
      : { status: 'rejected', code: result.code, details: result.details ?? [] };
  }
  if (request.command === 'edit.undo' || request.command === 'edit.redo') {
    if (!current.supportsEdit) return { status: 'rejected', code: 'API_PROFILE_READ_ONLY' };
    if (!request.arguments || Object.keys(request.arguments).join('|') !== 'transaction_id'
        || typeof request.arguments.transaction_id !== 'string') {
      return { status: 'rejected', code: 'API_TRANSACTION_SHAPE' };
    }
    const method = request.command === 'edit.undo' ? 'undo' : 'redo';
    const result = window.__BROWSER_SESSION_CANONICAL_OWNER__[method]({ expectedProjectId: current.projectId,
      expectedRevision: request.expected_revision, transactionId: request.arguments.transaction_id });
    return result.ok ? { status: 'accepted', code: request.command === 'edit.undo'
      ? 'API_TRANSACTION_UNDONE' : 'API_TRANSACTION_REDONE',
    transaction_id: request.arguments.transaction_id, changes: [request.command] }
      : { status: 'rejected', code: result.code, details: result.details ?? [] };
  }
  if (request.command === 'capabilities.list') return { status: 'accepted', code: 'API_CAPABILITIES_LISTED',
    commands: ['capabilities.list', 'components.catalog', 'project.inspect', 'components.list', 'component.pins',
      'nets.list', 'circuit.validate', 'edit.batch', 'edit.undo', 'edit.redo'],
    profiles: ['board.atmega328p-16mhz-v1', 'board.rp2040-pico-v1', 'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1'],
    scopes: ['discover', 'read_project', 'edit_circuit'], profile_matrix: API03_PROFILE_MATRIX };
  if (request.command === 'components.catalog') {
    return { status: 'accepted', code: 'API_CATALOG_LISTED', profile: current.profile,
      components: catalogueFor(current.profile) ?? {} };
  }
  return { status: 'rejected', code: 'API_COMMAND_UNSUPPORTED' };
}

export function installBrowserSessionOwner() {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'API access';
  const nav = document.querySelector('#workbench-popup-controls'); if (!nav) return;
  nav.append(button);
  const dialog = document.createElement('dialog'); dialog.id = 'browser-session-api-dialog';
  dialog.innerHTML = `<header><div><p class="eyebrow">API ACCESS</p><h2>Connect a local Codex client</h2></div><button type="button" data-close>Close</button></header>
    <div class="api-pairing-body">
      <ol class="api-pairing-steps" aria-label="Pairing workflow">
        <li><strong>Copy Codex instructions</strong><span>The prompt explains the public protocol, local client and secret boundary.</span></li>
        <li><strong>Create a pairing</strong><span>Read-only by default. AVR editing needs the separate checkbox.</span></li>
        <li><strong>Enter the secret locally</strong><span>Never paste it into chat, a URL, a file or source control.</span></li>
      </ol>
      <section class="api-codex-prompt" aria-labelledby="api-codex-prompt-title">
        <div class="api-codex-prompt-heading"><div><p class="eyebrow">API ACCESS</p><h3 id="api-codex-prompt-title">Give these instructions to Codex</h3></div><button type="button" data-copy-instructions>Copy instructions</button></div>
        <textarea data-codex-instructions readonly spellcheck="false" aria-label="Codex pairing instructions"></textarea>
        <p class="api-resource-links"><a href="${API_SESSION_PROTOCOL_URL}">Protocol v1</a><a href="${API_SESSION_CLIENT_URL}" download>Download client.mjs</a></p>
        <p data-copy-status class="api-copy-status" role="status">The pairing secret is intentionally not included.</p>
      </section>
      <section class="api-pairing-controls" aria-label="Temporary API pairing">
        <p>Disabled by default. Pair one temporary client to this tab only.</p>
        <label class="api-edit-scope"><input type="checkbox" data-edit-scope><span>Grant circuit editing for this pairing <small>AVR only</small></span></label>
        <p data-status role="status">API access is off.</p>
        <div class="build-controls"><button type="button" data-enable>Enable and create pairing</button><button type="button" data-revoke disabled>Revoke</button></div>
        <label class="api-secret-field">One-time pairing secret<input data-secret readonly value=""></label>
        <p data-ttl>No active capability. Closing the tab fails closed after the bounded owner lease expires.</p>
      </section>
    </div>`;
  document.body.append(dialog);
  const status = dialog.querySelector('[data-status]'); const secretField = dialog.querySelector('[data-secret]');
  const ttl = dialog.querySelector('[data-ttl]'); const enable = dialog.querySelector('[data-enable]'); const revoke = dialog.querySelector('[data-revoke]');
  const editScope = dialog.querySelector('[data-edit-scope]');
  const instructions = dialog.querySelector('[data-codex-instructions]');
  const copyStatus = dialog.querySelector('[data-copy-status]');
  instructions.value = CODEX_PAIRING_INSTRUCTIONS;
  dialog.querySelector('[data-copy-instructions]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(CODEX_PAIRING_INSTRUCTIONS);
      copyStatus.textContent = 'Instructions copied. No pairing secret was included.';
    } catch {
      instructions.focus(); instructions.select();
      copyStatus.textContent = 'Clipboard access was unavailable. The instructions are selected for manual copy.';
    }
  });
  let owner = null; let sessionId = null; let timer = null; let boundProjectId = null; let loopToken = 0;
  const stop = () => { if (timer) clearTimeout(timer); timer = null; loopToken += 1; owner = null; sessionId = null; boundProjectId = null; secretField.value = ''; revoke.disabled = true; enable.disabled = false; editScope.disabled = false; ttl.textContent = 'No active capability. Closing the tab fails closed after the bounded owner lease expires.'; };
  const revokeCurrent = async () => {
    const oldOwner = owner; const oldSession = sessionId; stop();
    if (oldOwner && oldSession) await post('owner.revoke', { sessionId: oldSession }, oldOwner).catch(() => null);
  };
  button.addEventListener('click', () => dialog.showModal()); dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  enable.addEventListener('click', async () => {
    enable.disabled = true; await revokeCurrent(); enable.disabled = true;
    const setupToken = ++loopToken;
    let initial;
    try { initial = await snapshot(); } catch { status.textContent = 'Canonical project is unavailable.'; stop(); return; }
    if (setupToken !== loopToken) return;
    if (editScope.checked && !initial.supportsEdit) { status.textContent = 'Editing is unavailable for this profile or project.'; stop(); return; }
    const createdSessionId = makeId('session'); sessionId = createdSessionId;
    boundProjectId = initial.projectId; editScope.disabled = true;
    const registered = await post('owner.register', { sessionId: createdSessionId, projectId: initial.projectId,
      tabId: makeId('tab'), revision: initial.revision }).catch(() => ({ ok: false }));
    if (setupToken !== loopToken || sessionId !== createdSessionId) return;
    if (!registered.ok) { status.textContent = 'Private API preview is unavailable on this server.'; stop(); return; }
    const createdOwner = registered.ownerCapability; owner = createdOwner;
    const scopes = ['discover', 'read_project', ...(editScope.checked ? ['edit_circuit'] : [])];
    const pairing = await post('pairing.create', { sessionId: createdSessionId, scopes }, createdOwner).catch(() => ({ ok: false,
      code: 'API_NETWORK_UNAVAILABLE' }));
    if (setupToken !== loopToken || owner !== createdOwner || sessionId !== createdSessionId) return;
    if (!pairing.ok) { status.textContent = `Pairing rejected: ${pairing.code}`; await revokeCurrent(); return; }
    secretField.value = pairing.pairingSecret; revoke.disabled = false;
    status.textContent = editScope.checked ? 'Pairing ready. AVR circuit editing granted.' : 'Pairing ready. Read-only scopes only.';
    ttl.textContent = `One-time secret expires ${new Date(pairing.expiresAt).toLocaleTimeString()}.`;
    const token = setupToken; const projectId = initial.projectId;
    const contextLive = () => token === loopToken && owner === createdOwner
      && sessionId === createdSessionId && boundProjectId === projectId;
    const tick = async () => {
      if (!contextLive()) return;
      let current;
      try { current = await snapshot(); } catch { current = null; }
      if (!contextLive()) return;
      if (!current || current.projectId !== projectId) {
        stop();
        await post('owner.revoke', { sessionId: createdSessionId }, createdOwner).catch(() => null);
        status.textContent = 'Project content or board changed. Pair again.'; return;
      }
      const lease = await post('owner.heartbeat', { sessionId: createdSessionId,
        revision: current.revision }, createdOwner).catch(() => ({ ok: false }));
      if (!contextLive()) return;
      if (!lease.ok) { status.textContent = 'Owner lease ended. Pair again.'; stop(); return; }
      if (lease.clientPaired) {
        secretField.value = '';
        status.textContent = editScope.checked ? 'One AVR editing client is paired.' : 'One read-only client is paired.';
        ttl.textContent = `Client expires no later than ${new Date(lease.clientExpiresAt).toLocaleTimeString()}.`;
      }
      const pulled = await post('owner.pull', { sessionId: createdSessionId }, createdOwner).catch(() => ({ ok: false }));
      if (!contextLive()) return;
      if (pulled.code === 'API_COMMAND_AVAILABLE') {
        const authorized = await post('owner.authorize', { sessionId: createdSessionId,
          requestId: pulled.request.request_id }, createdOwner).catch(() => ({ ok: false }));
        if (!contextLive()) return;
        if (!authorized.ok || Date.now() >= authorized.requestExpiresAt) {
          status.textContent = `Command expired or was revoked: ${authorized.code ?? 'API_REQUEST_EXPIRED'}.`;
          if (contextLive()) await revokeCurrent();
          return;
        }
        const before = await snapshot().catch(() => null);
        if (!contextLive()) return;
        if (Date.now() >= authorized.requestExpiresAt) {
          status.textContent = 'Command expired while refreshing canonical state.';
          await revokeCurrent(); return;
        }
        if (!before || before.projectId !== projectId || pulled.request.project_id !== projectId) {
          await post('owner.complete', { sessionId: createdSessionId, result: {
            schema: 'intent-mcu-browser-session-result@1', request_id: pulled.request.request_id,
            status: 'rejected', code: 'API_PROJECT_CHANGED', revision_before: before?.revision ?? current.revision,
            revision_after: before?.revision ?? current.revision, changes: [],
          } }, createdOwner).catch(() => null);
          if (contextLive()) await revokeCurrent();
          status.textContent = 'Project changed while waiting. Pair again.'; return;
        }
        const outcome = execute(pulled.request, before, { sessionId: createdSessionId });
        const after = await snapshot().catch(() => null);
        if (!contextLive()) return;
        const stable = after?.projectId === projectId;
        await post('owner.complete', { sessionId: createdSessionId, result: { schema: 'intent-mcu-browser-session-result@1',
          request_id: pulled.request.request_id, ...(stable ? outcome
            : { status: 'rejected', code: 'API_PROJECT_CHANGED' }), revision_before: before.revision,
          revision_after: after?.revision ?? before.revision, changes: outcome.changes ?? [] } }, createdOwner).catch(() => null);
        if (!contextLive()) return;
        if (!stable) { status.textContent = 'Project changed while reading. Pair again.'; await revokeCurrent(); return; }
      }
      if (contextLive()) timer = setTimeout(tick, 250);
    };
    timer = setTimeout(tick, 0);
  });
  revoke.addEventListener('click', async () => { await revokeCurrent(); status.textContent = 'API access revoked.'; });
  addEventListener('pagehide', () => {
    if (owner && sessionId) void fetch(endpoint, { method: 'POST', cache: 'no-store', credentials: 'omit',
      keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner}` },
      body: JSON.stringify({ operation: 'owner.revoke', sessionId }) }).catch(() => null);
    stop();
  }, { once: true });
}

installBrowserSessionOwner();
