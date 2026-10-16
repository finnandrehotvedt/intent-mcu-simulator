// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('fs');
const path = require('path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.M3_STAGING_URL || 'http://127.0.0.1:18766';
const screenshotDirectory = process.env.MOBILE_CONTROLS_SCREENSHOT_DIR || null;

function assert(value, message) { if (!value) throw new Error(message); }

async function waitForBuild(page) {
  await page.click('#quick-build');
  await page.waitForFunction(() => ['succeeded', 'failed', 'cancelled', 'timeout'].includes(window.__M6_STATE__?.buildState), null, { timeout: 30_000 });
  const state = await page.evaluate(() => structuredClone(window.__M6_STATE__));
  assert(state.buildState === 'succeeded', `mobile Build failed: ${state.buildState}`);
  await page.waitForFunction(() => window.__M6_STATE__?.runtime?.kind === 'ready', null, { timeout: 10_000 });
}

async function dimensions(page) {
  return page.evaluate(() => {
    const ids = ['quick-build', 'quick-run', 'quick-pause', 'quick-reset'];
    const rects = Object.fromEntries(ids.map((id) => {
      const control = document.getElementById(id);
      const rect = control.getBoundingClientRect();
      return [id, { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, disabled: control.disabled }];
    }));
    const toolbar = document.querySelector('.quick-controls').getBoundingClientRect();
    const dock = document.querySelector('#serial-dock').getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      toolbarOverflow: document.querySelector('.quick-controls').scrollWidth - document.querySelector('.quick-controls').clientWidth,
      toolbar: { left: toolbar.left, right: toolbar.right, top: toolbar.top, bottom: toolbar.bottom },
      dock: { left: dock.left, right: dock.right, top: dock.top, bottom: dock.bottom },
      rects,
    };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const reports = [];
  for (const viewport of [{ width: 320, height: 720 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const outside = [];
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url());
    });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.click('.starter-card[data-example="blink"]');
    await waitForBuild(page);

    let layout = await dimensions(page);
    assert(layout.documentOverflow <= 1, `${viewport.width}px document overflow ${layout.documentOverflow}`);
    assert(layout.toolbarOverflow <= 1, `${viewport.width}px toolbar overflow ${layout.toolbarOverflow}`);
    for (const [id, rect] of Object.entries(layout.rects)) {
      assert(rect.left >= 0 && rect.right <= viewport.width && rect.width >= 44 && rect.height >= 34,
        `${viewport.width}px ${id} is clipped: ${JSON.stringify(rect)}`);
    }
    assert(layout.rects['quick-run'].disabled === false, `${viewport.width}px Run is not enabled after Build`);
    assert(layout.rects['quick-reset'].disabled === false, `${viewport.width}px Reset is not enabled after Build`);

    await page.click('#quick-run');
    await page.waitForFunction(() => window.__M6_STATE__?.runtime?.paused === false
      && window.__M6_STATE__?.runtime?.cycle > 0, null, { timeout: 10_000 });
    await page.waitForFunction(() => window.__M6_STATE__?.runtime?.instruments?.serial?.text?.includes('ON'), null, { timeout: 10_000 });
    assert(await page.locator('#quick-pause').isEnabled(), `${viewport.width}px Pause is not enabled while running`);
    await page.click('#serial-tab');
    await page.waitForFunction(() => !document.querySelector('#serial-dock').hidden);
    layout = await dimensions(page);
    assert(layout.toolbar.bottom <= layout.dock.top,
      `${viewport.width}px Serial dock covers Workbench controls: ${JSON.stringify(layout)}`);
    const closeRect = await page.locator('#serial-close').boundingBox();
    assert(closeRect && closeRect.x >= 0 && closeRect.x + closeRect.width <= viewport.width,
      `${viewport.width}px Serial close control is clipped: ${JSON.stringify(closeRect)}`);
    await page.click('#serial-close');
    await page.waitForFunction(() => document.querySelector('#serial-dock').hidden);
    await page.click('#quick-pause');
    await page.waitForFunction(() => window.__M6_STATE__?.runtime?.paused === true);
    await page.click('#quick-reset');
    await page.waitForFunction(() => window.__M6_STATE__?.runtime?.kind === 'reset' && window.__M6_STATE__?.runtime?.cycle === 0);
    assert(outside.length === 0, `${viewport.width}px third-party requests: ${outside.join(', ')}`);

    if (screenshotDirectory) {
      fs.mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDirectory, `mobile-workbench-${viewport.width}.png`), fullPage: false });
    }
    reports.push({ width: viewport.width, controls: layout.rects, toolbar: layout.toolbar, serialDock: layout.dock });
    await context.close();
  }
  await browser.close();
  process.stdout.write(`${JSON.stringify({ status: 'pass', reports })}\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
