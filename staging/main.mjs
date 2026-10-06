// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { COMPONENT_CATALOG } from '../src/component-catalog.mjs';
import { validateCircuit } from '../src/circuit-engine.mjs';
import {
  ProjectEditorReducer,
  createEmptyProject,
  endpointConnection,
  exportCanonicalProject,
  generatePromptBridgeV2,
  newComponent,
  parsePromptBridgeV2,
  projectFromCircuit,
} from '../src/project-editor.mjs';
import { PROJECT_STORAGE_KEY, migrateProjectV1, parseProjectV2 } from '../src/project-v2.mjs';

const byId = (id) => document.querySelector(`#${id}`);
const elements = Object.fromEntries([
  'source', 'build', 'cancel', 'build-state', 'diagnostics', 'worker-state', 'cycle', 'instructions', 'artifact', 'trace',
  'run', 'pause', 'step', 'reset', 'speed', 'circuit-canvas', 'canvas-transform', 'component-layer', 'circuit-wires',
  'graph-state', 'wire-state', 'circuit-diagnostics', 'serial-output', 'serial-count', 'serial-input', 'serial-send',
  'serial-clear', 'logic-output', 'logic-count', 'logic-channels', 'logic-window', 'logic-cursor', 'pin-select',
  'pin-mode', 'pin-level', 'pin-detail', 'pin-diagnostic', 'pin-cycle', 'catalog-search', 'catalog-category',
  'catalog-list', 'selection-name', 'property-editor', 'rotate-component', 'duplicate-component', 'delete-component',
  'selected-net', 'net-members', 'reconnect-mode', 'add-bend', 'delete-wire', 'remove-junction', 'zoom-value',
  'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down', 'view-reset', 'project-state',
  'project-message', 'project-new', 'project-save', 'project-reload', 'project-export', 'project-import',
  'project-import-mode', 'undo', 'redo', 'prompt-generate', 'prompt-copy', 'prompt-output', 'prompt-response',
  'prompt-mode', 'prompt-apply', 'prompt-message', 'component-controls',
  'editor-title', 'source-file', 'source-file-name', 'source-file-add', 'source-file-remove',
].map((id) => [id.replaceAll('-', ''), byId(id)]));

const runtimeControls = [elements.run, elements.pause, elements.step, elements.reset, elements.speed];
const categories = Object.freeze({
  'board.atmega328p-16mhz-v1': 'controller',
  'led.basic-v1': 'output',
  'resistor.fixed-v1': 'passive',
  'button.momentary-v1': 'input',
  'potentiometer.linear-v1': 'input',
});
const glyphs = Object.freeze({
  'board.atmega328p-16mhz-v1': 'µC', 'led.basic-v1': '●', 'resistor.fixed-v1': 'Ω',
  'button.momentary-v1': '◉', 'potentiometer.linear-v1': '◒',
});

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

window.__M6_STATE__ = {
  buildState: 'dirty', artifactIdentity: null, inputIdentity: null, cacheHit: false,
  runtime: null, project: null, revision: 0, selectedComponentId: null,
  importReport: null, lastAction: 'initialized',
};
window.__M3_STATE__ = window.__M6_STATE__;
window.__M4_STATE__ = window.__M6_STATE__;
window.__M5_STATE__ = window.__M6_STATE__;
window.__M3_READY__ = true; window.__M4_READY__ = true; window.__M5_READY__ = true; window.__M6_READY__ = true;

function publish(update) { Object.assign(window.__M6_STATE__, update); }
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
function persistProject(message = null) {
  try {
    const text = exportCanonicalProject(currentProject());
    if (new TextEncoder().encode(text).length > 4 * 1024 * 1024) throw new Error('STORAGE_PROJECT_LIMIT');
    localStorage.setItem(PROJECT_STORAGE_KEY, text);
    if (message) elements.projectmessage.textContent = message;
    return true;
  } catch (error) {
    elements.projectmessage.textContent = `Local save failed (${error.name || error.message}). The in-memory project remains usable.`;
    return false;
  }
}
function sourceIdentity() { return JSON.stringify(currentProject().source.files); }

function setRuntimeEnabled(enabled) {
  for (const control of runtimeControls) control.disabled = !enabled;
  elements.serialsend.disabled = !enabled;
  elements.serialclear.disabled = !enabled;
}

