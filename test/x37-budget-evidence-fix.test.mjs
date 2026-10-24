import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { persistX37CompilerArtifact } from '../src/x37-producer-artifact-evidence.mjs';
import { createX37PrivateRuntimeJournal } from '../src/x37-private-runtime-journal.mjs';
import { loadX37RetainedArtifacts } from '../src/x37-retained-artifact-loader.mjs';
import { createHash } from 'node:crypto';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('bounded private journal retains intermediate failure evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'x37-journal-'));
  try {
    const journal = createX37PrivateRuntimeJournal(directory);
    journal.append('environment', { crypto: true });
    journal.append('observation', { cycle: 12, instructions: 4, generation: 1 });
    journal.append('failure', { code: 'X37_SEAM_ADVANCE_CALL_CAP', advanceCalls: 32 });
    journal.append('cleanup', { retired: true, disposed: true });
    assert.equal(journal.snapshot().rows, 4);
    assert.equal((await readFile(journal.path, 'utf8')).trim().split('\n').length, 4);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('retained artifact continuation accepts only exact private evidence identities', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'x37-retained-'));
  try {
    const identity = { requestSha256: '1'.repeat(64), sourceSha256: '2'.repeat(64),
      imageId: `sha256:${'3'.repeat(64)}`, toolchainManifestSha256: '4'.repeat(64) };
    const avr = Buffer.from(':00000001FF\n'); const rp = Buffer.from([1, 2, 3]);
    await persistX37CompilerArtifact({ evidenceDirectory: directory, participantId: 'avr',
      artifact: { hex: avr.toString(), hexSha256: sha256(avr) }, buildRecord: identity });
    await persistX37CompilerArtifact({ evidenceDirectory: directory, participantId: 'rp',
      artifact: { uf2: { base64: rp.toString('base64'), sha256: sha256(rp) } }, buildRecord: identity });
    const loaded = await loadX37RetainedArtifacts({ evidenceDirectory: directory,
      expected: { avr: identity, rp: identity }, expectedBytes: { avr: avr.length, rp: rp.length },
      expectedSha256: { avr: sha256(avr), rp: sha256(rp) } });
    assert.equal(loaded.avr.hexSha256, sha256(avr)); assert.equal(loaded.rp.uf2.sha256, sha256(rp));
    await assert.rejects(loadX37RetainedArtifacts({ evidenceDirectory: directory,
      expected: { avr: { ...identity, sourceSha256: '5'.repeat(64) }, rp: identity },
      expectedBytes: { avr: avr.length, rp: rp.length },
      expectedSha256: { avr: sha256(avr), rp: sha256(rp) } }),
    { code: 'X37_RETAINED_ARTIFACT_IDENTITY' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
