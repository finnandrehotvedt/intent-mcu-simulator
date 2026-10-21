// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.M2_ADAPTER_TEST_URL || 'http://127.0.0.1:18766';

(async () => {
  const { browserContextSnapshot, createExternalClientPageGuard } = await import('../tools/external-client-adapter.mjs');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__M2_WORKER_COUNT__ = 0;
    window.Worker = new Proxy(NativeWorker, { construct(target, args) {
      window.__M2_WORKER_COUNT__ += 1; return Reflect.construct(target, args);
    } });
  });
  const page = await context.newPage();
  const buildRequests = [];
  page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/build') buildRequests.push(request.url()); });
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true && Boolean(window.__PROJECT_PATCH__));
    const initial = await page.evaluate(browserContextSnapshot);
    const guard = createExternalClientPageGuard({ page, expectedUrl: `${new URL(base).origin}/`,
      expectedSourceIdentity: initial.sourceIdentity });
    assert.deepEqual(await guard.snapshot({ requireIdle: true }), initial);

    const prepared = await page.evaluate(async () => {
      const request = window.__AGENT_ACTIONS__.request('project.create', {
        starterId: 'avr-thermostat-boundary-v1', firmwareVariant: 'known-bad-equality',
      }, { requestId: 'm2-synthetic-create-request', ttlMs: 30_000 });
      const created = await window.__AGENT_ACTIONS__.execute(request);
      if (!created.ok) throw new Error(created.code);
      const profile = window.__AGENT_ACTIONS__.context().profile;
      const current = window.__COMMON_PROJECT_FILES__.current(profile);
      const proposed = JSON.parse(current);
      const main = proposed.project.project.source.files.find((file) => file.name === 'main.ino');
      main.content = `${main.content.trimEnd()}\n// M2 synthetic review-context proof\n`;
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(current));
      const baseProjectSha256 = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0')).join('');
      const description = 'Add one inert source comment for the synthetic review-context proof.';
      return { beforeGeneration: window.__AGENT_ACTIONS__.context().generation,
        patch: JSON.stringify({ schema: 'intent-mcu-project-patch@1', profile,
          baseProjectSha256, description, proposedProject: proposed }) };
    });
    const beforeReview = await page.evaluate(browserContextSnapshot);
    assert.equal(beforeReview.context.generation, prepared.beforeGeneration);
    assert.equal(beforeReview.review.proposalPending, false);

    const applied = await page.evaluate(async (patch) => {
      const reviewed = await window.__PROJECT_PATCH__.review(patch);
      if (!reviewed.ok || reviewed.applyBlocked) throw new Error(reviewed.code);
      const reviewState = window.__PROJECT_PATCH__.state();
      const result = await window.__PROJECT_PATCH__.apply();
      return { reviewState, result };
    }, prepared.patch);
    assert.equal(applied.reviewState.testExpectationChanges.length, 0);
    assert.equal(applied.result.code, 'PROJECT_PATCH_APPLIED');
    const afterApply = await guard.snapshot({ requireIdle: true });
    assert(afterApply.context.generation > beforeReview.context.generation);
    assert.equal(afterApply.review.proposalPending, false);
    assert.equal(afterApply.review.applyEnabled, false);
    assert.match(afterApply.review.status, /fresh Build/u);

    let active = 1;
    const busyGuard = createExternalClientPageGuard({ page, expectedUrl: `${new URL(base).origin}/`,
      expectedSourceIdentity: initial.sourceIdentity, inFlight: () => active });
    await assert.rejects(() => busyGuard.snapshot({ requireIdle: true }), /CONTEXT_BUSY/u);
    active = 0;
    assert.equal((await busyGuard.snapshot({ requireIdle: true })).context.generation, afterApply.context.generation);
    const driftGuard = createExternalClientPageGuard({ page, expectedUrl: `${new URL(base).origin}/`,
      expectedSourceIdentity: { ...initial.sourceIdentity, version: 'drifted-version' } });
    await assert.rejects(() => driftGuard.snapshot(), /SOURCE_IDENTITY_DRIFT/u);

    const replacement = await context.newPage();
    await replacement.goto(base, { waitUntil: 'networkidle' });
    await replacement.waitForFunction(() => window.__M11_READY__ === true);
    const replacementInitial = await replacement.evaluate(browserContextSnapshot);
    const replacementGuard = createExternalClientPageGuard({ page: replacement,
      expectedUrl: `${new URL(base).origin}/`, expectedSourceIdentity: replacementInitial.sourceIdentity });
    await replacement.goto('about:blank');
    await assert.rejects(() => replacementGuard.snapshot(), /PAGE_REPLACED/u);
    await replacement.close();
    await assert.rejects(() => replacementGuard.snapshot(), /PAGE_CLOSED/u);

    assert.equal(await page.evaluate(() => window.__M2_WORKER_COUNT__), 0);
    assert.equal(buildRequests.length, 0);
    assert.equal(afterApply.actions.length, 7);
    assert.equal(afterApply.actions.includes('patch.apply'), false);
    process.stdout.write(`${JSON.stringify({ status: 'pass', syntheticApply: true,
      generationBefore: beforeReview.context.generation, generationAfter: afterApply.context.generation,
      actions: afterApply.actions.length, buildRequests: 0, runtimeWorkers: 0,
      busyRejected: true, sourceDriftRejected: true,
      replacementRejected: true, closedPageRejected: true })}\n`);
  } finally { await context.close(); await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
