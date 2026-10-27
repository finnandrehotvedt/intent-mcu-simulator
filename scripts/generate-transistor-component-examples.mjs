#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { NPN_BJT_TYPE, PNP_BJT_TYPE, N_CHANNEL_MOSFET_TYPE,
  TRANSISTOR_COMPONENT_DEFINITIONS, createTransistorComponent,
  validateTransistorAuthoringGraph } from '../expansion-drafts/transistor-components-v1.mjs';
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

const ROOT = new URL('../examples/transistor-components/', import.meta.url);
const AVR = 'board.atmega328p-16mhz-v1';
const TYPES = [NPN_BJT_TYPE, PNP_BJT_TYPE, N_CHANNEL_MOSFET_TYPE];
const IDS = ['npn-1', 'pnp-1', 'nmos-1'];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const source = `void setup() { Serial.begin(115200); }
void loop() {
  Serial.println("RAW TRANSISTORS ARE AUTHORING ONLY");
  delay(500);
}
`;
const behavior = 'authoring-only raw three-terminal semiconductor data; no bias/switching/current runtime, Build/Run authority or physical-hardware equivalence';
const profileBehavior = Object.freeze({
  [AVR]: behavior,
  'board.rp2040-pico-v1': behavior,
  'board.esp32-c3-devmodule-v1': behavior,
  'board.stm32f429zi-nucleo144-v1': behavior,
});

function applyCandidate(session, command) {
  const result = session.apply({ ...command, revision: session.revision });
  if (!result.ok) throw new Error(`TRANSISTOR_AVR_EXAMPLE:${command.type}:${result.code}`);
  return result;
}

const draft = createEditableContactDraft(source);
if (!draft.ok) throw new Error(draft.code);
draft.project.project.metadata.name = 'Raw NPN PNP and N-channel MOSFET authoring network';
const avrSession = openCandidateUiSession(canonicalContactPersistenceDraftJson(draft.project)).session;
for (const component of avrSession.visualProject.circuit.components) {
  if (component.id !== 'board-1') applyCandidate(avrSession,
    { type: 'component.remove', componentId: component.id });
}
TYPES.forEach((type, index) => applyCandidate(avrSession, {
  type: 'component.add', component: createTransistorComponent(type, IDS[index]),
  position: { x: 0.4 + index * 0.2, y: 0.5, rotation: 0 },
}));
for (const [id, endpoints] of [
  ['net-npn-base', [{ component: 'board-1', pin: 'D2' }, { component: 'npn-1', pin: 'BASE' }]],
  ['net-pnp-base', [{ component: 'board-1', pin: 'D3' }, { component: 'pnp-1', pin: 'BASE' }]],
  ['net-nmos-gate', [{ component: 'board-1', pin: 'D4' }, { component: 'nmos-1', pin: 'GATE' }]],
  ['net-bjt-collectors', [{ component: 'npn-1', pin: 'COLLECTOR' }, { component: 'pnp-1', pin: 'COLLECTOR' }]],
  ['net-upper-semiconductor', [{ component: 'pnp-1', pin: 'EMITTER' }, { component: 'nmos-1', pin: 'DRAIN' }]],
  ['net-semiconductor-return', [{ component: 'board-1', pin: 'GND1' },
    { component: 'npn-1', pin: 'EMITTER' }]],
]) applyCandidate(avrSession, { type: 'wire.create', net: { id, endpoints } });
applyCandidate(avrSession, { type: 'wire.branch', netId: 'net-semiconductor-return',
  endpoint: { component: 'nmos-1', pin: 'SOURCE' }, junctionId: 'junction-semiconductor-return' });
const avrProject = JSON.parse(avrSession.saveText());

