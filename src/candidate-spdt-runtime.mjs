// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  validateContactPersistenceProject,
} from '../expansion-drafts/project-v3-contact-persistence.mjs';
import {
  SPDT_CONTACT_TYPE,
  analyzeSwitchContactSafety,
  transitionSwitchContact,
} from '../expansion-drafts/switch-contact-graph-v1.mjs';

export const SPDT_DIGITAL_RUNTIME_SCHEMA = 'intent-mcu-spdt-digital-runtime@1';

const BOARD_TYPE = 'board.atmega328p-16mhz-v1';
const GROUND_REFERENCE_TYPE = 'reference.ground-v1';
const GROUND_PINS = new Set(['GND1', 'GND2', 'GND3']);
const clone = (value) => structuredClone(value);
const error = (code, details = []) => ({ ok: false, code, details });

function acceptedProject(value) {
  if (value?.ok === true && value.reconstruction?.graph && value.project) return value;
  return validateContactPersistenceProject(value);
}

function endpointKey(endpoint) { return `${endpoint.component}.${endpoint.pin}`; }

function terminalNets(graph, componentId) {
  const result = { COM: null, A: null, B: null };
  for (const net of graph.nets) {
    for (const endpoint of net.endpoints) {
      if (endpoint.component === componentId && Object.hasOwn(result, endpoint.pin)) {
        result[endpoint.pin] = net.id;
      }
    }
  }
  return Object.values(result).every(Boolean) ? result : null;
}

function netClasses(graph) {
  const components = new Map(graph.components.map((component) => [component.id, component]));
  return Object.fromEntries(graph.nets.map((net) => {
    const classes = new Set();
    for (const endpoint of net.endpoints) {
      const component = components.get(endpoint.component);
      if (component?.type === GROUND_REFERENCE_TYPE && endpoint.pin === 'REF') {
        classes.add('ground.reference');
      }
      if (component?.type === BOARD_TYPE && GROUND_PINS.has(endpoint.pin)) {
        classes.add('ground.reference');
      }
      if (component?.type === BOARD_TYPE && endpoint.pin === '5V') {
        classes.add('power.5v-reference');
      }
    }
    return [net.id, [...classes].sort()];
  }));
}

function boardInput(graph, netId) {
  const components = new Map(graph.components.map((component) => [component.id, component]));
  const net = graph.nets.find((item) => item.id === netId);
  const pins = (net?.endpoints ?? []).filter((endpoint) => {
    const component = components.get(endpoint.component);
    return component?.type === BOARD_TYPE && /^D(?:[0-9]|1[0-3])$/u.test(endpoint.pin);
  });
  return pins.length === 1 ? pins[0] : null;
}

function levelForReference(classes, netId) {
  const selected = new Set(classes[netId] ?? []);
  if (selected.size !== 1) return null;
  if (selected.has('ground.reference')) return false;
  if (selected.has('power.5v-reference')) return true;
  return null;
}

function evaluateAccepted(accepted, componentId, selectedThrow, drivers) {
  const graph = accepted.reconstruction.graph;
  const component = graph.components.find((item) => item.id === componentId);
  if (!component || component.type !== SPDT_CONTACT_TYPE) {
    return error('SPDT_RUNTIME_COMPONENT', [componentId]);
  }
  if (!['A', 'B'].includes(selectedThrow)) return error('SPDT_RUNTIME_STATE', [componentId]);
  const terminals = terminalNets(graph, componentId);
  if (!terminals) return error('SPDT_RUNTIME_TERMINALS', [componentId]);
  const classes = netClasses(graph);
  const safety = analyzeSwitchContactSafety({ terminalNets: terminals, netClasses: classes, drivers }, selectedThrow);
  if (!safety.ok) return error(`SPDT_RUNTIME_${safety.code}`, safety.diagnostics);
  const board = boardInput(graph, terminals.COM);
  if (!board) return error('SPDT_RUNTIME_DIGITAL_INPUT', [componentId, terminals.COM]);
  const selectedNet = terminals[selectedThrow];
  const level = levelForReference(classes, selectedNet);
  if (level === null) return error('SPDT_RUNTIME_REFERENCE_UNSUPPORTED', [componentId, selectedNet]);
  return {
    ok: true,
    code: 'OK',
    projection: {
      schema: SPDT_DIGITAL_RUNTIME_SCHEMA,
      componentId,
      selectedThrow,
      boardEndpoint: clone(board),
      boardPin: board.pin,
      boardPinNumber: Number(board.pin.slice(1)),
      terminalNets: clone(terminals),
      activeContact: clone(safety.activeContact),
      isolatedTerminal: selectedThrow === 'A' ? 'B' : 'A',
      selectedNet,
      level,
      electricalReference: level ? 'power.5v-reference' : 'ground.reference',
      transitionPolicy: 'break-before-make',
      limitations: [
        'Ideal direct digital-input projection only.',
        'BREAK is applied as an INPUT_PULLUP release level; high-impedance analogue behavior is not modelled.',
        'Contact resistance, bounce, switching delay, arcing and output-drive inference are not modelled.',
      ],
    },
  };
}

