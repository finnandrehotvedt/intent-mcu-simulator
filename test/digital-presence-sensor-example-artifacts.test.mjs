// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import {
  CAPACITIVE_TOUCH_TYPE, HALL_SWITCH_TYPE, PIR_MOTION_TYPE,
} from '../expansion-drafts/digital-presence-sensors-v1.mjs';

const root = new URL('../examples/digital-presence-sensors/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('CMP031/CMP121/CMP124 example is exact, openable and runtime-projectable', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.entries.length, 1);
  const [entry] = manifest.entries;
  assert.deepEqual(entry.requirementIds, ['CMP-031', 'CMP-121', 'CMP-124']);
  assert.deepEqual(entry.namedPins, { supply: 'VCC → 5V', ground: 'GND → GND1',
    touch: 'OUT → D4', motion: 'OUT → D5', hall: 'OUT → D6' });
  const bytes = await readFile(new URL(entry.file, root), 'utf8');
  assert.equal(sha256(bytes), entry.projectSha256);
  const envelope = JSON.parse(bytes);
  assert.equal(sha256(envelope.project.project.source.files[0].content), entry.sourceSha256);
  const opened = openCandidateUiSession(JSON.stringify(envelope.project));
  assert.equal(opened.ok, true, opened.code);
  assert.deepEqual(opened.session.runnable, { ok: true, code: 'OK', details: [] });
  const types = opened.session.visualProject.circuit.components.map((component) => component.type);
  for (const type of [CAPACITIVE_TOUCH_TYPE, PIR_MOTION_TYPE, HALL_SWITCH_TYPE]) {
    assert.equal(types.filter((value) => value === type).length, 1);
  }
  const runtime = opened.session.runtimeProject.circuit.components.filter(
    (component) => ['touch-button-1', 'pir-motion-1', 'hall-switch-1'].includes(component.id),
  );
  assert.deepEqual(runtime.map(({ id, type }) => [id, type]), [
    ['hall-switch-1', 'button.momentary-v1'],
    ['pir-motion-1', 'button.momentary-v1'],
    ['touch-button-1', 'button.momentary-v1'],
  ]);
});
