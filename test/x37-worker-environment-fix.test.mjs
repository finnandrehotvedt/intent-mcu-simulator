import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { runKillableWorker } from '../scripts/x37-source-bound-producer-harness.mjs';
import { persistX37CompilerArtifact } from '../src/x37-producer-artifact-evidence.mjs';
import { constructX37RuntimePair } from '../src/x37-producer-runtime-lifecycle.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const execFileAsync = promisify(execFile);
const environmentWorker = new URL('./fixtures/x37-producer/environment-worker.mjs', import.meta.url);

test('actual non-MCU worker thread installs Web Crypto and has clean execArgv and pinned module', async () => {
  const result = await runKillableWorker(environmentWorker, {}, 2_000);
  assert.equal(result.status, 'passed');
  assert.equal(result.evidence.webCryptoSubtle, true);
  assert.equal(result.evidence.typedArray, true);
  assert.equal(result.evidence.rp2040jsModule, true);
  assert.deepEqual(result.evidence.execArgv.filter((value) => value.startsWith('--input-type')), []);
});

test('watchdog explicitly strips inherited input-type before file-backed worker launch', async () => {
  const harness = new URL('../scripts/x37-source-bound-producer-harness.mjs', import.meta.url).href;
  const fixture = environmentWorker.href;
  const script = `import {runKillableWorker} from ${JSON.stringify(harness)};`
    + `const r=await runKillableWorker(new URL(${JSON.stringify(fixture)}),{},2000);`
    + 'process.stdout.write(JSON.stringify(r.evidence));';
  const { stdout } = await execFileAsync(process.execPath,
    ['--input-type=module', '--eval', script], { timeout: 5_000 });
  const evidence = JSON.parse(stdout);
  assert.equal(evidence.webCryptoSubtle, true);
  assert.deepEqual(evidence.execArgv, []);
});

test('successful fake compiler artifacts persist mode-0600 before RP construction failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'x37-artifacts-'));
  try {
    const avrBytes = Buffer.from(':00000001FF\n'); const rpBytes = Buffer.from([1, 2, 3, 4]);
    const common = { requestSha256: '1'.repeat(64), sourceSha256: '2'.repeat(64),
      imageId: `sha256:${'3'.repeat(64)}`, toolchainManifestSha256: '4'.repeat(64) };
    await persistX37CompilerArtifact({ evidenceDirectory: directory, participantId: 'avr',
      artifact: { hex: avrBytes.toString(), hexSha256: sha256(avrBytes) }, buildRecord: common });
    await persistX37CompilerArtifact({ evidenceDirectory: directory, participantId: 'rp',
      artifact: { uf2: { base64: rpBytes.toString('base64'), sha256: sha256(rpBytes) } }, buildRecord: common });
    const activity = { runtimeInstances: 0 }; let paused = false;
    await assert.rejects(constructX37RuntimePair({ activity, createAvr: () => ({ id: 'avr' }),
      createRp: () => { throw Object.assign(new Error('RP_FAIL'), { code: 'RP_FAIL' }); },
      cleanupAvr: () => { paused = true; }, cleanupRp: () => {} }), (error) => {
      assert.equal(error.code, 'RP_FAIL');
      assert.deepEqual(error.runtimeConstruction, { avrConstructed: true, rpConstructed: false,
        cleanup: [{ participantId: 'avr', cleaned: true }] }); return true;
    });
    assert.equal(activity.runtimeInstances, 1); assert.equal(paused, true);
    for (const name of ['avr.firmware.bin', 'avr.firmware.json', 'rp.firmware.bin', 'rp.firmware.json']) {
      assert.equal((await stat(join(directory, name))).mode & 0o777, 0o600);
      assert((await readFile(join(directory, name))).length > 0);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
