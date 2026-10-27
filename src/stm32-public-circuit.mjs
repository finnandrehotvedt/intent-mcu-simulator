// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { LED_FORWARD_VOLTS, defaultProperties } from './component-catalog.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK, resolveModelLibrary, validateProjectModelLibrary } from './model-library.mjs';
import {
  NamedSeriesLedCircuitEditor, createSeriesLedComponentPolicy, createSeriesLedConnectionPolicy, normalizeBoundedIdCounters,
} from './named-series-led-circuit-editor.mjs';
import { normalizeStoredRoute } from './route-model.mjs';
import { emptyComponentAppearance, normalizeComponentAppearance } from './component-appearance.mjs';
import { exactKeys } from './strict-json.mjs';
import { GROUND_REFERENCE_3V3_TYPE, MOMENTARY_BUTTON_3V3_TYPE, POTENTIOMETER_3V3_TYPE, TOGGLE_SWITCH_3V3_TYPE, validateBounded3v3AuthoringGraph } from './bounded-3v3-authoring-contracts.mjs';
import { PASSIVE_ENERGY_STORAGE_DEFINITIONS,
  validatePassiveEnergyStorageComponent } from '../expansion-drafts/passive-energy-storage-components-v1.mjs';
import { DIODE_COMPONENT_DEFINITIONS,
  validateDiodeComponent } from '../expansion-drafts/diode-components-v1.mjs';

export const STM32_PUBLIC_CIRCUIT_SCHEMA = 'intent-mcu-stm32-public-circuit@1';
export const STM32_PUBLIC_PROFILE = 'board.stm32f429zi-nucleo144-v1';
export const STM32_NOMINAL_VOLTS = 3.3;
export const STM32_LED_CURRENT_LIMIT_AMPS = 0.012;
export const STM32_PIN_MAP = Object.freeze({
  PB0: Object.freeze({ signal: 'PB0', connector: 'CN11', physicalPin: 34,
    voltage: 3.3, capability: 'digital-output' }),
  GND: Object.freeze({ signal: 'GND', connector: 'CN11', physicalPin: 19,
    voltage: 0, capability: 'ground-reference' }),
});
export const STM32_AUTHORING_PIN_MAP_V2 = Object.freeze({
  source: Object.freeze({ url: 'https://www.st.com/resource/en/user_manual/dm00244518-stm32-nucleo-144-boards-mb1137-stmicroelectronics.pdf',
    document: 'UM1974', revision: 'Rev 11, August 2025', table: 'Table 21, page 70' }),
  migration: Object.freeze({ logicalPin: 'GND', fromClaim: 'CN11-35', to: 'CN11-19', reason: 'CN11-35 is PC2.' }),
  pins: Object.freeze({ PB0: { connector: 'CN11', physicalPin: 34 }, PB1: { connector: 'CN12', physicalPin: 24 },
    PB7: { connector: 'CN11', physicalPin: 21 }, GND: { connector: 'CN11', physicalPin: 19 },
    GND20: { connector: 'CN11', physicalPin: 20 }, GND8: { connector: 'CN11', physicalPin: 8 } }),
});

const boardPin = (id, label, role, signals, x, y, constraints) => Object.freeze({
  id, label, role, signals: Object.freeze([...signals]), capabilities: Object.freeze([...signals]),
  constraints: Object.freeze({ ...constraints }), anchor: Object.freeze({ x, y }),
});

