import assert from 'node:assert/strict';
import test from 'node:test';

import { staticPreflight, X37_PRODUCER_BUDGET } from '../scripts/x37-source-bound-producer-harness.mjs';

test('zero-charge producer preflight accepts bounded RP input source and requires a new compiler image identity', async () => {
  const result = await staticPreflight();
  assert.equal(result.result, 'extension-static-ready-image-rebuild-required');
  assert.equal(result.chargeAuthorized, false);
  assert.deepEqual(result.activity, { firmwareBuilds: 0, runtimeInstances: 0,
    nativeWorkers: 0, coordinatedRuns: 0, retries: 0 });
  assert(Object.values(result.checks).every(Boolean));
  assert.deepEqual(result.blockers.map(({ code }) => code), ['X37_RP2040_COMPILER_IMAGE_REBUILD_REQUIRED']);
  assert.match(result.blockers[0].detail, /differ from the currently trusted manifest/u);
  assert.deepEqual(result.requiredBuildBudget, { compilerImageBuilds: 1, firmwareBuilds: 2,
    coordinatedRuns: 1, retries: 0 });
  assert.deepEqual(result.budget, X37_PRODUCER_BUDGET);
  assert.equal(result.expectedObservations.length, 4);
});
