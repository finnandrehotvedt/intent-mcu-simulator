// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { X37_PUBLIC_CAPABILITY, createX37CandidateBudget, createX37CoordinatedLifecycle,
  defaultX37WorkbenchProject, parseX37WorkbenchProject,
  serializeX37WorkbenchProject } from '../src/x37-workbench-candidate.mjs';

const byId = (id) => document.getElementById(id);
const copy = (value) => structuredClone(value);

export function installX37WorkbenchCandidate({
  enabled = new URLSearchParams(location.search).get('x37-candidate') === '1',
  capability = X37_PUBLIC_CAPABILITY, compileParticipant = null, createRuntimePair = null,
  createProductAdapter = null, disposeRuntimePair = null, budgetOwner = null,
  requestUnsavedGuard = null, downloadText = null,
} = {}) {
  if (!enabled) return null;
  const source = byId('source'); const status = byId('x37-candidate-status');
  const tabs = byId('x37-source-tabs'); const canvas = byId('circuit-canvas');
  const layer = byId('component-layer'); const wires = byId('circuit-wires');
  if (!source || !status || !tabs || !canvas || !layer || !wires) return null;
  document.body.dataset.x37Candidate = 'true'; tabs.hidden = false; status.hidden = false;
  const controls = { build: byId('quick-build'), run: byId('quick-run'), pause: byId('quick-pause'),
    stop: byId('quick-stop'), reset: byId('quick-reset') };
  let project = defaultX37WorkbenchProject(); let active = 'avr'; let dirty = false;
  let graphHistory = []; let selectedNet = false; const pendingEndpoints = new Set();
  let lifecycle = createX37CoordinatedLifecycle(); const budget = budgetOwner ?? createX37CandidateBudget();
  let adapter = null; let adapterOwner = 0; let operation = 0; let buildPending = false; let runtimePending = false;
  let pauseRequested = false;
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-net-id], [data-x37-pin]') : null;
    if (!target) return; event.preventDefault(); event.stopImmediatePropagation();
    if (target.hasAttribute('data-net-id')) { selectedNet = true; renderCanvas(); return; }
    const net = project.sharedDigitalNets[0]; if (net.connected) return;
    pendingEndpoints.add(target.dataset.x37Pin.split(':')[0]); target.setAttribute('aria-pressed', 'true');
    if (pendingEndpoints.size === 2) updateGraph(true, 'Connected fixed shared.digital.0 named-pin net.');
  }, true);
  document.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-net-id], [data-x37-pin]')) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }, true);
  const participant = () => project.participants.find(({ id }) => id === active);
  const setStatus = (message) => { const value = capability.enabled || message.includes(capability.message)
    ? message : `${message} · ${capability.message}`;
    status.textContent = value; byId('quick-state').textContent = value; };
  const renderCanvas = () => {
    layer.replaceChildren(); wires.replaceChildren();
    for (const [id, label, left, pins] of [['avr', 'AVR participant', 18, ['D13', 'D2']],
      ['rp', 'RP2040 participant', 67, ['GPIO0', 'GPIO1']]]) {
      const node = document.createElement('article'); node.className = 'x37-canvas-node';
      node.dataset.participant = id; node.style.left = `${left}%`; node.style.top = '34%';
      node.innerHTML = `<strong>${label}</strong>${pins.map((pin) => `<button type="button" data-x37-pin="${id}:${pin}" aria-label="${label} ${pin}">${pin}</button>`).join('')}`;
      layer.append(node);
    }
    const net = project.sharedDigitalNets[0];
    if (net.connected) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'x37-wire-svg'); svg.setAttribute('viewBox', '0 0 1000 500');
      svg.setAttribute('aria-label', 'shared.digital.0 four named-pin branches with explicit ideal pull-up');
      for (const d of ['M320 205 H400 V250', 'M320 295 H400 V250', 'M680 205 H600 V250',
        'M680 295 H600 V250', 'M400 250 H600', 'M500 250 V170 L485 155 L515 140 L485 125 L515 110 L500 95 V65']) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d); path.setAttribute('class', 'x37-svg-branch'); svg.append(path);
      }
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text'); label.setAttribute('x', '520');
      label.setAttribute('y', '85'); label.textContent = 'IDEAL PULL-UP'; svg.append(label);
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path'); hit.setAttribute('d', 'M320 205 H400 V250 H600 V205 H680 M320 295 H400 M600 250 V295 H680');
      hit.setAttribute('class', 'x37-svg-hit'); hit.setAttribute('data-net-id', net.id); hit.setAttribute('tabindex', '0');
      hit.setAttribute('role', 'button'); hit.setAttribute('aria-label', 'Select shared.digital.0 ideal pull-up wire');
      hit.setAttribute('aria-pressed', String(selectedNet)); hit.addEventListener('click', (event) => {
        event.stopImmediatePropagation(); selectedNet = true; renderCanvas(); }); svg.append(hit); layer.append(svg);
    }
    for (const pin of layer.querySelectorAll('[data-x37-pin]')) pin.addEventListener('click', (event) => {
      event.stopImmediatePropagation();
      if (net.connected) return;
      pendingEndpoints.add(pin.dataset.x37Pin.split(':')[0]); pin.setAttribute('aria-pressed', 'true');
      if (pendingEndpoints.size === 2) updateGraph(true, 'Connected fixed shared.digital.0 named-pin net.');
    });
    canvas.setAttribute('aria-label', 'X37 topology preview only: shared.digital.0 AVR D13/D2 to RP2040 GPIO0/GPIO1, ideal pull-up.');
    byId('canvas-title').textContent = `${project.name} · bounded graph`; byId('graph-state').textContent = `2 participants · ${net.connected ? 1 : 0} connected nets`;
    byId('delete-wire').disabled = !selectedNet || !net.connected; byId('undo').disabled = graphHistory.length === 0;
    queueMicrotask(() => { byId('delete-wire').disabled = !selectedNet || !project.sharedDigitalNets[0].connected;
      byId('undo').disabled = graphHistory.length === 0; });
  };
  const renderTrace = (rows = []) => {
    byId('trace-title').textContent = 'Combined shared-net trace';
    byId('trace-boundary').textContent = 'Mapped ticks are deterministic model order, not physical timing.';
    const empty = { participantId: '—', pin: '—', localCycle: 0, mappedTick: 0, level: 'No current trace' };
    byId('trace').replaceChildren(...(rows.length ? rows : [empty]).map((row) => Object.assign(document.createElement('li'),
      { textContent: `${row.participantId} · ${row.pin} · cycle ${row.localCycle} · tick ${row.mappedTick} · ${row.level}` })));
  };
  const render = (message = capability.message, preserveEditor = false) => {
    if (!preserveEditor) source.value = participant().source;
    source.dataset.x37Participant = active;
    byId('editor-title').textContent = `${active === 'avr' ? 'AVR' : 'RP2040'} · ${participant().sourceFile}`;
    byId('x37-source-avr').setAttribute('aria-selected', String(active === 'avr'));
    byId('x37-source-rp').setAttribute('aria-selected', String(active === 'rp'));
    const phase = lifecycle.snapshot().phase; const ready = capability.enabled === true;
    controls.build.disabled = !ready || buildPending || runtimePending || phase === 'running'; controls.run.disabled = !ready || runtimePending || phase !== 'build-ready';
    controls.pause.disabled = !ready || phase !== 'running'; controls.stop.disabled = !ready || !['running', 'paused'].includes(phase);
    controls.reset.disabled = !ready || !['running', 'paused', 'stopped'].includes(phase);
    byId('build').disabled = controls.build.disabled; byId('run').disabled = controls.run.disabled;
    byId('pause').disabled = controls.pause.disabled; byId('reset').disabled = controls.reset.disabled;
    setStatus(message); renderCanvas();
  };
  const dispose = () => { const current = adapter; adapter = null; adapterOwner = 0; if (!current) return [];
    try { return current.dispose?.() ?? []; } catch (error) { return [{ code: error.code ?? error.message }]; } };
  const disposePair = (pair) => { if (!pair) return [];
    try { return disposeRuntimePair?.(pair) ?? []; } catch (error) { return [{ code: error.code ?? error.message }]; } };
  function updateGraph(connected, message) {
    const net = project.sharedDigitalNets[0]; if (net.connected === connected) return;
    graphHistory.push(net.connected); net.connected = connected; selectedNet = false; pendingEndpoints.clear();
    operation += 1; buildPending = false; runtimePending = false; dirty = true; dispose(); lifecycle.projectChanged();
    renderTrace(); render(message, true);
  }
  const commitSource = () => {
    const current = participant(); if (current.source === source.value) return;
    operation += 1; current.source = source.value; dirty = true; dispose(); lifecycle.projectChanged();
    buildPending = false; runtimePending = false; renderTrace();
    render('Source changed · both participant builds retired.', true);
  };
  source.addEventListener('input', (event) => { event.stopImmediatePropagation(); commitSource(); }, true);
  for (const id of ['avr', 'rp']) byId(`x37-source-${id}`).addEventListener('click', () => {
    commitSource(); active = id; render(`Showing ${id === 'avr' ? 'AVR main.ino' : 'RP2040 main.c'} · authored data only.`);
  });
  const buildBoth = async () => {
    commitSource(); if (buildPending) return { ok: false, code: 'X37_BUILD_ALREADY_PENDING' };
    if (!project.sharedDigitalNets[0].connected) { render('X37_SHARED_NET_DISCONNECTED · reconnect both named endpoints before Build.', true);
      return { ok: false, code: 'X37_SHARED_NET_DISCONNECTED' }; }
    const reservation = budget.preflight(capability);
    if (!reservation.ok) { render(`${reservation.code} · no Build charged.`); return reservation; }
    const ownedOperation = ++operation; buildPending = true; render('Coordinated Build pending.');
    try {
      if (typeof compileParticipant !== 'function') throw Object.assign(new Error('X37_COMPILER_ADAPTER_REQUIRED'), { code: 'X37_COMPILER_ADAPTER_REQUIRED' });
      const before = lifecycle.snapshot(); const generation = before.projectGeneration;
      const attempts = project.participants.map((item) => { budget.chargeBuild();
        return Promise.resolve().then(() => compileParticipant(copy(item), generation, before.runtimeGeneration + 1)); });
      const settled = await Promise.allSettled(attempts);
      if (ownedOperation !== operation) return { ok: false, code: 'X37_BUILD_RESULT_STALE' };
      const rejected = settled.find((item) => item.status === 'rejected'); if (rejected) throw rejected.reason;
      const results = settled.map((item) => item.value);
      for (let index = 0; index < results.length; index += 1) lifecycle.acceptBuild(project.participants[index].id, results[index]);
      render('Both current participant builds accepted · Run is ready.'); return { ok: true };
    } catch (error) { budget.cancel(); if (ownedOperation === operation) lifecycle.participantFailed();
      render(`Coordinated Build failed · ${error.code ?? error.message}`); return { ok: false, code: error.code ?? error.message };
    } finally { if (ownedOperation === operation) { buildPending = false; render(status.textContent, true); } }
  };
  const run = async () => {
    const ownedOperation = ++operation; runtimePending = true; pauseRequested = false;
    let ownedAdapter = null; let ownedPair = null;
    try {
      if (typeof createRuntimePair !== 'function' || typeof createProductAdapter !== 'function'
          || typeof disposeRuntimePair !== 'function') throw Object.assign(new Error('X37_RUNTIME_ADAPTER_REQUIRED'), { code: 'X37_RUNTIME_ADAPTER_REQUIRED' });
      budget.chargeRun(); lifecycle.start({ avr: 'ordinary-avr-worker', rp: 'ordinary-rp-worker' }); render('Starting both ordinary workers…');
      const state = lifecycle.snapshot(); ownedPair = await createRuntimePair(copy(state.builds), state);
      if (ownedOperation !== operation) { disposePair(ownedPair); ownedPair = null; return { ok: false, code: 'X37_RUNTIME_START_STALE' }; }
      try { ownedAdapter = createProductAdapter({ builds: copy(state.builds), runtimePair: ownedPair, lifecycleOwner: () => lifecycle.snapshot() }); }
      catch (error) { disposePair(error.partialRuntimePair ?? ownedPair); ownedPair = null; throw error; }
      adapter = ownedAdapter; adapterOwner = ownedOperation;
      if (pauseRequested) { ownedAdapter.pause?.(); render('Both workers paused.'); return { ok: true, paused: true }; }
      const result = await ownedAdapter.run(); const rows = result?.trace ?? [];
      if (ownedOperation !== operation || adapterOwner !== ownedOperation) return { ok: false, code: 'X37_RUN_RESULT_STALE' };
      lifecycle.appendTrace(rows); renderTrace(rows); render('Coordinated runtime active.'); return { ok: true };
    } catch (error) { if (ownedAdapter) { try { ownedAdapter.dispose?.(); } catch {} }
      else if (ownedPair) disposePair(error.partialRuntimePair ?? ownedPair);
      if (adapterOwner === ownedOperation) { adapter = null; adapterOwner = 0; }
      if (ownedOperation !== operation) return { ok: false, code: 'X37_RUN_RESULT_STALE' };
      lifecycle.participantFailed(); render(`Run failed · ${error.code ?? error.message}`);
      return { ok: false, code: error.code ?? error.message };
    } finally { if (ownedOperation === operation) { runtimePending = false; render(status.textContent, true); } }
  };
  const actions = {
    build: buildBoth, run,
    pause: () => { pauseRequested = true; const next = lifecycle.pause(); const failures = [];
      try { adapter?.pause?.(); } catch (error) { failures.push(error); } render(failures.length ? 'Paused with teardown errors.' : 'Both workers paused.'); return next; },
    stop: () => { operation += 1; buildPending = false; runtimePending = false; const failures = dispose(); let next;
      try { next = lifecycle.stop(); } finally { renderTrace(); render(failures.length ? 'Stopped with aggregated teardown errors.' : 'Both workers stopped.'); } return next; },
    reset: () => { operation += 1; buildPending = false; runtimePending = false; const failures = dispose(); let next;
      try { next = lifecycle.reset(); } finally { renderTrace(); render(failures.length ? 'Reset with aggregated teardown errors.' : 'Both workers reset; fresh Build required.'); } return next; },
  };
  for (const [name, button] of Object.entries(controls)) button.addEventListener('click', (event) => {
    event.stopImmediatePropagation(); void actions[name]();
  }, true);
  byId('delete-wire').addEventListener('click', (event) => { event.stopImmediatePropagation();
    if (selectedNet) updateGraph(false, 'Deleted shared.digital.0 · both participant builds retired.'); }, true);
  document.addEventListener('keydown', (event) => { if (event.key !== 'Delete' || !selectedNet) return;
    event.preventDefault(); event.stopImmediatePropagation(); updateGraph(false, 'Deleted shared.digital.0 · both participant builds retired.'); }, true);
  const undoGraph = () => { if (!graphHistory.length) return; const previous = graphHistory.pop(); project.sharedDigitalNets[0].connected = previous;
    operation += 1; buildPending = false; runtimePending = false; dirty = true; dispose(); lifecycle.projectChanged();
    selectedNet = false; pendingEndpoints.clear(); render('Restored the prior shared-net graph state.', true); };
  byId('undo').addEventListener('click', (event) => { event.stopImmediatePropagation(); undoGraph(); }, true);
  document.addEventListener('keydown', (event) => { if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || !graphHistory.length) return;
    event.preventDefault(); event.stopImmediatePropagation(); undoGraph(); }, true);
  byId('build').addEventListener('click', (event) => { event.stopImmediatePropagation(); void buildBoth(); }, true);
  for (const name of ['run', 'pause', 'reset']) byId(name).addEventListener('click', (event) => {
    event.stopImmediatePropagation(); void actions[name]();
  }, true);
  const download = () => { commitSource(); const text = serializeX37WorkbenchProject(project);
    downloadText?.('x37-two-controller-candidate.intent-mcu.json', text, 'application/json'); dirty = false;
    setStatus('Downloaded data-only project.'); return text; };
  const openText = (text) => { const next = parseX37WorkbenchProject(text); operation += 1; buildPending = false; runtimePending = false; dispose(); project = next;
    active = 'avr'; dirty = false; graphHistory = []; selectedNet = false; pendingEndpoints.clear(); lifecycle.opened(); renderTrace(); render('Opened atomically · fresh coordinated Build required.'); };
  const requestOpen = (continueAction) => requestUnsavedGuard?.({ isDirty: () => dirty,
    fingerprint: () => serializeX37WorkbenchProject(project), download, continueAction }) ?? continueAction();
  byId('project-save').addEventListener('click', (event) => { event.stopImmediatePropagation(); download(); }, true);
  byId('project-open').addEventListener('click', (event) => {
    event.stopImmediatePropagation(); requestOpen(() => byId('project-open-input').click());
  }, true);
  byId('project-open-input').addEventListener('change', async (event) => {
    event.stopImmediatePropagation(); const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try { openText(await file.text()); } catch (error) { render(`Open rejected atomically · ${error.code ?? error.message}`); }
  }, true);
  renderTrace(); render();
  return Object.freeze({ ...actions, download, openText, requestOpen, project: () => copy(project),
    lifecycle: () => lifecycle.snapshot(), budget: () => budget.snapshot(),
    selectParticipant: (id) => { if (!['avr', 'rp'].includes(id)) throw new TypeError('X37_PARTICIPANT'); commitSource(); active = id; render(); },
  });
}
