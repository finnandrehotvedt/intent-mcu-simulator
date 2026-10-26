// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const ROTARY_SELECTOR_TYPE = 'switch.rotary-selector-4-v1';
export const RGB_COMMON_ANODE_TYPE = 'output.rgb-led-common-anode-v1';
export const LED_BAR_GRAPH_TYPE = 'output.led-bar-graph-10-v1';

const freeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
const pin = (id, label, role, x, y = 0.9, constraints = {}) => ({ id, label, role,
  signals: role === 'ground' ? ['ground.reference'] : ['passive'],
  capabilities: role === 'ground' ? ['ground.reference'] : ['passive'],
  constraints, anchor: { x, y } });
const artwork = (renderer, width, height) => ({ renderer, thumbnail: renderer,
  viewBox: [0, 0, width, height], cssWidth: width, cssHeight: height,
  provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
  license: 'Apache-2.0' });
const support = (limitations) => ({ status: 'partial', limitations });

export const ROTARY_SELECTOR_DEFINITION = freeze({
  family: 'input.rotary-selector', variant: 'four-position-single-pole', type: ROTARY_SELECTOR_TYPE,
  version: 1, displayName: 'Four-position rotary selector', manufacturer: 'Generic', partNumber: 'ROTARY-1P4T',
  pins: [pin('COM', 'Common wiper', 'passive', 0.5, 0.92),
    ...[1, 2, 3, 4].map((position, index) => pin(`P${position}`, `Position ${position}`, 'passive', 0.16 + index * 0.23, 0.12))],
  propertyKeys: ['positions'], propertySchema: { positions: { kind: 'integer', default: 4, minimum: 4, maximum: 4 } },
  controlKeys: ['position'], modelRef: 'model.switch-rotary-selector-1p4t-v1', internalTerminalGroups: [],
  selectable: true, artwork: artwork('switch-rotary-selector-4', 132, 112),
  catalog: { category: 'inputs', aliases: ['rotary selector', '1 pole 4 throw switch'],
    functions: ['maintained input selection'], interfaces: ['GPIO'], supplyVolts: { min: 0, max: 5 }, package: 'five-terminal 1P4T selector' },
  support: support(['Exactly one ideal COM-to-P1…P4 contact is closed.', 'No contact bounce, overlap, resistance, current rating, shaft mechanics or analogue multiplexing model.']),
});

export const RGB_COMMON_ANODE_DEFINITION = freeze({
  family: 'indicator.rgb-led', variant: 'ideal-common-anode-four-terminal', type: RGB_COMMON_ANODE_TYPE,
  version: 1, displayName: 'Common-anode RGB LED', manufacturer: 'Intent Learning', partNumber: 'IL-RGB-LED-CA-4',
  pins: [pin('R', 'Red cathode · resistor required', 'passive', 0.14, 0.92, { polarity: 'cathode', channel: 'red', requiresSeriesResistor: true }),
    pin('G', 'Green cathode · resistor required', 'passive', 0.38, 0.92, { polarity: 'cathode', channel: 'green', requiresSeriesResistor: true }),
    pin('B', 'Blue cathode · resistor required', 'passive', 0.62, 0.92, { polarity: 'cathode', channel: 'blue', requiresSeriesResistor: true }),
    pin('COM', 'Common anode · 5 V', 'passive', 0.86, 0.92, { polarity: 'anode', commonAnode: true })],
  propertyKeys: [], propertySchema: {}, controlKeys: [], modelRef: 'model.rgb-led-common-anode-ideal-v1', internalTerminalGroups: [],
  selectable: true, artwork: artwork('output-rgb-led-common-anode', 120, 100),
  catalog: { category: 'displays', aliases: ['common anode rgb led', 'active low rgb led'], functions: ['multicolour active-low PWM indicator'], interfaces: ['GPIO', 'PWM'], supplyVolts: { min: 0, max: 5 }, package: 'four-terminal common-anode indicator' },
  support: support(['R, G and B require separate external resistors and are active-low.', 'Displayed colour is a commanded relative PWM mix; no optical, thermal, tolerance or physical colour accuracy is claimed.']),
});

