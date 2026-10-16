// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.M3_STAGING_URL || 'http://127.0.0.1:18774';

async function setPressed(page, selector, pressed) {
  const current = await page.locator(selector).getAttribute('aria-pressed');
  if ((current === 'true') !== pressed) await page.click(selector);
}

async function setSerial(page, open) {
  const current = await page.locator('#serial-tab').getAttribute('aria-expanded');
  if ((current === 'true') !== open) await page.click('#serial-tab');
}

async function snapshot(page, state) {
  await setPressed(page, '#toggle-catalog', state.catalogCollapsed);
  await setPressed(page, '#toggle-inspector', state.inspectorCollapsed);
  await setSerial(page, state.serialOpen);
  await page.click('#fit-project');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate((expected) => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
    const visible = (selector) => getComputedStyle(document.querySelector(selector)).display !== 'none';
    const workspace = rect('#workbench-workspace');
    const board = rect('.board-card');
    const canvas = rect('#circuit-canvas');
    const direct = ['.catalog', '#catalog-resizer', '.board-card', '#inspector-resizer', '.inspector']
      .filter(visible).map((selector) => ({ selector, rect: rect(selector) }));
    const occupied = direct.reduce((sum, item) => sum + item.rect.width, 0)
      + Math.max(0, direct.length - 1) * Number.parseFloat(getComputedStyle(document.querySelector('#workbench-workspace')).gap);
    const canvasBox = document.querySelector('#circuit-canvas').getBoundingClientRect();
    const errors = [...document.querySelectorAll('path.circuit-wire')].map((wire) => {
      const anchor = document.querySelector(`.pin-anchor[data-endpoint="${wire.dataset.endpoint}"]`).getBoundingClientRect();
      const start = /^M ([\d.-]+) ([\d.-]+)/.exec(wire.getAttribute('d'));
      return Math.max(
        Math.abs(Number(start[1]) - (anchor.left - canvasBox.left + anchor.width / 2)),
        Math.abs(Number(start[2]) - (anchor.top - canvasBox.top + anchor.height / 2)),
      );
    });
    const main = rect('main');
    return {
      expected, workspace, board, canvas, direct,
      unusedWidth: workspace.width - occupied,
      maximumEndpointError: Math.max(0, ...errors),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      main: { left: main.left, right: main.right, width: main.width },
      grid: getComputedStyle(document.querySelector('#workbench-workspace')).gridTemplateColumns,
    };
  }, state);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('intent-mcu.workbench.')) localStorage.removeItem(key);
    }
  });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.selectOption('#example-select', 'button');
  await page.click('#project-demo');
  await page.waitForFunction(() => document.querySelectorAll('path.circuit-wire').length > 0);

  const reports = [];
  for (const serialOpen of [false, true]) {
    for (const catalogCollapsed of [false, true]) {
      for (const inspectorCollapsed of [false, true]) {
        const report = await snapshot(page, { serialOpen, catalogCollapsed, inspectorCollapsed });
        assert.ok(report.overflow <= 1, JSON.stringify(report));
        assert.ok(report.board.width >= 620, JSON.stringify(report));
        assert.ok(Math.abs(report.unusedWidth) <= 2, JSON.stringify(report));
        assert.ok(report.maximumEndpointError <= 1.5, JSON.stringify(report));
        assert.ok(report.canvas.width >= report.board.width - 40, JSON.stringify(report));
        if (!serialOpen && catalogCollapsed && inspectorCollapsed) {
          assert.ok(report.board.width >= report.workspace.width - 2, JSON.stringify(report));
        }
        if (serialOpen && inspectorCollapsed) {
          assert.ok(report.board.width >= report.workspace.width - 2, JSON.stringify(report));
        }
        reports.push(report);
      }
    }
  }

  await setSerial(page, false);
  await setPressed(page, '#toggle-catalog', true);
  await setPressed(page, '#toggle-inspector', true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.click('#fit-project');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const at1440 = await page.evaluate(() => {
    const main = document.querySelector('main').getBoundingClientRect();
    const workspace = document.querySelector('#workbench-workspace').getBoundingClientRect();
    const board = document.querySelector('.board-card').getBoundingClientRect();
    return { main: main.toJSON(), workspace: workspace.toJSON(), board: board.toJSON(), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  assert.ok(at1440.main.left >= 15 && 1440 - at1440.main.right >= 15, JSON.stringify(at1440));
  assert.ok(at1440.overflow <= 1 && at1440.board.width >= at1440.workspace.width - 2, JSON.stringify(at1440));

  await browser.close();
  process.stdout.write(`${JSON.stringify({ status: 'pass', states: reports.map((item) => ({ expected: item.expected, boardWidth: item.board.width, workspaceWidth: item.workspace.width, grid: item.grid, endpointError: item.maximumEndpointError })), at1440 })}\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
