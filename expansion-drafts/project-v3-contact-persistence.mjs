// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { CIRCUIT_LIMITS, catalogType } from '../src/component-catalog.mjs';
import { CIRCUIT_SCHEMA, validateCircuit } from '../src/circuit-engine.mjs';
import { defaultWireColor } from '../src/project-v2.mjs';
import { normalizeStoredRoute } from '../src/route-model.mjs';
import { exactKeys, parseStrictJson } from '../src/strict-json.mjs';
import {
  CURRENT_MODEL_LIBRARY_LOCK, modelLibraryExecutionIdentity, validateProjectModelLibrary,
} from '../src/model-library.mjs';
import {
  GROUND_REFERENCE_DEFINITION,
  GROUND_REFERENCE_TYPE,
  validateGroundReferenceCircuit,
} from './ground-reference-integration-v1.mjs';
import {
  PROJECT_V3_LIMIT,
  validateProjectV3,
} from './project-v3-envelope.mjs';
import {
  SPDT_CONTACT_DEFINITION,
  SPDT_CONTACT_TYPE,
  analyzeSwitchContactSafety,
  resolveSwitchContactGraph,
  transitionSwitchContact,
} from './switch-contact-graph-v1.mjs';
import {
  TOGGLE_SWITCH_DEFINITION,
  TOGGLE_SWITCH_TYPE,
} from './toggle-switch-integration-v1.mjs';
import {
  LIGHT_ANALOGUE_SENSOR_DEFINITION,
  LIGHT_ANALOGUE_SENSOR_TYPE,
  projectLightAnalogueSensors,
  validateLightAnalogueSensorComponent,
} from './light-analogue-sensor-v1.mjs';
import {
  TEMPERATURE_ANALOGUE_SENSOR_DEFINITION,
  TEMPERATURE_ANALOGUE_SENSOR_TYPE,
  projectTemperatureAnalogueSensors,
  validateTemperatureAnalogueSensorComponent,
} from './temperature-analogue-sensor-v1.mjs';
import {
  DIGITAL_LIGHT_THRESHOLD_DEFINITION,
  DIGITAL_LIGHT_THRESHOLD_TYPE,
  projectDigitalLightThresholdModules,
  validateDigitalLightThresholdComponent,
} from './digital-light-threshold-module-v1.mjs';
import {
  COMMON_CATHODE_RGB_LED_DEFINITION,
  COMMON_CATHODE_RGB_LED_TYPE,
  projectCommonCathodeRgbLeds,
  validateCommonCathodeRgbLedComponent,
} from './common-cathode-rgb-led-v1.mjs';
import {
  ACTIVE_BUZZER_DEFINITION,
  ACTIVE_BUZZER_TYPE,
  projectActiveBuzzerModules,
  validateActiveBuzzerComponent,
} from './active-buzzer-module-v1.mjs';
import {
  SEVEN_SEGMENT_DEFINITION,
  SEVEN_SEGMENT_TYPE,
  projectSevenSegmentDisplays,
  validateSevenSegmentComponent,
} from './seven-segment-common-cathode-v1.mjs';
import {
  CHARACTER_LCD_DEFINITION,
  CHARACTER_LCD_TYPE,
  projectCharacterLcdDisplays,
  validateCharacterLcdComponent,
} from './character-lcd-16x2-4bit-v1.mjs';
import {
  ROTARY_ENCODER_DEFINITION,
  ROTARY_ENCODER_TYPE,
  projectRotaryEncoders,
  validateRotaryEncoderComponent,
} from './rotary-encoder-quadrature-v1.mjs';

export const CONTACT_PERSISTENCE_SCHEMA = 'intent-mcu-project-contact-persistence@1';
export const COMPILED_FIXTURE_REFERENCE_SCHEMA = 'intent-mcu-compiled-fixture-ref@1';
export const CANDIDATE_LAYOUT_SCHEMA = 'intent-mcu-candidate-layout@1';
export const CONTACT_PERSISTENCE_LIMIT = PROJECT_V3_LIMIT;

