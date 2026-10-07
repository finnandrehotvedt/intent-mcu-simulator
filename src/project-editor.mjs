// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { CIRCUIT_LIMITS, COMPONENT_CATALOG } from './component-catalog.mjs';
import {
  CIRCUIT_SCHEMA,
  CircuitError,
  createComponent,
  normalizeCircuitStructure,
  parseCircuitText,
  validateCircuit,
} from './circuit-engine.mjs';
import {
  PROJECT_SCHEMA,
  WIRE_COLORS,
  canonicalProjectJson,
  parseProjectV2,
  validateProjectV2,
} from './project-v2.mjs';
import { isRouteFamily, normalizeStoredRoute } from './route-model.mjs';
import { projectChangeRelevance } from './lifecycle.mjs';

export const PROJECT_HISTORY_LIMIT = 64;
const clone = (value) => structuredClone(value);
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;

function resultError(code, revision, details = []) {
  return { ok: false, code, revision, details };
}

function exactCommand(command, fields) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) return false;
  const actual = Object.keys(command).sort();
  const wanted = ['type', 'revision', ...fields].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function dirtyBuild(project) {
  project.build = { status: 'dirty', inputIdentity: null, artifactIdentity: null };
}

function buildInputSignature(project) {
  return JSON.stringify({
    boardProfile: project.boardProfile,
    source: project.source,
    circuit: project.circuit,
  });
}

function componentById(graph, id) {
  return graph.components.find((component) => component.id === id);
}

function netById(graph, id) {
  return graph.nets.find((net) => net.id === id);
}

function endpointNet(graph, endpoint) {
  const key = endpointKey(endpoint);
  return graph.nets.find((net) => net.endpoints.some((item) => endpointKey(item) === key)) ?? null;
}

function validPoint(point) {
  return point && Number.isFinite(point.x) && point.x >= 0 && point.x <= 1
    && Number.isFinite(point.y) && point.y >= 0 && point.y <= 1;
}

export function createEmptyProject() {
  return validateProjectV2({
    schema: PROJECT_SCHEMA,
    metadata: { name: 'Untitled project' },
    boardProfile: 'board.atmega328p-16mhz-v1',
    source: { files: [{ name: 'main.ino', content: '' }] },
    circuit: { schema: CIRCUIT_SCHEMA, components: [], nets: [], junctions: [] },
    layout: {
      positions: {}, wireRoutes: {}, wireStyles: {},
      viewport: { zoom: 1, panX: 0, panY: 0 },
    },
    instruments: {
      logicChannels: ['D13', 'D2'], selectedPin: 'D13',
      serial: { baud: 9_600, encoding: 'utf-8', historyLimit: 512 },
    },
    build: { status: 'dirty', inputIdentity: null, artifactIdentity: null },
  }).project;
}

