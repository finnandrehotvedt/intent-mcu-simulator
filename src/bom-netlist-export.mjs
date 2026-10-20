// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  CIRCUIT_LIMITS, COMPONENT_CATALOG,
} from './component-catalog.mjs';
import { CANDIDATE_UI_COMPONENTS } from './candidate-existing-ui-adapter.mjs';
import {
  AVR_PROFILE, ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE,
} from './compile-targets.mjs';
import { ESP32C3_PUBLIC_COMPONENT_CATALOG } from './esp32c3-public-circuit.mjs';
import {
  resolveModelLibrary, validateProjectModelLibrary,
} from './model-library.mjs';
import { RP2040_PICO_COMPONENT_CATALOG } from './rp2040-pico-circuit.mjs';
import { RELEASE_VERSION } from './release-metadata.mjs';
import { parseStrictJson } from './strict-json.mjs';
import { STM32_PUBLIC_COMPONENT_CATALOG } from './stm32-public-circuit.mjs';

export const BOM_NETLIST_SCHEMA = 'intent-mcu-bom-netlist@1';
export const BOM_NETLIST_MAX_BYTES = 256 * 1024;
export const BOM_NETLIST_PROFILES = Object.freeze([
  AVR_PROFILE, RP2040_PROFILE, ESP32C3_PROFILE, STM32F429ZI_PROFILE,
]);

const ID = /^[a-z][a-z0-9-]{0,47}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const clone = (value) => structuredClone(value);
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort(compareText)
      .map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const reject = (code, details = []) => {
  throw Object.assign(new Error(code), { code, details: clone(details) });
};
const catalogue = Object.freeze({
  ...COMPONENT_CATALOG,
  ...CANDIDATE_UI_COMPONENTS,
  ...RP2040_PICO_COMPONENT_CATALOG,
  ...ESP32C3_PUBLIC_COMPONENT_CATALOG,
  ...STM32_PUBLIC_COMPONENT_CATALOG,
});
const PROCUREMENT_LIMITATIONS = Object.freeze([
  'Not a purchase list: manufacturer, MPN, supplier, price, stock and substitutions are not provided.',
  'Authored values do not claim tolerance, power rating, package, footprint or certification.',
  'Board pin metadata applies only to the exact bounded project profile and does not prove clone or revision compatibility.',
]);
const AUTHORITY_LIMITATIONS = Object.freeze([
  'Connectivity comes only from the current validated authored graph; no route geometry or screenshot is authority.',
  'Model identities describe project-owned teaching behavior, not calibrated physical equivalence.',
  'Source, controls, firmware artifacts, runtime state, traces, verdicts and physical measurements are excluded.',
]);

function stableComponentKey(component) {
  return `${component.type}\u0000${component.id}`;
}

function stableEndpointKey(endpoint) {
  return `${endpoint.component}\u0000${endpoint.pin}`;
}