const barPins = [];
for (let index = 1; index <= 10; index += 1) {
  const x = (index - 0.5) / 10;
  barPins.push(pin(`A${index}`, `Segment ${index} anode · resistor required`, 'passive', x, 0.08,
    { polarity: 'anode', segment: index, requiresSeriesResistor: true }));
  barPins.push(pin(`K${index}`, `Segment ${index} cathode`, 'ground', x, 0.92,
    { polarity: 'cathode', segment: index }));
}
export const LED_BAR_GRAPH_DEFINITION = freeze({
  family: 'indicator.led-bar-graph', variant: 'ten-independent-segments', type: LED_BAR_GRAPH_TYPE,
  version: 1, displayName: 'Ten-segment LED bar graph', manufacturer: 'Intent Learning', partNumber: 'IL-BAR-10',
  pins: barPins, propertyKeys: ['color'], propertySchema: { color: { kind: 'enum', values: ['red', 'green', 'yellow'], default: 'green' } },
  controlKeys: [], modelRef: 'model.led-bar-graph-10-ideal-v1', internalTerminalGroups: [], selectable: true,
  artwork: artwork('output-led-bar-graph-10', 188, 112),
  catalog: { category: 'displays', aliases: ['led bar graph', 'ten segment bar'], functions: ['level indicator', 'ten digital outputs'], interfaces: ['GPIO', 'PWM'], supplyVolts: { min: 0, max: 5 }, package: 'twenty-terminal ten-segment indicator' },
  support: support(['Each of ten electrically independent segments requires its own current-limiting resistor and ground return.', 'No shared cathode is invented; no optical coupling, package current, thermal or multiplexing model.']),
});

export const ROTARY_SELECTOR_INDICATOR_DEFINITIONS = freeze({
  [ROTARY_SELECTOR_TYPE]: ROTARY_SELECTOR_DEFINITION,
  [RGB_COMMON_ANODE_TYPE]: RGB_COMMON_ANODE_DEFINITION,
  [LED_BAR_GRAPH_TYPE]: LED_BAR_GRAPH_DEFINITION,
});

export function createRotarySelectorIndicator(type, id) {
  if (type === ROTARY_SELECTOR_TYPE) return { id, type, label: ROTARY_SELECTOR_DEFINITION.displayName, properties: { positions: 4 }, controls: { position: 1 } };
  if (type === RGB_COMMON_ANODE_TYPE) return { id, type, label: RGB_COMMON_ANODE_DEFINITION.displayName, properties: {}, controls: {} };
  if (type === LED_BAR_GRAPH_TYPE) return { id, type, label: LED_BAR_GRAPH_DEFINITION.displayName, properties: { color: 'green' }, controls: {} };
  throw new TypeError('ROTARY_SELECTOR_INDICATOR_TYPE');
}

export function validateRotarySelectorIndicator(component) {
  if (!component || typeof component.id !== 'string' || typeof component.label !== 'string') return false;
  if (component.type === ROTARY_SELECTOR_TYPE) return component.properties?.positions === 4
    && Number.isInteger(component.controls?.position) && component.controls.position >= 1 && component.controls.position <= 4;
  if (component.type === RGB_COMMON_ANODE_TYPE) return Object.keys(component.properties ?? {}).length === 0 && Object.keys(component.controls ?? {}).length === 0;
  return component.type === LED_BAR_GRAPH_TYPE && ['red', 'green', 'yellow'].includes(component.properties?.color)
    && Object.keys(component.controls ?? {}).length === 0;
}

export function rotarySelectorContactState(component) {
  if (!validateRotarySelectorIndicator(component) || component.type !== ROTARY_SELECTOR_TYPE) throw new TypeError('ROTARY_SELECTOR_STATE');
  return Object.fromEntries([1, 2, 3, 4].map((position) => [`P${position}`, component.controls.position === position]));
}

export function commonAnodeChannelLevels(duties) {
  const normalized = Object.fromEntries(['R', 'G', 'B'].map((channel) => {
    const duty = duties?.[channel];
    if (!Number.isFinite(duty) || duty < 0 || duty > 1) throw new TypeError('RGB_COMMON_ANODE_DUTY');
    return [channel, { sinkDuty: duty, pinHighDuty: 1 - duty }];
  }));
  return normalized;
}

export function ledBarGraphLevels(levels) {
  if (!Array.isArray(levels) || levels.length !== 10 || levels.some((value) => typeof value !== 'boolean')) throw new TypeError('LED_BAR_GRAPH_LEVELS');
  return levels.map((on, index) => ({ segment: index + 1, on }));
}