export function allocateStableId(graph, type) {
  const prefixes = {
    'board.atmega328p-16mhz-v1': 'board',
    'led.basic-v1': 'led',
    'resistor.fixed-v1': 'resistor',
    'button.momentary-v1': 'button',
    'potentiometer.linear-v1': 'pot',
    'terminal.serial-uart-v1': 'serial',
  };
  const prefix = prefixes[type];
  if (!prefix) throw new Error('UNKNOWN_COMPONENT_TYPE');
  const used = new Set(graph.components.map((component) => component.id));
  for (let index = 1; index <= CIRCUIT_LIMITS.components + 1; index += 1) {
    const candidate = `${prefix}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('COMPONENT_LIMIT');
}

function normalizeProject(candidate) {
  const validation = validateProjectV2(candidate);
  if (!validation.ok) throw Object.assign(new Error(validation.code), { code: validation.code, details: validation.details });
  return validation.project;
}

function applyMutation(current, command) {
  const next = clone(current);
  const graph = next.circuit;
  let runtimeDirty = false;
  switch (command.type) {
    case 'project.rename': {
      if (!exactCommand(command, ['name'])) throw new Error('EDITOR_COMMAND_SHAPE');
      next.metadata = { name: command.name };
      break;
    }
    case 'component.add': {
      if (!exactCommand(command, ['component', 'position']) || !validPoint(command.position)) throw new Error('EDITOR_COMMAND_SHAPE');
      graph.components.push(clone(command.component));
      next.layout.positions[command.component.id] = {
        x: command.position.x, y: command.position.y, rotation: command.position.rotation ?? 0,
      };
      runtimeDirty = true;
      break;
    }
    case 'component.duplicate': {
      if (!exactCommand(command, ['sourceId', 'newId'])) throw new Error('EDITOR_COMMAND_SHAPE');
      const source = componentById(graph, command.sourceId);
      if (!source) throw new Error('EDITOR_COMPONENT_MISSING');
      const copy = clone(source);
      copy.id = command.newId;
      copy.label = `${source.label} copy`;
      graph.components.push(copy);
      const position = next.layout.positions[source.id];
      next.layout.positions[copy.id] = {
        x: Math.min(1, position.x + 0.04), y: Math.min(1, position.y + 0.04), rotation: position.rotation,
      };
      runtimeDirty = true;
      break;
    }
    case 'component.remove': {
      if (!exactCommand(command, ['componentId']) || !componentById(graph, command.componentId)) throw new Error('EDITOR_COMPONENT_MISSING');
      graph.components = graph.components.filter((component) => component.id !== command.componentId);
      delete next.layout.positions[command.componentId];
      const removedNets = new Set();
      graph.nets = graph.nets.flatMap((net) => {
        const endpoints = net.endpoints.filter((endpoint) => endpoint.component !== command.componentId);
        if (endpoints.length < 2) { removedNets.add(net.id); return []; }
        if (endpoints.length !== net.endpoints.length && isRouteFamily(next.layout.wireRoutes[net.id])) {
          const family = clone(next.layout.wireRoutes[net.id]);
          family.branches = family.branches.filter((branch) => branch.endpoint.component !== command.componentId);
          next.layout.wireRoutes[net.id] = normalizeStoredRoute(family, { ...net, endpoints });
        }
        return [{ ...net, endpoints }];
      });
      graph.junctions = graph.junctions.filter((junction) => !removedNets.has(junction.net));
      for (const netId of removedNets) {
        delete next.layout.wireRoutes[netId];
        delete next.layout.wireStyles[netId];
      }
      runtimeDirty = true;
      break;
    }
    case 'component.move': {
      if (!exactCommand(command, ['componentId', 'x', 'y']) || !validPoint(command)) throw new Error('EDITOR_COMMAND_SHAPE');
      if (!next.layout.positions[command.componentId]) throw new Error('EDITOR_COMPONENT_MISSING');
      next.layout.positions[command.componentId].x = command.x;
      next.layout.positions[command.componentId].y = command.y;
      break;
    }
    case 'component.rotate': {
      if (!exactCommand(command, ['componentId', 'rotation']) || ![0, 90, 180, 270].includes(command.rotation)) {
        throw new Error('EDITOR_COMMAND_SHAPE');
      }
      if (!next.layout.positions[command.componentId]) throw new Error('EDITOR_COMPONENT_MISSING');
      next.layout.positions[command.componentId].rotation = command.rotation;
      break;
    }
    case 'component.property.set': {
      if (!exactCommand(command, ['componentId', 'key', 'value'])) throw new Error('EDITOR_COMMAND_SHAPE');
      const component = componentById(graph, command.componentId);
      if (!component || !Object.hasOwn(component.properties, command.key)) throw new Error('EDITOR_PROPERTY_UNKNOWN');
      component.properties[command.key] = clone(command.value);
      runtimeDirty = true;
      break;
    }
    case 'component.control.set': {
      if (!exactCommand(command, ['componentId', 'key', 'value'])) throw new Error('EDITOR_COMMAND_SHAPE');
      const component = componentById(graph, command.componentId);
      if (!component || !Object.hasOwn(component.controls, command.key)) throw new Error('UNKNOWN_CONTROL');
      component.controls[command.key] = clone(command.value);
      break;
    }
    case 'wire.create': {
      if (!exactCommand(command, ['net'])) throw new Error('EDITOR_COMMAND_SHAPE');
      graph.nets.push(clone(command.net));
      runtimeDirty = true;
      break;
    }
    case 'wire.branch': {
      if (!exactCommand(command, ['netId', 'endpoint', 'junctionId'])) throw new Error('EDITOR_COMMAND_SHAPE');
      const net = netById(graph, command.netId);
      if (!net) throw new Error('EDITOR_NET_MISSING');
      net.endpoints.push(clone(command.endpoint));
      if (isRouteFamily(next.layout.wireRoutes[net.id])) {
        const family = clone(next.layout.wireRoutes[net.id]);
        family.branches.push({
          endpoint: clone(command.endpoint),
          points: [clone(family.branches[0].points.at(-1))],
        });
        next.layout.wireRoutes[net.id] = normalizeStoredRoute(family, net);
      }
      if (!graph.junctions.some((junction) => junction.net === net.id)) {
        graph.junctions.push({ id: command.junctionId, net: net.id });
      }
      runtimeDirty = true;
      break;
    }
    case 'wire.reconnect': {
      if (!exactCommand(command, ['netId', 'from', 'to'])) throw new Error('EDITOR_COMMAND_SHAPE');
      const net = netById(graph, command.netId);
      const index = net?.endpoints.findIndex((endpoint) => endpointKey(endpoint) === endpointKey(command.from)) ?? -1;
      if (index < 0) throw new Error('EDITOR_ENDPOINT_MISSING');
      net.endpoints[index] = clone(command.to);
      if (isRouteFamily(next.layout.wireRoutes[net.id])) {
        const family = clone(next.layout.wireRoutes[net.id]);
        const branch = family.branches.find((item) => endpointKey(item.endpoint) === endpointKey(command.from));
        if (!branch) throw new Error('EDITOR_ROUTE');
        branch.endpoint = clone(command.to);
        next.layout.wireRoutes[net.id] = normalizeStoredRoute(family, net);
      }
      runtimeDirty = true;
      break;
    }
    case 'wire.branch.delete': {
      if (!exactCommand(command, ['netId', 'endpoint'])) throw new Error('EDITOR_COMMAND_SHAPE');
      const net = netById(graph, command.netId);
      if (!net || net.endpoints.length < 3) throw new Error('EDITOR_BRANCH_REQUIRED');
      const before = net.endpoints.length;
      net.endpoints = net.endpoints.filter((endpoint) => endpointKey(endpoint) !== endpointKey(command.endpoint));
      if (before === net.endpoints.length) throw new Error('EDITOR_ENDPOINT_MISSING');
      if (isRouteFamily(next.layout.wireRoutes[net.id])) {
        const family = clone(next.layout.wireRoutes[net.id]);
        family.branches = family.branches.filter((branch) => endpointKey(branch.endpoint) !== endpointKey(command.endpoint));
        next.layout.wireRoutes[net.id] = normalizeStoredRoute(family, net);
      }
      if (net.endpoints.length === 2) graph.junctions = graph.junctions.filter((junction) => junction.net !== net.id);
      runtimeDirty = true;
      break;
    }
    case 'wire.delete': {
      if (!exactCommand(command, ['netId']) || !netById(graph, command.netId)) throw new Error('EDITOR_NET_MISSING');
      graph.nets = graph.nets.filter((net) => net.id !== command.netId);
      graph.junctions = graph.junctions.filter((junction) => junction.net !== command.netId);
      delete next.layout.wireRoutes[command.netId];
      delete next.layout.wireStyles[command.netId];
      runtimeDirty = true;
      break;
    }
    case 'wire.route.set': {
      if (!exactCommand(command, ['netId', 'points']) || !netById(graph, command.netId)
          || !Array.isArray(command.points) || command.points.length > 8 || command.points.some((point) => !validPoint(point))) {
        throw new Error('EDITOR_ROUTE');
      }
      next.layout.wireRoutes[command.netId] = clone(command.points);
      break;
    }
    case 'wire.route.family.set': {
      if (!exactCommand(command, ['netId', 'family'])) throw new Error('EDITOR_COMMAND_SHAPE');
      const net = netById(graph, command.netId);
      const family = net ? normalizeStoredRoute(command.family, net) : null;
      if (!net || !isRouteFamily(family)) throw new Error('EDITOR_ROUTE');
      next.layout.wireRoutes[command.netId] = family;
      break;
    }
    case 'wire.style.set': {
      if (!exactCommand(command, ['netId', 'color']) || !netById(graph, command.netId)
          || !WIRE_COLORS.includes(command.color)) throw new Error('EDITOR_WIRE_STYLE');
      next.layout.wireStyles[command.netId] = { color: command.color };
      break;
    }
    case 'junction.add': {
      if (!exactCommand(command, ['junction']) || !netById(graph, command.junction.net)) throw new Error('EDITOR_NET_MISSING');
      graph.junctions.push(clone(command.junction));
      runtimeDirty = true;
      break;
    }
    case 'junction.remove': {
      if (!exactCommand(command, ['junctionId', 'detachEndpoint'])) throw new Error('EDITOR_COMMAND_SHAPE');
      const junction = graph.junctions.find((item) => item.id === command.junctionId);
      if (!junction) throw new Error('EDITOR_JUNCTION_MISSING');
      const net = netById(graph, junction.net);
      if (command.detachEndpoint !== null) {
        if (net.endpoints.length < 3) throw new Error('EDITOR_JUNCTION_NOT_BRANCH');
        const before = net.endpoints.length;
        net.endpoints = net.endpoints.filter((endpoint) => endpointKey(endpoint) !== endpointKey(command.detachEndpoint));
        if (before === net.endpoints.length) throw new Error('EDITOR_ENDPOINT_MISSING');
        if (isRouteFamily(next.layout.wireRoutes[net.id])) {
          const family = clone(next.layout.wireRoutes[net.id]);
          family.branches = family.branches.filter((branch) => endpointKey(branch.endpoint) !== endpointKey(command.detachEndpoint));
          next.layout.wireRoutes[net.id] = normalizeStoredRoute(family, net);
        }
      }
      graph.junctions = graph.junctions.filter((item) => item.id !== command.junctionId);
      runtimeDirty = true;
      break;
    }
    case 'source.set': {
      if (!exactCommand(command, ['name', 'content']) || typeof command.content !== 'string') throw new Error('EDITOR_COMMAND_SHAPE');
      const file = next.source.files.find((item) => item.name === command.name);
      if (!file) throw new Error('PROJECT_SOURCE');
      file.content = command.content;
      runtimeDirty = true;
      break;
    }
    case 'source.add': {
      if (!exactCommand(command, ['file'])) throw new Error('EDITOR_COMMAND_SHAPE');
      next.source.files.push(clone(command.file));
      runtimeDirty = true;
      break;
    }
    case 'source.remove': {
      if (!exactCommand(command, ['name']) || command.name === 'main.ino') throw new Error('PROJECT_SOURCE');
      next.source.files = next.source.files.filter((file) => file.name !== command.name);
      runtimeDirty = true;
      break;
    }
    case 'viewport.set': {
      if (!exactCommand(command, ['zoom', 'panX', 'panY'])) throw new Error('EDITOR_COMMAND_SHAPE');
      next.layout.viewport = { zoom: command.zoom, panX: command.panX, panY: command.panY };
      break;
    }
    default:
      throw new Error('EDITOR_COMMAND_UNKNOWN');
  }
  next.circuit = normalizeCircuitStructure(graph, { allowDraft: true });
  if (runtimeDirty) dirtyBuild(next);
  return { project: normalizeProject(next), runtimeDirty };
}

function uniqueId(original, used) {
  if (!used.has(original)) { used.add(original); return original; }
  const root = original.slice(0, 36).replace(/-+$/u, '');
  for (let index = 1; index < 1_000; index += 1) {
    const candidate = `${root}-import-${index}`;
    if (!used.has(candidate)) { used.add(candidate); return candidate; }
  }
  throw new Error('IMPORT_ID_LIMIT');
}

export function mergeCircuitProject(baseValue, incomingValue) {
  const base = normalizeProject(baseValue);
  const incoming = normalizeProject(incomingValue);
  const merged = clone(base);
  const componentIds = new Set(merged.circuit.components.map((component) => component.id));
  const netIds = new Set(merged.circuit.nets.map((net) => net.id));
  const junctionIds = new Set(merged.circuit.junctions.map((junction) => junction.id));
  const componentMap = new Map();
  const netMap = new Map();
  const existingBoard = merged.circuit.components.find((component) => component.type === 'board.atmega328p-16mhz-v1');

  for (const component of incoming.circuit.components) {
    if (component.type === 'board.atmega328p-16mhz-v1' && existingBoard) {
      componentMap.set(component.id, existingBoard.id);
      continue;
    }
    const id = uniqueId(component.id, componentIds);
    componentMap.set(component.id, id);
    merged.circuit.components.push({ ...clone(component), id });
    const position = incoming.layout.positions[component.id];
    merged.layout.positions[id] = {
      x: Math.min(1, position.x + 0.03), y: Math.min(1, position.y + 0.03), rotation: position.rotation,
    };
  }

  const currentEndpointNets = new Map();
  for (const net of merged.circuit.nets) {
    for (const endpoint of net.endpoints) currentEndpointNets.set(endpointKey(endpoint), net.id);
  }
  for (const sourceNet of incoming.circuit.nets) {
    const endpoints = sourceNet.endpoints.map((endpoint) => ({
      component: componentMap.get(endpoint.component), pin: endpoint.pin,
    }));
    const touched = new Set(endpoints.map((endpoint) => currentEndpointNets.get(endpointKey(endpoint))).filter(Boolean));
    if (touched.size > 1) throw new Error('IMPORT_NET_CONFLICT');
    if (touched.size === 1) {
      const targetId = [...touched][0];
      const target = netById(merged.circuit, targetId);
      for (const endpoint of endpoints) {
        if (!currentEndpointNets.has(endpointKey(endpoint))) {
          target.endpoints.push(endpoint);
          currentEndpointNets.set(endpointKey(endpoint), targetId);
        }
      }
      netMap.set(sourceNet.id, targetId);
    } else {
      const id = uniqueId(sourceNet.id, netIds);
      merged.circuit.nets.push({ id, endpoints });
      for (const endpoint of endpoints) currentEndpointNets.set(endpointKey(endpoint), id);
      netMap.set(sourceNet.id, id);
    }
  }

  for (const junction of incoming.circuit.junctions) {
    const net = netMap.get(junction.net);
    if (!net || merged.circuit.junctions.some((item) => item.net === net)) continue;
    merged.circuit.junctions.push({ id: uniqueId(junction.id, junctionIds), net });
  }
  for (const [sourceNet, points] of Object.entries(incoming.layout.wireRoutes)) {
    const targetNet = netMap.get(sourceNet);
    if (!targetNet || merged.layout.wireRoutes[targetNet]) continue;
    const target = netById(merged.circuit, targetNet);
    const remapped = isRouteFamily(points) ? {
      schema: points.schema,
      branches: points.branches.map((branch) => ({
        endpoint: { component: componentMap.get(branch.endpoint.component), pin: branch.endpoint.pin },
        points: clone(branch.points),
      })),
    } : clone(points);
    const normalized = normalizeStoredRoute(remapped, target);
    if (normalized) merged.layout.wireRoutes[targetNet] = normalized;
  }
  for (const [sourceNet, style] of Object.entries(incoming.layout.wireStyles)) {
    const targetNet = netMap.get(sourceNet);
    if (targetNet && !merged.layout.wireStyles[targetNet]) merged.layout.wireStyles[targetNet] = clone(style);
  }
  merged.circuit = normalizeCircuitStructure(merged.circuit, { allowDraft: true });
  dirtyBuild(merged);
  return {
    project: normalizeProject(merged),
    report: {
      componentIds: Object.fromEntries(componentMap),
      netIds: Object.fromEntries(netMap),
      existingSourcePreserved: true,
    },
  };
}

export class ProjectEditorReducer {
  constructor(project = createEmptyProject(), historyLimit = PROJECT_HISTORY_LIMIT) {
    if (!Number.isInteger(historyLimit) || historyLimit < 1 || historyLimit > PROJECT_HISTORY_LIMIT) {
      throw new TypeError('Invalid project history limit');
    }
    this.project = normalizeProject(project);
    this.revision = 0;
    this.historyLimit = historyLimit;
    this.undoStack = [];
    this.redoStack = [];
  }

  #commit(project, code, { running = false, runtimeDirty = true, report = null } = {}) {
    this.undoStack.push(this.project);
    if (this.undoStack.length > this.historyLimit) this.undoStack.shift();
    this.redoStack = [];
    this.project = normalizeProject(project);
    this.revision += 1;
    const circuit = validateCircuit(this.project.circuit);
    return {
      ok: true, code, revision: this.revision, project: clone(this.project),
      runnable: circuit.ok, diagnostics: circuit.diagnostics, stopped: running && runtimeDirty,
      buildRelevant: runtimeDirty, report,
    };
  }

  apply(command, { running = false } = {}) {
    if (!command || !Number.isInteger(command.revision) || command.revision !== this.revision) {
      return resultError('EDITOR_STALE_REVISION', this.revision);
    }
    if (command.type === 'undo' || command.type === 'redo') return this.#travel(command, running);
    try {
      const next = applyMutation(this.project, command);
      return this.#commit(next.project, 'EDITOR_COMMITTED', { running, runtimeDirty: next.runtimeDirty });
    } catch (error) {
      if (error instanceof CircuitError || error?.code || error instanceof Error) {
        return resultError(error.code ?? error.message, this.revision, error.details ?? error.diagnostics ?? []);
      }
      throw error;
    }
  }

  importProject(candidateValue, mode, { circuitOnly = false, running = false, requireRunnable = false } = {}) {
    if (!['replace', 'merge'].includes(mode)) return resultError('IMPORT_MODE_REQUIRED', this.revision);
    const validation = validateProjectV2(candidateValue);
    if (!validation.ok) return resultError(validation.code, this.revision, validation.details);
    try {
      if (mode === 'merge') {
        const merged = mergeCircuitProject(this.project, validation.project);
        const electrical = requireRunnable ? validateCircuit(merged.project.circuit) : null;
        if (electrical && !electrical.ok) return resultError(electrical.code, this.revision, electrical.diagnostics);
        return this.#commit(merged.project, 'PROJECT_MERGED', { running, report: merged.report });
      }
      if (!circuitOnly) {
        const electrical = requireRunnable ? validateCircuit(validation.project.circuit) : null;
        if (electrical && !electrical.ok) return resultError(electrical.code, this.revision, electrical.diagnostics);
        const replacement = clone(validation.project);
        dirtyBuild(replacement);
        return this.#commit(replacement, 'PROJECT_REPLACED', { running });
      }
      const next = clone(this.project);
      next.circuit = validation.project.circuit;
      next.layout.positions = validation.project.layout.positions;
      next.layout.wireRoutes = validation.project.layout.wireRoutes;
      next.layout.wireStyles = validation.project.layout.wireStyles;
      dirtyBuild(next);
      const electrical = requireRunnable ? validateCircuit(next.circuit) : null;
      if (electrical && !electrical.ok) return resultError(electrical.code, this.revision, electrical.diagnostics);
      return this.#commit(next, 'CIRCUIT_REPLACED', { running });
    } catch (error) {
      return resultError(error.code ?? error.message ?? 'IMPORT_FAILED', this.revision);
    }
  }

  importText(source, mode, options = {}) {
    const parsed = parseProjectV2(source);
    if (!parsed.ok) return resultError(parsed.code, this.revision, parsed.details);
    return this.importProject(parsed.project, mode, options);
  }

  #travel(command, running) {
    if (!exactCommand(command, [])) return resultError('EDITOR_COMMAND_SHAPE', this.revision);
    const undo = command.type === 'undo';
    const source = undo ? this.undoStack : this.redoStack;
    const target = undo ? this.redoStack : this.undoStack;
    if (!source.length) return resultError(undo ? 'EDITOR_UNDO_EMPTY' : 'EDITOR_REDO_EMPTY', this.revision);
    const before = this.project;
    target.push(before);
    if (target.length > this.historyLimit) target.shift();
    this.project = source.pop();
    const runtimeDirty = buildInputSignature(before) !== buildInputSignature(this.project);
    if (runtimeDirty) dirtyBuild(this.project);
    this.revision += 1;
    const circuit = validateCircuit(this.project.circuit);
    return {
      ok: true, code: undo ? 'EDITOR_UNDONE' : 'EDITOR_REDONE', revision: this.revision,
      project: clone(this.project), runnable: circuit.ok, diagnostics: circuit.diagnostics,
      stopped: running && runtimeDirty, buildRelevant: runtimeDirty,
      changeRelevance: runtimeDirty ? 'build' : 'visual',
    };
  }
}

export function commandBuildRelevance(commandType) {
  return projectChangeRelevance(commandType);
}

export function projectFromCircuit(circuit, source = '') {
  const graph = normalizeCircuitStructure(circuit, { allowDraft: true });
  const project = createEmptyProject();
  project.source.files[0].content = source;
  project.circuit = graph;
  project.layout.positions = Object.fromEntries(graph.components.map((component, index) => [
    component.id,
    { x: 0.12 + (index % 4) * 0.24, y: 0.2 + Math.floor(index / 4) * 0.35, rotation: 0 },
  ]));
  return normalizeProject(project);
}

export function generatePromptBridgeV2(projectValue) {
  const project = normalizeProject(projectValue);
  const catalog = Object.values(COMPONENT_CATALOG)
    .filter((definition) => definition.type !== 'terminal.serial-uart-v1')
    .map((definition) => ({ type: definition.type, pins: definition.pins.map((pin) => pin.id) }));
  return [
    'Create one wiring proposal for Intent MCU Simulator.',
    `Return ONLY one JSON object with schema ${CIRCUIT_SCHEMA}; no prose, code fence, coordinates, styles, URLs, firmware or commands.`,
    `Limits: ${CIRCUIT_LIMITS.components} components, ${CIRCUIT_LIMITS.nets} nets, ${CIRCUIT_LIMITS.endpoints} endpoints; exactly one board.atmega328p-16mhz-v1.`,
    'Every component requires id,type,label,properties,controls. Every net requires id,endpoints[{component,pin}]. Junctions require id,net.',
    `Catalog: ${JSON.stringify(catalog)}`,
    `Current source pin context (informational only): ${JSON.stringify(project.source.files.map((file) => ({ name: file.name, bytes: new TextEncoder().encode(file.content).length })))}`,
    'Reject rather than infer polarity, ground, voltage, current limiting, pin identity, or unsupported analogue topology.',
  ].join('\n');
}

export function parsePromptBridgeV2(source) {
  if (typeof source !== 'string') return { ok: false, code: 'PROMPT_RESPONSE_SHAPE' };
  const trimmed = source.trim();
  let json = trimmed;
  if (trimmed.startsWith('```')) {
    const match = /^```json\s*\n([\s\S]*?)\n```$/u.exec(trimmed);
    if (!match) return { ok: false, code: 'PROMPT_RESPONSE_FENCE' };
    json = match[1];
  }
  return parseCircuitText(json);
}

export function exportCanonicalProject(project) {
  return canonicalProjectJson(project);
}

export function endpointConnection(graph, endpoint) {
  return endpointNet(graph, endpoint)?.id ?? null;
}

export function newComponent(type, graph, label = null) {
  const id = allocateStableId(graph, type);
  return createComponent(id, type, label ? { label } : {});
}
