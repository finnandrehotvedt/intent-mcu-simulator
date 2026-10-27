// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { FLAME_ANALOGUE_TYPE, RAIN_ANALOGUE_TYPE,
  SOUND_LEVEL_ANALOGUE_TYPE } from '../expansion-drafts/analogue-detection-sensors-v1.mjs';

const root = new URL('../examples/analogue-detection-sensors/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('CMP103/CMP109/CMP110 example is exact, openable and runtime-projectable', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.entries.length, 1);
  const [entry] = manifest.entries;
  assert.deepEqual(entry.requirementIds, ['CMP-103', 'CMP-109', 'CMP-110']);
  assert.deepEqual(entry.namedPins, { supply: 'VCC → 5V', ground: 'GND → GND1',
    rain: 'AOUT → A0', soundLevel: 'AOUT → A1', flame: 'AOUT → A5' });
  const bytes = await readFile(new URL(entry.file, root), 'utf8');
  assert.equal(sha256(bytes), entry.projectSha256);
  const envelope = JSON.parse(bytes);
  assert.equal(sha256(envelope.project.project.source.files[0].content), entry.sourceSha256);
  const opened = openCandidateUiSession(JSON.stringify(envelope.project));
  assert.equal(opened.ok, true, opened.code);
  assert.deepEqual(opened.session.runnable, { ok: true, code: 'OK', details: [] });
  const types = opened.session.visualProject.circuit.components.map((component) => component.type);
  for (const type of [RAIN_ANALOGUE_TYPE, SOUND_LEVEL_ANALOGUE_TYPE, FLAME_ANALOGUE_TYPE]) {
    assert.equal(types.filter((value) => value === type).length, 1);
  }
  const runtime = opened.session.runtimeProject.circuit.components.filter(
    (component) => ['rain-sensor-1', 'sound-level-1', 'flame-sensor-1'].includes(component.id),
  );
  assert.deepEqual(runtime.map(({ id, type, controls }) => [id, type, controls.position]), [
    ['flame-sensor-1', 'potentiometer.linear-v1', 0.85],
    ['rain-sensor-1', 'potentiometer.linear-v1', 0.2],
    ['sound-level-1', 'potentiometer.linear-v1', 0.55],
  ]);
});

