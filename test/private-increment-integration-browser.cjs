// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.PRIVATE_INCREMENT_URL || 'http://127.0.0.1:18785';
const outputDirectory = process.env.PRIVATE_INCREMENT_OUTPUT || '/tmp/private-increment-integration';
const screenshotPath = process.env.PRIVATE_INCREMENT_SCREENSHOT || null;

async function buildReady(page) {
  await page.click('#build');
  await page.waitForFunction(() => ['succeeded', 'failed', 'cancelled', 'timeout'].includes(window.__M6_STATE__.buildState), null, { timeout: 45_000 });
  assert.equal(await page.evaluate(() => window.__M6_STATE__.buildState), 'succeeded');
  await page.waitForFunction(() => window.__M6_STATE__.runtime?.kind === 'ready', null, { timeout: 10_000 });
}

async function runToEvidence(page) {
  await page.click('#run');
  await page.waitForFunction(() => window.__INSTRUMENT_EVIDENCE__?.state === 'recorded-runtime'
    && window.__M6_STATE__.runtime?.instruments?.serial?.records?.length >= 4, null, { timeout: 20_000 });
}

async function downloadAuthoredProject(page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
  const target = path.join(outputDirectory, 'button-authored.intent-mcu.json');
  await download.saveAs(target);
  return { target, envelope: JSON.parse(fs.readFileSync(target, 'utf8')) };
}

