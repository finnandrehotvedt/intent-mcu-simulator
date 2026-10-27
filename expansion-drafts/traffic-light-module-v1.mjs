// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';
import {
  COMMON_CATHODE_RGB_LED_TYPE,
  projectCommonCathodeRgbLeds,
} from './common-cathode-rgb-led-v1.mjs';

export const TRAFFIC_LIGHT_TYPE = 'output.traffic-light-module-v1';
export const TRAFFIC_LIGHT_MODEL = 'model.traffic-light-common-cathode-ideal-v1';
export const TRAFFIC_LIGHT_RENDERER = 'output-traffic-light-module';
export const TRAFFIC_LIGHT_CHANNELS = Object.freeze([
  Object.freeze({ pin: 'RED', rgbPin: 'R', name: 'red', color: 'red' }),
  Object.freeze({ pin: 'AMBER', rgbPin: 'G', name: 'amber', color: 'yellow' }),
  Object.freeze({ pin: 'GREEN', rgbPin: 'B', name: 'green', color: 'green' }),
]);

const clone = (value) => structuredClone(value);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function pin(id, label, x, constraints) {
  return {
    id,
    label,
    role: id === 'COM' ? 'ground' : 'passive',
    signals: id === 'COM' ? ['ground.reference'] : ['passive.current-limited-led-channel'],
    capabilities: id === 'COM' ? ['ground.reference'] : ['passive.current-limited-led-channel'],
    constraints: { ...constraints },
    anchor: { x, y: 0.95 },
  };
}

export const TRAFFIC_LIGHT_DEFINITION = deepFreeze({
  family: 'indicator.traffic-light',
  variant: 'ideal-common-cathode-three-lamp-module',
  type: TRAFFIC_LIGHT_TYPE,
  version: 1,
  displayName: 'Traffic light module',
  manufacturer: 'Intent Learning',
  partNumber: 'IL-TRAFFIC-3-CC',
  pins: [
    pin('RED', 'Red lamp anode · external resistor required', 0.14,
      { polarity: 'anode', channel: 'red', requiresSeriesResistor: true }),
    pin('AMBER', 'Amber lamp anode · external resistor required', 0.38,
      { polarity: 'anode', channel: 'amber', requiresSeriesResistor: true }),
    pin('GREEN', 'Green lamp anode · external resistor required', 0.64,
      { polarity: 'anode', channel: 'green', requiresSeriesResistor: true }),
    pin('COM', 'Common cathode · ground', 0.88,
      { polarity: 'cathode', commonCathode: true }),
  ],
  propertyKeys: [],
  propertySchema: {},
  controlKeys: [],
  modelRef: TRAFFIC_LIGHT_MODEL,
  internalTerminalGroups: [],
  selectable: true,
  artwork: {
    renderer: TRAFFIC_LIGHT_RENDERER,
    thumbnail: TRAFFIC_LIGHT_RENDERER,
    viewBox: [0, 0, 120, 180],
    cssWidth: 120,
    cssHeight: 180,
    provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced package, photograph or third-party simulator artwork.',
    license: 'Apache-2.0',
  },
  catalog: {
    category: 'displays',
    aliases: ['traffic light', 'stop light', 'red amber green module', 'signal lamps'],
    functions: ['sequenced status indicator', 'three-lamp digital output'],
    interfaces: ['GPIO', 'PWM'],
    supplyVolts: { min: 0, max: 5 },
    package: 'original virtual common-cathode three-lamp module',
  },
  support: {
    status: 'simulated',
    limitations: [
      'Ideal AVR-only common-cathode teaching module projected through three independently validated current-limited LED channels.',
      'RED, AMBER and GREEN each require a dedicated 220 ohm-class series resistor and a distinct supported AVR PWM-capable output; COM must connect to ground.',
      'Only commanded lamp state is represented. No luminous intensity, colourimetry, lens optics, current matching, road-signal timing compliance, fault, thermal or physical-hardware accuracy is claimed.',
    ],
  },
});

export function validateTrafficLightDefinition(definition = TRAFFIC_LIGHT_DEFINITION) {
  return exactKeys(definition, [
    'family', 'variant', 'type', 'version', 'displayName', 'manufacturer', 'partNumber',
    'pins', 'propertyKeys', 'propertySchema', 'controlKeys', 'modelRef',
    'internalTerminalGroups', 'selectable', 'artwork', 'catalog', 'support',
  ]) && JSON.stringify(definition) === JSON.stringify(TRAFFIC_LIGHT_DEFINITION);
}

export function createTrafficLightComponent(id, label = 'Traffic light module') {
  const component = { id, type: TRAFFIC_LIGHT_TYPE, label, properties: {}, controls: {} };
  if (!validateTrafficLightComponent(component)) throw new TypeError('TRAFFIC_LIGHT_STATE');
  return component;
}

export function validateTrafficLightComponent(component) {
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && component.type === TRAFFIC_LIGHT_TYPE
    && exactKeys(component.properties, [])
    && exactKeys(component.controls, []);
}

const toRgbPin = Object.freeze({ RED: 'R', AMBER: 'G', GREEN: 'B', COM: 'COM' });

export function projectTrafficLightModules(value) {
  const graph = clone(value);
  const trafficLights = graph.components.filter((component) => component.type === TRAFFIC_LIGHT_TYPE);
  if (!trafficLights.length) {
    return { ok: true, runtimeGraph: graph, lights: [], runtimePositionSources: {} };
  }
  for (const component of trafficLights) {
    if (!validateTrafficLightComponent(component)) {
      return { ok: false, code: 'TRAFFIC_LIGHT_STATE', details: [component.id] };
    }
  }
  const trafficIds = new Set(trafficLights.map(({ id }) => id));
  graph.components = graph.components.map((component) => trafficIds.has(component.id)
    ? { ...component, type: COMMON_CATHODE_RGB_LED_TYPE }
    : component);
  graph.nets = graph.nets.map((net) => ({
    ...net,
    endpoints: net.endpoints.map((endpoint) => trafficIds.has(endpoint.component)
      ? { ...endpoint, pin: toRgbPin[endpoint.pin] ?? endpoint.pin }
      : endpoint),
  }));
  const projected = projectCommonCathodeRgbLeds(graph);
  if (!projected.ok) {
    return {
      ...projected,
      code: projected.code.replace(/^RGB_LED/u, 'TRAFFIC_LIGHT'),
    };
  }
  const runtimeComponents = new Map(projected.runtimeGraph.components.map((component) => [component.id, component]));
  const lights = projected.leds.map((led) => {
    const original = trafficLights.find(({ id }) => id === led.componentId);
    const channels = Object.fromEntries(TRAFFIC_LIGHT_CHANNELS.map((channel) => {
      const projectedChannel = led.channels[channel.rgbPin];
      const runtimeComponent = runtimeComponents.get(projectedChannel.runtimeComponentId);
      if (runtimeComponent) {
        runtimeComponent.properties.color = channel.color;
        runtimeComponent.label = `${original.label} (${channel.name})`;
      }
      return [channel.pin, {
        ...projectedChannel,
        channel: channel.pin,
        color: channel.color,
      }];
    }));
    return {
      componentId: led.componentId,
      commonNet: led.commonNet,
      commonPolarity: 'cathode',
      channels,
      displayModel: 'three-independent-commanded-lamps-only',
    };
  });
  return {
    ok: true,
    runtimeGraph: projected.runtimeGraph,
    lights,
    runtimePositionSources: projected.runtimePositionSources,
  };
}