const narrow = [
  { id: 'pico', profile: 'board.rp2040-pico-v1', schema: RP2040_PUBLIC_PROJECT_SCHEMA,
    source: RP2040_PUBLIC_SOURCE, Editor: Rp2040PicoCircuitEditor, boardDefinition: RP2040_PICO_BOARD_DEFINITION,
    normalize: normalizeRp2040PublicProject, board: 'pico-1', controls: ['GP1', 'GP2', 'GP3'], ground: 'GND8' },
  { id: 'esp32-c3', profile: 'board.esp32-c3-devmodule-v1', schema: C3_PUBLIC_PROJECT_SCHEMA,
    source: C3_PUBLIC_SOURCE, Editor: Esp32C3CircuitEditor, boardDefinition: ESP32C3_BOARD_DEFINITION,
    normalize: normalizeEsp32C3PublicProject, board: 'c3-1', controls: ['GPIO3', 'GPIO0', 'GPIO1'], ground: 'GND8' },
  { id: 'stm32', profile: 'board.stm32f429zi-nucleo144-v1', schema: STM32_EDITABLE_PROJECT_SCHEMA,
    source: STM32_PUBLIC_SOURCE, Editor: Stm32CircuitEditor, boardDefinition: STM32_BOARD_DEFINITION,
    normalize: normalizeStm32PublicProject, board: 'stm32-1', controls: ['PB1', 'PB7', 'PB0'], ground: 'GND20' },
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
    authoringAdmission: ({ project }) => validateTransistorAuthoringGraph(project.candidateCircuit),
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
    throw new Error(`TRANSISTOR_EXAMPLE_ENVELOPE:${profile}:${reopened.code ?? 'EXECUTABLE_AUTHORITY'}`);
  }
  files.set(file, bytes);
  entries.push({
    id, profile, file, requirementIds: ['CMP-010', 'CMP-011', 'CMP-012'],
    componentTypes: TYPES, componentIds: IDS,
    nameplateValues: Object.fromEntries(TYPES.map((type) => [type,
      Object.fromEntries(TRANSISTOR_COMPONENT_DEFINITIONS[type].propertyKeys.map((key) =>
        [key, TRANSISTOR_COMPONENT_DEFINITIONS[type].propertySchema[key].default]))])),
    namedWiring: [`${board}.${controls[0]} → npn-1.BASE`, `${board}.${controls[1]} → pnp-1.BASE`,
      `${board}.${controls[2]} → nmos-1.GATE`, 'npn-1.COLLECTOR ↔ pnp-1.COLLECTOR',
      'pnp-1.EMITTER ↔ nmos-1.DRAIN',
      `${board}.${ground} ↔ npn-1.EMITTER ↔ nmos-1.SOURCE`],
    expectedVisibleBehavior: 'Opening restores three original transistor SVG symbols, exact BJT/MOSFET terminals, bounded nameplate values and six authored nets.',
    runtimeUnavailableCode: 'TRANSISTOR_SWITCHING_MODEL_UNAVAILABLE', profileBehavior,
    limitations: 'Raw three-terminal semiconductor authoring only. No bias network, nonlinear gain/current, switching threshold, body diode, saturation, leakage, capacitance, thermal/breakdown, safe-operating-area, Build/Run authority or physical equivalence.',
    sourceSha256: sha256(sourceText), projectSha256: sha256(bytes),
    provenance: 'Original project-owned contracts, SVG artwork, canonical project data and example source.',
  });
}

addEntry({ id: 'avr-transistor-components', profile: AVR,
  file: 'avr-transistor-components.intent-mcu.json', project: avrProject, sourceText: source,
  board: 'board-1', controls: ['D2', 'D3', 'D4'], ground: 'GND1' });
for (const item of narrow) {
  const editor = new item.Editor();
  for (const componentId of ['resistor-1', 'led-1']) {
    editor.select({ kind: 'component', id: componentId });
    const result = editor.deleteSelected();
    if (!result.ok) throw new Error(`TRANSISTOR_${item.id}_REMOVE:${result.code}`);
  }
  TYPES.forEach((type) => {
    const result = editor.addMissingComponent(type);
    if (!result.ok) throw new Error(`TRANSISTOR_${item.id}_ADD:${result.code}`);
  });
  for (const [pin, component, terminal] of [
    [item.controls[0], 'npn-1', 'BASE'], [item.controls[1], 'pnp-1', 'BASE'],
    [item.controls[2], 'nmos-1', 'GATE'],
  ]) {
    const result = editor.connectEndpoints({ component: item.board, pin }, { component, pin: terminal });
    if (!result.ok) throw new Error(`TRANSISTOR_${item.id}_CONTROL:${result.code}`);
  }
  for (const [from, to] of [
    [{ component: 'npn-1', pin: 'COLLECTOR' }, { component: 'pnp-1', pin: 'COLLECTOR' }],
    [{ component: 'pnp-1', pin: 'EMITTER' }, { component: 'nmos-1', pin: 'DRAIN' }],
  ]) {
    const result = editor.connectEndpoints(from, to);
    if (!result.ok) throw new Error(`TRANSISTOR_${item.id}_SEMICONDUCTOR:${result.code}`);
  }
  const groundNet = editor.connectEndpoints({ component: item.board, pin: item.ground },
    { component: 'npn-1', pin: 'EMITTER' });
  if (!groundNet.ok) throw new Error(`TRANSISTOR_${item.id}_GROUND:${groundNet.code}`);
  const branch = editor.branchEndpoint(groundNet.netId, { component: 'nmos-1', pin: 'SOURCE' });
  if (!branch.ok) throw new Error(`TRANSISTOR_${item.id}_GROUND_BRANCH:${branch.code}`);
  const project = { schema: item.schema, name: `${item.id} raw transistor authoring`,
    profile: item.profile, source: item.source, circuit: editor.snapshot().draft };
  addEntry({ id: `${item.id}-transistor-components`, profile: item.profile,
    file: `${item.id}-transistor-components.intent-mcu.json`, project, sourceText: item.source,
    board: item.board, controls: item.controls, ground: item.ground });
}

const manifest = { schema: 'intent-mcu-transistor-component-example-manifest@1',
  modelLibrary: CURRENT_MODEL_LIBRARY_LOCK, requirementIds: ['CMP-010', 'CMP-011', 'CMP-012'],
  profileBehavior, entries };
files.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
if (process.argv.includes('--write')) {
  await mkdir(ROOT, { recursive: true });
  for (const [file, bytes] of files) await writeFile(new URL(file, ROOT), bytes);
} else {
  for (const [file, bytes] of files) {
    if (await readFile(new URL(file, ROOT), 'utf8') !== bytes) {
      throw new Error(`TRANSISTOR_COMPONENT_ARTIFACT_STALE:${file}`);
    }
  }
}