function stopRuntime(message = 'No current artifact loaded') {
  workerToken += 1;
  worker?.terminate();
  worker = null;
  running = false;
  setRuntimeEnabled(false);
  elements.workerstate.textContent = message;
  publish({ runtime: null });
}

function applyEditor(command, message = command.type) {
  const result = editor.apply({ ...command, revision: editor.revision }, { running });
  if (!result.ok) {
    elements.projectmessage.textContent = `${message} rejected: ${result.code}`;
    return result;
  }
  if (result.stopped || (result.project.build.status === 'dirty' && worker)) {
    stopRuntime('Circuit or source changed — rebuild required');
  }
  if (result.project.build.status === 'dirty') loadedSourceIdentity = null;
  const saved = persistProject();
  publish({ lastAction: result.code, importReport: null });
  renderProject();
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

function netKind(net) {
  const pins = net.endpoints.filter((endpoint) => endpoint.component.startsWith('board-')).map((endpoint) => endpoint.pin);
  if (pins.includes('5V')) return 'power';
  if (pins.some((pin) => pin.startsWith('GND'))) return 'ground';
  if (pins.some((pin) => pin.startsWith('A'))) return 'analogue';
  return 'digital';
}

function drawCircuitWires() {
  const canvasBox = elements.circuitcanvas.getBoundingClientRect();
  if (!canvasBox.width || !canvasBox.height) return;
  elements.circuitwires.setAttribute('viewBox', `0 0 ${canvasBox.width} ${canvasBox.height}`);
  const drawings = [];
  for (const net of currentProject().circuit.nets) {
    const endpoints = net.endpoints.map((endpoint) => {
      const anchor = elements.componentlayer.querySelector(`[data-endpoint="${endpointKey(endpoint)}"]`);
      if (!anchor) return null;
      const box = anchor.getBoundingClientRect();
      return { endpoint, x: box.left - canvasBox.left + box.width / 2, y: box.top - canvasBox.top + box.height / 2 };
    }).filter(Boolean);
    if (endpoints.length < 2) continue;
    const route = (currentProject().layout.wireRoutes[net.id] ?? []).map((point) => {
      const visible = screenPoint(point);
      return { x: visible.x * canvasBox.width, y: visible.y * canvasBox.height };
    });
    const hub = route.at(-1) ?? {
      x: endpoints.reduce((sum, point) => sum + point.x, 0) / endpoints.length,
      y: endpoints.reduce((sum, point) => sum + point.y, 0) / endpoints.length,
    };
    for (const point of endpoints) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.classList.add('circuit-wire');
      path.dataset.net = net.id;
      path.dataset.endpoint = endpointKey(point.endpoint);
      path.dataset.kind = netKind(net);
      const routeText = route.length
        ? route.map((bend) => `L ${bend.x} ${bend.y}`).join(' ')
        : `L ${hub.x} ${point.y} L ${hub.x} ${hub.y}`;
      path.setAttribute('d', `M ${point.x} ${point.y} ${routeText}`);
      drawings.push(path);
    }
    if (currentProject().circuit.junctions.some((junction) => junction.net === net.id)) {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.classList.add('junction-dot');
      dot.dataset.net = net.id;
      dot.setAttribute('cx', String(hub.x)); dot.setAttribute('cy', String(hub.y)); dot.setAttribute('r', '5');
      drawings.push(dot);
    }
  }
  elements.circuitwires.replaceChildren(...drawings);
}

