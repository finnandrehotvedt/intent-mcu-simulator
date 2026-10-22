// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { normalizeCircuitStructure, validateCircuit } from './circuit-engine.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from './model-library.mjs';
import { exactKeys, parseStrictJson } from './strict-json.mjs';

export const SUBCIRCUITS_SCHEMA = 'intent-mcu-subcircuits@1';
export const SUBCIRCUIT_DEFINITION_SCHEMA = 'intent-mcu-subcircuit-definition@1';
export const SUBCIRCUIT_INSTANCE_SCHEMA = 'intent-mcu-subcircuit-instance@1';
export const SUBCIRCUIT_PROFILE = 'board.atmega328p-16mhz-v1';
export const SUBCIRCUIT_LIMITS = Object.freeze({ bytes: 262_144, definitions: 4, instances: 8,
  components: 8, nets: 12, ports: 4, history: 64 });

const clone = (value) => structuredClone(value);
const fail = (code, details = []) => { throw Object.assign(new Error(code), { code, details }); };
const ID = /^[a-z][a-z0-9-]{1,31}$/u;
const LABEL = /^[\p{L}\p{N} ._#()°Ω×+\-]{1,64}$/u;
const id = (value, path) => {
  if (typeof value !== 'string' || !ID.test(value)) fail('SUBCIRCUIT_ID', [path]);
  return value;
};
const label = (value, path) => {
  if (typeof value !== 'string' || value !== value.trim() || !LABEL.test(value)) fail('SUBCIRCUIT_LABEL', [path]);
  return value;
};
const point = (value, path) => {
  if (!Number.isFinite(value) || value < 0 || value > 1) fail('SUBCIRCUIT_POINT', [path]);
  return value;
};
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const endpointKey = ({ component, pin }) => `${component}.${pin}`;
const generatedId = (instanceId, localId) => {
  const value = `${instanceId}-${localId}`;
  if (value.length > 48) fail('SUBCIRCUIT_NAMESPACE_LIMIT', [instanceId, localId]);
  return value;
};

export function createSeriesLedDefinition({ id: definitionId = 'series-led-stage', ohms = 220,
  color = 'red', label: definitionLabel = 'Series LED stage' } = {}) {
  return {
    schema: SUBCIRCUIT_DEFINITION_SCHEMA, id: definitionId, label: definitionLabel,
    components: [
      { id: 'led', type: 'led.basic-v1', label: 'Stage LED', properties: { color }, controls: {} },
      { id: 'resistor', type: 'resistor.fixed-v1', label: 'Stage resistor', properties: { ohms }, controls: {} },
    ],
    nets: [
      { id: 'ground', endpoints: [{ component: 'led', pin: 'CATHODE' }] },
      { id: 'series', endpoints: [{ component: 'led', pin: 'ANODE' }, { component: 'resistor', pin: 'B' }] },
      { id: 'source', endpoints: [{ component: 'resistor', pin: 'A' }] },
    ],
    ports: [{ id: 'ground', netId: 'ground' }, { id: 'source', netId: 'source' }],
  };
}

export function emptySubcircuits(modelLibrary = CURRENT_MODEL_LIBRARY_LOCK) {
  return { schema: SUBCIRCUITS_SCHEMA, profileId: SUBCIRCUIT_PROFILE,
    modelLibrary: clone(modelLibrary), definitions: [], instances: [] };
}

function normalizeDefinition(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, ['schema', 'id', 'label', 'components', 'nets', 'ports'])
      || value.schema !== SUBCIRCUIT_DEFINITION_SCHEMA
      || !Array.isArray(value.components) || value.components.length !== 2
      || !Array.isArray(value.nets) || value.nets.length !== 3
      || !Array.isArray(value.ports) || value.ports.length !== 2) fail('SUBCIRCUIT_DEFINITION_SHAPE', [path]);
  const definitionId = id(value.id, `${path}.id`);
  const components = value.components.map((component, index) => {
    const itemPath = `${path}.components[${index}]`;
    if (!component || typeof component !== 'object' || Array.isArray(component)
        || !exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])) fail('SUBCIRCUIT_COMPONENT_SHAPE', [itemPath]);
    const localId = id(component.id, `${itemPath}.id`);
    if (!['led.basic-v1', 'resistor.fixed-v1'].includes(component.type)
        || !component.controls || !exactKeys(component.controls, [])) fail('SUBCIRCUIT_COMPONENT_UNSUPPORTED', [itemPath]);
    if (component.type === 'led.basic-v1') {
      if (!component.properties || !exactKeys(component.properties, ['color'])
          || !['red', 'green', 'blue', 'yellow', 'white'].includes(component.properties.color)) fail('SUBCIRCUIT_COMPONENT_PROPERTIES', [itemPath]);
    } else if (!component.properties || !exactKeys(component.properties, ['ohms'])
        || !Number.isFinite(component.properties.ohms) || component.properties.ohms < 1
        || component.properties.ohms > 10_000_000) fail('SUBCIRCUIT_COMPONENT_PROPERTIES', [itemPath]);
    return { id: localId, type: component.type, label: label(component.label, `${itemPath}.label`),
      properties: clone(component.properties), controls: {} };
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(components.map(({ id: itemId }) => itemId)).size !== 2
      || components.filter(({ type }) => type === 'led.basic-v1').length !== 1
      || components.filter(({ type }) => type === 'resistor.fixed-v1').length !== 1) fail('SUBCIRCUIT_COMPONENT_SET', [path]);
  const componentMap = new Map(components.map((component) => [component.id, component]));
  const netIds = new Set(); const usedEndpoints = new Set();
  const nets = value.nets.map((net, index) => {
    const itemPath = `${path}.nets[${index}]`;
    if (!net || typeof net !== 'object' || Array.isArray(net) || !exactKeys(net, ['id', 'endpoints'])
        || !Array.isArray(net.endpoints) || net.endpoints.length < 1 || net.endpoints.length > 2) fail('SUBCIRCUIT_NET_SHAPE', [itemPath]);
    const netId = id(net.id, `${itemPath}.id`); if (netIds.has(netId)) fail('SUBCIRCUIT_DUPLICATE_NET', [netId]); netIds.add(netId);
    const endpoints = net.endpoints.map((endpoint, endpointIndex) => {
      if (!endpoint || typeof endpoint !== 'object' || Array.isArray(endpoint)
          || !exactKeys(endpoint, ['component', 'pin']) || !componentMap.has(endpoint.component)) fail('SUBCIRCUIT_ENDPOINT', [itemPath, endpointIndex]);
      const component = componentMap.get(endpoint.component);
      const pins = component.type === 'led.basic-v1' ? ['ANODE', 'CATHODE'] : ['A', 'B'];
      if (!pins.includes(endpoint.pin)) fail('SUBCIRCUIT_ENDPOINT', [itemPath, endpointIndex]);
      const normalized = { component: endpoint.component, pin: endpoint.pin }; const key = endpointKey(normalized);
      if (usedEndpoints.has(key)) fail('SUBCIRCUIT_REUSED_ENDPOINT', [key]); usedEndpoints.add(key); return normalized;
    }).sort((a, b) => endpointKey(a).localeCompare(endpointKey(b)));
    return { id: netId, endpoints };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const led = components.find(({ type }) => type === 'led.basic-v1').id;
  const resistor = components.find(({ type }) => type === 'resistor.fixed-v1').id;
  const signature = (net) => net.endpoints.map(endpointKey).join('|');
  const expected = new Set([`${resistor}.A`, [`${resistor}.B`, `${led}.ANODE`].sort().join('|'), `${led}.CATHODE`]);
  if (new Set(nets.map(signature)).size !== 3 || nets.some((net) => !expected.has(signature(net)))) fail('SUBCIRCUIT_TOPOLOGY', [path]);
  const singletonBySignature = new Map(nets.filter((net) => net.endpoints.length === 1).map((net) => [signature(net), net.id]));
  const ports = value.ports.map((port, index) => {
    const itemPath = `${path}.ports[${index}]`;
    if (!port || typeof port !== 'object' || Array.isArray(port) || !exactKeys(port, ['id', 'netId'])) fail('SUBCIRCUIT_PORT_SHAPE', [itemPath]);
    return { id: id(port.id, `${itemPath}.id`), netId: id(port.netId, `${itemPath}.netId`) };
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (!same(ports, [{ id: 'ground', netId: singletonBySignature.get(`${led}.CATHODE`) },
    { id: 'source', netId: singletonBySignature.get(`${resistor}.A`) }])) fail('SUBCIRCUIT_PORT_MAPPING', [path]);
  return { schema: SUBCIRCUIT_DEFINITION_SCHEMA, id: definitionId,
    label: label(value.label, `${path}.label`), components, nets, ports };
}

export function normalizeSubcircuits(value, { profileId = SUBCIRCUIT_PROFILE,
  modelLibraryLock = CURRENT_MODEL_LIBRARY_LOCK } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, ['schema', 'profileId', 'modelLibrary', 'definitions', 'instances'])
      || value.schema !== SUBCIRCUITS_SCHEMA || value.profileId !== profileId
      || !same(value.modelLibrary, modelLibraryLock)
      || !Array.isArray(value.definitions) || value.definitions.length > SUBCIRCUIT_LIMITS.definitions
      || !Array.isArray(value.instances) || value.instances.length > SUBCIRCUIT_LIMITS.instances) fail('SUBCIRCUIT_OWNER_SHAPE');
  const definitions = value.definitions.map((item, index) => normalizeDefinition(item, `$definitions[${index}]`))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(definitions.map(({ id: itemId }) => itemId)).size !== definitions.length) fail('SUBCIRCUIT_DUPLICATE_DEFINITION');
  const definitionMap = new Map(definitions.map((definition) => [definition.id, definition]));
  const instanceIds = new Set();
  const instances = value.instances.map((instance, index) => {
    const path = `$instances[${index}]`;
    if (!instance || typeof instance !== 'object' || Array.isArray(instance)
        || !exactKeys(instance, ['schema', 'id', 'definitionId', 'bindings', 'x', 'y', 'collapsed'])
        || instance.schema !== SUBCIRCUIT_INSTANCE_SCHEMA || typeof instance.collapsed !== 'boolean'
        || !Array.isArray(instance.bindings)) fail('SUBCIRCUIT_INSTANCE_SHAPE', [path]);
    const instanceId = id(instance.id, `${path}.id`); if (instanceIds.has(instanceId)) fail('SUBCIRCUIT_DUPLICATE_INSTANCE', [instanceId]); instanceIds.add(instanceId);
    const definitionId = id(instance.definitionId, `${path}.definitionId`); const definition = definitionMap.get(definitionId);
    if (!definition) fail('SUBCIRCUIT_DEFINITION_MISSING', [definitionId]);
    const bindings = instance.bindings.map((binding, bindingIndex) => {
      if (!binding || typeof binding !== 'object' || Array.isArray(binding) || !exactKeys(binding, ['portId', 'netId'])) fail('SUBCIRCUIT_BINDING_SHAPE', [path, bindingIndex]);
      return { portId: id(binding.portId, `${path}.bindings[${bindingIndex}].portId`), netId: id(binding.netId, `${path}.bindings[${bindingIndex}].netId`) };
    }).sort((a, b) => a.portId.localeCompare(b.portId));
    if (!same(bindings.map(({ portId }) => portId), definition.ports.map(({ id: portId }) => portId))) fail('SUBCIRCUIT_BINDING_PORTS', [path]);
    for (const component of definition.components) generatedId(instanceId, component.id);
    for (const net of definition.nets) if (!definition.ports.some(({ netId }) => netId === net.id)) generatedId(instanceId, net.id);
    return { schema: SUBCIRCUIT_INSTANCE_SCHEMA, id: instanceId, definitionId, bindings,
      x: point(instance.x, `${path}.x`), y: point(instance.y, `${path}.y`), collapsed: instance.collapsed };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return { schema: SUBCIRCUITS_SCHEMA, profileId, modelLibrary: clone(modelLibraryLock), definitions, instances };
}

export function parseSubcircuits(source, options) {
  return normalizeSubcircuits(parseStrictJson(source, SUBCIRCUIT_LIMITS.bytes), options);
}

export function expandSubcircuits(baseGraph, value, options = {}) {
  const owner = normalizeSubcircuits(value, options);
  const graph = normalizeCircuitStructure(clone(baseGraph));
  const componentIds = new Set(graph.components.map(({ id: itemId }) => itemId));
  const netMap = new Map(graph.nets.map((net) => [net.id, net]));
  const definitionMap = new Map(owner.definitions.map((definition) => [definition.id, definition]));
  for (const instance of owner.instances) {
    const definition = definitionMap.get(instance.definitionId);
    const bindingMap = new Map(instance.bindings.map(({ portId, netId }) => [portId, netId]));
    const portNetToExternal = new Map(definition.ports.map((port) => [port.netId, bindingMap.get(port.id)]));
    for (const external of portNetToExternal.values()) if (!netMap.has(external)) fail('SUBCIRCUIT_EXTERNAL_NET_MISSING', [instance.id, external]);
    for (const component of definition.components) {
      const namespaced = generatedId(instance.id, component.id); if (componentIds.has(namespaced)) fail('SUBCIRCUIT_COMPONENT_COLLISION', [namespaced]);
      componentIds.add(namespaced); graph.components.push({ ...clone(component), id: namespaced,
        label: `${definition.label} - ${component.label}`.slice(0, 64) });
    }
    for (const net of definition.nets) {
      const endpoints = net.endpoints.map((endpoint) => ({ component: generatedId(instance.id, endpoint.component), pin: endpoint.pin }));
      const external = portNetToExternal.get(net.id);
      if (external) netMap.get(external).endpoints.push(...endpoints);
      else {
        const namespaced = generatedId(instance.id, net.id); if (netMap.has(namespaced)) fail('SUBCIRCUIT_NET_COLLISION', [namespaced]);
        const expanded = { id: namespaced, endpoints }; graph.nets.push(expanded); netMap.set(namespaced, expanded);
      }
    }
  }
  const result = validateCircuit(graph, { modelLibraryLock: owner.modelLibrary });
  if (!result.ok) fail('SUBCIRCUIT_EXPANSION_INVALID', [result.code]);
  return { owner, graph: result.graph, models: result.models };
}

export function contractSubcircuits(expandedGraph, value, options = {}) {
  const owner = normalizeSubcircuits(value, options);
  // Empty ownership is valid inert metadata over any already-validated AVR
  // project graph, including retained candidate-model projects. No X66
  // expansion exists to revalidate or contract in this case.
  if (!owner.instances.length) {
    const graph = clone(expandedGraph);
    return { owner, baseGraph: graph, graph: clone(graph) };
  }
  const graph = normalizeCircuitStructure(clone(expandedGraph));
  const definitionMap = new Map(owner.definitions.map((definition) => [definition.id, definition]));
  const generatedComponents = new Set(); const generatedNets = new Set();
  for (const instance of owner.instances) {
    const definition = definitionMap.get(instance.definitionId);
    for (const component of definition.components) generatedComponents.add(generatedId(instance.id, component.id));
    for (const net of definition.nets) if (!definition.ports.some(({ netId }) => netId === net.id)) generatedNets.add(generatedId(instance.id, net.id));
  }
  const base = { ...graph,
    components: graph.components.filter(({ id: itemId }) => !generatedComponents.has(itemId)),
    nets: graph.nets.filter(({ id: itemId }) => !generatedNets.has(itemId)).map((net) => ({ ...net,
      endpoints: net.endpoints.filter(({ component }) => !generatedComponents.has(component)) })),
    junctions: graph.junctions.filter(({ net }) => !generatedNets.has(net)),
  };
  const normalizedBase = normalizeCircuitStructure(base);
  const rebuilt = expandSubcircuits(normalizedBase, owner, options).graph;
  if (!same(rebuilt, graph)) fail('SUBCIRCUIT_EXPANSION_MISMATCH');
  return { owner, baseGraph: normalizedBase, graph: rebuilt };
}

export class BoundedSubcircuitReducer {
  #state; #past = []; #future = []; #options;
  constructor(expandedGraph, owner = emptySubcircuits(), options = {}) {
    const contracted = contractSubcircuits(expandedGraph, owner, options);
    this.#state = { owner: contracted.owner, graph: contracted.graph }; this.#options = options;
  }
  snapshot() { return clone(this.#state); }
  #replace(owner, graph, record = true) {
    const contracted = contractSubcircuits(graph, owner, this.#options);
    const next = { owner: contracted.owner, graph: contracted.graph };
    if (same(next, this.#state)) return { ok: true, changed: false, ...this.snapshot() };
    if (record) { this.#past.push(this.snapshot()); if (this.#past.length > SUBCIRCUIT_LIMITS.history) this.#past.shift(); this.#future = []; }
    this.#state = next; return { ok: true, changed: true, ...this.snapshot() };
  }
  apply(command) {
    if (!command || typeof command !== 'object' || Array.isArray(command) || typeof command.type !== 'string') fail('SUBCIRCUIT_COMMAND');
    const current = contractSubcircuits(this.#state.graph, this.#state.owner, this.#options);
    const owner = clone(current.owner);
    if (command.type === 'instance.create') {
      if (!owner.definitions.some(({ id: definitionId }) => definitionId === command.definition.id)) owner.definitions.push(clone(command.definition));
      owner.instances.push({ schema: SUBCIRCUIT_INSTANCE_SCHEMA, id: command.id, definitionId: command.definition.id,
        bindings: clone(command.bindings), x: command.x, y: command.y, collapsed: false });
    } else if (command.type === 'instance.remove') owner.instances = owner.instances.filter(({ id: instanceId }) => instanceId !== command.id);
    else if (command.type === 'instance.move' || command.type === 'instance.collapse') {
      const instance = owner.instances.find(({ id: instanceId }) => instanceId === command.id);
      if (!instance) fail('SUBCIRCUIT_INSTANCE_MISSING', [command.id]);
      if (command.type === 'instance.move') Object.assign(instance, { x: command.x, y: command.y });
      else instance.collapsed = command.collapsed;
    } else fail('SUBCIRCUIT_COMMAND');
    const normalized = normalizeSubcircuits(owner, this.#options);
    const presentationOnly = ['instance.move', 'instance.collapse'].includes(command.type);
    const graph = presentationOnly ? current.graph : expandSubcircuits(current.baseGraph, normalized, this.#options).graph;
    return this.#replace(normalized, graph);
  }
  undo() { if (!this.#past.length) return { ok: true, changed: false, ...this.snapshot() };
    this.#future.push(this.snapshot()); this.#state = this.#past.pop(); return { ok: true, changed: true, ...this.snapshot() }; }
  redo() { if (!this.#future.length) return { ok: true, changed: false, ...this.snapshot() };
    this.#past.push(this.snapshot()); this.#state = this.#future.pop(); return { ok: true, changed: true, ...this.snapshot() }; }
  history() { return { undo: this.#past.length, redo: this.#future.length }; }
}
