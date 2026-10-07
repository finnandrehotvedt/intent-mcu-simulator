// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  CATALOG_CATEGORIES,
  COMPONENT_CATALOG,
  SUPPORT_STATUS,
  catalogEntries,
  defaultProperties,
  filterCatalog,
} from '../src/component-catalog.mjs';
import { CIRCUIT_SCHEMA, validateCircuit } from '../src/circuit-engine.mjs';
import {
  commandBuildRelevance,
  ProjectEditorReducer,
  createEmptyProject,
  endpointConnection,
  exportCanonicalProject,
  generatePromptBridgeV2,
  newComponent,
  parsePromptBridgeV2,
  projectFromCircuit,
} from '../src/project-editor.mjs';
import { PROJECT_RECOVERY_KEY, PROJECT_STORAGE_KEY, migrateProjectV1, parseProjectV2 } from '../src/project-v2.mjs';
import {
  addRouteJog,
  isRouteFamily,
  materializeRouteFamily,
  moveRouteSegment,
  routeFamilyPaths,
  routeSegmentOrientation,
} from '../src/route-model.mjs';
import { explainError } from '../src/error-catalog.mjs';
import { createLifecycleState, transitionLifecycle } from '../src/lifecycle.mjs';
import { createExampleProject } from '../src/example-projects.mjs';
import { serialEventText, serialInputBytes, serialText } from '../src/serial-view.mjs';
import { CPU_CYCLES_PER_MILLISECOND, cursorCycles, waveformPaths } from '../src/waveform-view.mjs';
import { createComponentArtwork } from './component-artwork.mjs';

const byId = (id) => document.querySelector(`#${id}`);
const elements = Object.fromEntries([
  'source', 'build', 'cancel', 'build-state', 'diagnostics', 'worker-state', 'cycle', 'instructions', 'artifact', 'trace',
  'run', 'pause', 'step', 'reset', 'speed', 'canvas-title', 'circuit-canvas', 'canvas-transform', 'component-layer', 'circuit-wires',
  'graph-state', 'wire-state', 'circuit-diagnostics', 'serial-output', 'serial-count', 'serial-input', 'serial-send',
  'serial-clear', 'logic-output', 'logic-count', 'logic-channels', 'logic-window', 'logic-cursor', 'pin-select',
  'pin-mode', 'pin-level', 'pin-detail', 'pin-diagnostic', 'pin-cycle', 'catalog-search', 'catalog-category',
  'catalog-interface', 'catalog-status', 'catalog-supply-voltage', 'catalog-pin-voltage', 'catalog-favorites', 'catalog-count',
  'catalog-empty', 'catalog-clear',
  'catalog-list', 'catalog-prev', 'catalog-page', 'catalog-next', 'selection-name', 'property-editor', 'rotate-component', 'duplicate-component', 'delete-component',
  'selected-net', 'net-members', 'wire-color', 'wire-bends', 'selection-support', 'reconnect-mode', 'add-bend', 'delete-wire', 'remove-junction', 'zoom-value',
  'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down', 'view-reset', 'fit-project', 'project-state',
  'project-message', 'project-name', 'project-new', 'project-demo', 'project-save', 'project-reload', 'project-export', 'project-import',
  'project-import-mode', 'undo', 'redo', 'prompt-generate', 'prompt-copy', 'prompt-output', 'prompt-response',
  'prompt-mode', 'prompt-apply', 'prompt-message', 'component-controls',
  'editor-title', 'source-file', 'source-file-name', 'source-file-add', 'source-file-remove',
  'lifecycle-state', 'technical-error', 'technical-error-detail', 'delete-branch',
  'example-select', 'walkthrough-open', 'walkthrough', 'recovery-export', 'quick-state', 'quick-build', 'quick-run', 'quick-pause', 'quick-reset',
  'toggle-catalog', 'toggle-inspector', 'catalog-resizer', 'inspector-resizer', 'show-pin-labels', 'focus-canvas', 'fullscreen-canvas',
  'source-lines', 'source-highlight', 'diagnostic-links', 'build-log', 'simulated-time', 'requested-speed', 'achieved-speed',
  'serial-text-mode', 'serial-event-mode', 'serial-export', 'serial-newline', 'logic-waveform', 'logic-cursor-a', 'logic-cursor-b',
].map((id) => [id.replaceAll('-', ''), byId(id)]));

const runtimeControls = [elements.run, elements.pause, elements.step, elements.reset, elements.speed];
const CATALOG_PREFERENCES_KEY = 'intent-mcu.catalog-preferences.v1';
const MAX_RECENT_COMPONENTS = 8;
const CATALOG_WINDOW_LIMIT = 80;

let editor;
let selectedComponentId = null;
let selectedNetId = null;
let pendingEndpoint = null;
let wireMode = 'connect';
let worker = null;
let workerToken = 0;
let activeJob = null;
let loadedSourceIdentity = null;
let running = false;
let lastWorkerMessage = 0;
let selectedSourceFile = 'main.ino';
let catalogPreferences = loadCatalogPreferences();
let catalogWindowStart = 0;
let catalogFixtureRecords = null;
let catalogBenchmarkSession = null;
let catalogFixturePriorFilters = null;
let routeDrag = null;
let componentDrag = null;
let canvasPan = null;
let selectedRouteSegment = null;
let lifecycle = createLifecycleState();
let savedRevision = null;
let savedProjectGeneration = null;
let buildAbortController = null;
let serialViewMode = 'text';
let lastThroughputSample = null;
let latestBuildResult = null;

window.__M6_STATE__ = {
  buildState: 'dirty', artifactIdentity: null, inputIdentity: null, cacheHit: false,
  runtime: null, project: null, revision: 0, selectedComponentId: null,
  importReport: null, lastAction: 'initialized',
};
window.__M3_STATE__ = window.__M6_STATE__;
window.__M4_STATE__ = window.__M6_STATE__;
window.__M5_STATE__ = window.__M6_STATE__;
window.__M7_STATE__ = window.__M6_STATE__;
window.__M11_STATE__ = window.__M6_STATE__;
window.__M3_READY__ = true; window.__M4_READY__ = true; window.__M5_READY__ = true; window.__M6_READY__ = true; window.__M7_READY__ = true;
window.__M11_READY__ = true;

function publish(update) { Object.assign(window.__M6_STATE__, update); }
function renderLifecycle() {
  elements.lifecyclestate.textContent = lifecycle.phase;
  elements.lifecyclestate.dataset.phase = lifecycle.phase;
  elements.quickstate.textContent = `${currentProject().metadata.name} · ${lifecycle.phase}`;
  publish({ lifecycle: structuredClone(lifecycle) });
}
function applyLifecycle(event) {
  const result = transitionLifecycle(lifecycle, event);
  if (result.accepted) lifecycle = result.state;
  renderLifecycle();
  return result;
}
function clearTechnicalError() {
  elements.technicalerror.hidden = true;
  elements.technicalerrordetail.textContent = '';
}
function showActionableError(target, code, technical = code) {
  const explanation = explainError(code, technical);
  target.textContent = explanation.action;
  elements.technicalerrordetail.textContent = `${explanation.code}\n${explanation.technical}`;
  elements.technicalerror.hidden = false;
  return explanation;
}
function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function highlightSource(source) {
  const escaped = escapeHtml(source);
  return escaped.replace(/(\/\/[^\n]*)|(["'])(.*?)(\2)|\b(void|int|bool|char|long|float|double|if|else|for|while|return|const|unsigned|HIGH|LOW|INPUT|OUTPUT|INPUT_PULLUP)\b|\b(\d+(?:\.\d+)?)\b/gu,
    (match, comment, quote, stringBody, closing, keyword, number) => {
      if (comment) return `<span class="tok-comment">${comment}</span>`;
      if (quote) return `<span class="tok-string">${quote}${stringBody}${closing}</span>`;
      if (keyword) return `<span class="tok-keyword">${keyword}</span>`;
      if (number) return `<span class="tok-number">${number}</span>`;
      return match;
    });
}
function renderSourceEditor() {
  const source = elements.source.value;
  const lineCount = Math.max(1, source.split('\n').length);
  elements.sourcelines.textContent = Array.from({ length: lineCount }, (_, index) => index + 1).join('\n');
  elements.sourcehighlight.innerHTML = `${highlightSource(source)}\n`;
  elements.sourcelines.scrollTop = elements.source.scrollTop;
  elements.sourcehighlight.scrollTop = elements.source.scrollTop;
  elements.sourcehighlight.scrollLeft = elements.source.scrollLeft;
}
function navigateDiagnostic(diagnostic) {
  const targetName = diagnostic.file?.split('/').at(-1);
  if (targetName && currentProject().source.files.some((file) => file.name === targetName)) selectedSourceFile = targetName;
  renderProject();
  const lines = elements.source.value.split('\n');
  const line = Math.max(1, Math.min(lines.length, Number(diagnostic.line) || 1));
  const start = lines.slice(0, line - 1).reduce((count, value) => count + value.length + 1, 0);
  const end = start + lines[line - 1].length;
  elements.source.focus(); elements.source.setSelectionRange(start, end);
  elements.source.scrollTop = Math.max(0, (line - 4) * 21);
  renderSourceEditor();
}
function renderBuildDiagnostics(result, fallback = 'No compiler diagnostics.') {
  latestBuildResult = result ?? null;
  const diagnostics = result?.diagnostics ?? [];
  const grouped = diagnostics.filter((item) => item.severity === 'error' || item.severity === 'warning');
  elements.diagnostics.textContent = grouped.length ? grouped.map((item) => `${item.severity}: ${item.message}`).join('\n') : fallback;
  const buttons = grouped.map((diagnostic) => {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = `${diagnostic.file?.split('/').at(-1) ?? 'source'}:${diagnostic.line ?? 1} · ${diagnostic.severity}`;
    button.addEventListener('click', () => navigateDiagnostic(diagnostic));
    return button;
  });
  elements.diagnosticlinks.replaceChildren(...buttons);
  elements.buildlog.textContent = result?.text || formatDiagnostics(result) || fallback;
}
function currentProject() { return editor.project; }
function endpointKey(endpoint) { return `${endpoint.component}.${endpoint.pin}`; }
function parseEndpoint(key) {
  const split = key.lastIndexOf('.');
  return split > 0 ? { component: key.slice(0, split), pin: key.slice(split + 1) } : null;
}
function nextEntityId(prefix, values) {
  const used = new Set(values);
  for (let index = 1; index < 1_000; index += 1) {
    const id = `${prefix}-${index}`;
    if (!used.has(id)) return id;
  }
  throw new Error(`${prefix.toUpperCase()}_LIMIT`);
}
function loadCatalogPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(CATALOG_PREFERENCES_KEY) ?? '{}');
    const selectable = new Set(catalogEntries({ selectableOnly: true }).map((entry) => entry.type));
    const favorites = Array.isArray(value.favorites)
      ? [...new Set(value.favorites.filter((type) => typeof type === 'string' && selectable.has(type)))].slice(0, 64) : [];
    const recent = Array.isArray(value.recent)
      ? [...new Set(value.recent.filter((type) => typeof type === 'string' && selectable.has(type)))].slice(0, MAX_RECENT_COMPONENTS) : [];
    return { favorites, recent };
  } catch {
    return { favorites: [], recent: [] };
  }
}
function saveCatalogPreferences() {
  try { localStorage.setItem(CATALOG_PREFERENCES_KEY, JSON.stringify(catalogPreferences)); }
  catch { elements.projectmessage.textContent = 'Catalogue preferences could not be saved; the project remains usable.'; }
}
function markRecentComponent(type) {
  catalogPreferences.recent = [type, ...catalogPreferences.recent.filter((item) => item !== type)].slice(0, MAX_RECENT_COMPONENTS);
  saveCatalogPreferences();
}
function toggleFavorite(type) {
  const selected = new Set(catalogPreferences.favorites);
  if (selected.has(type)) selected.delete(type); else selected.add(type);
  catalogPreferences.favorites = [...selected].sort();
  saveCatalogPreferences();
  renderCatalog();
}
function persistProject(message = null) {
  try {
    const text = exportCanonicalProject(currentProject());
    if (new TextEncoder().encode(text).length > 4 * 1024 * 1024) throw new Error('STORAGE_PROJECT_LIMIT');
    localStorage.setItem(PROJECT_RECOVERY_KEY, text);
    localStorage.setItem(PROJECT_STORAGE_KEY, text);
    localStorage.removeItem(PROJECT_RECOVERY_KEY);
    savedRevision = editor.revision;
    savedProjectGeneration = lifecycle.projectGeneration;
    if (message) elements.projectmessage.textContent = message;
    elements.recoveryexport.disabled = true;
    return true;
  } catch (error) {
    elements.projectmessage.textContent = `Local save failed (${error.name || error.message}). The in-memory project remains usable.`;
    elements.recoveryexport.disabled = false;
    return false;
  }
}
function downloadText(filename, text, type = 'text/plain') {
  const link = document.createElement('a');
  link.download = filename; link.href = URL.createObjectURL(new Blob([text], { type }));
  link.click(); URL.revokeObjectURL(link.href);
}
function buildInputIdentity() {
  return JSON.stringify({
    boardProfile: currentProject().boardProfile,
    source: currentProject().source,
    circuit: currentProject().circuit,
  });
}

function setRuntimeEnabled(enabled) {
  for (const control of runtimeControls) control.disabled = !enabled;
  elements.serialsend.disabled = !enabled;
  elements.serialclear.disabled = !enabled;
  elements.quickrun.disabled = !enabled;
  elements.quickpause.disabled = !enabled;
  elements.quickreset.disabled = !enabled;
}

