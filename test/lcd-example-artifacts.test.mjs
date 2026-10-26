// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import {
  PRE_LCD_API_DUPLICATE_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_LCD_PERSISTENCE_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_PRESERVED_DRAFT_EXPORT_CURRENT_MODEL_LIBRARY_LOCK,
  RETAINED_MODEL_LIBRARY_LOCK, resolveModelLibrary,
} from '../src/model-library.mjs';
import { prepareProjectEnvelope } from '../src/project-envelope.mjs';

const root = new URL('../examples/lcd/', import.meta.url);
const AVR = 'board.atmega328p-16mhz-v1';
const adapter = Object.freeze({ schemas: Object.freeze(['intent-mcu-project-contact-persistence@1']), prepare(value) {
  const opened = openCandidateUiSession(JSON.stringify(value));
  if (!opened.ok) throw Object.assign(new Error(opened.code), opened);
  return { project: JSON.parse(opened.session.saveText()), prepared: opened.session };
} });
const adapters = Object.freeze({ [AVR]: adapter });

test('committed CMP-050, CMP-051, CMP-052 and CMP-062 files are exact current common envelopes', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.schema, 'intent-mcu-lcd-example-manifest@3');
  assert.equal(manifest.profile, AVR);
  assert.deepEqual(manifest.entries.map((entry) => entry.requirementIds[0]), ['CMP-050', 'CMP-051', 'CMP-052']);
  for (const entry of manifest.entries) {
    const bytes = await readFile(new URL(entry.file, root), 'utf8');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.projectSha256);
    const raw = JSON.parse(bytes);
    assert.equal(raw.schema, 'intent-mcu-project-envelope@8');
    assert.deepEqual(raw.modelLibrary, manifest.modelLibrary);
    const opened = prepareProjectEnvelope(bytes, adapters);
    assert.equal(opened.ok, true, `${entry.id}:${opened.code}`);
    assert.equal(opened.prepared.runnable.ok, true, `${entry.id}:${opened.prepared.runnable.code}`);
    assert(entry.sourceSha256?.length === 64);
    assert.deepEqual(entry.sourceFiles, raw.project.project.source.files.map(({ name, content }) => ({
      name, sha256: createHash('sha256').update(content).digest('hex'),
    })));
    assert.equal(entry.sourceFiles[0].sha256, entry.sourceSha256);
    assert(Object.keys(entry.namedPins).length >= 4);
    assert.equal(Object.keys(entry.profileBehavior).length, 4);
    assert(entry.expectedBehavior.length > 20 && entry.firmwareLimits.length > 20 && entry.provenance.length > 20);
    assert(entry.participatingComponentIds.includes('board-1'));
    const lcdComponentId = entry.id === 'pcf8574-lcd-backpack' ? 'pcf8574-lcd-1' : 'character-lcd-1';
    assert.deepEqual(entry.participatingComponentIds, ['board-1', lcdComponentId]);
    assert.equal(entry.participatingNets.length, new Set(Object.values(entry.namedPins)).size);
    const actualNets = raw.project.candidateCircuit.nets
      .filter((net) => net.endpoints.some((endpoint) => endpoint.component === lcdComponentId))
      .map((net) => ({ id: net.id, endpoints: net.endpoints.map(({ component, pin }) => `${component}.${pin}`) }));
    assert.deepEqual(entry.participatingNets, actualNets);
    const connectedIds = new Set([lcdComponentId]);
    for (const net of actualNets) {
      for (const endpoint of net.endpoints) connectedIds.add(endpoint.slice(0, endpoint.lastIndexOf('.')));
    }
    assert.deepEqual(entry.electricallyConnectedComponentIds, [...connectedIds].sort());
    for (const net of entry.participatingNets) {
      assert(net.endpoints.some((endpoint) => endpoint.startsWith('board-1.')),
        `${entry.id}:${net.id} has no controller endpoint`);
      assert(net.endpoints.some((endpoint) => endpoint.startsWith(`${lcdComponentId}.`)),
        `${entry.id}:${net.id} has no LCD endpoint`);
    }
  }
  const backpack = manifest.entries.find((entry) => entry.id === 'pcf8574-lcd-backpack');
  assert.equal(backpack.previousProjectSha256, '6d4c8d6a1f42a251c441ec6bc811066397c0a17be731be52a63c60e80d1e3e75');
  assert.equal(backpack.sourceSha256, '4fdce12246f4eb202259a492795ac93f5b59ce56678c357dbb30120ca3e6c809');
  assert.deepEqual(backpack.namedPins, { VCC: '5V', GND: 'GND1', SDA: 'A4', SCL: 'A5' });
  const lcd20x4 = manifest.entries.find((entry) => entry.id === 'avr-character-lcd-20x4-cgram');
  assert.deepEqual(lcd20x4.requirementIds, ['CMP-052', 'CMP-062']);
  assert.equal(lcd20x4.sourceSha256, '4950c66f1669022ffa91528ee5e557bd789833caa08e961bd374c1a8eea63f3e');
  assert.equal(Object.keys(lcd20x4.namedPins).length, 9);
});

test('raw new-PCF candidate remains rejected by retained legacy admission', async () => {
  const envelope = JSON.parse(await readFile(new URL('pcf8574-0x27-lcd.intent-mcu.json', root), 'utf8'));
  const rawCandidate = JSON.stringify(envelope.project);
  const retained = resolveModelLibrary(RETAINED_MODEL_LIBRARY_LOCK);
  assert.equal(retained.ok, true);
  const result = retained.implementation.openCandidateUiSession(rawCandidate);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'PROJECT_CONTACT_UNKNOWN_COMPONENT');
});

test('the preceding valid LCD export reopens losslessly with runtime authority cleared', async () => {
  const current = JSON.parse(await readFile(new URL('parallel-hd44780-20x4-cgram.intent-mcu.json', root), 'utf8'));
  for (const priorLock of [PRE_LCD_API_DUPLICATE_FIX_CURRENT_MODEL_LIBRARY_LOCK,
    PRE_LCD_PERSISTENCE_FIX_CURRENT_MODEL_LIBRARY_LOCK,
    PRE_PRESERVED_DRAFT_EXPORT_CURRENT_MODEL_LIBRARY_LOCK]) {
    const prior = structuredClone(current); prior.modelLibrary = structuredClone(priorLock);
    const opened = prepareProjectEnvelope(JSON.stringify(prior), adapters);
    assert.equal(opened.ok, true, `${priorLock.manifestSha256}:${opened.code}`);
    assert.equal(opened.report.modelLibrary.migrationAvailable, true);
    assert.equal(opened.report.modelLibrary.executableAuthority, false);
    assert.deepEqual(opened.project.candidateCircuit, prior.project.candidateCircuit);
    assert.deepEqual(opened.project.candidateLayout, prior.project.candidateLayout);
    assert.deepEqual(opened.project.project.source, prior.project.project.source);
  }
});
