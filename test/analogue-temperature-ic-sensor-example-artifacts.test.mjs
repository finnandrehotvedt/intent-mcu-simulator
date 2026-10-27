// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { LM35_TEMPERATURE_TYPE,
  TMP36_TEMPERATURE_TYPE } from '../expansion-drafts/analogue-temperature-ic-sensors-v1.mjs';

const root = new URL('../examples/analogue-temperature-ic-sensors/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('CMP089/CMP090 example is exact, openable and runtime-projectable', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.entries.length, 1);
  const [entry] = manifest.entries;
  assert.deepEqual(entry.requirementIds, ['CMP-089', 'CMP-090']);
  assert.deepEqual(entry.namedPins, { supply: 'VCC → 5V', ground: 'GND → GND1',
    tmp36: 'AOUT → A0', lm35: 'AOUT → A1' });
  assert.equal(entry.profileBehavior['board.rp2040-pico-v1'], 'unavailable');
  assert.equal(entry.profileBehavior['board.esp32-c3-devmodule-v1'], 'unavailable');
  assert.equal(entry.profileBehavior['board.stm32f429zi-nucleo144-v1'], 'unavailable');
  const bytes = await readFile(new URL(entry.file, root), 'utf8');
  assert.equal(sha256(bytes), entry.projectSha256);
  const envelope = JSON.parse(bytes);
  assert.equal(sha256(envelope.project.project.source.files[0].content), entry.sourceSha256);
  assert.match(envelope.project.project.source.files[0].content, /\(tmp36V - 0\.5\) \* 100\.0/u);
  assert.match(envelope.project.project.source.files[0].content, /lm35V \* 100\.0/u);
  const opened = openCandidateUiSession(JSON.stringify(envelope.project));
  assert.equal(opened.ok, true, opened.code);
  assert.deepEqual(opened.session.runnable, { ok: true, code: 'OK', details: [] });
  const types = opened.session.visualProject.circuit.components.map((component) => component.type);
  for (const type of [TMP36_TEMPERATURE_TYPE, LM35_TEMPERATURE_TYPE]) {
    assert.equal(types.filter((value) => value === type).length, 1);
  }
  const runtime = opened.session.runtimeProject.circuit.components.filter(
    (component) => ['tmp36-1', 'lm35-1'].includes(component.id),
  );
  assert.deepEqual(runtime.map(({ id, type, controls }) => [id, type, controls.position]), [
    ['lm35-1', 'potentiometer.linear-v1', 0.09],
    ['tmp36-1', 'potentiometer.linear-v1', 0.16],
  ]);
});