function clearRuntimePresentation() {
  elements.cycle.textContent = '0';
  elements.instructions.textContent = '0';
  elements.artifact.textContent = 'none';
  elements.simulatedtime.textContent = '0.000 ms';
  elements.achievedspeed.textContent = '—';
  lastThroughputSample = null;
  elements.trace.replaceChildren(Object.assign(document.createElement('li'), { textContent: '0000000000 · LOW' }));
  elements.serialoutput.textContent = 'No firmware bytes.';
  elements.serialcount.textContent = '0 records';
  elements.logicoutput.replaceChildren(Object.assign(document.createElement('li'), { textContent: '— · 0000000000 · LOW' }));
  elements.logiccount.textContent = '0 transitions';
  elements.logiccursor.textContent = 'Cursor Δ —';
  elements.logicwaveform.replaceChildren();
  elements.pinmode.textContent = '—'; elements.pinlevel.textContent = '—'; elements.pindetail.textContent = '—';
  elements.pindiagnostic.textContent = '—'; elements.pincycle.textContent = '0';
  for (const visual of elements.componentlayer.querySelectorAll('.component-led.on')) visual.classList.remove('on');
  publish({ runtime: null });
}

function stopRuntime(message = 'No current artifact loaded', { updateLifecycle = true, stale = false } = {}) {
  workerToken += 1;
  worker?.terminate();
  worker = null;
  running = false;
  setRuntimeEnabled(false);
  elements.workerstate.textContent = message;
  clearRuntimePresentation();
  if (updateLifecycle) applyLifecycle({
    type: 'runtime.stop', stale, empty: currentProject().circuit.components.length === 0, reason: message,
  });
}

function detachOutstandingBuild() {
  const job = activeJob;
  activeJob = null;
  buildAbortController?.abort();
  buildAbortController = null;
  elements.build.disabled = false;
  elements.quickbuild.disabled = false;
  elements.cancel.disabled = true;
  if (job?.jobId && job?.capability) {
    void fetch(`/api/build/${job.jobId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${job.capability}`, 'X-Teach-Lab-Build': '1' },
    }).catch(() => {});
  }
}

function installProjectGeneration({ empty, reason, runtimeMessage }) {
  detachOutstandingBuild();
  stopRuntime(runtimeMessage, { updateLifecycle: false });
  applyLifecycle({ type: 'project.install', empty, reason });
  savedRevision = null;
  savedProjectGeneration = null;
  selectedComponentId = null;
  selectedNetId = null;
  selectedRouteSegment = null;
  pendingEndpoint = null;
  routeDrag = null;
  wireMode = 'connect';
  elements.reconnectmode.setAttribute('aria-pressed', 'false');
  elements.wirestate.textContent = empty
    ? 'Add parts, then select two named pins to create a wire.'
    : 'Select two named pins to create a wire. A branch requires an explicit junction; crossings remain separate.';
  elements.diagnostics.textContent = 'No build submitted for this project.';
  elements.diagnosticlinks.replaceChildren(); elements.buildlog.textContent = 'No build submitted for this project.';
  elements.buildstate.textContent = empty ? 'Add a supported circuit to build' : 'Build required';
  publish({
    buildState: empty ? 'empty' : 'dirty', artifactIdentity: null, inputIdentity: null,
    cacheHit: false, runtime: null, importReport: null, selectedComponentId: null,
  });
  clearTechnicalError();
}

function applyEditor(command, message = command.type) {
  const result = editor.apply({ ...command, revision: editor.revision }, { running });
  if (!result.ok) {
    showActionableError(elements.projectmessage, result.code, `${message}\n${JSON.stringify(result.details ?? [])}`);
    return result;
  }
  const relevance = result.changeRelevance ?? (result.buildRelevant ? 'build' : commandBuildRelevance(command.type));
  if (relevance === 'build') {
    detachOutstandingBuild();
    stopRuntime('Circuit or source changed — rebuild required', { updateLifecycle: false });
    applyLifecycle({
      type: 'project.edit', relevance: 'build', empty: result.project.circuit.components.length === 0,
    });
  } else {
    applyLifecycle({ type: 'project.edit', relevance });
  }
  if (result.project.build.status === 'dirty') loadedSourceIdentity = null;
  const saved = persistProject();
  publish({ lastAction: result.code, importReport: null });
  renderProject();
  clearTechnicalError();
  elements.projectmessage.textContent = `${message} · revision ${editor.revision}${saved ? '' : ' · local save failed'}`;
  return result;
}

function screenPoint(point) {
  const { zoom, panX, panY } = currentProject().layout.viewport;
  return {
    x: (point.x - 0.5) * zoom + 0.5 + panX,
    y: (point.y - 0.5) * zoom + 0.5 + panY,
  };
}

function worldPoint(screenX, screenY) {
  const { zoom, panX, panY } = currentProject().layout.viewport;
  return {
    x: (screenX - 0.5 - panX) / zoom + 0.5,
    y: (screenY - 0.5 - panY) / zoom + 0.5,
  };
}

function netKind(net) {
  const pins = net.endpoints.filter((endpoint) => endpoint.component.startsWith('board-')).map((endpoint) => endpoint.pin);
  if (pins.includes('5V')) return 'power';
  if (pins.some((pin) => pin.startsWith('GND'))) return 'ground';
  if (pins.some((pin) => pin.startsWith('A'))) return 'analogue';
  return 'digital';
}

function netAnchors(net, canvasBox) {
  return Object.fromEntries(net.endpoints.map((endpoint) => {
    const anchor = elements.componentlayer.querySelector(`[data-endpoint="${endpointKey(endpoint)}"]`);
    if (!anchor) return null;
    const box = anchor.getBoundingClientRect();
    const componentBox = anchor.closest('.circuit-component').getBoundingClientRect();
    const pin = {
      x: box.left - canvasBox.left + box.width / 2,
      y: box.top - canvasBox.top + box.height / 2,
    };
    const distances = [
      { edge: 'left', value: Math.abs(pin.x - (componentBox.left - canvasBox.left)) },
      { edge: 'right', value: Math.abs(pin.x - (componentBox.right - canvasBox.left)) },
      { edge: 'top', value: Math.abs(pin.y - (componentBox.top - canvasBox.top)) },
      { edge: 'bottom', value: Math.abs(pin.y - (componentBox.bottom - canvasBox.top)) },
    ].sort((left, right) => left.value - right.value);
    const escape = { ...pin };
    if (distances[0].edge === 'left') escape.x -= 13;
    if (distances[0].edge === 'right') escape.x += 13;
    if (distances[0].edge === 'top') escape.y -= 13;
    if (distances[0].edge === 'bottom') escape.y += 13;
    return [endpointKey(endpoint), {
      pin: worldPoint(pin.x / canvasBox.width, pin.y / canvasBox.height),
      escape: worldPoint(escape.x / canvasBox.width, escape.y / canvasBox.height),
    }];
  }).filter(Boolean));
}

function screenRoutePoint(point, canvasBox) {
  const visible = screenPoint(point);
  return { x: visible.x * canvasBox.width, y: visible.y * canvasBox.height };
}

function routePathText(points, canvasBox) {
  const visible = points.map((point) => screenRoutePoint(point, canvasBox));
  return `M ${visible.map((point) => `${point.x} ${point.y}`).join(' L ')}`;
}

function clearRouteProposal() {
  elements.circuitwires.querySelector('.wire-drag-proposal-group')?.remove();
  for (const path of elements.circuitwires.querySelectorAll('.drag-source')) path.classList.remove('drag-source');
}

function drawRouteProposal(net, family, anchors) {
  clearRouteProposal();
  const canvasBox = elements.circuitcanvas.getBoundingClientRect();
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.classList.add('wire-drag-proposal-group');
  for (const branch of routeFamilyPaths(family, anchors)) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('wire-drag-proposal');
    path.dataset.net = net.id;
    path.dataset.endpoint = endpointKey(branch.endpoint);
    path.style.setProperty('--wire-color', currentProject().layout.wireStyles[net.id]?.color ?? '#39dff2');
    path.setAttribute('d', routePathText(branch.points, canvasBox));
    group.append(path);
  }
  for (const path of elements.circuitwires.querySelectorAll(`.circuit-wire[data-net="${net.id}"]`)) path.classList.add('drag-source');
  elements.circuitwires.append(group);
}

