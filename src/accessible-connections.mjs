// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const ACCESSIBLE_CONNECTION_VIEW_SCHEMA = 'intent-mcu-accessible-connection-view@1';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/u;
const PROFILE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\u0000') === [...keys].sort().join('\u0000');
const validText = (value, maximum = 160) => typeof value === 'string'
  && value.length > 0 && value.length <= maximum && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value);
const fail = (code) => { throw Object.assign(new Error(code), { code }); };

function freezeView(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freezeView(item);
    Object.freeze(value);
  }
  return value;
}

function normalizedValidation(value) {
  if (!exactKeys(value, ['checked', 'ok', 'code', 'diagnostics']) || value.checked !== true
      || typeof value.ok !== 'boolean' || !validText(value.code)
      || !Array.isArray(value.diagnostics) || value.diagnostics.length > 64
      || value.diagnostics.some((item) => !validText(item, 320))) fail('ACCESSIBLE_CONNECTION_VALIDATION_INVALID');
  return { ok: value.ok, code: value.code, diagnostics: [...value.diagnostics] };
}

function normalizedCatalogue(value, componentTypes) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('ACCESSIBLE_CONNECTION_CATALOGUE_INVALID');
  const catalogue = new Map();
  for (const type of componentTypes) {
    const definition = value[type];
    if (!definition || !validText(definition.displayName) || !Array.isArray(definition.pins)
        || definition.pins.length > 128) fail('ACCESSIBLE_CONNECTION_CATALOGUE_INVALID');
    const pinIds = new Set();
    const pins = definition.pins.map((pin) => {
      if (!pin || !ID.test(pin.id) || !validText(pin.label) || pinIds.has(pin.id)) {
        fail('ACCESSIBLE_CONNECTION_CATALOGUE_INVALID');
      }
      pinIds.add(pin.id);
      return { id: pin.id, label: pin.label };
    }).sort((left, right) => compare(left.id, right.id));
    catalogue.set(type, { displayName: definition.displayName, pins, pinIds });
  }
  return catalogue;
}

/**
 * Project one already schema-checked graph into a transient semantic view.
 * This function never infers a connection and deliberately ignores layout
 * coordinates. Optional cable colour is presentation metadata, not identity.
 */
