// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { COMPONENT_CATALOG } from '../src/component-catalog.mjs';
import { validateCircuit } from '../src/circuit-engine.mjs';
import { RuntimeKernel } from '../src/runtime-kernel.mjs';
import { exactKeys, parseStrictJson } from '../src/strict-json.mjs';

export const TOGGLE_SWITCH_TYPE = 'switch.toggle-spst-v1';
export const TOGGLE_SWITCH_MODEL = 'model.switch-toggle-spst-v1';
export const TOGGLE_SWITCH_RENDERER = 'switch-toggle-spst';
const PRODUCTION_CONTACT_TYPE = 'button.momentary-v1';
const clone = (value) => structuredClone(value);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const TOGGLE_SWITCH_DEFINITION = deepFreeze({
  family: 'input.toggle-switch',
  variant: 'spst-latching-normally-open',
  type: TOGGLE_SWITCH_TYPE,
  version: 1,
  displayName: 'SPST latching toggle switch',
  manufacturer: 'Generic',
  partNumber: 'SW-TOGGLE-SPST-NO',
  pins: [
    {
      id: 'A', label: 'Contact A', role: 'passive',
      signals: ['passive.two-terminal'], capabilities: ['passive.two-terminal'],
      constraints: {}, anchor: { x: 0.08, y: 0.72 },
    },
    {
      id: 'B', label: 'Contact B', role: 'passive',
      signals: ['passive.two-terminal'], capabilities: ['passive.two-terminal'],
      constraints: {}, anchor: { x: 0.92, y: 0.72 },
    },
  ],
  propertyKeys: ['normallyOpen'],
  propertySchema: { normallyOpen: { kind: 'boolean', default: true } },
  controlKeys: ['closed'],
  modelRef: TOGGLE_SWITCH_MODEL,
  internalTerminalGroups: [],
  selectable: true,
  artwork: {
    renderer: TOGGLE_SWITCH_RENDERER,
    thumbnail: TOGGLE_SWITCH_RENDERER,
    viewBox: [0, 0, 112, 82], cssWidth: 112, cssHeight: 82,
    provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
    license: 'Apache-2.0',
  },
  catalog: {
    category: 'inputs',
    aliases: ['toggle switch', 'on off switch', 'spst switch', 'latching switch'],
    functions: ['digital input', 'maintained contact', 'user switch'],
    interfaces: ['GPIO'],
    supplyVolts: { min: 0, max: 5 },
    package: 'virtual SPST toggle',
  },
  support: {
    status: 'simulated',
    limitations: [
      'Ideal latching normally-open SPST contact in the existing 0–5 V AVR digital-input topology.',
      'No contact bounce, resistance, current rating, arcing or mechanical wear model.',
      'Not an SPDT selector, mains switch or physical-safety model.',
    ],
  },
});

function sameJson(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

export function validateToggleSwitchDefinition(definition = TOGGLE_SWITCH_DEFINITION) {
  return exactKeys(definition, [
    'family', 'variant', 'type', 'version', 'displayName', 'manufacturer', 'partNumber',
    'pins', 'propertyKeys', 'propertySchema', 'controlKeys', 'modelRef',
    'internalTerminalGroups', 'selectable', 'artwork', 'catalog', 'support',
  ]) && sameJson(definition, TOGGLE_SWITCH_DEFINITION);
}

export function createToggleSwitchComponent(id, label = 'SPST toggle switch', { closed = false } = {}) {
  if (typeof closed !== 'boolean') throw new TypeError('TOGGLE_SWITCH_CONTROL');
  return {
    id,
    type: TOGGLE_SWITCH_TYPE,
    label,
    properties: { normallyOpen: true },
    controls: { closed },
  };
}

class ToggleSwitchError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'ToggleSwitchError';
    this.code = code;
    this.diagnostic = {
      code, severity: 'block', componentId: details.componentId ?? null,
      netId: details.netId ?? null, message: details.message ?? code,
    };
  }
}

function fail(code, details) { throw new ToggleSwitchError(code, details); }

function projectToggleSwitches(value) {
  if (!exactKeys(value, ['schema', 'components', 'nets', 'junctions'])
      || !Array.isArray(value.components) || !Array.isArray(value.nets) || !Array.isArray(value.junctions)) {
    fail('CIRCUIT_SHAPE');
  }
  const candidates = new Map();
  const runtimeGraph = clone(value);
  runtimeGraph.components = runtimeGraph.components.map((component) => {
    if (component?.type !== TOGGLE_SWITCH_TYPE) return component;
    if (!exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])) {
      fail('TOGGLE_SWITCH_SHAPE', { componentId: component?.id });
    }
    if (!exactKeys(component.properties, ['normallyOpen']) || component.properties.normallyOpen !== true) {
      fail('TOGGLE_SWITCH_NORMALLY_OPEN_ONLY', { componentId: component.id });
    }
    if (!exactKeys(component.controls, ['closed']) || typeof component.controls.closed !== 'boolean') {
      fail('TOGGLE_SWITCH_CONTROL', { componentId: component.id });
    }
    candidates.set(component.id, clone(component));
    return {
      id: component.id,
      type: PRODUCTION_CONTACT_TYPE,
      label: component.label,
      properties: { normallyOpen: true },
      controls: { pressed: component.controls.closed },
    };
  });
  if (candidates.size === 0) fail('TOGGLE_SWITCH_REQUIRED');
  return { runtimeGraph, candidates };
}

