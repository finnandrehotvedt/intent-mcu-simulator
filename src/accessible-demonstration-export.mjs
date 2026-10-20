// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  bomNetlistValueMatchesContract, createBomNetlistExport, parseBomNetlistText,
} from './bom-netlist-export.mjs';
import { CANDIDATE_UI_COMPONENTS } from './candidate-existing-ui-adapter.mjs';
import { CIRCUIT_LIMITS, COMPONENT_CATALOG } from './component-catalog.mjs';
import {
  AVR_PROFILE, ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE,
} from './compile-targets.mjs';
import { ESP32C3_PUBLIC_COMPONENT_CATALOG } from './esp32c3-public-circuit.mjs';
import { resolveModelLibrary } from './model-library.mjs';
import { RP2040_PICO_COMPONENT_CATALOG } from './rp2040-pico-circuit.mjs';
import { RELEASE_VERSION } from './release-metadata.mjs';
import { materializeRouteFamily, routeFamilyPaths } from './route-model.mjs';
import { exactKeys, parseStrictJson } from './strict-json.mjs';
import { STM32_PUBLIC_COMPONENT_CATALOG } from './stm32-public-circuit.mjs';

export const ACCESSIBLE_DEMONSTRATION_SCHEMA = 'intent-mcu-accessible-demonstration@1';
export const ACCESSIBLE_DEMONSTRATION_REPORT_LIMIT = 512 * 1024;
export const ACCESSIBLE_DEMONSTRATION_SVG_LIMIT = 1024 * 1024;
export const ACCESSIBLE_DEMONSTRATION_PROFILES = Object.freeze([
  AVR_PROFILE, RP2040_PROFILE, ESP32C3_PROFILE, STM32F429ZI_PROFILE,
]);

const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const COLOR = /^#[0-9a-f]{6}$/u;
const FORBIDDEN_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const UNPAIRED_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;
const clone = (value) => structuredClone(value);
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const reject = (code, details = []) => { throw Object.assign(new Error(code), { code, details: clone(details) }); };
const catalogue = Object.freeze({
  ...COMPONENT_CATALOG,
  ...CANDIDATE_UI_COMPONENTS,
  ...RP2040_PICO_COMPONENT_CATALOG,
  ...ESP32C3_PUBLIC_COMPONENT_CATALOG,
  ...STM32_PUBLIC_COMPONENT_CATALOG,
});
const LIMITATIONS = Object.freeze([
  'Connectivity comes only from the validated authored graph; route geometry is presentation, not electrical authority.',
  'No current measurements means no runtime, artifact, result or verdict was inferred for this export.',
  'Project-owned models are bounded teaching models, not calibrated physical or purchasing equivalence.',
]);
const ALLOWED_ELEMENTS = new Set(['svg', 'title', 'desc', 'metadata', 'g', 'rect', 'line', 'path', 'circle', 'text', 'tspan']);
const ALLOWED_ATTRIBUTES = new Set([
  'xmlns', 'viewBox', 'role', 'aria-labelledby', 'aria-label', 'id',
  'x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r',
  'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline',
  'transform', 'opacity', 'data-schema', 'data-report-sha', 'data-kind', 'data-id',
  'data-net', 'data-endpoint',
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort(compare)
    .map((key) => [key, canonical(value[key])]));
  return value;
}

export function stableAccessibleDemonstrationStringify(value) {
  return JSON.stringify(canonical(value));
}

async function defaultSha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((part) => part.toString(16).padStart(2, '0')).join('');
}

function text(value, maximum = 320) {
  if (typeof value !== 'string') reject('ACCESSIBLE_DEMONSTRATION_TEXT');
  const normalized = value.normalize('NFC');
  if (!normalized || normalized.length > maximum || FORBIDDEN_TEXT.test(normalized)
      || UNPAIRED_SURROGATE.test(normalized)) reject('ACCESSIBLE_DEMONSTRATION_TEXT');
  return normalized;
}

