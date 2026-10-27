// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { validateBounded3v3AuthoringGraph } from '../src/bounded-3v3-authoring-contracts.mjs';
import { ESP32C3_BOARD_DEFINITION } from '../src/esp32c3-public-circuit.mjs';
import { C3_PUBLIC_PROJECT_SCHEMA, normalizeEsp32C3PublicProject } from '../src/esp32c3-public-workbench.mjs';
import { inspectJunctionPoint, JUNCTION_POINT_LIMITATIONS, JUNCTION_POINT_PROFILES } from '../src/junction-point-contract.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { prepareProjectEnvelope } from '../src/project-envelope.mjs';
import { RP2040_PICO_BOARD_DEFINITION } from '../src/rp2040-pico-circuit.mjs';
import { RP2040_PUBLIC_PROJECT_SCHEMA, normalizeRp2040PublicProject } from '../src/rp2040-public-workbench.mjs';
import { STM32_BOARD_DEFINITION } from '../src/stm32-public-circuit.mjs';
import { STM32_EDITABLE_PROJECT_SCHEMA, normalizeStm32PublicProject } from '../src/stm32-public-workbench.mjs';

await import('../scripts/generate-junction-example.mjs');
const ROOT = new URL('../examples/wiring-primitives/', import.meta.url);
const AVR = 'board.atmega328p-16mhz-v1';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const narrow = [
  { profile: 'board.rp2040-pico-v1', schema: RP2040_PUBLIC_PROJECT_SCHEMA,
    normalize: normalizeRp2040PublicProject, board: RP2040_PICO_BOARD_DEFINITION },
  { profile: 'board.esp32-c3-devmodule-v1', schema: C3_PUBLIC_PROJECT_SCHEMA,
    normalize: normalizeEsp32C3PublicProject, board: ESP32C3_BOARD_DEFINITION },
  { profile: 'board.stm32f429zi-nucleo144-v1', schema: STM32_EDITABLE_PROJECT_SCHEMA,
    normalize: normalizeStm32PublicProject, board: STM32_BOARD_DEFINITION },
];
const adapters = {
  [AVR]: { schemas: ['intent-mcu-project-contact-persistence@1'],
    prepare(value) {
      const opened = openCandidateUiSession(JSON.stringify(value));
      if (!opened.ok) throw Object.assign(new Error(opened.code), opened);
      return { project: JSON.parse(opened.session.saveText()) };
    } },
  ...Object.fromEntries(narrow.map((item) => [item.profile, {
    schemas: [item.schema],
    prepare: (value) => ({ project: item.normalize(value), preserved: ['circuit', 'source'] }),
    authoringAdmission: ({ project }) => validateBounded3v3AuthoringGraph({
      board: item.board, components: project.circuit.components, nets: project.circuit.nets,
    }),
  }])),
};

async function openEntry(entry) {
  const bytes = await readFile(new URL(entry.file, ROOT), 'utf8');
  assert.equal(sha256(bytes), entry.projectSha256);
  const opened = prepareProjectEnvelope(bytes, adapters);
  assert.equal(opened.ok, true, `${entry.profile}:${opened.code}`);
  const graph = entry.profile === AVR ? opened.project.candidateCircuit : opened.project.circuit;
  const layout = entry.profile === AVR ? opened.project.candidateLayout : opened.project.circuit.layout;
  return { bytes, opened, graph, layout };
}

test('CMP-019 manifest owns four canonical profile examples and exact boundaries', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  assert.equal(manifest.schema, 'intent-mcu-wiring-primitive-example-manifest@2');
  assert.deepEqual(manifest.modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
  assert.deepEqual(manifest.requirementIds, ['CMP-019']);
  assert.deepEqual(manifest.profileBehavior, JUNCTION_POINT_PROFILES);
  assert.deepEqual(new Set(manifest.entries.map(({ profile }) => profile)),
    new Set(Object.keys(JUNCTION_POINT_PROFILES)));
  assert.equal(manifest.entries.length, 4);
  assert(manifest.entries.every(({ limitations }) =>
    JSON.stringify(limitations) === JSON.stringify(JUNCTION_POINT_LIMITATIONS)));
  assert.equal(manifest.entries.filter(({ junction }) => junction.id !== null).length, 1);
  assert(manifest.entries.slice(1).every(({ runtimeUnavailableCode }) =>
    runtimeUnavailableCode === 'MODEL_LIBRARY_COMPONENT_UNAVAILABLE'));
});

