// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const endpoint = '/api/session/v1';
const makeId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const post = async (operation, value = {}, capability = null) => {
  const response = await fetch(endpoint, { method: 'POST', cache: 'no-store', credentials: 'omit',
    headers: { 'Content-Type': 'application/json', ...(capability ? { Authorization: `Bearer ${capability}` } : {}) },
    body: JSON.stringify({ operation, ...value }) });
  return response.json();
};
const active = () => document.querySelector('#board-select')?.value ?? 'board.atmega328p-16mhz-v1';
function snapshot() {
  const profile = active();
  if (profile === 'board.atmega328p-16mhz-v1') return { profile, revision: window.__M6_STATE__?.generation ?? 0,
    project: window.__M6_PROJECT__?.() ?? null };
  const key = profile === 'board.rp2040-pico-v1' ? '__RP2040_PUBLIC_WORKBENCH__'
    : profile === 'board.esp32-c3-devmodule-v1' ? '__ESP32C3_PUBLIC_WORKBENCH__' : '__STM32_PUBLIC_WORKBENCH__';
  const state = window[key]?.state?.();
  return { profile, revision: state?.revision ?? state?.circuitEditor?.revision ?? 0,
    project: state?.project ?? { profile, circuit: state?.circuitEditor?.draft ?? null } };
}
function execute(request) {
  const current = snapshot();
  if (request.expected_revision !== current.revision) return { status: 'rejected', code: 'API_STALE_REVISION' };
  const components = current.project?.circuit?.components ?? [];
  const nets = current.project?.circuit?.nets ?? [];
  if (request.command === 'project.inspect') return { status: 'accepted', code: 'API_PROJECT_INSPECTED', project: current.project };
  if (request.command === 'components.list') return { status: 'accepted', code: 'API_COMPONENTS_LISTED', components };
  if (request.command === 'nets.list') return { status: 'accepted', code: 'API_NETS_LISTED', nets };
  if (request.command === 'component.pins') {
    const component = components.find((item) => item.id === request.arguments.component_id);
    if (!component) return { status: 'rejected', code: 'API_COMPONENT_MISSING' };
    const pins = [...document.querySelectorAll('.pin-anchor[data-endpoint]')]
      .filter((node) => node.dataset.endpoint.startsWith(`${component.id}.`))
      .map((node) => ({ id: node.dataset.endpoint.slice(component.id.length + 1),
        label: node.querySelector('.pin-anchor-label')?.textContent?.trim() ?? '',
        role: node.dataset.pinRole ?? 'signal', connected: nets.some((net) => net.endpoints?.some(
          (point) => point.component === component.id && point.pin === node.dataset.endpoint.slice(component.id.length + 1))) }));
    return { status: 'accepted', code: 'API_COMPONENT_PINS_LISTED', component_id: component.id, pins };
  }
  if (request.command === 'capabilities.list') return { status: 'accepted', code: 'API_CAPABILITIES_LISTED',
    commands: ['capabilities.list', 'components.catalog', 'project.inspect', 'components.list', 'component.pins', 'nets.list'],
    profiles: ['board.atmega328p-16mhz-v1', 'board.rp2040-pico-v1', 'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1'], scopes: ['discover', 'read_project'] };
  if (request.command === 'components.catalog') return { status: 'accepted', code: 'API_CATALOG_LISTED', profile: current.profile };
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
  let owner = null; let sessionId = null; let timer = null; let boundProfile = null;
  const stop = () => { if (timer) clearInterval(timer); timer = null; owner = null; sessionId = null; boundProfile = null; secretField.value = ''; revoke.disabled = true; ttl.textContent = 'No active capability. Closing the tab fails closed after the bounded owner lease expires.'; };
  button.addEventListener('click', () => dialog.showModal()); dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  enable.addEventListener('click', async () => {
    stop(); sessionId = makeId('session'); const projectId = makeId('project'); boundProfile = active();
    const registered = await post('owner.register', { sessionId, projectId, tabId: makeId('tab'), revision: snapshot().revision }).catch(() => ({ ok: false }));
    if (!registered.ok) { status.textContent = 'Private API preview is unavailable on this server.'; stop(); return; }
    owner = registered.ownerCapability;
    const pairing = await post('pairing.create', { sessionId }, owner);
    if (!pairing.ok) { status.textContent = `Pairing rejected: ${pairing.code}`; stop(); return; }
    secretField.value = pairing.pairingSecret; revoke.disabled = false; status.textContent = 'Pairing ready. Read-only scopes only.';
    ttl.textContent = `One-time secret expires ${new Date(pairing.expiresAt).toLocaleTimeString()}.`;
    timer = setInterval(async () => {
      if (active() !== boundProfile) {
        await post('owner.revoke', { sessionId }, owner).catch(() => null);
        status.textContent = 'Board or project context changed. Pair again.'; stop(); return;
      }
      const lease = await post('owner.heartbeat', { sessionId, revision: snapshot().revision }, owner).catch(() => ({ ok: false }));
      if (!lease.ok) { status.textContent = 'Owner lease ended. Pair again.'; stop(); return; }
      if (lease.clientPaired) {
        secretField.value = '';
        status.textContent = 'One read-only client is paired.';
        ttl.textContent = `Client expires no later than ${new Date(lease.clientExpiresAt).toLocaleTimeString()}.`;
      }
      const pulled = await post('owner.pull', { sessionId }, owner).catch(() => ({ ok: false }));
      if (pulled.code !== 'API_COMMAND_AVAILABLE') return;
      const before = snapshot(); const outcome = execute(pulled.request); const after = snapshot();
      await post('owner.complete', { sessionId, result: { schema: 'intent-mcu-browser-session-result@1',
        request_id: pulled.request.request_id, ...outcome, revision_before: before.revision,
        revision_after: after.revision, changes: [] } }, owner);
    }, 2_000);
  });
  revoke.addEventListener('click', async () => { if (owner) await post('owner.revoke', { sessionId }, owner); status.textContent = 'API access revoked.'; stop(); });
  addEventListener('pagehide', () => stop(), { once: true });
}

installBrowserSessionOwner();