function cleanNumber(value) {
  if (!Number.isFinite(value)) reject('ACCESSIBLE_DEMONSTRATION_GEOMETRY');
  const rounded = Math.round(value * 100_000) / 100_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function cleanPoint(value, extended = false) {
  if (!exactKeys(value, ['x', 'y'])) reject('ACCESSIBLE_DEMONSTRATION_GEOMETRY');
  const point = { x: cleanNumber(value.x), y: cleanNumber(value.y) };
  const minimum = extended ? -1 : 0; const maximum = extended ? 2 : 1;
  if (point.x < minimum || point.x > maximum || point.y < minimum || point.y > maximum) {
    reject('ACCESSIBLE_DEMONSTRATION_GEOMETRY');
  }
  return point;
}

function rotate(vector, degrees) {
  const radians = degrees * Math.PI / 180;
  return {
    x: vector.x * Math.cos(radians) - vector.y * Math.sin(radians),
    y: vector.x * Math.sin(radians) + vector.y * Math.cos(radians),
  };
}

function plateSize(definition) {
  const artwork = definition.artwork;
  const aspect = Math.max(0.35, Math.min(3.2, artwork.cssWidth / artwork.cssHeight));
  const board = definition.type.startsWith('board.');
  const area = board ? 0.035 : 0.012;
  return { width: Math.sqrt(area * aspect), height: Math.sqrt(area / aspect) };
}

function normalizedLayout(graph, explicitLayout) {
  const layout = explicitLayout ?? graph.layout;
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)
      || !layout.positions || typeof layout.positions !== 'object' || Array.isArray(layout.positions)) {
    reject('ACCESSIBLE_DEMONSTRATION_LAYOUT');
  }
  const componentIds = graph.components.map(({ id }) => id).sort(compare);
  if (Object.keys(layout.positions).sort(compare).join('\u0000') !== componentIds.join('\u0000')) {
    reject('ACCESSIBLE_DEMONSTRATION_LAYOUT');
  }
  const positions = {};
  for (const componentId of componentIds) {
    const value = layout.positions[componentId];
    if (!value || !['x', 'y', 'rotation'].every((key) => Object.hasOwn(value, key))
        || ![0, 90, 180, 270].includes(value.rotation)) reject('ACCESSIBLE_DEMONSTRATION_LAYOUT');
    positions[componentId] = { ...cleanPoint({ x: value.x, y: value.y }), rotation: value.rotation };
  }
  const netIds = new Set(graph.nets.map(({ id }) => id));
  const sourceStyles = layout.wireStyles ?? {};
  const sourceRoutes = layout.wireRoutes ?? {};
  if (!sourceStyles || typeof sourceStyles !== 'object' || Array.isArray(sourceStyles)
      || !sourceRoutes || typeof sourceRoutes !== 'object' || Array.isArray(sourceRoutes)
      || Object.keys(sourceStyles).some((id) => !netIds.has(id))
      || Object.keys(sourceRoutes).some((id) => !netIds.has(id))) reject('ACCESSIBLE_DEMONSTRATION_LAYOUT');
  const wireStyles = {};
  for (const net of graph.nets) {
    const candidate = sourceStyles[net.id];
    const color = typeof candidate === 'string' ? candidate : candidate?.color ?? '#39dff2';
    if (!COLOR.test(color?.toLowerCase?.() ?? '')) reject('ACCESSIBLE_DEMONSTRATION_LAYOUT');
    wireStyles[net.id] = color.toLowerCase();
  }
  return { positions, wireStyles, wireRoutes: clone(sourceRoutes) };
}

function componentGeometry(component, position) {
  const definition = catalogue[component.type];
  if (!definition || !Array.isArray(definition.pins)) reject('ACCESSIBLE_DEMONSTRATION_COMPONENT', [component.type]);
  const size = plateSize(definition);
  const pins = definition.pins.map((pin) => {
    if (!pin.anchor || !ID.test(pin.id) || typeof pin.label !== 'string') {
      reject('ACCESSIBLE_DEMONSTRATION_PIN', [component.id, pin.id]);
    }
    const local = { x: (pin.anchor.x - 0.5) * size.width, y: (pin.anchor.y - 0.5) * size.height };
    const vector = rotate(local, position.rotation);
    const pinPoint = cleanPoint({ x: position.x + vector.x, y: position.y + vector.y }, true);
    const edgeDistances = [
      ['left', pin.anchor.x], ['right', 1 - pin.anchor.x],
      ['top', pin.anchor.y], ['bottom', 1 - pin.anchor.y],
    ].sort((a, b) => a[1] - b[1]);
    const direction = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
      top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } }[edgeDistances[0][0]];
    const outward = rotate(direction, position.rotation);
    const escape = cleanPoint({ x: pinPoint.x + outward.x * 0.018,
      y: pinPoint.y + outward.y * 0.018 }, true);
    return { id: pin.id, label: text(pin.label), point: pinPoint, escape };
  }).sort((left, right) => compare(left.id, right.id));
  const rotated = position.rotation % 180 === 0 ? size : { width: size.height, height: size.width };
  return {
    definition,
    position: { x: position.x, y: position.y, rotation: position.rotation },
    plate: { width: cleanNumber(rotated.width), height: cleanNumber(rotated.height) },
    pins,
  };
}

function demonstrationProjection(report) {
  const { integrity: _integrity, ...projection } = report;
  return projection;
}

function noCurrentMeasurements(value) {
  if (!exactKeys(value, ['status', 'artifactIdentity', 'revision', 'reason', 'authority'])
      || value.status !== 'no-current-measurements' || value.artifactIdentity !== null
      || value.revision !== null || value.authority !== 'none'
      || value.reason !== 'No current source-bound runtime measurements were present when this local snapshot was created.') {
    reject('ACCESSIBLE_DEMONSTRATION_MEASUREMENTS');
  }
  return clone(value);
}

function inputMeasurements(value) {
  if (value === null || value === undefined) return noCurrentMeasurements({
    status: 'no-current-measurements', artifactIdentity: null, revision: null,
    reason: 'No current source-bound runtime measurements were present when this local snapshot was created.',
    authority: 'none',
  });
  // This zero-producer increment deliberately admits no positive runtime
  // adapter. A synthetic fixture therefore cannot create product authority.
  return noCurrentMeasurements(value);
}