function normalizedGraph(profile, graph, modelLibraryLock) {
  if (!BOM_NETLIST_PROFILES.includes(profile)) reject('BOM_NETLIST_PROFILE_UNKNOWN', [profile]);
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)
      || !Array.isArray(graph.components) || !Array.isArray(graph.nets)) {
    reject('BOM_NETLIST_GRAPH_INVALID');
  }
  const junctionSource = graph.junctions ?? [];
  if (!Array.isArray(junctionSource)) reject('BOM_NETLIST_GRAPH_INVALID');
  const endpoints = graph.nets.reduce((total, net) =>
    total + (Array.isArray(net?.endpoints) ? net.endpoints.length : BOM_NETLIST_MAX_BYTES), 0);
  if (graph.components.length > CIRCUIT_LIMITS.components
      || graph.nets.length > CIRCUIT_LIMITS.nets
      || endpoints > CIRCUIT_LIMITS.endpoints) {
    reject('BOM_NETLIST_GRAPH_LIMIT');
  }
  if (!graph.components.length) reject('BOM_NETLIST_GRAPH_EMPTY');

  const admission = validateProjectModelLibrary(modelLibraryLock, profile, { circuit: graph });
  if (!admission.ok) reject(admission.code, admission.details);
  const resolved = resolveModelLibrary(modelLibraryLock);
  if (!resolved.ok) reject(resolved.code, resolved.details);
  const entries = new Map(resolved.manifest.entries
    .filter((entry) => entry.profile === profile)
    .map((entry) => [entry.componentType, entry]));

  const componentIds = new Set();
  const components = graph.components.map((component) => {
    if (!exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
        || typeof component.id !== 'string' || !ID.test(component.id)
        || componentIds.has(component.id) || typeof component.type !== 'string'
        || typeof component.label !== 'string' || !component.label.trim()
        || component.label.length > 64) {
      reject('BOM_NETLIST_COMPONENT_INVALID', [component?.id ?? null]);
    }
    const definition = catalogue[component.type];
    const model = entries.get(component.type);
    if (!definition || !model) reject('BOM_NETLIST_COMPONENT_UNKNOWN', [component.type]);
    componentIds.add(component.id);
    return { source: component, definition, model };
  }).sort((left, right) => compareText(stableComponentKey(left.source), stableComponentKey(right.source)));
  const byId = new Map(components.map((item) => [item.source.id, item]));

  const netIds = new Set();
  const usedEndpoints = new Set();
  const nets = graph.nets.map((net) => {
    if (!exactKeys(net, ['id', 'endpoints']) || typeof net.id !== 'string' || !ID.test(net.id)
        || netIds.has(net.id) || !Array.isArray(net.endpoints) || net.endpoints.length < 2) {
      reject('BOM_NETLIST_NET_INVALID', [net?.id ?? null]);
    }
    netIds.add(net.id);
    const normalizedEndpoints = net.endpoints.map((endpoint) => {
      if (!exactKeys(endpoint, ['component', 'pin'])
          || typeof endpoint.component !== 'string' || typeof endpoint.pin !== 'string') {
        reject('BOM_NETLIST_ENDPOINT_INVALID', [net.id]);
      }
      const component = byId.get(endpoint.component);
      const semanticPin = component?.model.semantic.pins.find((pin) => pin.id === endpoint.pin);
      const displayPin = component?.definition.pins.find((pin) => pin.id === endpoint.pin);
      if (!component || !semanticPin || !displayPin) {
        reject('BOM_NETLIST_PIN_UNKNOWN', [endpoint.component, endpoint.pin]);
      }
      const key = stableEndpointKey(endpoint);
      if (usedEndpoints.has(key)) reject('BOM_NETLIST_ENDPOINT_DUPLICATE', [endpoint.component, endpoint.pin]);
      usedEndpoints.add(key);
      const constraints = semanticPin.constraints ?? {};
      const ownsPhysicalPin = Number.isSafeInteger(constraints.physicalPin) && constraints.physicalPin > 0;
      return {
        componentId: endpoint.component,
        pinId: endpoint.pin,
        pinLabel: displayPin.label,
        physical: ownsPhysicalPin ? {
          connector: typeof constraints.connector === 'string' ? constraints.connector : null,
          pin: constraints.physicalPin,
        } : null,
      };
    }).sort((left, right) => compareText(
      `${left.componentId}\u0000${left.pinId}`, `${right.componentId}\u0000${right.pinId}`,
    ));
    return { id: net.id, endpoints: normalizedEndpoints };
  }).sort((left, right) => compareText(left.id, right.id));

  const junctionIds = new Set();
  const junctions = junctionSource.map((junction) => {
    if (!exactKeys(junction, ['id', 'net']) || typeof junction.id !== 'string' || !ID.test(junction.id)
        || junctionIds.has(junction.id) || !netIds.has(junction.net)) {
      reject('BOM_NETLIST_JUNCTION_INVALID', [junction?.id ?? null]);
    }
    junctionIds.add(junction.id);
    return { id: junction.id, netId: junction.net };
  }).sort((left, right) => compareText(left.id, right.id));

  const circuit = {
    components: components.map(({ source }) => ({
      id: source.id, type: source.type, label: source.label, properties: canonicalValue(source.properties),
    })),
    nets: nets.map((net) => ({
      id: net.id,
      endpoints: net.endpoints.map(({ componentId, pinId }) => ({ componentId, pinId })),
    })),
    junctions,
  };
  return { resolved, components, nets, junctions, circuit };
}

