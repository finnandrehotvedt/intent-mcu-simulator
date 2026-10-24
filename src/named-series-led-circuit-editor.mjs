// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { normalizeStoredRoute } from './route-model.mjs';
import { withComponentAppearance, withComponentAppearanceBody } from './component-appearance.mjs';

const clone = (value) => structuredClone(value);
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;
const sameEndpoint = (left, right) => endpointKey(left) === endpointKey(right);

export const BOUNDED_COMPONENT_CATALOG_SCHEMA = 'intent-mcu-bounded-component-catalog@1';
export const BOUNDED_RESISTOR_TYPE = 'resistor.fixed-v1';
export const BOUNDED_LED_TYPE = 'led.basic-v1';
export const BOUNDED_WIRE_COLORS = Object.freeze([
  '#39dff2', '#f5c451', '#f04f5f', '#a8ff3f', '#5f8cff', '#303943',
]);

function freezeRecord(value) {
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    item && typeof item === 'object' ? Object.freeze({ ...item }) : item])));
}

/**
 * Create the explicit, deliberately tiny parts contract shared by the three
 * bounded public controller workbenches. It never inherits the AVR catalogue:
 * each profile gets one fixed controller and the same existing resistor/LED
 * definitions with profile-specific electrical limits.
 */
export function createSeriesLedComponentPolicy({
  profile, boardId, boardLabel, resistorPosition, ledPosition,
  nominalVolts, ledCurrentLimitAmps, ledForwardVolts,
}) {
  const part = (value) => Object.freeze({
    ...value,
    properties: Object.freeze({ ...value.properties }),
    position: Object.freeze({ ...value.position }),
    supportedProperties: freezeRecord(value.supportedProperties),
  });
  return Object.freeze({
    schema: BOUNDED_COMPONENT_CATALOG_SCHEMA,
    profile,
    nominalVolts,
    ledCurrentLimitAmps,
    ledForwardVolts: Object.freeze({ ...ledForwardVolts }),
    board: Object.freeze({
      id: boardId, type: profile, displayName: boardLabel,
      fixed: true, addable: false,
      limitation: 'Fixed bounded controller profile; it cannot be added, duplicated or removed.',
    }),
    parts: Object.freeze([
      part({
        id: 'resistor-1', type: BOUNDED_RESISTOR_TYPE,
        displayName: 'Axial fixed resistor', label: '220 Ω series resistor',
        properties: { ohms: 220 }, position: resistorPosition,
        supportedProperties: {
          ohms: { kind: 'number', minimum: 1, maximum: 10_000_000, unit: 'Ω' },
        },
        limitation: 'Bounded ideal series resistance validated against 3.3 V and the selected LED colour; no tolerance or thermal model.',
      }),
      part({
        id: 'led-1', type: BOUNDED_LED_TYPE,
        displayName: '5 mm through-hole LED', label: 'External red LED',
        properties: { color: 'red' }, position: ledPosition,
        supportedProperties: {
          color: { kind: 'enum', values: Object.freeze(Object.keys(ledForwardVolts)) },
        },
        limitation: 'Bounded polarity/current model; colour selects an ideal forward-voltage constant, not wavelength, brightness or physical accuracy.',
      }),
    ]),
  });
}

function endpointConnection(draft, endpoint) {
  return draft.nets.find((net) => net.endpoints.some((candidate) => sameEndpoint(candidate, endpoint))) ?? null;
}

function endpointType(draft, endpoint) {
  return draft.components.find((component) => component.id === endpoint.component)?.type ?? null;
}

/**
 * Build the deliberately narrow connection policy shared by the three public
 * controller -> resistor -> LED -> ground teaching graphs. The resistor leads
 * are interchangeable; every other pin role is exact.
 */
export function createSeriesLedConnectionPolicy({
  boardType, sourcePin, groundPin, sourceNetId,
  resistorType = 'resistor.fixed-v1', ledType = 'led.basic-v1',
}) {
  const is = (draft, endpoint, type, pins) => endpointType(draft, endpoint) === type && pins.includes(endpoint.pin);
  const pair = (draft, left, right, leftType, leftPins, rightType, rightPins) =>
    is(draft, left, leftType, leftPins) && is(draft, right, rightType, rightPins)
    || is(draft, right, leftType, leftPins) && is(draft, left, rightType, rightPins);
  return (draft, left, right) => {
    if (pair(draft, left, right, boardType, [sourcePin], resistorType, ['A', 'B'])) return sourceNetId;
    if (pair(draft, left, right, resistorType, ['A', 'B'], ledType, ['ANODE'])) return 'net-series';
    if (pair(draft, left, right, ledType, ['CATHODE'], boardType, [groundPin])) return 'net-ground';
    return null;
  };
}

