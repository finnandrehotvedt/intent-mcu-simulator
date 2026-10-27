#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { createAvrReferenceStarter } from '../src/avr-reference-starters.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { validateBounded3v3AuthoringGraph } from '../src/bounded-3v3-authoring-contracts.mjs';
import { Esp32C3CircuitEditor, ESP32C3_BOARD_DEFINITION } from '../src/esp32c3-public-circuit.mjs';
import { C3_PUBLIC_PROJECT_SCHEMA, C3_PUBLIC_SOURCE,
  normalizeEsp32C3PublicProject } from '../src/esp32c3-public-workbench.mjs';
import { inspectJunctionPoint, JUNCTION_POINT_LIMITATIONS, JUNCTION_POINT_PROFILES,
  JUNCTION_POINT_REQUIREMENT_ID } from '../src/junction-point-contract.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief,
  prepareProjectEnvelope } from '../src/project-envelope.mjs';
import { Rp2040PicoCircuitEditor, RP2040_PICO_BOARD_DEFINITION } from '../src/rp2040-pico-circuit.mjs';
import { RP2040_PUBLIC_PROJECT_SCHEMA, RP2040_PUBLIC_SOURCE,
  normalizeRp2040PublicProject } from '../src/rp2040-public-workbench.mjs';
import { Stm32CircuitEditor, STM32_BOARD_DEFINITION } from '../src/stm32-public-circuit.mjs';
import { STM32_EDITABLE_PROJECT_SCHEMA, STM32_PUBLIC_SOURCE,
  normalizeStm32PublicProject } from '../src/stm32-public-workbench.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const ROOT = new URL('../examples/wiring-primitives/', import.meta.url);
const CROSSING_POINT = Object.freeze({ x: 0.5, y: 0.5 });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const routeFamily = (net) => ({ schema: 'intent-mcu-route@1',
  branches: net.endpoints.map((endpoint) => ({ endpoint, points: [CROSSING_POINT] })) });

const narrow = [
  { id: 'pico', profile: 'board.rp2040-pico-v1', schema: RP2040_PUBLIC_PROJECT_SCHEMA,
    source: RP2040_PUBLIC_SOURCE, Editor: Rp2040PicoCircuitEditor,
    boardDefinition: RP2040_PICO_BOARD_DEFINITION, normalize: normalizeRp2040PublicProject,
    sourceNetId: 'net-gpio0', unavailableCode: 'MODEL_LIBRARY_COMPONENT_UNAVAILABLE' },
  { id: 'esp32-c3', profile: 'board.esp32-c3-devmodule-v1', schema: C3_PUBLIC_PROJECT_SCHEMA,
    source: C3_PUBLIC_SOURCE, Editor: Esp32C3CircuitEditor,
    boardDefinition: ESP32C3_BOARD_DEFINITION, normalize: normalizeEsp32C3PublicProject,
    sourceNetId: 'net-gpio2', unavailableCode: 'MODEL_LIBRARY_COMPONENT_UNAVAILABLE' },
  { id: 'stm32', profile: 'board.stm32f429zi-nucleo144-v1', schema: STM32_EDITABLE_PROJECT_SCHEMA,
    source: STM32_PUBLIC_SOURCE, Editor: Stm32CircuitEditor,
    boardDefinition: STM32_BOARD_DEFINITION, normalize: normalizeStm32PublicProject,
    sourceNetId: 'net-pb0', unavailableCode: 'MODEL_LIBRARY_COMPONENT_UNAVAILABLE' },
];
const adapters = Object.freeze({
  [AVR]: { schemas: Object.freeze(['intent-mcu-project-contact-persistence@1']),
    prepare(value) {
      const opened = openCandidateUiSession(JSON.stringify(value));
      if (!opened.ok) throw Object.assign(new Error(opened.code), opened);
      return { project: JSON.parse(opened.session.saveText()) };
    } },
  ...Object.fromEntries(narrow.map((item) => [item.profile, {
    schemas: [item.schema],
    prepare: (value) => ({ project: item.normalize(value), preserved: ['circuit', 'source'] }),
    authoringAdmission: ({ project }) => validateBounded3v3AuthoringGraph({
      board: item.boardDefinition, components: project.circuit.components,
      nets: project.circuit.nets,
    }),
  }])),
});

const starter = createAvrReferenceStarter('avr-ground-reference-input');
const avrProject = structuredClone(starter.project);
avrProject.project.metadata.name = 'Explicit junction and separate crossing';
const avrGraph = avrProject.candidateCircuit;
const avrLayout = avrProject.candidateLayout;
const ground = avrGraph.nets.find(({ id }) => id === 'net-ground-branch');
const signal = avrGraph.nets.find(({ id }) => id === 'net-button-d2');
if (!ground || ground.endpoints.length < 3 || !signal) throw new Error('CMP019_BASE_GRAPH');
avrLayout.wireRoutes[ground.id] = routeFamily(ground);
avrLayout.wireRoutes[signal.id] = routeFamily(signal);

