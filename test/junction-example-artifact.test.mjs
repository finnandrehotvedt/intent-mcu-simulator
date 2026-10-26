// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { prepareProjectEnvelope } from '../src/project-envelope.mjs';

await import('../scripts/generate-junction-example.mjs');
const ROOT = new URL('../examples/wiring-primitives/', import.meta.url);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const adapters = { 'board.atmega328p-16mhz-v1': { schemas: ['intent-mcu-project-contact-persistence@1'],
  prepare(value) { const opened = openCandidateUiSession(JSON.stringify(value));
    if (!opened.ok) throw new Error(opened.code); return { project: JSON.parse(opened.session.saveText()) }; } } };

test('CMP-019 example is canonical hashed and keeps a crossing electrically separate', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  const [entry] = manifest.entries;
  assert.deepEqual(entry.requirementIds, ['CMP-019']);
  const bytes = await readFile(new URL(entry.file, ROOT), 'utf8');
  assert.equal(sha256(bytes), entry.projectSha256);
  const opened = prepareProjectEnvelope(bytes, adapters);
  assert.equal(opened.ok, true, opened.code);
  const graph = opened.project.candidateCircuit;
  const layout = opened.project.candidateLayout;
  const junction = graph.junctions.find(({ id }) => id === entry.junction.id);
  assert.equal(junction.net, entry.junction.netId);
  const ground = graph.nets.find(({ id }) => id === entry.junction.netId);
  assert.deepEqual(ground.endpoints.map(({ component, pin }) => `${component}.${pin}`), entry.junction.endpointKeys);
  const crossing = graph.nets.find(({ id }) => id === entry.crossing.netIds[1]);
  assert(crossing && crossing.id !== ground.id);
  for (const netId of entry.crossing.netIds) {
    assert(layout.wireRoutes[netId].branches.some(({ points }) => points.some(
      ({ x, y }) => x === entry.crossing.point.x && y === entry.crossing.point.y)));
  }
  assert.equal(entry.crossing.electricallyConnected, false);
});
