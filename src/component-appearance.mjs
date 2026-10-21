// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';

export const COMPONENT_APPEARANCE_SCHEMA = 'intent-mcu-component-appearance@1';
export const RESISTOR_APPEARANCE_PRESETS = Object.freeze([
  Object.freeze({ id: 'standard-beige', label: 'Standard beige' }),
  Object.freeze({ id: 'cool-blue', label: 'Cool blue' }),
]);
export const LED_APPEARANCE_PRESETS = Object.freeze([
  Object.freeze({ id: 'round-5mm', label: 'Round 5 mm' }),
  Object.freeze({ id: 'soft-square', label: 'Soft square' }),
]);
export const COMPONENT_BODY_BOUNDS = Object.freeze({
  widthPct: Object.freeze({ minimum: 80, maximum: 100, step: 1 }),
  heightPct: Object.freeze({ minimum: 80, maximum: 100, step: 1 }),
  cornerPct: Object.freeze({ minimum: 0, maximum: 100, step: 1 }),
});
export const DEFAULT_COMPONENT_BODY = Object.freeze({ widthPct: 100, heightPct: 100, cornerPct: 100 });

const PRESETS_BY_TYPE = Object.freeze({
  'resistor.fixed-v1': new Set(RESISTOR_APPEARANCE_PRESETS.map(({ id }) => id)),
  'led.basic-v1': new Set(LED_APPEARANCE_PRESETS.map(({ id }) => id)),
});
const DEFAULT_PRESET_BY_TYPE = Object.freeze({
  'resistor.fixed-v1': 'standard-beige',
  'led.basic-v1': 'round-5mm',
});
const SUPPORTED_BOARD_TYPES = new Set([
  'board.atmega328p-16mhz-v1',
  'board.rp2040-pico-v1',
  'board.esp32-c3-devmodule-v1',
  'board.stm32f429zi-nucleo144-v1',
]);
const clone = (value) => structuredClone(value);
const ownObject = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function normalizeBody(value) {
  if (!ownObject(value) || !exactKeys(value, ['widthPct', 'heightPct', 'cornerPct'])) return null;
  const body = {};
  for (const key of ['widthPct', 'heightPct', 'cornerPct']) {
    const number = value[key]; const bounds = COMPONENT_BODY_BOUNDS[key];
    if (!Number.isInteger(number) || number < bounds.minimum || number > bounds.maximum) return null;
    body[key] = number;
  }
  return body;
}

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
  const boardTypes = graph.components.filter(
    (component) => component.type.startsWith('board.'),
  ).map((component) => component.type);
  const supportedGraph = boardTypes.length === 1 && SUPPORTED_BOARD_TYPES.has(boardTypes[0]);
  for (const componentId of Object.keys(source.components).sort(compare)) {
    const component = byId.get(componentId);
    const appearance = source.components[componentId];
    const presets = PRESETS_BY_TYPE[component?.type];
    const keysValid = exactKeys(appearance, ['preset']) || exactKeys(appearance, ['preset', 'body']);
    const body = appearance?.body === undefined ? null : normalizeBody(appearance.body);
    if (!supportedGraph || !component || !presets || !ownObject(appearance)
        || !keysValid || !presets.has(appearance.preset) || (appearance.body !== undefined && !body)) return null;
    components[componentId] = { preset: appearance.preset, ...(body ? { body } : {}) };
  }
  return { schema: COMPONENT_APPEARANCE_SCHEMA, components };
}

export function resistorAppearancePreset(value, componentId) {
  return componentAppearancePreset(value, componentId, 'resistor.fixed-v1');
}

export function componentAppearancePreset(value, componentId, componentType) {
  const presets = PRESETS_BY_TYPE[componentType];
  return value?.schema === COMPONENT_APPEARANCE_SCHEMA
    && presets?.has(value.components?.[componentId]?.preset)
    ? value.components[componentId].preset : DEFAULT_PRESET_BY_TYPE[componentType] ?? null;
}

export function componentAppearanceBody(value, componentId, componentType) {
  if (!PRESETS_BY_TYPE[componentType]) return null;
  const body = normalizeBody(value?.components?.[componentId]?.body);
  return clone(body ?? DEFAULT_COMPONENT_BODY);
}

export function componentAppearanceBodyOrNull(value, componentId, componentType) {
  if (!PRESETS_BY_TYPE[componentType]) return null;
  const body = normalizeBody(value?.components?.[componentId]?.body);
  return body ? clone(body) : null;
}

export function withComponentAppearance(value, graph, componentId, preset) {
  const normalized = normalizeComponentAppearance(value, graph);
  const component = graph?.components?.find((item) => item.id === componentId);
  if (!normalized || !component || !PRESETS_BY_TYPE[component.type]?.has(preset)) {
    throw Object.assign(new Error('COMPONENT_APPEARANCE_INVALID'), {
      code: 'COMPONENT_APPEARANCE_INVALID', details: [componentId, preset],
    });
  }
  normalized.components[componentId] = {
    preset,
    ...(normalized.components[componentId]?.body ? { body: normalized.components[componentId].body } : {}),
  };
  const accepted = normalizeComponentAppearance(normalized, graph, { missing: false });
  if (!accepted) {
    throw Object.assign(new Error('COMPONENT_APPEARANCE_INVALID'), {
      code: 'COMPONENT_APPEARANCE_INVALID', details: [componentId, preset],
    });
  }
  return accepted;
}

export function withComponentAppearanceBody(value, graph, componentId, body) {
  const normalized = normalizeComponentAppearance(value, graph);
  const component = graph?.components?.find((item) => item.id === componentId);
  const acceptedBody = normalizeBody(body);
  if (!normalized || !component || !PRESETS_BY_TYPE[component.type] || !acceptedBody) {
    throw Object.assign(new Error('COMPONENT_APPEARANCE_INVALID'), {
      code: 'COMPONENT_APPEARANCE_INVALID', details: [componentId, body],
    });
  }
  normalized.components[componentId] = {
    preset: componentAppearancePreset(normalized, componentId, component.type), body: acceptedBody,
  };
  const accepted = normalizeComponentAppearance(normalized, graph, { missing: false });
  if (!accepted) throw Object.assign(new Error('COMPONENT_APPEARANCE_INVALID'), {
    code: 'COMPONENT_APPEARANCE_INVALID', details: [componentId, body],
  });
  return accepted;
}

export function withResistorAppearance(value, graph, componentId, preset) {
  const component = graph?.components?.find((item) => item.id === componentId);
  if (component?.type !== 'resistor.fixed-v1') {
    throw Object.assign(new Error('COMPONENT_APPEARANCE_INVALID'), {
      code: 'COMPONENT_APPEARANCE_INVALID', details: [componentId, preset],
    });
  }
  return withComponentAppearance(value, graph, componentId, preset);
}

export function componentAppearanceInvariantSnapshot({
  componentId, graph, layout, source, boardProfile, definition,
}) {
  const component = graph?.components?.find((item) => item.id === componentId);
  const position = layout?.positions?.[componentId];
  const supportedModel = component?.type === 'resistor.fixed-v1'
    ? 'model.resistor-fixed-v1' : component?.type === 'led.basic-v1' ? 'model.led-current-v1' : null;
  if (!component || !supportedModel || !position || !definition
      || definition.type !== component.type || definition.modelRef !== supportedModel) {
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