const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;
const childId = (base, suffix) => `${base.slice(0, 47 - suffix.length)}-${suffix}`;
const remapGraph = (value, type, replacementsFor) => {
  const graph = structuredClone(value);
  const replacements = new Map();
  graph.components = graph.components.flatMap((component) => {
    if (component.type !== type) return [component];
    const result = replacementsFor(component);
    replacements.set(component.id, result.pinMap);
    return result.components;
  });
  graph.nets = graph.nets.map((net) => ({ ...net, endpoints: net.endpoints.flatMap((endpoint) => {
    const mapped = replacements.get(endpoint.component)?.[endpoint.pin];
    return mapped ? [mapped] : replacements.has(endpoint.component) ? [] : [endpoint];
  }) })).filter((net) => net.endpoints.length >= 2);
  const survivingNets = new Set(graph.nets.map(({ id }) => id));
  graph.junctions = graph.junctions.filter((junction) => survivingNets.has(junction.net));
  return graph;
};

export function projectRotarySelectors(value) {
  const selectors = value.components.filter(({ type }) => type === ROTARY_SELECTOR_TYPE);
  const runtimeGraph = remapGraph(value, ROTARY_SELECTOR_TYPE, (component) => {
    const selected = `P${component.controls.position}`;
    const runtimeId = component.id;
    return { components: [{ id: runtimeId, type: 'button.momentary-v1', label: component.label,
      properties: { normallyOpen: true }, controls: { pressed: true } }],
    pinMap: { COM: { component: runtimeId, pin: 'A' }, [selected]: { component: runtimeId, pin: 'B' } } };
  });
  return { ok: true, runtimeGraph, selectors: selectors.map((component) => ({ componentId: component.id,
    position: component.controls.position, activeContact: ['COM', `P${component.controls.position}`] })) };
}

export function projectCommonAnodeRgbLeds(value) {
  const outputs = value.components.filter(({ type }) => type === RGB_COMMON_ANODE_TYPE);
  const runtimePositionSources = {};
  const runtimeGraph = remapGraph(value, RGB_COMMON_ANODE_TYPE, (component) => {
    const ids = { R: component.id, G: childId(component.id, 'green'), B: childId(component.id, 'blue') };
    Object.values(ids).forEach((id) => { runtimePositionSources[id] = component.id; });
    return { components: ['R', 'G', 'B'].map((channel) => ({ id: ids[channel], type: 'led.basic-v1',
      label: `${component.label} (${channel})`, properties: { color: channel === 'R' ? 'red' : channel === 'G' ? 'green' : 'blue' }, controls: {} })),
    pinMap: { R: { component: ids.R, pin: 'CATHODE' }, G: { component: ids.G, pin: 'CATHODE' },
      B: { component: ids.B, pin: 'CATHODE' }, COM: { component: ids.R, pin: 'ANODE' } } };
  });
  for (const component of outputs) {
    const commonNet = value.nets.find((net) => net.endpoints.some((endpoint) => endpointKey(endpoint) === `${component.id}.COM`));
    if (commonNet) {
      for (const id of [childId(component.id, 'green'), childId(component.id, 'blue')]) {
        const net = runtimeGraph.nets.find(({ id: netId }) => netId === commonNet.id);
        net?.endpoints.push({ component: id, pin: 'ANODE' });
      }
    }
  }
  return { ok: true, runtimeGraph, outputs: outputs.map((component) => ({ componentId: component.id,
    commonPolarity: 'anode', activeLevel: 'LOW' })), runtimePositionSources };
}

export function projectLedBarGraphs(value) {
  const displays = value.components.filter(({ type }) => type === LED_BAR_GRAPH_TYPE);
  const runtimePositionSources = {};
  const runtimeGraph = remapGraph(value, LED_BAR_GRAPH_TYPE, (component) => {
    const components = []; const pinMap = {};
    for (let segment = 1; segment <= 10; segment += 1) {
      const id = segment === 1 ? component.id : childId(component.id, `s${segment}`);
      runtimePositionSources[id] = component.id;
      components.push({ id, type: 'led.basic-v1', label: `${component.label} ${segment}`,
        properties: { color: component.properties.color }, controls: {} });
      pinMap[`A${segment}`] = { component: id, pin: 'ANODE' };
      pinMap[`K${segment}`] = { component: id, pin: 'CATHODE' };
    }
    return { components, pinMap };
  });
  return { ok: true, runtimeGraph, displays: displays.map((component) => ({ componentId: component.id,
    segments: 10, color: component.properties.color })), runtimePositionSources };
}
