// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  CIRCUIT_SCHEMA,
  CircuitError,
  createComponent,
  normalizeCircuitStructure,
  validateCircuit,
} from './circuit-engine.mjs';
import { exactKeys, parseStrictJson } from './strict-json.mjs';

export const PROJECT_SCHEMA = 'teach-lab-project@2';
export const PROJECT_STORAGE_KEY = 'teach-lab.simulator.project.v2';
export const LEGACY_STORAGE_KEY = 'teach-lab.project.v1';
export const PROJECT_EXPORT_LIMIT = 1024 * 1024;
export const WIRE_COLORS = Object.freeze([
  '#39dff2', '#f04f5f', '#a8ff3f', '#f5c451', '#f28cf3', '#f6f1e7', '#303943', '#5f8cff',
]);
const BOARD_PROFILE = 'board.atmega328p-16mhz-v1';
const FILE_NAME = /^(?:main\.ino|[A-Za-z][A-Za-z0-9_-]{0,47}\.(?:h|hpp|c|cpp))$/;

const V1_TYPES = Object.freeze({
  'controller.generic-avr-v1': 'board.atmega328p-16mhz-v1',
  'resistor.v1': 'resistor.fixed-v1',
  'led.v1': 'led.basic-v1',
  'button.momentary.v1': 'button.momentary-v1',
  'potentiometer.v1': 'potentiometer.linear-v1',
});
const V1_PIN_MAP = Object.freeze({ VCC: 'HIGH', GND: 'LOW' });

function error(code, details = []) { return { ok: false, code, details }; }
function ownObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
function clone(value) { return structuredClone(value); }

export function defaultWireColor(net) {
  const boardPins = net.endpoints
    .filter((endpoint) => endpoint.component.startsWith('board-'))
    .map((endpoint) => endpoint.pin);
  if (boardPins.includes('5V')) return '#f04f5f';
  if (boardPins.some((pin) => pin.startsWith('GND'))) return '#303943';
  if (boardPins.some((pin) => pin.startsWith('A'))) return '#a8ff3f';
  return '#39dff2';
}

function normalizeLayout(layout, graph) {
  const legacyShape = exactKeys(layout, ['positions']);
  const priorV2Shape = exactKeys(layout, ['positions', 'wireRoutes', 'viewport']);
  const currentShape = exactKeys(layout, ['positions', 'wireRoutes', 'wireStyles', 'viewport']);
  if (!legacyShape && !priorV2Shape && !currentShape) return null;
  if (!ownObject(layout.positions)) return null;
  const componentIds = graph.components.map((component) => component.id).sort();
  if (Object.keys(layout.positions).sort().join('|') !== componentIds.join('|')) return null;
  const positions = {};
  for (const id of componentIds) {
    const position = layout.positions[id];
    const oldPosition = exactKeys(position, ['x', 'y']);
    if (!oldPosition && !exactKeys(position, ['x', 'y', 'rotation'])) return null;
    const rotation = oldPosition ? 0 : position.rotation;
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)
        || position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1
        || !Number.isInteger(rotation) || ![0, 90, 180, 270].includes(rotation)) return null;
    positions[id] = { x: position.x, y: position.y, rotation };
  }
  const wireRoutes = {};
  const sourceRoutes = legacyShape ? {} : layout.wireRoutes;
  if (!ownObject(sourceRoutes)) return null;
  const netIds = new Set(graph.nets.map((net) => net.id));
  for (const [netId, route] of Object.entries(sourceRoutes)) {
    if (!netIds.has(netId) || !Array.isArray(route) || route.length > 8) return null;
    wireRoutes[netId] = route.map((point) => {
      if (!exactKeys(point, ['x', 'y']) || !Number.isFinite(point.x) || !Number.isFinite(point.y)
          || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) throw new TypeError('PROJECT_LAYOUT');
      return { x: point.x, y: point.y };
    });
  }
  const wireStyles = {};
  const sourceStyles = currentShape ? layout.wireStyles : {};
  if (!ownObject(sourceStyles)) return null;
  for (const netId of Object.keys(sourceStyles)) if (!netIds.has(netId)) return null;
  for (const net of graph.nets) {
    const style = sourceStyles[net.id] ?? { color: defaultWireColor(net) };
    if (!exactKeys(style, ['color']) || !WIRE_COLORS.includes(style.color)) return null;
    wireStyles[net.id] = { color: style.color };
  }
  const viewport = legacyShape ? { zoom: 1, panX: 0, panY: 0 } : layout.viewport;
  if (!exactKeys(viewport, ['zoom', 'panX', 'panY'])
      || !Number.isFinite(viewport.zoom) || viewport.zoom < 0.5 || viewport.zoom > 3
      || !Number.isFinite(viewport.panX) || viewport.panX < -1 || viewport.panX > 1
      || !Number.isFinite(viewport.panY) || viewport.panY < -1 || viewport.panY > 1) return null;
  return { positions, wireRoutes, wireStyles, viewport: clone(viewport) };
}