export function evaluateSpdtDigitalInput(value, componentId, { drivers = {} } = {}) {
  const accepted = acceptedProject(value);
  if (!accepted.ok) return error(accepted.code, accepted.details ?? []);
  const contact = accepted.reconstruction.contacts.find(
    (item) => item.componentId === componentId && item.type === SPDT_CONTACT_TYPE,
  );
  if (!contact) return error('SPDT_RUNTIME_COMPONENT', [componentId]);
  return evaluateAccepted(accepted, componentId, contact.state.selectedThrow, drivers);
}

export function createSpdtDigitalTransition(value, componentId, to, { drivers = {} } = {}) {
  const accepted = acceptedProject(value);
  if (!accepted.ok) return error(accepted.code, accepted.details ?? []);
  const contact = accepted.reconstruction.contacts.find(
    (item) => item.componentId === componentId && item.type === SPDT_CONTACT_TYPE,
  );
  if (!contact) return error('SPDT_RUNTIME_COMPONENT', [componentId]);
  const fromResult = evaluateAccepted(accepted, componentId, contact.state.selectedThrow, drivers);
  if (!fromResult.ok) return fromResult;
  const toResult = evaluateAccepted(accepted, componentId, to, drivers);
  if (!toResult.ok) return toResult;
  const contactTransition = transitionSwitchContact(contact.state.selectedThrow, to);
  const frames = contactTransition.frames.map((frame) => ({
    state: frame.state,
    activeContacts: clone(frame.activeContacts),
    mode: frame.state === 'BREAK' ? 'released-input-pullup' : 'reference-drive',
    level: frame.state === 'BREAK'
      ? null
      : frame.state === contact.state.selectedThrow
        ? fromResult.projection.level
        : toResult.projection.level,
  }));
  return {
    ok: true,
    code: 'OK',
    transition: {
      schema: SPDT_DIGITAL_RUNTIME_SCHEMA,
      componentId,
      boardPin: fromResult.projection.boardPin,
      boardPinNumber: fromResult.projection.boardPinNumber,
      from: contact.state.selectedThrow,
      to,
      policy: contactTransition.policy,
      breakObserved: contactTransition.breakObserved,
      frames,
    },
  };
}

function digitalAdapter(value) {
  return value && typeof value.setDigitalPin === 'function';
}

export function applySpdtDigitalInput(adapter, result) {
  if (!digitalAdapter(adapter)) return error('SPDT_RUNTIME_ADAPTER');
  if (!result?.ok || result.projection?.schema !== SPDT_DIGITAL_RUNTIME_SCHEMA) {
    return error(result?.code ?? 'SPDT_RUNTIME_PROJECTION');
  }
  adapter.setDigitalPin(result.projection.boardPinNumber, result.projection.level);
  return {
    ok: true,
    code: 'OK',
    applied: [{
      state: result.projection.selectedThrow,
      pin: result.projection.boardPin,
      level: result.projection.level,
      mode: 'reference-drive',
    }],
  };
}

export function applySpdtDigitalTransition(adapter, result, { releasedPullupLevel = true } = {}) {
  if (!digitalAdapter(adapter)) return error('SPDT_RUNTIME_ADAPTER');
  if (!result?.ok || result.transition?.schema !== SPDT_DIGITAL_RUNTIME_SCHEMA) {
    return error(result?.code ?? 'SPDT_RUNTIME_TRANSITION');
  }
  if (releasedPullupLevel !== true) return error('SPDT_RUNTIME_RELEASE_MODEL');
  const applied = [];
  for (const frame of result.transition.frames) {
    const level = frame.state === 'BREAK' ? releasedPullupLevel : frame.level;
    adapter.setDigitalPin(result.transition.boardPinNumber, level);
    applied.push({
      state: frame.state,
      pin: result.transition.boardPin,
      level,
      mode: frame.mode,
      activeContacts: clone(frame.activeContacts),
    });
  }
  return { ok: true, code: 'OK', applied };
}
