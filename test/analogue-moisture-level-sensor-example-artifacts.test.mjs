// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { ANALOGUE_WATER_LEVEL_TYPE, CAPACITIVE_SOIL_MOISTURE_TYPE,
  RESISTIVE_SOIL_MOISTURE_TYPE } from '../expansion-drafts/analogue-moisture-level-sensors-v1.mjs';

const root = new URL('../examples/analogue-moisture-level-sensors/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('CMP101/CMP102/CMP104 example is exact, openable and runtime-projectable', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.entries.length, 1);
  const [entry] = manifest.entries;
  assert.deepEqual(entry.requirementIds, ['CMP-101', 'CMP-102', 'CMP-104']);
  assert.deepEqual(entry.namedPins, { supply: 'VCC → 5V', ground: 'GND → GND1',
    resistive: 'AOUT → A2', capacitive: 'AOUT → A3', waterLevel: 'AOUT → A4' });
  const bytes = await readFile(new URL(entry.file, root), 'utf8');
  assert.equal(sha256(bytes), entry.projectSha256);
  const envelope = JSON.parse(bytes);
  assert.equal(sha256(envelope.project.project.source.files[0].content), entry.sourceSha256);
  const opened = openCandidateUiSession(JSON.stringify(envelope.project));
  assert.equal(opened.ok, true, opened.code);
  assert.deepEqual(opened.session.runnable, { ok: true, code: 'OK', details: [] });
  const types = opened.session.visualProject.circuit.components.map((component) => component.type);
  for (const type of [RESISTIVE_SOIL_MOISTURE_TYPE, CAPACITIVE_SOIL_MOISTURE_TYPE,
    ANALOGUE_WATER_LEVEL_TYPE]) assert.equal(types.filter((value) => value === type).length, 1);
  const runtime = opened.session.runtimeProject.circuit.components.filter(
    (component) => ['soil-resistive-1', 'soil-capacitive-1', 'water-level-1'].includes(component.id),
  );
  assert.deepEqual(runtime.map(({ id, type, controls }) => [id, type, controls.position]), [
    ['soil-capacitive-1', 'potentiometer.linear-v1', 0.6],
    ['soil-resistive-1', 'potentiometer.linear-v1', 0.25],
    ['water-level-1', 'potentiometer.linear-v1', 0.8],
  ]);
});
