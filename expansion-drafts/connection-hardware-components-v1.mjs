// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';

export const MINI_BREADBOARD_TYPE = 'wiring.breadboard-mini-4-row-v1';
export const TERMINAL_BLOCK_2_POSITION_TYPE = 'connector.terminal-block-2-position-v1';

const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const terminalGroupPin = (id, label, terminals, x, y) => ({
  id, label, role: 'passive-terminal', signals: ['passive.net-group'],
  capabilities: ['passive.net-group'],
  constraints: { terminals, attachmentTerminal: terminals[0] }, anchor: { x, y },
});
const artwork = (renderer, viewBox, cssWidth, cssHeight) => ({
  renderer, thumbnail: renderer, viewBox, cssWidth, cssHeight,
  provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
  license: 'Apache-2.0',
});
const support = (specific) => ({ status: 'visual', limitations: [specific,
  'Each listed physical contact group is one logical authoring endpoint; branch wiring must explicitly join that endpoint to one authored net.',
  'No contact resistance, current capacity, voltage rating, heating, parasitics, insertion mechanics, wear, creepage, clearance, certification, Build/Run authority, safety protection or physical-hardware equivalence is modelled.',
] });

const breadboardPins = [];
for (let row = 1; row <= 4; row += 1) {
  const y = (29 + (row - 1) * 25) / 130;
  breadboardPins.push(
    terminalGroupPin('L' + row, 'Row ' + row + ' left · A–E',
      ['A', 'B', 'C', 'D', 'E'].map((column) => column + row), 0.025, y),
    terminalGroupPin('R' + row, 'Row ' + row + ' right · F–J',
      ['F', 'G', 'H', 'I', 'J'].map((column) => column + row), 0.975, y),
  );
}

const terminalBlockPins = [
  terminalGroupPin('P1', 'Pole 1 · wire clamp ↔ PCB leg',
    ['P1-WIRE', 'P1-PCB'], 38 / 150, 0.93),
  terminalGroupPin('P2', 'Pole 2 · wire clamp ↔ PCB leg',
    ['P2-WIRE', 'P2-PCB'], 112 / 150, 0.93),
];

export const CONNECTION_HARDWARE_DEFINITIONS = freeze({
  [MINI_BREADBOARD_TYPE]: {
    family: 'wiring.solderless-breadboard', variant: 'mini-four-row-no-rails',
    type: MINI_BREADBOARD_TYPE, version: 1,
    displayName: 'Mini breadboard (4 rows)', manufacturer: 'Intent Learning',
    partNumber: 'IL-BREADBOARD-MINI-4R-AUTHORING', pins: breadboardPins,
    propertyKeys: [], propertySchema: {}, controlKeys: [],
    modelRef: 'model.breadboard-mini-4-row-authoring-only-v1',
    internalTerminalGroups: breadboardPins.map(({ id, constraints }) =>
      ({ pin: id, terminals: constraints.terminals })),
    selectable: true, artwork: artwork('connection-breadboard-mini-4-row',
      [0, 0, 240, 130], 240, 130),
    catalog: {
      category: 'wiring', aliases: ['breadboard', 'solderless breadboard', 'prototyping board'],
      functions: ['schematic authoring', 'explicit contact-group documentation', 'net branching'],
      interfaces: ['passive'], supplyVolts: { min: 0, max: 5 },
      package: 'four-row solderless breadboard section without power rails',
    },
    support: support('Exactly eight isolated five-contact groups are represented: A–E and F–J for rows 1–4. The centre gap is open and no power rail is present.'),
  },
  [TERMINAL_BLOCK_2_POSITION_TYPE]: {
    family: 'connector.terminal-block', variant: 'two-position-feed-through',
    type: TERMINAL_BLOCK_2_POSITION_TYPE, version: 1,
    displayName: 'Terminal block (2 position)', manufacturer: 'Intent Learning',
    partNumber: 'IL-TERMINAL-BLOCK-2P-AUTHORING', pins: terminalBlockPins,
    propertyKeys: [], propertySchema: {}, controlKeys: [],
    modelRef: 'model.terminal-block-2-position-authoring-only-v1',
    internalTerminalGroups: terminalBlockPins.map(({ id, constraints }) =>
      ({ pin: id, terminals: constraints.terminals })),
    selectable: true, artwork: artwork('connection-terminal-block-2-position',
      [0, 0, 150, 100], 150, 100),
    catalog: {
      category: 'connectors', aliases: ['terminal block', 'screw terminal', 'two pole connector'],
      functions: ['schematic authoring', 'field-wire termination', 'explicit pole documentation'],
      interfaces: ['passive'], supplyVolts: { min: 0, max: 5 },
      package: 'two-position feed-through terminal block',
    },
    support: support('P1-WIRE is common only with P1-PCB and P2-WIRE is common only with P2-PCB; P1 and P2 remain electrically isolated.'),
  },
});

export function createConnectionHardwareComponent(type, id) {
  const definition = CONNECTION_HARDWARE_DEFINITIONS[type];
  if (!definition) throw new TypeError('CONNECTION_HARDWARE_COMPONENT_TYPE');
  return { id, type, label: definition.displayName, properties: {}, controls: {} };
}

export function validateConnectionHardwareComponent(component) {
  const definition = CONNECTION_HARDWARE_DEFINITIONS[component?.type];
  return Boolean(definition
    && exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && typeof component.id === 'string' && component.id
    && typeof component.label === 'string' && component.label
    && exactKeys(component.properties, []) && exactKeys(component.controls, []));
}

export function validateConnectionHardwareAuthoringGraph(graph) {
  if (!Array.isArray(graph?.components) || !Array.isArray(graph?.nets)) {
    return { ok: false, code: 'CONNECTION_HARDWARE_AUTHORING_GRAPH_SHAPE', details: [] };
  }
  const components = graph.components.filter((component) =>
    CONNECTION_HARDWARE_DEFINITIONS[component?.type]);
  if (!components.length) {
    return { ok: false, code: 'CONNECTION_HARDWARE_AUTHORING_COMPONENT_REQUIRED', details: [] };
  }
  for (const component of components) {
    if (!validateConnectionHardwareComponent(component)) {
      return { ok: false, code: 'CONNECTION_HARDWARE_AUTHORING_COMPONENT_INVALID',
        details: [component?.id ?? null] };
    }
    const knownPins = new Set(CONNECTION_HARDWARE_DEFINITIONS[component.type]
      .pins.map(({ id }) => id));
    for (const net of graph.nets) for (const endpoint of net?.endpoints ?? []) {
      if (endpoint.component === component.id && !knownPins.has(endpoint.pin)) {
        return { ok: false, code: 'CONNECTION_HARDWARE_AUTHORING_PIN_UNKNOWN',
          details: [component.id, endpoint.pin] };
      }
    }
  }
  return { ok: true, code: 'CONNECTION_HARDWARE_AUTHORING_GRAPH_ACCEPTED_DATA_ONLY',
    executable: false, componentIds: components.map(({ id }) => id).sort() };
}
