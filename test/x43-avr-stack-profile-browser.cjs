// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { mkdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X43_STACK_URL || 'http://127.0.0.1:18883';
const evidenceDir = process.env.X43_STACK_EVIDENCE_DIR || '';
const fixturePath = process.env.X43_AVR_FIXTURE
  || '/srv/codex-workspaces/intentforce-station/handoffs/desktop-etvt6l5-ct109-lab-x70-avr-pico-acceptance-recovery-20261020-001/browser/avr-recovery/failure-state.json';

(async () => {
  const fixture = JSON.parse(await readFile(fixturePath)).avrState;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true && window.__X43_AVR_PROFILE__);
    await page.evaluate((source) => {
      const stack = (interval = null) => ({
        schema: 'intent-mcu-x43-avr-observed-stack@1', source: 'avr8js@0.21.1 CPU.SP',
        boundary: 'reset-and-after-each-instruction-plus-tick', resetPointer: 0x08ff,
        sram: { start: 0x0100, end: 0x08ff, bytes: 0x0800, registerSpaceBytes: 0x0100 },
        current: { pointer: 0x08f5, depthBytes: 10, cycle: source.runtime.cycle, instructions: source.runtime.instructions },
        allTime: { minimumPointer: 0x08ef, maximumObservedDepthBytes: 16, samples: 81 },
        allTimeReason: null, interval,
        semantics: { growsTowardLowerAddresses: true, includesInterruptEntryAfterTick: true,
          includesNestedInterruptsWhenFirmwareReenablesThem: true,
          measuresAddressDistanceFromResetTop: true, measuresLiveBytes: false,
          measuresHeap: false, measuresFreeSram: false, memoryHighWaterMark: false },
      });
      source.runtime.x43Stack = stack();
      for (const key of ['compilerTarget', 'revision', 'artifactIdentity', 'inputIdentity', 'lifecycle', 'runtime']) {
        window.__M6_STATE__[key] = structuredClone(source[key]);
      }
      window.__X43_STACK_TEST__ = { token: null, stack };
      document.addEventListener('x43-stack-start-request', (event) => {
        window.__X43_STACK_TEST__.token = event.detail.token;
      }, { capture: true });
      document.querySelector('#quick-state').textContent = 'synthetic stack fixture current';
    }, fixture);
    await page.click('#instruments-open');
    const panel = page.locator('#workbench-instruments-dialog [data-x43-runtime-profile]');
    await panel.waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#workbench-instruments-dialog [data-x43-start]').disabled);
    assert.match(await panel.locator('[data-x43-stack-current]').textContent(), /SP 0x08f5 · 10 B/u);
    assert.match(await panel.locator('[data-x43-stack-all-time]').textContent(), /16 B observed address depth/u);

    await panel.locator('[data-x43-start]').click();
    const token = await page.evaluate(() => window.__X43_STACK_TEST__.token);
    assert.match(token, /^x43-stack-/u);
    assert.match(await panel.locator('[data-x43-stack-interval]').textContent(),
      /Start requested.*pre-ack CPU counters are not the native stack interval/u);
    await page.evaluate((nativeToken) => {
      const runtime = window.__M6_STATE__.runtime;
      runtime.x43Stack = window.__X43_STACK_TEST__.stack({ state: 'observing', token: nativeToken,
        reason: null,
        start: { pointer: 0x08f5, depthBytes: 10, cycle: runtime.cycle, instructions: runtime.instructions },
        current: { pointer: 0x08ef, depthBytes: 16, cycle: runtime.cycle + 4, instructions: runtime.instructions + 2 },
        end: null, minimumPointer: 0x08ef, maximumObservedDepthBytes: 16, samples: 3 });
      document.querySelector('#quick-state').textContent = 'synthetic stack fixture observing';
    }, token);
    await page.waitForFunction(() => /Observing · 16 B/u.test(
      document.querySelector('#workbench-instruments-dialog [data-x43-stack-interval]').textContent));

    await panel.locator('[data-x43-capture]').click();
    assert.match(await panel.locator('[data-x43-stack-interval]').textContent(),
      /Capture requested.*native stack interval is still observing/u);
    await page.evaluate((nativeToken) => {
      const runtime = window.__M6_STATE__.runtime;
      runtime.x43Stack = window.__X43_STACK_TEST__.stack({ state: 'captured', token: nativeToken,
        reason: null,
        start: { pointer: 0x08f5, depthBytes: 10, cycle: runtime.cycle, instructions: runtime.instructions },
        current: { pointer: 0x08f3, depthBytes: 12, cycle: runtime.cycle + 8, instructions: runtime.instructions + 4 },
        end: { pointer: 0x08f3, depthBytes: 12, cycle: runtime.cycle + 8, instructions: runtime.instructions + 4 },
        minimumPointer: 0x08e7, maximumObservedDepthBytes: 24, samples: 5 });
      document.querySelector('#quick-state').textContent = 'synthetic stack fixture captured';
    }, token);
    await page.waitForFunction(() => /24 B observed address depth/u.test(
      document.querySelector('#workbench-instruments-dialog [data-x43-stack-interval]').textContent));
    assert.match(await panel.locator('[data-x43-stack-interval]').textContent(), /minimum SP 0x08e7/u);
    assert.match(await panel.locator('[data-x43-stack-current]').textContent(), /below reset top/u);
    if (evidenceDir) {
      await mkdir(evidenceDir, { recursive: true });
      await panel.screenshot({ path: path.join(evidenceDir, 'x43-stack-synthetic-candidate-1366x768.png') });
    }
    await page.evaluate(() => window.__X43_AVR_PROFILE__.invalidate('X43_TEST_WORKER_RETIRED'));
    assert.doesNotMatch(await panel.locator('[data-x43-stack-interval]').textContent(),
      /24 B observed address depth|minimum SP 0x08e7/u);
    assert.match(await panel.locator('[data-x43-stack-interval]').textContent(),
      /Unavailable until a native observation starts/u);
    if (evidenceDir) {
      await panel.screenshot({ path: path.join(evidenceDir, 'x43-stack-stale-token-cleared-1366x768.png') });
    }
    console.log(JSON.stringify({ fixture: 'synthetic', viewport: '1366x768',
      currentPointer: '0x08f3', currentDepthBytes: 12,
      intervalMinimumPointer: '0x08e7', intervalMaximumObservedDepthBytes: 24,
      allTimeMinimumPointer: '0x08ef', allTimeMaximumObservedDepthBytes: 16 }));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