/**
 * Shared bounded editor state machine for the named controller -> resistor ->
 * LED -> ground teaching circuits. Electrical validation stays owned by each
 * controller profile; this class shares transactional selection, layout,
 * bounded two-endpoint wire authoring, topology deletion and history behavior.
 */
export class NamedSeriesLedCircuitEditor {
  constructor({ draft, normalize, validate, createDefault, fixedComponentType,
    resolveNetId, componentPolicy, codePrefix, historyLimit = 32 }) {
    this.normalize = normalize;
    this.validate = validate;
    this.createDefault = createDefault;
    this.fixedComponentType = fixedComponentType;
    this.resolveNetId = resolveNetId;
    this.componentPolicy = componentPolicy;
    this.codePrefix = codePrefix;
    this.historyLimit = historyLimit;
    this.draft = normalize(draft);
    this.selection = { kind: 'none' };
    this.wireDraft = { mode: 'none' };
    this.history = [];
    this.future = [];
    this.historyKinds = [];
    this.futureKinds = [];
    this.revision = 0;
  }

  code(suffix) { return `${this.codePrefix}_${suffix}`; }

  snapshot() {
    return { draft: clone(this.draft), selection: clone(this.selection), wireDraft: clone(this.wireDraft), revision: this.revision,
      canUndo: this.history.length > 0, canRedo: this.future.length > 0,
      validation: this.validate(this.draft), catalog: this.componentCatalog() };
  }

  componentCatalog() {
    const presentTypes = new Set(this.draft.components.map((component) => component.type));
    const board = this.componentPolicy.board;
    return {
      schema: this.componentPolicy.schema,
      profile: this.componentPolicy.profile,
      parts: [
        { ...clone(board), present: presentTypes.has(board.type), addable: false },
        ...this.componentPolicy.parts.map((part) => ({
          id: part.id, type: part.type, displayName: part.displayName,
          limitation: part.limitation, supportedProperties: clone(part.supportedProperties),
          present: presentTypes.has(part.type), addable: !presentTypes.has(part.type), fixed: false,
        })),
      ],
    };
  }

  select(selection) {
    const next = selection?.kind === 'component' && this.draft.components.some((item) => item.id === selection.id)
      ? { kind: 'component', id: selection.id }
      : selection?.kind === 'net' && this.draft.nets.some((item) => item.id === selection.id)
        ? { kind: 'net', id: selection.id } : { kind: 'none' };
    this.selection = next;
    return this.snapshot();
  }

  commit(next, selection = { kind: 'none' }, changeKind = 'electrical') {
    const normalized = this.normalize(next);
    this.history.push(this.draft);
    this.historyKinds.push(changeKind);
    if (this.history.length > this.historyLimit) { this.history.shift(); this.historyKinds.shift(); }
    this.future = [];
    this.futureKinds = [];
    this.draft = normalized;
    this.selection = clone(selection);
    this.wireDraft = { mode: 'none' };
    this.revision += 1;
    return { ...this.snapshot(), changeKind };
  }

  deleteSelected() {
    if (this.selection.kind === 'none') return { ok: false, code: this.code('SELECTION_REQUIRED'), ...this.snapshot() };
    if (this.selection.kind === 'component') {
      const selected = this.draft.components.find((item) => item.id === this.selection.id);
      if (selected?.type === this.fixedComponentType) {
        return { ok: false, code: this.code('BOARD_FIXED'), ...this.snapshot() };
      }
      const next = clone(this.draft);
      next.components = next.components.filter((item) => item.id !== this.selection.id);
      next.nets = next.nets.filter((net) => !net.endpoints.some((endpoint) => endpoint.component === this.selection.id));
      delete next.layout.positions[this.selection.id];
      if (next.layout.componentAppearance?.components) {
        delete next.layout.componentAppearance.components[this.selection.id];
      }
      for (const id of Object.keys(next.layout.wireStyles)) {
        if (!next.nets.some((net) => net.id === id)) delete next.layout.wireStyles[id];
      }
      for (const id of Object.keys(next.layout.wireRoutes ?? {})) {
        if (!next.nets.some((net) => net.id === id)) delete next.layout.wireRoutes[id];
      }
      return { ok: true, code: this.code('COMPONENT_DELETED'), ...this.commit(next) };
    }
    const next = clone(this.draft);
    next.nets = next.nets.filter((net) => net.id !== this.selection.id);
    delete next.layout.wireStyles[this.selection.id];
    delete next.layout.wireRoutes?.[this.selection.id];
    return { ok: true, code: this.code('NET_DELETED'), ...this.commit(next) };
  }

