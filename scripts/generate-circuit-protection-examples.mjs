#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { FUSE_TYPE, RESETTABLE_FUSE_PTC_TYPE, CIRCUIT_PROTECTION_DEFINITIONS,
  createCircuitProtectionComponent,
  validateCircuitProtectionAuthoringGraph } from '../expansion-drafts/circuit-protection-components-v1.mjs';
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

const ROOT = new URL('../examples/circuit-protection-components/', import.meta.url);
const AVR = 'board.atmega328p-16mhz-v1';
const TYPES = [FUSE_TYPE, RESETTABLE_FUSE_PTC_TYPE];
const IDS = ['fuse-1', 'ptc-1'];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const source = `void setup() { Serial.begin(115200); }
void loop() {
  Serial.println("RAW FUSE AND PTC ARE AUTHORING ONLY");
  delay(500);
}
`;
const behavior = 'authoring-only raw circuit-protection data; no trip/interruption/reset/thermal runtime, safety guarantee, Build/Run authority or physical-hardware equivalence';
const profileBehavior = Object.freeze({
  [AVR]: behavior,
  'board.rp2040-pico-v1': behavior,
  'board.esp32-c3-devmodule-v1': behavior,
  'board.stm32f429zi-nucleo144-v1': behavior,
});

function applyCandidate(session, command) {
  const result = session.apply({ ...command, revision: session.revision });
  if (!result.ok) throw new Error(`CIRCUIT_PROTECTION_AVR_EXAMPLE:${command.type}:${result.code}`);
  return result;
}
function wireChain(owner, board, sourcePin, groundPin, connect) {
  for (const [left, right] of [
    [{ component: board, pin: sourcePin }, { component: 'fuse-1', pin: 'A' }],
    [{ component: 'fuse-1', pin: 'B' }, { component: 'ptc-1', pin: 'A' }],
    [{ component: 'ptc-1', pin: 'B' }, { component: board, pin: groundPin }],
  ]) {
    const result = connect(left, right);
    if (!result.ok) throw new Error(`CIRCUIT_PROTECTION_${owner}_WIRE:${result.code}`);
  }
}

const draft = createEditableContactDraft(source);
if (!draft.ok) throw new Error(draft.code);
draft.project.project.metadata.name = 'Raw fuse and resettable PTC authoring chain';
const avrSession = openCandidateUiSession(canonicalContactPersistenceDraftJson(draft.project)).session;
for (const component of avrSession.visualProject.circuit.components) {
  if (component.id !== 'board-1') applyCandidate(avrSession,
    { type: 'component.remove', componentId: component.id });
}
TYPES.forEach((type, index) => applyCandidate(avrSession, {
  type: 'component.add', component: createCircuitProtectionComponent(type, IDS[index]),
  position: { x: 0.42 + index * 0.2, y: 0.5, rotation: 0 },
}));
let netIndex = 0;
wireChain('AVR', 'board-1', 'D2', 'GND1', (left, right) => applyCandidate(avrSession,
  { type: 'wire.create', net: { id: `net-protection-${netIndex += 1}`, endpoints: [left, right] } }));
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
    return { project: JSON.parse(opened.session.saveText()), prepared: opened.session,
      preserved: ['candidateCircuit', 'candidateLayout', 'source'] };
  }, authoringAdmission: ({ project }) => validateCircuitProtectionAuthoringGraph(project.candidateCircuit) },
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
    throw new Error(`CIRCUIT_PROTECTION_EXAMPLE_ENVELOPE:${profile}:${reopened.code ?? 'EXECUTABLE_AUTHORITY'}`);
  }
  files.set(file, bytes);
  entries.push({ id, profile, file, requirementIds: ['CMP-015', 'CMP-016'],
    componentTypes: TYPES, componentIds: IDS,
    nameplateValues: Object.fromEntries(TYPES.map((type) => [type,
      Object.fromEntries(CIRCUIT_PROTECTION_DEFINITIONS[type].propertyKeys.map((key) =>
        [key, CIRCUIT_PROTECTION_DEFINITIONS[type].propertySchema[key].default]))])),
    namedWiring: [`${board}.${sourcePin} → fuse-1.A`, 'fuse-1.B ↔ ptc-1.A',
      `ptc-1.B → ${board}.${ground}`],
    expectedVisibleBehavior: 'Opening restores two original protection SVG symbols, exact A/B terminals, bounded nameplate values and three authored nets.',
    runtimeUnavailableCode: 'CIRCUIT_PROTECTION_MODEL_UNAVAILABLE', profileBehavior,
    limitations: 'Raw two-terminal circuit-protection authoring only. No overcurrent trip execution, time-current or I²t curve, interruption, arc, resistance, heating, cooling, reset, thermal/breakdown behavior, certification, safety protection, Build/Run authority or physical equivalence.',
    sourceSha256: sha256(sourceText), projectSha256: sha256(bytes),
    provenance: 'Original project-owned contracts, SVG artwork, canonical project data and example source.' });
}

addEntry({ id: 'avr-circuit-protection-components', profile: AVR,
  file: 'avr-circuit-protection-components.intent-mcu.json', project: avrProject, sourceText: source,
  board: 'board-1', sourcePin: 'D2', ground: 'GND1' });
for (const item of narrow) {
  const editor = new item.Editor();
  for (const componentId of ['resistor-1', 'led-1']) {
    editor.select({ kind: 'component', id: componentId });
    const result = editor.deleteSelected();
    if (!result.ok) throw new Error(`CIRCUIT_PROTECTION_${item.id}_REMOVE:${result.code}`);
  }
  TYPES.forEach((type) => {
    const result = editor.addMissingComponent(type);
    if (!result.ok) throw new Error(`CIRCUIT_PROTECTION_${item.id}_ADD:${result.code}`);
  });
  wireChain(item.id, item.board, item.sourcePin, item.ground,
    (left, right) => editor.connectEndpoints(left, right));
  const project = { schema: item.schema, name: `${item.id} raw circuit-protection authoring`,
    profile: item.profile, source: item.source, circuit: editor.snapshot().draft };
  addEntry({ id: `${item.id}-circuit-protection-components`, profile: item.profile,
    file: `${item.id}-circuit-protection-components.intent-mcu.json`, project,
    sourceText: item.source, board: item.board, sourcePin: item.sourcePin, ground: item.ground });
}

const manifest = { schema: 'intent-mcu-circuit-protection-example-manifest@1',
  modelLibrary: CURRENT_MODEL_LIBRARY_LOCK, requirementIds: ['CMP-015', 'CMP-016'],
  profileBehavior, entries };
files.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
if (process.argv.includes('--write')) {
  await mkdir(ROOT, { recursive: true });
  for (const [file, bytes] of files) await writeFile(new URL(file, ROOT), bytes);
} else {
  for (const [file, bytes] of files) {
    if (await readFile(new URL(file, ROOT), 'utf8') !== bytes) {
      throw new Error(`CIRCUIT_PROTECTION_ARTIFACT_STALE:${file}`);
    }
  }
}
