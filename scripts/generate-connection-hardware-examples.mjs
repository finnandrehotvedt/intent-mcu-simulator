#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { MINI_BREADBOARD_TYPE, TERMINAL_BLOCK_2_POSITION_TYPE,
  CONNECTION_HARDWARE_DEFINITIONS, createConnectionHardwareComponent,
  validateConnectionHardwareAuthoringGraph } from '../expansion-drafts/connection-hardware-components-v1.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { validateBounded3v3AuthoringGraph } from '../src/bounded-3v3-authoring-contracts.mjs';
import { Esp32C3CircuitEditor, ESP32C3_BOARD_DEFINITION } from '../src/esp32c3-public-circuit.mjs';
import { C3_PUBLIC_PROJECT_SCHEMA, C3_PUBLIC_SOURCE,
  normalizeEsp32C3PublicProject } from '../src/esp32c3-public-workbench.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief,
  prepareProjectEnvelope } from '../src/project-envelope.mjs';
import { Rp2040PicoCircuitEditor, RP2040_PICO_BOARD_DEFINITION } from '../src/rp2040-pico-circuit.mjs';
import { RP2040_PUBLIC_PROJECT_SCHEMA, RP2040_PUBLIC_SOURCE,
  normalizeRp2040PublicProject } from '../src/rp2040-public-workbench.mjs';
import { Stm32CircuitEditor, STM32_BOARD_DEFINITION } from '../src/stm32-public-circuit.mjs';
import { STM32_EDITABLE_PROJECT_SCHEMA, STM32_PUBLIC_SOURCE,
  normalizeStm32PublicProject } from '../src/stm32-public-workbench.mjs';

const ROOT = new URL('../examples/connection-hardware-components/', import.meta.url);
const AVR = 'board.atmega328p-16mhz-v1';
const TYPES = [MINI_BREADBOARD_TYPE, TERMINAL_BLOCK_2_POSITION_TYPE];
const IDS = ['breadboard-1', 'terminal-block-1'];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const source = 'void setup() { Serial.begin(115200); }\n'
  + 'void loop() {\n'
  + '  Serial.println("CONNECTION HARDWARE IS AUTHORING ONLY");\n'
  + '  delay(500);\n'
  + '}\n';
const behavior = 'authoring-only explicit contact-group data; no continuity solver, electrical rating, parasitic model, Build/Run authority, safety guarantee or physical-hardware equivalence';
const profileBehavior = Object.freeze({
  [AVR]: behavior,
  'board.rp2040-pico-v1': behavior,
  'board.esp32-c3-devmodule-v1': behavior,
  'board.stm32f429zi-nucleo144-v1': behavior,
});

function applyCandidate(session, command) {
  const result = session.apply({ ...command, revision: session.revision });
  if (!result.ok) throw new Error('CONNECTION_HARDWARE_AVR_EXAMPLE:' + command.type + ':' + result.code);
  return result;
}

function wireCandidate(session, board, sourcePin, groundPin) {
  applyCandidate(session, { type: 'wire.create', net: { id: 'net-hardware-source',
    endpoints: [{ component: board, pin: sourcePin }, { component: 'breadboard-1', pin: 'L1' }] } });
  applyCandidate(session, { type: 'wire.branch', netId: 'net-hardware-source',
    endpoint: { component: 'terminal-block-1', pin: 'P1' }, junctionId: 'junction-hardware-source' });
  applyCandidate(session, { type: 'wire.create', net: { id: 'net-hardware-ground',
    endpoints: [{ component: board, pin: groundPin }, { component: 'breadboard-1', pin: 'R1' }] } });
  applyCandidate(session, { type: 'wire.branch', netId: 'net-hardware-ground',
    endpoint: { component: 'terminal-block-1', pin: 'P2' }, junctionId: 'junction-hardware-ground' });
}