  fail(suffix, details = {}) {
    return { ok: false, changed: false, code: this.code(suffix), details: clone(details), ...this.snapshot() };
  }

  propertyPair(draft) {
    const resistorPolicy = this.componentPolicy.parts.find((part) => part.type === BOUNDED_RESISTOR_TYPE);
    const ledPolicy = this.componentPolicy.parts.find((part) => part.type === BOUNDED_LED_TYPE);
    const resistor = draft.components.find((component) => component.type === BOUNDED_RESISTOR_TYPE);
    const led = draft.components.find((component) => component.type === BOUNDED_LED_TYPE);
    return {
      ohms: resistor?.properties.ohms ?? resistorPolicy.properties.ohms,
      color: led?.properties.color ?? ledPolicy.properties.color,
    };
  }

  validatePropertyPair(draft) {
    const { ohms, color } = this.propertyPair(draft);
    const forwardVolts = this.componentPolicy.ledForwardVolts[color];
    const currentAmps = (this.componentPolicy.nominalVolts - forwardVolts) / ohms;
    return Number.isFinite(currentAmps) && currentAmps > 0
      && currentAmps <= this.componentPolicy.ledCurrentLimitAmps
      ? { ok: true, currentAmps, forwardVolts }
      : { ok: false, currentAmps, forwardVolts };
  }