function projectGeometry(graph, layout, bom) {
  const geometryById = new Map(graph.components.map((component) => [component.id,
    componentGeometry(component, layout.positions[component.id])]));
  const anchors = Object.fromEntries(graph.components.flatMap((component) => {
    const geometry = geometryById.get(component.id);
    return geometry.pins.map((pin) => [`${component.id}.${pin.id}`, { pin: pin.point, escape: pin.escape }]);
  }));
  const obstacles = graph.components.map((component) => {
    const geometry = geometryById.get(component.id);
    return { component: component.id,
      left: geometry.position.x - geometry.plate.width / 2,
      right: geometry.position.x + geometry.plate.width / 2,
      top: geometry.position.y - geometry.plate.height / 2,
      bottom: geometry.position.y + geometry.plate.height / 2 };
  });
  const bomById = new Map(bom.components.map((component) => [component.id, component]));
  const components = [...graph.components].sort((a, b) => compare(`${a.type}\u0000${a.id}`, `${b.type}\u0000${b.id}`))
    .map((component) => {
      const geometry = geometryById.get(component.id); const owner = bomById.get(component.id);
      if (!owner) reject('ACCESSIBLE_DEMONSTRATION_COMPONENT', [component.id]);
      return {
        id: component.id, type: component.type, label: text(component.label, 80),
        position: geometry.position, plate: geometry.plate,
        properties: owner.properties, model: owner.model,
        artwork: { provenance: text(geometry.definition.artwork.provenance, 240),
          license: text(geometry.definition.artwork.license, 48), renderer: 'original-generic-geometry-v1' },
        pins: geometry.pins.map(({ id, label, point }) => ({ id, label, point })),
      };
    });
  const nets = [...graph.nets].sort((a, b) => compare(a.id, b.id)).map((net) => {
    const family = materializeRouteFamily(net, layout.wireRoutes[net.id], anchors, obstacles);
    const paths = routeFamilyPaths(family, anchors).map((branch) => ({
      endpoint: `${branch.endpoint.component}.${branch.endpoint.pin}`,
      points: branch.points.map((point) => cleanPoint(point, true)),
    })).sort((a, b) => compare(a.endpoint, b.endpoint));
    const owner = bom.nets.find(({ id }) => id === net.id);
    if (!owner) reject('ACCESSIBLE_DEMONSTRATION_NET', [net.id]);
    return {
      id: net.id, color: layout.wireStyles[net.id],
      routeSource: Object.hasOwn(layout.wireRoutes, net.id) ? 'authored' : 'deterministic-default',
      endpoints: owner.endpoints.map((endpoint) => ({
        key: `${endpoint.componentId}.${endpoint.pinId}`, componentId: endpoint.componentId,
        pinId: endpoint.pinId, pinLabel: text(endpoint.pinLabel),
      })),
      paths,
    };
  });
  return { components, nets };
}

export function accessibleDemonstrationInputGuard(input) {
  return stableAccessibleDemonstrationStringify({
    productRelease: input.productRelease, profile: input.profile, projectName: input.projectName,
    graph: clone(input.graph), layout: clone(input.layout), modelLibraryLock: clone(input.modelLibraryLock),
    measurements: clone(input.measurements ?? null), generation: input.generation, revision: input.revision,
  });
}

export async function createAccessibleDemonstration(input, { sha256 = defaultSha256 } = {}) {
  // Capture every field before the first asynchronous boundary. Callers still
  // compare their live guard afterward, but external mutation cannot mix a new
  // generation, layout or measurement identity into this one snapshot.
  const captured = clone(input);
  if (!exactKeys(captured, ['productRelease', 'profile', 'projectName', 'graph', 'layout',
    'modelLibraryLock', 'measurements', 'generation', 'revision'])
      || !ACCESSIBLE_DEMONSTRATION_PROFILES.includes(captured.profile)
      || !Number.isSafeInteger(captured.generation) || captured.generation < 1
      || !Number.isSafeInteger(captured.revision) || captured.revision < 0) {
    reject('ACCESSIBLE_DEMONSTRATION_INPUT');
  }
  const graph = captured.graph;
  const layout = normalizedLayout(graph, captured.layout);
  const bomResult = await createBomNetlistExport({
    productRelease: captured.productRelease, profile: captured.profile,
    projectName: text(captured.projectName, 80), graph, modelLibraryLock: captured.modelLibraryLock, sha256,
  });
  const bom = await parseBomNetlistText(bomResult.text);
  const geometry = projectGeometry(graph, layout, bom);
  const report = {
    schema: ACCESSIBLE_DEMONSTRATION_SCHEMA,
    productRelease: bom.productRelease,
    profile: bom.profile,
    project: { name: bom.project.name, circuitSha256: bom.project.circuitSha256,
      generation: captured.generation, revision: captured.revision },
    modelLibrary: bom.modelLibrary,
    measurements: inputMeasurements(captured.measurements),
    counts: { components: geometry.components.length, pins: geometry.components.reduce((sum, item) => sum + item.pins.length, 0),
      nets: geometry.nets.length, endpoints: geometry.nets.reduce((sum, item) => sum + item.endpoints.length, 0),
      junctions: bom.junctions.length },
    components: geometry.components,
    nets: geometry.nets,
    junctions: bom.junctions,
    limitations: [...LIMITATIONS],
    integrity: { reportSha256: '' },
  };
  const projectionText = stableAccessibleDemonstrationStringify(demonstrationProjection(report));
  if (new TextEncoder().encode(projectionText).length > ACCESSIBLE_DEMONSTRATION_REPORT_LIMIT) {
    reject('ACCESSIBLE_DEMONSTRATION_REPORT_LIMIT');
  }
  report.integrity.reportSha256 = await sha256(projectionText);
  if (!HASH.test(report.integrity.reportSha256 ?? '')) reject('ACCESSIBLE_DEMONSTRATION_HASH');
  const accepted = await validateAccessibleDemonstrationReport(report, { sha256 });
  const svg = renderAccessibleDemonstrationSvg(accepted);
  if (new TextEncoder().encode(svg).length > ACCESSIBLE_DEMONSTRATION_SVG_LIMIT) {
    reject('ACCESSIBLE_DEMONSTRATION_SVG_LIMIT');
  }
  return { report: accepted, svg };
}