function cardPointerDrag(card, componentId) {
  let start = null;
  card.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.pin-anchor')) return;
    selectedComponentId = componentId;
    renderInspector();
    start = { x: event.clientX, y: event.clientY };
    card.setPointerCapture(event.pointerId);
  });
  card.addEventListener('pointerup', (event) => {
    if (!start) return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    start = null;
    if (distance < 3) return;
    const box = elements.circuitcanvas.getBoundingClientRect();
    const viewport = currentProject().layout.viewport;
    const screenX = (event.clientX - box.left) / box.width;
    const screenY = (event.clientY - box.top) / box.height;
    const x = Math.max(0.07, Math.min(0.93, (screenX - 0.5 - viewport.panX) / viewport.zoom + 0.5));
    const y = Math.max(0.08, Math.min(0.92, (screenY - 0.5 - viewport.panY) / viewport.zoom + 0.5));
    applyEditor({ type: 'component.move', componentId, x, y }, `Moved ${componentId}`);
  });
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
    applyEditor({ type: 'wire.reconnect', netId: fromNet, from, to: endpoint }, `Reconnected ${fromNet}`);
    wireMode = 'connect';
    elements.reconnectmode.setAttribute('aria-pressed', 'false');
    return;
  }
  if (!fromNet && !toNet) {
    const netId = nextEntityId('net', graph.nets.map((net) => net.id));
    applyEditor({ type: 'wire.create', net: { id: netId, endpoints: [from, endpoint] } }, `Created ${netId}`);
  } else if (Boolean(fromNet) !== Boolean(toNet)) {
    const netId = fromNet ?? toNet;
    const branchEndpoint = fromNet ? endpoint : from;
    const junctionId = nextEntityId('junction', graph.junctions.map((junction) => junction.id));
    applyEditor({ type: 'wire.branch', netId, endpoint: branchEndpoint, junctionId }, `Branched ${netId}`);
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
    card.className = `circuit-component ${component.type.startsWith('board.') ? 'board-component' : ''}${selectedComponentId === component.id ? ' selected' : ''}`;
    card.dataset.componentId = component.id;
    card.tabIndex = 0;
    card.style.left = `${position.x * 100}%`; card.style.top = `${position.y * 100}%`;
    card.style.setProperty('--rotation', `${currentProject().layout.positions[component.id].rotation}deg`);
    const heading = document.createElement('h3');
    if (component.type === 'led.basic-v1') {
      const bulb = document.createElement('span');
      bulb.className = `component-led ${component.properties.color}`;
      bulb.dataset.ledId = component.id; bulb.setAttribute('role', 'img'); bulb.setAttribute('aria-label', `${component.label} is off`);
      heading.append(bulb);
    }
    heading.append(document.createTextNode(`${component.label} · ${component.id}`));
    const type = document.createElement('div'); type.className = 'component-type'; type.textContent = component.type;
    const pins = document.createElement('div'); pins.className = 'component-pins';
    for (const pin of definition.pins) {
      const anchor = document.createElement('button'); anchor.type = 'button'; anchor.className = 'pin-anchor';
      anchor.dataset.endpoint = `${component.id}.${pin.id}`; anchor.textContent = pin.id;
      anchor.title = `${component.id}.${pin.id} · ${pin.role}`;
      if (pendingEndpoint && endpointKey(pendingEndpoint) === anchor.dataset.endpoint) anchor.classList.add('pending');
      anchor.addEventListener('click', (event) => { event.stopPropagation(); handlePin({ component: component.id, pin: pin.id }, event.altKey); });
      pins.append(anchor);
    }
    card.addEventListener('click', () => { selectedComponentId = component.id; renderInspector(); renderComponents(); });
    card.append(heading, type, pins);
    cardPointerDrag(card, component.id);
    return card;
  });
  elements.componentlayer.replaceChildren(...cards);
  drawCircuitWires();
  requestAnimationFrame(() => requestAnimationFrame(drawCircuitWires));
}

function renderCatalog() {
  const search = elements.catalogsearch.value.trim().toLowerCase();
  const category = elements.catalogcategory.value;
  const buttons = Object.values(COMPONENT_CATALOG)
    .filter((definition) => definition.type !== 'terminal.serial-uart-v1')
    .filter((definition) => category === 'all' || categories[definition.type] === category)
    .filter((definition) => `${definition.displayName} ${definition.type}`.toLowerCase().includes(search))
    .map((definition) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'catalog-item';
      button.dataset.type = definition.type; button.draggable = true;
      const glyph = document.createElement('span'); glyph.className = 'catalog-glyph'; glyph.textContent = glyphs[definition.type];
      const text = document.createElement('span'); text.append(document.createTextNode(definition.displayName));
      const small = document.createElement('small'); small.textContent = categories[definition.type]; text.append(small);
      button.append(glyph, text);
      button.addEventListener('click', () => addComponent(definition.type));
      button.addEventListener('dragstart', (event) => event.dataTransfer.setData('application/x-intent-component', definition.type));
      return button;
    });
  elements.cataloglist.replaceChildren(...buttons);
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
    if (result.ok) selectedComponentId = component.id;
    renderProject();
    return result;
  } catch (error) {
    elements.projectmessage.textContent = `Add rejected: ${error.message}`;
    return { ok: false, code: error.message };
  }
}

