// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { BALL_VIBRATION_SWITCH_TYPE, FLOAT_SWITCH_TYPE,
  TILT_SWITCH_TYPE } from '../expansion-drafts/contact-sensors-v1.mjs';

const root = new URL('../examples/contact-sensors/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('CMP105/CMP130/CMP131 example is exact, openable and runtime-projectable', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.entries.length, 1); const [entry] = manifest.entries;
  assert.deepEqual(entry.requirementIds, ['CMP-105', 'CMP-130', 'CMP-131']);
  assert.deepEqual(entry.namedPins, { float: 'A → D4, B → GND1', tilt: 'A → D5, B → GND2',
    vibration: 'A → D6, B → GND3' });
  assert.deepEqual(Object.values(entry.profileBehavior).slice(1), ['unavailable', 'unavailable', 'unavailable']);
  const bytes = await readFile(new URL(entry.file, root), 'utf8'); assert.equal(sha256(bytes), entry.projectSha256);
  const envelope = JSON.parse(bytes); assert.equal(sha256(envelope.project.project.source.files[0].content), entry.sourceSha256);
  const opened = openCandidateUiSession(JSON.stringify(envelope.project)); assert.equal(opened.ok, true, opened.code);
  assert.deepEqual(opened.session.runnable, { ok: true, code: 'OK', details: [] });
  const types = opened.session.visualProject.circuit.components.map(({ type }) => type);
  for (const type of [FLOAT_SWITCH_TYPE, TILT_SWITCH_TYPE, BALL_VIBRATION_SWITCH_TYPE]) {
    assert.equal(types.filter((value) => value === type).length, 1);
  }
  const runtime = opened.session.runtimeProject.circuit.components.filter(({ id }) =>
    ['float-switch-1', 'tilt-switch-1', 'vibration-switch-1'].includes(id));
  assert(runtime.every(({ type }) => type === 'button.momentary-v1'));
  assert.match(envelope.project.project.source.files[0].content, /INPUT_PULLUP/u);
});