async function defaultSha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export async function createBomNetlistExport({
  productRelease, profile, projectName, graph, modelLibraryLock, sha256 = defaultSha256,
}) {
  if (productRelease !== RELEASE_VERSION) {
    reject('BOM_NETLIST_RELEASE_INVALID');
  }
  if (typeof projectName !== 'string' || !projectName.trim() || projectName.trim().length > 80) {
    reject('BOM_NETLIST_PROJECT_NAME_INVALID');
  }

  // Complete validation and cloning happens before the first asynchronous hash.
  // Callers can compare their captured guard after this resolves and reject a
  // stale result before creating a download.
  const accepted = normalizedGraph(profile, clone(graph), clone(modelLibraryLock));
  const circuitText = JSON.stringify(accepted.circuit);
  const circuitSha256 = await sha256(circuitText);
  if (!HASH.test(circuitSha256 ?? '')) reject('BOM_NETLIST_HASH_INVALID');

  const components = accepted.components.map(({ source, definition, model }) => ({
    id: source.id,
    type: source.type,
    label: source.label,
    componentVersion: model.componentVersion,
    properties: Object.keys(source.properties).sort(compareText).map((name) => ({
      name,
      value: canonicalValue(source.properties[name]),
      unit: model.semantic.properties[name]?.unit ?? definition.propertySchema?.[name]?.unit ?? null,
    })),
    model: {
      id: model.modelId,
      version: model.modelVersion,
      support: definition.support.status,
      assumptions: [
        ...definition.support.limitations,
        'Project-owned teaching model; not a physical equivalence or purchasing identity.',
      ],
    },
  }));
  const value = {
    schema: BOM_NETLIST_SCHEMA,
    productRelease,
    profile,
    project: { name: projectName.trim(), circuitSha256 },
    modelLibrary: clone(accepted.resolved.lock),
    limits: {
      maxComponents: CIRCUIT_LIMITS.components,
      maxNets: CIRCUIT_LIMITS.nets,
      maxEndpoints: CIRCUIT_LIMITS.endpoints,
      maxUtf8Bytes: BOM_NETLIST_MAX_BYTES,
    },
    counts: {
      components: components.length,
      nets: accepted.nets.length,
      endpoints: accepted.nets.reduce((total, net) => total + net.endpoints.length, 0),
      junctions: accepted.junctions.length,
    },
    procurement: {
      status: 'not-provided',
      limitations: [...PROCUREMENT_LIMITATIONS],
    },
    authority: {
      connectivity: 'validated-authored-graph',
      limitations: [...AUTHORITY_LIMITATIONS],
    },
    components,
    nets: accepted.nets,
    junctions: accepted.junctions,
  };
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (new TextEncoder().encode(text).byteLength > BOM_NETLIST_MAX_BYTES) {
    reject('BOM_NETLIST_OUTPUT_LIMIT');
  }
  return { value, text };
}

export function bomNetlistValueMatchesContract(value, contract) {
  if (contract.kind === 'boolean') return typeof value === 'boolean';
  if (contract.kind === 'string') return typeof value === 'string';
  if (contract.kind === 'enum') return contract.values.includes(value);
  if (contract.kind === 'integer') return Number.isInteger(value)
    && value >= contract.minimum && value <= contract.maximum;
  if (contract.kind === 'number') return Number.isFinite(value)
    && value >= contract.minimum && value <= contract.maximum;
  return false;
}