export const STM32_BOARD_DEFINITION = Object.freeze({
  family: 'board.stm32f429zi-learning-profile', variant: 'authoring-multipin-runtime-pb0-3v3',
  type: STM32_PUBLIC_PROFILE, version: 2,
  displayName: 'STM32F429ZI learning profile board', manufacturer: 'Intent Learning',
  partNumber: 'IL-STM32F429ZI-PB0-PROFILE',
  pins: Object.freeze([
    boardPin('PB0', 'PB0 / ADC1_IN8 · CN11 pin 34', 'digital-io', ['digital.output', 'analogue.input'], 0.96, 0.31,
      { voltageMin: 0, voltageMax: 3.3, connector: 'CN11', physicalPin: 34, adcChannel: 8 }),
    boardPin('PB1', 'PB1 · CN12 pin 24 · authoring only', 'digital-io', ['digital.output'], 0.04, 0.42,
      { voltageMin: 0, voltageMax: 3.3, connector: 'CN12', physicalPin: 24, authoringOnly: true }),
    boardPin('PB7', 'PB7 · CN11 pin 21 · authoring only', 'digital-io', ['digital.output'], 0.96, 0.52,
      { voltageMin: 0, voltageMax: 3.3, connector: 'CN11', physicalPin: 21, authoringOnly: true }),
    boardPin('GND', 'GND · CN11 pin 19 · corrected metadata', 'ground', ['ground.reference'], 0.96, 0.72,
      { connector: 'CN11', physicalPin: 19, migratedFromIncorrectClaim: 'CN11-35' }),
    boardPin('GND20', 'GND · CN11 pin 20 · authoring only', 'ground', ['ground.reference'], 0.96, 0.62,
      { connector: 'CN11', physicalPin: 20, authoringOnly: true }),
    boardPin('GND8', 'GND · CN11 pin 8 · authoring only', 'ground', ['ground.reference'], 0.04, 0.72,
      { connector: 'CN11', physicalPin: 8, authoringOnly: true }),
  ]),
  propertyKeys: Object.freeze([]), controlKeys: Object.freeze([]), propertySchema: Object.freeze({}),
  modelRef: 'model.stm32f429zi-pb0-renode-observation-v1', internalTerminalGroups: Object.freeze([]),
  selectable: false,
  artwork: Object.freeze({
    provenance: 'Original project SVG assembled from basic geometry; no third-party simulator artwork or traced image.',
    license: 'Apache-2.0', renderer: 'board-stm32f429zi-profile', thumbnail: 'board-stm32f429zi-profile',
    viewBox: Object.freeze([0, 0, 190, 230]), cssWidth: 190, cssHeight: 230,
  }),
  catalog: Object.freeze({
    category: 'controllers', aliases: Object.freeze(['stm32f429zi learning profile', 'pb0 cn11 pin 34']),
    functions: Object.freeze(['bounded source execution', 'actual Renode PB0 observation']),
    interfaces: Object.freeze(['GPIO', 'UART']), supplyVolts: Object.freeze({ min: 3.3, max: 3.3 }),
    package: 'development board profile',
  }),
  support: Object.freeze({
    status: 'partial',
    limitations: Object.freeze([
      'Public bounded PB0 and USART3 subset only; no complete board or physical-hardware equivalence.',
      'The external resistor and LED are an ideal teaching circuit driven by actual Renode-observed PB0.',
    ]),
  }),
});

export const STM32_PUBLIC_COMPONENT_CATALOG = Object.freeze({
  [STM32_PUBLIC_PROFILE]: STM32_BOARD_DEFINITION,
});

