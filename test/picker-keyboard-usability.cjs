// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('fs');
const path = require('path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium, firefox, webkit } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.M3_STAGING_URL || 'http://127.0.0.1:18768';
const browserName = process.env.M6_BROWSER || 'chromium';
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unsupported browser: ${browserName}`);

function assert(condition, message) { if (!condition) throw new Error(message); }

const viewports = [
  { label: 'desktop', width: 1440, height: 1000, key: 'Enter' },
  { label: 'mobile', width: 390, height: 844, key: 'Space' },
];

let browser;
(async () => {
  browser = await browserType.launch({ headless: true });
  const results = [];
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const mutations = [];
    page.on('request', (request) => {
      if (!['GET', 'HEAD'].includes(request.method())) mutations.push(`${request.method()} ${request.url()}`);
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);

    const starter = page.locator('.starter-card[data-example="button"]');
    await starter.focus();
    assert(await starter.evaluate((node) => node.matches(':focus-visible')), `${viewport.label}: starter card has no keyboard focus indicator`);
    await starter.press('Enter');
    await page.waitForFunction(() => window.__M6_STATE__.lastAction === 'BUTTON_EXAMPLE_LOADED');
    assert((await page.evaluate(() => window.__M6_PROJECT__().circuit.components.length)) === 2,
      `${viewport.label}: starter keyboard activation did not load the validated Button graph`);

    await page.click('#project-new');
    await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.length === 0);
    const row = page.locator('.catalog-item').first();
    const type = await row.getAttribute('data-type');
    const favourite = row.locator('.catalog-favourite');
    await favourite.focus();
    assert(await favourite.evaluate((node) => document.activeElement === node), `${viewport.label}: favourite could not receive keyboard focus`);
    await favourite.press(viewport.key);
    await page.waitForTimeout(100);

    const state = await page.evaluate((selectedType) => ({
      componentCount: window.__M6_PROJECT__().circuit.components.length,
      favourite: window.__M7_CATALOG__().preferences.favorites.includes(selectedType),
      focusedType: document.activeElement?.closest('.catalog-item')?.dataset.type ?? null,
      focusedControl: document.activeElement?.classList.contains('catalog-favourite') ?? false,
      focusedLabel: document.activeElement?.getAttribute('aria-label') ?? '',
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }), type);
    assert(state.componentCount === 0, `${viewport.label}: favourite keyboard action also added a component`);
    assert(state.favourite, `${viewport.label}: favourite keyboard action was lost`);
    assert(state.focusedControl && state.focusedType === type, `${viewport.label}: favourite keyboard focus was lost after rerender`);
    assert(state.focusedLabel.startsWith('Remove '), `${viewport.label}: favourite accessible state did not update`);
    assert(state.overflow <= 1, `${viewport.label}: usability path introduced horizontal overflow`);
    assert(mutations.length === 0, `${viewport.label}: usability path made server mutation request: ${mutations.join(', ')}`);
    if (process.env.PICKER_SCREENSHOT && viewport.label === 'mobile') {
      fs.mkdirSync(path.dirname(process.env.PICKER_SCREENSHOT), { recursive: true });
      await page.screenshot({ path: process.env.PICKER_SCREENSHOT, fullPage: false });
    }
    const refreshedRow = page.locator(`.catalog-item[data-type="${type}"]`);
    await refreshedRow.focus();
    await refreshedRow.press('Enter');
    await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.length === 1);
    results.push({
      label: viewport.label,
      key: viewport.key,
      type,
      componentCountAfterFavourite: state.componentCount,
      componentCountAfterRow: await page.evaluate(() => window.__M6_PROJECT__().circuit.components.length),
    });
    await context.close();
  }
  console.log(JSON.stringify({ browser: browserName, result: 'pass', viewports: results, serverProjectWrites: 0 }));
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
