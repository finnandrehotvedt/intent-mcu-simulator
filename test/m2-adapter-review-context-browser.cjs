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
  context.on('request', (request) => { if (new URL(request.url()).pathname === '/api/build') buildRequests.push(request.url()); });
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true && Boolean(window.__PROJECT_PATCH__));
    const initial = await page.evaluate(browserContextSnapshot);
    const sessionHandle = await page.evaluateHandle(() => window);
    const guard = createExternalClientPageGuard({ page, sessionHandle, expectedUrl: `${new URL(base).origin}/`,
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
    let operationEpoch = 1;
    const busyGuard = createExternalClientPageGuard({ page, sessionHandle,
      expectedUrl: `${new URL(base).origin}/`, operationEpoch: () => operationEpoch,
      expectedSourceIdentity: initial.sourceIdentity, inFlight: () => active });
    await assert.rejects(() => busyGuard.snapshot({ requireIdle: true }), /CONTEXT_BUSY/u);
    active = 0;
    assert.equal((await busyGuard.snapshot({ requireIdle: true })).context.generation, afterApply.context.generation);

    let releaseHeldRead; let heldReadStarted;
    const heldRead = new Promise((resolve) => { releaseHeldRead = resolve; });
    const heldStarted = new Promise((resolve) => { heldReadStarted = resolve; });
    const heldSessionHandle = { evaluate: async (...args) => {
      heldReadStarted(); await heldRead; return sessionHandle.evaluate(...args);
    } };
    const heldGuard = createExternalClientPageGuard({ page, sessionHandle: heldSessionHandle,
      expectedUrl: `${new URL(base).origin}/`, operationEpoch: () => operationEpoch,
      expectedSourceIdentity: initial.sourceIdentity, inFlight: () => active });
    const overlappingRead = heldGuard.snapshot({ requireIdle: true });
    await heldStarted;
    active = 1; operationEpoch += 1; active = 0;
    releaseHeldRead();
    await assert.rejects(() => overlappingRead, /CONTEXT_BUSY/u);

    active = 1; operationEpoch += 1;
    assert.deepEqual(await busyGuard.evaluate(
      (boundWindow, target) => boundWindow.__AGENT_ACTIONS__.cancel(target), 'm2-not-active-request',
    ), { ok: false, code: 'ACTION_NOT_ACTIVE' });
    active = 0;

    const driftGuard = createExternalClientPageGuard({ page, sessionHandle,
      expectedUrl: `${new URL(base).origin}/`,
      expectedSourceIdentity: { ...initial.sourceIdentity, version: 'drifted-version' } });
    await assert.rejects(() => driftGuard.snapshot(), /SOURCE_IDENTITY_DRIFT/u);

    const reloadPage = await context.newPage();
    await reloadPage.goto(base, { waitUntil: 'networkidle' });
    await reloadPage.waitForFunction(() => window.__M11_READY__ === true);
    const reloadInitial = await reloadPage.evaluate(browserContextSnapshot);
    const reloadHandle = await reloadPage.evaluateHandle(() => window);
    const reloadGuard = createExternalClientPageGuard({ page: reloadPage, sessionHandle: reloadHandle,
      expectedUrl: `${new URL(base).origin}/`, expectedSourceIdentity: reloadInitial.sourceIdentity });
    assert.equal((await reloadGuard.snapshot()).context.generation, reloadInitial.context.generation);
    await reloadPage.reload({ waitUntil: 'networkidle' });
    await reloadPage.waitForFunction(() => window.__M11_READY__ === true);
    await assert.rejects(() => reloadGuard.snapshot(), /PAGE_REPLACED/u);
    await assert.rejects(() => reloadGuard.snapshot(), /PAGE_REPLACED/u);
    await assert.rejects(() => reloadGuard.evaluate((boundWindow) => {
      boundWindow.__M2_OLD_SESSION_OPERATION__ = true; return boundWindow.__AGENT_ACTIONS__.context();
    }), /PAGE_REPLACED/u);
    assert.equal(await reloadPage.evaluate(() => Boolean(window.__M2_OLD_SESSION_OPERATION__)), false);
    assert.equal((await reloadPage.evaluate(browserContextSnapshot)).context.generation,
      reloadInitial.context.generation);

    const backPage = await context.newPage();
    await backPage.goto(base, { waitUntil: 'networkidle' });
    await backPage.waitForFunction(() => window.__M11_READY__ === true);
    const backInitial = await backPage.evaluate(browserContextSnapshot);
    const backHandle = await backPage.evaluateHandle(() => window);
    const backGuard = createExternalClientPageGuard({ page: backPage, sessionHandle: backHandle,
      expectedUrl: `${new URL(base).origin}/`, expectedSourceIdentity: backInitial.sourceIdentity });
    await backPage.goto('about:blank');
    await backPage.goBack({ waitUntil: 'networkidle' });
    await backPage.waitForFunction(() => window.__M11_READY__ === true);
    await assert.rejects(() => backGuard.snapshot(), /PAGE_REPLACED/u);
    await assert.rejects(() => backGuard.evaluate((boundWindow) => {
      boundWindow.__M2_OLD_SESSION_OPERATION__ = true; return boundWindow.__AGENT_ACTIONS__.context();
    }), /PAGE_REPLACED/u);
    assert.equal(await backPage.evaluate(() => Boolean(window.__M2_OLD_SESSION_OPERATION__)), false);
    assert.equal((await backPage.evaluate(browserContextSnapshot)).context.generation,
      backInitial.context.generation);
    await backPage.close();
    await assert.rejects(() => backGuard.snapshot(), /PAGE_CLOSED/u);

    assert.equal(await page.evaluate(() => window.__M2_WORKER_COUNT__), 0);
    assert.equal(await reloadPage.evaluate(() => window.__M2_WORKER_COUNT__), 0);
    assert.equal(buildRequests.length, 0);
    assert.equal(afterApply.actions.length, 7);
    assert.equal(afterApply.actions.includes('patch.apply'), false);
    process.stdout.write(`${JSON.stringify({ status: 'pass', syntheticApply: true,
      generationBefore: beforeReview.context.generation, generationAfter: afterApply.context.generation,
      actions: afterApply.actions.length, buildRequests: 0, runtimeWorkers: 0,
      busyRejected: true, overlapRejected: true, cancelAllowedWhileActive: true, sourceDriftRejected: true,
      sameUrlReloadRetired: true, awayBackRetired: true, replacementDispatches: 0,
      closedPageRejected: true })}\n`);
  } finally { await context.close(); await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
