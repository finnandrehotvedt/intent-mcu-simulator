// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';

const root = new URL('../examples/rotary-selector-indicators/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('CMP036/039/040 generated examples are exact, openable and runtime-projectable', async () => {
  const manifestText = await readFile(new URL('manifest.json', root), 'utf8');
  const manifest = JSON.parse(manifestText);
  assert.deepEqual(manifest.entries.map(({ requirementIds }) => requirementIds[0]), ['CMP-036', 'CMP-039', 'CMP-040']);
  for (const entry of manifest.entries) {
    const bytes = await readFile(new URL(entry.file, root), 'utf8');
    assert.equal(sha256(bytes), entry.projectSha256);
    const envelope = JSON.parse(bytes);
    assert.equal(sha256(envelope.project.project.source.files[0].content), entry.sourceSha256);
    const opened = openCandidateUiSession(JSON.stringify(envelope.project));
    assert.equal(opened.ok, true, `${entry.id}:${opened.code}`);
    assert.deepEqual(opened.session.runnable, { ok: true, code: 'OK', details: [] }, entry.id);
    const reopened = openCandidateUiSession(opened.session.saveText());
    assert.equal(reopened.ok, true);
    assert.deepEqual(reopened.session.visualProject.circuit, opened.session.visualProject.circuit);
  }
});

test('examples preserve physical pin truth and active-low output truth', async () => {
  const selector = JSON.parse(await readFile(new URL('avr-rotary-selector-4.intent-mcu.json', root), 'utf8')).project;
  const selectorComponent = selector.candidateCircuit.components.find(({ type }) => type === 'switch.rotary-selector-4-v1');
  assert.deepEqual(selectorComponent.controls, { position: 1 });
  assert(selector.candidateCircuit.nets.some(({ endpoints }) => endpoints.some(
    ({ component, pin }) => component === selectorComponent.id && pin === 'P4')));

  const rgb = openCandidateUiSession(JSON.stringify(JSON.parse(await readFile(
    new URL('avr-rgb-common-anode.intent-mcu.json', root), 'utf8')).project));
  const rgbSupport = rgb.session.runtimeSupport.find(({ type }) => type === 'output.rgb-led-common-anode-v1');
  assert.equal(rgbSupport.runtimeAdapter, 'three-independent-active-low-led-v1');

  const bar = JSON.parse(await readFile(new URL('avr-led-bar-graph.intent-mcu.json', root), 'utf8')).project;
  const barComponent = bar.candidateCircuit.components.find(({ type }) => type === 'output.led-bar-graph-10-v1');
  assert.equal(new Set(bar.candidateCircuit.nets.flatMap(({ endpoints }) => endpoints
    .filter(({ component }) => component === barComponent.id).map(({ pin }) => pin))).size, 20);
});
