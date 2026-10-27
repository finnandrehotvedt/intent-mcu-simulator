#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { DIODE_COMPONENT_DEFINITIONS, SCHOTTKY_DIODE_TYPE, SILICON_DIODE_TYPE,
  ZENER_DIODE_TYPE, createDiodeComponent,
  validateDiodeAuthoringGraph } from '../expansion-drafts/diode-components-v1.mjs';
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

const ROOT = new URL('../examples/diode-components/', import.meta.url);
const AVR = 'board.atmega328p-16mhz-v1';
const TYPES = [SILICON_DIODE_TYPE, SCHOTTKY_DIODE_TYPE, ZENER_DIODE_TYPE];
const IDS = ['diode-1', 'schottky-1', 'zener-1'];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const source = `void setup() { Serial.begin(115200); }
void loop() {
  Serial.println("RAW DIODES ARE AUTHORING ONLY");
  delay(500);
}
`;
const behavior = 'authoring-only raw polarized two-terminal data; no nonlinear I-V/reverse-breakdown runtime, Build/Run authority or physical-hardware equivalence';
const profileBehavior = Object.freeze({
  [AVR]: behavior,
  'board.rp2040-pico-v1': behavior,
  'board.esp32-c3-devmodule-v1': behavior,
  'board.stm32f429zi-nucleo144-v1': behavior,
});

function applyCandidate(session, command) {
  const result = session.apply({ ...command, revision: session.revision });
  if (!result.ok) throw new Error(`DIODE_AVR_EXAMPLE:${command.type}:${result.code}`);
}

const draft = createEditableContactDraft(source);
if (!draft.ok) throw new Error(draft.code);
draft.project.project.metadata.name = 'Raw silicon Schottky and Zener diode authoring chain';
const avrSession = openCandidateUiSession(canonicalContactPersistenceDraftJson(draft.project)).session;
for (const component of avrSession.visualProject.circuit.components) {
  if (component.id !== 'board-1') applyCandidate(avrSession,
    { type: 'component.remove', componentId: component.id });
}
TYPES.forEach((type, index) => applyCandidate(avrSession, {
  type: 'component.add', component: createDiodeComponent(type, IDS[index]),
  position: { x: 0.42 + index * 0.19, y: 0.5, rotation: 0 },
}));
for (const [id, from, to] of [
  ['net-diode-source', { component: 'board-1', pin: '5V' }, { component: 'diode-1', pin: 'ANODE' }],
  ['net-diode-silicon-schottky', { component: 'diode-1', pin: 'CATHODE' }, { component: 'schottky-1', pin: 'ANODE' }],
  ['net-diode-schottky-zener', { component: 'schottky-1', pin: 'CATHODE' }, { component: 'zener-1', pin: 'ANODE' }],
  ['net-diode-ground', { component: 'zener-1', pin: 'CATHODE' }, { component: 'board-1', pin: 'GND1' }],
]) applyCandidate(avrSession, { type: 'wire.create', net: { id, endpoints: [from, to] } });
const avrProject = JSON.parse(avrSession.saveText());