(async () => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1536, height: 1100 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = []; const outside = []; let buildPosts = 0;
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== new URL(base).origin) outside.push(request.url());
      if (request.method() === 'POST' && url.pathname === '/api/build') buildPosts += 1;
    });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true);

    await page.click('#project-new');
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
    await page.selectOption('#example-select', 'button');
    await page.click('#project-demo');
    await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.some((item) => item.id === 'button-1'));
    await page.click('[data-control="button-1.pressed"]');
    await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.find((item) => item.id === 'button-1')?.controls?.pressed === true);
    const authored = await downloadAuthoredProject(page);
    assert.equal(authored.envelope.project.circuit.components.find((item) => item.id === 'button-1').controls.pressed, true);

    await buildReady(page);
    const firstArtifact = await page.evaluate(() => window.__M6_STATE__.artifactIdentity);
    assert.match(firstArtifact, /^[0-9a-f]{64}$/u);
    await page.click('#serial-tab');
    await page.fill('#serial-input', 'Z');
    await page.click('#serial-send');
    await runToEvidence(page);
    await page.click('#canvas-interact-mode');
    const control = page.locator('.component-control-hit');
    await control.scrollIntoViewIfNeeded();
    const controlBox = await control.boundingBox();
    await page.mouse.move(controlBox.x + controlBox.width / 2, controlBox.y + controlBox.height / 2);
    await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
    await page.waitForFunction(() => window.__M6_STATE__.runtime?.eventLog?.log?.some((event) => event.type === 'control')
      && window.__M6_STATE__.runtime?.eventLog?.log?.some((event) => event.type === 'uart-rx'));

    const beforeLayout = await page.evaluate(() => ({
      artifact: window.__M6_STATE__.artifactIdentity,
      cycle: window.__M6_STATE__.runtime.cycle,
      evidence: structuredClone(window.__INSTRUMENT_EVIDENCE__),
      position: structuredClone(window.__M6_PROJECT__().layout.positions['board-1']),
    }));
    await page.locator('#component-layer [data-component-id="board-1"]').dispatchEvent('click');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction((x) => window.__M6_PROJECT__().layout.positions['board-1'].x !== x, beforeLayout.position.x);
    const afterLayout = await page.evaluate(() => ({
      artifact: window.__M6_STATE__.artifactIdentity,
      runtime: window.__M6_STATE__.runtime !== null,
      evidence: window.__INSTRUMENT_EVIDENCE__.state,
      build: window.__M6_PROJECT__().build,
    }));
    assert.equal(afterLayout.artifact, firstArtifact, 'layout edit retired artifact');
    assert.equal(afterLayout.runtime, true, 'layout edit stopped runtime');
    assert.equal(afterLayout.evidence, 'recorded-runtime', 'layout edit cleared provenance');
    assert.equal(afterLayout.build.artifactIdentity, firstArtifact, 'layout edit dirtied executable identity');
    await page.click('#project-new');
    assert.equal(await page.locator('#unsaved-change-dialog').evaluate((node) => node.open), true, 'layout edit was not authored-unsaved');
    await page.click('#unsaved-keep');

    await page.click('#undo');
    await page.click('#redo');
    assert.equal(await page.evaluate(() => window.__M6_STATE__.artifactIdentity), firstArtifact, 'layout Undo/Redo retired artifact');
    assert.equal(await page.evaluate(() => window.__INSTRUMENT_EVIDENCE__.state), 'recorded-runtime');

    await page.click('#canvas-select-mode');
    await page.locator('#component-layer [data-component-id="button-1"]').dispatchEvent('click');
    await page.waitForFunction(() => window.__M6_STATE__.selection?.kind === 'component'
      && window.__M6_STATE__.selection?.componentId === 'button-1', null, { timeout: 5_000 });
    await page.click('#delete-component');
    await page.waitForFunction(() => window.__M6_STATE__.runtime === null
      && window.__M6_STATE__.artifactIdentity === null
      && window.__INSTRUMENT_EVIDENCE__.state === 'no-recorded-runtime', null, { timeout: 5_000 }).catch(async (error) => {
        const state = await page.evaluate(() => ({
          selection: window.__M6_STATE__.selection,
          runtime: window.__M6_STATE__.runtime,
          artifact: window.__M6_STATE__.artifactIdentity,
          evidence: window.__INSTRUMENT_EVIDENCE__,
          projectBuild: window.__M6_PROJECT__().build,
          components: window.__M6_PROJECT__().circuit.components.map((item) => item.id),
          deleteDisabled: document.querySelector('#delete-component').disabled,
        }));
        throw new Error(`${error.message}; post-electrical=${JSON.stringify(state)}`);
      });
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.__M6_STATE__.runtime), null, 'queued render revived runtime after electrical edit');
    await page.click('#undo');
    assert.equal(await page.evaluate(() => window.__M6_STATE__.artifactIdentity), null, 'electrical Undo revived stale artifact');
    await page.click('#redo');
    await page.click('#undo');
    assert.equal(await page.evaluate(() => window.__INSTRUMENT_EVIDENCE__.state), 'no-recorded-runtime', 'mixed electrical history revived provenance');

    await buildReady(page);
    await runToEvidence(page);
    await page.click('#pause');
    await page.waitForFunction(() => window.__M6_STATE__.runtime?.paused === true);
    const beforeClear = await page.evaluate(() => ({
      artifact: window.__M6_STATE__.artifactIdentity,
      cycle: window.__M6_STATE__.runtime.cycle,
      records: window.__M6_STATE__.runtime.instruments.serial.records.length,
    }));
    assert(beforeClear.records > 0);
    const clearStarted = Date.now();
    await page.click('#serial-clear');
    await page.waitForFunction(() => window.__M6_STATE__.runtime?.instruments?.serial?.records?.length === 0);
    const clearLatencyMilliseconds = Date.now() - clearStarted;
    await page.waitForTimeout(350);
    const afterClear = await page.evaluate(() => ({
      artifact: window.__M6_STATE__.artifactIdentity,
      cycle: window.__M6_STATE__.runtime.cycle,
      records: window.__M6_STATE__.runtime.instruments.serial.records.length,
      evidence: window.__INSTRUMENT_EVIDENCE__.state,
    }));
    assert.equal(afterClear.artifact, beforeClear.artifact);
    assert(afterClear.cycle >= beforeClear.cycle);
    assert.equal(afterClear.records, 0, 'old serial history reappeared after Clear');
    assert.equal(afterClear.evidence, 'recorded-runtime');

    await page.click('#run');
    await page.waitForFunction(() => window.__M6_STATE__.runtime?.instruments?.serial?.records?.length >= 2);
    await page.locator('#runtime-drawer').scrollIntoViewIfNeeded();
    if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
    const screenshotState = await page.evaluate(() => ({
      artifact: window.__M6_STATE__.artifactIdentity,
      cycle: window.__M6_STATE__.runtime.cycle,
      evidence: structuredClone(window.__INSTRUMENT_EVIDENCE__),
    }));

    await page.setInputFiles('#project-open-input', authored.target);
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
    await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.find((item) => item.id === 'button-1')?.controls?.pressed === true
      && window.__M6_STATE__.runtime === null
      && window.__INSTRUMENT_EVIDENCE__.state === 'no-recorded-runtime');
    await page.waitForTimeout(350);
    const opened = await page.evaluate(() => ({
      control: window.__M6_PROJECT__().circuit.components.find((item) => item.id === 'button-1').controls.pressed,
      runtime: window.__M6_STATE__.runtime,
      evidence: window.__INSTRUMENT_EVIDENCE__.state,
      serial: document.querySelector('#serial-output').textContent,
      logic: document.querySelector('#logic-count').textContent,
      pinCycle: document.querySelector('#pin-cycle').textContent,
      runDisabled: document.querySelector('#run').disabled,
      undoDisabled: document.querySelector('#undo').disabled,
    }));
    assert.deepEqual(opened, {
      control: true, runtime: null, evidence: 'no-recorded-runtime', serial: 'No firmware bytes.',
      logic: '0 transitions', pinCycle: '0', runDisabled: true, undoDisabled: true,
    });

    await buildReady(page);
    await runToEvidence(page);
    const sourceBefore = await page.inputValue('#source');
    await page.fill('#source', `${sourceBefore}\n`);
    await page.waitForFunction(() => window.__M6_STATE__.runtime === null
      && window.__M6_STATE__.artifactIdentity === null
      && window.__INSTRUMENT_EVIDENCE__.state === 'no-recorded-runtime');
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.__M6_STATE__.runtime), null, 'queued render revived runtime after source edit');

    const synthetic = await page.evaluate(() => window.__M6_INSTRUMENT_RENDER_BENCHMARK__());
    assert.equal(synthetic.serial.records, 4096);
    assert.equal(synthetic.logic.edges, 500);
    assert(synthetic.serial.milliseconds <= 250 && synthetic.logic.milliseconds <= 250);
    assert.equal(outside.length, 0, JSON.stringify(outside));
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);

    process.stdout.write(`${JSON.stringify({
      status: 'pass', buildPosts, firstArtifact,
      layout: { artifactRetained: true, runtimeRetained: true, authoredUnsavedGuard: true, undoRedoRetained: true },
      electrical: { runtimeCleared: true, provenanceCleared: true, undoRedoDidNotReviveArtifact: true },
      clear: { latencyMilliseconds: clearLatencyMilliseconds, cyclePreserved: true, artifactPreserved: true, oldHistoryReappeared: false },
      open: { authoredControl: true, executableAuthority: false, oldRuntimeEvidence: false, oldHistory: false },
      source: { runtimeCleared: true, queuedRenderRevived: false },
      actual: { artifact: screenshotState.artifact, cycle: screenshotState.cycle, serial: screenshotState.evidence.serial, logic: screenshotState.evidence.logic, input: screenshotState.evidence.input },
      synthetic,
      outsideRequests: 0, browserErrors: 0,
    })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
