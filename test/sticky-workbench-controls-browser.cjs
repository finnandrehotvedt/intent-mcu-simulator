// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.STICKY_WORKBENCH_URL || 'http://host.docker.internal:18869';
const output = process.env.STICKY_WORKBENCH_OUTPUT || '/tmp/sticky-workbench-evidence';
const profiles = [
  'board.atmega328p-16mhz-v1',
  'board.rp2040-pico-v1',
  'board.esp32-c3-devmodule-v1',
  'board.stm32f429zi-nucleo144-v1',
];
const fullscreenControls = {
  'board.atmega328p-16mhz-v1': '#fullscreen-canvas',
  'board.rp2040-pico-v1': '#pico-fullscreen',
  'board.esp32-c3-devmodule-v1': '#c3-fullscreen',
  'board.stm32f429zi-nucleo144-v1': '#stm32-fullscreen',
};

async function selectProfile(page, id) {
  await page.selectOption('#board-select', id);
  await page.waitForFunction((value) => document.querySelector('#board-select').value === value, id);
}

async function metrics(page) {
  return page.evaluate(() => {
    const sticky = document.querySelector('#top-workbench-sticky-controls').getBoundingClientRect();
    const shell = document.querySelector('#top-workbench-shell').getBoundingClientRect();
    const canvas = document.querySelector('#active-canvas-stage').getBoundingClientRect();
    const lower = document.querySelector('.desktop-required').getBoundingClientRect();
    const ids = ['family-select','board-select','quick-build','quick-run','quick-pause','quick-reset','project-files-open','toggle-catalog','toggle-inspector','firmware-open','brief-tests-open','instruments-open','help-limits-open','build-list-export'];
    return {
      scrollY, sticky: { top: sticky.top, bottom: sticky.bottom, height: sticky.height },
      shell: { top: shell.top, bottom: shell.bottom }, canvas: { top: canvas.top, bottom: canvas.bottom },
      lowerTop: lower.top, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      controls: ids.map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; }),
    };
  });
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = { base, requests: [], cases: [], zoomFallback: null };
  try {
    for (const viewport of [{ width:1366, height:768 }, { width:1440, height:900 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers:'block' });
      const page = await context.newPage();
      page.on('request', request => {
        if (!['GET','HEAD','OPTIONS'].includes(request.method()) || /\/api\//u.test(new URL(request.url()).pathname)) report.requests.push({ method:request.method(), url:request.url() });
      });
      assert.equal((await page.goto(base, { waitUntil:'domcontentloaded' })).status(), 200);
      await page.waitForFunction(() => window.__M11_READY__ === true);
      for (const profile of profiles) {
        await selectProfile(page, profile);
        await page.evaluate(() => scrollTo(0, 0));
        const initial = await metrics(page);
        assert(initial.canvas.top <= 210);
        assert(initial.canvas.bottom - initial.canvas.top >= 560);
        assert(initial.overflow <= 1);

        const shellTop = await page.locator('#top-workbench-shell').evaluate(node => node.offsetTop);
        const shellHeight = await page.locator('#top-workbench-shell').evaluate(node => node.offsetHeight);
        const stickyHeight = initial.sticky.height;
        const positions = [shellTop + 80, shellTop + Math.round(shellHeight / 2), shellTop + shellHeight - stickyHeight - 20];
        const stages = [];
        for (const target of positions) {
          await page.evaluate(y => scrollTo(0, y), target);
          const value = await metrics(page);
          assert(Math.abs(value.sticky.top - 8) <= 1, `${profile}: sticky top ${value.sticky.top}`);
          assert(value.sticky.bottom < value.canvas.bottom + stickyHeight);
          assert(value.overflow <= 1);
          for (const control of value.controls) assert(control.width > 0 && control.height > 0 && control.top >= 0 && control.bottom <= viewport.height, `${profile}: clipped ${control.id}`);
          stages.push(value);
        }

        await page.evaluate((y) => scrollTo(0, y), shellTop + shellHeight + 20);
        const after = await metrics(page);
        assert(after.sticky.bottom <= after.shell.bottom + 1);
        assert(after.sticky.top < 8, `${profile}: controls remained page-global fixed`);

        await page.evaluate(y => scrollTo(0, y), positions[1]);
        const scrollBefore = await page.evaluate(() => scrollY);
        await page.click('#help-limits-open');
        await page.waitForSelector('#workbench-help-dialog[open]');
        assert.equal(await page.evaluate(() => document.querySelector('#workbench-help-dialog').contains(document.activeElement)), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#help-limits-open')), true);
        assert(Math.abs((await page.evaluate(() => scrollY)) - scrollBefore) <= 1);

        await page.click(fullscreenControls[profile]);
        await page.waitForFunction(() => document.fullscreenElement !== null);
        assert.equal(await page.evaluate(() => document.fullscreenElement.contains(document.querySelector('#top-workbench-sticky-controls'))), false);
        await page.evaluate(() => document.exitFullscreen());
        await page.waitForFunction(() => document.fullscreenElement === null);

        report.cases.push({ viewport, profile, initial, stages, after, dialogFocusAndScrollPreserved:true, fullscreenCanvasUnobscured:true });
      }
      await page.screenshot({ path:path.join(output, `${viewport.width}x${viewport.height}.png`), fullPage:false });
      await context.close();
    }

    const context = await browser.newContext({ viewport:{ width:720, height:450 }, serviceWorkers:'block' });
    const page = await context.newPage();
    await page.goto(base, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    report.zoomFallback = await page.evaluate(() => ({ position:getComputedStyle(document.querySelector('#top-workbench-sticky-controls')).position, overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth }));
    assert.equal(report.zoomFallback.position, 'static');
    assert(report.zoomFallback.overflow <= 1);
    await context.close();
    assert.deepEqual(report.requests, []);
    fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ cases:report.cases.length, zoomFallback:report.zoomFallback, requests:0 })}\n`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
