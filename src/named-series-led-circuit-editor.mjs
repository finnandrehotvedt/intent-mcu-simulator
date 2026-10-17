// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const clone = (value) => structuredClone(value);
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;
const sameEndpoint = (left, right) => endpointKey(left) === endpointKey(right);

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
    resolveNetId, codePrefix, historyLimit = 32 }) {
    this.normalize = normalize;
    this.validate = validate;
    this.createDefault = createDefault;
    this.fixedComponentType = fixedComponentType;
    this.resolveNetId = resolveNetId;
    this.codePrefix = codePrefix;
    this.historyLimit = historyLimit;
    this.draft = normalize(draft);
    this.selection = { kind: 'none' };
    this.wireDraft = { mode: 'none' };
    this.history = [];
    this.future = [];
    this.revision = 0;
  }

  code(suffix) { return `${this.codePrefix}_${suffix}`; }

  snapshot() {
    return { draft: clone(this.draft), selection: clone(this.selection), wireDraft: clone(this.wireDraft), revision: this.revision,
      canUndo: this.history.length > 0, canRedo: this.future.length > 0,
      validation: this.validate(this.draft) };
  }

  select(selection) {
    const next = selection?.kind === 'component' && this.draft.components.some((item) => item.id === selection.id)
      ? { kind: 'component', id: selection.id }
      : selection?.kind === 'net' && this.draft.nets.some((item) => item.id === selection.id)
        ? { kind: 'net', id: selection.id } : { kind: 'none' };
    this.selection = next;
    return this.snapshot();
  }

  commit(next, selection = { kind: 'none' }) {
    const normalized = this.normalize(next);
    this.history.push(this.draft);
    if (this.history.length > this.historyLimit) this.history.shift();
    this.future = [];
    this.draft = normalized;
    this.selection = clone(selection);
    this.wireDraft = { mode: 'none' };
    this.revision += 1;
    return this.snapshot();
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
      for (const id of Object.keys(next.layout.wireStyles)) {
        if (!next.nets.some((net) => net.id === id)) delete next.layout.wireStyles[id];
      }
      return { ok: true, code: this.code('COMPONENT_DELETED'), ...this.commit(next) };
    }
    const next = clone(this.draft);
    next.nets = next.nets.filter((net) => net.id !== this.selection.id);
    delete next.layout.wireStyles[this.selection.id];
    return { ok: true, code: this.code('NET_DELETED'), ...this.commit(next) };
  }

  fail(suffix) { return { ok: false, changed: false, code: this.code(suffix), ...this.snapshot() }; }

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

  undo() {
    if (!this.history.length) return { ok: false, code: this.code('UNDO_EMPTY'), ...this.snapshot() };
    this.future.push(this.draft);
    if (this.future.length > this.historyLimit) this.future.shift();
    this.draft = this.history.pop();
    this.selection = { kind: 'none' };
    this.wireDraft = { mode: 'none' };
    this.revision += 1;
    return { ok: true, code: this.code('UNDONE'), ...this.snapshot() };
  }

  redo() {
    if (!this.future.length) return { ok: false, code: this.code('REDO_EMPTY'), ...this.snapshot() };
    this.history.push(this.draft);
    if (this.history.length > this.historyLimit) this.history.shift();
    this.draft = this.future.pop();
    this.selection = { kind: 'none' };
    this.wireDraft = { mode: 'none' };
    this.revision += 1;
    return { ok: true, code: this.code('REDONE'), ...this.snapshot() };
  }

  moveComponent(id, x, y) {
    if (!this.draft.components.some((item) => item.id === id) || !Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, code: this.code('COMPONENT_MOVE_INVALID'), ...this.snapshot() };
    }
    const next = clone(this.draft);
    next.layout.positions[id].x = Math.max(0.08, Math.min(0.92, x));
    next.layout.positions[id].y = Math.max(0.1, Math.min(0.9, y));
    return { ok: true, code: this.code('COMPONENT_MOVED'), ...this.commit(next, { kind: 'component', id }) };
  }

  rotateComponent(id) {
    if (!this.draft.components.some((item) => item.id === id)) {
      return { ok: false, code: this.code('COMPONENT_ROTATE_INVALID'), ...this.snapshot() };
    }
    const next = clone(this.draft);
    next.layout.positions[id].rotation = (next.layout.positions[id].rotation + 90) % 360;
    return { ok: true, code: this.code('COMPONENT_ROTATED'), ...this.commit(next, { kind: 'component', id }) };
  }

  restoreExample() {
    return { ok: true, code: this.code('EXAMPLE_RESTORED'), ...this.commit(this.createDefault()) };
  }
}