const narrow = [
  { id: 'pico', profile: 'board.rp2040-pico-v1', schema: RP2040_PUBLIC_PROJECT_SCHEMA,
    source: RP2040_PUBLIC_SOURCE, Editor: Rp2040PicoCircuitEditor, boardDefinition: RP2040_PICO_BOARD_DEFINITION,
    normalize: normalizeRp2040PublicProject, board: 'pico-1', sourcePin: 'GP1', groundPin: 'GND8' },
  { id: 'esp32-c3', profile: 'board.esp32-c3-devmodule-v1', schema: C3_PUBLIC_PROJECT_SCHEMA,
    source: C3_PUBLIC_SOURCE, Editor: Esp32C3CircuitEditor, boardDefinition: ESP32C3_BOARD_DEFINITION,
    normalize: normalizeEsp32C3PublicProject, board: 'c3-1', sourcePin: 'GPIO3', groundPin: 'GND8' },
  { id: 'stm32', profile: 'board.stm32f429zi-nucleo144-v1', schema: STM32_EDITABLE_PROJECT_SCHEMA,
    source: STM32_PUBLIC_SOURCE, Editor: Stm32CircuitEditor, boardDefinition: STM32_BOARD_DEFINITION,
    normalize: normalizeStm32PublicProject, board: 'stm32-1', sourcePin: 'PB1', groundPin: 'GND20' },
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
    authoringAdmission: ({ project }) => validateDiodeAuthoringGraph(project.candidateCircuit),
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
function addEntry({ id, profile, file, project, sourceText, board, sourcePin, groundPin }) {
  const bytes = canonicalProjectEnvelope(profile, project, adapters, emptyProjectBrief(), null,
    CURRENT_MODEL_LIBRARY_LOCK);
  const reopened = prepareProjectEnvelope(bytes, adapters);
  if (!reopened.ok || reopened.report.modelLibrary.authoringOnly !== true
      || reopened.report.modelLibrary.executableAuthority !== false) {
    throw new Error(`DIODE_EXAMPLE_ENVELOPE:${profile}:${reopened.code ?? 'EXECUTABLE_AUTHORITY'}`);
  }
  files.set(file, bytes);
  entries.push({
    id, profile, file, requirementIds: ['CMP-007', 'CMP-008', 'CMP-009'],
    componentTypes: TYPES, componentIds: IDS,
    nameplateValues: Object.fromEntries(TYPES.map((type) => [type,
      Object.fromEntries(DIODE_COMPONENT_DEFINITIONS[type].propertyKeys.map((key) =>
        [key, DIODE_COMPONENT_DEFINITIONS[type].propertySchema[key].default]))])),
    namedChain: [`${board}.${sourcePin} → diode-1.ANODE`,
      'diode-1.CATHODE → schottky-1.ANODE',
      'schottky-1.CATHODE → zener-1.ANODE',
      `zener-1.CATHODE → ${board}.${groundPin}`],
    expectedVisibleBehavior: 'Opening restores three original diode SVG symbols, ANODE/CATHODE terminals, bounded nameplate values and four authored wires.',
    runtimeUnavailableCode: 'DIODE_NONLINEAR_MODEL_UNAVAILABLE',
    profileBehavior,
    limitations: 'Raw polarized two-terminal authoring only. No nonlinear I-V solver, current, reverse leakage/breakdown event, Zener clamp/regulator action, recovery time, temperature, power dissipation, tolerance, Build/Run authority or physical equivalence.',
    sourceSha256: sha256(sourceText), projectSha256: sha256(bytes),
    provenance: 'Original project-owned contracts, SVG artwork, canonical project data and example source.',
  });
}

addEntry({ id: 'avr-diode-components', profile: AVR,
  file: 'avr-diode-components.intent-mcu.json', project: avrProject, sourceText: source,
  board: 'board-1', sourcePin: '5V', groundPin: 'GND1' });
for (const item of narrow) {
  const editor = new item.Editor();
  TYPES.forEach((type) => {
    const result = editor.addMissingComponent(type);
    if (!result.ok) throw new Error(`DIODE_${item.id}_ADD:${result.code}`);
  });
  for (const [from, to] of [
    [{ component: item.board, pin: item.sourcePin }, { component: 'diode-1', pin: 'ANODE' }],
    [{ component: 'diode-1', pin: 'CATHODE' }, { component: 'schottky-1', pin: 'ANODE' }],
    [{ component: 'schottky-1', pin: 'CATHODE' }, { component: 'zener-1', pin: 'ANODE' }],
    [{ component: 'zener-1', pin: 'CATHODE' }, { component: item.board, pin: item.groundPin }],
  ]) {
    const result = editor.connectEndpoints(from, to);
    if (!result.ok) throw new Error(`DIODE_${item.id}_WIRE:${result.code}`);
  }
  const project = { schema: item.schema, name: `${item.id} raw diode authoring`,
    profile: item.profile, source: item.source, circuit: editor.snapshot().draft };
  addEntry({ id: `${item.id}-diode-components`, profile: item.profile,
    file: `${item.id}-diode-components.intent-mcu.json`, project, sourceText: item.source,
    board: item.board, sourcePin: item.sourcePin, groundPin: item.groundPin });
}

const manifest = { schema: 'intent-mcu-diode-component-example-manifest@1',
  modelLibrary: CURRENT_MODEL_LIBRARY_LOCK, requirementIds: ['CMP-007', 'CMP-008', 'CMP-009'],
  profileBehavior, entries };
files.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
if (process.argv.includes('--write')) {
  await mkdir(ROOT, { recursive: true });
  for (const [file, bytes] of files) await writeFile(new URL(file, ROOT), bytes);
} else {
  for (const [file, bytes] of files) {
    if (await readFile(new URL(file, ROOT), 'utf8') !== bytes) {
      throw new Error(`DIODE_COMPONENT_ARTIFACT_STALE:${file}`);
    }
  }
}
