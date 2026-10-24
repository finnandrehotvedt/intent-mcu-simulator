// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { validateCircuit } from '../src/circuit-engine.mjs';
import { COMPONENT_CATALOG } from '../src/component-catalog.mjs';
import { RP2040_PICO_COMPONENT_CATALOG, validateRp2040PicoCircuit } from '../src/rp2040-pico-circuit.mjs';
import { ESP32C3_PUBLIC_COMPONENT_CATALOG, validateEsp32C3Circuit } from '../src/esp32c3-public-circuit.mjs';
import { STM32_PUBLIC_COMPONENT_CATALOG, validateStm32Circuit } from '../src/stm32-public-circuit.mjs';

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
  if (profile === 'board.atmega328p-16mhz-v1') project = window.__M6_PROJECT__?.() ?? null;
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
    projectId: `project-${hash.slice(0, 32)}`, revision: Number.parseInt(hash.slice(0, 12), 16) };
}
function execute(request, current) {
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
  if (request.command === 'capabilities.list') return { status: 'accepted', code: 'API_CAPABILITIES_LISTED',
    commands: ['capabilities.list', 'components.catalog', 'project.inspect', 'components.list', 'component.pins', 'nets.list', 'circuit.validate'],
    profiles: ['board.atmega328p-16mhz-v1', 'board.rp2040-pico-v1', 'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1'], scopes: ['discover', 'read_project'] };
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
  dialog.innerHTML = '<header><div><p class="eyebrow">PRIVATE READ-ONLY PREVIEW</p><h2>API access</h2></div><button type="button" data-close>Close</button></header><p>Disabled by default. Pair one temporary read-only client to this tab only.</p><p data-status role="status">API access is off.</p><div class="build-controls"><button type="button" data-enable>Enable and create pairing</button><button type="button" data-revoke disabled>Revoke</button></div><label>One-time pairing secret<input data-secret readonly value=""></label><p data-ttl>No active capability. Closing the tab fails closed after the bounded owner lease expires.</p>';
  document.body.append(dialog);
  const status = dialog.querySelector('[data-status]'); const secretField = dialog.querySelector('[data-secret]');
  const ttl = dialog.querySelector('[data-ttl]'); const enable = dialog.querySelector('[data-enable]'); const revoke = dialog.querySelector('[data-revoke]');
  let owner = null; let sessionId = null; let timer = null; let boundFingerprint = null; let loopToken = 0;
  const stop = () => { if (timer) clearTimeout(timer); timer = null; loopToken += 1; owner = null; sessionId = null; boundFingerprint = null; secretField.value = ''; revoke.disabled = true; enable.disabled = false; ttl.textContent = 'No active capability. Closing the tab fails closed after the bounded owner lease expires.'; };
  const revokeCurrent = async () => {
    const oldOwner = owner; const oldSession = sessionId; stop();
    if (oldOwner && oldSession) await post('owner.revoke', { sessionId: oldSession }, oldOwner).catch(() => null);
  };
  button.addEventListener('click', () => dialog.showModal()); dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  enable.addEventListener('click', async () => {
    enable.disabled = true; await revokeCurrent(); enable.disabled = true;
    let initial;
    try { initial = await snapshot(); } catch { status.textContent = 'Canonical project is unavailable.'; stop(); return; }
    sessionId = makeId('session'); boundFingerprint = initial.fingerprint;
    const registered = await post('owner.register', { sessionId, projectId: initial.projectId,
      tabId: makeId('tab'), revision: initial.revision }).catch(() => ({ ok: false }));
    if (!registered.ok) { status.textContent = 'Private API preview is unavailable on this server.'; stop(); return; }
    owner = registered.ownerCapability;
    const pairing = await post('pairing.create', { sessionId }, owner).catch(() => ({ ok: false,
      code: 'API_NETWORK_UNAVAILABLE' }));
    if (!pairing.ok) { status.textContent = `Pairing rejected: ${pairing.code}`; await revokeCurrent(); return; }
    secretField.value = pairing.pairingSecret; revoke.disabled = false; status.textContent = 'Pairing ready. Read-only scopes only.';
    ttl.textContent = `One-time secret expires ${new Date(pairing.expiresAt).toLocaleTimeString()}.`;
    const token = ++loopToken;
    const tick = async () => {
      if (token !== loopToken || !owner) return;
      let current;
      try { current = await snapshot(); } catch { current = null; }
      if (!current || current.fingerprint !== boundFingerprint) {
        const oldOwner = owner; const oldSession = sessionId; stop();
        await post('owner.revoke', { sessionId: oldSession }, oldOwner).catch(() => null);
        status.textContent = 'Project content or board changed. Pair again.'; return;
      }
      const lease = await post('owner.heartbeat', { sessionId, revision: current.revision }, owner).catch(() => ({ ok: false }));
      if (!lease.ok) { status.textContent = 'Owner lease ended. Pair again.'; stop(); return; }
      if (lease.clientPaired) {
        secretField.value = '';
        status.textContent = 'One read-only client is paired.';
        ttl.textContent = `Client expires no later than ${new Date(lease.clientExpiresAt).toLocaleTimeString()}.`;
      }
      const pulled = await post('owner.pull', { sessionId }, owner).catch(() => ({ ok: false }));
      if (pulled.code === 'API_COMMAND_AVAILABLE') {
        const before = current; const outcome = execute(pulled.request, before);
        const after = await snapshot().catch(() => null);
        const stable = after?.fingerprint === before.fingerprint;
        await post('owner.complete', { sessionId, result: { schema: 'intent-mcu-browser-session-result@1',
          request_id: pulled.request.request_id, ...(stable ? outcome
            : { status: 'rejected', code: 'API_PROJECT_CHANGED' }), revision_before: before.revision,
          revision_after: after?.revision ?? before.revision, changes: [] } }, owner).catch(() => null);
        if (!stable) { status.textContent = 'Project changed while reading. Pair again.'; await revokeCurrent(); return; }
      }
      if (token === loopToken) timer = setTimeout(tick, 250);
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
