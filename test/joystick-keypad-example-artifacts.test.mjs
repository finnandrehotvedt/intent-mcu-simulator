// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
const root = new URL('../examples/joystick-keypads/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
test('CMP028/029/030 examples are exact, openable and runtime-projectable', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.deepEqual(manifest.entries.map(({ requirementIds }) => requirementIds[0]), ['CMP-028','CMP-029','CMP-030']);
  for (const entry of manifest.entries) { const bytes = await readFile(new URL(entry.file, root), 'utf8'); assert.equal(sha256(bytes), entry.projectSha256);
    const envelope = JSON.parse(bytes); assert.equal(sha256(envelope.project.project.source.files[0].content), entry.sourceSha256);
    const opened = openCandidateUiSession(JSON.stringify(envelope.project)); assert.equal(opened.ok, true, `${entry.id}:${opened.code}`);
    assert.deepEqual(opened.session.runnable, { ok: true, code: 'OK', details: [] }, entry.id); }
});