const ID = /^[a-z][a-z0-9-]{0,47}$/u;
const LABEL = /^[\p{L}\p{N} ._#()°Ω×+\-]{1,64}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/u;
const BOARD_TYPE = 'board.atmega328p-16mhz-v1';
const GROUND_PINS = new Set(['GND1', 'GND2', 'GND3']);
const clone = (value) => structuredClone(value);
const failResult = (code, details = []) => ({ ok: false, code, details });
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;

class ContactPersistenceError extends Error {
  constructor(code, details = []) {
    super(code);
    this.name = 'ContactPersistenceError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, details = []) { throw new ContactPersistenceError(code, details); }

function validateFixtureReference(value, profile) {
  return exactKeys(value, [
    'schema', 'id', 'profile', 'toolchainImageId', 'source', 'executable', 'debug',
    'artifactIdentitySha256',
  ])
    && value.schema === COMPILED_FIXTURE_REFERENCE_SCHEMA
    && typeof value.id === 'string' && ID.test(value.id)
    && value.profile === profile
    && IMAGE_ID.test(value.toolchainImageId)
    && exactKeys(value.source, ['sha256', 'bytes'])
    && SHA256.test(value.source.sha256)
    && Number.isInteger(value.source.bytes) && value.source.bytes > 0
    && exactKeys(value.executable, ['format', 'sha256', 'bytes'])
    && value.executable.format === 'intel-hex'
    && SHA256.test(value.executable.sha256)
    && Number.isInteger(value.executable.bytes) && value.executable.bytes > 0
    && exactKeys(value.debug, ['format', 'sha256', 'bytes'])
    && value.debug.format === 'elf'
    && SHA256.test(value.debug.sha256)
    && Number.isInteger(value.debug.bytes) && value.debug.bytes > 0
    && SHA256.test(value.artifactIdentitySha256);
}

export function validateCompiledFixtureReference(value, profile) {
  return validateFixtureReference(value, profile);
}

function pinIds(component) {
  if (component.type === GROUND_REFERENCE_TYPE) return ['REF'];
  if (component.type === TOGGLE_SWITCH_TYPE) return ['A', 'B'];
  if (component.type === SPDT_CONTACT_TYPE) return ['COM', 'A', 'B'];
  if (component.type === LIGHT_ANALOGUE_SENSOR_TYPE) return ['VCC', 'GND', 'AOUT'];
  if (component.type === TEMPERATURE_ANALOGUE_SENSOR_TYPE) return ['VCC', 'GND', 'AOUT'];
  if (component.type === DIGITAL_LIGHT_THRESHOLD_TYPE) return ['VCC', 'GND', 'DOUT'];
  if (component.type === COMMON_CATHODE_RGB_LED_TYPE) return ['R', 'G', 'B', 'COM'];
  if (component.type === ACTIVE_BUZZER_TYPE) return ['VCC', 'GND', 'EN'];
  if (component.type === SEVEN_SEGMENT_TYPE) return ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'COM'];
  if (component.type === CHARACTER_LCD_TYPE) return ['VCC', 'GND', 'RS', 'RW', 'E', 'D4', 'D5', 'D6', 'D7'];
  if (component.type === ROTARY_ENCODER_TYPE) return ['A', 'COM', 'B'];
  const definition = catalogType(component.type);
  return definition ? definition.pins.map((pin) => pin.id) : null;
}

function componentPins(component) {
  if (component.type === GROUND_REFERENCE_TYPE) return GROUND_REFERENCE_DEFINITION.pins;
  if (component.type === TOGGLE_SWITCH_TYPE) return TOGGLE_SWITCH_DEFINITION.pins;
  if (component.type === SPDT_CONTACT_TYPE) return SPDT_CONTACT_DEFINITION.terminals;
  if (component.type === LIGHT_ANALOGUE_SENSOR_TYPE) return LIGHT_ANALOGUE_SENSOR_DEFINITION.pins;
  if (component.type === TEMPERATURE_ANALOGUE_SENSOR_TYPE) return TEMPERATURE_ANALOGUE_SENSOR_DEFINITION.pins;
  if (component.type === DIGITAL_LIGHT_THRESHOLD_TYPE) return DIGITAL_LIGHT_THRESHOLD_DEFINITION.pins;
  if (component.type === COMMON_CATHODE_RGB_LED_TYPE) return COMMON_CATHODE_RGB_LED_DEFINITION.pins;
  if (component.type === ACTIVE_BUZZER_TYPE) return ACTIVE_BUZZER_DEFINITION.pins;
  if (component.type === SEVEN_SEGMENT_TYPE) return SEVEN_SEGMENT_DEFINITION.pins;
  if (component.type === CHARACTER_LCD_TYPE) return CHARACTER_LCD_DEFINITION.pins;
  if (component.type === ROTARY_ENCODER_TYPE) return ROTARY_ENCODER_DEFINITION.pins;
  return catalogType(component.type)?.pins ?? null;
}

function validateCandidateComponent(component) {
  if (!exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
      || typeof component.id !== 'string' || !ID.test(component.id)
      || typeof component.type !== 'string'
      || typeof component.label !== 'string' || !LABEL.test(component.label)) {
    fail('PROJECT_CONTACT_COMPONENT', [component?.id ?? null]);
  }
  if (component.type === GROUND_REFERENCE_TYPE) {
    if (!exactKeys(component.properties, ['potentialVolts']) || component.properties.potentialVolts !== 0
        || !exactKeys(component.controls, [])) fail('PROJECT_CONTACT_GROUND_STATE', [component.id]);
  } else if (component.type === TOGGLE_SWITCH_TYPE) {
    if (!exactKeys(component.properties, ['normallyOpen']) || component.properties.normallyOpen !== true
        || !exactKeys(component.controls, ['closed']) || typeof component.controls.closed !== 'boolean') {
      fail('PROJECT_CONTACT_SPST_STATE', [component.id]);
    }
  } else if (component.type === SPDT_CONTACT_TYPE) {
    if (!exactKeys(component.properties, ['transitionPolicy'])
        || component.properties.transitionPolicy !== 'break-before-make'
        || !exactKeys(component.controls, ['selectedThrow'])
        || !['A', 'B'].includes(component.controls.selectedThrow)) {
      fail('PROJECT_CONTACT_SPDT_STATE', [component.id]);
    }
  } else if (component.type === LIGHT_ANALOGUE_SENSOR_TYPE) {
    if (!validateLightAnalogueSensorComponent(component)) {
      fail('PROJECT_CONTACT_LIGHT_SENSOR_STATE', [component.id]);
    }
  } else if (component.type === TEMPERATURE_ANALOGUE_SENSOR_TYPE) {
    if (!validateTemperatureAnalogueSensorComponent(component)) {
      fail('PROJECT_CONTACT_TEMPERATURE_SENSOR_STATE', [component.id]);
    }
  } else if (component.type === DIGITAL_LIGHT_THRESHOLD_TYPE) {
    if (!validateDigitalLightThresholdComponent(component)) {
      fail('PROJECT_CONTACT_DIGITAL_LIGHT_THRESHOLD_STATE', [component.id]);
    }
  } else if (component.type === COMMON_CATHODE_RGB_LED_TYPE) {
    if (!validateCommonCathodeRgbLedComponent(component)) {
      fail('PROJECT_CONTACT_RGB_LED_STATE', [component.id]);
    }
  } else if (component.type === ACTIVE_BUZZER_TYPE) {
    if (!validateActiveBuzzerComponent(component)) {
      fail('PROJECT_CONTACT_ACTIVE_BUZZER_STATE', [component.id]);
    }
  } else if (component.type === SEVEN_SEGMENT_TYPE) {
    if (!validateSevenSegmentComponent(component)) {
      fail('PROJECT_CONTACT_SEVEN_SEGMENT_STATE', [component.id]);
    }
  } else if (component.type === CHARACTER_LCD_TYPE) {
    if (!validateCharacterLcdComponent(component)) {
      fail('PROJECT_CONTACT_CHARACTER_LCD_STATE', [component.id]);
    }
  } else if (component.type === ROTARY_ENCODER_TYPE) {
    if (!validateRotaryEncoderComponent(component)) {
      fail('PROJECT_CONTACT_ROTARY_ENCODER_STATE', [component.id]);
    }
  } else if (!catalogType(component.type)) {
    fail('PROJECT_CONTACT_UNKNOWN_COMPONENT', [component.id, component.type]);
  }
  return clone(component);
}

function normalizeCandidateCircuit(value, { requireCandidate = true } = {}) {
  if (!exactKeys(value, ['schema', 'components', 'nets', 'junctions'])
      || value.schema !== CIRCUIT_SCHEMA
      || !Array.isArray(value.components) || !Array.isArray(value.nets)
      || !Array.isArray(value.junctions)) fail('PROJECT_CONTACT_CIRCUIT_SHAPE');
  const endpointCount = value.nets.reduce(
    (count, net) => count + (Array.isArray(net?.endpoints) ? net.endpoints.length : 0), 0,
  );
  if (value.components.length > CIRCUIT_LIMITS.components) fail('PROJECT_CONTACT_COMPONENT_LIMIT');
  if (value.nets.length > CIRCUIT_LIMITS.nets) fail('PROJECT_CONTACT_NET_LIMIT');
  if (endpointCount > CIRCUIT_LIMITS.endpoints) fail('PROJECT_CONTACT_ENDPOINT_LIMIT');

  const componentIds = new Set();
  const components = value.components.map((component) => {
    const normalized = validateCandidateComponent(component);
    if (componentIds.has(normalized.id)) fail('PROJECT_CONTACT_COMPONENT_DUPLICATE', [normalized.id]);
    componentIds.add(normalized.id);
    return normalized;
  }).sort((left, right) => `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`));
  if (components.filter((component) => component.type === BOARD_TYPE).length !== 1) {
    fail('PROJECT_CONTACT_BOARD_COUNT');
  }
  if (requireCandidate
      && !components.some((component) => [
        GROUND_REFERENCE_TYPE, TOGGLE_SWITCH_TYPE, SPDT_CONTACT_TYPE,
        LIGHT_ANALOGUE_SENSOR_TYPE, TEMPERATURE_ANALOGUE_SENSOR_TYPE,
        DIGITAL_LIGHT_THRESHOLD_TYPE, COMMON_CATHODE_RGB_LED_TYPE,
        ACTIVE_BUZZER_TYPE, SEVEN_SEGMENT_TYPE, CHARACTER_LCD_TYPE,
        ROTARY_ENCODER_TYPE,
      ].includes(component.type))) {
    fail('PROJECT_CONTACT_CANDIDATE_REQUIRED');
  }
  const componentMap = new Map(components.map((component) => [component.id, component]));
  const usedEndpoints = new Set();
  const netIds = new Set();
  const nets = value.nets.map((net) => {
    if (!exactKeys(net, ['id', 'endpoints']) || typeof net.id !== 'string' || !ID.test(net.id)
        || netIds.has(net.id) || !Array.isArray(net.endpoints) || net.endpoints.length < 2) {
      fail('PROJECT_CONTACT_NET', [net?.id ?? null]);
    }
    netIds.add(net.id);
    const endpoints = net.endpoints.map((endpoint) => {
      if (!exactKeys(endpoint, ['component', 'pin'])
          || typeof endpoint.component !== 'string' || typeof endpoint.pin !== 'string') {
        fail('PROJECT_CONTACT_ENDPOINT', [net.id]);
      }
      const component = componentMap.get(endpoint.component);
      const acceptedPins = component ? pinIds(component) : null;
      if (!component || !acceptedPins?.includes(endpoint.pin)) {
        fail('PROJECT_CONTACT_UNKNOWN_PIN', [endpoint.component, endpoint.pin, net.id]);
      }
      const key = endpointKey(endpoint);
      if (usedEndpoints.has(key)) fail('PROJECT_CONTACT_REUSED_ENDPOINT', [key]);
      usedEndpoints.add(key);
      return clone(endpoint);
    }).sort((left, right) => endpointKey(left).localeCompare(endpointKey(right)));
    return { id: net.id, endpoints };
  }).sort((left, right) => left.id.localeCompare(right.id));

  const junctionIds = new Set();
  const junctions = value.junctions.map((junction) => {
    if (!exactKeys(junction, ['id', 'net']) || typeof junction.id !== 'string' || !ID.test(junction.id)
        || junctionIds.has(junction.id) || typeof junction.net !== 'string' || !netIds.has(junction.net)) {
      fail('PROJECT_CONTACT_JUNCTION', [junction?.id ?? null]);
    }
    junctionIds.add(junction.id);
    return clone(junction);
  }).sort((left, right) => left.id.localeCompare(right.id));
  return { schema: CIRCUIT_SCHEMA, components, nets, junctions };
}

function normalizeCandidateLayout(value, graph) {
  if (!exactKeys(value, ['schema', 'positions', 'wireRoutes', 'viewport'])
      || value.schema !== CANDIDATE_LAYOUT_SCHEMA
      || value.positions === null || typeof value.positions !== 'object' || Array.isArray(value.positions)
      || Object.getPrototypeOf(value.positions) !== Object.prototype
      || value.wireRoutes === null || typeof value.wireRoutes !== 'object' || Array.isArray(value.wireRoutes)
      || Object.getPrototypeOf(value.wireRoutes) !== Object.prototype) {
    fail('PROJECT_CONTACT_LAYOUT_SHAPE');
  }
  const componentIds = graph.components.map((component) => component.id).sort();
  if (Object.keys(value.positions).sort().join('|') !== componentIds.join('|')) {
    fail('PROJECT_CONTACT_LAYOUT_COMPONENTS');
  }
  const positions = {};
  for (const componentId of componentIds) {
    const position = value.positions[componentId];
    if (!exactKeys(position, ['x', 'y', 'rotation'])
        || !Number.isFinite(position.x) || position.x < 0 || position.x > 1
        || !Number.isFinite(position.y) || position.y < 0 || position.y > 1
        || !Number.isInteger(position.rotation) || ![0, 90, 180, 270].includes(position.rotation)) {
      fail('PROJECT_CONTACT_LAYOUT_POSITION', [componentId]);
    }
    positions[componentId] = clone(position);
  }
  const netMap = new Map(graph.nets.map((net) => [net.id, net]));
  const wireRoutes = {};
  for (const netId of Object.keys(value.wireRoutes).sort()) {
    const net = netMap.get(netId);
    const route = net ? normalizeStoredRoute(value.wireRoutes[netId], net) : null;
    if (!net) fail('PROJECT_CONTACT_LAYOUT_NET', [netId]);
    if (!route) fail('PROJECT_CONTACT_LAYOUT_ROUTE', [netId]);
    wireRoutes[netId] = route;
  }
  if (!exactKeys(value.viewport, ['zoom', 'panX', 'panY'])
      || !Number.isFinite(value.viewport.zoom) || value.viewport.zoom < 0.5 || value.viewport.zoom > 3
      || !Number.isFinite(value.viewport.panX) || value.viewport.panX < -1 || value.viewport.panX > 1
      || !Number.isFinite(value.viewport.panY) || value.viewport.panY < -1 || value.viewport.panY > 1) {
    fail('PROJECT_CONTACT_LAYOUT_VIEWPORT');
  }
  const pinAnchors = {};
  for (const component of graph.components) {
    const pins = componentPins(component);
    if (!pins) fail('PROJECT_CONTACT_LAYOUT_ANCHOR', [component.id]);
    for (const pin of pins) {
      if (!pin.anchor || !Number.isFinite(pin.anchor.x) || pin.anchor.x < 0 || pin.anchor.x > 1
          || !Number.isFinite(pin.anchor.y) || pin.anchor.y < 0 || pin.anchor.y > 1) {
        fail('PROJECT_CONTACT_LAYOUT_ANCHOR', [component.id, pin.id]);
      }
      pinAnchors[`${component.id}.${pin.id}`] = { x: pin.anchor.x, y: pin.anchor.y };
    }
  }
  return {
    layout: {
      schema: CANDIDATE_LAYOUT_SCHEMA,
      positions,
      wireRoutes,
      viewport: clone(value.viewport),
    },
    pinAnchors,
  };
}

function partialTerminalNetMap(graph, componentId) {
  const map = { COM: null, A: null, B: null };
  for (const net of graph.nets) {
    for (const endpoint of net.endpoints) {
      if (endpoint.component === componentId && Object.hasOwn(map, endpoint.pin)) map[endpoint.pin] = net.id;
    }
  }
  return map;
}

function terminalNetMap(graph, componentId) {
  const map = partialTerminalNetMap(graph, componentId);
  if (Object.values(map).some((netId) => netId === null)) fail('PROJECT_CONTACT_SPDT_TERMINALS', [componentId]);
  return map;
}

function deriveNetClasses(graph) {
  const components = new Map(graph.components.map((component) => [component.id, component]));
  return Object.fromEntries(graph.nets.map((net) => {
    const classes = new Set();
    for (const endpoint of net.endpoints) {
      const component = components.get(endpoint.component);
      if (component?.type === GROUND_REFERENCE_TYPE && endpoint.pin === 'REF') classes.add('ground.reference');
      if (component?.type === BOARD_TYPE && GROUND_PINS.has(endpoint.pin)) classes.add('ground.reference');
      if (component?.type === BOARD_TYPE && endpoint.pin === '5V') classes.add('power.5v-reference');
    }
    return [net.id, [...classes].sort()];
  }));
}

function validateDraftElectricalSafety(graph) {
  const netClasses = deriveNetClasses(graph);
  for (const [netId, classes] of Object.entries(netClasses)) {
    if (classes.includes('power.5v-reference') && classes.includes('ground.reference')) {
      fail('PROJECT_CONTACT_POWER_SHORT', [netId]);
    }
  }
  for (const component of graph.components.filter((item) => item.type === SPDT_CONTACT_TYPE)) {
    const terminalNets = partialTerminalNetMap(graph, component.id);
    if (Object.values(terminalNets).some((netId) => netId === null)) continue;
    const safety = analyzeSwitchContactSafety({ terminalNets, netClasses, drivers: {} }, component.controls.selectedThrow);
    if (!safety.ok) fail(`PROJECT_CONTACT_${safety.code}`, [component.id, ...safety.mergedNets]);
  }
}

function removeSpdtComponents(graph) {
  const spdtIds = new Set(graph.components.filter((component) => component.type === SPDT_CONTACT_TYPE)
    .map((component) => component.id));
  const nets = graph.nets.map((net) => ({
    id: net.id,
    endpoints: net.endpoints.filter((endpoint) => !spdtIds.has(endpoint.component)).map(clone),
  })).filter((net) => net.endpoints.length >= 2);
  const netIds = new Set(nets.map((net) => net.id));
  return {
    schema: CIRCUIT_SCHEMA,
    components: graph.components.filter((component) => !spdtIds.has(component.id)).map(clone),
    nets,
    junctions: graph.junctions.filter((junction) => netIds.has(junction.net)).map(clone),
  };
}

function projectSpstComponents(graph) {
  const projected = clone(graph);
  projected.components = projected.components.map((component) => component.type === TOGGLE_SWITCH_TYPE ? {
    id: component.id,
    type: 'button.momentary-v1',
    label: component.label,
    properties: { normallyOpen: true },
    controls: { pressed: component.controls.closed },
  } : component);
  return projected;
}

function production(implementation, componentType, input, details = []) {
  const evaluated = implementation.evaluateProduction(componentType, input);
  if (!evaluated.ok) fail(evaluated.code, [componentType, ...details]);
  return evaluated.result;
}

function reconstructCandidate(graph, implementation, modelLibraryLock) {
  const netClasses = deriveNetClasses(graph);
  const contacts = [];
  for (const component of graph.components) {
    if (component.type === GROUND_REFERENCE_TYPE) {
      production(implementation, component.type, component.controls, [component.id]);
      contacts.push({ componentId: component.id, type: component.type, state: { potentialVolts: 0 } });
    }
    if (component.type === TOGGLE_SWITCH_TYPE) {
      production(implementation, component.type, { closed: component.controls.closed }, [component.id]);
      contacts.push({ componentId: component.id, type: component.type, state: { closed: component.controls.closed } });
    }
    if (component.type === SPDT_CONTACT_TYPE) {
      const selectedThrow = component.controls.selectedThrow;
      production(implementation, component.type, { selectedThrow }, [component.id]);
      const terminalNets = terminalNetMap(graph, component.id);
      const safety = analyzeSwitchContactSafety({ terminalNets, netClasses, drivers: {} }, selectedThrow);
      if (!safety.ok) fail(`PROJECT_CONTACT_${safety.code}`, [component.id, ...safety.mergedNets]);
      const opposite = selectedThrow === 'A' ? 'B' : 'A';
      const transition = transitionSwitchContact(selectedThrow, opposite);
      if (!transition.breakObserved || transition.frames.some((frame) => frame.activeContacts.length > 1)) {
        fail('PROJECT_CONTACT_BREAK_BEFORE_MAKE', [component.id]);
      }
      contacts.push({
        componentId: component.id,
        type: component.type,
        state: { selectedThrow },
        contactGraph: clone(resolveSwitchContactGraph(selectedThrow)),
        oppositeTransition: clone(transition),
      });
    }
  }

  const withoutSpdt = removeSpdtComponents(graph);
  const withProjectedSpst = projectSpstComponents(withoutSpdt);
  const lightProjection = projectLightAnalogueSensors(withProjectedSpst);
  if (!lightProjection.ok) fail(`PROJECT_CONTACT_${lightProjection.code}`, lightProjection.details);
  contacts.push(...lightProjection.sensors.map((sensor) => ({
    componentId: sensor.componentId,
    type: LIGHT_ANALOGUE_SENSOR_TYPE,
    state: { lightLevel: sensor.lightLevel },
    runtimeProjection: clone(sensor),
  })));
  for (const sensor of lightProjection.sensors) {
    const expected = production(implementation, LIGHT_ANALOGUE_SENSOR_TYPE,
      { lightLevel: sensor.lightLevel }, [sensor.componentId]);
    if (expected.outputVolts !== sensor.voltage) fail('MODEL_LIBRARY_PRODUCTION_MISMATCH', [sensor.componentId]);
  }
  const temperatureProjection = projectTemperatureAnalogueSensors(lightProjection.runtimeGraph);
  if (!temperatureProjection.ok) {
    fail(`PROJECT_CONTACT_${temperatureProjection.code}`, temperatureProjection.details);
  }
  contacts.push(...temperatureProjection.sensors.map((sensor) => ({
    componentId: sensor.componentId,
    type: TEMPERATURE_ANALOGUE_SENSOR_TYPE,
    state: { temperatureC: sensor.temperatureC },
    runtimeProjection: clone(sensor),
  })));
  for (const sensor of temperatureProjection.sensors) {
    const expected = production(implementation, TEMPERATURE_ANALOGUE_SENSOR_TYPE,
      { temperatureC: sensor.temperatureC }, [sensor.componentId]);
    if (expected.outputVolts !== sensor.voltage) fail('MODEL_LIBRARY_PRODUCTION_MISMATCH', [sensor.componentId]);
  }
  const thresholdProjection = projectDigitalLightThresholdModules(temperatureProjection.runtimeGraph);
  if (!thresholdProjection.ok) {
    fail(`PROJECT_CONTACT_${thresholdProjection.code}`, thresholdProjection.details);
  }
  contacts.push(...thresholdProjection.modules.map((module) => ({
    componentId: module.componentId,
    type: DIGITAL_LIGHT_THRESHOLD_TYPE,
    state: {
      lightLevelPercent: module.lightLevelPercent,
      thresholdPercent: module.thresholdPercent,
      hysteresisPercentagePoints: module.hysteresisPercentagePoints,
      outputActive: module.outputActive,
    },
    runtimeProjection: clone(module),
  })));
  for (const module of thresholdProjection.modules) {
    const expected = production(implementation, DIGITAL_LIGHT_THRESHOLD_TYPE, {
      lightLevelPercent: module.lightLevelPercent,
      thresholdPercent: module.thresholdPercent,
      hysteresisPercentagePoints: module.hysteresisPercentagePoints,
      currentActive: module.outputActive,
    }, [module.componentId]);
    if (expected.outputActive !== module.outputActive) fail('MODEL_LIBRARY_PRODUCTION_MISMATCH', [module.componentId]);
  }
  const rgbProjection = projectCommonCathodeRgbLeds(thresholdProjection.runtimeGraph);
  if (!rgbProjection.ok) {
    fail(`PROJECT_CONTACT_${rgbProjection.code}`, rgbProjection.details);
  }
  contacts.push(...rgbProjection.leds.map((led) => ({
    componentId: led.componentId,
    type: COMMON_CATHODE_RGB_LED_TYPE,
    state: { commonPolarity: led.commonPolarity },
    runtimeProjection: clone(led),
  })));
  for (const led of rgbProjection.leds) production(implementation, COMMON_CATHODE_RGB_LED_TYPE,
    { duties: { R: 0, G: 0, B: 0 } }, [led.componentId]);
  const buzzerProjection = projectActiveBuzzerModules(rgbProjection.runtimeGraph);
  if (!buzzerProjection.ok) {
    fail(`PROJECT_CONTACT_${buzzerProjection.code}`, buzzerProjection.details);
  }
  contacts.push(...buzzerProjection.buzzers.map((buzzer) => ({
    componentId: buzzer.componentId,
    type: ACTIVE_BUZZER_TYPE,
    state: { activeLevel: buzzer.activeLevel, enabled: false },
    runtimeProjection: clone(buzzer),
  })));
  for (const buzzer of buzzerProjection.buzzers) production(implementation, ACTIVE_BUZZER_TYPE,
    { level: false }, [buzzer.componentId]);
  const sevenSegmentProjection = projectSevenSegmentDisplays(buzzerProjection.runtimeGraph);
  if (!sevenSegmentProjection.ok) {
    fail(`PROJECT_CONTACT_${sevenSegmentProjection.code}`, sevenSegmentProjection.details);
  }
  contacts.push(...sevenSegmentProjection.displays.map((display) => ({
    componentId: display.componentId,
    type: SEVEN_SEGMENT_TYPE,
    state: { commonPolarity: display.commonPolarity },
    runtimeProjection: clone(display),
  })));
  for (const display of sevenSegmentProjection.displays) production(implementation, SEVEN_SEGMENT_TYPE,
    { digit: 0 }, [display.componentId]);
  const characterLcdProjection = projectCharacterLcdDisplays(sevenSegmentProjection.runtimeGraph);
  if (!characterLcdProjection.ok) {
    fail(`PROJECT_CONTACT_${characterLcdProjection.code}`, characterLcdProjection.details);
  }
  contacts.push(...characterLcdProjection.displays.map((display) => ({
    componentId: display.componentId,
    type: CHARACTER_LCD_TYPE,
    state: { geometry: '16x2', busMode: display.busMode },
    runtimeProjection: clone(display),
  })));
  for (const display of characterLcdProjection.displays) production(implementation, CHARACTER_LCD_TYPE,
    { lines: ['', ''] }, [display.componentId]);
  const rotaryEncoderProjection = projectRotaryEncoders(characterLcdProjection.runtimeGraph);
  if (!rotaryEncoderProjection.ok) {
    fail(`PROJECT_CONTACT_${rotaryEncoderProjection.code}`, rotaryEncoderProjection.details);
  }
  contacts.push(...rotaryEncoderProjection.encoders.map((encoder) => ({
    componentId: encoder.componentId,
    type: ROTARY_ENCODER_TYPE,
    state: { detent: encoder.detent, restState: encoder.restState },
    runtimeProjection: clone(encoder),
  })));
  for (const encoder of rotaryEncoderProjection.encoders) production(implementation, ROTARY_ENCODER_TYPE,
    { direction: 'cw' }, [encoder.componentId]);
  const hasGround = rotaryEncoderProjection.runtimeGraph.components.some(
    (component) => component.type === GROUND_REFERENCE_TYPE,
  );
  const projected = hasGround
    ? validateGroundReferenceCircuit(rotaryEncoderProjection.runtimeGraph, { modelLibraryLock })
    : validateCircuit(rotaryEncoderProjection.runtimeGraph, { modelLibraryLock });
  if (!projected.ok) fail(`PROJECT_CONTACT_${projected.code}`, projected.diagnostics ?? []);
  const runtimeGraph = projected.runtimeGraph ?? projected.graph;
  return {
    graph: clone(graph), runtimeProjection: clone(runtimeGraph), contacts,
    modelLibraryImplementationId: implementation.id,
    runtimePositionSources: clone({
      ...rgbProjection.runtimePositionSources,
      ...sevenSegmentProjection.runtimePositionSources,
      ...rotaryEncoderProjection.runtimePositionSources,
    }),
  };
}

function draftContacts(graph) {
  return graph.components.flatMap((component) => {
    if (component.type === GROUND_REFERENCE_TYPE) {
      return [{ componentId: component.id, type: component.type, state: { potentialVolts: 0 } }];
    }
    if (component.type === TOGGLE_SWITCH_TYPE) {
      return [{ componentId: component.id, type: component.type, state: { closed: component.controls.closed } }];
    }
    if (component.type === SPDT_CONTACT_TYPE) {
      const selectedThrow = component.controls.selectedThrow;
      return [{
        componentId: component.id,
        type: component.type,
        state: { selectedThrow },
        contactGraph: clone(resolveSwitchContactGraph(selectedThrow)),
        oppositeTransition: clone(transitionSwitchContact(selectedThrow, selectedThrow === 'A' ? 'B' : 'A')),
      }];
    }
    if (component.type === LIGHT_ANALOGUE_SENSOR_TYPE) {
      return [{
        componentId: component.id,
        type: component.type,
        state: { lightLevel: component.controls.lightLevel },
        runtimeProjection: null,
      }];
    }
    if (component.type === TEMPERATURE_ANALOGUE_SENSOR_TYPE) {
      return [{
        componentId: component.id,
        type: component.type,
        state: { temperatureC: component.controls.temperatureC },
        runtimeProjection: null,
      }];
    }
    if (component.type === DIGITAL_LIGHT_THRESHOLD_TYPE) {
      return [{
        componentId: component.id,
        type: component.type,
        state: clone(component.controls),
        runtimeProjection: null,
      }];
    }
    if (component.type === COMMON_CATHODE_RGB_LED_TYPE) {
      return [{
        componentId: component.id,
        type: component.type,
        state: { commonPolarity: 'cathode' },
        runtimeProjection: null,
      }];
    }
    if (component.type === ACTIVE_BUZZER_TYPE) {
      return [{
        componentId: component.id,
        type: component.type,
        state: { activeLevel: 'HIGH', enabled: false },
        runtimeProjection: null,
      }];
    }
    if (component.type === SEVEN_SEGMENT_TYPE) {
      return [{
        componentId: component.id,
        type: component.type,
        state: { commonPolarity: 'cathode' },
        runtimeProjection: null,
      }];
    }
    if (component.type === CHARACTER_LCD_TYPE) {
      return [{
        componentId: component.id,
        type: component.type,
        state: { geometry: '16x2', busMode: 'write-only-4-bit' },
        runtimeProjection: null,
      }];
    }
    if (component.type === ROTARY_ENCODER_TYPE) {
      return [{
        componentId: component.id,
        type: component.type,
        state: { detent: component.controls.detent, restState: '11' },
        runtimeProjection: null,
      }];
    }
    return [];
  });
}

function runtimeLayout(candidateLayout, runtimeGraph, runtimePositionSources = {}) {
  const positions = Object.fromEntries(runtimeGraph.components.map((component) => [
    component.id,
    clone(candidateLayout.positions[component.id]
      ?? candidateLayout.positions[runtimePositionSources[component.id]]),
  ]));
  return {
    positions,
    wireRoutes: {},
    wireStyles: Object.fromEntries(runtimeGraph.nets.map((net) => [
      net.id, { color: defaultWireColor(net, runtimeGraph) },
    ])),
    viewport: clone(candidateLayout.viewport),
  };
}

const UNSAFE_DRAFT_CODES = new Set([
  'PROJECT_CONTACT_POWER_SHORT',
  'PROJECT_CONTACT_OUTPUT_CONTENTION',
]);

export function validateContactPersistenceDraft(value, options = {}) {
  try {
    if (!exactKeys(value, ['schema', 'project', 'candidateCircuit', 'candidateLayout', 'compiledFixture'])) {
      return failResult('PROJECT_CONTACT_SHAPE');
    }
    if (value.schema !== CONTACT_PERSISTENCE_SCHEMA) return failResult('PROJECT_CONTACT_VERSION');
    const projectResult = validateProjectV3(value.project);
    if (!projectResult.ok) return failResult(`PROJECT_CONTACT_${projectResult.code}`, projectResult.details);
    if (projectResult.project.artifact.status !== 'dirty') {
      return failResult('PROJECT_CONTACT_ARTIFACT_NOT_SEPARATE');
    }
    if (!validateFixtureReference(value.compiledFixture, projectResult.project.controller.profile)) {
      return failResult('PROJECT_CONTACT_FIXTURE');
    }
    const candidateCircuit = normalizeCandidateCircuit(value.candidateCircuit, { requireCandidate: false });
    const modelLibraryLock = options.modelLibraryLock ?? CURRENT_MODEL_LIBRARY_LOCK;
    const admission = validateProjectModelLibrary(modelLibraryLock, BOARD_TYPE,
      { candidateCircuit });
    if (!admission.ok) return admission;
    const modelLibrary = modelLibraryExecutionIdentity(modelLibraryLock);
    if (!modelLibrary.ok) return modelLibrary;
    validateDraftElectricalSafety(candidateCircuit);
    const { layout: candidateLayout, pinAnchors } = normalizeCandidateLayout(value.candidateLayout, candidateCircuit);
    const project = {
      schema: CONTACT_PERSISTENCE_SCHEMA,
      project: clone(projectResult.project),
      candidateCircuit,
      candidateLayout,
      compiledFixture: clone(value.compiledFixture),
    };
    let projection = null;
    let runnable = null;
    try {
      projection = reconstructCandidate(candidateCircuit, modelLibrary.implementation, modelLibraryLock);
      const baseMatches = JSON.stringify(projection.runtimeProjection) === JSON.stringify(project.project.circuit);
      runnable = {
        ok: baseMatches,
        code: baseMatches ? 'OK' : 'PROJECT_CONTACT_BASE_GRAPH_MISMATCH',
        details: [],
      };
    } catch (error) {
      if (!(error instanceof ContactPersistenceError)) throw error;
      if (UNSAFE_DRAFT_CODES.has(error.code)) throw error;
      runnable = { ok: false, code: error.code, details: clone(error.details) };
    }
    return {
      ok: true,
      code: runnable.ok ? 'OK' : 'PROJECT_CONTACT_DRAFT',
      project,
      reconstruction: {
        graph: clone(candidateCircuit),
        runtimeProjection: projection ? clone(projection.runtimeProjection) : null,
        runtimePositionSources: projection ? clone(projection.runtimePositionSources) : {},
        contacts: projection ? clone(projection.contacts) : draftContacts(candidateCircuit),
        projectionReady: Boolean(projection),
        baseMatches: projection ? runnable.ok : false,
        runnable: clone(runnable),
        layout: clone(candidateLayout),
        pinAnchors: clone(pinAnchors),
        controllerProfile: project.project.controller.profile,
        compiledFixture: clone(project.compiledFixture),
        modelLibrary: clone(modelLibrary.identity),
      },
    };
  } catch (error) {
    if (error instanceof ContactPersistenceError) return failResult(error.code, error.details);
    return failResult('PROJECT_CONTACT_INVALID');
  }
}

export function validateContactPersistenceProject(value, options = {}) {
  const draft = validateContactPersistenceDraft(value, options);
  if (!draft.ok) return draft;
  if (!draft.reconstruction.graph.components.some(
    (component) => [
      GROUND_REFERENCE_TYPE, TOGGLE_SWITCH_TYPE, SPDT_CONTACT_TYPE,
      LIGHT_ANALOGUE_SENSOR_TYPE, TEMPERATURE_ANALOGUE_SENSOR_TYPE,
      DIGITAL_LIGHT_THRESHOLD_TYPE, COMMON_CATHODE_RGB_LED_TYPE,
      ACTIVE_BUZZER_TYPE, SEVEN_SEGMENT_TYPE, CHARACTER_LCD_TYPE,
      ROTARY_ENCODER_TYPE,
    ].includes(component.type),
  )) return failResult('PROJECT_CONTACT_CANDIDATE_REQUIRED');
  if (!draft.reconstruction.projectionReady || !draft.reconstruction.runnable.ok) {
    return failResult(draft.reconstruction.runnable.code, draft.reconstruction.runnable.details);
  }
  return { ...draft, code: 'OK' };
}

export function parseContactPersistenceProject(source, options = {}) {
  try { return validateContactPersistenceProject(parseStrictJson(source, CONTACT_PERSISTENCE_LIMIT), options); }
  catch (error) { return failResult(error.code ?? 'MALFORMED_JSON'); }
}

export function parseContactPersistenceDraft(source, options = {}) {
  try { return validateContactPersistenceDraft(parseStrictJson(source, CONTACT_PERSISTENCE_LIMIT), options); }
  catch (error) { return failResult(error.code ?? 'MALFORMED_JSON'); }
}

export function canonicalContactPersistenceProjectJson(value, options = {}) {
  const result = validateContactPersistenceProject(value, options);
  if (!result.ok) throw new Error(result.code);
  return JSON.stringify(result.project);
}

export function canonicalContactPersistenceDraftJson(value, options = {}) {
  const result = validateContactPersistenceDraft(value, options);
  if (!result.ok) throw new Error(result.code);
  return JSON.stringify(result.project);
}

export function createContactPersistenceProject(project, candidateCircuit, candidateLayout, compiledFixture) {
  return validateContactPersistenceProject({
    schema: CONTACT_PERSISTENCE_SCHEMA,
    project: clone(project),
    candidateCircuit: clone(candidateCircuit),
    candidateLayout: clone(candidateLayout),
    compiledFixture: clone(compiledFixture),
  });
}

export function createContactPersistenceDraft(project, candidateCircuit, candidateLayout, compiledFixture) {
  return validateContactPersistenceDraft({
    schema: CONTACT_PERSISTENCE_SCHEMA,
    project: clone(project),
    candidateCircuit: clone(candidateCircuit),
    candidateLayout: clone(candidateLayout),
    compiledFixture: clone(compiledFixture),
  });
}

export function synchronizeContactPersistenceRuntime(value, options = {}) {
  const draft = validateContactPersistenceDraft(value, options);
  if (!draft.ok) return draft;
  if (!draft.reconstruction.projectionReady) {
    return failResult(draft.reconstruction.runnable.code, draft.reconstruction.runnable.details);
  }
  const synchronized = clone(draft.project);
  synchronized.project.circuit = clone(draft.reconstruction.runtimeProjection);
  synchronized.project.layout = runtimeLayout(
    draft.reconstruction.layout,
    draft.reconstruction.runtimeProjection,
    draft.reconstruction.runtimePositionSources,
  );
  return validateContactPersistenceDraft(synchronized, options);
}

export function transitionReconstructedSpdt(value, componentId, to) {
  const result = value?.reconstruction ? value : validateContactPersistenceProject(value);
  if (!result.ok) throw new Error(result.code);
  const contact = result.reconstruction.contacts.find(
    (item) => item.componentId === componentId && item.type === SPDT_CONTACT_TYPE,
  );
  if (!contact) throw new Error('PROJECT_CONTACT_SPDT_UNKNOWN');
  return transitionSwitchContact(contact.state.selectedThrow, to);
}
