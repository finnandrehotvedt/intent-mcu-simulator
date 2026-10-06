// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  CIRCUIT_LIMITS,
  COMPONENT_CATALOG,
  LED_FORWARD_VOLTS,
  catalogPin,
  catalogType,
  defaultControls,
  defaultProperties,
} from './component-catalog.mjs';
import { exactKeys, parseStrictJson } from './strict-json.mjs';

export const CIRCUIT_SCHEMA = 'teach-lab-circuit@2';
const ID = /^[a-z][a-z0-9-]{0,47}$/;
const LABEL = /^[\p{L}\p{N} ._#()°Ω×+\-]{1,64}$/u;
const ACCEPTED_BAUD = new Set([9_600, 19_200, 38_400, 57_600, 115_200]);

function diagnostic(code, details = {}) {
  return Object.freeze({
    code,
    severity: 'block',
    componentId: details.componentId ?? null,
    netId: details.netId ?? null,
    message: details.message ?? code,
  });
}

export class CircuitError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'CircuitError';
    this.code = code;
    this.diagnostics = [diagnostic(code, details)];
  }
}

function fail(code, details) { throw new CircuitError(code, details); }
function endpointKey(endpoint) { return `${endpoint.component}.${endpoint.pin}`; }
function componentKey(component) { return `${component.type}:${component.id}`; }
function clone(value) { return structuredClone(value); }

function validateProperties(type, properties, controls, componentId) {
  const definition = catalogType(type);
  if (!definition) fail('UNKNOWN_COMPONENT_TYPE', { componentId });
  if (!exactKeys(properties, definition.propertyKeys) || !exactKeys(controls, definition.controlKeys)) {
    fail('INVALID_COMPONENT_PROPERTIES', { componentId });
  }
  if (type === 'led.basic-v1' && !Object.hasOwn(LED_FORWARD_VOLTS, properties.color)) {
    fail('INVALID_COMPONENT_PROPERTIES', { componentId });
  }
  if (type === 'resistor.fixed-v1'
      && (!Number.isFinite(properties.ohms) || properties.ohms < 1 || properties.ohms > 10_000_000)) {
    fail('INVALID_COMPONENT_PROPERTIES', { componentId });
  }
  if (type === 'button.momentary-v1'
      && (properties.normallyOpen !== true || typeof controls.pressed !== 'boolean')) {
    fail('INVALID_COMPONENT_PROPERTIES', { componentId });
  }
  if (type === 'potentiometer.linear-v1'
      && (!Number.isFinite(properties.ohms) || properties.ohms < 1 || properties.ohms > 10_000_000
        || properties.taper !== 'linear' || !Number.isFinite(controls.position)
        || controls.position < 0 || controls.position > 1)) {
    fail('INVALID_COMPONENT_PROPERTIES', { componentId });
  }
  if (type === 'terminal.serial-uart-v1'
      && (!ACCEPTED_BAUD.has(properties.baud) || properties.encoding !== 'utf-8'
        || !Number.isInteger(properties.historyLimit) || properties.historyLimit < 16
        || properties.historyLimit > 4_096)) {
    fail('INVALID_COMPONENT_PROPERTIES', { componentId });
  }
}

