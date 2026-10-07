// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const path = require('path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium, firefox, webkit } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.M3_STAGING_URL || 'http://127.0.0.1:18766';
const browserName = process.env.M6_BROWSER || 'chromium';
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unsupported browser: ${browserName}`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  await page.click('#project-demo');
  assert((await page.textContent('#canvas-title')) === 'Blink demo circuit', 'loaded-project canvas title is stale');
  assert((await page.textContent('#project-state')).includes('Blink demo · editing'), 'loaded-project state label is stale');
  await page.locator('[data-component-id="board-1"]').evaluate((node) => node.click());
  await page.locator('.wire-segment-hit').first().focus();
  await page.locator('.pin-anchor[data-endpoint="board-1.D2"]').click({ force: true });
  const generationBeforeBuild = await page.evaluate(() => window.__M11_STATE__.lifecycle.projectGeneration);

  let releaseStatus;
  let statusSeenResolve;
  const statusSeen = new Promise((resolve) => { statusSeenResolve = resolve; });
  const statusGate = new Promise((resolve) => { releaseStatus = resolve; });
  const statusPattern = /\/api\/build\/[^/]+$/u;
  await page.route(statusPattern, async (route) => {
    statusSeenResolve();
    await statusGate;
    try { await route.continue(); } catch { /* the project replacement aborts this request */ }
  });
  await page.click('#build');
  await statusSeen;
  assert((await page.evaluate(() => window.__M11_STATE__.lifecycle.phase)) === 'building', 'lifecycle did not enter building');
  await page.click('#project-new');
  releaseStatus();
  await page.unroute(statusPattern);
  await page.waitForTimeout(1_500);
  const afterDelayedBuild = await page.evaluate(() => ({
    lifecycle: structuredClone(window.__M11_STATE__.lifecycle),
    buildState: window.__M11_STATE__.buildState,
    project: window.__M6_PROJECT__(),
    cycle: document.querySelector('#cycle').textContent,
    diagnostics: document.querySelector('#diagnostics').textContent,
    selected: document.querySelector('#selection-name').textContent,
    wireState: document.querySelector('#wire-state').textContent,
    canvasTitle: document.querySelector('#canvas-title').textContent,
    projectState: document.querySelector('#project-state').textContent,
    routeActionsDisabled: [...document.querySelectorAll('#reconnect-mode, #add-bend, #delete-branch, #delete-wire')]
      .every((button) => button.disabled),
  }));
  assert(afterDelayedBuild.lifecycle.projectGeneration === generationBeforeBuild + 1, 'project generation did not advance');
  assert(afterDelayedBuild.lifecycle.phase === 'empty' && afterDelayedBuild.lifecycle.activeBuild === null, 'old build still owns the empty project');
  assert(afterDelayedBuild.project.circuit.components.length === 0, 'late build repopulated the replacement project');
  assert(afterDelayedBuild.buildState === 'empty' && afterDelayedBuild.cycle === '0'
    && !afterDelayedBuild.diagnostics.includes('Build succeeded'), 'late build output appeared current');
  assert(afterDelayedBuild.selected === 'Nothing selected'
    && afterDelayedBuild.wireState.startsWith('Add parts')
    && afterDelayedBuild.canvasTitle === 'Untitled project circuit'
    && afterDelayedBuild.projectState.includes('empty')
    && afterDelayedBuild.projectState.includes('not saved')
    && afterDelayedBuild.routeActionsDisabled,
  `transient project state was not reset: ${JSON.stringify(afterDelayedBuild)}`);

  await page.click('#build');
  const actionableError = await page.evaluate(() => ({
    summary: document.querySelector('#project-message').textContent,
    technical: document.querySelector('#technical-error-detail').textContent,
    hidden: document.querySelector('#technical-error').hidden,
  }));
  assert(!actionableError.hidden && actionableError.technical.includes('BOARD_COUNT'), 'stable graph code was not kept in technical details');
  assert(!actionableError.summary.includes('BOARD_COUNT')
    && !/reducer|schema|worker/iu.test(actionableError.summary),
  `routine graph error exposed internal terminology: ${JSON.stringify(actionableError)}`);

  await page.click('#project-demo');
  await page.click('#build');
  await page.waitForFunction(() => window.__M11_STATE__.buildState === 'succeeded', null, { timeout: 30_000 });
  await page.waitForFunction(() => window.__M11_STATE__.runtime?.kind === 'ready', null, { timeout: 10_000 });
  await page.click('#run');
  await page.waitForFunction(() => window.__M11_STATE__.runtime?.cycle > 20_000, null, { timeout: 10_000 });
  const generationBeforeRunReplacement = await page.evaluate(() => window.__M11_STATE__.lifecycle.projectGeneration);
  await page.click('#project-new');
  await page.waitForTimeout(350);
  const afterRunReplacement = await page.evaluate(() => ({
    lifecycle: structuredClone(window.__M11_STATE__.lifecycle),
    runtime: window.__M11_STATE__.runtime,
    cycle: document.querySelector('#cycle').textContent,
    instructions: document.querySelector('#instructions').textContent,
    artifact: document.querySelector('#artifact').textContent,
    serial: document.querySelector('#serial-output').textContent,
    logic: document.querySelector('#logic-count').textContent,
    pin: document.querySelector('#pin-level').textContent,
    title: document.querySelector('#canvas-title').textContent,
  }));
  assert(afterRunReplacement.lifecycle.projectGeneration === generationBeforeRunReplacement + 1, 'running replacement did not advance generation');
  assert(afterRunReplacement.lifecycle.phase === 'empty' && afterRunReplacement.lifecycle.runtimeBinding === null, 'old runtime binding survived replacement');
  assert(afterRunReplacement.runtime === null && afterRunReplacement.cycle === '0' && afterRunReplacement.instructions === '0'
    && afterRunReplacement.artifact === 'none' && afterRunReplacement.serial === 'No firmware bytes.'
    && afterRunReplacement.logic === '0 transitions' && afterRunReplacement.pin === '—'
    && afterRunReplacement.title === 'Untitled project circuit',
  `runtime presentation was not cleared: ${JSON.stringify(afterRunReplacement)}`);
  assert(errors.length === 0, `page errors: ${errors.join(', ')}`);

  await context.close();
  await browser.close();
  process.stdout.write(`${JSON.stringify({
    status: 'pass', browser: browserName, delayedBuildRejected: true,
    runningProjectCleared: true, actionableError: true,
    projectGeneration: afterRunReplacement.lifecycle.projectGeneration,
  })}\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