function validPoint(value) {
  return exactKeys(value, ['x', 'y']) && Number.isFinite(value.x) && Number.isFinite(value.y)
    && value.x >= -1 && value.x <= 2 && value.y >= -1 && value.y <= 2;
}

export async function validateAccessibleDemonstrationReport(value, { sha256 = defaultSha256 } = {}) {
  if (!exactKeys(value, ['schema', 'productRelease', 'profile', 'project', 'modelLibrary', 'measurements',
    'counts', 'components', 'nets', 'junctions', 'limitations', 'integrity'])
      || value.schema !== ACCESSIBLE_DEMONSTRATION_SCHEMA
      || value.productRelease !== RELEASE_VERSION
      || !ACCESSIBLE_DEMONSTRATION_PROFILES.includes(value.profile)
      || !exactKeys(value.project, ['name', 'circuitSha256', 'generation', 'revision'])
      || !HASH.test(value.project.circuitSha256 ?? '') || typeof value.project.name !== 'string'
      || !Number.isSafeInteger(value.project.generation) || value.project.generation < 1
      || !Number.isSafeInteger(value.project.revision) || value.project.revision < 0
      || !exactKeys(value.counts, ['components', 'pins', 'nets', 'endpoints', 'junctions'])
      || !Object.values(value.counts).every((item) => Number.isSafeInteger(item) && item >= 0)
      || value.counts.components > CIRCUIT_LIMITS.components
      || value.counts.nets > CIRCUIT_LIMITS.nets
      || value.counts.endpoints > CIRCUIT_LIMITS.endpoints
      || !Array.isArray(value.components) || !Array.isArray(value.nets) || !Array.isArray(value.junctions)
      || !resolveModelLibrary(value.modelLibrary).ok
      || !Array.isArray(value.limitations) || stableAccessibleDemonstrationStringify(value.limitations) !== stableAccessibleDemonstrationStringify(LIMITATIONS)
      || !exactKeys(value.integrity, ['reportSha256']) || !HASH.test(value.integrity.reportSha256 ?? '')) {
    reject('ACCESSIBLE_DEMONSTRATION_REPORT');
  }
  text(value.project.name, 80); noCurrentMeasurements(value.measurements);
  const resolvedModels = resolveModelLibrary(value.modelLibrary);
  if (!resolvedModels.ok) reject(resolvedModels.code, resolvedModels.details);
  const modelEntries = new Map(resolvedModels.manifest.entries
    .filter((entry) => entry.profile === value.profile)
    .map((entry) => [entry.componentType, entry]));
  const componentIds = new Set(); const pinKeys = new Set(); let pinCount = 0;
  let priorComponent = '';
  for (const component of value.components) {
    if (!exactKeys(component, ['id', 'type', 'label', 'position', 'plate', 'properties', 'model', 'artwork', 'pins'])
        || !ID.test(component.id ?? '') || componentIds.has(component.id) || !ID.test(component.type ?? '')
        || !exactKeys(component.position, ['x', 'y', 'rotation']) || !validPoint({ x: component.position.x, y: component.position.y })
        || ![0, 90, 180, 270].includes(component.position.rotation)
        || !exactKeys(component.plate, ['width', 'height']) || !Number.isFinite(component.plate.width)
        || !Number.isFinite(component.plate.height) || component.plate.width <= 0 || component.plate.height <= 0
        || !Array.isArray(component.properties) || !exactKeys(component.model, ['id', 'version', 'support', 'assumptions'])
        || !exactKeys(component.artwork, ['provenance', 'license', 'renderer'])
        || component.artwork.license !== 'Apache-2.0' || component.artwork.renderer !== 'original-generic-geometry-v1'
        || !Array.isArray(component.pins)) reject('ACCESSIBLE_DEMONSTRATION_COMPONENT');
    const componentOrder = `${component.type}\u0000${component.id}`;
    if (priorComponent && compare(priorComponent, componentOrder) >= 0) reject('ACCESSIBLE_DEMONSTRATION_ORDER');
    priorComponent = componentOrder; componentIds.add(component.id); text(component.label, 80);
    text(component.artwork.provenance, 240); text(component.artwork.license, 48);
    const definition = catalogue[component.type]; const model = modelEntries.get(component.type);
    if (!definition || !model || component.model.id !== model.modelId
        || component.model.version !== model.modelVersion
        || component.model.support !== definition.support.status
        || stableAccessibleDemonstrationStringify(component.model.assumptions)
          !== stableAccessibleDemonstrationStringify([...definition.support.limitations,
            'Project-owned teaching model; not a physical equivalence or purchasing identity.'])
        || component.artwork.provenance !== definition.artwork.provenance) {
      reject('ACCESSIBLE_DEMONSTRATION_MODEL', [component.id]);
    }
    let priorProperty = '';
    const properties = {};
    for (const property of component.properties) {
      if (!exactKeys(property, ['name', 'value', 'unit']) || typeof property.name !== 'string'
          || priorProperty && compare(priorProperty, property.name) >= 0
          || !Object.hasOwn(model.semantic.properties, property.name)
          || !bomNetlistValueMatchesContract(property.value, model.semantic.properties[property.name])
          || property.unit !== (model.semantic.properties[property.name]?.unit
            ?? definition.propertySchema[property.name]?.unit ?? null)) {
        reject('ACCESSIBLE_DEMONSTRATION_PROPERTY', [component.id]);
      }
      priorProperty = property.name;
      properties[property.name] = canonical(property.value);
    }
    if (stableAccessibleDemonstrationStringify(Object.keys(properties).sort(compare))
        !== stableAccessibleDemonstrationStringify(Object.keys(model.semantic.properties).sort(compare))) {
      reject('ACCESSIBLE_DEMONSTRATION_PROPERTY', [component.id]);
    }
    const expectedGeometry = componentGeometry({ type: component.type }, component.position);
    if (stableAccessibleDemonstrationStringify(component.plate)
          !== stableAccessibleDemonstrationStringify(expectedGeometry.plate)
        || stableAccessibleDemonstrationStringify(component.pins)
          !== stableAccessibleDemonstrationStringify(expectedGeometry.pins.map(({ id, label, point }) => ({ id, label, point })))) {
      reject('ACCESSIBLE_DEMONSTRATION_GEOMETRY', [component.id]);
    }
    let priorPin = '';
    for (const pin of component.pins) {
      if (!exactKeys(pin, ['id', 'label', 'point']) || !ID.test(pin.id ?? '') || !validPoint(pin.point)
          || priorPin && compare(priorPin, pin.id) >= 0) reject('ACCESSIBLE_DEMONSTRATION_PIN');
      priorPin = pin.id; text(pin.label); pinCount += 1; pinKeys.add(`${component.id}.${pin.id}`);
    }
  }
  const netIds = new Set(); const usedEndpoints = new Set(); let endpointCount = 0; let priorNet = '';
  for (const net of value.nets) {
    if (!exactKeys(net, ['id', 'color', 'routeSource', 'endpoints', 'paths']) || !ID.test(net.id ?? '')
        || netIds.has(net.id) || priorNet && compare(priorNet, net.id) >= 0 || !COLOR.test(net.color ?? '')
        || !['authored', 'deterministic-default'].includes(net.routeSource)
        || !Array.isArray(net.endpoints) || net.endpoints.length < 2 || !Array.isArray(net.paths)
        || net.paths.length !== net.endpoints.length) reject('ACCESSIBLE_DEMONSTRATION_NET');
    priorNet = net.id; netIds.add(net.id); let priorEndpoint = '';
    const endpointSet = new Set();
    for (const endpoint of net.endpoints) {
      if (!exactKeys(endpoint, ['key', 'componentId', 'pinId', 'pinLabel'])
          || endpoint.key !== `${endpoint.componentId}.${endpoint.pinId}` || !pinKeys.has(endpoint.key)
          || usedEndpoints.has(endpoint.key) || priorEndpoint && compare(priorEndpoint, endpoint.key) >= 0) {
        reject('ACCESSIBLE_DEMONSTRATION_ENDPOINT');
      }
      const expectedLabel = value.components.find(({ id }) => id === endpoint.componentId)?.pins
        .find(({ id }) => id === endpoint.pinId)?.label;
      if (endpoint.pinLabel !== expectedLabel) reject('ACCESSIBLE_DEMONSTRATION_ENDPOINT');
      priorEndpoint = endpoint.key; endpointSet.add(endpoint.key); usedEndpoints.add(endpoint.key);
      text(endpoint.pinLabel); endpointCount += 1;
    }
    let priorPath = '';
    for (const path of net.paths) {
      if (!exactKeys(path, ['endpoint', 'points']) || !endpointSet.has(path.endpoint)
          || priorPath && compare(priorPath, path.endpoint) >= 0 || !Array.isArray(path.points)
          || path.points.length < 2 || path.points.length > 34 || path.points.some((point) => !validPoint(point))) {
        reject('ACCESSIBLE_DEMONSTRATION_ROUTE');
      }
      priorPath = path.endpoint;
      const pinPoint = value.components.flatMap((component) => component.pins.map((pin) => ({ key: `${component.id}.${pin.id}`, point: pin.point })))
        .find(({ key }) => key === path.endpoint)?.point;
      if (!pinPoint || path.points[0].x !== pinPoint.x || path.points[0].y !== pinPoint.y) {
        reject('ACCESSIBLE_DEMONSTRATION_ROUTE_TERMINAL');
      }
    }
  }
  const junctionIds = new Set();
  for (const junction of value.junctions) {
    if (!exactKeys(junction, ['id', 'netId']) || !ID.test(junction.id ?? '') || junctionIds.has(junction.id)
        || !netIds.has(junction.netId)) reject('ACCESSIBLE_DEMONSTRATION_JUNCTION');
    junctionIds.add(junction.id);
  }
  const counts = { components: componentIds.size, pins: pinCount, nets: netIds.size,
    endpoints: endpointCount, junctions: junctionIds.size };
  if (stableAccessibleDemonstrationStringify(counts) !== stableAccessibleDemonstrationStringify(value.counts)) {
    reject('ACCESSIBLE_DEMONSTRATION_COUNTS');
  }
  const circuit = {
    components: value.components.map((component) => ({
      id: component.id, type: component.type, label: component.label,
      properties: Object.fromEntries(component.properties.map(({ name, value: propertyValue }) => [name, canonical(propertyValue)])),
    })),
    nets: value.nets.map((net) => ({ id: net.id,
      endpoints: net.endpoints.map(({ componentId, pinId }) => ({ componentId, pinId })) })),
    junctions: value.junctions.map(({ id, netId }) => ({ id, netId })),
  };
  if (await sha256(JSON.stringify(circuit)) !== value.project.circuitSha256) {
    reject('ACCESSIBLE_DEMONSTRATION_CIRCUIT_HASH');
  }
  const hash = await sha256(stableAccessibleDemonstrationStringify(demonstrationProjection(value)));
  if (hash !== value.integrity.reportSha256) reject('ACCESSIBLE_DEMONSTRATION_HASH');
  return clone(value);
}