export function createAccessibleConnectionView(input) {
  if (!exactKeys(input, [
    'profile', 'revision', 'components', 'nets', 'junctions', 'catalogue',
    'wireColors', 'limits', 'validation',
  ]) || !PROFILE.test(input.profile) || !Number.isSafeInteger(input.revision) || input.revision < 0
      || !Array.isArray(input.components) || !Array.isArray(input.nets) || !Array.isArray(input.junctions)
      || input.wireColors === null || typeof input.wireColors !== 'object' || Array.isArray(input.wireColors)
      || !exactKeys(input.limits, ['components', 'nets', 'endpoints'])
      || !Object.values(input.limits).every((value) => Number.isSafeInteger(value) && value >= 0)) {
    fail('ACCESSIBLE_CONNECTION_INPUT_INVALID');
  }
  const validation = normalizedValidation(input.validation);
  const endpointTotal = input.nets.reduce((count, net) => count + (Array.isArray(net?.endpoints) ? net.endpoints.length : 0), 0);
  if (input.components.length > input.limits.components || input.nets.length > input.limits.nets
      || endpointTotal > input.limits.endpoints) fail('ACCESSIBLE_CONNECTION_LIMIT_EXCEEDED');

  const componentIds = new Set();
  const componentTypes = new Set();
  for (const component of input.components) {
    if (!component || !ID.test(component.id) || !validText(component.type, 128) || !validText(component.label)
        || componentIds.has(component.id)) fail('ACCESSIBLE_CONNECTION_COMPONENT_INVALID');
    componentIds.add(component.id); componentTypes.add(component.type);
  }
  const catalogue = normalizedCatalogue(input.catalogue, componentTypes);
  const componentsById = new Map(input.components.map((component) => [component.id, component]));
  const occupied = new Map();
  const netIds = new Set();
  const normalizedNets = input.nets.map((net) => {
    if (!net || !ID.test(net.id) || netIds.has(net.id) || !Array.isArray(net.endpoints)
        || net.endpoints.length < 2) fail('ACCESSIBLE_CONNECTION_NET_INVALID');
    netIds.add(net.id);
    const endpoints = net.endpoints.map((endpoint) => {
      if (!exactKeys(endpoint, ['component', 'pin']) || !ID.test(endpoint.component) || !ID.test(endpoint.pin)) {
        fail('ACCESSIBLE_CONNECTION_ENDPOINT_INVALID');
      }
      const component = componentsById.get(endpoint.component);
      const definition = component && catalogue.get(component.type);
      if (!component || !definition?.pinIds.has(endpoint.pin)) fail('ACCESSIBLE_CONNECTION_ENDPOINT_UNKNOWN');
      const key = `${endpoint.component}.${endpoint.pin}`;
      if (occupied.has(key)) fail('ACCESSIBLE_CONNECTION_ENDPOINT_DUPLICATE');
      occupied.set(key, net.id);
      const pin = definition.pins.find((item) => item.id === endpoint.pin);
      return {
        key, componentId: component.id, componentLabel: component.label,
        pinId: pin.id, pinLabel: pin.label,
        label: `${component.label} — ${pin.label} (${key})`,
      };
    }).sort((left, right) => compare(left.key, right.key));
    return { id: net.id, endpoints };
  }).sort((left, right) => compare(left.id, right.id));

  const junctionsByNet = new Map(normalizedNets.map((net) => [net.id, []]));
  const junctionIds = new Set();
  for (const junction of input.junctions) {
    if (!junction || !ID.test(junction.id) || !ID.test(junction.net)
        || junctionIds.has(junction.id) || !junctionsByNet.has(junction.net)) {
      fail('ACCESSIBLE_CONNECTION_JUNCTION_INVALID');
    }
    junctionIds.add(junction.id); junctionsByNet.get(junction.net).push(junction.id);
  }

  const components = input.components.map((component) => {
    const definition = catalogue.get(component.type);
    const pins = definition.pins.map((pin) => {
      const key = `${component.id}.${pin.id}`;
      const netId = occupied.get(key) ?? null;
      return {
        key, id: pin.id, label: pin.label, netId, connected: netId !== null,
        accessibleLabel: `${component.label} — ${pin.label} (${key})${netId ? `, connected to ${netId}` : ', free'}`,
      };
    });
    return { id: component.id, type: component.type, label: component.label,
      typeLabel: definition.displayName, pins };
  }).sort((left, right) => compare(left.id, right.id));

  const nets = normalizedNets.map((net) => ({
    ...net,
    junctions: junctionsByNet.get(net.id).sort(compare),
    color: typeof input.wireColors[net.id] === 'string' ? input.wireColors[net.id] : null,
    accessibleLabel: `${net.id}: ${net.endpoints.map((endpoint) => endpoint.label).join(' to ')}`,
  }));
  const pins = components.flatMap((component) => component.pins.map((pin) => ({
    ...pin, componentId: component.id, componentLabel: component.label,
  }))).sort((left, right) => compare(left.key, right.key));
  const semanticIdentity = JSON.stringify({
    profile: input.profile,
    components: components.map(({ id, type, label, pins: rows }) => ({
      id, type, label, pins: rows.map(({ key, id: pinId, label: pinLabel, netId }) => ({ key, id: pinId, label: pinLabel, netId })),
    })),
    nets: nets.map(({ id, endpoints, junctions }) => ({ id, endpoints: endpoints.map(({ key }) => key), junctions })),
  });
  return freezeView({
    schema: ACCESSIBLE_CONNECTION_VIEW_SCHEMA,
    profile: input.profile,
    revision: input.revision,
    semanticIdentity,
    validation,
    summary: { components: components.length, pins: pins.length, nets: nets.length, endpoints: endpointTotal },
    components, pins, nets,
  });
}
