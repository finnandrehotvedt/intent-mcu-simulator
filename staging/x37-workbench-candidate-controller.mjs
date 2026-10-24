// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { X37_PUBLIC_CAPABILITY, defaultX37WorkbenchProject,
  parseX37WorkbenchProject, serializeX37WorkbenchProject } from '../src/x37-workbench-candidate.mjs';

const byId = (id) => document.getElementById(id);

export function installX37WorkbenchCandidate() {
  const root = byId('x37-workbench-candidate');
  if (!root || new URLSearchParams(location.search).get('x37-candidate') !== '1') return;
  root.hidden = false;
  document.body.dataset.x37Candidate = 'true';
  let project = defaultX37WorkbenchProject(); let active = 'avr'; let dirty = false;
  const source = byId('x37-candidate-source'); const status = byId('x37-candidate-status');
  const build = byId('x37-candidate-build'); const run = byId('x37-candidate-run');
  const pause = byId('x37-candidate-pause'); const stop = byId('x37-candidate-stop');
  const reset = byId('x37-candidate-reset'); const input = byId('x37-candidate-open-input');
  const render = (message = X37_PUBLIC_CAPABILITY.message) => {
    const participant = project.participants.find(({ id }) => id === active);
    source.value = participant.source; source.dataset.participant = active;
    byId('x37-source-avr').setAttribute('aria-selected', String(active === 'avr'));
    byId('x37-source-rp').setAttribute('aria-selected', String(active === 'rp'));
    for (const control of [build, run, pause, stop, reset]) control.disabled = true;
    status.textContent = message;
    byId('x37-candidate-project-name').textContent = project.name;
  };
  const commitSource = () => {
    const participant = project.participants.find(({ id }) => id === source.dataset.participant);
    if (participant.source === source.value) return;
    participant.source = source.value; dirty = true;
    status.textContent = 'Authored source changed · fresh coordinated Build would be required.';
  };
  source.addEventListener('input', commitSource);
  for (const id of ['avr', 'rp']) byId(`x37-source-${id}`).addEventListener('click', () => {
    commitSource(); active = id; render(`Showing ${id === 'avr' ? 'AVR main.ino' : 'RP2040 main.c'} · authored data only.`);
  });
  byId('x37-candidate-download').addEventListener('click', () => {
    commitSource(); const blob = new Blob([serializeX37WorkbenchProject(project)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    link.download = 'x37-two-controller-candidate.intent-mcu.json'; link.click(); URL.revokeObjectURL(link.href);
    dirty = false;
    status.textContent = 'Downloaded data-only candidate project · no artifacts, runtime, trace or verdict.';
  });
  byId('x37-candidate-open').addEventListener('click', () => {
    if (dirty) {
      status.textContent = 'Open blocked · download or reload before replacing unsaved authored source.';
      return;
    }
    input.click();
  });
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; input.value = ''; if (!file) return;
    try { const next = parseX37WorkbenchProject(await file.text()); project = next; active = 'avr';
      render('Opened and atomically validated data only · fresh coordinated Build remains required.');
    } catch (error) { render(`Open rejected atomically · ${error.code ?? error.message}`); }
  });
  window.__X37_CANDIDATE__ = Object.freeze({
    enabled: true, capability: X37_PUBLIC_CAPABILITY,
    project: () => JSON.parse(serializeX37WorkbenchProject(project)), dirty: () => dirty,
  });
  render();
}
