// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import { COMPONENT_CATALOG, LED_FORWARD_VOLTS, defaultProperties } from './component-catalog.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK, resolveModelLibrary, validateProjectModelLibrary } from './model-library.mjs';
import {
  NamedSeriesLedCircuitEditor, createSeriesLedComponentPolicy, createSeriesLedConnectionPolicy, normalizeBoundedIdCounters,
} from './named-series-led-circuit-editor.mjs';
import { normalizeStoredRoute } from './route-model.mjs';
import { emptyComponentAppearance, normalizeComponentAppearance } from './component-appearance.mjs';
import { exactKeys, parseStrictJson } from './strict-json.mjs';
import { GROUND_REFERENCE_3V3_TYPE, MOMENTARY_BUTTON_3V3_TYPE, POTENTIOMETER_3V3_TYPE, TOGGLE_SWITCH_3V3_TYPE, validateBounded3v3AuthoringGraph } from './bounded-3v3-authoring-contracts.mjs';

export const RP2040_PICO_CIRCUIT_SCHEMA = 'intent-mcu-rp2040-pico-circuit@1';
export const RP2040_PICO_PROFILE = 'board.rp2040-pico-v1';
export const RP2040_PICO_CIRCUIT_LIMIT = 128 * 1024;
export const RP2040_PICO_NOMINAL_VOLTS = 3.3;
export const RP2040_PICO_LED_CURRENT_LIMIT_AMPS = 0.012;
export const RP2040_PICO_DRAFT_STORAGE_KEY = 'intent-mcu.rp2040-pico-circuit.public.v1';
export const RP2040_PICO_PIN_MAP = Object.freeze({
  GP0: Object.freeze({ signal: 'GPIO0', physicalPin: 1, voltage: 3.3, capability: 'digital-output+pwm' }),
  GND3: Object.freeze({ signal: 'GND', physicalPin: 3, voltage: 0, capability: 'ground-reference' }),
});
export const RP2040_PICO_AUTHORING_PIN_MAP_V2 = Object.freeze({
  source: Object.freeze({ url: 'https://www.raspberrypi.com/documentation/microcontrollers/images/pico-pinout.svg', board: 'Raspberry Pi Pico' }),
  pins: Object.freeze({ GP0: { physicalPin: 1 }, GP1: { physicalPin: 2 }, GND3: { physicalPin: 3 },
    GP2: { physicalPin: 4 }, GP3: { physicalPin: 5 }, GND8: { physicalPin: 8 }, GP26: { physicalPin: 31 } }),
});

const picoPin = (id, label, role, signals, x, y, constraints) => Object.freeze({
  id, label, role, signals: Object.freeze([...signals]), capabilities: Object.freeze([...signals]),
  constraints: Object.freeze({ ...constraints }), anchor: Object.freeze({ x, y }),
});

