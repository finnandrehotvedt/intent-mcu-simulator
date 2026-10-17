// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.CANVAS_THEME_URL || 'http://127.0.0.1:18781';
const screenshotDirectory = process.env.CANVAS_THEME_SCREENSHOT_DIR;
const stage = process.env.CANVAS_THEME_STAGE || 'candidate';
const requireSharedDark = process.env.CANVAS_THEME_REQUIRE_SHARED_DARK === '1';
const profiles = [
  { id: 'avr', family: 'architecture.avr-v1', option: 'board.atmega328p-16mhz-v1', root: '#workbench-workspace', canvas: '#circuit-canvas' },
  { id: 'pico', family: 'architecture.rp2040-v1', option: 'board.rp2040-pico-v1', root: '#pico-public-workbench', canvas: '#pico-diagram' },
  { id: 'c3', family: 'architecture.esp32-v1', option: 'board.esp32-c3-devmodule-v1', root: '#c3-public-workbench', canvas: '#c3-diagram' },
  { id: 'stm32', family: 'architecture.stm32-v1', option: 'board.stm32f429zi-nucleo144-v1', root: '#stm32-public-workbench', canvas: '#stm32-diagram' },
];

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb) {
  const values = rgb.match(/\d+/g).slice(0, 3).map(Number);
  return 0.2126 * channel(values[0]) + 0.7152 * channel(values[1]) + 0.0722 * channel(values[2]);
}

function contrast(left, right) {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const external = [];
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(base).origin) external.push(request.url());
  });
  assert.equal((await page.goto(base, { waitUntil: 'networkidle' })).status(), 200);
  if (screenshotDirectory) fs.mkdirSync(screenshotDirectory, { recursive: true });

  const reports = [];
  for (const profile of profiles) {
    await page.getByRole('combobox', { name: 'Architecture / family workbench' }).selectOption(profile.family);
    await page.selectOption('#board-select', profile.option);
    await page.waitForFunction((root) => !document.querySelector(root).hidden, profile.root);
    const theme = await page.locator(profile.canvas).evaluate((node) => {
      const style = getComputedStyle(node);
      const label = node.querySelector('.pico-editor-part-label');
      const labelStyle = label ? getComputedStyle(label) : null;
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        backgroundSize: style.backgroundSize,
        labelColor: labelStyle?.color || null,
        labelBackgroundColor: labelStyle?.backgroundColor || null,
      };
    });
    if (profile.id !== 'avr') {
      assert(contrast(theme.labelColor, theme.labelBackgroundColor) >= 4.5,
        `${profile.id}: named part labels do not meet text contrast target`);
    }
    if (screenshotDirectory) {
      await page.locator(profile.root).screenshot({
        path: path.join(screenshotDirectory, `${stage}-${profile.id}-workbench.png`),
        animations: 'disabled',
      });
    }
    reports.push({ profile: profile.id, ...theme });
  }

  if (requireSharedDark) {
    const expected = reports[0];
    assert.equal(expected.backgroundColor, 'rgb(8, 20, 31)');
    for (const report of reports.slice(1)) {
      assert.deepEqual(
        { backgroundColor: report.backgroundColor, backgroundImage: report.backgroundImage,
          backgroundSize: report.backgroundSize },
        { backgroundColor: expected.backgroundColor, backgroundImage: expected.backgroundImage,
          backgroundSize: expected.backgroundSize },
        `${report.profile}: canvas theme differs from AVR`,
      );
    }
  }
  assert.deepEqual(errors, [], `browser errors: ${JSON.stringify(errors)}`);
  assert.deepEqual(external, [], `third-party requests: ${JSON.stringify(external)}`);
  await browser.close();
  process.stdout.write(`${JSON.stringify({ status: 'passed', stage, reports })}\n`);
})().catch((error) => { console.error(error); process.exit(1); });
