// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.ROTATED_LABEL_URL || 'http://127.0.0.1:4174';
const screenshotDirectory = process.env.ROTATED_LABEL_SCREENSHOT_DIR || null;
const profiles = [
  { id: 'pico', option: 'board.rp2040-pico-v1', global: '__RP2040_PUBLIC_WORKBENCH__', save: '#pico-save', open: '#pico-open-input', root: '#pico-public-workbench', components: '#pico-editor-components' },
  { id: 'c3', option: 'board.esp32-c3-devmodule-v1', global: '__ESP32C3_PUBLIC_WORKBENCH__', save: '#c3-save', open: '#c3-open-input', root: '#c3-public-workbench', components: '#c3-editor-components' },
  { id: 'stm32', option: 'board.stm32f429zi-nucleo144-v1', global: '__STM32_PUBLIC_WORKBENCH__', save: '#stm32-save', open: '#stm32-open-input', root: '#stm32-public-workbench', components: '#stm32-editor-components' },
];

function intersects(left, right, inset = 1) {
  return left.left < right.right - inset && left.right > right.left + inset
    && left.top < right.bottom - inset && left.bottom > right.top + inset;
}

async function rotation(page, profile) {
  return page.evaluate(({ global }) => {
    const state = window[global].state();
    const circuit = state.circuit ?? state.project.circuit;
    return circuit.layout.positions['resistor-1'].rotation;
  }, profile);
}

async function setRotation(page, profile, expected) {
  for (let count = 0; count < 4 && await rotation(page, profile) !== expected; count += 1) {
    const result = await page.evaluate(({ global }) => window[global].rotateCircuitComponent('resistor-1'), profile);
    assert.equal(result.ok, true, `${profile.id}: rotate failed ${JSON.stringify(result)}`);
  }
  assert.equal(await rotation(page, profile), expected, `${profile.id}: rotation ${expected}`);
}

async function geometry(page, profile) {
  return page.evaluate(({ components }) => {
    const root = document.querySelector(components);
    const resistor = root.querySelector('[data-component-id="resistor-1"]');
    const labels = [...resistor.querySelectorAll('.pico-editor-pin-label, .pico-editor-part-label')]
      .map((node) => ({ text: node.textContent, kind: node.className, rect: node.getBoundingClientRect().toJSON(),
        endpoint: node.closest('[data-editor-endpoint]')?.dataset.editorEndpoint ?? null }));
    const anchors = Object.fromEntries([...resistor.querySelectorAll('[data-editor-endpoint]')]
      .map((node) => [node.dataset.editorEndpoint, node.getBoundingClientRect().toJSON()]));
    const bodies = [...root.querySelectorAll('.pico-editor-part')]
      .map((node) => ({ id: node.dataset.componentId, rect: node.getBoundingClientRect().toJSON() }));
    return { rotation: Number(resistor.dataset.rotation), labels, anchors, bodies,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  }, profile);
}

function assertGeometry(profile, viewport, report) {
  assert.equal(report.overflow <= 1, true, `${profile.id}/${viewport}: horizontal overflow`);
  report.labels.forEach((label, index) => {
    assert(label.text.trim() && label.rect.width > 4 && label.rect.height > 4,
      `${profile.id}/${viewport}/${report.rotation}: unreadable label ${label.text}`);
    for (const other of report.labels.slice(index + 1)) {
      assert.equal(intersects(label.rect, other.rect), false,
        `${profile.id}/${viewport}/${report.rotation}: label overlap ${label.text}/${other.text} ${JSON.stringify([label.rect, other.rect])}`);
    }
    if (label.endpoint) {
      const anchor = report.anchors[label.endpoint];
      const x = anchor.left + anchor.width / 2; const y = anchor.top + anchor.height / 2;
      const dx = Math.max(label.rect.left - x, 0, x - label.rect.right);
      const dy = Math.max(label.rect.top - y, 0, y - label.rect.bottom);
      assert(Math.hypot(dx, dy) <= 42,
        `${profile.id}/${viewport}/${report.rotation}: ${label.text} is not adjacent to its terminal`);
    }
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  const reports = [];
  for (const profile of profiles) {
    await page.selectOption('#board-select', profile.option);
    await page.waitForSelector(`${profile.root}:not([hidden])`);
    await setRotation(page, profile, 90);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click(profile.save)]);
    const filePath = await download.path();
    assert(filePath && fs.statSync(filePath).size > 500, `${profile.id}: Save did not download`);
    await page.setInputFiles(profile.open, filePath);
    await page.waitForFunction(({ global }) => window[global].state().runnable === false, profile);
    assert.equal(await rotation(page, profile), 90, `${profile.id}: reopened rotation changed`);
    for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      for (const expected of [0, 90, 180, 270]) {
        await setRotation(page, profile, expected);
        const report = await geometry(page, profile);
        assertGeometry(profile, viewport.name, report);
        reports.push({ profile: profile.id, viewport: viewport.name, rotation: expected });
      }
      await setRotation(page, profile, 90);
      await page.click(`#${profile.id}-fullscreen`);
      await page.waitForFunction(({ root }) => document.fullscreenElement
        || document.querySelector(root).classList.contains('shared-canvas-focus'), profile);
      await page.click(`#${profile.id}-fit`);
      assertGeometry(profile, `${viewport.name}-fullscreen`, await geometry(page, profile));
      reports.push({ profile: profile.id, viewport: `${viewport.name}-fullscreen`, rotation: 90 });
      if (await page.evaluate(() => Boolean(document.fullscreenElement))) await page.click(`#${profile.id}-fullscreen`);
      else await page.keyboard.press('Escape');
      await page.waitForFunction(({ root }) => !document.fullscreenElement
        && !document.querySelector(root).classList.contains('shared-canvas-focus'), profile);
      if (screenshotDirectory && (profile.id === 'c3' || profile.id === 'stm32')) {
        await setRotation(page, profile, 90);
        fs.mkdirSync(screenshotDirectory, { recursive: true });
        await page.locator(profile.root).screenshot({ path: path.join(screenshotDirectory, `${profile.id}-${viewport.name}-rotation-90.png`) });
      }
    }
  }
  assert.equal((await context.cookies()).length, 0, 'file/geometry flow set cookies');
  console.log(JSON.stringify({ status: 'pass', reports: reports.length, profiles: profiles.map((item) => item.id),
    rotations: [0, 90, 180, 270], desktopMobile: true, savedReopened: true,
    labelsAdjacentOwnTerminals: true, labelsNonOverlapping: true }));
  await browser.close();
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
