// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { normalizeStoredRoute } from './route-model.mjs';
import { withComponentAppearance, withComponentAppearanceBody } from './component-appearance.mjs';
import {
  GROUND_REFERENCE_3V3_TYPE, MOMENTARY_BUTTON_3V3_TYPE, POTENTIOMETER_3V3_TYPE, TOGGLE_SWITCH_3V3_TYPE,
} from './bounded-3v3-authoring-contracts.mjs';
import { ELECTROLYTIC_CAPACITOR_TYPE, FIXED_INDUCTOR_TYPE, NONPOLAR_CAPACITOR_TYPE,
  PASSIVE_ENERGY_STORAGE_DEFINITIONS } from '../expansion-drafts/passive-energy-storage-components-v1.mjs';
import { DIODE_COMPONENT_DEFINITIONS, SCHOTTKY_DIODE_TYPE,
  SILICON_DIODE_TYPE, ZENER_DIODE_TYPE } from '../expansion-drafts/diode-components-v1.mjs';

const clone = (value) => structuredClone(value);
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;
const sameEndpoint = (left, right) => endpointKey(left) === endpointKey(right);

export const BOUNDED_COMPONENT_CATALOG_SCHEMA = 'intent-mcu-bounded-component-catalog@1';
export const BOUNDED_RESISTOR_TYPE = 'resistor.fixed-v1';
export const BOUNDED_LED_TYPE = 'led.basic-v1';
export { GROUND_REFERENCE_3V3_TYPE, MOMENTARY_BUTTON_3V3_TYPE, POTENTIOMETER_3V3_TYPE, TOGGLE_SWITCH_3V3_TYPE };
const COMPONENT_ID_STEMS = Object.freeze({ [BOUNDED_RESISTOR_TYPE]: 'resistor', [BOUNDED_LED_TYPE]: 'led',
  [GROUND_REFERENCE_3V3_TYPE]: 'ground', [MOMENTARY_BUTTON_3V3_TYPE]: 'button',
  [TOGGLE_SWITCH_3V3_TYPE]: 'switch', [POTENTIOMETER_3V3_TYPE]: 'potentiometer',
  [NONPOLAR_CAPACITOR_TYPE]: 'capacitor', [ELECTROLYTIC_CAPACITOR_TYPE]: 'electrolytic',
  [FIXED_INDUCTOR_TYPE]: 'inductor', [SILICON_DIODE_TYPE]: 'diode',
  [SCHOTTKY_DIODE_TYPE]: 'schottky', [ZENER_DIODE_TYPE]: 'zener' });
const COMPONENT_ID_COUNTER_KEYS = Object.freeze([...new Set(Object.values(COMPONENT_ID_STEMS))].sort());