export function validateToggleSwitchCircuit(value, options = {}) {
  try {
    const { runtimeGraph, candidates } = projectToggleSwitches(value);
    const result = validateCircuit(runtimeGraph, options);
    if (!result.ok) return { ...result, runtimeGraph, switches: [] };
    const graph = clone(result.graph);
    graph.components = graph.components.map((component) => candidates.get(component.id) ?? component)
      .sort((left, right) => `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`));
    const switches = result.models.buttons.filter((model) => candidates.has(model.componentId)).map((model) => ({
      componentId: model.componentId,
      boardPin: model.boardPin,
      closed: candidates.get(model.componentId).controls.closed,
      adapterType: PRODUCTION_CONTACT_TYPE,
      adapterControl: 'pressed',
    }));
    return {
      ok: true, code: 'OK', graph, runtimeGraph: result.graph,
      diagnostics: [], models: result.models, switches,
    };
  } catch (error) {
    if (error instanceof ToggleSwitchError) {
      return { ok: false, code: error.code, diagnostics: [error.diagnostic] };
    }
    throw error;
  }
}

export function parseToggleSwitchCircuitText(source, options = {}) {
  try { return validateToggleSwitchCircuit(parseStrictJson(source), options); }
  catch (error) {
    const code = error.code ?? 'MALFORMED_JSON';
    return { ok: false, code, diagnostics: [{ code, severity: 'block', componentId: null, netId: null, message: code }] };
  }
}

export function canonicalToggleSwitchCircuitJson(value) {
  const result = validateToggleSwitchCircuit(value);
  if (!result.ok) throw new ToggleSwitchError(result.code, result.diagnostics?.[0]);
  return JSON.stringify(result.graph);
}

export function replaceMomentaryButtonsWithToggleSwitches(value) {
  const graph = clone(value);
  let sequence = 0;
  const replacements = new Map();
  graph.components = graph.components.map((component) => {
    if (component.type !== PRODUCTION_CONTACT_TYPE) return component;
    sequence += 1;
    const id = `toggle-switch-${sequence}`;
    replacements.set(component.id, id);
    return createToggleSwitchComponent(id, `SPST toggle switch ${sequence}`, { closed: component.controls.pressed });
  });
  if (sequence === 0) throw new ToggleSwitchError('TOGGLE_SWITCH_REQUIRED');
  for (const net of graph.nets) {
    for (const endpoint of net.endpoints) endpoint.component = replacements.get(endpoint.component) ?? endpoint.component;
  }
  return graph;
}

export function setToggleSwitchClosed(value, componentId, closed) {
  if (typeof closed !== 'boolean') throw new ToggleSwitchError('TOGGLE_SWITCH_CONTROL', { componentId });
  const graph = clone(value);
  const component = graph.components.find((item) => item.id === componentId && item.type === TOGGLE_SWITCH_TYPE);
  if (!component) throw new ToggleSwitchError('TOGGLE_SWITCH_UNKNOWN', { componentId });
  component.controls.closed = closed;
  const result = validateToggleSwitchCircuit(graph);
  if (!result.ok) throw new ToggleSwitchError(result.code, result.diagnostics?.[0]);
  return result.graph;
}

export class ToggleSwitchRuntime {
  constructor(hex, candidateGraph, options = {}) {
    const result = validateToggleSwitchCircuit(candidateGraph);
    if (!result.ok) throw new ToggleSwitchError(result.code, result.diagnostics?.[0]);
    this.candidateGraph = result.graph;
    this.switches = result.switches;
    this.kernel = new RuntimeKernel(hex, result.runtimeGraph, options);
  }

  setClosed(componentId, closed) {
    if (typeof closed !== 'boolean') throw new ToggleSwitchError('TOGGLE_SWITCH_CONTROL', { componentId });
    if (!this.switches.some((item) => item.componentId === componentId)) {
      throw new ToggleSwitchError('TOGGLE_SWITCH_UNKNOWN', { componentId });
    }
    const event = this.kernel.queueControl(componentId, 'pressed', closed);
    this.candidateGraph = setToggleSwitchClosed(this.candidateGraph, componentId, closed);
    return event;
  }

  runInstructions(count) { return this.kernel.runInstructions(count); }
  runUntilCycle(cycle, maxInstructions) { return this.kernel.runUntilCycle(cycle, maxInstructions); }
  reset() { this.kernel.reset(); return this.snapshot(); }

  snapshot() {
    const snapshot = this.kernel.snapshot();
    const switches = this.switches.map((item) => ({
      componentId: item.componentId,
      boardPin: item.boardPin,
      closed: snapshot.circuit.controls[item.componentId].pressed,
    }));
    return { ...snapshot, candidate: { switches }, candidateGraph: clone(this.candidateGraph) };
  }
}

export function activeAndIsolatedComponentCounts() {
  return Object.freeze({
    activeDefinitions: Object.keys(COMPONENT_CATALOG).length,
    activeSelectable: Object.values(COMPONENT_CATALOG).filter((definition) => definition.selectable).length,
    isolatedFunctionalCandidates: 2,
  });
}
