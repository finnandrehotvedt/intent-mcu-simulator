// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const path = require('path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium, firefox, webkit } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.M3_STAGING_URL || 'http://127.0.0.1:18766';
const browserName = process.env.M6_BROWSER || 'chromium';
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unsupported browser: ${browserName}`);

function assert(condition, message) { if (!condition) throw new Error(message); }
function progress(stage) { console.log(JSON.stringify({ browser: browserName, stage })); }

async function waitBuild(page) {
  await page.click('#build');
  await page.waitForFunction(() => ['succeeded', 'failed', 'cancelled', 'timeout'].includes(window.__M6_STATE__?.buildState), null, { timeout: 30_000 });
  const state = await page.evaluate(() => structuredClone(window.__M6_STATE__));
  if (state.buildState === 'succeeded') await page.waitForFunction(() => window.__M6_STATE__?.runtime?.kind === 'ready', null, { timeout: 10_000 });
  return state;
}

let browser;
(async () => {
  progress('launching');
  browser = await browserType.launch({ headless: true });
  progress('launched');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  progress('context');
  const page = await context.newPage();
  progress('page');
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  progress('ready');

  await page.click('#project-demo');
  await page.fill('#project-name', 'Factory trainer');
  await page.locator('#project-name').press('Tab');
  await page.click('#zoom-in'); await page.click('#pan-right');
  await page.click('#project-save');
  const named = await page.evaluate(() => window.__M6_PROJECT__());
  assert(named.metadata.name === 'Factory trainer' && named.layout.viewport.zoom > 1, 'name or viewport did not enter the canonical project');
  const exported = await Promise.all([page.waitForEvent('download'), page.click('#project-export')]);
  const exportPath = await exported[0].path();
  await page.click('#project-new');
  await page.selectOption('#project-import-mode', 'replace');
  await page.setInputFiles('#project-import', exportPath);
  await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('Project replaced safely'));
  assert(JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__())) === JSON.stringify(named), 'named canonical export/import changed project bytes');
  progress('named-export-import');

  await page.evaluate(() => {
    const current = localStorage.getItem('teach-lab.simulator.project.v2');
    const newer = JSON.parse(current);
    newer.metadata.name = 'Recovered interrupted save';
    newer.layout.viewport.panY = -0.17;
    localStorage.setItem('teach-lab.simulator.project.recovery.v2', JSON.stringify(newer));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  const recovered = await page.evaluate(() => ({
    project: window.__M6_PROJECT__(),
    recovery: localStorage.getItem('teach-lab.simulator.project.recovery.v2'),
  }));
  assert(recovered.project.metadata.name === 'Recovered interrupted save' && recovered.project.layout.viewport.panY === -0.17,
    'interrupted-save journal was not preferred and restored');
  assert(recovered.recovery === null && (await page.textContent('#project-message')).includes('interrupted local save'),
    'recovered journal was not committed cleanly');
  progress('interrupted-recovery');

  await page.evaluate(() => {
    window.__M13_ORIGINAL_SET_ITEM__ = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === 'teach-lab.simulator.project.v2') throw new DOMException('quota', 'QuotaExceededError');
      return window.__M13_ORIGINAL_SET_ITEM__.call(this, key, value);
    };
  });
  await page.fill('#project-name', 'Newest in-memory name');
  await page.locator('#project-name').press('Tab');
  assert(await page.isEnabled('#recovery-export') && (await page.textContent('#project-message')).includes('local save failed'),
    'quota failure did not preserve an exportable in-memory project');
  await page.evaluate(() => { Storage.prototype.setItem = window.__M13_ORIGINAL_SET_ITEM__; delete window.__M13_ORIGINAL_SET_ITEM__; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  assert((await page.evaluate(() => window.__M6_PROJECT__().metadata.name)) === 'Newest in-memory name',
    'reload did not recover the journal left by quota failure');
  progress('quota-recovery');

  const build = await waitBuild(page);
  assert(build.buildState === 'succeeded', 'recovered project did not build');
  await page.click('#run');
  await page.waitForFunction(() => window.__M6_STATE__?.runtime?.cycle > 100_000, null, { timeout: 10_000 });
  await page.click('#pause');
  await page.waitForFunction(() => window.__M6_STATE__?.runtime?.paused === true, null, { timeout: 10_000 });
  progress('compiled-paused');
  await page.locator('[data-component-id="led-1"]').click({ force: true });
  const beforeProposal = await page.evaluate(() => JSON.stringify({
    project: window.__M6_PROJECT__(),
    lifecycle: window.__M11_STATE__.lifecycle,
    runtime: window.__M6_STATE__.runtime,
    selected: window.__M6_STATE__.selectedComponentId,
  }));
  await page.locator('#prompt-drawer > summary').click();
  await page.fill('#prompt-response', '{"schema":"teach-lab-circuit@2","components":[');
  await page.click('#prompt-apply');
  const afterProposal = await page.evaluate(() => JSON.stringify({
    project: window.__M6_PROJECT__(),
    lifecycle: window.__M11_STATE__.lifecycle,
    runtime: window.__M6_STATE__.runtime,
    selected: window.__M6_STATE__.selectedComponentId,
  }));
  assert(afterProposal === beforeProposal, 'rejected Prompt Bridge proposal changed project, lifecycle, runtime or selection');
  progress('prompt-rejection-atomic');

  const legacy = {
    schema: 'teach-lab-project@1', selected: ['controller-1'], positions: { 'controller-1': { x: 0.5, y: 0.5 } },
    netlist: {
      schema: 'teach-lab-netlist@1',
      components: [{ id: 'controller-1', type: 'controller.generic-avr-v1', properties: {} }],
      wires: [], firmwarePins: { led: 'D13', button: 'D2', buttonMode: 'INPUT_PULLUP' },
    },
  };
  await page.selectOption('#project-import-mode', 'migrate-v1');
  await page.setInputFiles('#project-import', { name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
  await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('migrated'));
  const report = await page.evaluate(() => window.__M6_STATE__.importReport);
  assert(JSON.stringify(report.unsupportedFields) === JSON.stringify(['netlist.firmwarePins']), 'legacy migration did not report every dropped field');
  assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);

  console.log(JSON.stringify({ browser: browserName, namedProject: true, interruptedRecovery: true, quotaRecovery: true, promptAtomic: true, migrationReport: report.unsupportedFields }));
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(async () => { await browser?.close(); });
