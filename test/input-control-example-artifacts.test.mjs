// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { prepareProjectEnvelope } from '../src/project-envelope.mjs';

await import('../scripts/generate-input-control-examples.mjs');

const ROOT = new URL('../examples/input-controls/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const adapters = Object.freeze({ 'board.atmega328p-16mhz-v1': Object.freeze({
  schemas: Object.freeze(['intent-mcu-project-contact-persistence@1']),
  prepare(value) {
    const opened = openCandidateUiSession(JSON.stringify(value));
    if (!opened.ok) throw Object.assign(new Error(opened.code), opened);
    return { project: JSON.parse(opened.session.saveText()) };
  },
}) });

test('CMP-021/022/132 artifacts are canonical, hashed and profile-bounded', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  assert.equal(manifest.schema, 'intent-mcu-input-control-example-manifest@1');
  assert.deepEqual(manifest.entries.map((entry) => entry.requirementIds).flat(), ['CMP-021', 'CMP-022', 'CMP-132']);
  for (const entry of manifest.entries) {
    const bytes = await readFile(new URL(entry.file, ROOT), 'utf8');
    assert.equal(sha256(bytes), entry.projectSha256, entry.id);
    const parsed = JSON.parse(bytes);
    const source = parsed.project.project?.source?.files?.[0]?.content ?? parsed.project.source?.files?.[0]?.content;
    assert.equal(sha256(source), entry.sourceSha256, `${entry.id}:source`);
    const opened = prepareProjectEnvelope(bytes, adapters);
    assert.equal(opened.ok, true, `${entry.id}:${opened.code}`);
    assert.match(entry.profileBehavior['board.atmega328p-16mhz-v1'], /executable/u);
    for (const profile of ['board.rp2040-pico-v1', 'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1']) {
      assert.match(entry.profileBehavior[profile], entry.id === 'avr-quadrature-encoder'
        ? /unavailable in the current bounded Parts catalogue/u : /exact model is unavailable/u,
      `${entry.id}:${profile}`);
    }
  }
});

test('CMP-021/022/132 named wiring is exact', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  assert.deepEqual(manifest.entries.map((entry) => entry.namedPins), [
    { A: 'D2', B: 'GND1' },
    { A: 'D3', B: 'GND1' },
    { A: 'D2', B: 'D3', COM: 'GND2' },
  ]);
});
