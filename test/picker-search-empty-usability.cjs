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
  { label: 'desktop', width: 1440, height: 1000, removeKey: 'Enter' },
  { label: 'mobile', width: 390, height: 844, removeKey: 'Space' },
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
    const projectBefore = JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__()));

    const search = page.locator('#catalog-search');
    await search.focus();
    await page.keyboard.type('LED');
    assert(await page.locator('.catalog-item').count() === 1, `${viewport.label}: query did not isolate LED`);
    assert(await search.evaluate((node) => document.activeElement === node), `${viewport.label}: query rerender stole search focus`);
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    assert(await page.locator('.catalog-item').count() === 5, `${viewport.label}: clearing query did not restore catalogue`);
    assert(await search.evaluate((node) => document.activeElement === node), `${viewport.label}: clearing query stole search focus`);

    const category = page.locator('#catalog-category');
    await category.focus();
    await category.selectOption('inputs');
    assert(await page.locator('.catalog-item').count() === 2, `${viewport.label}: category did not isolate inputs`);
    assert(await category.evaluate((node) => document.activeElement === node), `${viewport.label}: category rerender stole select focus`);
    await category.selectOption('all');

    const ledFavourite = page.locator('.catalog-item[data-type="led.basic-v1"] .catalog-favourite');
    await ledFavourite.focus();
    await ledFavourite.press('Enter');
    assert((await page.evaluate(() => window.__M7_CATALOG__())).preferences.favorites.includes('led.basic-v1'),
      `${viewport.label}: keyboard favourite was not stored`);
    assert(await page.locator('.catalog-item[data-type="led.basic-v1"] .catalog-favourite').evaluate((node) => document.activeElement === node),
      `${viewport.label}: keyboard favourite did not retain focus`);

    const favouritesOnly = page.locator('#catalog-favorites');
    await favouritesOnly.focus();
    await favouritesOnly.press('Space');
    assert(await favouritesOnly.isChecked(), `${viewport.label}: favourites-only keyboard toggle failed`);
    assert(await page.locator('.catalog-item').count() === 1, `${viewport.label}: favourites-only did not isolate the favourite`);

    const removeFavourite = page.locator('.catalog-item[data-type="led.basic-v1"] .catalog-favourite');
    await removeFavourite.focus();
    await removeFavourite.press(viewport.removeKey);
    await page.waitForTimeout(100);
    const empty = await page.evaluate(() => ({
      rows: document.querySelectorAll('.catalog-item').length,
      emptyVisible: !document.querySelector('#catalog-empty').hidden,
      emptyText: document.querySelector('#catalog-empty').textContent,
      count: document.querySelector('#catalog-count').textContent,
      countLive: document.querySelector('#catalog-count').getAttribute('aria-live'),
      page: document.querySelector('#catalog-page').textContent,
      pageLive: document.querySelector('#catalog-page').getAttribute('aria-live'),
      activeId: document.activeElement?.id ?? '',
      focusVisible: document.activeElement?.matches(':focus-visible') ?? false,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    assert(empty.rows === 0 && empty.emptyVisible, `${viewport.label}: removing the only favourite did not expose empty results`);
    assert(empty.count === '0 parts' && empty.countLive === 'polite', `${viewport.label}: empty count is not announced accessibly`);
    assert(empty.page === 'No results' && empty.pageLive === 'polite', `${viewport.label}: empty page state is not announced accessibly`);
    assert(empty.emptyText.includes('Clear the filters'), `${viewport.label}: empty guidance is not actionable`);
    assert(empty.activeId === 'catalog-clear' && empty.focusVisible, `${viewport.label}: empty favourites result lost keyboard focus`);
    assert(empty.overflow <= 1, `${viewport.label}: empty state introduced horizontal overflow`);
    if (process.env.PICKER_EMPTY_SCREENSHOT && viewport.label === 'mobile') {
      fs.mkdirSync(path.dirname(process.env.PICKER_EMPTY_SCREENSHOT), { recursive: true });
      await page.screenshot({ path: process.env.PICKER_EMPTY_SCREENSHOT, fullPage: false });
    }

    await page.locator('#catalog-clear').press('Enter');
    assert(await page.locator('.catalog-item').count() === 5, `${viewport.label}: clear action did not restore catalogue`);
    assert(await search.evaluate((node) => document.activeElement === node), `${viewport.label}: clear action did not restore search focus`);
    assert(JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__())) === projectBefore,
      `${viewport.label}: filter/favourite journey changed project identity`);
    assert(mutations.length === 0, `${viewport.label}: filter journey made server mutation request: ${mutations.join(', ')}`);
    results.push({ label: viewport.label, removeKey: viewport.removeKey, emptyFocus: empty.activeId, restoredRows: 5 });
    await context.close();
  }
  console.log(JSON.stringify({ browser: browserName, result: 'pass', viewports: results, serverProjectWrites: 0 }));
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
