// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';

const root = new URL('../examples/lcd/', import.meta.url);

test('committed CMP-050 and CMP-051 beginner project files are exact and openable', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.schema, 'intent-mcu-lcd-example-manifest@1');
  assert.equal(manifest.profile, 'board.atmega328p-16mhz-v1');
  assert.deepEqual(manifest.entries.map((entry) => entry.requirementIds[0]), ['CMP-050', 'CMP-051']);
  for (const entry of manifest.entries) {
    const bytes = await readFile(new URL(entry.file, root), 'utf8');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.projectSha256);
    const opened = openCandidateUiSession(bytes);
    assert.equal(opened.ok, true, `${entry.id}:${opened.code}`);
    assert.equal(opened.session.runnable.ok, true, `${entry.id}:${opened.session.runnable.code}`);
    assert(entry.expectedBehavior.length > 20);
  }
  const backpack = manifest.entries.find((entry) => entry.id === 'pcf8574-lcd-backpack');
  assert.equal(backpack.sourceSha256, '4fdce12246f4eb202259a492795ac93f5b59ce56678c357dbb30120ca3e6c809');
  assert.deepEqual(backpack.namedPins, { VCC: '5V', GND: 'GND1', SDA: 'A4', SCL: 'A5' });
});
