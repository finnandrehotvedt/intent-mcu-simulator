// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  PHYSICAL_CHECKLIST_DEFINITIONS,
  PHYSICAL_CHECKLIST_LIMIT,
  canonicalPhysicalChecklistText,
  createPhysicalChecklist,
  normalizePhysicalChecklist,
  parsePhysicalChecklistText,
} from '../src/physical-verification-checklist.mjs';

const profile = document.querySelector('#physical-profile');
const itemsRoot = document.querySelector('#physical-items');
const identityRoot = document.querySelector('#physical-identity');
const boundary = document.querySelector('#physical-boundary');
const status = document.querySelector('#physical-status');
const fileInput = document.querySelector('#physical-file');
const printProjection = document.querySelector('#physical-print-projection');
let current = createPhysicalChecklist(PHYSICAL_CHECKLIST_DEFINITIONS[0].profile);
let generation = 0;

const clone = (value) => structuredClone(value);
const setStatus = (message, valid = true) => {
  status.textContent = message;
  status.dataset.valid = String(valid);
};

function observationFields(observation = null, itemId = 'item') {
  const values = observation ?? { value: '', unit: '', method: '', conditions: '', reference: '', notes: '' };
  return `<fieldset class="physical-observation"><legend>Manual user observation · not independently verified</legend>
    ${Object.entries(values).map(([name, value]) => `<label>${name[0].toUpperCase()}${name.slice(1)}${['value', 'unit', 'method'].includes(name) ? ' *' : ''}<input data-observation="${name}" value="${escapeAttribute(value)}" aria-describedby="physical-string-limit-${itemId}"></label>`).join('')}
    <small id="physical-string-limit-${itemId}">Each field accepts at most 500 Unicode characters. The strict parser is authoritative.</small>
  </fieldset>`;
}

function escapeAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function renderIdentity() {
  const rows = [
    ['Schema', current.schema], ['Definition version', current.definitionVersion],
    ['Product release', current.productRelease], ['Definition baseline source', current.sourceCommit],
    ['Profile', current.profile], ['Controller model', current.controllerModel],
    ['Definition SHA-256', current.definitionSha256],
  ];
  identityRoot.innerHTML = rows.map(([term, value]) => `<div><dt>${term}</dt><dd><code>${value}</code></dd></div>`).join('');
}

function statusOptions(item) {
  const values = item.status === 'profile-unavailable'
    ? [['profile-unavailable', 'Unavailable in this profile']]
    : [['manual-not-measured', 'Manual check not measured'], ['manual-recorded', 'Manual user record'], ['not-applicable', 'Not applicable to this setup']];
  return values.map(([value, label]) => `<option value="${value}"${item.status === value ? ' selected' : ''}>${label}</option>`).join('');
}

function render() {
  renderIdentity();
  itemsRoot.innerHTML = current.items.map((item, index) => `<article class="panel physical-checklist-item" data-item-id="${item.id}">
    <div class="physical-item-heading"><div><span class="physical-item-number">${index + 1}</span><p class="eyebrow">${item.category}</p><h2>${item.subject}</h2></div><span class="physical-basis" data-basis="${item.simulatorBasis}">${item.simulatorBasis}</span></div>
    <p class="docs-intro">${item.guidance}</p>
    <label>Status <select data-item-status${item.status === 'profile-unavailable' ? ' disabled' : ''}>${statusOptions(item)}</select></label>
    <div data-observation-fields${item.status === 'manual-recorded' ? '' : ' hidden'}>${observationFields(item.observation, item.id)}</div>
  </article>`).join('');
  updateBoundary(current);
}

function candidateFromDom() {
  const candidate = clone(current);
  for (const [index, row] of [...itemsRoot.querySelectorAll('[data-item-id]')].entries()) {
    const selected = row.querySelector('[data-item-status]').value;
    candidate.items[index].status = selected;
    candidate.items[index].observation = selected === 'manual-recorded'
      ? Object.fromEntries([...row.querySelectorAll('[data-observation]')].map((input) => [input.dataset.observation, input.value]))
      : null;
  }
  candidate.evidenceBoundary.physicalEvidencePresent = candidate.items.some((item) => item.status === 'manual-recorded');
  return normalizePhysicalChecklist(candidate);
}

function updateBoundary(value = null) {
  const present = value?.evidenceBoundary?.physicalEvidencePresent === true;
  boundary.innerHTML = present
    ? '<strong>Manual user record present — not independently verified</strong><span>No measurement, pass, safety or certification verdict is supplied by the Lab.</span>'
    : '<strong>Physical evidence absent</strong><span>Manual check not measured. Simulator evidence is not physical-board evidence.</span>';
  boundary.dataset.present = String(present);
}

const PRINT_STATUS = Object.freeze({
  'manual-not-measured': 'Manual check not measured',
  'manual-recorded': 'Manual user record — not independently verified',
  'not-applicable': 'Not applicable to this setup',
  'profile-unavailable': 'Unavailable in this profile',
});

