#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { OPTOCOUPLER_TYPE, P_CHANNEL_MOSFET_TYPE,
  SEMICONDUCTOR_ACTIVE_DEFINITIONS, createSemiconductorActiveComponent,
  validateSemiconductorActiveAuthoringGraph } from '../expansion-drafts/semiconductor-active-components-v1.mjs';
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

const ROOT = new URL('../examples/semiconductor-active-components/', import.meta.url);
const AVR = 'board.atmega328p-16mhz-v1';
const TYPES = [P_CHANNEL_MOSFET_TYPE, OPTOCOUPLER_TYPE];
const IDS = ['pmos-1', 'optocoupler-1'];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const source = `void setup() { Serial.begin(115200); }
void loop() {
  Serial.println("RAW ACTIVE SEMICONDUCTORS ARE AUTHORING ONLY");
  delay(500);
}
`;
const behavior = 'authoring-only raw active-semiconductor data; no switching, optical-transfer, isolation runtime, Build/Run authority or physical-hardware equivalence';
const profileBehavior = Object.freeze({
  [AVR]: behavior,
  'board.rp2040-pico-v1': behavior,
  'board.esp32-c3-devmodule-v1': behavior,
  'board.stm32f429zi-nucleo144-v1': behavior,
});

function applyCandidate(session, command) {
  const result = session.apply({ ...command, revision: session.revision });
  if (!result.ok) throw new Error(`SEMICONDUCTOR_ACTIVE_AVR_EXAMPLE:${command.type}:${result.code}`);
  return result;
}

const draft = createEditableContactDraft(source);
if (!draft.ok) throw new Error(draft.code);
draft.project.project.metadata.name = 'Raw P-channel MOSFET and optocoupler authoring network';
const avrSession = openCandidateUiSession(canonicalContactPersistenceDraftJson(draft.project)).session;
for (const component of avrSession.visualProject.circuit.components) {
  if (component.id !== 'board-1') applyCandidate(avrSession,
    { type: 'component.remove', componentId: component.id });
}
TYPES.forEach((type, index) => applyCandidate(avrSession, {
  type: 'component.add', component: createSemiconductorActiveComponent(type, IDS[index]),
  position: { x: 0.45 + index * 0.25, y: 0.5, rotation: 0 },
}));
for (const [id, endpoints] of [
  ['net-pmos-gate', [{ component: 'board-1', pin: 'D2' }, { component: 'pmos-1', pin: 'GATE' }]],
  ['net-output-collector', [{ component: 'pmos-1', pin: 'DRAIN' }, { component: 'optocoupler-1', pin: 'COLLECTOR' }]],
  ['net-output-emitter', [{ component: 'pmos-1', pin: 'SOURCE' }, { component: 'optocoupler-1', pin: 'EMITTER' }]],
  ['net-opto-anode', [{ component: 'board-1', pin: 'D3' }, { component: 'optocoupler-1', pin: 'ANODE' }]],
  ['net-opto-cathode', [{ component: 'board-1', pin: 'GND1' }, { component: 'optocoupler-1', pin: 'CATHODE' }]],
]) applyCandidate(avrSession, { type: 'wire.create', net: { id, endpoints } });
const avrProject = JSON.parse(avrSession.saveText());

const narrow = [
  { id: 'pico', profile: 'board.rp2040-pico-v1', schema: RP2040_PUBLIC_PROJECT_SCHEMA,
    source: RP2040_PUBLIC_SOURCE, Editor: Rp2040PicoCircuitEditor, boardDefinition: RP2040_PICO_BOARD_DEFINITION,
    normalize: normalizeRp2040PublicProject, board: 'pico-1', controls: ['GP1', 'GP2'], ground: 'GND8' },
  { id: 'esp32-c3', profile: 'board.esp32-c3-devmodule-v1', schema: C3_PUBLIC_PROJECT_SCHEMA,
    source: C3_PUBLIC_SOURCE, Editor: Esp32C3CircuitEditor, boardDefinition: ESP32C3_BOARD_DEFINITION,
    normalize: normalizeEsp32C3PublicProject, board: 'c3-1', controls: ['GPIO3', 'GPIO0'], ground: 'GND8' },
  { id: 'stm32', profile: 'board.stm32f429zi-nucleo144-v1', schema: STM32_EDITABLE_PROJECT_SCHEMA,
    source: STM32_PUBLIC_SOURCE, Editor: Stm32CircuitEditor, boardDefinition: STM32_BOARD_DEFINITION,
    normalize: normalizeStm32PublicProject, board: 'stm32-1', controls: ['PB1', 'PB7'], ground: 'GND20' },
];

const adapters = {
  [AVR]: {
    schemas: ['intent-mcu-project-contact-persistence@1'],
    prepare(value) {
      const opened = openCandidateUiSession(JSON.stringify(value));
      if (!opened.ok) throw Object.assign(new Error(opened.code), opened);
      return { project: JSON.parse(opened.session.saveText()), prepared: opened.session,
        preserved: ['candidateCircuit', 'candidateLayout', 'source'] };
    },
    authoringAdmission: ({ project }) => validateSemiconductorActiveAuthoringGraph(project.candidateCircuit),
  },
  ...Object.fromEntries(narrow.map((item) => [item.profile, {
    schemas: [item.schema],
    prepare: (value) => ({ project: item.normalize(value), preserved: ['circuit', 'source'] }),
    authoringAdmission: ({ project }) => validateBounded3v3AuthoringGraph({
      board: item.boardDefinition, components: project.circuit.components, nets: project.circuit.nets,
    }),
  }])),
};