function cancelRouteDrag(message = 'Wire section move cancelled; route restored.') {
  if (!routeDrag) return false;
  const active = routeDrag;
  routeDrag = null;
  clearRouteProposal();
  try {
    if (active.target.hasPointerCapture(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
  } catch { /* capture may already be released by the browser */ }
  elements.wirestate.textContent = message;
  return true;
}

function startRouteDrag(event, { net, family, anchors, endpoint, segmentIndex, orientation, target }) {
  if (routeDrag || event.button !== 0) return;
  if (document.elementsFromPoint(event.clientX, event.clientY)
    .some((element) => element !== target && element.closest?.('.pin-anchor, .circuit-component'))) return;
  event.preventDefault(); event.stopPropagation();
  selectedNetId = net.id;
  selectedRouteSegment = { netId: net.id, endpoint, segmentIndex, orientation };
  renderInspector();
  routeDrag = {
    pointerId: event.pointerId,
    target,
    net: structuredClone(net),
    anchors: structuredClone(anchors),
    endpoint,
    segmentIndex,
    orientation,
    originalFamily: structuredClone(family),
    proposalFamily: structuredClone(family),
  };
  target.setPointerCapture(event.pointerId);
  target.dataset.pointerCaptured = String(target.hasPointerCapture(event.pointerId));
  target.classList.add('dragging');
  elements.wirestate.textContent = `${orientation === 'horizontal' ? 'Horizontal' : 'Vertical'} section selected · drag ${orientation === 'horizontal' ? 'up/down' : 'left/right'} · Escape cancels.`;
}

function moveRouteDrag(event) {
  if (!routeDrag || event.pointerId !== routeDrag.pointerId) return;
  event.preventDefault();
  const canvasBox = elements.circuitcanvas.getBoundingClientRect();
  const point = worldPoint(
    (event.clientX - canvasBox.left) / canvasBox.width,
    (event.clientY - canvasBox.top) / canvasBox.height,
  );
  const coordinate = Math.max(-1, Math.min(2, routeDrag.orientation === 'horizontal' ? point.y : point.x));
  routeDrag.proposalFamily = moveRouteSegment(
    routeDrag.originalFamily,
    routeDrag.anchors,
    routeDrag.endpoint,
    routeDrag.segmentIndex,
    coordinate,
    routeDrag.net,
  );
  drawRouteProposal(routeDrag.net, routeDrag.proposalFamily, routeDrag.anchors);
}

function finishRouteDrag(event) {
  if (!routeDrag || event.pointerId !== routeDrag.pointerId) return;
  event.preventDefault();
  const active = routeDrag;
  routeDrag = null;
  clearRouteProposal();
  try {
    if (active.target.hasPointerCapture(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
  } catch { /* capture may already be released by the browser */ }
  if (JSON.stringify(active.proposalFamily) === JSON.stringify(active.originalFamily)) {
    elements.wirestate.textContent = 'Wire section stayed on its original grid line.';
    return;
  }
  applyEditor({ type: 'wire.route.family.set', netId: active.net.id, family: active.proposalFamily }, `Moved section of ${active.net.id}`);
  elements.wirestate.textContent = `Moved one ${active.orientation} section on the world grid. Undo restores the complete route.`;
}

function createSegmentInteraction(net, family, anchors, branch, segmentIndex, canvasBox) {
  const left = branch.points[segmentIndex];
  const right = branch.points[segmentIndex + 1];
  const orientation = routeSegmentOrientation(left, right);
  if (!orientation) return [];
  const endpoint = endpointKey(branch.endpoint);
  const d = routePathText([left, right], canvasBox);
  const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  highlight.classList.add('wire-segment-highlight');
  highlight.dataset.net = net.id; highlight.dataset.endpoint = endpoint; highlight.dataset.segment = String(segmentIndex);
  highlight.style.setProperty('--wire-color', currentProject().layout.wireStyles[net.id]?.color ?? '#39dff2');
  highlight.setAttribute('d', d);
  const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  hit.classList.add('wire-segment-hit', orientation);
  if (selectedRouteSegment?.netId === net.id && selectedRouteSegment.endpoint === endpoint
      && selectedRouteSegment.segmentIndex === segmentIndex) hit.classList.add('selected');
  hit.dataset.net = net.id; hit.dataset.endpoint = endpoint; hit.dataset.segment = String(segmentIndex); hit.dataset.orientation = orientation;
  hit.style.cursor = orientation === 'horizontal' ? 'ns-resize' : 'ew-resize';
  hit.setAttribute('d', d); hit.setAttribute('stroke-width', '18');
  hit.setAttribute('tabindex', '0');
  hit.setAttribute('role', 'button');
  hit.setAttribute('aria-label', `${net.id}, branch ${endpoint}, ${orientation} section ${segmentIndex + 1}. ${orientation === 'horizontal' ? 'Up and Down' : 'Left and Right'} move it on the grid. Junction hubs remain fixed.`);
  const select = () => {
    selectedNetId = net.id;
    selectedRouteSegment = { netId: net.id, endpoint, segmentIndex, orientation };
    renderInspector();
    for (const target of elements.circuitwires.querySelectorAll('.wire-segment-hit')) target.classList.remove('selected');
    hit.classList.add('selected');
    elements.wirestate.textContent = `Selected ${orientation} section ${segmentIndex + 1} of ${endpoint}. Junction hubs remain fixed; crossings do not connect.`;
  };
  hit.addEventListener('click', select);
  hit.addEventListener('focus', select);
  hit.addEventListener('keydown', (event) => {
    const delta = orientation === 'horizontal'
      ? { ArrowUp: -0.01, ArrowDown: 0.01 }[event.key]
      : { ArrowLeft: -0.01, ArrowRight: 0.01 }[event.key];
    if (delta === undefined && !['Enter', ' '].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); select();
    if (delta === undefined) return;
    const coordinate = (orientation === 'horizontal' ? left.y : left.x) + delta;
    const moved = moveRouteSegment(family, anchors, endpoint, segmentIndex, coordinate, net);
    applyEditor({ type: 'wire.route.family.set', netId: net.id, family: moved }, `Moved section of ${net.id}`);
    requestAnimationFrame(() => elements.circuitwires.querySelector(
      `.wire-segment-hit[data-net="${net.id}"][data-endpoint="${endpoint}"][data-segment="${segmentIndex}"]`,
    )?.focus());
  });
  hit.addEventListener('pointerenter', () => { if (!routeDrag) highlight.classList.add('hovered'); });
  hit.addEventListener('pointerleave', () => { if (!routeDrag) highlight.classList.remove('hovered'); });
  hit.addEventListener('pointerdown', (event) => {
    highlight.classList.add('hovered');
    startRouteDrag(event, { net, family, anchors, endpoint, segmentIndex, orientation, target: hit });
  });
  hit.addEventListener('pointermove', moveRouteDrag);
  hit.addEventListener('pointerup', finishRouteDrag);
  hit.addEventListener('pointercancel', () => cancelRouteDrag());
  hit.addEventListener('gotpointercapture', () => { hit.dataset.pointerCaptured = 'true'; });
  hit.addEventListener('lostpointercapture', () => {
    hit.dataset.pointerCaptured = 'false';
    if (routeDrag?.target === hit) cancelRouteDrag();
  });
  return [hit, highlight];
}

function drawCircuitWires() {
  const canvasBox = elements.circuitcanvas.getBoundingClientRect();
  if (!canvasBox.width || !canvasBox.height) return;
  elements.circuitwires.setAttribute('viewBox', `0 0 ${canvasBox.width} ${canvasBox.height}`);
  const drawings = [];
  for (const net of currentProject().circuit.nets) {
    const anchors = netAnchors(net, canvasBox);
    if (Object.keys(anchors).length < 2) continue;
    const family = materializeRouteFamily(net, currentProject().layout.wireRoutes[net.id], anchors);
    const branches = routeFamilyPaths(family, anchors);
    for (const branch of branches) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.classList.add('circuit-wire');
      path.dataset.net = net.id;
      path.dataset.endpoint = endpointKey(branch.endpoint);
      path.dataset.kind = netKind(net);
      path.style.setProperty('--wire-color', currentProject().layout.wireStyles[net.id]?.color ?? '#39dff2');
      path.setAttribute('d', routePathText(branch.points, canvasBox));
      drawings.push(path);
      for (let index = 0; index < branch.points.length - 1; index += 1) {
        drawings.push(...createSegmentInteraction(net, family, anchors, branch, index, canvasBox));
      }
    }
    if (currentProject().circuit.junctions.some((junction) => junction.net === net.id)) {
      const hub = screenRoutePoint(branches[0].points.at(-1), canvasBox);
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.classList.add('junction-dot');
      dot.dataset.net = net.id;
      dot.setAttribute('cx', String(hub.x)); dot.setAttribute('cy', String(hub.y)); dot.setAttribute('r', '5');
      drawings.push(dot);
    }
  }
  elements.circuitwires.replaceChildren(...drawings);
}

function snappedComponentPoint(point) {
  const snap = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Math.round(value * 100) / 100));
  return { x: snap(point.x, 0.07, 0.93), y: snap(point.y, 0.08, 0.92) };
}

function cancelComponentDrag(message = 'Component move cancelled; original position restored.') {
  if (!componentDrag) return false;
  if (componentDrag.card.hasPointerCapture?.(componentDrag.pointerId)) componentDrag.card.releasePointerCapture(componentDrag.pointerId);
  componentDrag.card.classList.remove('dragging');
  componentDrag.card.style.left = `${screenPoint(componentDrag.original).x * 100}%`;
  componentDrag.card.style.top = `${screenPoint(componentDrag.original).y * 100}%`;
  componentDrag = null;
  drawCircuitWires();
  elements.wirestate.textContent = message;
  return true;
}

function finishComponentDrag(event) {
  if (!componentDrag || componentDrag.pointerId !== event.pointerId) return false;
  const { card, componentId, proposal, moved } = componentDrag;
  componentDrag = null; card.classList.remove('dragging');
  if (!moved) { drawCircuitWires(); return true; }
  applyEditor({ type: 'component.move', componentId, x: proposal.x, y: proposal.y }, `Moved ${componentId}`);
  return true;
}

function moveComponentDrag(event) {
  if (!componentDrag || (event.pointerId !== undefined && componentDrag.pointerId !== event.pointerId)) return false;
  const box = elements.circuitcanvas.getBoundingClientRect();
  const pointer = worldPoint((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
  const proposal = snappedComponentPoint({ x: pointer.x - componentDrag.offset.x, y: pointer.y - componentDrag.offset.y });
  componentDrag.proposal = proposal;
  componentDrag.moved ||= Math.hypot(proposal.x - componentDrag.original.x, proposal.y - componentDrag.original.y) >= 0.005;
  const visible = screenPoint(proposal);
  componentDrag.card.style.left = `${visible.x * 100}%`; componentDrag.card.style.top = `${visible.y * 100}%`;
  drawCircuitWires();
  elements.wirestate.textContent = `Moving ${componentDrag.componentId} · snapped ${proposal.x.toFixed(2)}, ${proposal.y.toFixed(2)} · Escape cancels`;
  return true;
}

function cardPointerDrag(card, componentId) {
  card.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.pin-anchor') || event.button !== 0) return;
    const box = elements.circuitcanvas.getBoundingClientRect();
    const pointer = worldPoint((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
    const original = structuredClone(currentProject().layout.positions[componentId]);
    componentDrag = {
      card, componentId, pointerId: event.pointerId, original,
      offset: { x: pointer.x - original.x, y: pointer.y - original.y },
      proposal: { x: original.x, y: original.y }, moved: false,
    };
    selectedComponentId = componentId;
    renderInspector();
    card.classList.add('dragging');
    card.setPointerCapture(event.pointerId);
  });
  card.addEventListener('pointermove', moveComponentDrag);
  card.addEventListener('pointercancel', () => cancelComponentDrag());
  card.addEventListener('pointerup', finishComponentDrag);
}

function nearestPinAnchor(card, event, fallback) {
  if (!event.detail || (!event.clientX && !event.clientY)) return fallback;
  return [...card.querySelectorAll('.pin-anchor')].map((anchor) => {
    const box = anchor.getBoundingClientRect();
    return { anchor, distance: Math.hypot(event.clientX - box.left - box.width / 2, event.clientY - box.top - box.height / 2) };
  }).sort((left, right) => left.distance - right.distance)[0]?.anchor ?? fallback;
}

function handlePin(endpoint, reconnect = false) {
  if (!pendingEndpoint) {
    if (wireMode === 'reconnect' && !endpointConnection(currentProject().circuit, endpoint)) {
      elements.wirestate.textContent = 'Reconnect starts from a connected pin.';
      return;
    }
    pendingEndpoint = endpoint;
    elements.wirestate.textContent = `${wireMode === 'reconnect' ? 'Reconnect' : 'Wire'} from ${endpointKey(endpoint)} — choose destination.`;
    renderComponents();
    return;
  }
  const from = pendingEndpoint;
  pendingEndpoint = null;
  if (endpointKey(from) === endpointKey(endpoint)) {
    elements.wirestate.textContent = 'Wire selection cancelled.';
    renderComponents();
    return;
  }
  const graph = currentProject().circuit;
  const fromNet = endpointConnection(graph, from);
  const toNet = endpointConnection(graph, endpoint);
  if (wireMode === 'reconnect' || reconnect) {
    if (!fromNet || toNet) {
      elements.wirestate.textContent = 'Reconnect requires one connected source pin and one free destination pin.';
      renderComponents();
      return;
    }
    const result = applyEditor({ type: 'wire.reconnect', netId: fromNet, from, to: endpoint }, `Reconnected ${fromNet}`);
    if (result.ok) {
      selectedRouteSegment = null;
      wireMode = 'connect';
      elements.reconnectmode.setAttribute('aria-pressed', 'false');
      elements.wirestate.textContent = `Reconnected one branch of ${fromNet}. Other endpoints were unchanged.`;
    }
    return;
  }
  if (!fromNet && !toNet) {
    const netId = nextEntityId('net', graph.nets.map((net) => net.id));
    const result = applyEditor({ type: 'wire.create', net: { id: netId, endpoints: [from, endpoint] } }, `Created ${netId}`);
    if (result.ok) elements.wirestate.textContent = `Connected ${endpointKey(from)} to ${endpointKey(endpoint)} as ${netId}.`;
  } else if (Boolean(fromNet) !== Boolean(toNet)) {
    const netId = fromNet ?? toNet;
    const branchEndpoint = fromNet ? endpoint : from;
    const junctionId = nextEntityId('junction', graph.junctions.map((junction) => junction.id));
    const result = applyEditor({ type: 'wire.branch', netId, endpoint: branchEndpoint, junctionId }, `Branched ${netId}`);
    if (result.ok) elements.wirestate.textContent = `Added ${endpointKey(branchEndpoint)} to ${netId} through explicit junction ${junctionId}.`;
  } else if (fromNet === toNet) {
    elements.wirestate.textContent = `Both pins already belong to ${fromNet}.`;
    renderComponents();
  } else {
    elements.wirestate.textContent = 'Pins belong to different nets. Delete or reconnect one endpoint first.';
    renderComponents();
  }
}

function renderComponents() {
  const cards = currentProject().circuit.components.map((component) => {
    const definition = COMPONENT_CATALOG[component.type];
    const position = screenPoint(currentProject().layout.positions[component.id]);
    const card = document.createElement('article');
    card.className = `circuit-component${selectedComponentId === component.id ? ' selected' : ''}`;
    card.dataset.componentId = component.id;
    card.dataset.componentType = component.type;
    card.tabIndex = 0;
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', `${component.label}, ${definition.displayName}`);
    card.title = `${component.label} · ${definition.displayName} · ${SUPPORT_STATUS[definition.support.status]}`;
    card.style.left = `${position.x * 100}%`; card.style.top = `${position.y * 100}%`;
    card.style.setProperty('--rotation', `${currentProject().layout.positions[component.id].rotation}deg`);
    card.style.setProperty('--part-width', `${definition.artwork.cssWidth}px`);
    card.style.setProperty('--part-height', `${definition.artwork.cssHeight}px`);
    card.append(createComponentArtwork(definition, component));
    for (const pin of definition.pins) {
      const anchor = document.createElement('button'); anchor.type = 'button'; anchor.className = 'pin-anchor';
      anchor.dataset.endpoint = `${component.id}.${pin.id}`; anchor.textContent = pin.id;
      anchor.dataset.label = `${pin.label} · ${component.id}.${pin.id}`;
      anchor.title = `${component.id}.${pin.id} · ${pin.label} · ${pin.role}`;
      anchor.setAttribute('aria-label', anchor.title);
      anchor.style.setProperty('--pin-x', String(pin.anchor.x));
      anchor.style.setProperty('--pin-y', String(pin.anchor.y));
      if (pendingEndpoint && endpointKey(pendingEndpoint) === anchor.dataset.endpoint) anchor.classList.add('pending');
      else if (pendingEndpoint) anchor.classList.add('available');
      anchor.addEventListener('click', (event) => {
        event.stopPropagation();
        const intended = nearestPinAnchor(card, event, anchor);
        const endpoint = parseEndpoint(intended.dataset.endpoint);
        handlePin(endpoint, event.altKey);
        intended.focus();
      });
      card.append(anchor);
    }
    card.addEventListener('click', () => { selectedComponentId = component.id; renderInspector(); renderComponents(); });
    cardPointerDrag(card, component.id);
    return card;
  });
  elements.componentlayer.replaceChildren(...cards);
  drawCircuitWires();
  requestAnimationFrame(() => requestAnimationFrame(drawCircuitWires));
}

function hydrateCatalogThumbnail(slot) {
  if (slot.childElementCount) return;
  const definition = slot.catalogDefinition ?? COMPONENT_CATALOG[slot.dataset.type];
  const artworkType = definition.fixtureBaseType ?? definition.type;
  const artworkDefinition = COMPONENT_CATALOG[artworkType];
  if (!artworkDefinition) return;
  const component = newComponent(artworkType, { components: [] });
  component.label = definition.displayName;
  component.properties = defaultProperties(artworkType);
  slot.append(createComponentArtwork({ ...artworkDefinition, displayName: definition.displayName }, component, { thumbnail: true }));
}

const catalogThumbnailObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) {
      hydrateCatalogThumbnail(entry.target);
      catalogThumbnailObserver.unobserve(entry.target);
    }
  }, { root: elements.cataloglist, rootMargin: '100px' })
  : null;

function activeCatalogRecords() {
  return catalogFixtureRecords ?? catalogEntries({ selectableOnly: true });
}