export const RP2040_PICO_BOARD_DEFINITION = Object.freeze({
  family: 'board.rp2040-pico-profile', variant: 'authoring-multipin-runtime-gpio0-3v3',
  type: RP2040_PICO_PROFILE, version: 2,
  displayName: 'RP2040 Pico profile board', manufacturer: 'Intent Learning', partNumber: 'IL-RP2040-PICO-PROFILE',
  pins: Object.freeze([
    picoPin('GP0', 'GPIO0 · physical pin 1', 'digital-io', ['digital.output', 'pwm.output'], 8 / 132, 27 / 300,
      { voltageMin: 0, voltageMax: 3.3, physicalPin: 1 }),
    picoPin('GP1', 'GPIO1 · physical pin 2 · authoring only', 'digital-io', ['digital.output'], 8 / 132, 40 / 300,
      { voltageMin: 0, voltageMax: 3.3, physicalPin: 2, authoringOnly: true }),
    picoPin('GND3', 'GND · physical pin 3', 'ground', ['ground.reference'], 8 / 132, 53 / 300,
      { physicalPin: 3 }),
    picoPin('GP2', 'GPIO2 · physical pin 4 · authoring only', 'digital-io', ['digital.output'], 8 / 132, 66 / 300,
      { voltageMin: 0, voltageMax: 3.3, physicalPin: 4, authoringOnly: true }),
    picoPin('GP3', 'GPIO3 · physical pin 5 · authoring only', 'digital-io', ['digital.output'], 8 / 132, 79 / 300,
      { voltageMin: 0, voltageMax: 3.3, physicalPin: 5, authoringOnly: true }),
    picoPin('GND8', 'GND · physical pin 8 · authoring only', 'ground', ['ground.reference'], 8 / 132, 118 / 300,
      { physicalPin: 8, authoringOnly: true }),
    picoPin('GP26', 'GPIO26 / ADC0 · physical pin 31 · authoring only', 'analogue-input', ['analogue.input'], 124 / 132, 196 / 300,
      { voltageMin: 0, voltageMax: 3.3, physicalPin: 31, adcChannel: 0, authoringOnly: true }),
  ]),
  propertyKeys: Object.freeze([]), controlKeys: Object.freeze([]), propertySchema: Object.freeze({}),
  modelRef: 'model.rp2040-pico-gpio0-public-v1', internalTerminalGroups: Object.freeze([]), selectable: false,
  artwork: Object.freeze({
    provenance: 'Original project SVG assembled from basic geometry; no third-party simulator artwork or traced image.',
    license: 'Apache-2.0', renderer: 'board-rp2040-pico', thumbnail: 'board-rp2040-pico',
    viewBox: Object.freeze([0, 0, 132, 300]), cssWidth: 132, cssHeight: 300,
  }),
  catalog: Object.freeze({
    category: 'controllers', aliases: Object.freeze(['rp2040 pico profile', 'gpio0 physical pin 1']),
    functions: Object.freeze(['bounded source execution', 'gpio0 output']),
    interfaces: Object.freeze(['GPIO', 'PWM']), supplyVolts: Object.freeze({ min: 3.3, max: 3.3 }), package: 'development board profile',
  }),
  support: Object.freeze({
    status: 'partial',
    limitations: Object.freeze([
      'Public bounded GPIO0 output circuit subset only; no complete board or physical-hardware equivalence.',
      'GPIO25 is the onboard LED connection and is intentionally not exposed as a header anchor.',
    ]),
  }),
});

export const RP2040_PICO_COMPONENT_CATALOG = Object.freeze({
  [RP2040_PICO_PROFILE]: RP2040_PICO_BOARD_DEFINITION,
});

