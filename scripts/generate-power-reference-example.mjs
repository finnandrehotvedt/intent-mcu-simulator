#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createAvrReferenceStarter } from '../src/avr-reference-starters.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import {
  canonicalProjectEnvelope, emptyProjectBrief, prepareProjectEnvelope,
} from '../src/project-envelope.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const ROOT = new URL('../examples/power-references/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const candidateAdapter = Object.freeze({
  schemas: Object.freeze(['intent-mcu-project-contact-persistence@1']),
  prepare(value) {
    const opened = openCandidateUiSession(JSON.stringify(value));
    if (!opened.ok) throw Object.assign(new Error(opened.code), opened);
    return { project: JSON.parse(opened.session.saveText()) };
  },
});
const adapters = Object.freeze({ [AVR]: candidateAdapter });
const starter = createAvrReferenceStarter('avr-ground-power-references');
const bytes = canonicalProjectEnvelope(
  AVR, starter.project, adapters, emptyProjectBrief(), null, CURRENT_MODEL_LIBRARY_LOCK,
);
const opened = prepareProjectEnvelope(bytes, adapters);
if (!opened.ok) throw new Error(`POWER_REFERENCE_EXAMPLE_INVALID:${opened.code}`);
const source = starter.project.project.source.files[0].content;
const manifest = {
  schema: 'intent-mcu-power-reference-example-manifest@1',
  profile: AVR,
  modelLibrary: CURRENT_MODEL_LIBRARY_LOCK,
  entries: [{
    id: starter.id,
    requirementIds: ['CMP-020'],
    file: 'avr-ground-power-references.intent-mcu.json',
    componentTypes: ['reference.ground-v1', 'reference.power-5v-v1'],
    namedPins: { ground: 'REF → circuit 0 V', power: 'OUT → D3', fixedVoltage: '5 V' },
    expectedBehavior: 'Compiled firmware observes the fixed 5 V source as D3 HIGH while the independent D2 ground path follows the button.',
    limits: 'AVR-only topology projection to the board 5 V output; no independent supply, regulator, source impedance, current capacity, short-circuit, earth or chassis model.',
    profileBehavior: {
      [AVR]: 'authoring and executable topology projection available after a fresh isolated Build',
      'board.rp2040-pico-v1': 'the exact 5 V source is unavailable; do not infer it from the separate 3.3 V ground authoring symbol',
      'board.esp32-c3-devmodule-v1': 'the exact 5 V source is unavailable; do not infer it from the separate 3.3 V ground authoring symbol',
      'board.stm32f429zi-nucleo144-v1': 'the exact 5 V source is unavailable; do not infer it from the separate 3.3 V ground authoring symbol',
    },
    sourceSha256: sha256(source),
    projectSha256: sha256(bytes),
    provenance: 'Original project-owned reference contracts, SVG artwork, circuit factory and canonical project envelope.',
  }],
};
const expected = new Map([
  ['avr-ground-power-references.intent-mcu.json', bytes],
  ['manifest.json', `${JSON.stringify(manifest, null, 2)}\n`],
]);
if (process.argv.includes('--write')) {
  await mkdir(ROOT, { recursive: true });
  for (const [file, contents] of expected) await writeFile(new URL(file, ROOT), contents);
} else {
  for (const [file, contents] of expected) {
    if (await readFile(new URL(file, ROOT), 'utf8') !== contents) {
      throw new Error(`POWER_REFERENCE_ARTIFACT_STALE:${file}`);
    }
  }
}
