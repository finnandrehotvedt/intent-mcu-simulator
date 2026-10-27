// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { HALL_MAGNETIC_ANALOGUE_TYPE,
  WIND_DIRECTION_ANALOGUE_TYPE } from '../expansion-drafts/analogue-direction-field-sensors-v1.mjs';

const root = new URL('../examples/analogue-direction-field-sensors/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('CMP113/CMP125 example is exact, openable and runtime-projectable', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.entries.length, 1);
  const [entry] = manifest.entries;
  assert.deepEqual(entry.requirementIds, ['CMP-113', 'CMP-125']);
  assert.deepEqual(entry.namedPins, { supply: 'VCC → 5V', ground: 'GND → GND1',
    windDirection: 'AOUT → A0', hallField: 'AOUT → A1' });
  assert.equal(entry.profileBehavior['board.rp2040-pico-v1'], 'unavailable');
  assert.equal(entry.profileBehavior['board.esp32-c3-devmodule-v1'], 'unavailable');
  assert.equal(entry.profileBehavior['board.stm32f429zi-nucleo144-v1'], 'unavailable');
  const bytes = await readFile(new URL(entry.file, root), 'utf8');
  assert.equal(sha256(bytes), entry.projectSha256);
  const envelope = JSON.parse(bytes);
  assert.equal(sha256(envelope.project.project.source.files[0].content), entry.sourceSha256);
  const opened = openCandidateUiSession(JSON.stringify(envelope.project));
  assert.equal(opened.ok, true, opened.code);
  assert.deepEqual(opened.session.runnable, { ok: true, code: 'OK', details: [] });
  const types = opened.session.visualProject.circuit.components.map((component) => component.type);
  for (const type of [WIND_DIRECTION_ANALOGUE_TYPE, HALL_MAGNETIC_ANALOGUE_TYPE]) {
    assert.equal(types.filter((value) => value === type).length, 1);
  }
  const runtime = opened.session.runtimeProject.circuit.components.filter(
    (component) => ['wind-direction-1', 'hall-field-1'].includes(component.id),
  );
  assert.deepEqual(runtime.map(({ id, type, controls }) => [id, type, controls.position]), [
    ['hall-field-1', 'potentiometer.linear-v1', 0.3],
    ['wind-direction-1', 'potentiometer.linear-v1', 0.25],
  ]);
});
