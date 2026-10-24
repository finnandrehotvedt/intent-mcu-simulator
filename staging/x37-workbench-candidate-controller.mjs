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
  createProductAdapter = null, disposeRuntimePair = null, requestUnsavedGuard = null, downloadText = null,
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
  let lifecycle = createX37CoordinatedLifecycle(); const budget = createX37CandidateBudget();
  let adapter = null; let operation = 0; let buildPending = false; let runtimePending = false;
  let pauseRequested = false;
  const participant = () => project.participants.find(({ id }) => id === active);
  const setStatus = (message) => { status.textContent = message; byId('quick-state').textContent = message; };
  const renderCanvas = () => {
    layer.replaceChildren(); wires.replaceChildren();
    for (const [id, label, left, pins] of [['avr', 'AVR participant', 18, ['D13', 'D2']],
      ['rp', 'RP2040 participant', 67, ['GPIO0', 'GPIO1']]]) {
      const node = document.createElement('article'); node.className = 'x37-canvas-node';
      node.dataset.participant = id; node.style.left = `${left}%`; node.style.top = '34%';
      node.innerHTML = `<strong>${label}</strong>${pins.map((pin) => `<button type="button" data-x37-pin="${id}:${pin}" aria-label="${label} ${pin}">${pin}</button>`).join('')}`;
      layer.append(node);
    }
    const wire = document.createElement('div'); wire.className = 'x37-canvas-wire';
    wire.setAttribute('data-net-id', project.sharedDigitalNets[0].id); wire.setAttribute('aria-label', 'shared.digital.0 ideal pull-up');
    layer.append(wire);
    canvas.setAttribute('aria-label', 'X37 topology preview only: shared.digital.0 AVR D13/D2 to RP2040 GPIO0/GPIO1, ideal pull-up.');
    byId('canvas-title').textContent = `${project.name} · topology preview`; byId('graph-state').textContent = '2 participants · 1 preview net';
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
  const dispose = () => { const current = adapter; adapter = null; if (!current) return [];
    try { return current.dispose?.() ?? []; } catch (error) { return [{ code: error.code ?? error.message }]; } };
  const disposePair = (pair) => { if (!pair) return [];
    try { return disposeRuntimePair?.(pair) ?? []; } catch (error) { return [{ code: error.code ?? error.message }]; } };
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
    try {
      if (typeof createRuntimePair !== 'function' || typeof createProductAdapter !== 'function') throw Object.assign(new Error('X37_RUNTIME_ADAPTER_REQUIRED'), { code: 'X37_RUNTIME_ADAPTER_REQUIRED' });
      budget.chargeRun(); lifecycle.start({ avr: 'ordinary-avr-worker', rp: 'ordinary-rp-worker' }); render('Starting both ordinary workers…');
      const state = lifecycle.snapshot(); const runtimePair = await createRuntimePair(copy(state.builds), state);
      if (ownedOperation !== operation) { disposePair(runtimePair); return { ok: false, code: 'X37_RUNTIME_START_STALE' }; }
      try { adapter = createProductAdapter({ builds: copy(state.builds), runtimePair, lifecycleOwner: () => lifecycle.snapshot() }); }
      catch (error) { disposePair(error.partialRuntimePair ?? runtimePair); throw error; }
      if (pauseRequested) { adapter.pause?.(); render('Both workers paused.'); return { ok: true, paused: true }; }
      const result = await adapter.run(); const rows = result?.trace ?? [];
      if (ownedOperation !== operation) return { ok: false, code: 'X37_RUN_RESULT_STALE' };
      lifecycle.appendTrace(rows); renderTrace(rows); render('Coordinated runtime active.'); return { ok: true };
    } catch (error) { disposePair(error.partialRuntimePair); dispose(); if (ownedOperation === operation) lifecycle.participantFailed();
      render(`Run failed · ${error.code ?? error.message}`); return { ok: false, code: error.code ?? error.message };
    } finally { if (ownedOperation === operation) { runtimePending = false; render(status.textContent, true); } }
  };
  const actions = {
    build: buildBoth, run,
    pause: () => { pauseRequested = true; const next = lifecycle.pause(); const failures = [];
      try { adapter?.pause?.(); } catch (error) { failures.push(error); } render(failures.length ? 'Paused with teardown errors.' : 'Both workers paused.'); return next; },
    stop: () => { operation += 1; runtimePending = false; const failures = dispose(); let next;
      try { next = lifecycle.stop(); } finally { renderTrace(); render(failures.length ? 'Stopped with aggregated teardown errors.' : 'Both workers stopped.'); } return next; },
    reset: () => { operation += 1; runtimePending = false; const failures = dispose(); let next;
      try { next = lifecycle.reset(); } finally { renderTrace(); render(failures.length ? 'Reset with aggregated teardown errors.' : 'Both workers reset; fresh Build required.'); } return next; },
  };
  for (const [name, button] of Object.entries(controls)) button.addEventListener('click', (event) => {
    event.stopImmediatePropagation(); void actions[name]();
  }, true);
  byId('build').addEventListener('click', (event) => { event.stopImmediatePropagation(); void buildBoth(); }, true);
  for (const name of ['run', 'pause', 'reset']) byId(name).addEventListener('click', (event) => {
    event.stopImmediatePropagation(); void actions[name]();
  }, true);
  const download = () => { commitSource(); const text = serializeX37WorkbenchProject(project);
    downloadText?.('x37-two-controller-candidate.intent-mcu.json', text, 'application/json'); dirty = false;
    setStatus('Downloaded data-only project.'); return text; };
  const openText = (text) => { const next = parseX37WorkbenchProject(text); operation += 1; dispose(); project = next;
    active = 'avr'; dirty = false; lifecycle.opened(); renderTrace(); render('Opened atomically · fresh coordinated Build required.'); };
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