export async function parseBomNetlistText(source) {
  const bytes = new TextEncoder().encode(source ?? '').byteLength;
  if (bytes > BOM_NETLIST_MAX_BYTES) reject('BOM_NETLIST_INPUT_LIMIT');
  const value = parseStrictJson(source, BOM_NETLIST_MAX_BYTES);
  if (!exactKeys(value, ['schema', 'productRelease', 'profile', 'project', 'modelLibrary',
    'limits', 'counts', 'procurement', 'authority', 'components', 'nets', 'junctions'])
      || value.schema !== BOM_NETLIST_SCHEMA || value.productRelease !== RELEASE_VERSION
      || !BOM_NETLIST_PROFILES.includes(value.profile)
      || !exactKeys(value.project, ['name', 'circuitSha256']) || !HASH.test(value.project.circuitSha256 ?? '')
      || typeof value.project.name !== 'string' || !value.project.name || value.project.name.length > 80
      || !resolveModelLibrary(value.modelLibrary).ok
      || !exactKeys(value.limits, ['maxComponents', 'maxNets', 'maxEndpoints', 'maxUtf8Bytes'])
      || JSON.stringify(value.limits) !== JSON.stringify({
        maxComponents: CIRCUIT_LIMITS.components,
        maxNets: CIRCUIT_LIMITS.nets,
        maxEndpoints: CIRCUIT_LIMITS.endpoints,
        maxUtf8Bytes: BOM_NETLIST_MAX_BYTES,
      })
      || !exactKeys(value.counts, ['components', 'nets', 'endpoints', 'junctions'])
      || !exactKeys(value.procurement, ['status', 'limitations'])
      || value.procurement.status !== 'not-provided'
      || JSON.stringify(value.procurement.limitations) !== JSON.stringify(PROCUREMENT_LIMITATIONS)
      || !exactKeys(value.authority, ['connectivity', 'limitations'])
      || value.authority.connectivity !== 'validated-authored-graph'
      || JSON.stringify(value.authority.limitations) !== JSON.stringify(AUTHORITY_LIMITATIONS)
      || !Array.isArray(value.components) || !Array.isArray(value.nets)
      || !Array.isArray(value.junctions)) {
    reject('BOM_NETLIST_DOCUMENT_INVALID');
  }
  const resolved = resolveModelLibrary(value.modelLibrary);
  if (!resolved.ok) reject(resolved.code, resolved.details);
  const modelEntries = new Map(resolved.manifest.entries
    .filter((entry) => entry.profile === value.profile)
    .map((entry) => [entry.componentType, entry]));
  const componentIds = new Set();
  const componentOwners = new Map();
  const circuitComponents = [];
  let priorComponent = '';
  for (const component of value.components) {
    if (!exactKeys(component, ['id', 'type', 'label', 'componentVersion', 'properties', 'model'])
        || typeof component.id !== 'string' || !ID.test(component.id)
        || typeof component.type !== 'string' || typeof component.label !== 'string'
        || !Number.isSafeInteger(component.componentVersion) || component.componentVersion < 1
        || componentIds.has(component.id) || !Array.isArray(component.properties)
        || !exactKeys(component.model, ['id', 'version', 'support', 'assumptions'])
        || typeof component.model.id !== 'string'
        || !Number.isSafeInteger(component.model.version) || component.model.version < 1
        || typeof component.model.support !== 'string' || !Array.isArray(component.model.assumptions)
        || component.model.assumptions.some((item) => typeof item !== 'string')) {
      reject('BOM_NETLIST_DOCUMENT_COMPONENT');
    }
    const key = stableComponentKey(component);
    if (compareText(key, priorComponent) <= 0 && priorComponent) reject('BOM_NETLIST_DOCUMENT_ORDER');
    priorComponent = key;
    componentIds.add(component.id);
    const definition = catalogue[component.type];
    const model = modelEntries.get(component.type);
    if (!definition || !model
        || component.componentVersion !== model.componentVersion
        || component.model.id !== model.modelId || component.model.version !== model.modelVersion
        || component.model.support !== definition.support.status
        || JSON.stringify(component.model.assumptions) !== JSON.stringify([
          ...definition.support.limitations,
          'Project-owned teaching model; not a physical equivalence or purchasing identity.',
        ])) {
      reject('BOM_NETLIST_DOCUMENT_MODEL', [component.id, component.type]);
    }
    componentOwners.set(component.id, { definition, model });
    let priorProperty = '';
    const properties = {};
    for (const property of component.properties) {
      if (!exactKeys(property, ['name', 'value', 'unit']) || typeof property.name !== 'string'
          || compareText(property.name, priorProperty) <= 0 && priorProperty
          || !(property.unit === null || typeof property.unit === 'string')) {
        reject('BOM_NETLIST_DOCUMENT_PROPERTY');
      }
      const contract = model.semantic.properties[property.name];
      const expectedUnit = contract?.unit ?? definition.propertySchema?.[property.name]?.unit ?? null;
      if (!contract || !bomNetlistValueMatchesContract(property.value, contract) || property.unit !== expectedUnit) {
        reject('BOM_NETLIST_DOCUMENT_PROPERTY', [component.id, property.name]);
      }
      priorProperty = property.name;
      properties[property.name] = canonicalValue(property.value);
    }
    if (JSON.stringify(Object.keys(properties).sort(compareText))
        !== JSON.stringify(Object.keys(model.semantic.properties).sort(compareText))) {
      reject('BOM_NETLIST_DOCUMENT_PROPERTY', [component.id]);
    }
    circuitComponents.push({
      id: component.id, type: component.type, label: component.label, properties,
    });
  }
  const netIds = new Set();
  const usedEndpoints = new Set();
  let endpointCount = 0;
  let priorNet = '';
  for (const net of value.nets) {
    if (!exactKeys(net, ['id', 'endpoints']) || typeof net.id !== 'string' || !ID.test(net.id)
        || netIds.has(net.id) || compareText(net.id, priorNet) <= 0 && priorNet
        || !Array.isArray(net.endpoints) || net.endpoints.length < 2) {
      reject('BOM_NETLIST_DOCUMENT_NET');
    }
    priorNet = net.id;
    netIds.add(net.id);
    let priorEndpoint = '';
    for (const endpoint of net.endpoints) {
      const owner = componentOwners.get(endpoint.componentId);
      const semanticPin = owner?.model.semantic.pins.find((pin) => pin.id === endpoint.pinId);
      const displayPin = owner?.definition.pins.find((pin) => pin.id === endpoint.pinId);
      const constraints = semanticPin?.constraints ?? {};
      const expectedPhysical = Number.isSafeInteger(constraints.physicalPin) && constraints.physicalPin > 0
        ? { connector: typeof constraints.connector === 'string' ? constraints.connector : null,
          pin: constraints.physicalPin }
        : null;
      if (!exactKeys(endpoint, ['componentId', 'pinId', 'pinLabel', 'physical'])
          || !componentIds.has(endpoint.componentId) || typeof endpoint.pinId !== 'string'
          || !semanticPin || !displayPin || endpoint.pinLabel !== displayPin.label
          || JSON.stringify(endpoint.physical) !== JSON.stringify(expectedPhysical)) {
        reject('BOM_NETLIST_DOCUMENT_ENDPOINT');
      }
      const key = `${endpoint.componentId}\u0000${endpoint.pinId}`;
      if (usedEndpoints.has(key) || compareText(key, priorEndpoint) <= 0 && priorEndpoint) {
        reject('BOM_NETLIST_DOCUMENT_ENDPOINT');
      }
      priorEndpoint = key;
      usedEndpoints.add(key);
      endpointCount += 1;
    }
  }
  const junctionIds = new Set();
  let priorJunction = '';
  for (const junction of value.junctions) {
    if (!exactKeys(junction, ['id', 'netId']) || typeof junction.id !== 'string' || !ID.test(junction.id)
        || junctionIds.has(junction.id) || !netIds.has(junction.netId)
        || compareText(junction.id, priorJunction) <= 0 && priorJunction) {
      reject('BOM_NETLIST_DOCUMENT_JUNCTION');
    }
    priorJunction = junction.id;
    junctionIds.add(junction.id);
  }
  const counts = {
    components: value.components.length,
    nets: value.nets.length,
    endpoints: endpointCount,
    junctions: value.junctions.length,
  };
  if (JSON.stringify(value.counts) !== JSON.stringify(counts)
      || counts.components > CIRCUIT_LIMITS.components || counts.nets > CIRCUIT_LIMITS.nets
      || counts.endpoints > CIRCUIT_LIMITS.endpoints) {
    reject('BOM_NETLIST_DOCUMENT_COUNTS');
  }
  const circuit = {
    components: circuitComponents,
    nets: value.nets.map((net) => ({
      id: net.id,
      endpoints: net.endpoints.map(({ componentId, pinId }) => ({ componentId, pinId })),
    })),
    junctions: value.junctions.map(({ id, netId }) => ({ id, netId })),
  };
  if (await defaultSha256(JSON.stringify(circuit)) !== value.project.circuitSha256) {
    reject('BOM_NETLIST_DOCUMENT_HASH');
  }
  return clone(value);
}

export function bomNetlistInputGuard({ profile, projectName, graph, modelLibraryLock }) {
  return JSON.stringify({
    profile,
    projectName,
    graph: clone(graph),
    modelLibraryLock: clone(modelLibraryLock),
  });
}
