// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X37_CANDIDATE_URL || 'http://127.0.0.1:18893';
const output = process.env.X37_CANDIDATE_OUTPUT || '/tmp/x37-workbench-candidate-review';
async function anchorErrors(page) { return page.evaluate(() => [...document.querySelectorAll('.x37-svg-branch[data-pin]')].map((path) => {
  const p = path.getPointAtLength(0).matrixTransform(path.getScreenCTM()); const [owner] = path.dataset.pin.split(':');
  const rect = document.querySelector(`[data-x37-pin="${path.dataset.pin}"]`).getBoundingClientRect();
  const x = owner === 'avr' ? rect.right : rect.left; const y = rect.top + rect.height / 2;
  return Math.hypot(p.x - x, p.y - y);
})); }
const fixture = `<!doctype html><body><span id="quick-state"></span><nav><button id="quick-build">Build</button><button id="quick-run">Run</button><button id="quick-pause">Pause</button><button id="quick-stop">Stop</button><button id="quick-reset">Reset</button></nav><button id="project-save">Download</button><button id="project-open">Open</button><input id="project-open-input" type="file"><button id="undo">Undo</button><button id="delete-wire">Delete wire</button><h2 id="canvas-title"></h2><span id="graph-state"></span><pre id="circuit-diagnostics"></pre><div id="circuit-canvas"><svg id="circuit-wires"></svg><div id="component-layer"></div></div><div id="x37-source-tabs" hidden><button id="x37-source-avr"></button><button id="x37-source-rp"></button></div><h2 id="editor-title"></h2><textarea id="source"></textarea><button id="build"></button><p id="x37-candidate-status" hidden></p><button id="run"></button><button id="pause"></button><button id="reset"></button><h2 id="trace-title"></h2><ul id="trace"></ul><p id="trace-boundary"></p></body>`;

async function installReady(page, failure = 'none') {
  page.setDefaultTimeout(5000);
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' }); await page.setContent(fixture);
  await page.evaluate(async ({ baseUrl, failureMode }) => {
    const { installX37WorkbenchCandidate } = await import(`${baseUrl}/staging/x37-workbench-candidate-controller.mjs`);
    const hash = (value) => value.repeat(64);
    document.body.dataset.compileCalls = '0'; document.body.dataset.disposals = '0'; document.body.dataset.adapters = '0'; document.body.dataset.newDisposed = '0';
    const controller = installX37WorkbenchCandidate({ enabled: true, capability: { enabled: true, message: 'Ready injected capability' },
      compileParticipant: async (participant, projectGeneration, runtimeGeneration) => {
        document.body.dataset.compileCalls = String(Number(document.body.dataset.compileCalls) + 1);
        if (['edit-pending', 'duplicate'].includes(failureMode)) await new Promise((resolve) => setTimeout(resolve, 60));
        if (failureMode === 'failure' && participant.id === 'rp') throw Object.assign(new Error('DOUBLE_FAILURE'), { code: 'DOUBLE_FAILURE' });
        return { participantId: participant.id, profile: participant.profile,
          projectGeneration: failureMode === 'stale' && participant.id === 'rp' ? projectGeneration - 1 : projectGeneration,
          runtimeGeneration, artifactIdentity: hash(participant.id === 'avr' ? 'a' : 'b'),
          modelLibrarySha256: hash('c'), toolchainSha256: hash('d') };
      }, createRuntimePair: async () => { if (['startup-stop', 'open-pending'].includes(failureMode)) await new Promise((resolve) => setTimeout(resolve, 60));
        return { avr: { ordinary: true }, rp: { ordinary: true } }; },
      createProductAdapter: () => { if (failureMode === 'constructor') throw Object.assign(new Error('CONSTRUCTOR_FAIL'), { code: 'CONSTRUCTOR_FAIL' });
        const number = Number(document.body.dataset.adapters) + 1; document.body.dataset.adapters = String(number);
        if (failureMode === 'oldrun-race' && number === 1) return { run: async () => { await new Promise((resolve) => setTimeout(resolve, 100)); throw new Error('OLD_RUN_FAIL'); }, pause: () => {}, dispose: () => [] };
        return { run: async () => ({ trace: [{ participantId: 'avr', pin: 'D13', localCycle: 4, mappedTick: 1, level: 'LOW' }] }),
        pause: () => ({ errors: [] }), dispose: () => { if (failureMode === 'oldrun-race') document.body.dataset.newDisposed = '1'; return []; } };
      }, disposeRuntimePair: () => { document.body.dataset.disposals = String(Number(document.body.dataset.disposals) + 1); return []; },
      budgetOwner: failureMode === 'oldrun-race' ? { preflight: () => ({ ok: true }), chargeBuild: () => {}, chargeRun: () => {}, cancel: () => {}, snapshot: () => ({}) } : null,
      requestUnsavedGuard: ({ continueAction }) => continueAction(), downloadText: () => {},
    });
    document.addEventListener('test-open', () => controller.openText(JSON.stringify(controller.project())));
  }, { baseUrl: base, failureMode: failure });
}

