// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.ARTWORK_LAYOUT_URL || 'http://127.0.0.1:18932';
const profiles = [
  ['board.atmega328p-16mhz-v1', 'avr', 5],
  ['board.rp2040-pico-v1', 'pico', 7],
  ['board.esp32-c3-devmodule-v1', 'esp32-c3', 7],
  ['board.stm32f429zi-nucleo144-v1', 'stm32', 7],
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1905, height: 1000 } });
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__);
    if (process.env.ARTWORK_SCREENSHOT_DIR) await fs.mkdir(process.env.ARTWORK_SCREENSHOT_DIR, { recursive: true });
    for (const [profile, slug, expectedCards] of profiles) {
      await page.selectOption('#board-select', profile);
      await page.waitForFunction(({ expected, expectedCards }) => document.querySelector('#board-select').value === expected
        && document.querySelectorAll('#simple-parts-mount .catalog-item, #simple-parts-mount .bounded-part-card').length === expectedCards,
      { expected: profile, expectedCards });
      const wide = await page.evaluate(() => {
        const shell = document.querySelector('#top-workbench-shell');
        const cards = [...document.querySelectorAll('#simple-parts-mount .catalog-item, #simple-parts-mount .bounded-part-card')];
        return {
          cards: cards.length,
          artwork: cards.filter((card) => card.querySelector('svg[role="img"]')).length,
          shellContained: shell.scrollWidth <= shell.clientWidth,
          resistorBands: document.querySelectorAll('#simple-parts-mount [data-type="resistor.fixed-v1"] [data-resistor-band]').length,
          resistorValue: document.querySelector('#simple-parts-mount [data-component-identity="resistance"]')?.textContent,
          ledAnode: document.querySelector('#simple-parts-mount [data-component-identity="led-anode"]')?.textContent,
          ledCathode: document.querySelector('#simple-parts-mount [data-component-identity="led-cathode"]')?.textContent,
          buttonMark: document.querySelector('#simple-parts-mount [data-component-identity="momentary-push"]')?.textContent,
        };
      });
      assert.deepEqual(wide, { cards: expectedCards, artwork: expectedCards, shellContained: true, resistorBands: 4,
        resistorValue: '220 Ω', ledAnode: 'A +', ledCathode: 'K −', buttonMark: 'PUSH' });
      if (process.env.ARTWORK_SCREENSHOT_DIR) {
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          document.querySelector('#top-workbench-shell').scrollTo(0, 0);
          document.querySelector('#simple-parts-drawer').scrollTo(0, 0);
        });
        await page.locator('#top-workbench-shell').screenshot({
          path: path.join(process.env.ARTWORK_SCREENSHOT_DIR, `${slug}-1905.png`),
        });
      }
      await page.setViewportSize({ width: 511, height: 770 });
      const narrow = await page.evaluate((expectedCards) => {
        const shell = document.querySelector('#top-workbench-shell');
        const stage = document.querySelector('#active-canvas-stage');
        const drawer = document.querySelector('#simple-parts-drawer');
        const footer = drawer.querySelector(':scope > footer');
        const support = drawer.querySelector(':scope > p');
        const serialTab = document.querySelector('#serial-tab');
        const canvas = document.querySelector('#active-canvas-mount');
        const cards = [...document.querySelectorAll('#simple-parts-mount .catalog-item, #simple-parts-mount .bounded-part-card')];
        const graphics = [...document.querySelectorAll('#simple-parts-mount svg[role="img"]')];
        const box = (node) => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
        };
        const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const cardBoxes = cards.map(box);
        const footerBox = box(footer);
        const supportBox = box(support);
        const canvasBox = box(canvas);
        const serialBox = box(serialTab);
        return {
          stageWidth: stage.getBoundingClientRect().width,
          containedScroll: shell.scrollWidth > shell.clientWidth,
          documentContained: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          artworkVisible: graphics.length === expectedCards
            && graphics.every((svg) => svg.getBoundingClientRect().width >= 40
              && svg.getBoundingClientRect().height >= 16),
          catalogueUsable: cards.length === expectedCards
            && cardBoxes.every((rect) => rect.width >= 230 && rect.height >= 54)
            && cardBoxes.every((rect, index) => index === 0 || rect.top >= cardBoxes[index - 1].bottom)
            && cardBoxes.every((rect) => !overlaps(rect, footerBox) && !overlaps(rect, supportBox))
            && footerBox.bottom <= supportBox.top,
          controlsUsable: [...footer.querySelectorAll('button')].every((button) => {
            const rect = box(button);
            return rect.width >= 70 && rect.height >= 30;
          }),
          serialClearOfCanvas: getComputedStyle(serialTab).display === 'none'
            || !overlaps(serialBox, canvasBox),
        };
      }, expectedCards);
      assert.deepEqual(narrow,
        { stageWidth: 980, containedScroll: true, documentContained: true, artworkVisible: true,
          catalogueUsable: true, controlsUsable: true, serialClearOfCanvas: true });
      if (process.env.ARTWORK_SCREENSHOT_DIR) {
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          document.querySelector('#top-workbench-shell').scrollTo(0, 0);
          document.querySelector('#simple-parts-drawer').scrollTo(0, 0);
        });
        await page.locator('#top-workbench-shell').screenshot({
          path: path.join(process.env.ARTWORK_SCREENSHOT_DIR, `${slug}-511.png`),
        });
      }
      await page.setViewportSize({ width: 1905, height: 1000 });
    }
    process.stdout.write(JSON.stringify({ result: 'pass', profiles: profiles.length,
      widths: [511, 1905], cardsPerProfile: [5, 7, 7, 7], originalArtwork: true,
      narrowMode: 'contained-desktop-scroll' }) + '\n');
  } finally {
    await browser.close();
  }
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