function appendText(parent, tag, text, className = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function renderPrintProjection(value) {
  printProjection.replaceChildren();
  appendText(printProjection, 'p', 'X76 · MANUAL PHYSICAL BOUNDARY', 'eyebrow');
  appendText(printProjection, 'h2', 'Printable physical verification record');
  appendText(printProjection, 'p', value.evidenceBoundary.physicalEvidencePresent
    ? 'Manual user record present — not independently verified. No measurement, pass, safety or certification verdict is supplied by the Lab.'
    : 'Physical evidence absent — manual check not measured. Simulator evidence is not physical-board evidence.',
  'physical-print-boundary');
  const identity = document.createElement('dl');
  identity.className = 'physical-print-identity';
  for (const [term, detail] of [
    ['Schema', value.schema], ['Definition version', value.definitionVersion],
    ['Product release', value.productRelease], ['Definition baseline source', value.sourceCommit],
    ['Profile', value.profile], ['Controller model', value.controllerModel],
    ['Definition SHA-256', value.definitionSha256],
  ]) {
    const row = document.createElement('div');
    appendText(row, 'dt', term);
    appendText(row, 'dd', String(detail));
    identity.append(row);
  }
  printProjection.append(identity);
  const list = document.createElement('div');
  list.className = 'physical-print-items';
  for (const [index, item] of value.items.entries()) {
    const article = document.createElement('article');
    article.dataset.printItemId = item.id;
    appendText(article, 'h3', `${index + 1}. ${item.subject}`);
    appendText(article, 'p', `Status: ${PRINT_STATUS[item.status]}`, 'physical-print-status');
    article.querySelector('.physical-print-status').dataset.printStatus = item.status;
    appendText(article, 'p', `Simulator basis: ${item.simulatorBasis}`);
    appendText(article, 'p', item.guidance);
    if (item.observation) {
      const observation = document.createElement('dl');
      observation.className = 'physical-print-observation';
      for (const [term, detail] of Object.entries(item.observation)) {
        const row = document.createElement('div');
        appendText(row, 'dt', term[0].toUpperCase() + term.slice(1));
        appendText(row, 'dd', detail || '—');
        observation.append(row);
      }
      article.append(observation);
    }
    list.append(article);
  }
  printProjection.append(list);
  appendText(printProjection, 'p', 'Manual user record only · not independently verified · no device access, automatic verdict, safety claim or certification.', 'physical-print-footer');
}

function syncDraft() {
  try {
    current = candidateFromDom();
    updateBoundary(current);
    setStatus(current.evidenceBoundary.physicalEvidencePresent
      ? 'Manual user record accepted in this tab only; not independently verified.'
      : 'Checklist updated in this tab only. Physical evidence remains absent.');
    return true;
  } catch {
    boundary.innerHTML = '<strong>Manual observation incomplete</strong><span>Value, unit and method are required before export or print.</span>';
    boundary.dataset.present = 'false';
    setStatus('Complete value, unit and method. The prior accepted checklist remains unchanged.', false);
    return false;
  }
}

profile.innerHTML = PHYSICAL_CHECKLIST_DEFINITIONS.map((definition) =>
  `<option value="${definition.profile}">${definition.label}</option>`).join('');
profile.addEventListener('change', () => {
  generation += 1;
  current = createPhysicalChecklist(profile.value);
  render();
  setStatus('Profile changed. Physical evidence is absent; prior tab-only entries were cleared.');
});

itemsRoot.addEventListener('change', (event) => {
  const row = event.target.closest('[data-item-id]');
  if (!row) return;
  if (event.target.matches('[data-item-status]')) {
    row.querySelector('[data-observation-fields]').hidden = event.target.value !== 'manual-recorded';
  }
  generation += 1;
  syncDraft();
});
itemsRoot.addEventListener('input', () => { generation += 1; syncDraft(); });

document.querySelector('#physical-open').addEventListener('click', () => {
  generation += 1;
  fileInput.dataset.generation = String(generation);
  fileInput.click();
});
fileInput.addEventListener('change', async () => {
  const requestGeneration = Number(fileInput.dataset.generation);
  const [file] = fileInput.files;
  fileInput.value = '';
  if (!file) {
    if (requestGeneration === generation) setStatus('Open cancelled. Current checklist was not changed.');
    return;
  }
  if (file.size > PHYSICAL_CHECKLIST_LIMIT) {
    if (requestGeneration === generation) setStatus('Rejected checklist atomically: PHYSICAL_CHECKLIST_INPUT_LIMIT.', false);
    return;
  }
  try {
    const source = await file.text();
    if (requestGeneration !== generation) return;
    const accepted = parsePhysicalChecklistText(source);
    if (requestGeneration !== generation) return;
    current = accepted;
    profile.value = accepted.profile;
    render();
    setStatus(`Opened ${file.name} locally. No project, runtime or device state changed.`);
  } catch (error) {
    if (requestGeneration === generation) {
      setStatus(`Rejected checklist atomically: ${error.code ?? 'PHYSICAL_CHECKLIST_INVALID'}.`, false);
    }
  }
});

document.querySelector('#physical-download').addEventListener('click', () => {
  try {
    current = candidateFromDom();
    const text = canonicalPhysicalChecklistText(current);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `intent-mcu-physical-checklist-${current.profile.replaceAll(/[^a-z0-9]+/gu, '-')}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    globalThis.__X76_LAST_DOWNLOAD__ = { profile: current.profile, bytes: new TextEncoder().encode(text).length };
    setStatus('Download requested. The browser or operating system decides whether a file was written.');
  } catch {
    setStatus('Download blocked: complete the manual observation or clear it.', false);
  }
});

document.querySelector('#physical-print').addEventListener('click', () => {
  try {
    current = candidateFromDom();
    renderPrintProjection(current);
    document.documentElement.dataset.printRequested = 'true';
    setStatus('Print requested. The Lab cannot confirm an operating-system print or PDF save.');
    window.print();
  } catch {
    setStatus('Print blocked: complete the manual observation or clear it.', false);
  }
});

document.querySelector('#physical-clear').addEventListener('click', () => {
  generation += 1;
  current = createPhysicalChecklist(profile.value);
  render();
  setStatus('Current-tab entries cleared. Physical evidence is absent.');
});

render();
globalThis.__X76_READY__ = true;