const ID = /^[a-z][a-z0-9-]{0,47}$/u;
const LABEL = /^[\p{L}\p{N} ._#()°Ω×+\-]{1,64}$/u;
const BOARD = RP2040_PICO_PROFILE;
const RESISTOR = 'resistor.fixed-v1';
const LED = 'led.basic-v1';
const resolveNetId = createSeriesLedConnectionPolicy({
  boardType: BOARD, sourcePin: 'GP0', groundPin: 'GND3', sourceNetId: 'net-gpio0',
  authoringSourcePins: ['GP0', 'GP1', 'GP2', 'GP3'], authoringGroundPins: ['GND3', 'GND8'],
});
const TYPE_PINS = Object.freeze({
  [BOARD]: new Set(Object.keys(RP2040_PICO_AUTHORING_PIN_MAP_V2.pins)),
  [RESISTOR]: new Set(['A', 'B']),
  [LED]: new Set(['ANODE', 'CATHODE']),
  [GROUND_REFERENCE_3V3_TYPE]: new Set(['GND']),
  [MOMENTARY_BUTTON_3V3_TYPE]: new Set(['A', 'B']),
  [TOGGLE_SWITCH_3V3_TYPE]: new Set(['A', 'B']),
  [POTENTIOMETER_3V3_TYPE]: new Set(['HIGH', 'WIPER', 'LOW']),
});
const COMPONENT_POLICY = createSeriesLedComponentPolicy({
  profile: BOARD, boardId: 'pico-1', boardLabel: 'RP2040 Pico profile',
  resistorPosition: { x: 0.48, y: 0.27, rotation: 0 },
  ledPosition: { x: 0.22, y: 0.48, rotation: 0 },
  nominalVolts: RP2040_PICO_NOMINAL_VOLTS,
  ledCurrentLimitAmps: RP2040_PICO_LED_CURRENT_LIMIT_AMPS,
  ledForwardVolts: LED_FORWARD_VOLTS,
  boardPins: Object.keys(RP2040_PICO_AUTHORING_PIN_MAP_V2.pins),
});

const clone = (value) => structuredClone(value);
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;
const failure = (code, details = {}) => ({ ok: false, code, details: clone(details), model: null });

function component(id, type, label, properties = {}) {
  return { id, type, label, properties: type === BOARD ? {} : { ...defaultProperties(type), ...properties }, controls: {} };
}

export function createRp2040PicoCircuitDraft() {
  return {
    schema: RP2040_PICO_CIRCUIT_SCHEMA,
    boardProfile: RP2040_PICO_PROFILE,
    components: [
      component('pico-1', BOARD, 'RP2040 Pico profile'),
      component('resistor-1', RESISTOR, '220 Ω series resistor', { ohms: 220 }),
      component('led-1', LED, 'External red LED', { color: 'red' }),
    ],
    nets: [
      { id: 'net-gpio0', endpoints: [{ component: 'pico-1', pin: 'GP0' }, { component: 'resistor-1', pin: 'B' }] },
      { id: 'net-series', endpoints: [{ component: 'resistor-1', pin: 'A' }, { component: 'led-1', pin: 'ANODE' }] },
      { id: 'net-ground', endpoints: [{ component: 'led-1', pin: 'CATHODE' }, { component: 'pico-1', pin: 'GND3' }] },
    ],
    layout: {
      positions: {
        'pico-1': { x: 0.78, y: 0.52, rotation: 0 },
        'resistor-1': { x: 0.48, y: 0.27, rotation: 0 },
        'led-1': { x: 0.22, y: 0.48, rotation: 0 },
      },
      wireStyles: { 'net-gpio0': '#f5c451', 'net-series': '#f04f5f', 'net-ground': '#303943' },
      wireRoutes: {},
      componentAppearance: emptyComponentAppearance(),
    },
  };
}

function normalizeComponent(value) {
  if (!exactKeys(value, ['id', 'type', 'label', 'properties', 'controls'])
      || typeof value.id !== 'string' || !ID.test(value.id)
      || !Object.hasOwn(TYPE_PINS, value.type)
      || typeof value.label !== 'string' || !LABEL.test(value.label)
      || !exactKeys(value.controls, [])) throw Object.assign(new Error('RP2040_CIRCUIT_COMPONENT_INVALID'), { code: 'RP2040_CIRCUIT_COMPONENT_INVALID' });
  if (value.type === BOARD && !exactKeys(value.properties, [])) throw Object.assign(new Error('RP2040_CIRCUIT_COMPONENT_INVALID'), { code: 'RP2040_CIRCUIT_COMPONENT_INVALID' });
  if (value.type === RESISTOR && (!exactKeys(value.properties, ['ohms']) || !Number.isFinite(value.properties.ohms)
      || value.properties.ohms < 1 || value.properties.ohms > 10_000_000)) {
    throw Object.assign(new Error('RP2040_CIRCUIT_RESISTOR_INVALID'), { code: 'RP2040_CIRCUIT_RESISTOR_INVALID' });
  }
  if (value.type === LED && (!exactKeys(value.properties, ['color']) || !Object.hasOwn(LED_FORWARD_VOLTS, value.properties.color))) {
    throw Object.assign(new Error('RP2040_CIRCUIT_LED_INVALID'), { code: 'RP2040_CIRCUIT_LED_INVALID' });
  }
  if (value.type === GROUND_REFERENCE_3V3_TYPE && !exactKeys(value.properties, [])) throw Object.assign(new Error('RP2040_CIRCUIT_COMPONENT_INVALID'), { code: 'RP2040_CIRCUIT_COMPONENT_INVALID' });
  if ([MOMENTARY_BUTTON_3V3_TYPE, TOGGLE_SWITCH_3V3_TYPE].includes(value.type)
      && (!exactKeys(value.properties, ['defaultClosed']) || typeof value.properties.defaultClosed !== 'boolean')) throw Object.assign(new Error('RP2040_CIRCUIT_COMPONENT_INVALID'), { code: 'RP2040_CIRCUIT_COMPONENT_INVALID' });
  if (value.type === POTENTIOMETER_3V3_TYPE
      && (!exactKeys(value.properties, ['ohms', 'taper']) || !Number.isFinite(value.properties.ohms)
        || value.properties.ohms < 1 || value.properties.ohms > 10_000_000 || value.properties.taper !== 'linear')) {
    throw Object.assign(new Error('RP2040_CIRCUIT_COMPONENT_INVALID'), { code: 'RP2040_CIRCUIT_COMPONENT_INVALID' });
  }
  return clone(value);
}

function normalizePosition(value) {
  if (!exactKeys(value, ['x', 'y', 'rotation']) || !Number.isFinite(value.x) || value.x < 0 || value.x > 1
      || !Number.isFinite(value.y) || value.y < 0 || value.y > 1 || ![0, 90, 180, 270].includes(value.rotation)) {
    throw Object.assign(new Error('RP2040_CIRCUIT_LAYOUT_INVALID'), { code: 'RP2040_CIRCUIT_LAYOUT_INVALID' });
  }
  return clone(value);
}

export function normalizeRp2040PicoCircuitDraft(value) {
  if (!exactKeys(value, ['schema', 'boardProfile', 'components', 'nets', 'layout'])
      || value.schema !== RP2040_PICO_CIRCUIT_SCHEMA || value.boardProfile !== RP2040_PICO_PROFILE
      || !Array.isArray(value.components) || !Array.isArray(value.nets)
      || value.components.length > 17 || value.nets.length > 24
      || !(exactKeys(value.layout, ['positions', 'wireStyles'])
        || exactKeys(value.layout, ['positions', 'wireStyles', 'wireRoutes'])
        || exactKeys(value.layout, ['positions', 'wireStyles', 'componentAppearance'])
        || exactKeys(value.layout, ['positions', 'wireStyles', 'wireRoutes', 'componentAppearance'])
        || exactKeys(value.layout, ['positions', 'wireStyles', 'idCounters'])
        || exactKeys(value.layout, ['positions', 'wireStyles', 'wireRoutes', 'idCounters'])
        || exactKeys(value.layout, ['positions', 'wireStyles', 'componentAppearance', 'idCounters'])
        || exactKeys(value.layout, ['positions', 'wireStyles', 'wireRoutes', 'componentAppearance', 'idCounters']))
      || value.layout.positions === null || Array.isArray(value.layout.positions)
      || value.layout.wireStyles === null || Array.isArray(value.layout.wireStyles)) {
    throw Object.assign(new Error('RP2040_CIRCUIT_SHAPE'), { code: 'RP2040_CIRCUIT_SHAPE' });
  }
  const components = value.components.map(normalizeComponent).sort((a, b) => a.id.localeCompare(b.id));
  const componentIds = new Set();
  for (const item of components) {
    if (componentIds.has(item.id)) throw Object.assign(new Error('RP2040_CIRCUIT_COMPONENT_INVALID'), { code: 'RP2040_CIRCUIT_COMPONENT_INVALID' });
    componentIds.add(item.id);
  }
  const positionKeys = Object.keys(value.layout.positions).sort();
  if (positionKeys.length !== componentIds.size || positionKeys.some((id) => !componentIds.has(id))) {
    throw Object.assign(new Error('RP2040_CIRCUIT_LAYOUT_INVALID'), { code: 'RP2040_CIRCUIT_LAYOUT_INVALID' });
  }
  const positions = Object.fromEntries(positionKeys.map((id) => [id, normalizePosition(value.layout.positions[id])]));
  const netIds = new Set();
  const endpoints = new Set();
  const nets = value.nets.map((net) => {
    if (!exactKeys(net, ['id', 'endpoints']) || typeof net.id !== 'string' || !ID.test(net.id)
        || netIds.has(net.id) || !Array.isArray(net.endpoints) || net.endpoints.length < 2 || net.endpoints.length > 8) {
      throw Object.assign(new Error('RP2040_CIRCUIT_NET_INVALID'), { code: 'RP2040_CIRCUIT_NET_INVALID' });
    }
    netIds.add(net.id);
    const normalizedEndpoints = net.endpoints.map((endpoint) => {
      if (!exactKeys(endpoint, ['component', 'pin']) || !componentIds.has(endpoint.component)
          || typeof endpoint.pin !== 'string') {
        throw Object.assign(new Error('RP2040_CIRCUIT_ENDPOINT_INVALID'), { code: 'RP2040_CIRCUIT_ENDPOINT_INVALID' });
      }
      const item = components.find((candidate) => candidate.id === endpoint.component);
      if (item.type === BOARD && !TYPE_PINS[BOARD].has(endpoint.pin)) {
        throw Object.assign(new Error('RP2040_PIN_UNPROVEN'), { code: 'RP2040_PIN_UNPROVEN', pin: endpoint.pin });
      }
      if (!TYPE_PINS[item.type].has(endpoint.pin)) {
        throw Object.assign(new Error('RP2040_CIRCUIT_ENDPOINT_INVALID'), { code: 'RP2040_CIRCUIT_ENDPOINT_INVALID' });
      }
      const key = endpointKey(endpoint);
      if (endpoints.has(key)) throw Object.assign(new Error('RP2040_CIRCUIT_ENDPOINT_REUSED'), { code: 'RP2040_CIRCUIT_ENDPOINT_REUSED' });
      endpoints.add(key);
      return clone(endpoint);
    }).sort((a, b) => endpointKey(a).localeCompare(endpointKey(b)));
    return { id: net.id, endpoints: normalizedEndpoints };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const wireStyleKeys = Object.keys(value.layout.wireStyles).sort();
  if (wireStyleKeys.some((id) => !netIds.has(id) || typeof value.layout.wireStyles[id] !== 'string'
      || !/^#[0-9a-f]{6}$/iu.test(value.layout.wireStyles[id]))) {
    throw Object.assign(new Error('RP2040_CIRCUIT_LAYOUT_INVALID'), { code: 'RP2040_CIRCUIT_LAYOUT_INVALID' });
  }
  const wireStyles = Object.fromEntries(wireStyleKeys.map((id) => [id, value.layout.wireStyles[id].toLowerCase()]));
  const sourceRoutes = value.layout.wireRoutes ?? {};
  if (sourceRoutes === null || Array.isArray(sourceRoutes)
      || Object.keys(sourceRoutes).some((id) => !netIds.has(id))) {
    throw Object.assign(new Error('RP2040_CIRCUIT_LAYOUT_INVALID'), { code: 'RP2040_CIRCUIT_LAYOUT_INVALID' });
  }
  const wireRoutes = {};
  for (const net of nets) {
    if (!Object.hasOwn(sourceRoutes, net.id)) continue;
    const route = normalizeStoredRoute(sourceRoutes[net.id], net);
    if (!route || Array.isArray(route)) {
      throw Object.assign(new Error('RP2040_CIRCUIT_LAYOUT_INVALID'), { code: 'RP2040_CIRCUIT_LAYOUT_INVALID' });
    }
    wireRoutes[net.id] = route;
  }
  const componentAppearance = normalizeComponentAppearance(value.layout.componentAppearance, {
    components, nets,
  });
  if (!componentAppearance) {
    throw Object.assign(new Error('RP2040_CIRCUIT_LAYOUT_INVALID'), { code: 'RP2040_CIRCUIT_LAYOUT_INVALID' });
  }
  const idCounters = normalizeBoundedIdCounters(value.layout.idCounters, components);
  const authoring = validateBounded3v3AuthoringGraph({ board: RP2040_PICO_BOARD_DEFINITION, components, nets });
  if (!authoring.ok) throw Object.assign(new Error(`RP2040_${authoring.code}`), {
    code: `RP2040_${authoring.code}`, details: authoring.details,
  });
  return { schema: RP2040_PICO_CIRCUIT_SCHEMA, boardProfile: RP2040_PICO_PROFILE, components, nets,
    layout: { positions, wireStyles, wireRoutes, componentAppearance, idCounters } };
}

function hasPair(net, left, right) {
  const keys = new Set(net.endpoints.map(endpointKey));
  return keys.has(left) && keys.has(right);
}

export function validateRp2040PicoCircuit(value, options = {}) {
  let draft;
  try { draft = normalizeRp2040PicoCircuitDraft(value); }
  catch (error) { return failure(error.code ?? 'RP2040_CIRCUIT_INVALID', { pin: error.pin ?? null }); }
  const modelLibraryLock = options.modelLibraryLock ?? CURRENT_MODEL_LIBRARY_LOCK;
  const admission = validateProjectModelLibrary(modelLibraryLock, RP2040_PICO_PROFILE, { circuit: draft });
  if (!admission.ok) return failure(admission.code, { details: admission.details });
  const resolved = resolveModelLibrary(modelLibraryLock);
  if (!resolved.ok) return failure(resolved.code, { details: resolved.details });
  const boards = draft.components.filter((item) => item.type === BOARD);
  if (boards.length !== 1) return failure('RP2040_BOARD_COUNT');
  const board = boards[0];
  const authoring = validateBounded3v3AuthoringGraph({ board: RP2040_PICO_BOARD_DEFINITION, components: draft.components, nets: draft.nets });
  if (!authoring.ok) return failure(`RP2040_${authoring.code}`, authoring.details);
  const resistor = draft.components.find((item) => item.type === RESISTOR);
  const led = draft.components.find((item) => item.type === LED);
  if (!resistor) return failure('RP2040_SERIES_RESISTOR_REQUIRED');
  if (!led) return failure('RP2040_PATH_OPEN');
  if (draft.components.length !== 3 || draft.components.filter((item) => item.type === RESISTOR).length !== 1
      || draft.components.filter((item) => item.type === LED).length !== 1
      || draft.nets.some((net) => net.endpoints.length !== 2)) return failure('RP2040_EXECUTABLE_PROJECTION_UNAVAILABLE');
  const boardGp0 = `${board.id}.GP0`;
  const boardGround = `${board.id}.GND3`;
  const ledAnode = `${led.id}.ANODE`;
  const ledCathode = `${led.id}.CATHODE`;
  const endpointSet = new Set(draft.nets.flatMap((net) => net.endpoints.map(endpointKey)));
  if (!endpointSet.has(boardGround)) return failure('RP2040_GROUND_REQUIRED');
  if (!endpointSet.has(boardGp0)) return failure('RP2040_PATH_OPEN');
  const reverse = draft.nets.some((net) => hasPair(net, boardGp0, ledCathode)
    || hasPair(net, boardGround, ledAnode)
    || net.endpoints.some((endpoint) => endpointKey(endpoint) === ledCathode)
      && net.endpoints.some((endpoint) => endpoint.component === resistor.id));
  if (reverse) return failure('RP2040_LED_REVERSE_POLARITY');
  const orientations = [['A', 'B'], ['B', 'A']];
  const accepted = orientations.find(([sourceLead, ledLead]) =>
    draft.nets.some((net) => hasPair(net, boardGp0, `${resistor.id}.${sourceLead}`))
    && draft.nets.some((net) => hasPair(net, `${resistor.id}.${ledLead}`, ledAnode))
    && draft.nets.some((net) => hasPair(net, ledCathode, boardGround)));
  if (!accepted || draft.nets.length !== 3) return failure('RP2040_PATH_OPEN');
  const ledReference = resolved.implementation.evaluateReference('led.basic-v1', {
    volts: RP2040_PICO_NOMINAL_VOLTS, color: led.properties.color,
  });
  const forwardVolts = ledReference.result?.forwardVolts;
  const resistorReference = resolved.implementation.evaluateReference('resistor.fixed-v1', {
    volts: RP2040_PICO_NOMINAL_VOLTS - forwardVolts, ohms: resistor.properties.ohms,
  });
  const peakCurrentAmps = resistorReference.result?.amps;
  if (!Number.isFinite(peakCurrentAmps) || peakCurrentAmps <= 0
      || peakCurrentAmps > RP2040_PICO_LED_CURRENT_LIMIT_AMPS) {
    return failure('RP2040_LED_OVERCURRENT', { peakCurrentAmps, limitAmps: RP2040_PICO_LED_CURRENT_LIMIT_AMPS });
  }
  return {
    ok: true,
    code: 'OK',
    draft,
    model: {
      sourcePin: 'GPIO0', sourceAnchor: 'GP0', sourcePhysicalPin: 1,
      groundAnchor: 'GND3', groundPhysicalPin: 3,
      nominalVolts: RP2040_PICO_NOMINAL_VOLTS,
      resistorId: resistor.id, resistorOhms: resistor.properties.ohms,
      ledId: led.id, ledColor: led.properties.color, forwardVolts, peakCurrentAmps,
      modelLibraryImplementationId: resolved.implementation.id,
    },
  };
}

export function observeRp2040PicoCircuit(value, runtime, options = {}) {
  const validation = validateRp2040PicoCircuit(value, options);
  if (!validation.ok || !runtime || runtime.profile !== RP2040_PICO_PROFILE
      || ['error', 'stopped-error', 'disposed', 'reset', 'ready'].includes(runtime.kind)) {
    return { active: false, on: false, instantaneousOn: false, brightness: 0, averageCurrentAmps: 0,
      peakCurrentAmps: validation.model?.peakCurrentAmps ?? 0,
      code: validation.ok ? 'RP2040_RUNTIME_INACTIVE' : validation.code };
  }
  const level = runtime.experimental?.gpio0?.mode === 'output' && runtime.experimental.gpio0.level === true;
  const duty = runtime.experimental?.pwm && Number.isFinite(runtime.experimental.pwm.dutyCycle)
    ? Math.max(0, Math.min(1, runtime.experimental.pwm.dutyCycle)) : (level ? 1 : 0);
  return {
    active: true, on: duty > 0, instantaneousOn: level, brightness: duty,
    averageCurrentAmps: validation.model.peakCurrentAmps * duty,
    peakCurrentAmps: validation.model.peakCurrentAmps,
    code: 'OK', sourcePin: validation.model.sourcePin,
  };
}

export function canonicalRp2040PicoCircuitJson(value) {
  return JSON.stringify(normalizeRp2040PicoCircuitDraft(value), null, 2);
}

export function parseRp2040PicoCircuitText(source) {
  try {
    const draft = normalizeRp2040PicoCircuitDraft(parseStrictJson(source, RP2040_PICO_CIRCUIT_LIMIT));
    return { ok: true, code: 'OK', draft, validation: validateRp2040PicoCircuit(draft) };
  } catch (error) {
    return failure(error.code ?? 'MALFORMED_JSON');
  }
}

export class Rp2040PicoCircuitEditor extends NamedSeriesLedCircuitEditor {
  constructor(draft = createRp2040PicoCircuitDraft()) {
    super({ draft, normalize: normalizeRp2040PicoCircuitDraft,
      validate: validateRp2040PicoCircuit, createDefault: createRp2040PicoCircuitDraft,
      fixedComponentType: BOARD, resolveNetId, componentPolicy: COMPONENT_POLICY, codePrefix: 'RP2040' });
  }

  openText(source) {
    const parsed = parseRp2040PicoCircuitText(source);
    if (!parsed.ok) return { ...parsed, ...this.snapshot() };
    return { ok: true, code: 'RP2040_DRAFT_OPENED', ...this.commit(parsed.draft) };
  }

  saveText() { return canonicalRp2040PicoCircuitJson(this.draft); }
}

export function rp2040PicoCircuitDependencies() {
  return [RP2040_PICO_BOARD_DEFINITION.type, COMPONENT_CATALOG[RESISTOR]?.type ?? null, COMPONENT_CATALOG[LED]?.type ?? null];
}