(async () => {
  fs.mkdirSync(output, { recursive: true }); const browser = await chromium.launch({ headless: true });
  const report = { baselineBuilds: 0, baselineRuns: 0, controllerJourneys: [], viewports: [] };
  try {
    for (const viewport of [{ width: 1366, height: 900 }, { width: 1440, height: 1000 }, { width: 1720, height: 1000 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' }); const page = await context.newPage();
      page.setDefaultTimeout(5000);
      const producers = []; page.on('request', (request) => { if (/\/api\/(?:build|runtime|compile)/u.test(request.url())) producers.push(request.url()); });
      assert.equal((await page.goto(`${base}/dist/?x37-candidate=1`, { waitUntil: 'domcontentloaded' }))?.status(), 200);
      await page.waitForFunction(() => !document.querySelector('#x37-source-tabs').hidden);
      for (const id of ['quick-build', 'quick-run', 'quick-pause', 'quick-stop', 'quick-reset']) assert.equal(await page.isDisabled(`#${id}`), true);
      assert.equal(await page.locator('#source').count(), 1); assert.equal(await page.locator('.x37-canvas-node').count(), 2);
      assert.equal(await page.locator('[data-net-id="shared.digital.0"]').count(), 1);
      await page.locator('#source').evaluate((node) => { node.focus(); node.value = 'AB'; node.setSelectionRange(1, 2); });
      await page.keyboard.press('Delete'); assert.equal(await page.locator('[data-net-id="shared.digital.0"]').count(), 1);
      assert.equal(await page.locator('.x37-svg-branch').count(), 6);
      assert((await anchorErrors(page)).every((error) => error <= 2));
      await page.locator('[data-net-id="shared.digital.0"]').click({ force: true }); assert.equal(await page.locator('.x37-canvas-node').count(), 2);
      await page.keyboard.press('Delete');
      assert.equal(await page.locator('.x37-canvas-node').count(), 2); assert.equal(await page.locator('[data-net-id="shared.digital.0"]').count(), 0);
      await page.keyboard.press('Control+z'); assert.equal(await page.locator('.x37-canvas-node').count(), 2);
      await page.waitForFunction(() => document.querySelectorAll('.x37-svg-branch[data-pin]').length === 4);
      assert.equal(await page.locator('[data-net-id="shared.digital.0"]').count(), 1);
      assert((await anchorErrors(page)).every((error) => error <= 2));
      assert.match(await page.textContent('#x37-candidate-status'), /public RP2040 compiler grammar/u);
      assert.equal(await page.evaluate(() => window.__X37_CANDIDATE__), undefined);
      const caret = await page.locator('#source').evaluate((node) => { node.value = '// unsaved AVR candidate source\n';
        node.setSelectionRange(7, 7); node.dispatchEvent(new Event('input', { bubbles: true }));
        return [node.selectionStart, node.selectionEnd]; });
      assert.deepEqual(caret, [7, 7]);
      await page.locator('#project-open').evaluate((node) => node.click());
      await page.waitForFunction(() => document.querySelector('#unsaved-change-dialog').open);
      assert.match(await page.textContent('#unsaved-change-title'), /X37 candidate/u);
      await page.click('#unsaved-keep');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(overflow <= 1); const screenshot = path.join(output, `x37-integrated-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: screenshot, fullPage: true }); assert.deepEqual(producers, []);
      report.viewports.push({ viewport, overflow, screenshot }); await context.close();
    }
    for (const mode of ['success', 'failure', 'stale']) {
      const page = await browser.newPage(); await installReady(page, mode === 'success' ? 'none' : mode);
      await page.click('#quick-build');
      if (mode === 'success') {
        await page.waitForFunction(() => !document.querySelector('#quick-run').disabled); await page.click('#quick-run');
        await page.waitForFunction(() => !document.querySelector('#quick-pause').disabled); await page.click('#quick-pause');
        await page.click('#quick-stop'); await page.click('#quick-reset');
        assert.match(await page.textContent('#x37-candidate-status'), /fresh Build required/u);
      } else await page.waitForFunction(() => document.querySelector('#x37-candidate-status').textContent.includes('Build failed'));
      report.controllerJourneys.push({ mode, status: await page.textContent('#x37-candidate-status') }); await page.close();
    }
    for (const mode of ['startup-stop', 'open-pending', 'edit-pending', 'duplicate', 'constructor']) {
      const page = await browser.newPage(); await installReady(page, mode); await page.click('#quick-build');
      if (mode === 'edit-pending') {
        await page.locator('#source').evaluate((node) => { node.value += '// edit during Build\n'; node.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.waitForTimeout(100); assert.match(await page.textContent('#x37-candidate-status'), /Source changed/u);
      } else {
        await page.waitForFunction(() => !document.querySelector('#quick-run').disabled);
        if (mode === 'duplicate') { assert.equal(await page.getAttribute('body', 'data-compile-calls'), '2'); }
        else { await page.click('#quick-run');
          if (['startup-stop', 'open-pending'].includes(mode)) { if (mode === 'startup-stop') await page.click('#quick-stop');
            else await page.evaluate(() => document.dispatchEvent(new Event('test-open'))); await page.waitForTimeout(100);
            assert.equal(await page.getAttribute('body', 'data-disposals'), '1');
            assert.match(await page.textContent('#x37-candidate-status'), mode === 'startup-stop' ? /stopped/i : /Opened atomically/u); }
          else { await page.waitForFunction(() => document.querySelector('#x37-candidate-status').textContent.includes('Run failed'));
            assert.equal(await page.getAttribute('body', 'data-disposals'), '1'); }
        }
      }
      report.controllerJourneys.push({ mode, status: await page.textContent('#x37-candidate-status') }); await page.close();
    }
    {
      const page = await browser.newPage(); await installReady(page, 'oldrun-race'); await page.click('#quick-build');
      await page.waitForFunction(() => !document.querySelector('#quick-run').disabled); await page.click('#quick-run');
      await page.click('#quick-stop'); await page.click('#quick-build');
      await page.waitForFunction(() => !document.querySelector('#quick-run').disabled); await page.click('#quick-run');
      await page.waitForFunction(() => document.querySelector('#x37-candidate-status').textContent.includes('runtime active'));
      await page.waitForTimeout(140); assert.equal(await page.getAttribute('body', 'data-new-disposed'), '0');
      assert.match(await page.textContent('#x37-candidate-status'), /runtime active/u); assert.match(await page.textContent('#trace'), /tick 1/u);
      report.controllerJourneys.push({ mode: 'oldrun-race', status: await page.textContent('#x37-candidate-status') }); await page.close();
    }
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
