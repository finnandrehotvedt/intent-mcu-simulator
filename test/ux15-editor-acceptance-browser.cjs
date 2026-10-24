// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.UX15_URL || 'http://host.docker.internal:18940';
const outputDir = process.env.UX15_OUTPUT || '/tmp/ux15-editor-acceptance';

async function project(page) { return page.evaluate(() => window.__M6_PROJECT__()); }

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = { base, viewports: [], producerRequests: [], mutatingRequests: [] };
  try {
    for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      const page = await context.newPage();
      page.on('request', (request) => {
        const pathname = new URL(request.url()).pathname;
        if (/\/api\//u.test(pathname) && pathname !== '/api/page-views') report.producerRequests.push([request.method(), pathname]);
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && pathname !== '/api/page-views') report.mutatingRequests.push([request.method(), pathname]);
      });
      assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
      await page.waitForFunction(() => window.__M11_READY__ === true);
      const initial = await project(page);
      assert.doesNotMatch(await page.locator('#project-message').innerText(), /Browser recovery .* could not be saved/iu);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__M11_READY__ === true);
      assert.deepEqual(await project(page), initial, 'refresh did not retain the exact authored project');
      await page.click('#workbench-more > summary');
      await page.click('#project-files-open');
      await page.waitForSelector('#workbench-project-dialog[open]');
      assert.equal(await page.locator('#project-open').innerText(), 'Open file');
      assert.equal(await page.locator('#project-open-input').isHidden(), true);
      assert.equal(await page.locator('#walkthrough-open').isHidden(), true);
      assert.equal(await page.locator('#teaching-exercise-open').isHidden(), true);
      await page.keyboard.press('Escape');
      await page.click('#workbench-more > summary');

      const wirePoint = await page.locator('.wire-segment-hit').evaluateAll((nodes) => {
        for (const node of nodes) {
          const length = node.getTotalLength();
          for (const fraction of [0.2, 0.35, 0.5, 0.65, 0.8]) {
            const point = node.getPointAtLength(length * fraction);
            const screen = new DOMPoint(point.x, point.y).matrixTransform(node.getScreenCTM());
            if (document.elementFromPoint(screen.x, screen.y) === node) return { x: screen.x, y: screen.y };
          }
        }
        return null;
      });
      assert(wirePoint, 'no human-visible wire hit point was reachable');
      await page.mouse.click(wirePoint.x, wirePoint.y);
      await page.waitForFunction(() => window.__M6_STATE__.selection.kind === 'wire-segment');
      await page.keyboard.press('Delete');
      await page.waitForFunction((count) => window.__M6_PROJECT__().circuit.nets.length === count - 1, initial.circuit.nets.length);
      await page.keyboard.press('Control+z');
      await page.waitForFunction((count) => window.__M6_PROJECT__().circuit.nets.length === count, initial.circuit.nets.length);
      assert.deepEqual((await project(page)).circuit, initial.circuit, 'Ctrl+Z did not restore exact wiring');

      const led = page.locator('.circuit-component[data-component-type="led.basic-v1"]').first();
      const ledId = await led.getAttribute('data-component-id');
      const originalPosition = initial.layout.positions[ledId];
      const box = await led.boundingBox();
      assert(box, 'LED has no rendered box');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 44, box.y + box.height / 2 + 36, { steps: 8 });
      await page.mouse.up();
      await page.waitForFunction(({ id, original }) => {
        const current = window.__M6_PROJECT__().layout.positions[id];
        return current.x !== original.x || current.y !== original.y;
      }, { id: ledId, original: originalPosition });
      assert.equal(await page.locator('#simple-parts-undo').isVisible(), true);
      assert.equal(await page.locator('#simple-parts-undo').isEnabled(), true);
      await page.click('#simple-parts-undo');
      await page.waitForFunction(({ id, original }) => {
        const current = window.__M6_PROJECT__().layout.positions[id];
        return current.x === original.x && current.y === original.y;
      }, { id: ledId, original: originalPosition });

      assert.equal(await page.locator('#beginner-runtime-toggle').isHidden(), true);
      assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
      const screenshot = path.join(outputDir, `ux15-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      report.viewports.push({ viewport, wireDeleteCtrlZ: true, physicalLedDragUndo: true, screenshot });
      await context.close();
    }
    assert.deepEqual(report.producerRequests, []);
    assert.deepEqual(report.mutatingRequests, []);
    fs.writeFileSync(path.join(outputDir, 'ux15-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ result: 'pass', cases: report.viewports.length, producerActivity: [0, 0], screenshots: report.viewports.map(({ screenshot }) => screenshot) })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
