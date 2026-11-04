// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { prepareProjectEnvelope } from '../src/project-envelope.mjs';

await import('../scripts/generate-indicator-actuator-examples.mjs');
const ROOT = new URL('../examples/indicators-actuators/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const adapters = Object.freeze({ 'board.atmega328p-16mhz-v1': Object.freeze({
  schemas: Object.freeze(['intent-mcu-project-contact-persistence@1']), prepare(value) {
    const opened = openCandidateUiSession(JSON.stringify(value));
    if (!opened.ok) throw Object.assign(new Error(opened.code), opened);
    return { project: JSON.parse(opened.session.saveText()) };
  },
}) });

test('indicator and actuator artifacts through CMP-075 are canonical, hashed and profile-bounded', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  assert.deepEqual(manifest.entries.flatMap((entry) => entry.requirementIds), [
    'CMP-038', 'CMP-041', 'CMP-042', 'CMP-043', 'CMP-064', 'CMP-063', 'CMP-065', 'CMP-066', 'CMP-067', 'CMP-068', 'CMP-075',
  ]);
  for (const entry of manifest.entries) {
    const bytes = await readFile(new URL(entry.file, ROOT), 'utf8');
    assert.equal(sha256(bytes), entry.projectSha256, entry.id);
    const opened = prepareProjectEnvelope(bytes, adapters);
    assert.equal(opened.ok, true, `${entry.id}:${opened.code}`);
    assert.equal(sha256(opened.project.project.source.files[0].content), entry.sourceSha256, `${entry.id}:source`);
    assert(Object.keys(entry.namedPins).length >= 2, `${entry.id}:pins`);
    assert.match(entry.profileBehavior['board.atmega328p-16mhz-v1'], /executable/u);
  }
});

test('indicator examples contain the exact qualified component models', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  for (const entry of manifest.entries) {
    const parsed = JSON.parse(await readFile(new URL(entry.file, ROOT), 'utf8'));
    assert(parsed.project.candidateCircuit.components.some((component) => component.type === entry.componentType), entry.id);
    if (entry.pairedComponentType) assert(parsed.project.candidateCircuit.components.some(
      (component) => component.type === entry.pairedComponentType), `${entry.id}:pair`);
  }
});

test('CMP-038 manifest labels match the actual temperature example PWM wiring', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  const entry = manifest.entries.find(({ requirementIds }) => requirementIds.includes('CMP-038'));
  assert.deepEqual(entry.namedPins, {
    R: 'D5 through 220 Ω',
    G: 'D6 through 220 Ω',
    B: 'D9 through 220 Ω',
    COM: 'GND1',
  });
  const envelope = JSON.parse(await readFile(new URL(entry.file, ROOT), 'utf8'));
  const circuit = envelope.project.candidateCircuit;
  const boardPinFor = (channel) => {
    const channelNet = circuit.nets.find(({ endpoints }) => endpoints.some(
      ({ component, pin }) => component === 'rgb-led-1' && pin === channel,
    ));
    const resistor = channelNet.endpoints.find(({ component }) => component.startsWith('resistor-'));
    return circuit.nets.find(({ id }) => id.endsWith(`${resistor.component.split('-').at(-1)}-drive`))
      .endpoints.find(({ component }) => component === 'board-1').pin;
  };
  assert.deepEqual(Object.fromEntries(['R', 'G', 'B'].map((channel) =>
    [channel, boardPinFor(channel)])), { R: 'D5', G: 'D6', B: 'D9' });
  assert(circuit.nets.find(({ id }) => id === 'net-example-ground').endpoints.some(
    ({ component, pin }) => component === 'rgb-led-1' && pin === 'COM',
  ));
});
