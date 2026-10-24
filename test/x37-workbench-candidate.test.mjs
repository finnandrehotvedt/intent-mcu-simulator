import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { X37_LEGACY_WORKBENCH_SCHEMA, X37_PUBLIC_CAPABILITY,
  createX37CandidateBudget, createX37CoordinatedLifecycle,
  defaultX37WorkbenchProject, parseX37WorkbenchProject,
  serializeX37WorkbenchProject } from '../src/x37-workbench-candidate.mjs';
import { createX37ProductAdapter, teardownX37Pair } from '../src/x37-product-adapter.mjs';

test('strict candidate project roundtrips only two participants and one ideal pull-up net', () => {
  const project = defaultX37WorkbenchProject();
  assert.deepEqual(parseX37WorkbenchProject(serializeX37WorkbenchProject(project)), project);
  for (const mutate of [
    (value) => value.participants.push(value.participants[0]),
    (value) => { value.participants[1].profile = 'avr'; },
    (value) => { value.sharedDigitalNets[0].bias = 'none'; },
    (value) => { value.sharedDigitalNets[0].endpoints[1].pin = 'GPIO2'; },
    (value) => { value.runtime = {}; },
    (value) => { value.participants[0].artifactSha256 = 'a'.repeat(64); },
  ]) {
    const invalid = structuredClone(project); mutate(invalid);
    assert.throws(() => parseX37WorkbenchProject(JSON.stringify(invalid)));
  }
});

test('finite legacy shape migrates atomically and malformed legacy changes nothing', () => {
  const project = defaultX37WorkbenchProject();
  const legacy = { schema: X37_LEGACY_WORKBENCH_SCHEMA, name: project.name,
    avrSource: project.participants[0].source, rpSource: project.participants[1].source,
    sharedWire: project.sharedDigitalNets[0] };
  assert.deepEqual(parseX37WorkbenchProject(JSON.stringify(legacy)), project);
  const current = serializeX37WorkbenchProject(project);
  assert.throws(() => parseX37WorkbenchProject(JSON.stringify({ ...legacy, worker: {} })));
  assert.equal(serializeX37WorkbenchProject(project), current);
});

test('capability preflight is truthful and charges no current-tab budget', () => {
  const budget = createX37CandidateBudget();
  assert.deepEqual(budget.preflight(), { ok: false,
    code: 'X37_PUBLIC_RP_TURNAROUND_GRAMMAR_UNAVAILABLE', charged: false });
  assert.deepEqual(budget.snapshot(), { limits: { builds: 2, runs: 1 },
    charged: { builds: 0, runs: 0 }, reserved: null });
  assert.equal(X37_PUBLIC_CAPABILITY.enabled, false);
});

test('compiler and run attempts charge before dispatch and cancellation refunds only unstarted work', () => {
  const budget = createX37CandidateBudget();
  assert.equal(budget.preflight({ enabled: true }).ok, true);
  budget.chargeBuild(); budget.cancel();
  assert.deepEqual(budget.snapshot(), { limits: { builds: 2, runs: 1 },
    charged: { builds: 1, runs: 0 }, reserved: null });
  assert.equal(budget.preflight({ enabled: true }).code, 'X37_BUDGET_EXHAUSTED');
  const complete = createX37CandidateBudget(); complete.preflight({ enabled: true });
  complete.chargeBuild(); complete.chargeBuild(); complete.chargeRun();
  assert.deepEqual(complete.snapshot().charged, { builds: 2, runs: 1 });
});

test('coordinated lifecycle joins both builds and invalidates atomically', () => {
  const owner = createX37CoordinatedLifecycle(4);
  owner.acceptBuild('avr', { projectGeneration: 4, artifactIdentity: 'avr-artifact' });
  assert.equal(owner.snapshot().phase, 'build-partial');
  owner.acceptBuild('rp', { projectGeneration: 4, artifactIdentity: 'rp-artifact' });
  assert.equal(owner.snapshot().phase, 'build-ready');
  owner.start({ avr: 'worker-a', rp: 'worker-r' }); owner.appendTrace([{ mappedTick: 1 }]);
  assert.equal(owner.pause().phase, 'paused');
  const reset = owner.reset();
  assert.equal(reset.phase, 'reset'); assert.deepEqual(reset.builds, {});
  assert.deepEqual(reset.workers, {}); assert.deepEqual(reset.trace, []);
  assert.throws(() => owner.acceptBuild('avr', { projectGeneration: 3, artifactIdentity: 'stale' }),
    { code: 'X37_BUILD_STALE_OR_INVALID' });
  assert.equal(owner.opened().projectGeneration, 5);
});

test('participant failure stop source edit topology edit and Open all retire both generations', () => {
  for (const action of ['participantFailed', 'stop', 'projectChanged', 'opened']) {
    const owner = createX37CoordinatedLifecycle(1);
    owner.acceptBuild('avr', { projectGeneration: 1, artifactIdentity: 'a' });
    owner.acceptBuild('rp', { projectGeneration: 1, artifactIdentity: 'r' });
    owner.start({ avr: 'a', rp: 'r' });
    const before = owner.snapshot().runtimeGeneration; const after = owner[action]();
    assert(after.runtimeGeneration > before); assert.deepEqual(after.workers, {});
  }
});

test('product adapter rejects stale ordinary builds before touching a runtime', () => {
  const build = (participantId, profile) => ({ participantId, profile, projectGeneration: 2,
    runtimeGeneration: 3, artifactIdentity: 'a'.repeat(64), modelLibrarySha256: 'b'.repeat(64),
    toolchainSha256: 'c'.repeat(64) });
  const builds = { avr: build('avr', 'avr'), rp: build('rp', 'rp2040') };
  assert.throws(() => createX37ProductAdapter({ schedulerContract: {}, builds,
    lifecycleOwner: () => ({ projectGeneration: 2, runtimeGeneration: 3, builds }),
    validateBuild: () => false, runtimePair: { avr: {}, rp: {} } }),
  { code: 'X37_PRODUCT_ADAPTER_STALE_BUILD' });
});

test('pair teardown always attempts both ordinary workers and aggregates failures', () => {
  const calls = [];
  const result = teardownX37Pair({ avr: { dispose() { calls.push('avr'); throw Object.assign(new Error('AVR_FAIL'), { code: 'AVR_FAIL' }); } },
    rp: { dispose() { calls.push('rp'); return { disposed: true }; } } }, 'dispose');
  assert.deepEqual(calls, ['avr', 'rp']);
  assert.deepEqual(result.errors, [{ participantId: 'avr', code: 'AVR_FAIL' }]);
  assert.deepEqual(result.results, [{ disposed: true }]);
});

test('public candidate bundle entry imports no private producer or retained evidence loader', async () => {
  const [controller, dataModule] = await Promise.all([
    readFile(new URL('../staging/x37-workbench-candidate-controller.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/x37-workbench-candidate.mjs', import.meta.url), 'utf8'),
  ]);
  const joined = `${controller}\n${dataModule}`;
  assert.doesNotMatch(joined, /source-bound-producer|retainedEvidence|private-artifacts|receipt|image-lock|token/u);
  assert.doesNotMatch(controller, /x37-product-adapter|x37-existing-runtime-seams/u);
});