export function normalizeBoundedIdCounters(value, components) {
  const derived = Object.fromEntries(COMPONENT_ID_COUNTER_KEYS.map((stem) => [stem, 0]));
  for (const component of components) {
    const stem = COMPONENT_ID_STEMS[component.type];
    const match = stem && new RegExp(`^${stem}-([1-9]|1[0-6])$`, 'u').exec(component.id);
    if (match) derived[stem] = Math.max(derived[stem], Number(match[1]));
  }
  if (value === undefined) return derived;
  if (!value || Array.isArray(value) || Object.keys(value).some((key) => !COMPONENT_ID_COUNTER_KEYS.includes(key))) {
    throw Object.assign(new Error('BOUNDED_ID_COUNTERS_INVALID'), { code: 'BOUNDED_ID_COUNTERS_INVALID' });
  }
  for (const stem of COMPONENT_ID_COUNTER_KEYS) {
    const counter = value[stem] ?? 0;
    if (!Number.isInteger(counter) || counter < derived[stem] || counter > 16) {
      throw Object.assign(new Error('BOUNDED_ID_COUNTERS_INVALID'), { code: 'BOUNDED_ID_COUNTERS_INVALID' });
    }
    derived[stem] = counter;
  }
  return derived;
}
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
  nominalVolts, ledCurrentLimitAmps, ledForwardVolts, boardPins = [],
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
      fixed: true, addable: false, pins: Object.freeze([...boardPins]),
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
      part({
        id: 'ground-1', type: GROUND_REFERENCE_3V3_TYPE,
        displayName: '3.3 V ground reference', label: 'Ground reference', properties: {},
        position: { x: 0.78, y: 0.78, rotation: 0 }, supportedProperties: {},
        pins: ['GND'], limitation: 'Authoring-only 0 V reference; it grants no executable or physical-hardware authority.',
      }),
      part({
        id: 'button-1', type: MOMENTARY_BUTTON_3V3_TYPE,
        displayName: 'Momentary button', label: 'Momentary button', properties: { defaultClosed: false },
        position: { x: 0.72, y: 0.58, rotation: 0 }, supportedProperties: {},
        pins: ['A', 'B'], limitation: 'Authoring-only passive 0–3.3 V contact; runtime behavior is intentionally unavailable.',
      }),
      part({
        id: 'switch-1', type: TOGGLE_SWITCH_3V3_TYPE,
        displayName: 'Toggle switch', label: 'Toggle switch', properties: { defaultClosed: false },
        position: { x: 0.58, y: 0.72, rotation: 0 }, supportedProperties: {},
        pins: ['A', 'B'], limitation: 'Authoring-only passive 0–3.3 V contact; runtime behavior is intentionally unavailable.',
      }),
      part({
        id: 'potentiometer-1', type: POTENTIOMETER_3V3_TYPE,
        displayName: 'Linear potentiometer', label: '10 kΩ linear potentiometer',
        properties: { ohms: 10_000, taper: 'linear' },
        position: { x: 0.42, y: 0.72, rotation: 0 },
        supportedProperties: { ohms: { kind: 'number', minimum: 1, maximum: 10_000_000, unit: 'Ω' },
          taper: { kind: 'enum', values: Object.freeze(['linear']) } },
        pins: ['HIGH', 'WIPER', 'LOW'],
        limitation: 'Authoring-only passive three-terminal network rated for 0–3.3 V; GPIO HIGH is not a proven supply, and no ADC runtime, loading, noise or physical tolerance model is provided.',
      }),
      ...Object.values(PASSIVE_ENERGY_STORAGE_DEFINITIONS).map((definition, index) => part({
        id: `${COMPONENT_ID_STEMS[definition.type]}-1`, type: definition.type,
        displayName: definition.displayName, label: definition.displayName,
        properties: Object.fromEntries(definition.propertyKeys.map((key) =>
          [key, definition.propertySchema[key].default])),
        position: { x: 0.34 + index * 0.14, y: 0.84, rotation: 0 },
        supportedProperties: Object.fromEntries(definition.propertyKeys.map((key) =>
          [key, { ...definition.propertySchema[key] }])),
        pins: definition.pins.map(({ id }) => id),
        limitation: definition.support.limitations.join(' '),
      })),
      ...Object.values(DIODE_COMPONENT_DEFINITIONS).map((definition, index) => part({
        id: `${COMPONENT_ID_STEMS[definition.type]}-1`, type: definition.type,
        displayName: definition.displayName, label: definition.displayName,
        properties: Object.fromEntries(definition.propertyKeys.map((key) =>
          [key, definition.propertySchema[key].default])),
        position: { x: 0.34 + index * 0.14, y: 0.92, rotation: 0 },
        supportedProperties: Object.fromEntries(definition.propertyKeys.map((key) =>
          [key, { ...definition.propertySchema[key] }])),
        pins: definition.pins.map(({ id }) => id),
        limitation: definition.support.limitations.join(' '),
      })),
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
  authoringSourcePins = [sourcePin], authoringGroundPins = [groundPin],
  resistorType = 'resistor.fixed-v1', ledType = 'led.basic-v1',
}) {
  const is = (draft, endpoint, type, pins) => endpointType(draft, endpoint) === type && pins.includes(endpoint.pin);
  const pair = (draft, left, right, leftType, leftPins, rightType, rightPins) =>
    is(draft, left, leftType, leftPins) && is(draft, right, rightType, rightPins)
    || is(draft, right, leftType, leftPins) && is(draft, left, rightType, rightPins);
  return (draft, left, right) => {
    const resistor = [left, right].find((point) => endpointType(draft, point) === resistorType);
    const led = [left, right].find((point) => endpointType(draft, point) === ledType);
    if (pair(draft, left, right, boardType, authoringSourcePins, resistorType, ['A', 'B'])) {
      const board = [left, right].find((point) => endpointType(draft, point) === boardType);
      if (board?.pin === sourcePin && resistor?.component === 'resistor-1') return sourceNetId;
      return `net-${board?.pin.toLowerCase()}-${resistor.component}-drive`.slice(0, 48);
    }
    if (pair(draft, left, right, resistorType, ['A', 'B'], ledType, ['ANODE'])) {
      return resistor?.component === 'resistor-1' && led?.component === 'led-1'
        ? 'net-series' : `net-${resistor.component}-${led.component}`;
    }
    if (pair(draft, left, right, ledType, ['CATHODE'], boardType, authoringGroundPins)) {
      const board = [left, right].find((point) => endpointType(draft, point) === boardType);
      if (board?.pin === groundPin) return led?.component === 'led-1' ? 'net-ground' : `net-${led.component}-ground`;
      return `net-${led.component}-${board?.pin.toLowerCase()}-ground`.slice(0, 48);
    }
    const authoringOnly = new Set([GROUND_REFERENCE_3V3_TYPE, MOMENTARY_BUTTON_3V3_TYPE,
      TOGGLE_SWITCH_3V3_TYPE, POTENTIOMETER_3V3_TYPE,
      ...Object.keys(PASSIVE_ENERGY_STORAGE_DEFINITIONS), ...Object.keys(DIODE_COMPONENT_DEFINITIONS)]);
    if (authoringOnly.has(endpointType(draft, left)) || authoringOnly.has(endpointType(draft, right))) {
      return `net-${[endpointKey(left), endpointKey(right)].sort().join('-').replaceAll('.', '-')}`.toLowerCase().slice(0, 48);
    }
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
    this.apiTransactionHead = null;
    this.apiRedoTransaction = null;
    this.issuedComponentIds = new Set(this.draft.components.map(({ id }) => id));
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
          present: presentTypes.has(part.type), count: this.draft.components.filter((item) => item.type === part.type).length,
          addable: !presentTypes.has(part.type) && (this.draft.layout.idCounters?.[COMPONENT_ID_STEMS[part.type]] ?? 0) < 16,
          repeatable: this.draft.components.length < 17
            && (this.draft.layout.idCounters?.[COMPONENT_ID_STEMS[part.type]] ?? 0) < 16, fixed: false,
        })),
      ],
    };
  }

  nextComponentId(type) {
    const stem = COMPONENT_ID_STEMS[type] ?? null;
    if (!stem) return null;
    const minimum = Math.max(1, (this.draft.layout.idCounters?.[stem] ?? 0) + 1);
    for (let index = minimum; index <= 16; index += 1) {
      const id = `${stem}-${index}`;
      if (!this.issuedComponentIds.has(id)) return id;
    }
    return null;
  }

  reserveComponentId(draft, id, type) {
    const stem = COMPONENT_ID_STEMS[type];
    const sequence = Number(id.split('-').at(-1));
    draft.layout.idCounters ??= {};
    draft.layout.idCounters[stem] = Math.max(draft.layout.idCounters[stem] ?? 0, sequence);
  }

  preserveIdLineage(target, source) {
    target.layout.idCounters ??= {};
    for (const stem of COMPONENT_ID_COUNTER_KEYS) {
      target.layout.idCounters[stem] = Math.max(target.layout.idCounters[stem] ?? 0,
        source.layout.idCounters?.[stem] ?? 0);
    }
    return this.normalize(target);
  }

  newProject() {
    const next = clone(this.createDefault());
    const board = next.components.find((component) => component.type === this.fixedComponentType);
    next.components = [board];
    next.nets = [];
    next.layout.positions = { [board.id]: next.layout.positions[board.id] };
    next.layout.wireStyles = {};
    next.layout.wireRoutes = {};
    next.layout.idCounters = {};
    next.layout.componentAppearance = { schema: 'intent-mcu-component-appearance@1', components: {} };
    this.issuedComponentIds = new Set([board.id]);
    return { ok: true, changed: true, code: this.code('NEW_PROJECT'),
      ...this.commit(next, { kind: 'component', id: board.id }) };
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
    for (const { id } of normalized.components) this.issuedComponentIds.add(id);
    this.selection = clone(selection);
    this.wireDraft = { mode: 'none' };
    this.revision += 1;
    this.apiTransactionHead = null;
    this.apiRedoTransaction = null;
    return { ...this.snapshot(), changeKind };
  }

  applyApiBatch(operations, transactionId) {
    if (!Array.isArray(operations) || !operations.length || operations.length > 16
        || typeof transactionId !== 'string' || !transactionId) return this.fail('API_BATCH_INVALID');
    const next = clone(this.draft);
    const endpointKnown = (point) => {
      const component = next.components.find((item) => item.id === point?.component);
      if (!component || typeof point?.pin !== 'string') return false;
      if (component.type === this.componentPolicy.board.type) {
        return this.componentPolicy.board.pins.includes(point.pin);
      }
      const policy = this.componentPolicy.parts.find((item) => item.type === component.type);
      if (policy?.pins) return policy.pins.includes(point.pin);
      const defaults = this.createDefault();
      const types = new Map(defaults.components.map((item) => [item.id, item.type]));
      return defaults.nets.some((net) => net.endpoints.some((candidate) => types.get(candidate.component) === component.type && candidate.pin === point.pin));
    };
    const connected = (point) => next.nets.some((net) => net.endpoints.some((item) => sameEndpoint(item, point)));
    try {
      for (const operation of operations) {
        if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new Error('SHAPE');
        if (operation.command === 'component.add') {
          const policy = this.componentPolicy.parts.find((part) => part.type === operation.type);
          const expectedStem = this.nextComponentId(operation.type)?.split('-')[0] ?? null;
          if (!policy || !new RegExp(`^${expectedStem}-(?:[1-9]|1[0-6])$`, 'u').test(operation.id)
              || Number(operation.id.split('-').at(-1)) !== (next.layout.idCounters?.[expectedStem] ?? 0) + 1
              || next.components.some((item) => item.id === operation.id)
              || !operation.position || !Number.isFinite(operation.position.x) || !Number.isFinite(operation.position.y)
              || !Number.isFinite(operation.position.rotation)) throw new Error('COMPONENT_ADD_INVALID');
          next.components.push({ id: operation.id, type: policy.type,
            label: operation.id === policy.id ? policy.label : `${policy.displayName} ${operation.id.split('-').at(-1)}`,
            properties: clone(policy.properties), controls: {} });
          next.layout.positions[operation.id] = clone(operation.position);
          this.reserveComponentId(next, operation.id, operation.type);
        } else if (operation.command === 'component.duplicate') {
          const source = next.components.find((item) => item.id === operation.component_id);
          const policy = source && this.componentPolicy.parts.find((part) => part.type === source.type);
          const expectedStem = source ? this.nextComponentId(source.type)?.split('-')[0] ?? null : null;
          if (!source || !policy || !expectedStem
              || !new RegExp(`^${expectedStem}-(?:[1-9]|1[0-6])$`, 'u').test(operation.id)
              || Number(operation.id.split('-').at(-1)) !== (next.layout.idCounters?.[expectedStem] ?? 0) + 1
              || next.components.some((item) => item.id === operation.id)
              || !operation.position || !Number.isFinite(operation.position.x) || !Number.isFinite(operation.position.y)
              || !Number.isFinite(operation.position.rotation)) throw new Error('COMPONENT_DUPLICATE_INVALID');
          next.components.push({ ...clone(source), id: operation.id,
            label: `${policy.displayName} ${operation.id.split('-').at(-1)}` });
          next.layout.positions[operation.id] = clone(operation.position);
          this.reserveComponentId(next, operation.id, source.type);
        } else if (operation.command === 'component.remove') {
          const target = next.components.find((item) => item.id === operation.component_id);
          if (!target || target.type === this.fixedComponentType) throw new Error('COMPONENT_REMOVE_INVALID');
          next.components = next.components.filter((item) => item.id !== target.id);
          next.nets = next.nets.filter((net) => !net.endpoints.some((point) => point.component === target.id));
          delete next.layout.positions[target.id];
          delete next.layout.componentAppearance?.components?.[target.id];
          const retainedNets = new Set(next.nets.map(({ id }) => id));
          for (const netId of Object.keys(next.layout.wireStyles)) {
            if (!retainedNets.has(netId)) delete next.layout.wireStyles[netId];
          }
          for (const netId of Object.keys(next.layout.wireRoutes ?? {})) {
            if (!retainedNets.has(netId)) delete next.layout.wireRoutes[netId];
          }
        } else if (operation.command === 'component.property.set') {
          const target = next.components.find((item) => item.id === operation.component_id);
          const policy = target && this.componentPolicy.parts.find((part) => part.type === target.type);
          const contract = policy?.supportedProperties[operation.key];
          if (!contract || contract.kind === 'number' && (typeof operation.value !== 'number'
              || !Number.isFinite(operation.value) || operation.value < contract.minimum || operation.value > contract.maximum)
              || contract.kind === 'enum' && !contract.values.includes(operation.value)) throw new Error('PROPERTY_INVALID');
          target.properties[operation.key] = clone(operation.value);
          if (target.type === BOUNDED_RESISTOR_TYPE && operation.key === 'ohms') {
            target.label = `${operation.value} Ω series resistor`;
          }
          if (target.type === BOUNDED_LED_TYPE && operation.key === 'color') {
            target.label = `External ${operation.value} LED`;
          }
          if (target.type === POTENTIOMETER_3V3_TYPE && operation.key === 'ohms') {
            target.label = `${operation.value} Ω linear potentiometer`;
          }
        } else if (operation.command === 'wire.connect') {
          if (!endpointKnown(operation.from) || !endpointKnown(operation.to) || connected(operation.from) || connected(operation.to)
              || this.resolveNetId(next, operation.from, operation.to) !== operation.net_id
              || next.nets.some((net) => net.id === operation.net_id)) throw new Error('WIRE_CONNECT_INVALID');
          next.nets.push({ id: operation.net_id, endpoints: [clone(operation.from), clone(operation.to)] });
          next.layout.wireStyles[operation.net_id] = this.createDefault().layout.wireStyles[operation.net_id] ?? '#39dff2';
        } else if (operation.command === 'wire.branch.connect') {
          const net = next.nets.find((item) => item.id === operation.net_id);
          if (!net || net.endpoints.length >= 8 || !endpointKnown(operation.endpoint)
              || connected(operation.endpoint)) throw new Error('WIRE_BRANCH_CONNECT_INVALID');
          net.endpoints.push(clone(operation.endpoint));
          delete next.layout.wireRoutes?.[net.id];
        } else if (operation.command === 'wire.disconnect') {
          const net = next.nets.find((item) => item.id === operation.net_id);
          if (!net) throw new Error('WIRE_MISSING');
          if (operation.endpoint !== undefined) {
            if (net.endpoints.length <= 2 || !net.endpoints.some((point) => sameEndpoint(point, operation.endpoint))) {
              throw new Error('WIRE_BRANCH_DISCONNECT_INVALID');
            }
            net.endpoints = net.endpoints.filter((point) => !sameEndpoint(point, operation.endpoint));
            delete next.layout.wireRoutes?.[net.id];
          } else {
            next.nets = next.nets.filter((item) => item.id !== operation.net_id);
            delete next.layout.wireStyles[operation.net_id];
            delete next.layout.wireRoutes?.[operation.net_id];
          }
        } else throw new Error('COMMAND_UNSUPPORTED');
      }
      if (!this.validatePropertyPair(next).ok) throw new Error('ELECTRICAL_LIMIT');
      const result = this.commit(next);
      this.apiTransactionHead = transactionId;
      return { ok: true, code: this.code('API_BATCH_COMMITTED'), transactionId, ...result };
    } catch (error) {
      return this.fail(`API_${error.message}`);
    }
  }

  undoApi(transactionId) {
    if (this.apiTransactionHead !== transactionId) return this.fail('API_TRANSACTION_CONFLICT');
    const result = this.undo();
    if (result.ok) this.apiRedoTransaction = transactionId;
    return result;
  }

  redoApi(transactionId) {
    if (this.apiRedoTransaction !== transactionId) return this.fail('API_TRANSACTION_CONFLICT');
    const result = this.redo();
    if (result.ok) this.apiTransactionHead = transactionId;
    return result;
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
    const id = this.nextComponentId(type);
    if (!id) return this.fail('COMPONENT_LIMIT', { type });
    const next = clone(this.draft);
    next.components.push({
      id, type: policy.type, label: id === policy.id ? policy.label : `${policy.displayName} ${id.split('-').at(-1)}`,
      properties: clone(policy.properties), controls: {},
    });
    next.layout.positions[id] = position === null ? clone(policy.position) : {
      x: Math.max(0.08, Math.min(0.92, position.x)),
      y: Math.max(0.1, Math.min(0.9, position.y)),
      rotation: policy.position.rotation,
    };
    this.reserveComponentId(next, id, type);
    const electrical = this.validatePropertyPair(next);
    if (!electrical.ok) {
      return this.fail('COMPONENT_PROPERTY_ELECTRICAL_LIMIT', {
        type, nominalVolts: this.componentPolicy.nominalVolts,
        currentAmps: electrical.currentAmps, limitAmps: this.componentPolicy.ledCurrentLimitAmps,
      });
    }
    try {
      return { ok: true, changed: true, code: this.code('COMPONENT_ADDED'), componentId: id,
        ...this.commit(next, { kind: 'component', id }) };
    } catch (error) {
      return this.fail('COMPONENT_ADD_INVALID', { type, cause: error.code ?? error.message });
    }
  }

  addComponent(type, position = null) {
    if (type === this.componentPolicy.board.type) return this.fail('BOARD_FIXED');
    const policy = this.componentPolicy.parts.find((part) => part.type === type);
    const id = policy && this.nextComponentId(type);
    if (!policy || !id) return this.fail(policy
      ? (this.draft.layout.idCounters?.[COMPONENT_ID_STEMS[type]] ?? 0) >= 16
        ? 'COMPONENT_ID_LINEAGE_EXHAUSTED' : 'COMPONENT_LIMIT'
      : 'COMPONENT_UNSUPPORTED', { type });
    if (position !== null && (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y))) {
      return this.fail('COMPONENT_ADD_POSITION_INVALID', { type });
    }
    const index = Number(id.split('-').at(-1));
    const next = clone(this.draft);
    next.components.push({ id, type: policy.type,
      label: type === BOUNDED_RESISTOR_TYPE ? `220 Ω resistor ${index}`
        : type === BOUNDED_LED_TYPE ? `External red LED ${index}` : `${policy.displayName} ${index}`,
      properties: clone(policy.properties), controls: {} });
    const fallback = { x: Math.min(0.88, policy.position.x + ((index - 1) % 4) * 0.08),
      y: Math.min(0.86, policy.position.y + Math.floor((index - 1) / 4) * 0.12), rotation: policy.position.rotation };
    next.layout.positions[id] = position === null ? fallback : {
      x: Math.max(0.08, Math.min(0.92, position.x)), y: Math.max(0.1, Math.min(0.9, position.y)),
      rotation: policy.position.rotation,
    };
    this.reserveComponentId(next, id, type);
    try {
      return { ok: true, changed: true, code: this.code('COMPONENT_ADDED'), componentId: id,
        ...this.commit(next, { kind: 'component', id }) };
    } catch (error) {
      return this.fail('COMPONENT_ADD_INVALID', { type, cause: error.code ?? error.message });
    }
  }

  duplicateComponent(componentId, position = null) {
    const source = this.draft.components.find((component) => component.id === componentId);
    const policy = source && this.componentPolicy.parts.find((part) => part.type === source.type);
    const id = policy && this.nextComponentId(source.type);
    if (!source || source.type === this.fixedComponentType || !policy || !id) {
      return this.fail(source && policy
        ? (this.draft.layout.idCounters?.[COMPONENT_ID_STEMS[source.type]] ?? 0) >= 16
          ? 'COMPONENT_ID_LINEAGE_EXHAUSTED' : 'COMPONENT_LIMIT'
        : 'COMPONENT_DUPLICATE_UNSUPPORTED', { componentId });
    }
    if (position !== null && (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y))) {
      return this.fail('COMPONENT_DUPLICATE_POSITION_INVALID', { componentId });
    }
    const next = clone(this.draft);
    const sourcePosition = next.layout.positions[componentId];
    next.components.push({ ...clone(source), id, label: `${policy.displayName} ${id.split('-').at(-1)}` });
    next.layout.positions[id] = position === null ? {
      x: Math.min(0.92, sourcePosition.x + 0.08), y: Math.min(0.9, sourcePosition.y + 0.08),
      rotation: sourcePosition.rotation,
    } : { x: Math.max(0.08, Math.min(0.92, position.x)), y: Math.max(0.1, Math.min(0.9, position.y)),
      rotation: sourcePosition.rotation };
    this.reserveComponentId(next, id, source.type);
    try {
      return { ok: true, changed: true, code: this.code('COMPONENT_DUPLICATED'),
        componentId: id, sourceComponentId: componentId,
        ...this.commit(next, { kind: 'component', id }) };
    } catch (error) {
      return this.fail('COMPONENT_DUPLICATE_INVALID', { componentId, cause: error.code ?? error.message });
    }
  }

  setComponentProperty(componentId, key, value) {
    const component = this.draft.components.find((candidate) => candidate.id === componentId);
    const policy = component && this.componentPolicy.parts.find((part) => part.type === component.type);
    const contract = policy?.supportedProperties[key];
    if (!component || !policy || !contract || !Object.hasOwn(component.properties, key)) {
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
    if (target.type === POTENTIOMETER_3V3_TYPE && key === 'ohms') target.label = `${value} Ω linear potentiometer`;
    if (PASSIVE_ENERGY_STORAGE_DEFINITIONS[target.type]) {
      target.label = PASSIVE_ENERGY_STORAGE_DEFINITIONS[target.type].displayName;
    }
    if (DIODE_COMPONENT_DEFINITIONS[target.type]) target.label = DIODE_COMPONENT_DEFINITIONS[target.type].displayName;
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
    if (component.type === this.componentPolicy.board.type && this.componentPolicy.board.pins) {
      return this.componentPolicy.board.pins.includes(endpoint.pin);
    }
    const policy = this.componentPolicy.parts.find((item) => item.type === component.type);
    if (policy?.pins) return policy.pins.includes(endpoint.pin);
    const defaults = this.createDefault();
    const defaultTypes = new Map(defaults.components.map((candidate) => [candidate.id, candidate.type]));
    const supportedPins = new Set(defaults.nets.flatMap((net) => net.endpoints.filter((candidate) => defaultTypes.get(candidate.component) === component.type).map((candidate) => candidate.pin)));
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

  beginBranch(netId = this.selection.kind === 'net' ? this.selection.id : null) {
    const net = this.draft.nets.find((candidate) => candidate.id === netId);
    if (!net || net.endpoints.length >= 8) return this.fail('NET_BRANCH_UNAVAILABLE');
    this.selection = { kind: 'net', id: net.id };
    this.wireDraft = { mode: 'branch-target', netId: net.id };
    return { ok: true, changed: false, code: this.code('BRANCH_TARGET_REQUIRED'), ...this.snapshot() };
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

  branchEndpoint(netId, endpoint) {
    const net = this.draft.nets.find((candidate) => candidate.id === netId);
    if (!net || net.endpoints.length >= 8 || !this.isKnownEndpoint(endpoint)) return this.fail('BRANCH_INVALID');
    if (endpointConnection(this.draft, endpoint)) return this.fail('ENDPOINT_OCCUPIED');
    const next = clone(this.draft);
    next.nets.find((candidate) => candidate.id === netId).endpoints.push(clone(endpoint));
    delete next.layout.wireRoutes?.[netId];
    try {
      return { ok: true, changed: true, code: this.code('BRANCH_CREATED'), netId,
        ...this.commit(next, { kind: 'net', id: netId }) };
    } catch (error) { return this.fail(error.code ?? 'BRANCH_INVALID'); }
  }

  deleteBranch(netId, endpoint) {
    const net = this.draft.nets.find((candidate) => candidate.id === netId);
    if (!net || net.endpoints.length <= 2 || !net.endpoints.some((point) => sameEndpoint(point, endpoint))) {
      return this.fail('BRANCH_DELETE_INVALID');
    }
    const next = clone(this.draft);
    next.nets.find((candidate) => candidate.id === netId).endpoints = net.endpoints
      .filter((point) => !sameEndpoint(point, endpoint)).map(clone);
    delete next.layout.wireRoutes?.[netId];
    try {
      return { ok: true, changed: true, code: this.code('BRANCH_DELETED'), netId,
        ...this.commit(next, { kind: 'net', id: netId }) };
    } catch (error) { return this.fail(error.code ?? 'BRANCH_DELETE_INVALID'); }
  }

  activateEndpoint(endpoint) {
    if (this.wireDraft.mode === 'none') return this.startWire(endpoint);
    if (this.wireDraft.mode === 'connect-target') return this.connectEndpoints(this.wireDraft.from, endpoint);
    if (this.wireDraft.mode === 'branch-target') return this.branchEndpoint(this.wireDraft.netId, endpoint);
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
    this.draft = this.preserveIdLineage(this.history.pop(), this.draft);
    this.selection = { kind: 'none' };
    this.wireDraft = { mode: 'none' };
    this.revision += 1;
    this.apiTransactionHead = null;
    this.apiRedoTransaction = null;
    return { ok: true, code: this.code('UNDONE'), changeKind, ...this.snapshot() };
  }

  redo() {
    if (!this.future.length) return { ok: false, code: this.code('REDO_EMPTY'), ...this.snapshot() };
    this.history.push(this.draft);
    const changeKind = this.futureKinds.pop() ?? 'electrical';
    this.historyKinds.push(changeKind);
    if (this.history.length > this.historyLimit) { this.history.shift(); this.historyKinds.shift(); }
    this.draft = this.preserveIdLineage(this.future.pop(), this.draft);
    this.selection = { kind: 'none' };
    this.wireDraft = { mode: 'none' };
    this.revision += 1;
    this.apiTransactionHead = null;
    this.apiRedoTransaction = null;
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
