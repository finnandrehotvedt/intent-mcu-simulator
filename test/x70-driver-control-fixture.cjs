// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const {
  ACTIVE_EXPORT_REJECTION_STATUS, EXPECTED_PICO_NATIVE_IDENTITY, armExactText, boundedBrowserCleanup,
  clickAndWaitExact, emergencyPauseStop, installPicoDriverInstrumentation,
  observeDownloads, observeSustainedPico, pausePicoWithObservation,
} = require('./x70-native-driver-safeguards.cjs');

const base = process.env.X70_CURRENT_URL || 'http://127.0.0.1:18881';
const evidenceDir = process.env.X70_CURRENT_EVIDENCE || '/evidence';
const sha256 = (source) => crypto.createHash('sha256').update(source).digest('hex');

(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  await installPicoDriverInstrumentation(context);
  const rejectionPage = await context.newPage();
  const rejectionDownloads = observeDownloads(rejectionPage);
  let page = null;
  let projectPage = null;
  let stalledContext = null;
  let stalledPage = null;
  let stalledEmergency = null;
  try {
    await rejectionPage.setContent(`<!doctype html><button id="accessible-svg-export">Export</button>
      <button id="pico-pause">Pause</button><button id="pico-stop">Stop</button>
      <p id="accessible-svg-status">Ready</p><p id="pico-state">running</p>
      <script>
        document.querySelector('#accessible-svg-export').addEventListener('click', () => {
          if (document.querySelector('#pico-state').textContent === 'paused') {
            const link = document.createElement('a');
            link.download = 'fixture-after-pause.txt';
            link.href = URL.createObjectURL(new Blob(['stable'], { type: 'text/plain' }));
            link.click();
            return;
          }
          document.querySelector('#accessible-svg-status').textContent = ${JSON.stringify(ACTIVE_EXPORT_REJECTION_STATUS)};
        });
        document.querySelector('#pico-pause').addEventListener('click', () => {
          document.querySelector('#pico-state').textContent = 'paused';
          const prior = window.__RP2040_PUBLIC_STATE__;
          window.__RP2040_PUBLIC_STATE__ = { ...prior, phase: 'paused', runtime: {
            ...prior.runtime, paused: true, presentation: { ...prior.runtime.presentation,
              generation: prior.runtime.presentation.generation + 1, sequence: 1, final: true },
          } };
        });
        document.querySelector('#pico-stop').addEventListener('click', () => {
          document.querySelector('#pico-state').textContent = 'editing';
        });
      </script>`);
    await rejectionPage.evaluate((expected) => {
      const artifactIdentity = 'a'.repeat(64);
      window.__RP2040_PUBLIC_STATE__ = {
        profile: expected.profile, phase: 'running',
        artifact: { artifactIdentity }, modelLibrary: expected.modelLibrary,
        runtime: { artifactIdentity, runtimeEngine: expected.runtimeEngine,
          cycle: 1000, instructions: 10, paused: false,
          presentation: { schema: 'intent-mcu-rp2040-presentation@1', artifactIdentity,
            generation: 3, sequence: 2, final: false } },
      };
    }, EXPECTED_PICO_NATIVE_IDENTITY);
    const button = rejectionPage.locator('#accessible-svg-export');
    assert.equal(await button.isVisible(), true);
    assert.equal(await button.isDisabled(), false);
    const rejected = await clickAndWaitExact({ page: rejectionPage,
      selector: '#accessible-svg-status', expected: ACTIVE_EXPORT_REJECTION_STATUS,
      click: () => button.click({ noWaitAfter: true }) });
    assert.equal(rejected.matchedInitially, false);
    await rejectionPage.waitForTimeout(100);
    assert.equal(rejectionDownloads.count(), 0);
    const paused = await pausePicoWithObservation(rejectionPage,
      () => rejectionPage.click('#pico-pause'), { timeoutMs: 1_000, stabilityMs: 20,
        priorObservation: { artifactIdentity: 'a'.repeat(64),
          presentation: { generation: 3 } } });
    assert.equal(paused.matchedInitially, false);
    assert.equal(paused.state.presentation.generation, 4);
    assert.equal(paused.stable.cycle, 1000);
    const [afterPauseDownload] = await Promise.all([
      rejectionPage.waitForEvent('download', { timeout: 2_000 }),
      button.click({ noWaitAfter: true }),
    ]);
    assert.equal(afterPauseDownload.suggestedFilename(), 'fixture-after-pause.txt');
    assert.equal(rejectionDownloads.count(), 1);
    const alreadyCorrect = await armExactText(rejectionPage, '#pico-state', 'paused');
    const sameText = await alreadyCorrect.wait();
    await alreadyCorrect.dispose();
    assert.deepEqual(sameText, { matchedInitially: true, mutations: 0 });
    const sustained = await observeSustainedPico(rejectionPage, {
      durationMs: 60, heartbeatIntervalMs: 10, requireRuntime: false,
    });
    assert.equal(sustained.presentationMessages, 0);
    assert.equal(rejectionDownloads.count(), 1);
    await rejectionPage.evaluate(() => { document.querySelector('#pico-state').textContent = 'running'; });
    const successfulEmergency = await emergencyPauseStop(rejectionPage, { actionTimeoutMs: 250 });
    assert.equal(successfulEmergency.status, 'paused');
    await rejectionPage.close();

    stalledContext = await browser.newContext();
    stalledPage = await stalledContext.newPage();
    await stalledPage.setContent(`<!doctype html><button id="pico-pause">Pause</button>
      <button id="pico-stop">Stop</button><p id="pico-state">running</p>`);
    await stalledPage.evaluate(() => { setTimeout(() => { while (true) { /* deliberate renderer stall */ } }, 0); });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const stalledStarted = Date.now();
    stalledEmergency = await emergencyPauseStop(stalledPage, { actionTimeoutMs: 100 });
    assert.equal(stalledEmergency.status, 'failed-bounded');
    assert(Date.now() - stalledStarted < 1_500, 'stalled emergency exceeded hard wall bound');
    const stalledCleanup = await boundedBrowserCleanup({ pages: [stalledPage],
      contexts: [stalledContext], timeoutMs: 500 });
    assert.equal(stalledCleanup.bounded, true);
    stalledPage = null;
    stalledContext = null;

    page = await context.newPage();
    const pageDownloads = observeDownloads(page);
    assert.equal((await page.goto(base, { waitUntil: 'networkidle' }))?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true && window.__X70_ACCESSIBLE_DEMONSTRATION__);
    await page.click('#project-files-open');
    await page.waitForSelector('#workbench-project-dialog[open]');
    await page.click('#project-demo');
    await page.click('.starter-card[data-example="blink"]');
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
      await page.click('#unsaved-discard');
    }
    await page.waitForFunction(() => document.querySelector('#example-select')?.value === 'blink');
    const svgButton = page.locator('#accessible-svg-export');
    assert.equal(await svgButton.isVisible(), true);
    assert.equal(await svgButton.isDisabled(), false);
    const [svgDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      svgButton.click({ noWaitAfter: true }),
    ]);
    assert.equal(pageDownloads.count(), 1);
    const svgPath = path.join(evidenceDir, 'zero-producer-no-current.accessible-demonstration.svg');
    await svgDownload.saveAs(svgPath);
    const svg = fs.readFileSync(svgPath, 'utf8');
    assert.match(svg, /data-schema="intent-mcu-accessible-demonstration@2"/u);
    assert.match(svg, /data-id="no-current-measurements"/u);

    const projectContext = await browser.newContext({ acceptDownloads: true,
      viewport: { width: 1440, height: 900 } });
    projectPage = await projectContext.newPage();
    const projectDownloads = observeDownloads(projectPage);
    assert.equal((await projectPage.goto(base, { waitUntil: 'networkidle' }))?.status(), 200);
    await projectPage.waitForFunction(() => window.__M11_READY__ === true);
    await projectPage.selectOption('#board-select', 'board.atmega328p-16mhz-v1');
    await projectPage.waitForFunction(() => document.querySelector('#project-bar')?.hidden === false);
    await projectPage.click('#project-files-open');
    await projectPage.waitForSelector('#workbench-project-dialog[open]');
    await projectPage.click('#project-demo');
    await projectPage.click('.starter-card[data-example="blink"]');
    if (await projectPage.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
      await projectPage.click('#unsaved-discard');
    }
    await projectPage.waitForFunction(() => document.querySelector('#example-select')?.value === 'blink');
    await projectPage.click('#project-files-open');
    await projectPage.waitForSelector('#workbench-project-dialog[open]');
    const projectButton = projectPage.locator('#project-save');
    assert.equal(await projectButton.isVisible(), true);
    assert.equal(await projectButton.isDisabled(), false);
    const [projectDownload] = await Promise.all([
      projectPage.waitForEvent('download', { timeout: 20_000 }),
      projectButton.click({ noWaitAfter: true }),
    ]);
    assert.equal(projectDownloads.count(), 1);
    const projectPath = path.join(evidenceDir, 'zero-producer-project.intent-mcu.json');
    await projectDownload.saveAs(projectPath);
    const project = fs.readFileSync(projectPath, 'utf8');
    const parsed = JSON.parse(project);
    assert.equal(typeof parsed.schema, 'string');
    assert.equal(project.includes('current-runtime-measurements'), false);
    await projectContext.close();

    process.stdout.write(`${JSON.stringify({ result: 'pass', action: 'locator.click',
      noWaitAfter: true, visible: true, enabled: true,
      rejection: { status: 'rejected-while-running-before-pause', downloads: 0,
        continuousLedgerAfterPause: rejectionDownloads.count() },
      safeguards: { prearmedMutation: true, alreadyCorrectNoMutation: true,
        sustainedHeartbeat: sustained, emergencyBounded: true, stalledEmergency },
      positiveBlobDownload: { suggestedFilename: svgDownload.suggestedFilename(),
        saved: true, bytes: Buffer.byteLength(svg), sha256: sha256(svg), readback: true },
      projectSaveBlobDownload: { suggestedFilename: projectDownload.suggestedFilename(),
        saved: true, bytes: Buffer.byteLength(project), sha256: sha256(project), readback: true },
      producerActivity: { builds: 0, runs: 0, scenarios: 0 } })}\n`);
  } finally {
    await emergencyPauseStop(projectPage);
    await emergencyPauseStop(page);
    await boundedBrowserCleanup({ pages: [stalledPage, projectPage, page, rejectionPage],
      contexts: [stalledContext, context], browser });
  }
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