function renderPropertyEditor(component) {
  if (!component || !Object.keys(component.properties).length) { elements.propertyeditor.replaceChildren(); return; }
  const rows = Object.entries(component.properties).map(([key, value]) => {
    const row = document.createElement('div'); row.className = 'property-row';
    const label = document.createElement('label'); label.textContent = key;
    let input;
    if (key === 'color') {
      input = document.createElement('select');
      for (const color of ['red', 'yellow', 'green', 'blue']) { const option = document.createElement('option'); option.value = color; option.textContent = color; option.selected = color === value; input.append(option); }
    } else if (typeof value === 'boolean') {
      input = document.createElement('select');
      for (const optionValue of [true, false]) { const option = document.createElement('option'); option.value = String(optionValue); option.textContent = String(optionValue); option.selected = optionValue === value; input.append(option); }
    } else {
      input = document.createElement('input'); input.type = typeof value === 'number' ? 'number' : 'text'; input.value = String(value);
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

function renderInspector() {
  const component = currentProject().circuit.components.find((item) => item.id === selectedComponentId) ?? null;
  if (!component) selectedComponentId = null;
  elements.selectionname.textContent = component ? `${component.label} · ${component.id}` : 'Nothing selected';
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
  elements.addbend.disabled = !net;
  elements.deletewire.disabled = !net;
  const junction = net && currentProject().circuit.junctions.find((item) => item.net === net.id);
  elements.removejunction.disabled = !junction;
  elements.netmembers.textContent = net ? net.endpoints.map(endpointKey).join('\n') : 'Select a net to inspect all connected pins.';
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
  elements.circuitdiagnostics.textContent = validation.ok
    ? 'Circuit accepted for the tested runtime subset.'
    : validation.diagnostics.map((item) => `${item.code}${item.componentId ? ` · ${item.componentId}` : ''}${item.netId ? ` · ${item.netId}` : ''}`).join('\n');
  if (!project.source.files.some((file) => file.name === selectedSourceFile)) selectedSourceFile = 'main.ino';
  const selectedFile = project.source.files.find((file) => file.name === selectedSourceFile);
  elements.sourcefile.replaceChildren(...project.source.files.map((file) => new Option(file.name, file.name, false, file.name === selectedSourceFile)));
  elements.sourcefileremove.disabled = selectedSourceFile === 'main.ino';
  elements.editortitle.textContent = selectedSourceFile;
  if (elements.source.value !== selectedFile.content) elements.source.value = selectedFile.content;
  elements.projectstate.textContent = `${project.circuit.components.length ? 'Local project' : 'Empty project'} · revision ${editor.revision}`;
  elements.undo.disabled = !editor.undoStack.length; elements.redo.disabled = !editor.redoStack.length;
  elements.zoomvalue.value = `${Math.round(project.layout.viewport.zoom * 100)}%`;
  publish({ project: JSON.parse(exportCanonicalProject(project)), graph: structuredClone(project.circuit), revision: editor.revision, selectedComponentId });
  renderComponents(); renderInspector(); renderRuntimeControls();
}

function renderRuntime(message) {
  publish({ runtime: structuredClone(message) });
  elements.cycle.textContent = message.cycle.toLocaleString('en-US');
  elements.instructions.textContent = message.instructions.toLocaleString('en-US');
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
  elements.serialoutput.textContent = serial.records.length ? serial.records.map((entry) => `${entry.virtualMilliseconds.toFixed(3).padStart(12)} ms · ${entry.direction.toUpperCase().padEnd(11)} · ${entry.text || '—'}`).join('\n') : 'No firmware bytes.';
  elements.serialcount.textContent = `${serial.records.length} records${serial.dropped ? ` · ${serial.dropped} dropped` : ''}`;
  const logic = message.instruments?.logic ?? { transitions: [], dropped: 0 };
  const recent = logic.transitions.slice(-Number(elements.logicwindow.value)).reverse();
  elements.logicoutput.replaceChildren(...(recent.length ? recent : [{ pin: '—', cycle: 0, level: false }]).map((entry) => {
    const item = document.createElement('li'); item.textContent = `${entry.pin} · ${String(entry.cycle).padStart(10, '0')} · ${entry.level ? 'HIGH' : 'LOW'}`; return item;
  }));
  elements.logiccount.textContent = `${logic.transitions.length} transitions${logic.dropped ? ` · ${logic.dropped} dropped` : ''}`;
  const pair = logic.transitions.slice(-2);
  elements.logiccursor.textContent = pair.length === 2 ? `Cursor Δ ${(pair[1].cycle - pair[0].cycle).toLocaleString('en-US')} cycles · ${((pair[1].cycle - pair[0].cycle) / 16_000).toFixed(3)} ms` : 'Cursor Δ —';
  const pin = message.pins?.find((entry) => entry.pin === elements.pinselect.value) ?? null;
  elements.pinmode.textContent = pin?.mode ?? '—';
  elements.pinlevel.textContent = pin?.pin.startsWith('A') ? `${pin.voltage.toFixed(3)} V` : pin ? (pin.level ? 'HIGH' : 'LOW') : '—';
  elements.pindetail.textContent = pin?.pwm ? `${(pin.pwm.duty * 100).toFixed(1)}% · ${pin.pwm.periodCycles} cycles` : Number.isInteger(pin?.adc) ? `ADC ${pin.adc}` : '—';
  elements.pindiagnostic.textContent = pin?.diagnostic ?? '—'; elements.pincycle.textContent = message.cycle.toLocaleString('en-US');
  const stopped = message.kind === 'error' || message.kind === 'stopped-error';
  elements.workerstate.textContent = stopped ? `Stopped: ${message.message}` : message.paused ? 'Paused' : 'Running';
  if (stopped) { elements.run.disabled = true; elements.pause.disabled = true; elements.step.disabled = true; }
  else { elements.run.disabled = !message.paused; elements.pause.disabled = message.paused; elements.step.disabled = !message.paused; }
}

function loadArtifact(hex, artifactIdentity) {
  stopRuntime('Loading verified artifact…');
  const token = ++workerToken;
  worker = new Worker('./simulator.worker.js', { type: 'module' });
  worker.addEventListener('message', ({ data }) => {
    if (token !== workerToken) return;
    lastWorkerMessage = performance.now(); running = data.paused === false && data.kind !== 'error';
    if (data.kind === 'ready') setRuntimeEnabled(true);
    renderRuntime(data);
  });
  worker.addEventListener('error', (event) => {
    if (token !== workerToken) return;
    running = false; const state = { kind: 'stopped-error', message: event.message };
    publish({ runtime: state }); elements.workerstate.textContent = `Stopped: ${event.message}`;
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

async function pollJob(job, sourceAtSubmit) {
  while (activeJob === job) {
    const response = await fetch(`/api/build/${job.jobId}`, { headers: { Authorization: `Bearer ${job.capability}` }, cache: 'no-store' });
    if (!response.ok) throw new Error('Build status could not be read');
    const status = await response.json();
    if (status.status === 'building') { await new Promise((resolve) => setTimeout(resolve, 100)); continue; }
    activeJob = null; elements.build.disabled = false; elements.cancel.disabled = true;
    if (status.status === 'succeeded') {
      if (sourceIdentity() !== sourceAtSubmit) { elements.buildstate.textContent = 'Built result is stale; rebuild current source'; publish({ buildState: 'dirty' }); return; }
      const result = status.result;
      loadedSourceIdentity = sourceAtSubmit;
      currentProject().build = { status: 'succeeded', inputIdentity: result.inputIdentity, artifactIdentity: result.artifactIdentity };
      persistProject();
      elements.buildstate.textContent = 'Build succeeded'; elements.diagnostics.textContent = formatDiagnostics(result) || 'No compiler diagnostics.';
      publish({ buildState: 'succeeded', artifactIdentity: result.artifactIdentity, inputIdentity: result.inputIdentity, cacheHit: status.cacheHit });
      loadArtifact(result.artifact.hex, result.artifactIdentity); return;
    }
    currentProject().build = { status: 'failed', inputIdentity: status.inputIdentity ?? null, artifactIdentity: null };
    elements.buildstate.textContent = status.status === 'timeout' ? 'Build timed out' : status.status === 'cancelled' ? 'Build cancelled' : 'Build failed';
    elements.diagnostics.textContent = formatDiagnostics(status.result) || status.error || 'Compilation failed.';
    publish({ buildState: status.status, artifactIdentity: null, inputIdentity: status.inputIdentity }); stopRuntime('No runnable artifact'); return;
  }
}

async function build() {
  const circuit = validateCircuit(currentProject().circuit);
  if (!circuit.ok) {
    elements.buildstate.textContent = 'Circuit validation failed';
    elements.diagnostics.textContent = circuit.diagnostics.map((item) => item.code).join('\n');
    return;
  }
  const sourceAtSubmit = sourceIdentity();
  elements.build.disabled = true; elements.cancel.disabled = false; elements.buildstate.textContent = 'Building in isolated worker…'; elements.diagnostics.textContent = '';
  stopRuntime('Build in progress'); publish({ buildState: 'building', artifactIdentity: null, inputIdentity: null, cacheHit: false });
  try {
    const response = await fetch('/api/build', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1' },
      body: JSON.stringify({ schema: 'teach-lab-build-request@1', board: currentProject().boardProfile, files: currentProject().source.files }),
    });
    const submitted = await response.json();
    if (!response.ok) throw new Error(submitted.code || 'Build request rejected');
    activeJob = submitted; await pollJob(submitted, sourceAtSubmit);
  } catch (error) {
    activeJob = null; elements.build.disabled = false; elements.cancel.disabled = true;
    elements.buildstate.textContent = 'Build request failed'; elements.diagnostics.textContent = error.message; publish({ buildState: 'failed' });
  }
}

function setViewport(next) {
  const current = currentProject().layout.viewport;
  applyEditor({ type: 'viewport.set', zoom: next.zoom ?? current.zoom, panX: next.panX ?? current.panX, panY: next.panY ?? current.panY }, 'Updated view');
}

elements.catalogsearch.addEventListener('input', renderCatalog);
elements.catalogcategory.addEventListener('change', renderCatalog);
elements.circuitcanvas.addEventListener('dragover', (event) => event.preventDefault());
elements.circuitcanvas.addEventListener('drop', (event) => {
  event.preventDefault(); const type = event.dataTransfer.getData('application/x-intent-component'); if (!categories[type]) return;
  const box = elements.circuitcanvas.getBoundingClientRect(); const view = currentProject().layout.viewport;
  const x = Math.max(0.07, Math.min(0.93, ((event.clientX - box.left) / box.width - 0.5 - view.panX) / view.zoom + 0.5));
  const y = Math.max(0.08, Math.min(0.92, ((event.clientY - box.top) / box.height - 0.5 - view.panY) / view.zoom + 0.5));
  addComponent(type, { x, y });
});
elements.source.addEventListener('input', () => {
  const result = applyEditor({ type: 'source.set', name: selectedSourceFile, content: elements.source.value }, `${selectedSourceFile} changed`);
  if (result.ok) { elements.buildstate.textContent = 'Source changed — artifact stale'; elements.artifact.textContent = 'stale'; publish({ buildState: 'dirty', artifactIdentity: null }); }
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
elements.cancel.addEventListener('click', async () => {
  const job = activeJob; if (!job) return;
  await fetch(`/api/build/${job.jobId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${job.capability}`, 'X-Teach-Lab-Build': '1' } });
});
elements.run.addEventListener('click', () => worker?.postMessage({ command: 'run' }));
elements.pause.addEventListener('click', () => worker?.postMessage({ command: 'pause' }));
elements.step.addEventListener('click', () => worker?.postMessage({ command: 'step' }));
elements.reset.addEventListener('click', () => worker?.postMessage({ command: 'reset' }));
elements.speed.addEventListener('change', () => worker?.postMessage({ command: 'speed', speed: elements.speed.value === 'maximum' ? 'maximum' : Number(elements.speed.value) }));
elements.serialsend.addEventListener('click', () => { for (const value of new TextEncoder().encode(elements.serialinput.value)) worker?.postMessage({ command: 'uart-rx', value }); elements.serialinput.value = ''; });
elements.serialinput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); elements.serialsend.click(); } });
elements.serialclear.addEventListener('click', () => worker?.postMessage({ command: 'serial-clear' }));
elements.logicchannels.addEventListener('change', () => {
  const selected = [...elements.logicchannels.selectedOptions].map((option) => option.value);
  if (selected.length > 8) { elements.logicchannels.querySelector(`option[value="${selected.at(-1)}"]`).selected = false; return; }
  currentProject().instruments.logicChannels = selected; persistProject(); worker?.postMessage({ command: 'logic-channels', channels: selected });
});
elements.logicwindow.addEventListener('change', () => { if (window.__M6_STATE__.runtime) renderRuntime(window.__M6_STATE__.runtime); });
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
elements.selectednet.addEventListener('change', () => { selectedNetId = elements.selectednet.value || null; renderInspector(); });
elements.reconnectmode.setAttribute('aria-pressed', 'false');
elements.reconnectmode.addEventListener('click', () => {
  wireMode = wireMode === 'connect' ? 'reconnect' : 'connect'; pendingEndpoint = null;
  elements.reconnectmode.setAttribute('aria-pressed', String(wireMode === 'reconnect'));
  elements.wirestate.textContent = wireMode === 'reconnect' ? 'Reconnect mode: select a connected endpoint, then a free pin.' : 'Connect mode: select two named pins.';
  renderComponents();
});
elements.addbend.addEventListener('click', () => {
  if (!selectedNetId) return; const points = [...(currentProject().layout.wireRoutes[selectedNetId] ?? [])];
  points.push({ x: Math.min(0.8, 0.35 + points.length * 0.12), y: Math.min(0.8, 0.35 + points.length * 0.08) });
  applyEditor({ type: 'wire.route.set', netId: selectedNetId, points }, `Added bend to ${selectedNetId}`);
});
elements.deletewire.addEventListener('click', () => { if (selectedNetId) { const id = selectedNetId; selectedNetId = null; applyEditor({ type: 'wire.delete', netId: id }, `Deleted ${id}`); } });
elements.removejunction.addEventListener('click', () => {
  const net = currentProject().circuit.nets.find((item) => item.id === selectedNetId);
  const junction = currentProject().circuit.junctions.find((item) => item.net === selectedNetId);
  if (!net || !junction) return;
  const detachEndpoint = net.endpoints.length > 2 ? net.endpoints.at(-1) : null;
  applyEditor({ type: 'junction.remove', junctionId: junction.id, detachEndpoint }, `Removed ${junction.id}`);
});

elements.zoomin.addEventListener('click', () => setViewport({ zoom: Math.min(3, currentProject().layout.viewport.zoom + 0.25) }));
elements.zoomout.addEventListener('click', () => setViewport({ zoom: Math.max(0.5, currentProject().layout.viewport.zoom - 0.25) }));
elements.panleft.addEventListener('click', () => setViewport({ panX: Math.max(-1, currentProject().layout.viewport.panX - 0.05) }));
elements.panright.addEventListener('click', () => setViewport({ panX: Math.min(1, currentProject().layout.viewport.panX + 0.05) }));
elements.panup.addEventListener('click', () => setViewport({ panY: Math.max(-1, currentProject().layout.viewport.panY - 0.05) }));
elements.pandown.addEventListener('click', () => setViewport({ panY: Math.min(1, currentProject().layout.viewport.panY + 0.05) }));
elements.viewreset.addEventListener('click', () => setViewport({ zoom: 1, panX: 0, panY: 0 }));
elements.undo.addEventListener('click', () => applyEditor({ type: 'undo' }, 'Undo'));
elements.redo.addEventListener('click', () => applyEditor({ type: 'redo' }, 'Redo'));

elements.projectnew.addEventListener('click', () => {
  stopRuntime(); editor = new ProjectEditorReducer(createEmptyProject()); selectedComponentId = null; selectedNetId = null; pendingEndpoint = null;
  selectedSourceFile = 'main.ino';
  localStorage.removeItem(PROJECT_STORAGE_KEY); renderProject(); elements.projectmessage.textContent = 'Created an actually empty project.';
});
elements.projectsave.addEventListener('click', () => persistProject('Saved and revalidated in this browser.'));
elements.projectreload.addEventListener('click', () => {
  const stored = localStorage.getItem(PROJECT_STORAGE_KEY); const parsed = stored ? parseProjectV2(stored) : { ok: false, code: 'NO_LOCAL_SAVE' };
  if (!parsed.ok) { elements.projectmessage.textContent = `Reload rejected: ${parsed.code}`; return; }
  stopRuntime('Reloaded project requires build'); editor = new ProjectEditorReducer(parsed.project); selectedSourceFile = 'main.ino'; renderProject(); elements.projectmessage.textContent = 'Reloaded and revalidated local project.';
});
elements.projectexport.addEventListener('click', async () => {
  const text = exportCanonicalProject(currentProject()); const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((value) => value.toString(16).padStart(2, '0')).join('');
  const link = document.createElement('a'); link.download = 'intent-mcu-project.json'; link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); link.click(); URL.revokeObjectURL(link.href);
  elements.projectmessage.textContent = `Exported canonical project · SHA-256 ${digest.slice(0, 16)}…`;
});
elements.projectimport.addEventListener('change', async () => {
  const file = elements.projectimport.files[0]; if (!file) return;
  if (file.size > 1024 * 1024) { elements.projectmessage.textContent = 'Import rejected: INPUT_LIMIT'; return; }
  const before = exportCanonicalProject(currentProject());
  const mode = elements.projectimportmode.value;
  const source = await file.text();
  const migrated = mode === 'migrate-v1' ? migrateProjectV1(source, localStorage) : null;
  const result = mode === 'migrate-v1'
    ? (migrated.ok ? editor.importProject(migrated.project, 'replace', { running }) : migrated)
    : editor.importText(source, mode, { running });
  elements.projectimport.value = '';
  if (!result.ok) { elements.projectmessage.textContent = `Import rejected atomically: ${result.code}`; if (exportCanonicalProject(currentProject()) !== before) throw new Error('Atomic import boundary violated'); return; }
  stopRuntime('Imported project requires build'); selectedSourceFile = 'main.ino'; persistProject(); publish({ importReport: migrated?.report ?? result.report ?? result.code }); renderProject(); elements.projectmessage.textContent = `${migrated?.report?.code ?? result.code} · revision ${editor.revision}`;
});

elements.promptgenerate.addEventListener('click', () => { elements.promptoutput.value = generatePromptBridgeV2(currentProject()); elements.promptcopy.disabled = false; elements.promptmessage.textContent = 'Portable prompt generated locally. No network request was made.'; });
elements.promptcopy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(elements.promptoutput.value); elements.promptmessage.textContent = 'Prompt copied.'; } catch { elements.promptoutput.select(); elements.promptmessage.textContent = 'Prompt selected; copy it with your browser shortcut.'; } });
elements.promptapply.addEventListener('click', () => {
  const parsed = parsePromptBridgeV2(elements.promptresponse.value);
  if (!parsed.ok) { elements.promptmessage.textContent = `Proposal rejected: ${parsed.code}. Project unchanged.`; return; }
  const candidate = projectFromCircuit(parsed.graph, currentProject().source.files[0].content);
  const beforeSource = currentProject().source.files[0].content;
  const result = editor.importProject(candidate, elements.promptmode.value, { circuitOnly: true, running, requireRunnable: true });
  if (!result.ok || currentProject().source.files[0].content !== beforeSource) { elements.promptmessage.textContent = `Proposal rejected: ${result.code}. Project unchanged.`; return; }
  stopRuntime('Accepted proposal requires build'); persistProject(); publish({ importReport: result.report ?? result.code }); renderProject(); elements.promptmessage.textContent = `Proposal ${elements.promptmode.value === 'merge' ? 'merged' : 'replaced'} through the same project reducer.`;
});

document.addEventListener('keydown', (event) => {
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
    running = false; worker?.terminate(); worker = null; setRuntimeEnabled(false);
    const state = { kind: 'stopped-error', message: 'Worker watchdog expired' }; publish({ runtime: state }); elements.workerstate.textContent = 'Stopped: Worker watchdog expired';
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
  if (result.ok) { stopRuntime('Imported project requires build'); persistProject(); renderProject(); }
  return { ...result, atomic: result.ok || before === exportCanonicalProject(currentProject()) };
};

const stored = localStorage.getItem(PROJECT_STORAGE_KEY);
const restored = stored ? parseProjectV2(stored) : null;
editor = new ProjectEditorReducer(restored?.ok ? restored.project : createEmptyProject());
if (stored && !restored?.ok) localStorage.removeItem(PROJECT_STORAGE_KEY);
renderCatalog(); renderProject(); setRuntimeEnabled(false);
elements.projectmessage.textContent = restored?.ok ? 'Reopened and revalidated the local project.' : 'No example or hidden template is loaded.';
