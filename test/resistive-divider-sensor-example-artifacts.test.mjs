// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';

const root = new URL('../examples/resistive-divider-sensors/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
test('CMP085/CMP088/CMP116 canonical example is hashed, openable and executable', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  const [entry] = manifest.entries; assert.deepEqual(entry.requirementIds, ['CMP-085', 'CMP-088', 'CMP-116']);
  assert.deepEqual(entry.namedPins, { supply: 'VCC → 5V', ground: 'GND → GND1',
    ldr: 'AOUT → A0', ntc: 'AOUT → A1', flex: 'AOUT → A2' });
  for (const profile of ['board.rp2040-pico-v1', 'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1']) {
    assert.equal(entry.profileBehavior[profile], 'unavailable');
  }
  const bytes = await readFile(new URL(entry.file, root), 'utf8'); assert.equal(sha256(bytes), entry.projectSha256);
  const envelope = JSON.parse(bytes); assert.equal(sha256(envelope.project.project.source.files[0].content), entry.sourceSha256);
  const opened = openCandidateUiSession(JSON.stringify(envelope.project)); assert.equal(opened.ok, true, opened.code);
  assert.deepEqual(opened.session.runnable, { ok: true, code: 'OK', details: [] });
  assert.equal(opened.session.runtimeProject.circuit.components.filter((item) =>
    ['ldr-divider-1', 'ntc-divider-1', 'flex-divider-1'].includes(item.id)
      && item.type === 'potentiometer.linear-v1').length, 3);
});
