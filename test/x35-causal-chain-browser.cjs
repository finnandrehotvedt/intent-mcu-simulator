// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X35_URL || 'http://127.0.0.1:18812';
const evidencePath = process.env.X35_EVIDENCE_PATH;
const reportPath = process.env.X35_REPORT_PATH;
const screenshot = process.env.X35_SCREENSHOT_PATH;

async function run(page) {
  const report = await page.evaluate(() => window.__X35_CAUSAL_CHAIN__.run());
  assert.equal(await page.evaluate(() => window.__X35_CAUSAL_CHAIN__.passed()), true);
  return report;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1732, height: 1100 }, acceptDownloads: true });
    const page = await context.newPage(); const errors = []; const outside = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' })).status(), 200);
    await page.waitForFunction(() => window.__X35_CAUSAL_CHAIN__?.ready === true);
    const panel = await page.locator('#causal-chain').locator('xpath=..').textContent();
    for (const text of ['BOUNDED AVR CPU-TO-LED CAUSAL CHAIN', 'unmodified thermostat artifact',
      'synchronous project-owned consequence', 'not independent physical causality',
      'No debugger', 'arbitrary register/memory API']) assert.match(panel, new RegExp(text, 'iu'));

    const first = await run(page);
    assert.equal(first.schema, 'intent-mcu-x35-causal-chain-report@1');
    assert.equal(first.repeats.length, 2);
    assert.notEqual(first.repeats[0].runtimeBinding.runtimeGeneration,
      first.repeats[1].runtimeBinding.runtimeGeneration);
    assert.notEqual(first.repeats[0].runtimeIdentity.workerInstanceNonce,
      first.repeats[1].runtimeIdentity.workerInstanceNonce);
    assert.equal(first.repeatSemanticSha256.length, 64);
    for (const repeat of first.repeats) {
      const { chain } = repeat;
      assert.equal(chain.instruction.pcBefore, 941);
      assert.equal(chain.instruction.pcAfter, 942);
      assert.equal(chain.instruction.opcode, 37612);
      assert.deepEqual([chain.instruction.cycleBefore, chain.instruction.cycleAfter], [6138, 6140]);
      assert.deepEqual([chain.register.fullValueBefore, chain.register.fullValueAfterInstruction,
        chain.register.fullValueAfterTick], [0, 32, 32]);
      assert.equal(chain.register.selectedBit, 5);
      assert.equal(chain.callback.rawCycle, 6138);
      assert.equal(chain.tickDistinction.tickChangedBit5, false);
      assert.deepEqual(chain.pin, { eventId: chain.eventId, causedBy: chain.eventId,
        pin: 'D13', mode: 'OUTPUT', level: true });
      assert.equal(chain.componentProjection.componentId, 'heater-led-1');
      assert.equal(chain.componentProjection.on, true);
      assert.equal(chain.componentProjection.capturedAtInstructionBoundary, true);
      for (const stage of ['instruction', 'register', 'callback', 'pin', 'topology', 'componentProjection']) {
        assert.equal(chain[stage].eventId, chain.eventId);
      }
    }
    assert.equal((await page.locator('#causal-chain-state').textContent()).trim(),
      '5 stages · 2/2 fresh workers passed');
    assert.deepEqual(await page.locator('.causal-chain-table thead th').allTextContents(),
      ['Stage', 'Producer record', 'Causal identity', 'Evidence boundary', 'Repeat outcome']);

    const exportPromise = page.waitForEvent('download'); await page.click('#causal-chain-export');
    const exported = await exportPromise;
    const exportedReport = JSON.parse(fs.readFileSync(await exported.path(), 'utf8'));
    assert.deepEqual(exportedReport, first);
    if (await page.getAttribute('#serial-tab', 'aria-expanded') !== 'true') await page.click('#serial-tab');
    await page.locator('#causal-chain').scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => {
      const main = document.querySelector('main').getBoundingClientRect();
      const dock = document.querySelector('#serial-dock').getBoundingClientRect();
      return { serialNoOverlap: main.right <= dock.left + 1,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    assert.equal(layout.serialNoOverlap, true); assert.ok(layout.overflow <= 1);
    if (screenshot) await page.screenshot({ path: screenshot, fullPage: false });

    await page.dispatchEvent('#reset', 'click');
    await page.waitForFunction(() => window.__X35_CAUSAL_CHAIN__.report() === null);
    await run(page);
    await page.locator('#source').fill(`${await page.locator('#source').inputValue()}\n// X35 lifecycle edit`);
    await page.waitForFunction(() => window.__X35_CAUSAL_CHAIN__.report() === null);
    await run(page);
    const projectPromise = page.waitForEvent('download'); await page.click('#project-save');
    const project = await projectPromise; const projectPath = await project.path();
    const projectText = fs.readFileSync(projectPath, 'utf8');
    assert.doesNotMatch(projectText, /x35CausalChain|x35Probe|workerInstanceNonce|PORTB/u);
    await page.setInputFiles('#project-open-input', projectPath);
    await page.waitForFunction(() => window.__X35_CAUSAL_CHAIN__.report() === null);
    await run(page);
    await page.dispatchEvent('#build', 'click');
    await page.waitForFunction(() => window.__X35_CAUSAL_CHAIN__.report() === null);
    await page.dispatchEvent('#cancel', 'click');
    await run(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__X35_CAUSAL_CHAIN__?.ready === true);
    assert.equal(await page.evaluate(() => window.__X35_CAUSAL_CHAIN__.report()), null);
    assert.equal(await page.locator('#causal-chain-export').isDisabled(), true);
    assert.deepEqual(errors, []); assert.deepEqual(outside, []); assert.deepEqual(await context.cookies(), []);

    const chain = first.repeats[0].chain;
    const evidence = { schema: 'x35-private-browser-evidence@1', suiteSha256: first.suiteSha256,
      artifactIdentity: first.artifactIdentity, sourceSha256: first.sourceSha256,
      graphSha256: first.graphSha256, semanticSha256: first.semanticSha256,
      repeatSemanticSha256: first.repeatSemanticSha256,
      runtimeGenerationsDistinct: true, workerNoncesDistinct: true,
      pcBefore: chain.instruction.pcBefore, pcAfter: chain.instruction.pcAfter,
      opcode: chain.instruction.opcode, cycleBounds: [chain.instruction.cycleBefore,
        chain.instruction.cycleAfter], callbackCycle: chain.callback.rawCycle,
      portValues: [chain.register.fullValueBefore, chain.register.fullValueAfterInstruction,
        chain.register.fullValueAfterTick], selectedBit: chain.register.selectedBit,
      tickAmbiguityAbsent: true, eventIdentityPropagated: true,
      d13: 'OUTPUT HIGH', componentProjection: 'heater-led-1 ON at instruction boundary',
      exportMatched: true, resetCleared: true, sourceEditCleared: true, openCleared: true,
      projectFileExcludedAuthority: true, buildCleared: true, reloadCleared: true,
      serialNoOverlap: true, overflow: layout.overflow,
      browserErrors: 0, cookies: 0, thirdPartyRequests: 0 };
    if (reportPath) fs.writeFileSync(reportPath, `${JSON.stringify(first, null, 2)}\n`);
    if (evidencePath) fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