const files = new Map();
const entries = [];
function addEntry({ id, profile, file, project, sourceText, board, controls, ground }) {
  const bytes = canonicalProjectEnvelope(profile, project, adapters, emptyProjectBrief(), null,
    CURRENT_MODEL_LIBRARY_LOCK);
  const reopened = prepareProjectEnvelope(bytes, adapters);
  if (!reopened.ok || reopened.report.modelLibrary.authoringOnly !== true
      || reopened.report.modelLibrary.executableAuthority !== false) {
    throw new Error(`SEMICONDUCTOR_ACTIVE_EXAMPLE_ENVELOPE:${profile}:${reopened.code ?? 'EXECUTABLE_AUTHORITY'}`);
  }
  files.set(file, bytes);
  entries.push({
    id, profile, file, requirementIds: ['CMP-013', 'CMP-014'],
    componentTypes: TYPES, componentIds: IDS,
    nameplateValues: Object.fromEntries(TYPES.map((type) => [type,
      Object.fromEntries(SEMICONDUCTOR_ACTIVE_DEFINITIONS[type].propertyKeys.map((key) =>
        [key, SEMICONDUCTOR_ACTIVE_DEFINITIONS[type].propertySchema[key].default]))])),
    namedWiring: [`${board}.${controls[0]} → pmos-1.GATE`,
      'pmos-1.DRAIN ↔ optocoupler-1.COLLECTOR',
      'pmos-1.SOURCE ↔ optocoupler-1.EMITTER',
      `${board}.${controls[1]} → optocoupler-1.ANODE`,
      `${board}.${ground} ↔ optocoupler-1.CATHODE`],
    expectedVisibleBehavior: 'Opening restores the original P-channel MOSFET and optocoupler SVG symbols, all seven named terminals, bounded nameplate values and five authored nets.',
    runtimeUnavailableCode: 'SEMICONDUCTOR_ACTIVE_MODEL_UNAVAILABLE', profileBehavior,
    limitations: 'Raw active-semiconductor authoring only. No bias/current network, nonlinear transfer, switching threshold, body diode, optical coupling, isolation proof, leakage, capacitance, thermal/breakdown, safe-operating-area, Build/Run authority, safety certification or physical equivalence.',
    sourceSha256: sha256(sourceText), projectSha256: sha256(bytes),
    provenance: 'Original project-owned contracts, SVG artwork, canonical project data and example source.',
  });
}

addEntry({ id: 'avr-semiconductor-active-components', profile: AVR,
  file: 'avr-semiconductor-active-components.intent-mcu.json', project: avrProject, sourceText: source,
  board: 'board-1', controls: ['D2', 'D3'], ground: 'GND1' });
for (const item of narrow) {
  const editor = new item.Editor();
  for (const componentId of ['resistor-1', 'led-1']) {
    editor.select({ kind: 'component', id: componentId });
    const result = editor.deleteSelected();
    if (!result.ok) throw new Error(`SEMICONDUCTOR_ACTIVE_${item.id}_REMOVE:${result.code}`);
  }
  TYPES.forEach((type) => {
    const result = editor.addMissingComponent(type);
    if (!result.ok) throw new Error(`SEMICONDUCTOR_ACTIVE_${item.id}_ADD:${result.code}`);
  });
  for (const [from, to] of [
    [{ component: item.board, pin: item.controls[0] }, { component: 'pmos-1', pin: 'GATE' }],
    [{ component: 'pmos-1', pin: 'DRAIN' }, { component: 'optocoupler-1', pin: 'COLLECTOR' }],
    [{ component: 'pmos-1', pin: 'SOURCE' }, { component: 'optocoupler-1', pin: 'EMITTER' }],
    [{ component: item.board, pin: item.controls[1] }, { component: 'optocoupler-1', pin: 'ANODE' }],
    [{ component: item.board, pin: item.ground }, { component: 'optocoupler-1', pin: 'CATHODE' }],
  ]) {
    const result = editor.connectEndpoints(from, to);
    if (!result.ok) throw new Error(`SEMICONDUCTOR_ACTIVE_${item.id}_WIRE:${result.code}`);
  }
  const project = { schema: item.schema, name: `${item.id} raw active-semiconductor authoring`,
    profile: item.profile, source: item.source, circuit: editor.snapshot().draft };
  addEntry({ id: `${item.id}-semiconductor-active-components`, profile: item.profile,
    file: `${item.id}-semiconductor-active-components.intent-mcu.json`, project, sourceText: item.source,
    board: item.board, controls: item.controls, ground: item.ground });
}

const manifest = { schema: 'intent-mcu-semiconductor-active-component-example-manifest@1',
  modelLibrary: CURRENT_MODEL_LIBRARY_LOCK, requirementIds: ['CMP-013', 'CMP-014'],
  profileBehavior, entries };
files.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
if (process.argv.includes('--write')) {
  await mkdir(ROOT, { recursive: true });
  for (const [file, bytes] of files) await writeFile(new URL(file, ROOT), bytes);
} else {
  for (const [file, bytes] of files) {
    if (await readFile(new URL(file, ROOT), 'utf8') !== bytes) {
      throw new Error(`SEMICONDUCTOR_ACTIVE_COMPONENT_ARTIFACT_STALE:${file}`);
    }
  }
}
