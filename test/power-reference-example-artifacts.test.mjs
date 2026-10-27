// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { prepareProjectEnvelope } from '../src/project-envelope.mjs';

await import('../scripts/generate-power-reference-example.mjs');

const AVR = 'board.atmega328p-16mhz-v1';
const ROOT = new URL('../examples/power-references/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const adapters = Object.freeze({ [AVR]: Object.freeze({
  schemas: Object.freeze(['intent-mcu-project-contact-persistence@1']),
  prepare(value) {
    const opened = openCandidateUiSession(JSON.stringify(value));
    if (!opened.ok) throw Object.assign(new Error(opened.code), opened);
    return { project: JSON.parse(opened.session.saveText()) };
  },
}) });

test('CMP-020 example is canonical, hash-locked and explicitly AVR-only', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  assert.equal(manifest.schema, 'intent-mcu-power-reference-example-manifest@1');
  assert.deepEqual(manifest.modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(manifest.entries.length, 1);
  const [entry] = manifest.entries;
  assert.deepEqual(entry.requirementIds, ['CMP-020']);
  assert.deepEqual(entry.componentTypes, ['reference.ground-v1', 'reference.power-5v-v1']);
  assert.match(entry.profileBehavior[AVR], /executable topology projection/u);
  for (const profile of ['board.rp2040-pico-v1', 'board.esp32-c3-devmodule-v1',
    'board.stm32f429zi-nucleo144-v1']) {
    assert.match(entry.profileBehavior[profile], /exact 5 V source is unavailable/u, profile);
  }
  const bytes = await readFile(new URL(entry.file, ROOT), 'utf8');
  assert.equal(sha256(bytes), entry.projectSha256);
  const envelope = JSON.parse(bytes);
  assert.equal(sha256(envelope.project.project.source.files[0].content), entry.sourceSha256);
  const prepared = prepareProjectEnvelope(bytes, adapters);
  assert.equal(prepared.ok, true, prepared.code);
});

test('CMP-020 example reopens runnable with distinct REF and OUT semantics', async () => {
  const bytes = await readFile(new URL('avr-ground-power-references.intent-mcu.json', ROOT), 'utf8');
  const prepared = prepareProjectEnvelope(bytes, adapters);
  assert.equal(prepared.ok, true, prepared.code);
  const opened = openCandidateUiSession(JSON.stringify(prepared.project));
  assert.equal(opened.ok, true, opened.code);
  assert.deepEqual(opened.session.runnable, { ok: true, code: 'OK', details: [] });
  const graph = opened.session.visualProject.circuit;
  assert.equal(graph.components.filter(({ type }) => type === 'reference.ground-v1').length, 1);
  assert.equal(graph.components.filter(({ type }) => type === 'reference.power-5v-v1').length, 1);
  assert(graph.nets.some(({ endpoints }) => endpoints.some(({ component, pin }) =>
    component === 'ground-reference-1' && pin === 'REF')));
  assert(graph.nets.some(({ endpoints }) => endpoints.some(({ component, pin }) =>
    component === 'power-reference-1' && pin === 'OUT')
    && endpoints.some(({ component, pin }) => component === 'board-1' && pin === 'D3')));
  assert.equal(opened.session.runtimeProject.circuit.components.some(({ type }) =>
    ['reference.ground-v1', 'reference.power-5v-v1'].includes(type)), false);
});
