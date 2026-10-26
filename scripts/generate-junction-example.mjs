#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createAvrReferenceStarter } from '../src/avr-reference-starters.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief, prepareProjectEnvelope } from '../src/project-envelope.mjs';

const PROFILE = 'board.atmega328p-16mhz-v1';
const ROOT = new URL('../examples/wiring-primitives/', import.meta.url);
const adapter = Object.freeze({ schemas: Object.freeze(['intent-mcu-project-contact-persistence@1']),
  prepare(value) { const opened = openCandidateUiSession(JSON.stringify(value));
    if (!opened.ok) throw Object.assign(new Error(opened.code), opened);
    return { project: JSON.parse(opened.session.saveText()) }; } });
const adapters = Object.freeze({ [PROFILE]: adapter });
const starter = createAvrReferenceStarter('avr-ground-reference-input');
const project = structuredClone(starter.project);
project.project.metadata.name = 'Explicit junction and separate crossing';
const graph = project.candidateCircuit;
const layout = project.candidateLayout;
const ground = graph.nets.find(({ id }) => id === 'net-ground-branch');
const signal = graph.nets.find(({ id }) => id === 'net-button-d2');
if (!ground || ground.endpoints.length < 3 || !signal) throw new Error('CMP019_BASE_GRAPH');
const family = (net, paths) => ({ schema: 'intent-mcu-route@1', branches: net.endpoints.map((endpoint, index) => ({
  endpoint, points: paths[index] ?? paths.at(-1),
})) });
layout.wireRoutes[ground.id] = family(ground, [
  [{ x: 0.2, y: 0.7 }, { x: 0.5, y: 0.7 }, { x: 0.5, y: 0.5 }],
  [{ x: 0.8, y: 0.7 }, { x: 0.5, y: 0.7 }, { x: 0.5, y: 0.5 }],
  [{ x: 0.5, y: 0.9 }, { x: 0.5, y: 0.5 }],
  [{ x: 0.3, y: 0.8 }, { x: 0.5, y: 0.8 }, { x: 0.5, y: 0.5 }],
  [{ x: 0.7, y: 0.8 }, { x: 0.5, y: 0.8 }, { x: 0.5, y: 0.5 }],
  [{ x: 0.5, y: 0.95 }, { x: 0.5, y: 0.5 }],
]);
layout.wireRoutes[signal.id] = family(signal, [
  [{ x: 0.2, y: 0.5 }, { x: 0.5, y: 0.5 }],
  [{ x: 0.8, y: 0.5 }, { x: 0.5, y: 0.5 }],
]);
const bytes = canonicalProjectEnvelope(PROFILE, project, adapters, emptyProjectBrief(), null,
  CURRENT_MODEL_LIBRARY_LOCK);
const opened = prepareProjectEnvelope(bytes, adapters);
if (!opened.ok) throw new Error(`CMP019_VALIDATE:${opened.code}`);
const hash = createHash('sha256').update(bytes).digest('hex');
if (process.argv.includes('--write')) {
  await mkdir(ROOT, { recursive: true });
  await writeFile(new URL('avr-explicit-junction-crossing.intent-mcu.json', ROOT), bytes);
  await writeFile(new URL('manifest.json', ROOT), `${JSON.stringify({
    schema: 'intent-mcu-wiring-primitive-example-manifest@1',
    entries: [{ id: 'avr-explicit-junction-crossing', requirementIds: ['CMP-019'],
      file: 'avr-explicit-junction-crossing.intent-mcu.json', profile: PROFILE,
      projectSha256: hash, junction: { id: 'junction-ground', netId: ground.id,
        endpointKeys: ground.endpoints.map(({ component, pin }) => `${component}.${pin}`) },
      crossing: { netIds: [ground.id, signal.id], point: { x: 0.5, y: 0.5 }, electricallyConnected: false },
      expectedBehavior: 'Only the declared ground junction joins branches; the D2 route crossing at the same drawing point remains a separate net.',
      limits: 'A junction is an explicit graph operation, not a decorative component. Route crossings never infer electrical identity.',
    }],
  }, null, 2)}\n`);
}
console.log(JSON.stringify({ ok: true, schema: JSON.parse(bytes).schema, sha256: hash,
  junctionId: graph.junctions.find(({ net }) => net === ground.id)?.id, groundNet: ground.id,
  crossingNet: signal.id, groundEndpoints: ground.endpoints.length }));