function matchedCatalogRecords(records = activeCatalogRecords()) {
  const favorites = new Set(catalogPreferences.favorites);
  const recentRank = new Map(catalogPreferences.recent.map((type, index) => [type, index]));
  return filterCatalog(records, {
    query: elements.catalogsearch.value,
    category: elements.catalogcategory.value,
    status: elements.catalogstatus.value,
    interface: elements.cataloginterface.value,
    supplyVoltage: elements.catalogsupplyvoltage.value,
    pinVoltage: elements.catalogpinvoltage.value,
  }).filter((definition) => !elements.catalogfavorites.checked || favorites.has(definition.type))
    .sort((a, b) => Number(favorites.has(b.type)) - Number(favorites.has(a.type))
      || (recentRank.get(a.type) ?? 99) - (recentRank.get(b.type) ?? 99)
      || a.displayName.localeCompare(b.displayName));
}

function createCatalogRow(definition, { interactive = true, thumbnail = true } = {}) {
  const favorites = new Set(catalogPreferences.favorites);
  const row = document.createElement('div'); row.className = 'catalog-item';
  row.dataset.type = definition.type; row.draggable = interactive; row.tabIndex = interactive ? 0 : -1; row.setAttribute('role', interactive ? 'button' : 'listitem');
  row.setAttribute('aria-label', `Add ${definition.displayName}, ${SUPPORT_STATUS[definition.support.status]}`);
  const thumbnailSlot = document.createElement('span'); thumbnailSlot.className = 'catalog-thumbnail-slot'; thumbnailSlot.dataset.type = definition.type;
  thumbnailSlot.catalogDefinition = definition;
  const text = document.createElement('span'); text.className = 'catalog-item-copy';
  const name = document.createElement('strong'); name.textContent = definition.displayName;
  const small = document.createElement('small'); small.textContent = `${definition.partNumber} · ${definition.catalog.interfaces.join(', ')}`;
  const badge = document.createElement('span'); badge.className = `support-badge ${definition.support.status}`; badge.textContent = SUPPORT_STATUS[definition.support.status];
  text.append(name, small, badge);
  const favorite = document.createElement('button'); favorite.type = 'button'; favorite.className = 'catalog-favourite';
  favorite.textContent = favorites.has(definition.type) ? '★' : '☆';
  favorite.setAttribute('aria-label', `${favorites.has(definition.type) ? 'Remove' : 'Add'} ${definition.displayName} ${favorites.has(definition.type) ? 'from' : 'to'} favourites`);
  favorite.disabled = !interactive;
  if (interactive) {
    favorite.addEventListener('click', (event) => { event.stopPropagation(); toggleFavorite(definition.type); });
    row.addEventListener('click', (event) => { if (!event.target.closest('.catalog-favourite')) addComponent(definition.type); });
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); addComponent(definition.type); } });
    row.addEventListener('dragstart', (event) => event.dataTransfer.setData('application/x-intent-component', definition.type));
  }
  row.append(thumbnailSlot, text, favorite);
  if (thumbnail && catalogThumbnailObserver) catalogThumbnailObserver.observe(thumbnailSlot);
  else if (thumbnail) hydrateCatalogThumbnail(thumbnailSlot);
  return row;
}

function renderCatalog() {
  const started = performance.now();
  const matches = matchedCatalogRecords();
  const maximumStart = matches.length ? Math.floor((matches.length - 1) / CATALOG_WINDOW_LIMIT) * CATALOG_WINDOW_LIMIT : 0;
  catalogWindowStart = Math.min(catalogWindowStart, maximumStart);
  const windowRecords = matches.slice(catalogWindowStart, catalogWindowStart + CATALOG_WINDOW_LIMIT);
  const interactive = catalogFixtureRecords === null;
  const buttons = windowRecords.map((definition) => createCatalogRow(definition, { interactive, thumbnail: true }));
  elements.cataloglist.replaceChildren(...buttons);
  elements.cataloglist.scrollTop = 0;
  const first = matches.length ? catalogWindowStart + 1 : 0;
  const last = Math.min(matches.length, catalogWindowStart + windowRecords.length);
  elements.catalogcount.textContent = `${matches.length} ${matches.length === 1 ? 'part' : 'parts'}`;
  elements.catalogempty.hidden = matches.length > 0;
  elements.catalogpage.textContent = matches.length ? `${first}–${last} of ${matches.length}` : 'No results';
  elements.catalogprev.disabled = catalogWindowStart === 0;
  elements.catalognext.disabled = catalogWindowStart + CATALOG_WINDOW_LIMIT >= matches.length;
  const milliseconds = performance.now() - started;
  if (catalogBenchmarkSession) catalogBenchmarkSession.renderDurations.push(milliseconds);
  return { matches: matches.length, rendered: windowRecords.length, first, last, milliseconds };
}

function createCatalogBenchmarkFixture() {
  const templates = catalogEntries({ selectableOnly: true });
  return Array.from({ length: 1_000 }, (_, index) => {
    const template = templates[index % templates.length];
    return {
      ...template,
      type: `benchmark.component-${index}-v1`,
      fixtureBaseType: template.type,
      displayName: `Benchmark component ${String(index).padStart(4, '0')}`,
      manufacturer: `Benchmark Maker-group-${index % 20}`,
      partNumber: `BENCH-${String(index).padStart(4, '0')}`,
      catalog: {
        ...template.catalog,
        aliases: [...template.catalog.aliases, `benchmark-alias-${index}`],
        functions: [...template.catalog.functions, 'benchmark fixture'],
      },
    };
  });
}

function animationFrames(count = 2) {
  return new Promise((resolve) => {
    const next = () => { if (count-- <= 0) resolve(); else requestAnimationFrame(next); };
    next();
  });
}

async function benchmarkCatalogFixture(action = 'start') {
  if (action === 'stop') {
    await animationFrames();
    catalogBenchmarkSession?.observer?.disconnect();
    const summary = catalogBenchmarkSession ? {
      records: catalogFixtureRecords?.length ?? 0,
      attached: elements.cataloglist.isConnected,
      maximumRenderMilliseconds: Math.max(0, ...catalogBenchmarkSession.renderDurations),
      longTaskObserverSupported: catalogBenchmarkSession.longTaskObserverSupported,
      longTasks: [...catalogBenchmarkSession.longTasks],
      progressiveThumbnails: elements.cataloglist.querySelectorAll('.catalog-thumbnail').length,
    } : null;
    catalogFixtureRecords = null;
    catalogBenchmarkSession = null;
    const prior = catalogFixturePriorFilters;
    catalogFixturePriorFilters = null;
    if (prior) {
      elements.catalogsearch.value = prior.query; elements.catalogcategory.value = prior.category;
      elements.cataloginterface.value = prior.interface; elements.catalogstatus.value = prior.status;
      elements.catalogsupplyvoltage.value = prior.supplyVoltage;
      elements.catalogpinvoltage.value = prior.pinVoltage;
      elements.catalogfavorites.checked = prior.favorites;
    }
    catalogWindowStart = 0; renderCatalog();
    return summary;
  }
  if (catalogFixtureRecords) throw new Error('CATALOG_BENCHMARK_ALREADY_ACTIVE');
  catalogFixturePriorFilters = {
    query: elements.catalogsearch.value, category: elements.catalogcategory.value,
    interface: elements.cataloginterface.value, status: elements.catalogstatus.value,
    supplyVoltage: elements.catalogsupplyvoltage.value, pinVoltage: elements.catalogpinvoltage.value,
    favorites: elements.catalogfavorites.checked,
  };
  catalogFixtureRecords = createCatalogBenchmarkFixture();
  elements.catalogsearch.value = 'benchmark'; elements.catalogcategory.value = 'all';
  elements.cataloginterface.value = 'all'; elements.catalogstatus.value = 'all'; elements.catalogfavorites.checked = false;
  elements.catalogsupplyvoltage.value = 'all'; elements.catalogpinvoltage.value = 'all';
  catalogWindowStart = 0;
  const longTasks = [];
  const longTaskObserverSupported = 'PerformanceObserver' in window && PerformanceObserver.supportedEntryTypes?.includes('longtask');
  const observer = longTaskObserverSupported
    ? new PerformanceObserver((list) => longTasks.push(...list.getEntries().map((entry) => entry.duration))) : null;
  observer?.observe({ type: 'longtask', buffered: false });
  catalogBenchmarkSession = { longTasks, observer, longTaskObserverSupported, renderDurations: [] };
  const started = performance.now();
  const initial = renderCatalog();
  const layout = elements.cataloglist.getBoundingClientRect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return {
    records: catalogFixtureRecords.length,
    matches: initial.matches,
    rendered: initial.rendered,
    attached: elements.cataloglist.isConnected,
    initialAttachedWorkMilliseconds: performance.now() - started,
    attachedLayout: { width: layout.width, height: layout.height },
    maximumRenderMilliseconds: Math.max(0, ...catalogBenchmarkSession.renderDurations),
    longTaskObserverSupported,
    longTasks: [...longTasks],
    progressiveThumbnails: elements.cataloglist.querySelectorAll('.catalog-thumbnail').length,
  };
}

function addComponent(type, point = null) {
  try {
    const component = newComponent(type, currentProject().circuit);
    const index = currentProject().circuit.components.length;
    const firstPosition = {
      'board.atmega328p-16mhz-v1': { x: 0.2, y: 0.34 },
      'resistor.fixed-v1': { x: 0.48, y: 0.16 },
      'led.basic-v1': { x: 0.77, y: 0.16 },
      'button.momentary-v1': { x: 0.77, y: 0.52 },
      'potentiometer.linear-v1': { x: 0.47, y: 0.76 },
    }[type];
    const sameTypeCount = currentProject().circuit.components.filter((item) => item.type === type).length;
    const position = point ?? (sameTypeCount === 0 ? firstPosition : {
      x: 0.18 + (index % 4) * 0.21, y: 0.2 + Math.floor(index / 4) * 0.28,
    });
    const result = applyEditor({ type: 'component.add', component, position }, `Added ${component.id}`);
    if (result.ok) {
      selectedComponentId = component.id;
      markRecentComponent(type);
      renderCatalog();
    }
    renderProject();
    return result;
  } catch (error) {
    elements.projectmessage.textContent = `Add rejected: ${error.message}`;
    return { ok: false, code: error.message };
  }
}

function renderPropertyEditor(component) {
  if (!component || !Object.keys(component.properties).length) { elements.propertyeditor.replaceChildren(); return; }
  const definition = COMPONENT_CATALOG[component.type];
  const rows = Object.entries(component.properties).map(([key, value]) => {
    const row = document.createElement('div'); row.className = 'property-row';
    const contract = definition.propertySchema[key] ?? {};
    const label = document.createElement('label'); label.textContent = `${key}${contract.unit ? ` (${contract.unit})` : ''}`;
    let input;
    if (key === 'color') {
      input = document.createElement('select');
      for (const color of ['red', 'yellow', 'green', 'blue']) { const option = document.createElement('option'); option.value = color; option.textContent = color; option.selected = color === value; input.append(option); }
    } else if (typeof value === 'boolean') {
      input = document.createElement('select');
      for (const optionValue of [true, false]) { const option = document.createElement('option'); option.value = String(optionValue); option.textContent = String(optionValue); option.selected = optionValue === value; input.append(option); }
    } else {
      input = document.createElement('input'); input.type = typeof value === 'number' ? 'number' : 'text'; input.value = String(value);
      if (typeof contract.minimum === 'number') input.min = String(contract.minimum);
      if (typeof contract.maximum === 'number') input.max = String(contract.maximum);
      if (typeof value === 'number') input.step = contract.kind === 'integer' ? '1' : 'any';
    }
    input.dataset.property = key;
    input.addEventListener('change', () => {
      const next = typeof value === 'number' ? Number(input.value) : typeof value === 'boolean' ? input.value === 'true' : input.value;
      applyEditor({ type: 'component.property.set', componentId: component.id, key, value: next }, `Updated ${component.id}.${key}`);
    });
    label.htmlFor = `${component.id}-${key}`; input.id = label.htmlFor; row.append(label, input); return row;
  });
  elements.propertyeditor.replaceChildren(...rows);
}