  addMissingComponent(type, position = null) {
    if (type === this.componentPolicy.board.type) return this.fail('BOARD_FIXED');
    const policy = this.componentPolicy.parts.find((part) => part.type === type);
    if (!policy) return this.fail('COMPONENT_UNSUPPORTED', { type });
    if (this.draft.components.some((component) => component.type === type)) {
      return this.fail('COMPONENT_EXISTS', { type });
    }
    if (position !== null && (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y))) {
      return this.fail('COMPONENT_ADD_POSITION_INVALID', { type });
    }
    const next = clone(this.draft);
    next.components.push({
      id: policy.id, type: policy.type, label: policy.label,
      properties: clone(policy.properties), controls: {},
    });
    next.layout.positions[policy.id] = position === null ? clone(policy.position) : {
      x: Math.max(0.08, Math.min(0.92, position.x)),
      y: Math.max(0.1, Math.min(0.9, position.y)),
      rotation: policy.position.rotation,
    };
    const electrical = this.validatePropertyPair(next);
    if (!electrical.ok) {
      return this.fail('COMPONENT_PROPERTY_ELECTRICAL_LIMIT', {
        type, nominalVolts: this.componentPolicy.nominalVolts,
        currentAmps: electrical.currentAmps, limitAmps: this.componentPolicy.ledCurrentLimitAmps,
      });
    }
    try {
      return { ok: true, changed: true, code: this.code('COMPONENT_ADDED'), componentId: policy.id,
        ...this.commit(next, { kind: 'component', id: policy.id }) };
    } catch (error) {
      return this.fail('COMPONENT_ADD_INVALID', { type, cause: error.code ?? error.message });
    }
  }

  setComponentProperty(componentId, key, value) {
    const component = this.draft.components.find((candidate) => candidate.id === componentId);
    const policy = component && this.componentPolicy.parts.find((part) => part.type === component.type);
    const contract = policy?.supportedProperties[key];
    if (!component || !policy || !contract || Object.keys(component.properties).length !== 1) {
      return this.fail('COMPONENT_PROPERTY_UNSUPPORTED', { componentId, key });
    }
    if (contract.kind === 'number' && (typeof value !== 'number' || !Number.isFinite(value)
      || value < contract.minimum || value > contract.maximum)) {
      return this.fail('COMPONENT_PROPERTY_UNSUPPORTED', { componentId, key, value });
    }
    if (contract.kind === 'enum' && (typeof value !== 'string' || !contract.values.includes(value))) {
      return this.fail('COMPONENT_PROPERTY_UNSUPPORTED', { componentId, key, value });
    }
    const next = clone(this.draft);
    const target = next.components.find((candidate) => candidate.id === componentId);
    target.properties[key] = value;
    if (target.type === BOUNDED_RESISTOR_TYPE && key === 'ohms') target.label = `${value} Ω series resistor`;
    if (target.type === BOUNDED_LED_TYPE && key === 'color') target.label = `External ${value} LED`;
    const electrical = this.validatePropertyPair(next);
    if (!electrical.ok) {
      return this.fail('COMPONENT_PROPERTY_ELECTRICAL_LIMIT', {
        componentId, key, value, nominalVolts: this.componentPolicy.nominalVolts,
        currentAmps: electrical.currentAmps, limitAmps: this.componentPolicy.ledCurrentLimitAmps,
      });
    }
    try {
      return { ok: true, changed: true, code: this.code('COMPONENT_PROPERTY_UPDATED'), componentId, key,
        ...this.commit(next, { kind: 'component', id: componentId }) };
    } catch (error) {
      return this.fail('COMPONENT_PROPERTY_UNSUPPORTED', { componentId, key, value, cause: error.code ?? error.message });
    }
  }

  setComponentAppearance(componentId, preset) {
    const component = this.draft.components.find((candidate) => candidate.id === componentId);
    if (!component || ![BOUNDED_RESISTOR_TYPE, BOUNDED_LED_TYPE].includes(component.type)) {
      return this.fail('COMPONENT_APPEARANCE_UNSUPPORTED', { componentId, preset });
    }
    const next = clone(this.draft);
    try {
      next.layout.componentAppearance = withComponentAppearance(
        next.layout.componentAppearance, next, componentId, preset,
      );
      return { ok: true, changed: true, code: this.code('COMPONENT_APPEARANCE_UPDATED'),
        componentId, preset, ...this.commit(next, { kind: 'component', id: componentId }, 'layout') };
    } catch (error) {
      return this.fail('COMPONENT_APPEARANCE_UNSUPPORTED', {
        componentId, preset, cause: error.code ?? error.message,
      });
    }
  }

  setComponentAppearanceBody(componentId, body) {
    const component = this.draft.components.find((candidate) => candidate.id === componentId);
    if (!component || ![BOUNDED_RESISTOR_TYPE, BOUNDED_LED_TYPE].includes(component.type)) {
      return this.fail('COMPONENT_APPEARANCE_UNSUPPORTED', { componentId, body });
    }
    const next = clone(this.draft);
    try {
      next.layout.componentAppearance = withComponentAppearanceBody(
        next.layout.componentAppearance, next, componentId, body,
      );
      return { ok: true, changed: true, code: this.code('COMPONENT_APPEARANCE_UPDATED'),
        componentId, body: clone(body), ...this.commit(next, { kind: 'component', id: componentId }, 'layout') };
    } catch (error) {
      return this.fail('COMPONENT_APPEARANCE_UNSUPPORTED', {
        componentId, body, cause: error.code ?? error.message,
      });
    }
  }

  setComponentAppearanceEdit(componentId, preset, body) {
    const component = this.draft.components.find((candidate) => candidate.id === componentId);
    if (!component || ![BOUNDED_RESISTOR_TYPE, BOUNDED_LED_TYPE].includes(component.type)) {
      return this.fail('COMPONENT_APPEARANCE_UNSUPPORTED', { componentId, preset, body });
    }
    const next = clone(this.draft);
    try {
      const presetAppearance = withComponentAppearance(
        next.layout.componentAppearance, next, componentId, preset,
      );
      next.layout.componentAppearance = withComponentAppearanceBody(
        presetAppearance, next, componentId, body,
      );
      return { ok: true, changed: true, code: this.code('COMPONENT_APPEARANCE_UPDATED'),
        componentId, preset, body: clone(body), ...this.commit(next, { kind: 'component', id: componentId }, 'layout') };
    } catch (error) {
      return this.fail('COMPONENT_APPEARANCE_UNSUPPORTED', {
        componentId, preset, body, cause: error.code ?? error.message,
      });
    }
  }

  isKnownEndpoint(endpoint) {
    const component = this.draft.components.find((candidate) => candidate.id === endpoint?.component);
    if (!component || typeof endpoint?.pin !== 'string') return false;
    const defaults = this.createDefault();
    const defaultTypes = new Map(defaults.components.map((candidate) => [candidate.id, candidate.type]));
    const supportedPins = new Set(defaults.nets.flatMap((net) => net.endpoints
      .filter((candidate) => defaultTypes.get(candidate.component) === component.type)
      .map((candidate) => candidate.pin)));
    return supportedPins.has(endpoint.pin);
  }

  startWire(endpoint) {
    if (!this.resolveNetId || !this.isKnownEndpoint(endpoint)) return this.fail('ENDPOINT_INVALID');
    if (endpointConnection(this.draft, endpoint)) return this.fail('ENDPOINT_OCCUPIED');
    this.wireDraft = { mode: 'connect-target', from: clone(endpoint) };
    return { ok: true, changed: false, code: this.code('WIRE_SOURCE_SELECTED'), ...this.snapshot() };
  }

  beginReconnect(netId = this.selection.kind === 'net' ? this.selection.id : null) {
    const net = this.draft.nets.find((candidate) => candidate.id === netId);
    if (!net) return this.fail('NET_SELECTION_REQUIRED');
    this.selection = { kind: 'net', id: net.id };
    this.wireDraft = { mode: 'reconnect-source', netId: net.id };
    return { ok: true, changed: false, code: this.code('RECONNECT_SOURCE_REQUIRED'), ...this.snapshot() };
  }

  cancelWireDraft() {
    this.wireDraft = { mode: 'none' };
    return { ok: true, changed: false, code: this.code('WIRE_CANCELLED'), ...this.snapshot() };
  }

  connectEndpoints(from, to) {
    if (!this.isKnownEndpoint(from) || !this.isKnownEndpoint(to)) return this.fail('ENDPOINT_INVALID');
    if (sameEndpoint(from, to)) return this.fail('SELF_CONNECTION');
    if (endpointConnection(this.draft, from) || endpointConnection(this.draft, to)) return this.fail('ENDPOINT_OCCUPIED');
    const netId = this.resolveNetId?.(this.draft, from, to);
    if (!netId) return this.fail('CONNECTION_UNSUPPORTED');
    if (this.draft.nets.some((net) => net.id === netId)) return this.fail('NET_EXISTS');
    const next = clone(this.draft);
    next.nets.push({ id: netId, endpoints: [clone(from), clone(to)] });
    const defaults = this.createDefault();
    next.layout.wireStyles[netId] = defaults.layout.wireStyles[netId] ?? '#39dff2';
    try {
      return { ok: true, changed: true, code: this.code('NET_CREATED'), netId,
        ...this.commit(next, { kind: 'net', id: netId }) };
    } catch (error) {
      return this.fail(error.code ?? 'CONNECTION_INVALID');
    }
  }

  reconnectEndpoint(netId, from, to) {
    const net = this.draft.nets.find((candidate) => candidate.id === netId);
    if (!net || !this.isKnownEndpoint(from) || !this.isKnownEndpoint(to)) return this.fail('RECONNECT_INVALID');
    if (!net.endpoints.some((endpoint) => sameEndpoint(endpoint, from))) return this.fail('RECONNECT_SOURCE_INVALID');
    if (sameEndpoint(from, to)) return this.fail('SELF_CONNECTION');
    const occupied = endpointConnection(this.draft, to);
    if (occupied) return this.fail('ENDPOINT_OCCUPIED');
    const endpoints = net.endpoints.map((endpoint) => sameEndpoint(endpoint, from) ? clone(to) : clone(endpoint));
    if (this.resolveNetId?.(this.draft, endpoints[0], endpoints[1]) !== netId) return this.fail('CONNECTION_UNSUPPORTED');
    const next = clone(this.draft);
    next.nets.find((candidate) => candidate.id === netId).endpoints = endpoints;
    delete next.layout.wireRoutes?.[netId];
    try {
      return { ok: true, changed: true, code: this.code('ENDPOINT_RECONNECTED'), netId,
        ...this.commit(next, { kind: 'net', id: netId }) };
    } catch (error) {
      return this.fail(error.code ?? 'RECONNECT_INVALID');
    }
  }

  activateEndpoint(endpoint) {
    if (this.wireDraft.mode === 'none') return this.startWire(endpoint);
    if (this.wireDraft.mode === 'connect-target') return this.connectEndpoints(this.wireDraft.from, endpoint);
    if (this.wireDraft.mode === 'reconnect-source') {
      const net = this.draft.nets.find((candidate) => candidate.id === this.wireDraft.netId);
      if (!net?.endpoints.some((candidate) => sameEndpoint(candidate, endpoint))) return this.fail('RECONNECT_SOURCE_INVALID');
      this.wireDraft = { mode: 'reconnect-target', netId: net.id, from: clone(endpoint) };
      return { ok: true, changed: false, code: this.code('RECONNECT_TARGET_REQUIRED'), ...this.snapshot() };
    }
    return this.reconnectEndpoint(this.wireDraft.netId, this.wireDraft.from, endpoint);
  }

  setWireColor(netId, color) {
    if (!this.draft.nets.some((net) => net.id === netId) || !BOUNDED_WIRE_COLORS.includes(color)) {
      return this.fail('WIRE_COLOR_INVALID', { netId, color });
    }
    if (this.draft.layout.wireStyles[netId] === color) {
      return { ok: true, changed: false, code: this.code('WIRE_COLOR_UNCHANGED'), changeKind: 'layout', ...this.snapshot() };
    }
    const next = clone(this.draft);
    next.layout.wireStyles[netId] = color;
    return { ok: true, changed: true, code: this.code('WIRE_COLOR_UPDATED'), netId,
      ...this.commit(next, { kind: 'net', id: netId }, 'layout') };
  }

  setWireRoute(netId, route) {
    const net = this.draft.nets.find((candidate) => candidate.id === netId);
    const normalized = net ? normalizeStoredRoute(route, net) : null;
    if (!net || !normalized || Array.isArray(normalized)) return this.fail('WIRE_ROUTE_INVALID', { netId });
    if (JSON.stringify(this.draft.layout.wireRoutes?.[netId]) === JSON.stringify(normalized)) {
      return { ok: true, changed: false, code: this.code('WIRE_ROUTE_UNCHANGED'), changeKind: 'layout', ...this.snapshot() };
    }
    const next = clone(this.draft);
    next.layout.wireRoutes ??= {};
    next.layout.wireRoutes[netId] = normalized;
    return { ok: true, changed: true, code: this.code('WIRE_ROUTE_UPDATED'), netId,
      ...this.commit(next, { kind: 'net', id: netId }, 'layout') };
  }

  undo() {
    if (!this.history.length) return { ok: false, code: this.code('UNDO_EMPTY'), ...this.snapshot() };
    this.future.push(this.draft);
    const changeKind = this.historyKinds.pop() ?? 'electrical';
    this.futureKinds.push(changeKind);
    if (this.future.length > this.historyLimit) { this.future.shift(); this.futureKinds.shift(); }
    this.draft = this.history.pop();
    this.selection = { kind: 'none' };
    this.wireDraft = { mode: 'none' };
    this.revision += 1;
    return { ok: true, code: this.code('UNDONE'), changeKind, ...this.snapshot() };
  }

  redo() {
    if (!this.future.length) return { ok: false, code: this.code('REDO_EMPTY'), ...this.snapshot() };
    this.history.push(this.draft);
    const changeKind = this.futureKinds.pop() ?? 'electrical';
    this.historyKinds.push(changeKind);
    if (this.history.length > this.historyLimit) { this.history.shift(); this.historyKinds.shift(); }
    this.draft = this.future.pop();
    this.selection = { kind: 'none' };
    this.wireDraft = { mode: 'none' };
    this.revision += 1;
    return { ok: true, code: this.code('REDONE'), changeKind, ...this.snapshot() };
  }

  moveComponent(id, x, y) {
    if (!this.draft.components.some((item) => item.id === id) || !Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, code: this.code('COMPONENT_MOVE_INVALID'), ...this.snapshot() };
    }
    const next = clone(this.draft);
    next.layout.positions[id].x = Math.max(0.08, Math.min(0.92, x));
    next.layout.positions[id].y = Math.max(0.1, Math.min(0.9, y));
    return { ok: true, code: this.code('COMPONENT_MOVED'),
      ...this.commit(next, { kind: 'component', id }, 'layout') };
  }

  rotateComponent(id) {
    if (!this.draft.components.some((item) => item.id === id)) {
      return { ok: false, code: this.code('COMPONENT_ROTATE_INVALID'), ...this.snapshot() };
    }
    const next = clone(this.draft);
    next.layout.positions[id].rotation = (next.layout.positions[id].rotation + 90) % 360;
    return { ok: true, code: this.code('COMPONENT_ROTATED'),
      ...this.commit(next, { kind: 'component', id }, 'layout') };
  }

  restoreExample() {
    return { ok: true, code: this.code('EXAMPLE_RESTORED'), ...this.commit(this.createDefault()) };
  }
}
