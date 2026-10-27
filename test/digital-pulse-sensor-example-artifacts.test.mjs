// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { FLOW_PULSE_SENSOR_TYPE,
  WIND_SPEED_PULSE_SENSOR_TYPE } from '../expansion-drafts/digital-pulse-sensors-v1.mjs';

const root = new URL('../examples/digital-pulse-sensors/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('CMP106/CMP112 example is exact, openable and runtime-projectable', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.entries.length, 1);
  const [entry] = manifest.entries;
  assert.deepEqual(entry.requirementIds, ['CMP-106', 'CMP-112']);
  assert.deepEqual(entry.namedPins, { supply: 'VCC → 5V', ground: 'GND → GND1',
    flow: 'OUT → D4', wind: 'OUT → D5' });
  assert.match(entry.expectedBehavior, /no automatic pulse train, flow rate or wind speed/u);
  assert.deepEqual(Object.values(entry.profileBehavior).filter((value) => value === 'unavailable').length, 3);
  const bytes = await readFile(new URL(entry.file, root), 'utf8');
  assert.equal(sha256(bytes), entry.projectSha256);
  const envelope = JSON.parse(bytes);
  const source = envelope.project.project.source.files[0].content;
  assert.equal(sha256(source), entry.sourceSha256);
  assert.match(source, /flowEdges\+\+/u); assert.match(source, /windEdges\+\+/u);
  const opened = openCandidateUiSession(JSON.stringify(envelope.project));
  assert.equal(opened.ok, true, opened.code);
  assert.deepEqual(opened.session.runnable, { ok: true, code: 'OK', details: [] });
  const types = opened.session.visualProject.circuit.components.map((component) => component.type);
  assert.equal(types.filter((value) => value === FLOW_PULSE_SENSOR_TYPE).length, 1);
  assert.equal(types.filter((value) => value === WIND_SPEED_PULSE_SENSOR_TYPE).length, 1);
  const runtime = opened.session.runtimeProject.circuit.components.filter(
    (component) => ['flow-pulse-1', 'wind-pulse-1'].includes(component.id),
  );
  assert.deepEqual(runtime.map(({ id, type, controls }) => [id, type, controls]), [
    ['flow-pulse-1', 'button.momentary-v1', { pressed: true }],
    ['wind-pulse-1', 'button.momentary-v1', { pressed: true }],
  ]);
});