export async function parseAccessibleDemonstrationReport(source, options = {}) {
  const value = parseStrictJson(source, ACCESSIBLE_DEMONSTRATION_REPORT_LIMIT);
  return validateAccessibleDemonstrationReport(value, options);
}

function xml(value) {
  return text(String(value), ACCESSIBLE_DEMONSTRATION_REPORT_LIMIT).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function bounds(report) {
  const points = report.components.flatMap((component) => [
    { x: component.position.x - component.plate.width / 2, y: component.position.y - component.plate.height / 2 },
    { x: component.position.x + component.plate.width / 2, y: component.position.y + component.plate.height / 2 },
    ...component.pins.map(({ point }) => point),
  ]).concat(report.nets.flatMap((net) => net.paths.flatMap(({ points: route }) => route)));
  const minimumX = Math.min(...points.map(({ x }) => x)); const maximumX = Math.max(...points.map(({ x }) => x));
  const minimumY = Math.min(...points.map(({ y }) => y)); const maximumY = Math.max(...points.map(({ y }) => y));
  const width = Math.max(0.2, maximumX - minimumX); const height = Math.max(0.2, maximumY - minimumY);
  return { minimumX, minimumY, scale: Math.min(1460 / width, 520 / height) };
}

function screen(point, fit) {
  return { x: cleanNumber(70 + (point.x - fit.minimumX) * fit.scale),
    y: cleanNumber(150 + (point.y - fit.minimumY) * fit.scale) };
}

function pathData(points, fit, yOffset = 0) {
  return points.map((point, index) => {
    const value = screen(point, fit);
    return `${index ? 'L' : 'M'} ${value.x} ${cleanNumber(value.y + yOffset)}`;
  }).join(' ');
}

function wrapSvgText(value, maximum = 110) {
  const source = text(value, ACCESSIBLE_DEMONSTRATION_REPORT_LIMIT);
  const lines = [];
  let current = '';
  for (const word of source.split(/\s+/u)) {
    if (word.length > maximum) {
      if (current) { lines.push(current); current = ''; }
      for (let index = 0; index < word.length; index += maximum) lines.push(word.slice(index, index + maximum));
    } else if (!current) current = word;
    else if (current.length + word.length + 1 <= maximum) current += ` ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : ['—'];
}

function reportRows(report) {
  const rows = [];
  const heading = (value) => rows.push({ text: value, className: 'heading' });
  const add = (value, options = {}) => wrapSvgText(value, options.maximum ?? 110)
    .forEach((line, index) => rows.push({ text: line, ...options,
      kind: index === 0 ? options.kind : null, id: index === 0 ? options.id : null }));
  heading('Connections — every connected named pin');
  for (const net of report.nets) {
    add(`${net.id} · ${net.routeSource} · ${net.color}`, { kind: 'net-label', id: net.id, strong: true });
    for (const endpoint of net.endpoints) add(`${endpoint.key} — ${endpoint.pinLabel}`,
      { kind: 'endpoint-label', id: endpoint.key, indent: true });
  }
  heading('Components, authored properties and model limits');
  for (const component of report.components) {
    add(`${component.id} — ${component.label} — ${component.type}`,
      { kind: 'component-report', id: component.id, strong: true });
    add(`Model ${component.model.id} v${component.model.version} · support ${component.model.support}`,
      { indent: true });
    add(`Position x=${component.position.x}, y=${component.position.y}, rotation=${component.position.rotation}°`,
      { indent: true });
    if (!component.properties.length) add('Authored properties: none', { indent: true });
    for (const property of component.properties) add(`Property ${property.name} = ${String(property.value)}${property.unit ? ` ${property.unit}` : ''}`,
      { indent: true, kind: 'property-report', id: `${component.id}.${property.name}` });
    for (const limitation of component.model.assumptions) add(`Limit: ${limitation}`, { indent: true });
  }
  heading('Release, model library and measurements');
  add(`Product release ${report.productRelease} · profile ${report.profile}`);
  add(`Model library ${report.modelLibrary.version} · manifest ${report.modelLibrary.manifestSha256}`);
  add(`Model implementation ${report.modelLibrary.implementationSha256}`);
  add('No current measurements', { kind: 'measurement-status', id: 'no-current-measurements', strong: true });
  add(report.measurements.reason, { indent: true });
  for (const limitation of report.limitations) add(`Boundary: ${limitation}`);
  return rows;
}

export function renderAccessibleDemonstrationSvg(report) {
  const fit = bounds(report);
  const metadata = xml(stableAccessibleDemonstrationStringify(report));
  const title = `${report.project.name} — accessible circuit demonstration`;
  const description = `${report.profile}; ${report.counts.components} components, ${report.counts.nets} nets and ${report.counts.endpoints} connected named pins. No current measurements.`;
  const titleLines = wrapSvgText(report.project.name, 62);
  const circuitY = 104 + titleLines.length * 29;
  const rowsForReport = reportRows(report);
  const reportY = circuitY + 640;
  const reportHeight = 74 + rowsForReport.reduce((sum, row) => sum + (row.className === 'heading' ? 38 : 20), 0);
  const documentHeight = reportY + reportHeight + 40;
  const rows = [];
  rows.push('<?xml version="1.0" encoding="UTF-8"?>');
  rows.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 ${documentHeight}" role="img" aria-labelledby="x70-title x70-desc" data-schema="${ACCESSIBLE_DEMONSTRATION_SCHEMA}" data-report-sha="${report.integrity.reportSha256}">`);
  rows.push(`<title id="x70-title">${xml(title)}</title><desc id="x70-desc">${xml(description)}</desc>`);
  rows.push(`<metadata id="x70-report">${metadata}</metadata>`);
  rows.push(`<rect x="0" y="0" width="1600" height="${documentHeight}" fill="#07131f"/>`);
  titleLines.forEach((line, index) => rows.push(`<text x="54" y="${55 + index * 29}" fill="#f6f1e7" font-family="system-ui, sans-serif" font-size="26" font-weight="700">${xml(line)}</text>`));
  rows.push(`<text x="54" y="${circuitY - 24}" fill="#8fe8ff" font-family="ui-monospace, monospace" font-size="16">${xml(`${report.profile} · ${report.productRelease}`)}</text>`);
  rows.push(`<rect x="40" y="${circuitY}" width="1520" height="610" rx="18" fill="#0d2131" stroke="#31536b" stroke-width="2"/>`);
  for (const net of report.nets) {
    rows.push(`<g data-kind="net" data-id="${xml(net.id)}" aria-label="${xml(`Net ${net.id}: ${net.endpoints.map(({ key }) => key).join(' to ')}`)}">`);
    for (const route of net.paths) rows.push(`<path data-net="${xml(net.id)}" data-endpoint="${xml(route.endpoint)}" d="${pathData(route.points, fit, circuitY - 115)}" fill="none" stroke="${net.color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`);
    rows.push('</g>');
  }
  for (const component of report.components) {
    const centerBase = screen(component.position, fit);
    const center = { x: centerBase.x, y: cleanNumber(centerBase.y + circuitY - 115) };
    const width = cleanNumber(component.plate.width * fit.scale);
    const height = cleanNumber(component.plate.height * fit.scale);
    rows.push(`<g data-kind="component" data-id="${xml(component.id)}" aria-label="${xml(`${component.label}, ${component.type}`)}">`);
    rows.push(`<rect x="${cleanNumber(center.x - width / 2)}" y="${cleanNumber(center.y - height / 2)}" width="${width}" height="${height}" rx="12" fill="#12384a" stroke="#53d8e8" stroke-width="3"/>`);
    const idFont = Math.max(7, Math.min(13, cleanNumber(width / Math.max(1, component.id.length * 0.68))));
    rows.push(`<text x="${center.x}" y="${center.y}" fill="#f6f1e7" font-family="ui-monospace, monospace" font-size="${idFont}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${xml(component.id)}</text>`);
    for (const pin of component.pins) {
      const key = `${component.id}.${pin.id}`;
      if (!report.nets.some((net) => net.endpoints.some((endpoint) => endpoint.key === key))) continue;
      const pointBase = screen(pin.point, fit); const point = { x: pointBase.x, y: cleanNumber(pointBase.y + circuitY - 115) };
      rows.push(`<circle data-kind="pin" data-id="${xml(key)}" cx="${point.x}" cy="${point.y}" r="7" fill="#07131f" stroke="#f6f1e7" stroke-width="3"/>`);
    }
    rows.push('</g>');
  }
  let junctionY = 0;
  for (const junction of report.junctions) {
    const net = report.nets.find(({ id }) => id === junction.netId);
    const last = net?.paths[0]?.points.at(-1); if (!last) continue;
    const pointBase = screen(last, fit); const point = { x: pointBase.x, y: cleanNumber(pointBase.y + circuitY - 115) }; junctionY += 1;
    rows.push(`<circle data-kind="junction" data-id="${xml(junction.id)}" data-net="${xml(junction.netId)}" cx="${point.x}" cy="${point.y}" r="8" fill="${net.color}" stroke="#f6f1e7" stroke-width="2"/>`);
  }
  rows.push(`<rect x="40" y="${reportY}" width="1520" height="${reportHeight}" rx="18" fill="#0d2131" stroke="#31536b" stroke-width="2"/>`);
  rows.push('<g data-kind="report" data-id="connection-table" aria-label="Readable circuit, model and measurement report">');
  let y = reportY + 42;
  for (const row of rowsForReport) {
    if (row.className === 'heading') {
      rows.push(`<text x="68" y="${y}" fill="#a8ff3f" font-family="system-ui, sans-serif" font-size="19" font-weight="700">${xml(row.text)}</text>`);
      y += 38; continue;
    }
    const attributes = `${row.kind ? ` data-kind="${row.kind}" data-id="${xml(row.id)}"` : ''}`;
    rows.push(`<text${attributes} x="${row.indent ? 88 : 68}" y="${y}" fill="${row.strong ? '#f6f1e7' : '#b7cad7'}" font-family="ui-monospace, monospace" font-size="12"${row.strong ? ' font-weight="700"' : ''}>${xml(row.text)}</text>`);
    y += 20;
  }
  rows.push('</g>');
  rows.push('</svg>');
  return `${rows.join('\n')}\n`;
}

export async function validateAccessibleDemonstrationSvg(source, { sha256 = defaultSha256, domParser = globalThis.DOMParser } = {}) {
  if (typeof source !== 'string' || new TextEncoder().encode(source).length > ACCESSIBLE_DEMONSTRATION_SVG_LIMIT
      || /<!DOCTYPE|<!ENTITY|<\s*(?:script|style|foreignObject|image|use|a)\b|\b(?:href|src|on[a-z]+)\s*=|javascript:/iu.test(source)
      || typeof domParser !== 'function') reject('ACCESSIBLE_DEMONSTRATION_SVG');
  const document = new domParser().parseFromString(source, 'image/svg+xml');
  const root = document.documentElement;
  if (!root || root.localName !== 'svg' || document.querySelector('parsererror')
      || root.getAttribute('data-schema') !== ACCESSIBLE_DEMONSTRATION_SCHEMA) {
    reject('ACCESSIBLE_DEMONSTRATION_SVG');
  }
  for (const element of document.querySelectorAll('*')) {
    if (!ALLOWED_ELEMENTS.has(element.localName)) reject('ACCESSIBLE_DEMONSTRATION_SVG_ELEMENT', [element.localName]);
    for (const attribute of element.attributes) {
      if (!ALLOWED_ATTRIBUTES.has(attribute.name) || /^on/iu.test(attribute.name)) {
        reject('ACCESSIBLE_DEMONSTRATION_SVG_ATTRIBUTE', [attribute.name]);
      }
      if (attribute.name !== 'xmlns' && /(?:https?:|data:|javascript:)/iu.test(attribute.value)) {
        reject('ACCESSIBLE_DEMONSTRATION_SVG_EXTERNAL_REFERENCE', [attribute.name]);
      }
    }
  }
  const metadata = document.querySelector('metadata#x70-report');
  if (!metadata) reject('ACCESSIBLE_DEMONSTRATION_SVG_METADATA');
  const report = await parseAccessibleDemonstrationReport(metadata.textContent, { sha256 });
  if (root.getAttribute('data-report-sha') !== report.integrity.reportSha256) {
    reject('ACCESSIBLE_DEMONSTRATION_SVG_HASH');
  }
  if (source !== renderAccessibleDemonstrationSvg(report)) {
    reject('ACCESSIBLE_DEMONSTRATION_SVG_CANONICAL');
  }
  const records = [...document.querySelectorAll('[data-kind][data-id]')].map((element) => ({
    kind: element.getAttribute('data-kind'), id: element.getAttribute('data-id'),
  }));
  const has = (kind, id) => records.some((record) => record.kind === kind && record.id === id);
  for (const component of report.components) {
    if (!has('component', component.id) || !has('component-report', component.id)) {
      reject('ACCESSIBLE_DEMONSTRATION_SVG_REFERENCE');
    }
    for (const property of component.properties) {
      if (!has('property-report', `${component.id}.${property.name}`)) {
        reject('ACCESSIBLE_DEMONSTRATION_SVG_REFERENCE');
      }
    }
  }
  for (const net of report.nets) {
    if (!has('net', net.id) || !has('net-label', net.id)) reject('ACCESSIBLE_DEMONSTRATION_SVG_REFERENCE');
    for (const endpoint of net.endpoints) {
      if (!has('pin', endpoint.key) || !has('endpoint-label', endpoint.key)) {
        reject('ACCESSIBLE_DEMONSTRATION_SVG_REFERENCE');
      }
    }
  }
  if (!has('measurement-status', 'no-current-measurements')) {
    reject('ACCESSIBLE_DEMONSTRATION_SVG_REFERENCE');
  }
  return { report, document };
}