test('CMP-019 examples retain one branched net and one visually crossing separate net', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  for (const entry of manifest.entries) {
    const { opened, graph, layout } = await openEntry(entry);
    const result = inspectJunctionPoint({ profile: entry.profile, graph, layout,
      junctionNetId: entry.junction.netId, crossingNetId: entry.crossing.netIds[1],
      junctionId: entry.junction.id, crossingPoint: entry.crossing.point });
    assert.equal(result.ok, true, `${entry.profile}:${result.code}`);
    assert.equal(result.crossingElectricallyConnected, false);
    assert.equal(result.representation, entry.junction.representation);
    assert.deepEqual(graph.nets.find(({ id }) => id === entry.junction.netId).endpoints
      .map(({ component, pin }) => `${component}.${pin}`), entry.junction.endpointKeys);
    if (entry.profile !== AVR) {
      assert.equal(opened.report.modelLibrary.authoringOnly, true);
      assert.equal(opened.report.modelLibrary.executableAuthority, false);
    }
  }
});

test('CMP-019 AVR requires its explicit junction identity', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  const entry = manifest.entries.find(({ profile }) => profile === AVR);
  const { graph, layout } = await openEntry(entry);
  graph.junctions = graph.junctions.filter(({ id }) => id !== entry.junction.id);
  const result = inspectJunctionPoint({ profile: entry.profile, graph, layout,
    junctionNetId: entry.junction.netId, crossingNetId: entry.crossing.netIds[1],
    junctionId: entry.junction.id, crossingPoint: entry.crossing.point });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'JUNCTION_EXPLICIT_IDENTITY_MISSING');
});

test('CMP-019 narrow profiles reject a fabricated explicit junction identity', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  const entry = manifest.entries.find(({ profile }) => profile !== AVR);
  const { graph, layout } = await openEntry(entry);
  const result = inspectJunctionPoint({ profile: entry.profile, graph, layout,
    junctionNetId: entry.junction.netId, crossingNetId: entry.crossing.netIds[1],
    junctionId: 'junction-fabricated', crossingPoint: entry.crossing.point });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'JUNCTION_PROFILE_HAS_NO_EXPLICIT_IDENTITY');
});

test('CMP-019 requires at least three named endpoints in the junction net', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  const entry = manifest.entries[0];
  const { graph, layout } = await openEntry(entry);
  graph.nets.find(({ id }) => id === entry.junction.netId).endpoints.splice(2);
  const result = inspectJunctionPoint({ profile: entry.profile, graph, layout,
    junctionNetId: entry.junction.netId, crossingNetId: entry.crossing.netIds[1],
    junctionId: entry.junction.id, crossingPoint: entry.crossing.point });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'JUNCTION_REQUIRES_THREE_ENDPOINTS');
});

test('CMP-019 rejects shared endpoint identity across the two declared nets', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  const entry = manifest.entries[0];
  const { graph, layout } = await openEntry(entry);
  const junction = graph.nets.find(({ id }) => id === entry.junction.netId);
  graph.nets.find(({ id }) => id === entry.crossing.netIds[1]).endpoints.push(junction.endpoints[0]);
  const result = inspectJunctionPoint({ profile: entry.profile, graph, layout,
    junctionNetId: entry.junction.netId, crossingNetId: entry.crossing.netIds[1],
    junctionId: entry.junction.id, crossingPoint: entry.crossing.point });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'JUNCTION_CROSSING_REUSES_ENDPOINT');
});

test('CMP-019 requires both authored routes to contain the declared drawing point', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  const entry = manifest.entries[0];
  const { graph, layout } = await openEntry(entry);
  layout.wireRoutes[entry.crossing.netIds[1]].branches.forEach((branch) => {
    branch.points = [{ x: 0.25, y: 0.25 }];
  });
  const result = inspectJunctionPoint({ profile: entry.profile, graph, layout,
    junctionNetId: entry.junction.netId, crossingNetId: entry.crossing.netIds[1],
    junctionId: entry.junction.id, crossingPoint: entry.crossing.point });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'JUNCTION_CROSSING_POINT_MISSING');
});

test('CMP-019 rejects unknown profiles and same-net crossing claims', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  const entry = manifest.entries[0];
  const { graph, layout } = await openEntry(entry);
  assert.equal(inspectJunctionPoint({ profile: 'board.unknown-v1', graph, layout,
    junctionNetId: entry.junction.netId, crossingNetId: entry.crossing.netIds[1],
    crossingPoint: entry.crossing.point }).code, 'JUNCTION_PROFILE_UNAVAILABLE');
  assert.equal(inspectJunctionPoint({ profile: entry.profile, graph, layout,
    junctionNetId: entry.junction.netId, crossingNetId: entry.junction.netId,
    junctionId: entry.junction.id, crossingPoint: entry.crossing.point }).code,
  'JUNCTION_CONTRACT_SHAPE');
});