function renderWireBends(net) {
  if (!net) { elements.wirebends.textContent = 'Select a net to edit route bends.'; return; }
  const storedRoute = currentProject().layout.wireRoutes[net.id];
  if (isRouteFamily(storedRoute)) {
    const sections = storedRoute.branches.reduce((count, branch) => count + branch.points.length, 0);
    const summary = document.createElement('p');
    const hasJunction = currentProject().circuit.junctions.some((junction) => junction.net === net.id);
    summary.textContent = `${storedRoute.branches.length} pin branches · ${sections} sections. ${hasJunction ? 'The explicit junction hub stays fixed when a branch section moves.' : 'Crossings and overlaps stay electrically separate.'}`;
    const buttons = storedRoute.branches.flatMap((branch) => branch.points.map((_, segmentIndex) => {
      const endpoint = endpointKey(branch.endpoint);
      const button = document.createElement('button'); button.type = 'button';
      const selected = selectedRouteSegment?.netId === net.id
        && selectedRouteSegment.endpoint === endpoint && selectedRouteSegment.segmentIndex === segmentIndex;
      button.setAttribute('aria-pressed', String(selected));
      button.textContent = `${endpoint} · section ${segmentIndex + 1}`;
      button.addEventListener('click', () => {
        const target = elements.circuitwires.querySelector(
          `.wire-segment-hit[data-net="${net.id}"][data-endpoint="${endpoint}"][data-segment="${segmentIndex}"]`,
        );
        target?.focus();
      });
      return button;
    }));
    elements.wirebends.replaceChildren(summary, ...buttons);
    return;
  }
  const points = storedRoute ?? [];
  if (!points.length) { elements.wirebends.textContent = 'Automatic body-avoiding orthogonal route. Add a bend to override it.'; return; }
  const rows = points.map((point, index) => {
    const row = document.createElement('div'); row.className = 'bend-row';
    const x = document.createElement('input'); x.type = 'number'; x.min = '0'; x.max = '1'; x.step = '0.01'; x.value = String(point.x); x.setAttribute('aria-label', `Bend ${index + 1} x`);
    const y = document.createElement('input'); y.type = 'number'; y.min = '0'; y.max = '1'; y.step = '0.01'; y.value = String(point.y); y.setAttribute('aria-label', `Bend ${index + 1} y`);
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove bend ${index + 1}`);
    const update = () => {
      const next = points.map((item) => ({ ...item })); next[index] = { x: Number(x.value), y: Number(y.value) };
      applyEditor({ type: 'wire.route.set', netId: net.id, points: next }, `Moved bend ${index + 1}`);
    };
    x.addEventListener('change', update); y.addEventListener('change', update);
    remove.addEventListener('click', () => applyEditor({ type: 'wire.route.set', netId: net.id, points: points.filter((_, pointIndex) => pointIndex !== index) }, `Removed bend ${index + 1}`));
    row.append(x, y, remove); return row;
  });
  elements.wirebends.replaceChildren(...rows);
}

function renderInspector() {
  const component = currentProject().circuit.components.find((item) => item.id === selectedComponentId) ?? null;
  if (!component) selectedComponentId = null;
  elements.selectionname.textContent = component ? `${component.label} · ${component.id}` : 'Nothing selected';
  const definition = component ? COMPONENT_CATALOG[component.type] : null;
  elements.selectionsupport.textContent = definition
    ? `${SUPPORT_STATUS[definition.support.status]} · ${definition.partNumber} · ${definition.support.limitations.join(' ')}`
    : 'Select a part to see its exact simulation support.';
  elements.rotatecomponent.disabled = !component;
  elements.duplicatecomponent.disabled = !component || component.type.startsWith('board.');
  elements.deletecomponent.disabled = !component;
  renderPropertyEditor(component);

  const prior = selectedNetId;
  const options = [new Option('No net selected', ''), ...currentProject().circuit.nets.map((net) => new Option(`${net.id} · ${net.endpoints.length} pins`, net.id))];
  elements.selectednet.replaceChildren(...options);
  if (currentProject().circuit.nets.some((net) => net.id === prior)) elements.selectednet.value = prior;
  else selectedNetId = null;
  const net = currentProject().circuit.nets.find((item) => item.id === selectedNetId);
  if (selectedRouteSegment && (!net || selectedRouteSegment.netId !== net.id
      || !net.endpoints.some((endpoint) => endpointKey(endpoint) === selectedRouteSegment.endpoint))) {
    selectedRouteSegment = null;
  }
  elements.addbend.disabled = !net || !selectedRouteSegment;
  elements.deletebranch.disabled = !net || !selectedRouteSegment || net.endpoints.length < 3;
  elements.deletewire.disabled = !net;
  elements.reconnectmode.disabled = !net || !selectedRouteSegment;
  elements.wirecolor.disabled = !net;
  if (net) elements.wirecolor.value = currentProject().layout.wireStyles[net.id].color;
  const junction = net && currentProject().circuit.junctions.find((item) => item.net === net.id);
  elements.removejunction.disabled = !junction;
  elements.netmembers.textContent = net
    ? `${selectedRouteSegment ? `Selected branch: ${selectedRouteSegment.endpoint}\n` : ''}${net.endpoints.map(endpointKey).join('\n')}${junction ? '\n\nPolicy: the explicit junction hub stays fixed during section moves.' : '\n\nPolicy: crossings and overlaps never connect.'}`
    : 'Select a net to inspect all connected pins.';
  renderWireBends(net);
}

function renderRuntimeControls() {
  const controls = currentProject().circuit.components.flatMap((component) => {
    if (component.type === 'button.momentary-v1') {
      const row = document.createElement('div');
      const label = document.createElement('span'); label.textContent = component.label;
      const button = document.createElement('button'); button.type = 'button'; button.dataset.control = `${component.id}.pressed`;
      button.setAttribute('aria-pressed', String(component.controls.pressed)); button.textContent = component.controls.pressed ? 'Pressed' : 'Released';
      button.addEventListener('click', () => {
        const pressed = button.getAttribute('aria-pressed') !== 'true';
        const result = applyEditor({ type: 'component.control.set', componentId: component.id, key: 'pressed', value: pressed }, `${component.id} ${pressed ? 'pressed' : 'released'}`);
        if (result.ok) worker?.postMessage({ command: 'control', componentId: component.id, key: 'pressed', value: pressed });
      });
      row.append(label, button); return [row];
    }
    if (component.type === 'potentiometer.linear-v1') {
      const row = document.createElement('div');
      const label = document.createElement('label'); label.textContent = component.label;
      const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '100'; input.value = String(component.controls.position * 100); input.dataset.control = `${component.id}.position`;
      input.id = `control-${component.id}-position`; label.htmlFor = input.id;
      input.addEventListener('input', () => {
        const position = Number(input.value) / 100;
        const result = applyEditor({ type: 'component.control.set', componentId: component.id, key: 'position', value: position }, `${component.id} ${input.value}%`);
        if (result.ok) worker?.postMessage({ command: 'control', componentId: component.id, key: 'position', value: position });
      });
      row.append(label, input); return [row];
    }
    return [];
  });
  elements.componentcontrols.replaceChildren(...controls);
}

function renderProject() {
  const project = currentProject();
  const validation = validateCircuit(project.circuit);
  const endpointCount = project.circuit.nets.reduce((count, net) => count + net.endpoints.length, 0);
  elements.graphstate.textContent = `${project.circuit.components.length} components · ${project.circuit.nets.length} nets · ${endpointCount} endpoints`;
  if (validation.ok) {
    elements.circuitdiagnostics.textContent = 'Circuit accepted for the tested runtime subset.';
  } else {
    const explanations = validation.diagnostics.map((item) => explainError(item.code));
    elements.circuitdiagnostics.textContent = [...new Set(explanations.map((item) => item.action))].join('\n');
  }
  if (!project.source.files.some((file) => file.name === selectedSourceFile)) selectedSourceFile = 'main.ino';
  const selectedFile = project.source.files.find((file) => file.name === selectedSourceFile);
  elements.sourcefile.replaceChildren(...project.source.files.map((file) => new Option(file.name, file.name, false, file.name === selectedSourceFile)));
  elements.sourcefileremove.disabled = selectedSourceFile === 'main.ino';
  elements.editortitle.textContent = selectedSourceFile;
  if (elements.source.value !== selectedFile.content) elements.source.value = selectedFile.content;
  renderSourceEditor();
  const saved = savedRevision === editor.revision && savedProjectGeneration === lifecycle.projectGeneration;
  elements.projectname.value = project.metadata.name;
  elements.projectstate.textContent = `${project.metadata.name} · ${lifecycle.phase} · revision ${editor.revision} · ${saved ? 'saved locally' : 'not saved'}`;
  elements.canvastitle.textContent = `${project.metadata.name} circuit`;
  elements.undo.disabled = !editor.undoStack.length; elements.redo.disabled = !editor.redoStack.length;
  elements.zoomvalue.value = `${Math.round(project.layout.viewport.zoom * 100)}%`;
  for (const option of elements.logicchannels.options) option.selected = project.instruments.logicChannels.includes(option.value);
  if ([...elements.pinselect.options].some((option) => option.value === project.instruments.selectedPin)) elements.pinselect.value = project.instruments.selectedPin;
  elements.quickbuild.disabled = elements.build.disabled;
  publish({ project: JSON.parse(exportCanonicalProject(project)), graph: structuredClone(project.circuit), revision: editor.revision, selectedComponentId });
  renderLifecycle();
  renderComponents(); renderInspector(); renderRuntimeControls();
}

function svgNode(name, attributes = {}, text = null) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
}

function renderWaveform(logic) {
  const channels = [...elements.logicchannels.selectedOptions].map((option) => option.value);
  const model = waveformPaths(logic.transitions, channels, { edgeLimit: Number(elements.logicwindow.value) });
  const children = [];
  for (let index = 0; index <= 4; index += 1) {
    const x = model.left + model.plotWidth * index / 4;
    const cycle = Math.round(model.startCycle + (model.endCycle - model.startCycle) * index / 4);
    children.push(svgNode('line', { class: 'wave-grid', x1: x, y1: 18, x2: x, y2: 232 }));
    children.push(svgNode('text', { class: 'wave-axis', x, y: 252, 'text-anchor': 'middle' }, `${(cycle / CPU_CYCLES_PER_MILLISECOND).toFixed(2)} ms`));
  }
  for (const path of model.paths) {
    children.push(svgNode('text', { class: 'wave-label', x: 8, y: path.labelY + 6 }, path.channel));
    children.push(svgNode('path', { class: 'wave-path', d: path.d, 'data-channel': path.channel }));
  }
  const cursors = cursorCycles(model, Number(elements.logiccursora.value) / 100, Number(elements.logiccursorb.value) / 100);
  const cycleX = (cycle) => model.left + ((cycle - model.startCycle) / (model.endCycle - model.startCycle)) * model.plotWidth;
  children.push(svgNode('line', { class: 'wave-cursor', x1: cycleX(cursors.first), y1: 12, x2: cycleX(cursors.first), y2: 232 }));
  children.push(svgNode('line', { class: 'wave-cursor', x1: cycleX(cursors.second), y1: 12, x2: cycleX(cursors.second), y2: 232 }));
  elements.logicwaveform.replaceChildren(...children);
  elements.logiccursor.textContent = `A ${cursors.first.toLocaleString('en-US')} · B ${cursors.second.toLocaleString('en-US')} · Δ ${cursors.deltaCycles.toLocaleString('en-US')} cycles · ${cursors.deltaMilliseconds.toFixed(3)} ms`;
  return model;
}

function renderRuntime(message) {
  publish({ runtime: structuredClone(message) });
  elements.cycle.textContent = message.cycle.toLocaleString('en-US');
  elements.simulatedtime.textContent = `${(message.cycle / CPU_CYCLES_PER_MILLISECOND).toFixed(3)} ms`;
  elements.instructions.textContent = message.instructions.toLocaleString('en-US');
  const now = performance.now();
  if (lastThroughputSample && message.cycle >= lastThroughputSample.cycle && now > lastThroughputSample.time) {
    const cyclesPerSecond = (message.cycle - lastThroughputSample.cycle) / ((now - lastThroughputSample.time) / 1000);
    if (cyclesPerSecond > 0) elements.achievedspeed.textContent = `${(cyclesPerSecond / 1_000_000).toFixed(2)} Mcycles/s · ${(cyclesPerSecond / 16_000_000).toFixed(2)}× real time`;
  }
  lastThroughputSample = { cycle: message.cycle, time: now };
  elements.requestedspeed.textContent = message.speed === 'maximum' ? 'Maximum' : `${message.speed ?? elements.speed.value}×`;
  for (const led of message.circuit?.leds ?? []) {
    const visual = elements.componentlayer.querySelector(`[data-led-id="${led.componentId}"]`);
    if (!visual) continue;
    visual.classList.toggle('on', led.on);
    visual.setAttribute('aria-label', `${led.componentId} is ${led.on ? 'on' : 'off'} at ${(led.currentAmps * 1_000).toFixed(2)} mA`);
  }
  const transitions = message.trace.filter((entry) => entry.pin === 13).slice(-8).reverse();
  elements.trace.replaceChildren(...(transitions.length ? transitions : [{ cycle: 0, level: false }]).map((entry) => {
    const item = document.createElement('li'); item.textContent = `${String(entry.cycle).padStart(10, '0')} · ${entry.level ? 'HIGH' : 'LOW'}`; return item;
  }));
  const serial = message.instruments?.serial ?? { records: [], dropped: 0 };
  const textView = serialText(serial.records);
  elements.serialoutput.textContent = serialViewMode === 'events'
    ? (serial.records.length ? serialEventText(serial.records) : 'No serial events.')
    : (textView || 'No firmware bytes.');
  elements.serialcount.textContent = `${serial.records.length} records${serial.dropped ? ` · ${serial.dropped} dropped` : ''}`;
  const logic = message.instruments?.logic ?? { transitions: [], dropped: 0 };
  const recent = logic.transitions.slice(-Number(elements.logicwindow.value)).reverse();
  elements.logicoutput.replaceChildren(...(recent.length ? recent : [{ pin: '—', cycle: 0, level: false }]).map((entry) => {
    const item = document.createElement('li'); item.textContent = `${entry.pin} · ${String(entry.cycle).padStart(10, '0')} · ${entry.level ? 'HIGH' : 'LOW'}`; return item;
  }));
  elements.logiccount.textContent = `${logic.transitions.length} transitions${logic.dropped ? ` · ${logic.dropped} dropped` : ''}`;
  renderWaveform(logic);
  const pin = message.pins?.find((entry) => entry.pin === elements.pinselect.value) ?? null;
  elements.pinmode.textContent = pin?.mode ?? '—';
  elements.pinlevel.textContent = pin?.pin.startsWith('A') ? `${pin.voltage.toFixed(3)} V` : pin ? (pin.level ? 'HIGH' : 'LOW') : '—';
  elements.pindetail.textContent = pin?.pwm ? `${(pin.pwm.duty * 100).toFixed(1)}% · ${pin.pwm.periodCycles} cycles` : Number.isInteger(pin?.adc) ? `ADC ${pin.adc}` : '—';
  elements.pindiagnostic.textContent = pin?.diagnostic ?? '—'; elements.pincycle.textContent = message.cycle.toLocaleString('en-US');
  const stopped = message.kind === 'error' || message.kind === 'stopped-error';
  elements.workerstate.textContent = stopped ? `Stopped: ${message.message}` : message.paused ? 'Paused' : 'Running';
  if (stopped) { elements.run.disabled = true; elements.pause.disabled = true; elements.step.disabled = true; }
  else { elements.run.disabled = !message.paused; elements.pause.disabled = message.paused; elements.step.disabled = !message.paused; }
  elements.quickrun.disabled = elements.run.disabled; elements.quickpause.disabled = elements.pause.disabled; elements.quickreset.disabled = elements.reset.disabled;
}

function loadArtifact(hex, artifactIdentity) {
  stopRuntime('Loading verified artifact…');
  const loaded = applyLifecycle({ type: 'runtime.load' });
  if (!loaded.accepted) {
    showActionableError(elements.projectmessage, loaded.code, 'Runtime load rejected by lifecycle guard.');
    return;
  }
  const runtimeBinding = loaded.binding;
  const token = ++workerToken;
  worker = new Worker('./simulator.worker.js', { type: 'module' });
  worker.addEventListener('message', ({ data }) => {
    if (token !== workerToken) return;
    const acceptedMessage = applyLifecycle({ type: 'runtime.message', binding: runtimeBinding, message: data });
    if (!acceptedMessage.accepted) return;
    lastWorkerMessage = performance.now(); running = data.paused === false && data.kind !== 'error';
    if (data.kind === 'ready') setRuntimeEnabled(true);
    renderRuntime(data);
  });
  worker.addEventListener('error', (event) => {
    if (token !== workerToken) return;
    running = false; const state = { kind: 'stopped-error', message: event.message };
    applyLifecycle({ type: 'runtime.message', binding: runtimeBinding, message: state });
    publish({ runtime: state });
    showActionableError(elements.projectmessage, 'WORKER_ERROR', event.message);
    elements.workerstate.textContent = 'Stopped — rebuild the current project';
  });
  elements.artifact.textContent = artifactIdentity.slice(0, 12);
  worker.postMessage({
    command: 'init', hex, circuit: structuredClone(currentProject().circuit),
    instruments: {
      logicChannels: [...currentProject().instruments.logicChannels],
      selectedPin: currentProject().instruments.selectedPin,
      serialHistoryLimit: currentProject().instruments.serial.historyLimit,
    },
  });
}

function formatDiagnostics(result) {
  if (result?.diagnostics?.length) return result.diagnostics.map((item) => `${item.file}:${item.line}${item.column ? `:${item.column}` : ''} ${item.severity}: ${item.message}`).join('\n');
  return result?.text || result?.code || '';
}

function currentBuildBinding(binding) {
  const active = lifecycle.activeBuild;
  return active && active.projectGeneration === binding.projectGeneration
    && active.buildGeneration === binding.buildGeneration && active.requestId === binding.requestId;
}

async function pollJob(job, inputAtSubmit, binding) {
  while (activeJob === job && currentBuildBinding(binding)) {
    const response = await fetch(`/api/build/${job.jobId}`, {
      headers: { Authorization: `Bearer ${job.capability}` }, cache: 'no-store',
      signal: buildAbortController?.signal,
    });
    if (!response.ok) throw new Error('Build status could not be read');
    const status = await response.json();
    if (status.status === 'building') { await new Promise((resolve) => setTimeout(resolve, 100)); continue; }
    if (activeJob !== job || !currentBuildBinding(binding)) return;
    activeJob = null; elements.build.disabled = false; elements.quickbuild.disabled = false; elements.cancel.disabled = true;
    if (status.status === 'succeeded') {
      if (buildInputIdentity() !== inputAtSubmit) return;
      const result = status.result;
      const acceptedBuild = applyLifecycle({
        type: 'build.succeeded', binding,
        artifactIdentity: result.artifactIdentity, inputIdentity: result.inputIdentity,
        diagnostics: result.diagnostics ?? [],
      });
      if (!acceptedBuild.accepted) return;
      loadedSourceIdentity = inputAtSubmit;
      currentProject().build = { status: 'succeeded', inputIdentity: result.inputIdentity, artifactIdentity: result.artifactIdentity };
      persistProject();
      elements.buildstate.textContent = 'Build succeeded'; renderBuildDiagnostics(result, 'No compiler diagnostics.');
      publish({ buildState: 'succeeded', artifactIdentity: result.artifactIdentity, inputIdentity: result.inputIdentity, cacheHit: status.cacheHit });
      clearTechnicalError();
      loadArtifact(result.artifact.hex, result.artifactIdentity); return;
    }
    const errorCode = status.status === 'timeout' ? 'BUILD_TIMEOUT' : 'BUILD_FAILED';
    const acceptedFailure = applyLifecycle({
      type: 'build.failed', binding, diagnostics: status.result?.diagnostics ?? [{ code: errorCode }],
    });
    if (!acceptedFailure.accepted) return;
    currentProject().build = { status: 'failed', inputIdentity: status.inputIdentity ?? null, artifactIdentity: null };
    elements.buildstate.textContent = status.status === 'timeout' ? 'Build timed out' : status.status === 'cancelled' ? 'Build cancelled' : 'Build failed';
    renderBuildDiagnostics(status.result, status.error || 'Compilation failed.');
    publish({ buildState: status.status, artifactIdentity: null, inputIdentity: status.inputIdentity });
    stopRuntime('No runnable artifact', { updateLifecycle: false });
    showActionableError(elements.projectmessage, errorCode, elements.diagnostics.textContent);
    return;
  }
}

async function build() {
  const circuit = validateCircuit(currentProject().circuit);
  if (!circuit.ok) {
    elements.buildstate.textContent = 'Circuit validation failed';
    renderBuildDiagnostics({ diagnostics: circuit.diagnostics.map((item) => ({ ...item, severity: 'error', message: explainError(item.code).action, file: 'circuit', line: 1 })) }, 'Circuit validation failed.');
    showActionableError(elements.projectmessage, circuit.code ?? 'INVALID_CIRCUIT', elements.diagnostics.textContent);
    return;
  }
  detachOutstandingBuild();
  stopRuntime('Build in progress', { updateLifecycle: false });
  const started = applyLifecycle({ type: 'build.start' });
  if (!started.accepted) {
    showActionableError(elements.projectmessage, started.code, 'Build start rejected by lifecycle guard.');
    return;
  }
  const binding = started.binding;
  const inputAtSubmit = buildInputIdentity();
  currentProject().build = { status: 'dirty', inputIdentity: null, artifactIdentity: null };
  persistProject();
  elements.build.disabled = true; elements.quickbuild.disabled = true; elements.cancel.disabled = false; elements.buildstate.textContent = 'Building in isolated compiler…'; renderBuildDiagnostics(null, 'Build running…');
  publish({ buildState: 'building', artifactIdentity: null, inputIdentity: null, cacheHit: false });
  buildAbortController = new AbortController();
  try {
    const response = await fetch('/api/build', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1' },
      body: JSON.stringify({ schema: 'teach-lab-build-request@1', board: currentProject().boardProfile, files: currentProject().source.files }),
      signal: buildAbortController.signal,
    });
    const submitted = await response.json();
    if (!response.ok) throw new Error(submitted.code || 'Build request rejected');
    if (!currentBuildBinding(binding)) return;
    activeJob = submitted; await pollJob(submitted, inputAtSubmit, binding);
  } catch (error) {
    if (!currentBuildBinding(binding)) return;
    activeJob = null; elements.build.disabled = false; elements.cancel.disabled = true;
    applyLifecycle({ type: 'build.failed', binding, diagnostics: [{ code: 'BUILD_REQUEST_FAILED', message: error.message }] });
    currentProject().build = { status: 'failed', inputIdentity: null, artifactIdentity: null };
    persistProject();
    elements.buildstate.textContent = 'Build request failed'; renderBuildDiagnostics(null, error.message); publish({ buildState: 'failed' });
    showActionableError(elements.projectmessage, 'BUILD_REQUEST_FAILED', error.message);
  } finally {
    if (!activeJob) buildAbortController = null;
  }
}

function setViewport(next) {
  const current = currentProject().layout.viewport;
  applyEditor({ type: 'viewport.set', zoom: next.zoom ?? current.zoom, panX: next.panX ?? current.panX, panY: next.panY ?? current.panY }, 'Updated view');
}

function resetCatalogWindow() { catalogWindowStart = 0; renderCatalog(); }
elements.catalogsearch.addEventListener('input', resetCatalogWindow);
elements.catalogcategory.addEventListener('change', resetCatalogWindow);
elements.cataloginterface.addEventListener('change', resetCatalogWindow);
elements.catalogstatus.addEventListener('change', resetCatalogWindow);
elements.catalogsupplyvoltage.addEventListener('change', resetCatalogWindow);
elements.catalogpinvoltage.addEventListener('change', resetCatalogWindow);
elements.catalogfavorites.addEventListener('change', resetCatalogWindow);
elements.catalogclear.addEventListener('click', () => {
  elements.catalogsearch.value = '';
  elements.catalogcategory.value = 'all';
  elements.cataloginterface.value = 'all';
  elements.catalogstatus.value = 'simulated';
  elements.catalogsupplyvoltage.value = 'all';
  elements.catalogpinvoltage.value = 'all';
  elements.catalogfavorites.checked = false;
  resetCatalogWindow();
  elements.catalogsearch.focus();
});
elements.catalogprev.addEventListener('click', () => {
  catalogWindowStart = Math.max(0, catalogWindowStart - CATALOG_WINDOW_LIMIT); renderCatalog();
});
elements.catalognext.addEventListener('click', () => {
  catalogWindowStart += CATALOG_WINDOW_LIMIT; renderCatalog();
});
elements.circuitcanvas.addEventListener('dragover', (event) => event.preventDefault());
elements.circuitcanvas.addEventListener('drop', (event) => {
  event.preventDefault(); const type = event.dataTransfer.getData('application/x-intent-component'); if (!COMPONENT_CATALOG[type]?.selectable) return;
  const box = elements.circuitcanvas.getBoundingClientRect(); const view = currentProject().layout.viewport;
  const x = Math.max(0.07, Math.min(0.93, ((event.clientX - box.left) / box.width - 0.5 - view.panX) / view.zoom + 0.5));
  const y = Math.max(0.08, Math.min(0.92, ((event.clientY - box.top) / box.height - 0.5 - view.panY) / view.zoom + 0.5));
  addComponent(type, { x, y });
});
elements.source.addEventListener('input', () => {
  renderSourceEditor();
  const result = applyEditor({ type: 'source.set', name: selectedSourceFile, content: elements.source.value }, `${selectedSourceFile} changed`);
  if (result.ok) { elements.buildstate.textContent = 'Source changed — artifact stale'; elements.artifact.textContent = 'stale'; publish({ buildState: 'dirty', artifactIdentity: null }); }
});
elements.source.addEventListener('scroll', renderSourceEditor);
elements.source.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') {
    event.preventDefault();
    const start = elements.source.selectionStart; const end = elements.source.selectionEnd;
    elements.source.setRangeText('  ', start, end, 'end');
    elements.source.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (event.key === 'Enter') {
    const start = elements.source.selectionStart;
    const line = elements.source.value.slice(0, start).split('\n').at(-1) ?? '';
    const indent = /^\s*/u.exec(line)[0] + (/\{\s*$/u.test(line) ? '  ' : '');
    if (indent) {
      event.preventDefault(); elements.source.setRangeText(`\n${indent}`, start, elements.source.selectionEnd, 'end');
      elements.source.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
});
elements.sourcefile.addEventListener('change', () => { selectedSourceFile = elements.sourcefile.value; renderProject(); });
elements.sourcefileadd.addEventListener('click', () => {
  const name = elements.sourcefilename.value.trim();
  const result = applyEditor({ type: 'source.add', file: { name, content: '' } }, `Added ${name || 'source file'}`);
  if (result.ok) { selectedSourceFile = name; elements.sourcefilename.value = ''; renderProject(); }
});
elements.sourcefileremove.addEventListener('click', () => {
  if (selectedSourceFile === 'main.ino') return;
  const name = selectedSourceFile; selectedSourceFile = 'main.ino';
  applyEditor({ type: 'source.remove', name }, `Removed ${name}`);
});
elements.build.addEventListener('click', () => { void build(); });
elements.cancel.addEventListener('click', () => {
  const binding = lifecycle.activeBuild;
  if (!binding) return;
  applyLifecycle({ type: 'build.failed', binding, diagnostics: [{ code: 'BUILD_CANCELLED' }] });
  detachOutstandingBuild();
  currentProject().build = { status: 'failed', inputIdentity: null, artifactIdentity: null };
  persistProject();
  elements.buildstate.textContent = 'Build cancelled';
  elements.diagnostics.textContent = 'The cancelled build cannot update this project.';
  publish({ buildState: 'cancelled', artifactIdentity: null, inputIdentity: null, cacheHit: false });
});
elements.run.addEventListener('click', () => {
  const result = applyLifecycle({ type: 'runtime.run' });
  if (result.accepted) worker?.postMessage({ command: 'run' });
});
elements.pause.addEventListener('click', () => {
  const result = applyLifecycle({ type: 'runtime.pause' });
  if (result.accepted) worker?.postMessage({ command: 'pause' });
});
elements.step.addEventListener('click', () => worker?.postMessage({ command: 'step' }));
elements.reset.addEventListener('click', () => worker?.postMessage({ command: 'reset' }));
elements.speed.addEventListener('change', () => {
  const speed = elements.speed.value === 'maximum' ? 'maximum' : Number(elements.speed.value);
  elements.requestedspeed.textContent = speed === 'maximum' ? 'Maximum' : `${speed}×`;
  worker?.postMessage({ command: 'speed', speed });
});
elements.serialsend.addEventListener('click', () => { for (const value of serialInputBytes(elements.serialinput.value, elements.serialnewline.value)) worker?.postMessage({ command: 'uart-rx', value }); elements.serialinput.value = ''; });
elements.serialinput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); elements.serialsend.click(); } });
elements.serialclear.addEventListener('click', () => worker?.postMessage({ command: 'serial-clear' }));
elements.serialtextmode.addEventListener('click', () => {
  serialViewMode = 'text'; elements.serialtextmode.setAttribute('aria-pressed', 'true'); elements.serialeventmode.setAttribute('aria-pressed', 'false');
  if (window.__M6_STATE__.runtime) renderRuntime(window.__M6_STATE__.runtime);
});
elements.serialeventmode.addEventListener('click', () => {
  serialViewMode = 'events'; elements.serialtextmode.setAttribute('aria-pressed', 'false'); elements.serialeventmode.setAttribute('aria-pressed', 'true');
  if (window.__M6_STATE__.runtime) renderRuntime(window.__M6_STATE__.runtime);
});
elements.serialexport.addEventListener('click', () => {
  const records = window.__M6_STATE__.runtime?.instruments?.serial?.records ?? [];
  downloadText('intent-mcu-serial.txt', serialText(records));
});
elements.logicchannels.addEventListener('change', () => {
  const selected = [...elements.logicchannels.selectedOptions].map((option) => option.value);
  if (selected.length > 8) { elements.logicchannels.querySelector(`option[value="${selected.at(-1)}"]`).selected = false; return; }
  currentProject().instruments.logicChannels = selected; persistProject(); worker?.postMessage({ command: 'logic-channels', channels: selected });
});
elements.logicwindow.addEventListener('change', () => { if (window.__M6_STATE__.runtime) renderRuntime(window.__M6_STATE__.runtime); });
elements.logiccursora.addEventListener('input', () => { if (window.__M6_STATE__.runtime) renderRuntime(window.__M6_STATE__.runtime); });
elements.logiccursorb.addEventListener('input', () => { if (window.__M6_STATE__.runtime) renderRuntime(window.__M6_STATE__.runtime); });
elements.pinselect.addEventListener('change', () => { currentProject().instruments.selectedPin = elements.pinselect.value; persistProject(); if (window.__M6_STATE__.runtime) renderRuntime(window.__M6_STATE__.runtime); });

elements.rotatecomponent.addEventListener('click', () => {
  if (!selectedComponentId) return;
  const rotation = (currentProject().layout.positions[selectedComponentId].rotation + 90) % 360;
  applyEditor({ type: 'component.rotate', componentId: selectedComponentId, rotation }, `Rotated ${selectedComponentId}`);
});
elements.duplicatecomponent.addEventListener('click', () => {
  const source = currentProject().circuit.components.find((component) => component.id === selectedComponentId); if (!source) return;
  const newId = newComponent(source.type, currentProject().circuit).id;
  const result = applyEditor({ type: 'component.duplicate', sourceId: source.id, newId }, `Duplicated ${source.id}`);
  if (result.ok) { selectedComponentId = newId; renderProject(); }
});
elements.deletecomponent.addEventListener('click', () => { if (selectedComponentId) { const id = selectedComponentId; selectedComponentId = null; applyEditor({ type: 'component.remove', componentId: id }, `Deleted ${id}`); } });
elements.selectednet.addEventListener('change', () => {
  selectedNetId = elements.selectednet.value || null;
  selectedRouteSegment = null;
  renderInspector(); drawCircuitWires();
});
elements.wirecolor.addEventListener('change', () => {
  if (selectedNetId) applyEditor({ type: 'wire.style.set', netId: selectedNetId, color: elements.wirecolor.value }, `Styled ${selectedNetId}`);
});
elements.reconnectmode.setAttribute('aria-pressed', 'false');
elements.reconnectmode.addEventListener('click', () => {
  if (!selectedRouteSegment) return;
  wireMode = 'reconnect';
  pendingEndpoint = parseEndpoint(selectedRouteSegment.endpoint);
  elements.reconnectmode.setAttribute('aria-pressed', 'true');
  elements.wirestate.textContent = `Reconnect ${selectedRouteSegment.endpoint}: choose one free named pin. Other branches remain attached.`;
  renderComponents();
});
elements.addbend.addEventListener('click', () => {
  if (!selectedNetId || !selectedRouteSegment) return;
  const net = currentProject().circuit.nets.find((item) => item.id === selectedNetId);
  const canvasBox = elements.circuitcanvas.getBoundingClientRect();
  const anchors = netAnchors(net, canvasBox);
  const family = materializeRouteFamily(net, currentProject().layout.wireRoutes[net.id], anchors);
  try {
    const jogged = addRouteJog(
      family, anchors, selectedRouteSegment.endpoint, selectedRouteSegment.segmentIndex, net,
    );
    applyEditor({ type: 'wire.route.family.set', netId: net.id, family: jogged }, `Added orthogonal jog to ${net.id}`);
    elements.wirestate.textContent = 'Added one orthogonal jog. Connectivity and the fixed junction hub are unchanged; Undo removes the whole jog.';
  } catch (error) {
    showActionableError(elements.projectmessage, 'EDITOR_ROUTE', error.message);
  }
});
elements.deletebranch.addEventListener('click', () => {
  if (!selectedNetId || !selectedRouteSegment) return;
  const endpoint = parseEndpoint(selectedRouteSegment.endpoint);
  const id = selectedNetId;
  const result = applyEditor({ type: 'wire.branch.delete', netId: id, endpoint }, `Deleted branch ${selectedRouteSegment.endpoint}`);
  if (result.ok) {
    selectedRouteSegment = null;
    elements.wirestate.textContent = `Deleted one branch from ${id}. The remaining net and endpoints were preserved.`;
    renderProject();
  }
});
elements.deletewire.addEventListener('click', () => {
  if (selectedNetId) {
    const id = selectedNetId; selectedNetId = null; selectedRouteSegment = null;
    applyEditor({ type: 'wire.delete', netId: id }, `Deleted whole net ${id}`);
  }
});
elements.removejunction.addEventListener('click', () => {
  const net = currentProject().circuit.nets.find((item) => item.id === selectedNetId);
  const junction = currentProject().circuit.junctions.find((item) => item.net === selectedNetId);
  if (!net || !junction) return;
  const detachEndpoint = net.endpoints.length > 2 ? net.endpoints.at(-1) : null;
  applyEditor({ type: 'junction.remove', junctionId: junction.id, detachEndpoint }, `Removed ${junction.id}`);
});

function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
function workspacePreference(name, value = null) {
  const key = `intent-mcu.workbench.${name}.v1`;
  if (value === null) { try { return localStorage.getItem(key) === 'true'; } catch { return false; } }
  try { localStorage.setItem(key, String(Boolean(value))); } catch { /* preference is non-critical */ }
  return Boolean(value);
}
function toggleWorkspacePanel(kind) {
  const className = `${kind}-collapsed`; const button = kind === 'catalog' ? elements.togglecatalog : elements.toggleinspector;
  const collapsed = document.querySelector('.workspace').classList.toggle(className);
  button.setAttribute('aria-pressed', String(collapsed)); workspacePreference(className, collapsed);
  requestAnimationFrame(() => requestAnimationFrame(drawCircuitWires));
}
function installPanelResizer(handle, cssVariable, direction) {
  let drag = null;
  handle.addEventListener('pointerdown', (event) => {
    drag = { pointerId: event.pointerId, startX: event.clientX, width: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(cssVariable)) };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = clamp(drag.width + (event.clientX - drag.startX) * direction, 210, 430);
    document.documentElement.style.setProperty(cssVariable, `${width}px`);
    requestAnimationFrame(drawCircuitWires);
  });
  const finish = () => { drag = null; requestAnimationFrame(() => requestAnimationFrame(drawCircuitWires)); };
  handle.addEventListener('pointerup', finish); handle.addEventListener('pointercancel', finish);
  handle.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const current = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(cssVariable));
    document.documentElement.style.setProperty(cssVariable, `${clamp(current + (event.key === 'ArrowRight' ? 16 : -16) * direction, 210, 430)}px`);
    requestAnimationFrame(() => requestAnimationFrame(drawCircuitWires));
  });
}

elements.togglecatalog.addEventListener('click', () => toggleWorkspacePanel('catalog'));
elements.toggleinspector.addEventListener('click', () => toggleWorkspacePanel('inspector'));
installPanelResizer(elements.catalogresizer, '--catalog-width', 1);
installPanelResizer(elements.inspectorresizer, '--inspector-width', -1);
elements.showpinlabels.addEventListener('click', () => {
  const shown = elements.circuitcanvas.classList.toggle('show-pin-labels');
  elements.showpinlabels.setAttribute('aria-pressed', String(shown)); workspacePreference('pin-labels', shown);
});
elements.focuscanvas.addEventListener('click', () => {
  const focused = document.querySelector('.workspace').classList.toggle('canvas-focus');
  elements.focuscanvas.setAttribute('aria-pressed', String(focused));
  requestAnimationFrame(() => requestAnimationFrame(drawCircuitWires));
});
elements.fullscreencanvas.addEventListener('click', async () => {
  const board = document.querySelector('.board-card');
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await board.requestFullscreen(); }
  catch { document.querySelector('.workspace').classList.add('canvas-focus'); elements.focuscanvas.setAttribute('aria-pressed', 'true'); }
  requestAnimationFrame(() => requestAnimationFrame(drawCircuitWires));
});

elements.circuitcanvas.addEventListener('wheel', (event) => {
  if (event.target.closest('.circuit-component,.wire-segment-hit')) return;
  event.preventDefault();
  const box = elements.circuitcanvas.getBoundingClientRect(); const view = currentProject().layout.viewport;
  const screenX = (event.clientX - box.left) / box.width; const screenY = (event.clientY - box.top) / box.height;
  const world = worldPoint(screenX, screenY);
  const zoom = clamp(view.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), 0.5, 3);
  setViewport({ zoom, panX: clamp(screenX - 0.5 - (world.x - 0.5) * zoom, -1, 1), panY: clamp(screenY - 0.5 - (world.y - 0.5) * zoom, -1, 1) });
}, { passive: false });
elements.circuitcanvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || event.target.closest('.circuit-component,.wire-segment-hit')) return;
  canvasPan = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, viewport: structuredClone(currentProject().layout.viewport) };
  elements.circuitcanvas.setPointerCapture(event.pointerId); elements.circuitcanvas.classList.add('panning');
});
elements.circuitcanvas.addEventListener('pointermove', (event) => {
  if (!canvasPan || canvasPan.pointerId !== event.pointerId) return;
  elements.canvastransform.style.transform = `translate(${event.clientX - canvasPan.startX}px, ${event.clientY - canvasPan.startY}px)`;
});
function finishCanvasPan(event, cancelled = false) {
  if (!canvasPan || canvasPan.pointerId !== event.pointerId) return;
  const drag = canvasPan; canvasPan = null; elements.canvastransform.style.transform = ''; elements.circuitcanvas.classList.remove('panning');
  if (cancelled) return;
  const box = elements.circuitcanvas.getBoundingClientRect();
  setViewport({ panX: clamp(drag.viewport.panX + (event.clientX - drag.startX) / box.width, -1, 1), panY: clamp(drag.viewport.panY + (event.clientY - drag.startY) / box.height, -1, 1) });
}
elements.circuitcanvas.addEventListener('pointerup', (event) => finishCanvasPan(event));
elements.circuitcanvas.addEventListener('pointercancel', (event) => finishCanvasPan(event, true));

elements.zoomin.addEventListener('click', () => setViewport({ zoom: Math.min(3, currentProject().layout.viewport.zoom + 0.25) }));
elements.zoomout.addEventListener('click', () => setViewport({ zoom: Math.max(0.5, currentProject().layout.viewport.zoom - 0.25) }));
elements.panleft.addEventListener('click', () => setViewport({ panX: Math.max(-1, currentProject().layout.viewport.panX - 0.05) }));
elements.panright.addEventListener('click', () => setViewport({ panX: Math.min(1, currentProject().layout.viewport.panX + 0.05) }));
elements.panup.addEventListener('click', () => setViewport({ panY: Math.max(-1, currentProject().layout.viewport.panY - 0.05) }));
elements.pandown.addEventListener('click', () => setViewport({ panY: Math.min(1, currentProject().layout.viewport.panY + 0.05) }));
elements.viewreset.addEventListener('click', () => setViewport({ zoom: 1, panX: 0, panY: 0 }));
elements.fitproject.addEventListener('click', () => {
  const positions = Object.values(currentProject().layout.positions);
  if (!positions.length) { setViewport({ zoom: 1, panX: 0, panY: 0 }); return; }
  const xs = positions.map((position) => position.x); const ys = positions.map((position) => position.y);
  const center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const span = Math.max(0.32, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const zoom = Math.max(0.5, Math.min(2, 0.72 / span));
  setViewport({ zoom, panX: Math.max(-1, Math.min(1, -(center.x - 0.5) * zoom)), panY: Math.max(-1, Math.min(1, -(center.y - 0.5) * zoom)) });
});
elements.undo.addEventListener('click', () => applyEditor({ type: 'undo' }, 'Undo'));
elements.redo.addEventListener('click', () => applyEditor({ type: 'redo' }, 'Redo'));

elements.projectnew.addEventListener('click', () => {
  editor = new ProjectEditorReducer(createEmptyProject());
  installProjectGeneration({ empty: true, reason: 'project.new', runtimeMessage: 'New empty project — build required' });
  selectedSourceFile = 'main.ino';
  localStorage.removeItem(PROJECT_STORAGE_KEY); localStorage.removeItem(PROJECT_RECOVERY_KEY); renderProject(); elements.projectmessage.textContent = 'Created an actually empty project.';
});
elements.projectdemo.addEventListener('click', () => {
  const example = createExampleProject(elements.exampleselect.value);
  const projectLabel = elements.exampleselect.value === 'blink' ? 'Blink demo' : example.name;
  example.project.metadata.name = projectLabel;
  const result = editor.importProject(example.project, 'replace', { running, requireRunnable: true });
  if (!result.ok) { showActionableError(elements.projectmessage, result.code, `${example.name} example could not be loaded.`); return; }
  installProjectGeneration({ empty: false, reason: 'project.demo', runtimeMessage: `${projectLabel} loaded — build required` });
  selectedSourceFile = 'main.ino';
  persistProject(); publish({ lastAction: `${elements.exampleselect.value.toUpperCase()}_EXAMPLE_LOADED`, importReport: null }); renderProject();
  elements.projectmessage.textContent = `${example.name} loaded through the same safety checks as every project. Edit it, build it, then inspect the live instruments.`;
});
elements.projectsave.addEventListener('click', () => { persistProject('Saved and revalidated in this browser.'); renderProject(); });
elements.projectname.addEventListener('change', () => {
  const result = applyEditor({ type: 'project.rename', name: elements.projectname.value }, 'Project renamed');
  if (!result.ok) elements.projectname.value = currentProject().metadata.name;
});
elements.recoveryexport.addEventListener('click', () => downloadText('intent-mcu-recovery.json', exportCanonicalProject(currentProject()), 'application/json'));
elements.projectreload.addEventListener('click', () => {
  const recovery = localStorage.getItem(PROJECT_RECOVERY_KEY);
  const stored = recovery ?? localStorage.getItem(PROJECT_STORAGE_KEY); const parsed = stored ? parseProjectV2(stored) : { ok: false, code: 'NO_LOCAL_SAVE' };
  if (!parsed.ok) { showActionableError(elements.projectmessage, parsed.code, 'Reload validation failed.'); return; }
  parsed.project.build = { status: 'dirty', inputIdentity: null, artifactIdentity: null };
  editor = new ProjectEditorReducer(parsed.project);
  installProjectGeneration({
    empty: parsed.project.circuit.components.length === 0, reason: 'project.reload',
    runtimeMessage: 'Reloaded project requires build',
  });
  selectedSourceFile = 'main.ino';
  savedRevision = editor.revision; savedProjectGeneration = lifecycle.projectGeneration;
  renderProject(); elements.projectmessage.textContent = 'Reloaded and revalidated local project. Previous runtime output was cleared.';
});
elements.projectexport.addEventListener('click', async () => {
  const text = exportCanonicalProject(currentProject()); const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((value) => value.toString(16).padStart(2, '0')).join('');
  downloadText('intent-mcu-project.json', text, 'application/json');
  elements.projectmessage.textContent = `Exported canonical project · SHA-256 ${digest.slice(0, 16)}…`;
});

elements.walkthroughopen.addEventListener('click', () => elements.walkthrough.showModal());
elements.quickbuild.addEventListener('click', () => elements.build.click());
elements.quickrun.addEventListener('click', () => elements.run.click());
elements.quickpause.addEventListener('click', () => elements.pause.click());
elements.quickreset.addEventListener('click', () => elements.reset.click());
elements.projectimport.addEventListener('change', async () => {
  const file = elements.projectimport.files[0]; if (!file) return;
  if (file.size > 1024 * 1024) { showActionableError(elements.projectmessage, 'INPUT_LIMIT', `${file.size} bytes`); return; }
  const before = exportCanonicalProject(currentProject());
  const mode = elements.projectimportmode.value;
  const source = await file.text();
  const migrated = mode === 'migrate-v1' ? migrateProjectV1(source, localStorage) : null;
  const result = mode === 'migrate-v1'
    ? (migrated.ok ? editor.importProject(migrated.project, 'replace', { running }) : migrated)
    : editor.importText(source, mode, { running });
  elements.projectimport.value = '';
  if (!result.ok) { showActionableError(elements.projectmessage, result.code, 'Import rejected atomically; project unchanged.'); if (exportCanonicalProject(currentProject()) !== before) throw new Error('Atomic import boundary violated'); return; }
  if (mode === 'merge') {
    detachOutstandingBuild(); stopRuntime('Merged project requires build', { updateLifecycle: false });
    applyLifecycle({ type: 'project.edit', relevance: 'build', empty: currentProject().circuit.components.length === 0 });
  } else {
    installProjectGeneration({
      empty: currentProject().circuit.components.length === 0, reason: 'project.import',
      runtimeMessage: 'Imported project requires build',
    });
  }
  selectedSourceFile = 'main.ino'; persistProject(); publish({ importReport: migrated?.report ?? result.report ?? result.code }); renderProject();
  elements.projectmessage.textContent = mode === 'merge'
    ? 'Circuit merged safely. Source files and unrelated project settings were preserved.'
    : mode === 'migrate-v1'
      ? 'Older project migrated and opened safely. Review it, then build before Run.'
      : 'Project replaced safely. Previous runtime output was cleared; build before Run.';
});

elements.promptgenerate.addEventListener('click', () => { elements.promptoutput.value = generatePromptBridgeV2(currentProject()); elements.promptcopy.disabled = false; elements.promptmessage.textContent = 'Portable prompt generated locally. No network request was made.'; });
elements.promptcopy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(elements.promptoutput.value); elements.promptmessage.textContent = 'Prompt copied.'; } catch { elements.promptoutput.select(); elements.promptmessage.textContent = 'Prompt selected; copy it with your browser shortcut.'; } });
elements.promptapply.addEventListener('click', () => {
  const parsed = parsePromptBridgeV2(elements.promptresponse.value);
  if (!parsed.ok) { showActionableError(elements.promptmessage, parsed.code, 'The pasted proposal was rejected before it could change the project.'); return; }
  const candidate = projectFromCircuit(parsed.graph, currentProject().source.files[0].content);
  const beforeSource = currentProject().source.files[0].content;
  const result = editor.importProject(candidate, elements.promptmode.value, { circuitOnly: true, running, requireRunnable: true });
  if (!result.ok || currentProject().source.files[0].content !== beforeSource) {
    showActionableError(elements.promptmessage, result.code ?? 'PROMPT_SOURCE_BOUNDARY', 'The proposal was rejected before it could change source or circuit state.');
    return;
  }
  if (elements.promptmode.value === 'replace') {
    installProjectGeneration({
      empty: currentProject().circuit.components.length === 0, reason: 'prompt.replace',
      runtimeMessage: 'Accepted proposal requires build',
    });
  } else {
    detachOutstandingBuild(); stopRuntime('Accepted proposal requires build', { updateLifecycle: false });
    applyLifecycle({ type: 'project.edit', relevance: 'build', empty: currentProject().circuit.components.length === 0 });
  }
  persistProject(); publish({ importReport: result.report ?? result.code }); renderProject();
  elements.promptmessage.textContent = `Proposal ${elements.promptmode.value === 'merge' ? 'merged with' : 'replaced'} the circuit after passing the same safety checks as manual wiring.`;
});

document.addEventListener('pointerup', finishComponentDrag);
document.addEventListener('mousemove', (event) => { if (componentDrag) moveComponentDrag(event); });
document.addEventListener('mouseup', () => {
  if (componentDrag) finishComponentDrag({ pointerId: componentDrag.pointerId });
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && (cancelComponentDrag() || cancelRouteDrag())) { event.preventDefault(); return; }
  if (event.target.matches('textarea,input,select')) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); (event.shiftKey ? elements.redo : elements.undo).click(); return; }
  if (!selectedComponentId) return;
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); elements.deletecomponent.click(); return; }
  if (event.key.toLowerCase() === 'r') { event.preventDefault(); elements.rotatecomponent.click(); return; }
  const delta = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] }[event.key];
  if (delta) {
    event.preventDefault(); const position = currentProject().layout.positions[selectedComponentId];
    applyEditor({ type: 'component.move', componentId: selectedComponentId, x: Math.max(0.07, Math.min(0.93, position.x + delta[0])), y: Math.max(0.08, Math.min(0.92, position.y + delta[1])) }, `Moved ${selectedComponentId}`);
  }
});
window.addEventListener('resize', () => requestAnimationFrame(() => requestAnimationFrame(drawCircuitWires)));

setInterval(() => {
  if (running && performance.now() - lastWorkerMessage > 2_000) {
    const binding = lifecycle.runtimeBinding;
    running = false; worker?.terminate(); worker = null; setRuntimeEnabled(false);
    const state = { kind: 'stopped-error', message: 'Worker watchdog expired' };
    if (binding) applyLifecycle({ type: 'runtime.message', binding, message: state });
    publish({ runtime: state }); elements.workerstate.textContent = 'Stopped — rebuild the current project';
    showActionableError(elements.projectmessage, 'WORKER_WATCHDOG', 'No worker message arrived within 2000 ms.');
  }
}, 250);

window.__M3_BUILD__ = build;
window.__M3_COMMAND__ = (command, value) => worker?.postMessage(command === 'speed' ? { command, speed: value } : { command });
window.__M4_CONTROL__ = (componentId, key, value) => worker?.postMessage({ command: 'control', componentId, key, value });
window.__M5_COMMAND__ = (command, value) => worker?.postMessage({ command, value });
window.__M6_ADD__ = addComponent;
window.__M6_CONNECT__ = (from, to) => { pendingEndpoint = parseEndpoint(from); handlePin(parseEndpoint(to)); };
window.__M6_PROJECT__ = () => JSON.parse(exportCanonicalProject(currentProject()));
window.__M6_IMPORT__ = (source, mode = 'replace') => {
  const before = exportCanonicalProject(currentProject()); const result = editor.importText(source, mode, { running });
  if (result.ok) {
    if (mode === 'replace') {
      installProjectGeneration({
        empty: currentProject().circuit.components.length === 0, reason: 'test.import',
        runtimeMessage: 'Imported project requires build',
      });
    } else {
      detachOutstandingBuild(); stopRuntime('Imported project requires build', { updateLifecycle: false });
      applyLifecycle({ type: 'project.edit', relevance: 'build', empty: currentProject().circuit.components.length === 0 });
    }
    persistProject(); renderProject();
  }
  return { ...result, atomic: result.ok || before === exportCanonicalProject(currentProject()) };
};
window.__M7_ADD__ = addComponent;
window.__M7_PROJECT__ = window.__M6_PROJECT__;
window.__M7_CATALOG__ = () => ({
  preferences: structuredClone(catalogPreferences),
  visible: elements.cataloglist.children.length,
  windowStart: catalogWindowStart,
  fixtureActive: catalogFixtureRecords !== null,
  visibleTypes: [...elements.cataloglist.children].map((item) => item.dataset.type),
});
window.__M7_CATALOG_BENCHMARK__ = benchmarkCatalogFixture;

for (const category of CATALOG_CATEGORIES) elements.catalogcategory.append(new Option(category.label, category.id));

let stored = null; let recoveryStored = null;
try { stored = localStorage.getItem(PROJECT_STORAGE_KEY); recoveryStored = localStorage.getItem(PROJECT_RECOVERY_KEY); } catch { /* storage denial is recoverable */ }
const recoveryRestored = recoveryStored ? parseProjectV2(recoveryStored) : null;
const currentRestored = stored ? parseProjectV2(stored) : null;
const restored = recoveryRestored?.ok ? recoveryRestored : currentRestored;
if (restored?.ok) restored.project.build = { status: 'dirty', inputIdentity: null, artifactIdentity: null };
editor = new ProjectEditorReducer(restored?.ok ? restored.project : createEmptyProject());
lifecycle = createLifecycleState({ empty: currentProject().circuit.components.length === 0 });
if (restored?.ok) persistProject();
const workspace = document.querySelector('.workspace');
for (const [name, button] of [['catalog-collapsed', elements.togglecatalog], ['inspector-collapsed', elements.toggleinspector]]) {
  if (workspacePreference(name)) { workspace.classList.add(name); button.setAttribute('aria-pressed', 'true'); }
}
if (workspacePreference('pin-labels')) { elements.circuitcanvas.classList.add('show-pin-labels'); elements.showpinlabels.setAttribute('aria-pressed', 'true'); }
renderCatalog(); renderProject(); setRuntimeEnabled(false);
clearRuntimePresentation(); renderLifecycle();
elements.projectmessage.textContent = recoveryRestored?.ok
  ? 'Recovered and revalidated an interrupted local save. Rebuild before Run.'
  : restored?.ok ? 'Reopened and revalidated the local project. Rebuild before Run.'
    : stored || recoveryStored ? 'A saved value was invalid and was left untouched. The empty in-memory project can be exported before retrying.'
      : 'No example or hidden template is loaded.';
if ((stored || recoveryStored) && !restored?.ok) elements.recoveryexport.disabled = false;