function validateSource(source) {
  if (!exactKeys(source, ['files']) || !Array.isArray(source.files)
      || source.files.length < 1 || source.files.length > 8) return null;
  const seen = new Set();
  let bytes = 0;
  const files = [];
  for (const file of source.files) {
    if (!exactKeys(file, ['name', 'content']) || typeof file.name !== 'string'
        || !FILE_NAME.test(file.name) || typeof file.content !== 'string'
        || seen.has(file.name.toLowerCase())) return null;
    const content = file.content.normalize('NFC').replace(/\r\n?/g, '\n');
    bytes += new TextEncoder().encode(content).length;
    seen.add(file.name.toLowerCase());
    files.push({ name: file.name, content });
  }
  if (!seen.has('main.ino') || bytes > 128 * 1024) return null;
  files.sort((a, b) => a.name === 'main.ino' ? -1 : b.name === 'main.ino' ? 1 : a.name.localeCompare(b.name));
  return { files };
}

export function validateProjectV2(value) {
  if (!exactKeys(value, ['schema', 'boardProfile', 'source', 'circuit', 'layout', 'instruments', 'build'])) {
    return error('PROJECT_SHAPE');
  }
  if (value.schema !== PROJECT_SCHEMA || value.boardProfile !== BOARD_PROFILE) return error('PROJECT_VERSION');
  const source = validateSource(value.source);
  if (!source) return error('PROJECT_SOURCE');
  let circuit;
  try { circuit = normalizeCircuitStructure(value.circuit, { allowDraft: true }); }
  catch (exception) {
    if (exception instanceof CircuitError) return error(exception.code, exception.diagnostics);
    throw exception;
  }
  let layout;
  try { layout = normalizeLayout(value.layout, circuit); }
  catch { return error('PROJECT_LAYOUT'); }
  if (!layout) return error('PROJECT_LAYOUT');
  if (!exactKeys(value.instruments, ['logicChannels', 'selectedPin', 'serial'])
      || !Array.isArray(value.instruments.logicChannels) || value.instruments.logicChannels.length > 8
      || value.instruments.logicChannels.some((pin) => typeof pin !== 'string')
      || (value.instruments.selectedPin !== null && typeof value.instruments.selectedPin !== 'string')
      || !exactKeys(value.instruments.serial, ['baud', 'encoding', 'historyLimit'])) return error('PROJECT_INSTRUMENTS');
  if (!exactKeys(value.build, ['status', 'inputIdentity', 'artifactIdentity'])
      || !['dirty', 'succeeded', 'failed'].includes(value.build.status)
      || (value.build.inputIdentity !== null && !/^[0-9a-f]{64}$/.test(value.build.inputIdentity))
      || (value.build.artifactIdentity !== null && !/^[0-9a-f]{64}$/.test(value.build.artifactIdentity))
      || (value.build.status !== 'succeeded' && value.build.artifactIdentity !== null)) return error('PROJECT_BUILD');
  return {
    ok: true,
    code: 'OK',
    project: {
      schema: PROJECT_SCHEMA,
      boardProfile: BOARD_PROFILE,
      source,
      circuit,
      layout,
      instruments: clone(value.instruments),
      build: clone(value.build),
    },
  };
}

export function parseProjectV2(source) {
  try { return validateProjectV2(parseStrictJson(source, PROJECT_EXPORT_LIMIT)); }
  catch (exception) { return error(exception.code ?? 'MALFORMED_JSON'); }
}