const files = new Map();
const entries = [];
function addEntry({ id, file, profile, project, sourceText, junctionNetId, crossingNetId,
  junctionId = null, unavailableCode = null }) {
  const bytes = canonicalProjectEnvelope(profile, project, adapters, emptyProjectBrief(), null,
    CURRENT_MODEL_LIBRARY_LOCK);
  const opened = prepareProjectEnvelope(bytes, adapters);
  if (!opened.ok) throw new Error(`CMP019_VALIDATE:${profile}:${opened.code}`);
  const normalized = opened.project;
  const graph = profile === AVR ? normalized.candidateCircuit : normalized.circuit;
  const layout = profile === AVR ? normalized.candidateLayout : normalized.circuit.layout;
  const inspection = inspectJunctionPoint({ profile, graph, layout, junctionNetId,
    crossingNetId, junctionId, crossingPoint: CROSSING_POINT });
  if (!inspection.ok) throw new Error(`CMP019_CONTRACT:${profile}:${inspection.code}`);
  files.set(file, bytes);
  entries.push({ id, requirementIds: [JUNCTION_POINT_REQUIREMENT_ID], file, profile,
    projectSha256: sha256(bytes), sourceSha256: sha256(sourceText), junction: {
      id: junctionId, netId: junctionNetId, endpointKeys: graph.nets
        .find(({ id: netId }) => netId === junctionNetId).endpoints
        .map(({ component, pin }) => `${component}.${pin}`),
      representation: inspection.representation,
    }, crossing: { netIds: [junctionNetId, crossingNetId], point: CROSSING_POINT,
      electricallyConnected: inspection.crossingElectricallyConnected },
    runtimeUnavailableCode: unavailableCode,
    runtimeBoundary: JUNCTION_POINT_PROFILES[profile].runtimeBoundary,
    expectedBehavior: 'Only endpoints in the declared branched net are joined; the other route at the same drawing point remains a separate net.',
    limitations: JUNCTION_POINT_LIMITATIONS,
    provenance: 'Original project-owned graph contract, route data, canonical project data and example source.',
  });
}

addEntry({ id: 'avr-explicit-junction-crossing', profile: AVR,
  file: 'avr-explicit-junction-crossing.intent-mcu.json', project: avrProject,
  sourceText: avrProject.project.source.files[0].content, junctionNetId: ground.id,
  crossingNetId: signal.id, junctionId: 'junction-ground' });

for (const item of narrow) {
  const editor = new item.Editor();
  const added = editor.addComponent('ground.reference-3v3-v1');
  if (!added.ok) throw new Error(`CMP019_${item.id}_GROUND:${added.code}`);
  const branch = editor.branchEndpoint('net-ground', { component: added.componentId, pin: 'GND' });
  if (!branch.ok) throw new Error(`CMP019_${item.id}_BRANCH:${branch.code}`);
  const draft = editor.snapshot().draft;
  for (const netId of ['net-ground', item.sourceNetId]) {
    const net = draft.nets.find(({ id }) => id === netId);
    if (!net) throw new Error(`CMP019_${item.id}_NET:${netId}`);
    draft.layout.wireRoutes[netId] = routeFamily(net);
  }
  const project = { schema: item.schema, name: `${item.id} explicit junction and separate crossing`,
    profile: item.profile, source: item.source, circuit: draft };
  addEntry({ id: `${item.id}-explicit-junction-crossing`, profile: item.profile,
    file: `${item.id}-explicit-junction-crossing.intent-mcu.json`, project,
    sourceText: item.source, junctionNetId: 'net-ground', crossingNetId: item.sourceNetId,
    unavailableCode: item.unavailableCode });
}

const manifest = {
  schema: 'intent-mcu-wiring-primitive-example-manifest@2',
  modelLibrary: CURRENT_MODEL_LIBRARY_LOCK,
  requirementIds: [JUNCTION_POINT_REQUIREMENT_ID],
  profileBehavior: JUNCTION_POINT_PROFILES,
  entries,
};
files.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
if (process.argv.includes('--write')) {
  await mkdir(ROOT, { recursive: true });
  for (const [file, bytes] of files) await writeFile(new URL(file, ROOT), bytes);
} else {
  for (const [file, bytes] of files) {
    if (await readFile(new URL(file, ROOT), 'utf8') !== bytes) {
      throw new Error(`JUNCTION_POINT_ARTIFACT_STALE:${file}`);
    }
  }
}
console.log(JSON.stringify({ ok: true, profiles: entries.length,
  representations: [...new Set(entries.map(({ junction }) => junction.representation))],
  crossingElectricallyConnected: false }));
