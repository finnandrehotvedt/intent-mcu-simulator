import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { Rp2040ExperimentalRuntime } from '../src/rp2040-experimental-runtime.mjs';

test('producer is bound to the actual broker result and compiler artifact schemas', async () => {
  const [broker, avrWorker, rpWorker, producer] = await Promise.all([
    readFile(new URL('../compiler/docker-broker.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../compiler/build-worker.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../compiler/rp2040-build-worker.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/x37-source-bound-producer-worker.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(broker, /return \{ \.\.\.result, containerName, imageId: this\.imageLock\.imageId \}/u);
  assert.match(avrWorker, /hexSha256: sha256\(hex\)/u);
  assert.match(rpWorker, /schema: 'intent-mcu-rp2040-compile-artifact@1'/u);
  assert.match(rpWorker, /uf2: \{ bytes: uf2\.byteLength, sha256: sha256\(uf2\), base64:/u);
  assert.match(producer, /result\.status !== 'succeeded' \|\| result\.imageId !== lock\.imageId/u);
  assert.match(producer, /sha256\(avrArtifact\.hex\) !== avrArtifact\.hexSha256/u);
  assert.match(producer, /Buffer\.from\(rpArtifact\.uf2\.base64, 'base64'\)/u);
});

test('RP runtime rejects malformed artifacts before creating a machine', async () => {
  await assert.rejects(Rp2040ExperimentalRuntime.create({ format: 'uf2', bytes: new Uint8Array(),
    expectedSha256: 'bad' }), { code: 'RUNTIME_ARTIFACT_INVALID' });
});