export function canonicalProjectJson(project) {
  const result = validateProjectV2(project);
  if (!result.ok) throw new Error(result.code);
  return JSON.stringify(result.project);
}

function migrateEndpoint(value) {
  if (typeof value !== 'string') return null;
  const split = value.lastIndexOf('.');
  if (split < 1) return null;
  return { component: value.slice(0, split), pin: V1_PIN_MAP[value.slice(split + 1)] ?? value.slice(split + 1) };
}

export function migrateProjectV1(source, storage = null) {
  let legacy;
  try { legacy = typeof source === 'string' ? parseStrictJson(source, 256 * 1024) : clone(source); }
  catch (exception) { return error(exception.code ?? 'MALFORMED_JSON'); }
  if (!exactKeys(legacy, ['schema', 'selected', 'positions', 'netlist'])
      || legacy.schema !== 'teach-lab-project@1' || !Array.isArray(legacy.selected)
      || !ownObject(legacy.positions) || !ownObject(legacy.netlist)
      || !exactKeys(legacy.netlist, ['schema', 'components', 'wires', 'firmwarePins'])
      || legacy.netlist.schema !== 'teach-lab-netlist@1') return error('V1_PROJECT_SHAPE');
  const selected = new Set(legacy.selected);
  if (selected.size !== legacy.selected.length || !selected.has('controller-1')) return error('V1_COMPONENT_SET');
  const components = [];
  for (const component of legacy.netlist.components) {
    if (!exactKeys(component, ['id', 'type', 'properties']) || !selected.has(component.id)) return error('V1_COMPONENT_SET');
    const type = V1_TYPES[component.type];
    if (!type) return error('V1_COMPONENT_TYPE', [component.id]);
    const overrides = { label: component.id };
    if (type === 'resistor.fixed-v1') overrides.properties = { ohms: component.properties.ohms };
    if (type === 'potentiometer.linear-v1') overrides.properties = { ohms: component.properties.ohms, taper: 'linear' };
    components.push(createComponent(component.id, type, overrides));
  }
  if (components.length !== selected.size) return error('V1_COMPONENT_SET');
  const nets = legacy.netlist.wires.map((wire, index) => {
    if (!exactKeys(wire, ['from', 'to'])) return null;
    const from = migrateEndpoint(wire.from);
    const to = migrateEndpoint(wire.to);
    return from && to ? { id: `migrated-net-${String(index + 1).padStart(3, '0')}`, endpoints: [from, to] } : null;
  });
  if (nets.some((net) => net === null)) return error('V1_WIRE');
  const circuitResult = validateCircuit({ schema: CIRCUIT_SCHEMA, components, nets, junctions: [] });
  if (!circuitResult.ok) return error(circuitResult.code, circuitResult.diagnostics);
  const positions = {};
  for (const component of components) {
    const position = legacy.positions[component.id];
    if (!exactKeys(position, ['x', 'y']) || !Number.isFinite(position.x) || !Number.isFinite(position.y)
        || position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1) return error('V1_POSITION', [component.id]);
    positions[component.id] = { x: position.x, y: position.y };
  }
  const project = {
    schema: PROJECT_SCHEMA,
    boardProfile: BOARD_PROFILE,
    source: { files: [{ name: 'main.ino', content: '' }] },
    circuit: circuitResult.graph,
    layout: {
      positions: Object.fromEntries(Object.entries(positions).map(([id, position]) => [id, { ...position, rotation: 0 }])),
      wireRoutes: {},
      wireStyles: {},
      viewport: { zoom: 1, panX: 0, panY: 0 },
    },
    instruments: {
      logicChannels: [], selectedPin: null,
      serial: { baud: 9_600, encoding: 'utf-8', historyLimit: 512 },
    },
    build: { status: 'dirty', inputIdentity: null, artifactIdentity: null },
  };
  const validated = validateProjectV2(project);
  if (!validated.ok) return validated;
  return {
    ...validated,
    report: {
      code: 'V1_MIGRATED',
      preservedComponents: components.length,
      preservedPositions: Object.keys(positions).length,
      sourceCreatedEmpty: true,
      artifactCreated: false,
      originalKeyUntouched: true,
    },
  };
}