const ID = /^[a-z][a-z0-9-]{0,47}$/u;
const LABEL = /^[\p{L}\p{N} ._#()°Ω×+\-]{1,64}$/u;
const BOARD = STM32_PUBLIC_PROFILE;
const RESISTOR = 'resistor.fixed-v1';
const LED = 'led.basic-v1';
const resolveNetId = createSeriesLedConnectionPolicy({
  boardType: BOARD, sourcePin: 'PB0', groundPin: 'GND', sourceNetId: 'net-pb0',
  authoringSourcePins: ['PB0', 'PB1', 'PB7'], authoringGroundPins: ['GND', 'GND20', 'GND8'],
});
const TYPE_PINS = Object.freeze({
  [BOARD]: new Set(Object.keys(STM32_AUTHORING_PIN_MAP_V2.pins)),
  [RESISTOR]: new Set(['A', 'B']),
  [LED]: new Set(['ANODE', 'CATHODE']),
  [GROUND_REFERENCE_3V3_TYPE]: new Set(['GND']),
  [MOMENTARY_BUTTON_3V3_TYPE]: new Set(['A', 'B']),
  [TOGGLE_SWITCH_3V3_TYPE]: new Set(['A', 'B']),
  [POTENTIOMETER_3V3_TYPE]: new Set(['HIGH', 'WIPER', 'LOW']),
  ...Object.fromEntries(Object.values(PASSIVE_ENERGY_STORAGE_DEFINITIONS)
    .map((definition) => [definition.type, new Set(definition.pins.map(({ id }) => id))])),
  ...Object.fromEntries(Object.values(DIODE_COMPONENT_DEFINITIONS)
    .map((definition) => [definition.type, new Set(definition.pins.map(({ id }) => id))])),
});
const COMPONENT_POLICY = createSeriesLedComponentPolicy({
  profile: BOARD, boardId: 'stm32-1', boardLabel: 'STM32F429ZI PB0 profile',
  resistorPosition: { x: 0.57, y: 0.27, rotation: 0 },
  ledPosition: { x: 0.82, y: 0.48, rotation: 0 },
  nominalVolts: STM32_NOMINAL_VOLTS,
  ledCurrentLimitAmps: STM32_LED_CURRENT_LIMIT_AMPS,
  ledForwardVolts: LED_FORWARD_VOLTS,
  boardPins: Object.keys(STM32_AUTHORING_PIN_MAP_V2.pins),
});
const clone = (value) => structuredClone(value);
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;
const failure = (code, details = {}) => ({ ok: false, code, details: clone(details), model: null });

function component(id, type, label, properties = {}) {
  return { id, type, label, properties: type === BOARD ? {} : { ...defaultProperties(type), ...properties }, controls: {} };
}

export function createStm32CircuitDraft() {
  return {
    schema: STM32_PUBLIC_CIRCUIT_SCHEMA,
    boardProfile: STM32_PUBLIC_PROFILE,
    components: [
      component('stm32-1', BOARD, 'STM32F429ZI PB0 profile'),
      component('resistor-1', RESISTOR, '220 Ω series resistor', { ohms: 220 }),
      component('led-1', LED, 'External red LED', { color: 'red' }),
    ],
    nets: [
      { id: 'net-pb0', endpoints: [{ component: 'stm32-1', pin: 'PB0' }, { component: 'resistor-1', pin: 'A' }] },
      { id: 'net-series', endpoints: [{ component: 'resistor-1', pin: 'B' }, { component: 'led-1', pin: 'ANODE' }] },
      { id: 'net-ground', endpoints: [{ component: 'led-1', pin: 'CATHODE' }, { component: 'stm32-1', pin: 'GND' }] },
    ],
    layout: {
      positions: {
        'stm32-1': { x: 0.2, y: 0.52, rotation: 0 },
        'resistor-1': { x: 0.57, y: 0.27, rotation: 0 },
        'led-1': { x: 0.82, y: 0.48, rotation: 0 },
      },
      wireStyles: { 'net-pb0': '#e2ab1b', 'net-series': '#e13e51', 'net-ground': '#202a34' },
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
      || !exactKeys(value.controls, [])) {
    throw Object.assign(new Error('STM32_CIRCUIT_COMPONENT_INVALID'), { code: 'STM32_CIRCUIT_COMPONENT_INVALID' });
  }
  if (value.type === BOARD && !exactKeys(value.properties, [])) {
    throw Object.assign(new Error('STM32_CIRCUIT_COMPONENT_INVALID'), { code: 'STM32_CIRCUIT_COMPONENT_INVALID' });
  }
  if (value.type === RESISTOR && (!exactKeys(value.properties, ['ohms']) || !Number.isFinite(value.properties.ohms)
      || value.properties.ohms < 1 || value.properties.ohms > 10_000_000)) {
    throw Object.assign(new Error('STM32_CIRCUIT_RESISTOR_INVALID'), { code: 'STM32_CIRCUIT_RESISTOR_INVALID' });
  }
  if (value.type === LED && (!exactKeys(value.properties, ['color']) || !Object.hasOwn(LED_FORWARD_VOLTS, value.properties.color))) {
    throw Object.assign(new Error('STM32_CIRCUIT_LED_INVALID'), { code: 'STM32_CIRCUIT_LED_INVALID' });
  }
  if (value.type === GROUND_REFERENCE_3V3_TYPE && !exactKeys(value.properties, [])) throw Object.assign(new Error('STM32_CIRCUIT_COMPONENT_INVALID'), { code: 'STM32_CIRCUIT_COMPONENT_INVALID' });
  if ([MOMENTARY_BUTTON_3V3_TYPE, TOGGLE_SWITCH_3V3_TYPE].includes(value.type)
      && (!exactKeys(value.properties, ['defaultClosed']) || typeof value.properties.defaultClosed !== 'boolean')) throw Object.assign(new Error('STM32_CIRCUIT_COMPONENT_INVALID'), { code: 'STM32_CIRCUIT_COMPONENT_INVALID' });
  if (value.type === POTENTIOMETER_3V3_TYPE
      && (!exactKeys(value.properties, ['ohms', 'taper']) || !Number.isFinite(value.properties.ohms)
        || value.properties.ohms < 1 || value.properties.ohms > 10_000_000 || value.properties.taper !== 'linear')) {
    throw Object.assign(new Error('STM32_CIRCUIT_COMPONENT_INVALID'), { code: 'STM32_CIRCUIT_COMPONENT_INVALID' });
  }
  if (PASSIVE_ENERGY_STORAGE_DEFINITIONS[value.type]
      && !validatePassiveEnergyStorageComponent(value)) {
    throw Object.assign(new Error('STM32_CIRCUIT_COMPONENT_INVALID'), { code: 'STM32_CIRCUIT_COMPONENT_INVALID' });
  }
  if (DIODE_COMPONENT_DEFINITIONS[value.type] && !validateDiodeComponent(value)) {
    throw Object.assign(new Error('STM32_CIRCUIT_COMPONENT_INVALID'), { code: 'STM32_CIRCUIT_COMPONENT_INVALID' });
  }
  return clone(value);
}

function normalizePosition(value) {
  if (!exactKeys(value, ['x', 'y', 'rotation']) || !Number.isFinite(value.x) || value.x < 0 || value.x > 1
      || !Number.isFinite(value.y) || value.y < 0 || value.y > 1 || ![0, 90, 180, 270].includes(value.rotation)) {
    throw Object.assign(new Error('STM32_CIRCUIT_LAYOUT_INVALID'), { code: 'STM32_CIRCUIT_LAYOUT_INVALID' });
  }
  return clone(value);
}

export function normalizeStm32CircuitDraft(value) {
  if (!exactKeys(value, ['schema', 'boardProfile', 'components', 'nets', 'layout'])
      || value.schema !== STM32_PUBLIC_CIRCUIT_SCHEMA || value.boardProfile !== STM32_PUBLIC_PROFILE
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
    throw Object.assign(new Error('STM32_CIRCUIT_SHAPE'), { code: 'STM32_CIRCUIT_SHAPE' });
  }
  const components = value.components.map(normalizeComponent).sort((a, b) => a.id.localeCompare(b.id));
  const componentIds = new Set();
  for (const item of components) {
    if (componentIds.has(item.id)) {
      throw Object.assign(new Error('STM32_CIRCUIT_COMPONENT_INVALID'), { code: 'STM32_CIRCUIT_COMPONENT_INVALID' });
    }
    componentIds.add(item.id);
  }
  const positionKeys = Object.keys(value.layout.positions).sort();
  if (positionKeys.length !== componentIds.size || positionKeys.some((id) => !componentIds.has(id))) {
    throw Object.assign(new Error('STM32_CIRCUIT_LAYOUT_INVALID'), { code: 'STM32_CIRCUIT_LAYOUT_INVALID' });
  }
  const positions = Object.fromEntries(positionKeys.map((id) => [id, normalizePosition(value.layout.positions[id])]));
  const netIds = new Set();
  const endpoints = new Set();
  const nets = value.nets.map((net) => {
    if (!exactKeys(net, ['id', 'endpoints']) || typeof net.id !== 'string' || !ID.test(net.id)
        || netIds.has(net.id) || !Array.isArray(net.endpoints) || net.endpoints.length < 2 || net.endpoints.length > 8) {
      throw Object.assign(new Error('STM32_CIRCUIT_NET_INVALID'), { code: 'STM32_CIRCUIT_NET_INVALID' });
    }
    netIds.add(net.id);
    const normalizedEndpoints = net.endpoints.map((endpoint) => {
      if (!exactKeys(endpoint, ['component', 'pin']) || !componentIds.has(endpoint.component)
          || typeof endpoint.pin !== 'string') {
        throw Object.assign(new Error('STM32_CIRCUIT_ENDPOINT_INVALID'), { code: 'STM32_CIRCUIT_ENDPOINT_INVALID' });
      }
      const item = components.find((candidate) => candidate.id === endpoint.component);
      if (item.type === BOARD && !TYPE_PINS[BOARD].has(endpoint.pin)) {
        throw Object.assign(new Error('STM32_PIN_UNPROVEN'), { code: 'STM32_PIN_UNPROVEN', pin: endpoint.pin });
      }
      if (!TYPE_PINS[item.type].has(endpoint.pin)) {
        throw Object.assign(new Error('STM32_CIRCUIT_ENDPOINT_INVALID'), { code: 'STM32_CIRCUIT_ENDPOINT_INVALID' });
      }
      const key = endpointKey(endpoint);
      if (endpoints.has(key)) {
        throw Object.assign(new Error('STM32_CIRCUIT_ENDPOINT_REUSED'), { code: 'STM32_CIRCUIT_ENDPOINT_REUSED' });
      }
      endpoints.add(key);
      return clone(endpoint);
    }).sort((a, b) => endpointKey(a).localeCompare(endpointKey(b)));
    return { id: net.id, endpoints: normalizedEndpoints };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const wireStyleKeys = Object.keys(value.layout.wireStyles).sort();
  if (wireStyleKeys.some((id) => !netIds.has(id) || typeof value.layout.wireStyles[id] !== 'string'
      || !/^#[0-9a-f]{6}$/iu.test(value.layout.wireStyles[id]))) {
    throw Object.assign(new Error('STM32_CIRCUIT_LAYOUT_INVALID'), { code: 'STM32_CIRCUIT_LAYOUT_INVALID' });
  }
  const wireStyles = Object.fromEntries(wireStyleKeys.map((id) => [id, value.layout.wireStyles[id].toLowerCase()]));
  const sourceRoutes = value.layout.wireRoutes ?? {};
  if (sourceRoutes === null || Array.isArray(sourceRoutes)
      || Object.keys(sourceRoutes).some((id) => !netIds.has(id))) {
    throw Object.assign(new Error('STM32_CIRCUIT_LAYOUT_INVALID'), { code: 'STM32_CIRCUIT_LAYOUT_INVALID' });
  }
  const wireRoutes = {};
  for (const net of nets) {
    if (!Object.hasOwn(sourceRoutes, net.id)) continue;
    const route = normalizeStoredRoute(sourceRoutes[net.id], net);
    if (!route || Array.isArray(route)) {
      throw Object.assign(new Error('STM32_CIRCUIT_LAYOUT_INVALID'), { code: 'STM32_CIRCUIT_LAYOUT_INVALID' });
    }
    wireRoutes[net.id] = route;
  }
  const componentAppearance = normalizeComponentAppearance(value.layout.componentAppearance, {
    components, nets,
  });
  if (!componentAppearance) {
    throw Object.assign(new Error('STM32_CIRCUIT_LAYOUT_INVALID'), { code: 'STM32_CIRCUIT_LAYOUT_INVALID' });
  }
  const idCounters = normalizeBoundedIdCounters(value.layout.idCounters, components);
  const authoring = validateBounded3v3AuthoringGraph({ board: STM32_BOARD_DEFINITION, components, nets });
  if (!authoring.ok) throw Object.assign(new Error(`STM32_${authoring.code}`), {
    code: `STM32_${authoring.code}`, details: authoring.details,
  });
  return { schema: STM32_PUBLIC_CIRCUIT_SCHEMA, boardProfile: STM32_PUBLIC_PROFILE,
    components, nets, layout: { positions, wireStyles, wireRoutes, componentAppearance, idCounters } };
}

function hasPair(net, left, right) {
  const keys = new Set(net.endpoints.map(endpointKey));
  return keys.has(left) && keys.has(right);
}

export function validateStm32Circuit(value, options = {}) {
  let draft;
  try { draft = normalizeStm32CircuitDraft(value); }
  catch (error) { return failure(error.code ?? 'STM32_CIRCUIT_INVALID', { pin: error.pin ?? null }); }
  const modelLibraryLock = options.modelLibraryLock ?? CURRENT_MODEL_LIBRARY_LOCK;
  const admission = validateProjectModelLibrary(modelLibraryLock, STM32_PUBLIC_PROFILE, { circuit: draft });
  if (!admission.ok) return failure(admission.code, { details: admission.details });
  const resolved = resolveModelLibrary(modelLibraryLock);
  if (!resolved.ok) return failure(resolved.code, { details: resolved.details });
  const boards = draft.components.filter((item) => item.type === BOARD);
  if (boards.length !== 1) return failure('STM32_BOARD_COUNT');
  const board = boards[0];
  const authoring = validateBounded3v3AuthoringGraph({ board: STM32_BOARD_DEFINITION, components: draft.components, nets: draft.nets });
  if (!authoring.ok) return failure(`STM32_${authoring.code}`, authoring.details);
  const resistor = draft.components.find((item) => item.type === RESISTOR);
  const led = draft.components.find((item) => item.type === LED);
  if (!resistor) return failure('STM32_SERIES_RESISTOR_REQUIRED');
  if (!led) return failure('STM32_PATH_OPEN');
  if (draft.components.length !== 3 || draft.components.filter((item) => item.type === RESISTOR).length !== 1
      || draft.components.filter((item) => item.type === LED).length !== 1
      || draft.nets.some((net) => net.endpoints.length !== 2)) return failure('STM32_EXECUTABLE_PROJECTION_UNAVAILABLE');
  const source = `${board.id}.PB0`;
  const ground = `${board.id}.GND`;
  const ledAnode = `${led.id}.ANODE`;
  const ledCathode = `${led.id}.CATHODE`;
  const endpointSet = new Set(draft.nets.flatMap((net) => net.endpoints.map(endpointKey)));
  if (!endpointSet.has(ground)) return failure('STM32_GROUND_REQUIRED');
  if (!endpointSet.has(source)) return failure('STM32_PATH_OPEN');
  const reverse = draft.nets.some((net) => hasPair(net, source, ledCathode)
    || hasPair(net, ground, ledAnode)
    || net.endpoints.some((endpoint) => endpointKey(endpoint) === ledCathode)
      && net.endpoints.some((endpoint) => endpoint.component === resistor.id));
  if (reverse) return failure('STM32_LED_REVERSE_POLARITY');
  const orientations = [['A', 'B'], ['B', 'A']];
  const accepted = orientations.find(([sourceLead, ledLead]) =>
    draft.nets.some((net) => hasPair(net, source, `${resistor.id}.${sourceLead}`))
    && draft.nets.some((net) => hasPair(net, `${resistor.id}.${ledLead}`, ledAnode))
    && draft.nets.some((net) => hasPair(net, ledCathode, ground)));
  if (!accepted || draft.nets.length !== 3) return failure('STM32_PATH_OPEN');
  const ledReference = resolved.implementation.evaluateReference('led.basic-v1', {
    volts: STM32_NOMINAL_VOLTS, color: led.properties.color,
  });
  const forwardVolts = ledReference.result?.forwardVolts;
  const resistorReference = resolved.implementation.evaluateReference('resistor.fixed-v1', {
    volts: STM32_NOMINAL_VOLTS - forwardVolts, ohms: resistor.properties.ohms,
  });
  const peakCurrentAmps = resistorReference.result?.amps;
  if (!Number.isFinite(peakCurrentAmps) || peakCurrentAmps <= 0
      || peakCurrentAmps > STM32_LED_CURRENT_LIMIT_AMPS) {
    return failure('STM32_LED_OVERCURRENT', { peakCurrentAmps, limitAmps: STM32_LED_CURRENT_LIMIT_AMPS });
  }
  return { ok: true, code: 'OK', draft, model: {
    sourcePin: 'PB0', sourceAnchor: 'PB0', sourceConnector: 'CN11', sourcePhysicalPin: 34,
    groundAnchor: 'GND', groundConnector: STM32_PIN_MAP.GND.connector,
    groundPhysicalPin: STM32_PIN_MAP.GND.physicalPin,
    nominalVolts: STM32_NOMINAL_VOLTS,
    resistorId: resistor.id, resistorOhms: resistor.properties.ohms,
    ledId: led.id, ledColor: led.properties.color, forwardVolts, peakCurrentAmps,
    actualPb0Observed: true,
    modelLibraryImplementationId: resolved.implementation.id,
  } };
}

export class Stm32CircuitEditor extends NamedSeriesLedCircuitEditor {
  constructor(draft = createStm32CircuitDraft()) {
    super({ draft, normalize: normalizeStm32CircuitDraft,
      validate: validateStm32Circuit, createDefault: createStm32CircuitDraft,
      fixedComponentType: BOARD, resolveNetId, componentPolicy: COMPONENT_POLICY, codePrefix: 'STM32' });
  }
}