function wireNarrow(editor, board, sourcePin, groundPin) {
  const source = editor.connectEndpoints(
    { component: board, pin: sourcePin }, { component: 'breadboard-1', pin: 'L1' });
  if (!source.ok) throw new Error('CONNECTION_HARDWARE_NARROW_SOURCE:' + source.code);
  const sourceBranch = editor.branchEndpoint(source.netId,
    { component: 'terminal-block-1', pin: 'P1' });
  if (!sourceBranch.ok) throw new Error('CONNECTION_HARDWARE_NARROW_SOURCE_BRANCH:' + sourceBranch.code);
  const ground = editor.connectEndpoints(
    { component: board, pin: groundPin }, { component: 'breadboard-1', pin: 'R1' });
  if (!ground.ok) throw new Error('CONNECTION_HARDWARE_NARROW_GROUND:' + ground.code);
  const groundBranch = editor.branchEndpoint(ground.netId,
    { component: 'terminal-block-1', pin: 'P2' });
  if (!groundBranch.ok) throw new Error('CONNECTION_HARDWARE_NARROW_GROUND_BRANCH:' + groundBranch.code);
}

const draft = createEditableContactDraft(source);
if (!draft.ok) throw new Error(draft.code);
draft.project.project.metadata.name = 'Breadboard and terminal-block contact groups';
const avrSession = openCandidateUiSession(canonicalContactPersistenceDraftJson(draft.project)).session;
for (const component of avrSession.visualProject.circuit.components) {
  if (component.id !== 'board-1') applyCandidate(avrSession,
    { type: 'component.remove', componentId: component.id });
}
TYPES.forEach((type, index) => applyCandidate(avrSession, {
  type: 'component.add', component: createConnectionHardwareComponent(type, IDS[index]),
  position: { x: 0.38 + index * 0.3, y: 0.5, rotation: 0 },
}));
wireCandidate(avrSession, 'board-1', 'D2', 'GND1');
const avrProject = JSON.parse(avrSession.saveText());

const narrow = [
  { id: 'pico', profile: 'board.rp2040-pico-v1', schema: RP2040_PUBLIC_PROJECT_SCHEMA,
    source: RP2040_PUBLIC_SOURCE, Editor: Rp2040PicoCircuitEditor, boardDefinition: RP2040_PICO_BOARD_DEFINITION,
    normalize: normalizeRp2040PublicProject, board: 'pico-1', sourcePin: 'GP1', ground: 'GND8' },
  { id: 'esp32-c3', profile: 'board.esp32-c3-devmodule-v1', schema: C3_PUBLIC_PROJECT_SCHEMA,
    source: C3_PUBLIC_SOURCE, Editor: Esp32C3CircuitEditor, boardDefinition: ESP32C3_BOARD_DEFINITION,
    normalize: normalizeEsp32C3PublicProject, board: 'c3-1', sourcePin: 'GPIO3', ground: 'GND8' },
  { id: 'stm32', profile: 'board.stm32f429zi-nucleo144-v1', schema: STM32_EDITABLE_PROJECT_SCHEMA,
    source: STM32_PUBLIC_SOURCE, Editor: Stm32CircuitEditor, boardDefinition: STM32_BOARD_DEFINITION,
    normalize: normalizeStm32PublicProject, board: 'stm32-1', sourcePin: 'PB1', ground: 'GND20' },
];
const adapters = {
  [AVR]: { schemas: ['intent-mcu-project-contact-persistence@1'], prepare(value) {
    const opened = openCandidateUiSession(JSON.stringify(value));
    if (!opened.ok) throw Object.assign(new Error(opened.code), opened);
    return { project: JSON.parse(opened.session.saveText()), prepared: opened.session };
  }, authoringAdmission: ({ project }) =>
    validateConnectionHardwareAuthoringGraph(project.candidateCircuit) },
  ...Object.fromEntries(narrow.map((item) => [item.profile, {
    schemas: [item.schema],
    prepare: (value) => ({ project: item.normalize(value), preserved: ['circuit', 'source'] }),
    authoringAdmission: ({ project }) => validateBounded3v3AuthoringGraph({
      board: item.boardDefinition, components: project.circuit.components, nets: project.circuit.nets,
    }),
  }])),
};