export function normalizeCircuitStructure(value, { allowDraft = false } = {}) {
  if (!exactKeys(value, ['schema', 'components', 'nets', 'junctions'])) fail('CIRCUIT_SHAPE');
  if (value.schema !== CIRCUIT_SCHEMA) fail('UNKNOWN_CIRCUIT_SCHEMA');
  if (!Array.isArray(value.components) || !Array.isArray(value.nets) || !Array.isArray(value.junctions)) {
    fail('CIRCUIT_SHAPE');
  }
  const endpointCount = value.nets.reduce(
    (count, net) => count + (Array.isArray(net?.endpoints) ? net.endpoints.length : 0), 0,
  );
  if (value.components.length > CIRCUIT_LIMITS.components) fail('COMPONENT_LIMIT');
  if (value.nets.length > CIRCUIT_LIMITS.nets) fail('NET_LIMIT');
  if (endpointCount > CIRCUIT_LIMITS.endpoints) fail('ENDPOINT_LIMIT');

  const componentIds = new Set();
  const components = value.components.map((component) => {
    if (!exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
        || typeof component.id !== 'string' || !ID.test(component.id)
        || typeof component.type !== 'string' || typeof component.label !== 'string'
        || !LABEL.test(component.label) || componentIds.has(component.id)) {
      fail('INVALID_COMPONENT', { componentId: component?.id });
    }
    componentIds.add(component.id);
    validateProperties(component.type, component.properties, component.controls, component.id);
    return {
      id: component.id,
      type: component.type,
      label: component.label,
      properties: clone(component.properties),
      controls: clone(component.controls),
    };
  }).sort((a, b) => componentKey(a).localeCompare(componentKey(b)));
  const componentMap = new Map(components.map((component) => [component.id, component]));
  const boards = components.filter((component) => component.type === 'board.atmega328p-16mhz-v1');
  if ((!allowDraft && boards.length !== 1) || (allowDraft && boards.length > 1)) fail('BOARD_COUNT');

  const netIds = new Set();
  const usedEndpoints = new Set();
  const nets = value.nets.map((net) => {
    if (!exactKeys(net, ['id', 'endpoints']) || typeof net.id !== 'string' || !ID.test(net.id)
        || netIds.has(net.id) || !Array.isArray(net.endpoints) || net.endpoints.length < 2) {
      fail('INVALID_NET', { netId: net?.id });
    }
    netIds.add(net.id);
    const endpoints = net.endpoints.map((endpoint) => {
      if (!exactKeys(endpoint, ['component', 'pin']) || typeof endpoint.component !== 'string'
          || typeof endpoint.pin !== 'string') fail('INVALID_ENDPOINT', { netId: net.id });
      const component = componentMap.get(endpoint.component);
      if (!component || !catalogPin(component.type, endpoint.pin)) {
        fail('UNKNOWN_PIN', { componentId: endpoint.component, netId: net.id });
      }
      const normalized = { component: endpoint.component, pin: endpoint.pin };
      const key = endpointKey(normalized);
      if (usedEndpoints.has(key)) fail('REUSED_ENDPOINT', { componentId: endpoint.component, netId: net.id });
      usedEndpoints.add(key);
      return normalized;
    }).sort((a, b) => endpointKey(a).localeCompare(endpointKey(b)));
    return { id: net.id, endpoints };
  }).sort((a, b) => a.id.localeCompare(b.id));

  const junctionIds = new Set();
  const junctions = value.junctions.map((junction) => {
    if (!exactKeys(junction, ['id', 'net']) || typeof junction.id !== 'string' || !ID.test(junction.id)
        || junctionIds.has(junction.id) || typeof junction.net !== 'string' || !netIds.has(junction.net)) {
      fail('INVALID_JUNCTION', { netId: junction?.net });
    }
    junctionIds.add(junction.id);
    return { id: junction.id, net: junction.net };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return { schema: CIRCUIT_SCHEMA, components, nets, junctions };
}

function endpointIndexes(graph) {
  const components = new Map(graph.components.map((component) => [component.id, component]));
  const nets = new Map(graph.nets.map((net) => [net.id, net]));
  const endpointToNet = new Map();
  for (const net of graph.nets) for (const endpoint of net.endpoints) endpointToNet.set(endpointKey(endpoint), net.id);
  return { components, nets, endpointToNet };
}

function boardEndpoint(indexes, netId, predicate) {
  const net = indexes.nets.get(netId);
  return net?.endpoints.find((endpoint) => {
    const component = indexes.components.get(endpoint.component);
    return component?.type === 'board.atmega328p-16mhz-v1' && predicate(endpoint.pin);
  }) ?? null;
}

function connectedNet(indexes, componentId, pin) {
  return indexes.endpointToNet.get(`${componentId}.${pin}`) ?? null;
}

export function resolveDigitalDrivers(levels) {
  const values = [...levels].filter((level) => level !== 'HIGH_Z');
  const high = values.includes('HIGH');
  const low = values.includes('LOW');
  if (high && low) return 'CONFLICT';
  if (high) return 'HIGH';
  if (low) return 'LOW';
  if (values.includes('PULLED_HIGH')) return 'PULLED_HIGH';
  return 'HIGH_Z';
}

function analyzeElectrical(graph, options = {}) {
  const drivers = options.drivers ?? {};
  const indexes = endpointIndexes(graph);
  const diagnostics = [];
  const models = { leds: [], buttons: [], potentiometers: [], resolvedNets: [] };
  const consumedResistors = new Set();

  for (const net of graph.nets) {
    const hasFive = Boolean(boardEndpoint(indexes, net.id, (pin) => pin === '5V'));
    const hasGround = Boolean(boardEndpoint(indexes, net.id, (pin) => /^GND[123]$/.test(pin)));
    if (hasFive && hasGround) diagnostics.push(diagnostic('POWER_SHORT', { netId: net.id }));
    const resolution = resolveDigitalDrivers(net.endpoints.map((endpoint) => drivers[endpointKey(endpoint)] ?? 'HIGH_Z'));
    models.resolvedNets.push({ netId: net.id, resolution });
    if (resolution === 'CONFLICT') diagnostics.push(diagnostic('OUTPUT_CONTENTION', { netId: net.id }));
  }
  for (const required of options.requiredInputs ?? []) {
    const netId = indexes.endpointToNet.get(required);
    const resolved = models.resolvedNets.find((entry) => entry.netId === netId)?.resolution ?? 'HIGH_Z';
    if (resolved === 'HIGH_Z') {
      const [componentId] = String(required).split('.');
      diagnostics.push(diagnostic('FLOATING_REQUIRED_INPUT', { componentId, netId }));
    }
  }

  for (const led of graph.components.filter((component) => component.type === 'led.basic-v1')) {
    const anodeNet = connectedNet(indexes, led.id, 'ANODE');
    const cathodeNet = connectedNet(indexes, led.id, 'CATHODE');
    const anodeGround = anodeNet && boardEndpoint(indexes, anodeNet, (pin) => /^GND[123]$/.test(pin));
    const cathodeSource = cathodeNet && boardEndpoint(indexes, cathodeNet, (pin) => /^D\d+$/.test(pin));
    if (anodeGround || cathodeSource) {
      diagnostics.push(diagnostic('LED_REVERSE_POLARITY', { componentId: led.id, netId: anodeNet ?? cathodeNet }));
      continue;
    }
    if (!anodeNet || !cathodeNet || !boardEndpoint(indexes, cathodeNet, (pin) => /^GND[123]$/.test(pin))) {
      diagnostics.push(diagnostic('LED_UNSUPPORTED_PATH', { componentId: led.id, netId: anodeNet ?? cathodeNet }));
      continue;
    }
    if (boardEndpoint(indexes, anodeNet, (pin) => /^D\d+$/.test(pin))) {
      diagnostics.push(diagnostic('LED_SERIES_RESISTOR_REQUIRED', { componentId: led.id, netId: anodeNet }));
      continue;
    }
    const candidates = [];
    for (const resistor of graph.components.filter((component) => component.type === 'resistor.fixed-v1')) {
      for (const [near, far] of [['A', 'B'], ['B', 'A']]) {
        if (connectedNet(indexes, resistor.id, near) !== anodeNet) continue;
        const sourceNet = connectedNet(indexes, resistor.id, far);
        const source = sourceNet && boardEndpoint(indexes, sourceNet, (pin) => /^D\d+$/.test(pin));
        if (source) candidates.push({ resistor, sourceNet, sourcePin: source.pin });
      }
    }
    if (candidates.length !== 1 || indexes.nets.get(anodeNet).endpoints.length !== 2) {
      diagnostics.push(diagnostic('LED_UNSUPPORTED_PATH', { componentId: led.id, netId: anodeNet }));
      continue;
    }
    const candidate = candidates[0];
    const forwardVolts = LED_FORWARD_VOLTS[led.properties.color];
    const currentAmps = (5 - forwardVolts) / candidate.resistor.properties.ohms;
    if (!Number.isFinite(currentAmps) || currentAmps <= 0 || currentAmps > 0.02) {
      diagnostics.push(diagnostic('LED_OVERCURRENT', { componentId: led.id, netId: anodeNet }));
      continue;
    }
    consumedResistors.add(candidate.resistor.id);
    models.leds.push({
      componentId: led.id,
      resistorId: candidate.resistor.id,
      sourcePin: candidate.sourcePin,
      currentAmps,
      brightness: Math.min(currentAmps / 0.02, 1),
      color: led.properties.color,
    });
  }

  for (const button of graph.components.filter((component) => component.type === 'button.momentary-v1')) {
    const netA = connectedNet(indexes, button.id, 'A');
    const netB = connectedNet(indexes, button.id, 'B');
    const cases = [[netA, netB], [netB, netA]];
    const accepted = cases.find(([sourceNet, groundNet]) => sourceNet && groundNet
      && boardEndpoint(indexes, sourceNet, (pin) => /^D\d+$/.test(pin))
      && boardEndpoint(indexes, groundNet, (pin) => /^GND[123]$/.test(pin)));
    if (!accepted) {
      diagnostics.push(diagnostic('BUTTON_UNSUPPORTED_PATH', { componentId: button.id, netId: netA ?? netB }));
      continue;
    }
    const source = boardEndpoint(indexes, accepted[0], (pin) => /^D\d+$/.test(pin));
    models.buttons.push({ componentId: button.id, boardPin: source.pin, pressed: button.controls.pressed });
  }

  for (const pot of graph.components.filter((component) => component.type === 'potentiometer.linear-v1')) {
    const highNet = connectedNet(indexes, pot.id, 'HIGH');
    const lowNet = connectedNet(indexes, pot.id, 'LOW');
    const wiperNet = connectedNet(indexes, pot.id, 'WIPER');
    const highOk = highNet && boardEndpoint(indexes, highNet, (pin) => pin === '5V');
    const lowOk = lowNet && boardEndpoint(indexes, lowNet, (pin) => /^GND[123]$/.test(pin));
    const input = wiperNet && boardEndpoint(indexes, wiperNet, (pin) => /^A[0-5]$/.test(pin));
    const exact = wiperNet && indexes.nets.get(wiperNet).endpoints.length === 2;
    if (!highOk || !lowOk || !input || !exact) {
      diagnostics.push(diagnostic('UNSUPPORTED_ANALOG_TOPOLOGY', { componentId: pot.id, netId: wiperNet ?? highNet ?? lowNet }));
      continue;
    }
    models.potentiometers.push({
      componentId: pot.id,
      boardPin: input.pin,
      position: pot.controls.position,
      voltage: pot.controls.position * 5,
    });
  }

  for (const resistor of graph.components.filter((component) => component.type === 'resistor.fixed-v1')) {
    if (!consumedResistors.has(resistor.id)) {
      diagnostics.push(diagnostic('UNSUPPORTED_ANALOG_TOPOLOGY', { componentId: resistor.id }));
    }
  }
  diagnostics.sort((a, b) => `${a.code}:${a.componentId}:${a.netId}`.localeCompare(`${b.code}:${b.componentId}:${b.netId}`));
  return { diagnostics, models };
}

export function validateCircuit(value, options = {}) {
  try {
    const graph = normalizeCircuitStructure(value, { allowDraft: options.allowDraft === true });
    const boards = graph.components.filter((component) => component.type === 'board.atmega328p-16mhz-v1');
    if (boards.length !== 1) {
      const diagnostics = [diagnostic('BOARD_COUNT')];
      return { ok: false, code: 'BOARD_COUNT', graph, diagnostics, models: null };
    }
    const { diagnostics, models } = analyzeElectrical(graph, options);
    if (diagnostics.length) return { ok: false, code: diagnostics[0].code, diagnostics };
    return { ok: true, code: 'OK', graph, diagnostics: [], models };
  } catch (error) {
    if (error instanceof CircuitError) return { ok: false, code: error.code, diagnostics: error.diagnostics };
    throw error;
  }
}

export function parseCircuitText(source, options = {}) {
  try { return validateCircuit(parseStrictJson(source), options); }
  catch (error) {
    return { ok: false, code: error.code ?? 'MALFORMED_JSON', diagnostics: [diagnostic(error.code ?? 'MALFORMED_JSON')] };
  }
}

export function canonicalCircuitJson(graph) {
  const result = validateCircuit(graph);
  if (!result.ok) throw new CircuitError(result.code, result.diagnostics[0]);
  return JSON.stringify(result.graph);
}

export function createComponent(id, type, overrides = {}) {
  const definition = COMPONENT_CATALOG[type];
  if (!definition) throw new Error(`Unknown component type: ${type}`);
  return {
    id,
    type,
    label: overrides.label ?? definition.displayName,
    properties: { ...defaultProperties(type), ...(overrides.properties ?? {}) },
    controls: { ...defaultControls(type), ...(overrides.controls ?? {}) },
  };
}

export class CircuitStore {
  constructor(initialGraph) {
    const result = validateCircuit(initialGraph);
    if (!result.ok) throw new CircuitError(result.code, result.diagnostics[0]);
    this.graph = result.graph;
    this.models = result.models;
    this.topologyRevision = 0;
    this.controlRevision = 0;
    this.runtimeDirty = false;
  }

  replace(nextGraph, { running = false } = {}) {
    const result = validateCircuit(nextGraph);
    if (!result.ok) return { ...result, stopped: false };
    this.graph = result.graph;
    this.models = result.models;
    this.topologyRevision += 1;
    this.runtimeDirty = true;
    return { ...result, stopped: running };
  }

  setControl(componentId, key, value) {
    const next = clone(this.graph);
    const component = next.components.find((item) => item.id === componentId);
    if (!component || !Object.hasOwn(component.controls, key)) {
      return { ok: false, code: 'UNKNOWN_CONTROL', diagnostics: [diagnostic('UNKNOWN_CONTROL', { componentId })] };
    }
    component.controls[key] = value;
    const result = validateCircuit(next);
    if (!result.ok) return result;
    this.graph = result.graph;
    this.models = result.models;
    this.controlRevision += 1;
    return { ...result, topologyRevision: this.topologyRevision, controlRevision: this.controlRevision };
  }
}

export class CircuitRuntime {
  constructor(graph) {
    const result = validateCircuit(graph);
    if (!result.ok) throw new CircuitError(result.code, result.diagnostics[0]);
    this.graph = result.graph;
    this.models = result.models;
    this.controls = Object.fromEntries(this.graph.components.map((component) => [component.id, clone(component.controls)]));
  }

  applyControls(adapter) {
    for (const button of this.models.buttons) {
      const pressed = this.controls[button.componentId].pressed;
      adapter.setDigitalPin(Number(button.boardPin.slice(1)), !pressed);
    }
    for (const pot of this.models.potentiometers) {
      const position = this.controls[pot.componentId].position;
      adapter.setAnalogChannel(Number(pot.boardPin.slice(1)), position * 5);
    }
  }

  setControl(componentId, key, value, adapter) {
    const store = new CircuitStore(this.graph);
    const result = store.setControl(componentId, key, value);
    if (!result.ok) throw new CircuitError(result.code, result.diagnostics[0]);
    this.graph = store.graph;
    this.models = store.models;
    this.controls[componentId] = clone(store.graph.components.find((item) => item.id === componentId).controls);
    this.applyControls(adapter);
  }

  observe(snapshot) {
    const leds = this.models.leds.map((model) => {
      const on = Boolean(snapshot.digitalPins?.[model.sourcePin]);
      return {
        componentId: model.componentId,
        on,
        currentAmps: on ? model.currentAmps : 0,
        brightness: on ? model.brightness : 0,
        color: model.color,
      };
    });
    return {
      leds,
      controls: clone(this.controls),
      analogue: this.models.potentiometers.map((model) => ({
        componentId: model.componentId,
        boardPin: model.boardPin,
        voltage: this.controls[model.componentId].position * 5,
      })),
      resolvedNets: clone(this.models.resolvedNets),
    };
  }
}
