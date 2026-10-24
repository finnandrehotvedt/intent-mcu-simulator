import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);

test('real producer worker parses without importing or executing MCU dependencies', async () => {
  await execFileAsync(process.execPath, ['--check', new URL('../scripts/x37-source-bound-producer-worker.mjs', import.meta.url).pathname],
    { timeout: 5_000 });
});

test('real producer worker uses ordinary builders, runtimes, identity seams and cleanup', async () => {
  const source = await readFile(new URL('../scripts/x37-source-bound-producer-worker.mjs', import.meta.url), 'utf8');
  for (const expected of ['DockerBuildBroker', 'loadImageLock', 'normalizeBuildRequestValue',
    'new RuntimeKernel', 'Rp2040ExperimentalRuntime.create', 'createAvrX37RuntimeSeam',
    'createRp2040X37RuntimeSeam', 'createObservedDigitalNetResolver',
    'runX37TurnaroundOrchestration', 'persistX37CompilerArtifact',
    'constructX37RuntimePair', 'ensureX37WorkerEnvironment', 'verifiedCleanup', 'idleLevel: true',
    'avrSeam.retire()', 'rpSeam.retire()']) {
    assert(source.includes(expected), expected);
  }
  assert.doesNotMatch(source, /synthetic|mock|fixtureArtifact|constantfold/iu);
  assert.doesNotMatch(source, /deliverResolvedLevel\(true,/u);
  assert(source.indexOf('activity.firmwareBuildAttempts += 1') < source.indexOf('broker.compile(request)'));
  assert(source.lastIndexOf("terminal('passed'") > source.indexOf('await main()'));
});

test('candidate image setup is private, one-image and never overwrites public lock', async () => {
  const source = await readFile(new URL('../scripts/setup-x37-rp2040-toolchain.sh', import.meta.url), 'utf8');
  assert.match(source, /local\/intent-mcu-rp2040-toolchain:x37-private-1/u);
  assert.match(source, /compiler\/x37-rp2040-image-lock\.json/u);
  assert.doesNotMatch(source, /compiler\/rp2040-image-lock\.json/u);
  assert.equal((source.match(/docker build /gu) ?? []).length, 1);
});