const files = new Map(); const entries = [];
function addEntry({ id, profile, file, project, sourceText, board, sourcePin, ground }) {
  const bytes = canonicalProjectEnvelope(profile, project, adapters, emptyProjectBrief(), null,
    CURRENT_MODEL_LIBRARY_LOCK);
  const reopened = prepareProjectEnvelope(bytes, adapters);
  if (!reopened.ok || reopened.report.modelLibrary.authoringOnly !== true
      || reopened.report.modelLibrary.executableAuthority !== false) {
    throw new Error('CONNECTION_HARDWARE_EXAMPLE_ENVELOPE:' + profile + ':'
      + (reopened.code ?? 'EXECUTABLE_AUTHORITY'));
  }
  files.set(file, bytes);
  entries.push({ id, profile, file, requirementIds: ['CMP-017', 'CMP-018'],
    componentTypes: TYPES, componentIds: IDS,
    terminalGroups: Object.fromEntries(TYPES.map((type) => [type,
      CONNECTION_HARDWARE_DEFINITIONS[type].internalTerminalGroups])),
    namedWiring: [
      board + '.' + sourcePin + ' ↔ breadboard-1.L1 ↔ terminal-block-1.P1',
      board + '.' + ground + ' ↔ breadboard-1.R1 ↔ terminal-block-1.P2',
    ],
    expectedVisibleBehavior: 'Opening restores two original connection-hardware SVGs, eight isolated breadboard groups, two isolated terminal-block poles and two explicit three-endpoint nets.',
    runtimeUnavailableCode: 'CONNECTION_HARDWARE_MODEL_UNAVAILABLE', profileBehavior,
    limitations: 'Explicit contact-group authoring only. No breadboard rails, continuity solver, contact resistance, current/voltage rating, heating, parasitics, insertion mechanics, wear, creepage, clearance, certification, Build/Run authority, safety protection or physical equivalence.',
    sourceSha256: sha256(sourceText), projectSha256: sha256(bytes),
    provenance: 'Original project-owned contracts, SVG artwork, canonical project data and example source.' });
}

addEntry({ id: 'avr-connection-hardware-components', profile: AVR,
  file: 'avr-connection-hardware-components.intent-mcu.json', project: avrProject, sourceText: source,
  board: 'board-1', sourcePin: 'D2', ground: 'GND1' });
for (const item of narrow) {
  const editor = new item.Editor();
  for (const componentId of ['resistor-1', 'led-1']) {
    editor.select({ kind: 'component', id: componentId });
    const result = editor.deleteSelected();
    if (!result.ok) throw new Error('CONNECTION_HARDWARE_' + item.id + '_REMOVE:' + result.code);
  }
  TYPES.forEach((type) => {
    const result = editor.addMissingComponent(type);
    if (!result.ok) throw new Error('CONNECTION_HARDWARE_' + item.id + '_ADD:' + result.code);
  });
  wireNarrow(editor, item.board, item.sourcePin, item.ground);
  const project = { schema: item.schema, name: item.id + ' connection-hardware authoring',
    profile: item.profile, source: item.source, circuit: editor.snapshot().draft };
  addEntry({ id: item.id + '-connection-hardware-components', profile: item.profile,
    file: item.id + '-connection-hardware-components.intent-mcu.json', project,
    sourceText: item.source, board: item.board, sourcePin: item.sourcePin, ground: item.ground });
}

const manifest = { schema: 'intent-mcu-connection-hardware-example-manifest@1',
  modelLibrary: CURRENT_MODEL_LIBRARY_LOCK, requirementIds: ['CMP-017', 'CMP-018'],
  profileBehavior, entries };
files.set('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
if (process.argv.includes('--write')) {
  await mkdir(ROOT, { recursive: true });
  for (const [file, bytes] of files) await writeFile(new URL(file, ROOT), bytes);
} else {
  for (const [file, bytes] of files) {
    if (await readFile(new URL(file, ROOT), 'utf8') !== bytes) {
      throw new Error('CONNECTION_HARDWARE_ARTIFACT_STALE:' + file);
    }
  }
}
