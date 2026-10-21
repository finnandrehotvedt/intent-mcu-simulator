// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';

export const COMPONENT_APPEARANCE_SCHEMA = 'intent-mcu-component-appearance@1';
export const RESISTOR_APPEARANCE_PRESETS = Object.freeze([
  Object.freeze({ id: 'standard-beige', label: 'Standard beige' }),
  Object.freeze({ id: 'cool-blue', label: 'Cool blue' }),
]);

const PRESETS = new Set(RESISTOR_APPEARANCE_PRESETS.map(({ id }) => id));
const clone = (value) => structuredClone(value);
const ownObject = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function normalizedWorldAnchor(anchor, position) {
  const radians = position.rotation * Math.PI / 180;
  const localX = anchor.x - 0.5;
  const localY = anchor.y - 0.5;
  return {
    x: position.x + localX * Math.cos(radians) - localY * Math.sin(radians),
    y: position.y + localX * Math.sin(radians) + localY * Math.cos(radians),
  };
}

export function emptyComponentAppearance() {
  return { schema: COMPONENT_APPEARANCE_SCHEMA, components: {} };
}

export function normalizeComponentAppearance(value, graph, { missing = true } = {}) {
  const source = value === undefined && missing ? emptyComponentAppearance() : value;
  if (!ownObject(source) || !exactKeys(source, ['schema', 'components'])
      || source.schema !== COMPONENT_APPEARANCE_SCHEMA || !ownObject(source.components)
      || !graph || !Array.isArray(graph.components)) return null;
  const byId = new Map(graph.components.map((component) => [component.id, component]));
  const components = {};
  const avrGraph = graph.components.some(
    (component) => component.type === 'board.atmega328p-16mhz-v1',
  ) && !graph.components.some(
    (component) => component.type.startsWith('board.')
      && component.type !== 'board.atmega328p-16mhz-v1',
  );
  for (const componentId of Object.keys(source.components).sort(compare)) {
    const component = byId.get(componentId);
    const appearance = source.components[componentId];
    if (!avrGraph || !component || component.type !== 'resistor.fixed-v1' || !ownObject(appearance)
        || !exactKeys(appearance, ['preset']) || !PRESETS.has(appearance.preset)) return null;
    components[componentId] = { preset: appearance.preset };
  }
  return { schema: COMPONENT_APPEARANCE_SCHEMA, components };
}

export function resistorAppearancePreset(value, componentId) {
  return value?.schema === COMPONENT_APPEARANCE_SCHEMA
    && PRESETS.has(value.components?.[componentId]?.preset)
    ? value.components[componentId].preset : 'standard-beige';
}

export function withResistorAppearance(value, graph, componentId, preset) {
  const normalized = normalizeComponentAppearance(value, graph);
  const component = graph?.components?.find((item) => item.id === componentId);
  if (!normalized || !component || component.type !== 'resistor.fixed-v1' || !PRESETS.has(preset)) {
    throw Object.assign(new Error('COMPONENT_APPEARANCE_INVALID'), {
      code: 'COMPONENT_APPEARANCE_INVALID', details: [componentId, preset],
    });
  }
  normalized.components[componentId] = { preset };
  return normalized;
}

export function componentAppearanceInvariantSnapshot({
  componentId, graph, layout, source, boardProfile, definition,
}) {
  const component = graph?.components?.find((item) => item.id === componentId);
  const position = layout?.positions?.[componentId];
  if (!component || component.type !== 'resistor.fixed-v1' || !position || !definition
      || definition.type !== component.type || definition.modelRef !== 'model.resistor-fixed-v1') {
    throw Object.assign(new Error('COMPONENT_APPEARANCE_INVARIANT_INPUT'), {
      code: 'COMPONENT_APPEARANCE_INVARIANT_INPUT', details: [componentId],
    });
  }
  const nets = (graph.nets ?? []).filter((net) => net.endpoints.some(
    (endpoint) => endpoint.component === componentId,
  )).map((net) => ({ id: net.id, endpoints: clone(net.endpoints) })).sort((left, right) => compare(left.id, right.id));
  return {
    boardProfile,
    source: clone(source),
    component: clone(component),
    modelRef: definition.modelRef,
    pins: definition.pins.map((pin) => ({
      id: pin.id, role: pin.role, signals: [...pin.signals],
      constraints: clone(pin.constraints), anchor: clone(pin.anchor),
      normalizedWorldAnchor: normalizedWorldAnchor(pin.anchor, position),
    })),
    nets,
    position: clone(position),
    artworkGeometry: {
      renderer: definition.artwork.renderer,
      viewBox: [...definition.artwork.viewBox],
      cssWidth: definition.artwork.cssWidth,
      cssHeight: definition.artwork.cssHeight,
    },
  };
}

export function componentAppearanceInvariantReview(before, after) {
  const equal = JSON.stringify(before) === JSON.stringify(after);
  return {
    schema: 'intent-mcu-component-appearance-invariant@1',
    equal,
    changedFields: equal ? [] : ['electrical-or-anchor-state'],
  };
}
