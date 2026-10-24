// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X37_CANDIDATE_URL || 'http://127.0.0.1:18893';
const output = process.env.X37_CANDIDATE_OUTPUT || '/tmp/x37-workbench-candidate-review';
const fixture = `<!doctype html><body><span id="quick-state"></span><nav><button id="quick-build">Build</button><button id="quick-run">Run</button><button id="quick-pause">Pause</button><button id="quick-stop">Stop</button><button id="quick-reset">Reset</button></nav><button id="project-save">Download</button><button id="project-open">Open</button><input id="project-open-input" type="file"><h2 id="canvas-title"></h2><span id="graph-state"></span><div id="circuit-canvas"><svg id="circuit-wires"></svg><div id="component-layer"></div></div><div id="x37-source-tabs" hidden><button id="x37-source-avr"></button><button id="x37-source-rp"></button></div><h2 id="editor-title"></h2><textarea id="source"></textarea><button id="build"></button><p id="x37-candidate-status" hidden></p><button id="run"></button><button id="pause"></button><button id="reset"></button><h2 id="trace-title"></h2><ul id="trace"></ul><p id="trace-boundary"></p></body>`;

async function installReady(page, failure = 'none') {
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' }); await page.setContent(fixture);
  await page.evaluate(async ({ baseUrl, failureMode }) => {
    const { installX37WorkbenchCandidate } = await import(`${baseUrl}/staging/x37-workbench-candidate-controller.mjs`);
    const hash = (value) => value.repeat(64);
    installX37WorkbenchCandidate({ enabled: true, capability: { enabled: true, message: 'Ready injected capability' },
      compileParticipant: async (participant, projectGeneration, runtimeGeneration) => {
        if (failureMode === 'failure' && participant.id === 'rp') throw Object.assign(new Error('DOUBLE_FAILURE'), { code: 'DOUBLE_FAILURE' });
        return { participantId: participant.id, profile: participant.profile,
          projectGeneration: failureMode === 'stale' && participant.id === 'rp' ? projectGeneration - 1 : projectGeneration,
          runtimeGeneration, artifactIdentity: hash(participant.id === 'avr' ? 'a' : 'b'),
          modelLibrarySha256: hash('c'), toolchainSha256: hash('d') };
      }, createRuntimePair: async () => ({ avr: { ordinary: true }, rp: { ordinary: true } }),
      createProductAdapter: () => ({ run: async () => ({ trace: [{ participantId: 'avr', pin: 'D13', localCycle: 4, mappedTick: 1, level: 'LOW' }] }),
        pause: () => ({ errors: [] }), dispose: () => [] }),
      requestUnsavedGuard: ({ continueAction }) => continueAction(), downloadText: () => {},
    });
  }, { baseUrl: base, failureMode: failure });
}

(async () => {
  fs.mkdirSync(output, { recursive: true }); const browser = await chromium.launch({ headless: true });
  const report = { baselineBuilds: 0, baselineRuns: 0, controllerJourneys: [], viewports: [] };
  try {
    for (const viewport of [{ width: 1366, height: 900 }, { width: 1440, height: 1000 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' }); const page = await context.newPage();
      const producers = []; page.on('request', (request) => { if (/\/api\/(?:build|runtime|compile)/u.test(request.url())) producers.push(request.url()); });
      assert.equal((await page.goto(`${base}/dist/?x37-candidate=1`, { waitUntil: 'domcontentloaded' }))?.status(), 200);
      await page.waitForFunction(() => !document.querySelector('#x37-source-tabs').hidden);
      for (const id of ['quick-build', 'quick-run', 'quick-pause', 'quick-stop', 'quick-reset']) assert.equal(await page.isDisabled(`#${id}`), true);
      assert.equal(await page.locator('#source').count(), 1); assert.equal(await page.locator('.x37-canvas-node').count(), 2);
      assert.equal(await page.locator('[data-net-id="shared.digital.0"]').count(), 1);
      assert.match(await page.textContent('#x37-candidate-status'), /public RP2040 compiler grammar/u);
      assert.equal(await page.evaluate(() => window.__X37_CANDIDATE__), undefined);
      await page.locator('#source').evaluate((node) => { node.value = '// unsaved AVR candidate source\n';
        node.dispatchEvent(new Event('input', { bubbles: true })); });
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
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
