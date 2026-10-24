import assert from 'node:assert/strict';
import test from 'node:test';

import { runKillableWorker } from '../scripts/x37-source-bound-producer-harness.mjs';

const worker = new URL('./fixtures/x37-producer/watchdog-worker.mjs', import.meta.url);

test('watchdog awaits clean exit after one valid terminal result', async () => {
  const result = await runKillableWorker(worker, { mode: 'success' }, 2_000);
  assert.deepEqual(result, { schema: 'x37-producer-worker-result@1', status: 'passed', evidence: [] });
});

test('watchdog kills malformed result and rejects', async () => {
  await assert.rejects(runKillableWorker(worker, { mode: 'malformed' }, 2_000), { code: 'X37_WORKER_RESULT_INVALID' });
});

test('watchdog rejects clean exit without terminal result', async () => {
  await assert.rejects(runKillableWorker(worker, { mode: 'missing' }, 2_000), { code: 'X37_WORKER_RESULT_MISSING' });
});

test('watchdog terminates synchronous infinite worker loop', async () => {
  await assert.rejects(runKillableWorker(worker, { mode: 'sync-loop' }, 100), { code: 'X37_WALL_TIMEOUT' });
});
