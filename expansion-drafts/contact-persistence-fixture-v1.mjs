// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { projectFromCircuit } from '../src/project-editor.mjs';
import {
  replaceBoardGroundEndpointsWithReferences,
} from './ground-reference-integration-v1.mjs';
import {
  CANDIDATE_LAYOUT_SCHEMA,
  COMPILED_FIXTURE_REFERENCE_SCHEMA,
  createContactPersistenceDraft,
  createContactPersistenceProject,
} from './project-v3-contact-persistence.mjs';
import { migrateProjectV2ToV3 } from './project-v3-envelope.mjs';
import { createSwitchContactComponent } from './switch-contact-graph-v1.mjs';
import {
  replaceMomentaryButtonsWithToggleSwitches,
  setToggleSwitchClosed,
  validateToggleSwitchCircuit,
} from './toggle-switch-integration-v1.mjs';

const SOURCE = `// Original project fixture: active-low button D2 controls LED D13.
void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, digitalRead(2) == LOW ? HIGH : LOW);
}
`;
const clone = (value) => structuredClone(value);

export const BUTTON_PULLUP_FIXTURE_REFERENCE = Object.freeze({
  schema: COMPILED_FIXTURE_REFERENCE_SCHEMA,
  id: 'button-pullup',
  profile: 'board.atmega328p-16mhz-v1',
  toolchainImageId: 'sha256:f04aa7a8c37699d16a965fb374870ff147ca776ba6386f81e7700e350ed3d89f',
  source: {
    sha256: '84ceea4f298483f4696a3672ac1fff97b046b9e35c65aaa6155b20140a66f518',
    bytes: 209,
  },
  executable: {
    format: 'intel-hex',
    sha256: '247f94bb051e9eebb4dfe8099278d810e04ccbf097f1b3ddb53b904e26ea8ebc',
    bytes: 2525,
  },
  debug: {
    format: 'elf',
    sha256: '23a37eff7f7c5b1d0626e12a3f31e00d9b79466eab374cd0d74c46e3667150bd',
    bytes: 14632,
  },
  artifactIdentitySha256: '69ad0bc87ba02a2d33ac4c5ba1d9bd07e28636b631cd007f4b9423889e76bd3b',
});

function candidateCircuit() {
  const openToggle = replaceMomentaryButtonsWithToggleSwitches(DEFAULT_CIRCUIT);
  const toggleId = openToggle.components.find((component) => component.type === 'switch.toggle-spst-v1').id;
  const closedToggle = setToggleSwitchClosed(openToggle, toggleId, true);
  const graph = replaceBoardGroundEndpointsWithReferences(closedToggle);
  const selector = createSwitchContactComponent('selector-1', 'Input source selector', { selectedThrow: 'A' });
  graph.components.push(selector);
  const groundNet = graph.nets.find((net) => net.endpoints.some((endpoint) => endpoint.component.startsWith('ground-reference-')));
  const fiveVoltNet = graph.nets.find((net) => net.endpoints.some((endpoint) => endpoint.pin === '5V'));
  const board = graph.components.find((component) => component.type === 'board.atmega328p-16mhz-v1');
  if (!groundNet || !fiveVoltNet || !board) throw new Error('CONTACT_PERSISTENCE_FIXTURE_GRAPH');
  groundNet.endpoints.push({ component: selector.id, pin: 'A' });
  fiveVoltNet.endpoints.push({ component: selector.id, pin: 'B' });
  graph.nets.push({
    id: 'net-selector-com',
    endpoints: [{ component: board.id, pin: 'D4' }, { component: selector.id, pin: 'COM' }],
  });
  return { graph, closedToggle };
}

function candidateLayout(graph) {
  const positions = {
    'board-1': { x: 0.28, y: 0.43, rotation: 0 },
    'resistor-1': { x: 0.57, y: 0.15, rotation: 0 },
    'led-1': { x: 0.79, y: 0.15, rotation: 0 },
    'resistor-2': { x: 0.57, y: 0.32, rotation: 0 },
    'led-2': { x: 0.79, y: 0.32, rotation: 0 },
    'toggle-switch-1': { x: 0.73, y: 0.55, rotation: 0 },
    'pot-1': { x: 0.48, y: 0.78, rotation: 0 },
    'ground-reference-1': { x: 0.76, y: 0.79, rotation: 0 },
    'selector-1': { x: 0.18, y: 0.79, rotation: 0 },
  };
  const componentIds = graph.components.map((component) => component.id).sort();
  if (Object.keys(positions).sort().join('|') !== componentIds.join('|')) {
    throw new Error('CONTACT_PERSISTENCE_FIXTURE_LAYOUT');
  }
  const selectorNet = graph.nets.find((net) => net.id === 'net-selector-com');
  if (!selectorNet) throw new Error('CONTACT_PERSISTENCE_FIXTURE_LAYOUT');
  const hub = { x: 0.27, y: 0.68 };
  return {
    schema: CANDIDATE_LAYOUT_SCHEMA,
    positions,
    wireRoutes: {
      'net-selector-com': {
        schema: 'intent-mcu-route@1',
        branches: selectorNet.endpoints.map((endpoint) => ({ endpoint: clone(endpoint), points: [clone(hub)] })),
      },
    },
    viewport: { zoom: 1, panX: 0, panY: 0 },
  };
}

export function createContactPersistenceExampleInputs() {
  const { graph, closedToggle } = candidateCircuit();
  const toggleValidation = validateToggleSwitchCircuit(closedToggle);
  if (!toggleValidation.ok) throw new Error(toggleValidation.code);
  const baseV2 = projectFromCircuit(toggleValidation.runtimeGraph, SOURCE);
  baseV2.metadata.name = 'Ground, SPST and SPDT persistence proof';
  const migrated = migrateProjectV2ToV3(baseV2);
  if (!migrated.ok) throw new Error(migrated.code);
  return {
    baseV2: clone(baseV2),
    baseV3: clone(migrated.project),
    candidateCircuit: clone(graph),
    candidateLayout: candidateLayout(graph),
    compiledFixture: clone(BUTTON_PULLUP_FIXTURE_REFERENCE),
  };
}

export function createContactPersistenceExample() {
  const inputs = createContactPersistenceExampleInputs();
  return createContactPersistenceProject(
    inputs.baseV3, inputs.candidateCircuit, inputs.candidateLayout, inputs.compiledFixture,
  );
}

export function createEditableContactDraft(source = SOURCE) {
  const baseV2 = projectFromCircuit(DEFAULT_CIRCUIT, source);
  baseV2.metadata.name = 'Editable Ground, SPST and SPDT draft';
  const migrated = migrateProjectV2ToV3(baseV2);
  if (!migrated.ok) throw new Error(migrated.code);
  return createContactPersistenceDraft(
    migrated.project,
    DEFAULT_CIRCUIT,
    {
      schema: CANDIDATE_LAYOUT_SCHEMA,
      positions: clone(migrated.project.layout.positions),
      wireRoutes: clone(migrated.project.layout.wireRoutes),
      viewport: clone(migrated.project.layout.viewport),
    },
    BUTTON_PULLUP_FIXTURE_REFERENCE,
  );
}
