// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.SHARED_FULLSCREEN_URL || 'http://127.0.0.1:4173';
const profiles = [
  { id: 'board.rp2040-pico-v1', prefix: 'pico', root: '#pico-public-workbench', global: '__RP2040_PUBLIC_WORKBENCH__', endpoint: 'data-pico-endpoint' },
  { id: 'board.esp32-c3-devmodule-v1', prefix: 'c3', root: '#c3-public-workbench', global: '__ESP32C3_PUBLIC_WORKBENCH__', endpoint: 'data-c3-endpoint' },
  { id: 'board.stm32f429zi-nucleo144-v1', prefix: 'stm32', root: '#stm32-public-workbench', global: '__STM32_PUBLIC_WORKBENCH__', endpoint: 'data-stm32-endpoint' },
];

async function geometry(page, profile) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(
    () => requestAnimationFrame(() => requestAnimationFrame(resolve)),
  ))));
  return page.evaluate((profile) => {
    const diagram = document.querySelector(`#${profile.prefix}-diagram`);
    const canvas = diagram.getBoundingClientRect();
    const state = window[profile.global].state();
    const project = state.project ?? state;
    const circuit = project.circuit;
    const anchors = Object.fromEntries([...document.querySelectorAll(`[${profile.endpoint}]`)].map((node) => {
      const key = node.getAttribute(profile.endpoint);
      const pin = key.slice(key.lastIndexOf('.') + 1);
      const terminal = node.closest('.pico-editor-part').querySelector(`[data-terminal-pin="${pin}"]`).getBoundingClientRect();
      return [key, { x: terminal.left - canvas.left + terminal.width / 2, y: terminal.top - canvas.top + terminal.height / 2 }];
    }));
    const bodies = [...document.querySelectorAll(`#${profile.prefix}-editor-components .pico-editor-part`)].map((node) => {
      const box = node.getBoundingClientRect();
      return { id: node.dataset.componentId, left: box.left - canvas.left, right: box.right - canvas.left,
        top: box.top - canvas.top, bottom: box.bottom - canvas.top };
    });
    const routes = [...document.querySelectorAll(`#${profile.prefix}-editor-wires .pico-editor-wire`)].map((node) => {
      const points = JSON.parse(node.dataset.points);
      const net = circuit.nets.find((candidate) => candidate.id === node.dataset.net);
      const attached = net.endpoints.every((item) => points.some((point) => {
        const anchor = anchors[`${item.component}.${item.pin}`];
        return Math.hypot(point.x - anchor.x, point.y - anchor.y) < 1;
      }));
      const crossesBody = points.slice(1).some((end, index) => {
        const start = points[index];
        return bodies.some((body) => {
          const escape = index === 0 && body.id === net.endpoints[0].component
            || index === points.length - 2 && body.id === net.endpoints[1].component;
          if (escape) return false;
          if (Math.abs(start.y - end.y) < .5) return start.y > body.top && start.y < body.bottom
            && Math.max(start.x, end.x) > body.left && Math.min(start.x, end.x) < body.right;
          if (Math.abs(start.x - end.x) < .5) return start.x > body.left && start.x < body.right
            && Math.max(start.y, end.y) > body.top && Math.min(start.y, end.y) < body.bottom;
          return true;
        });
      });
      return { id: net.id, points, attached, crossesBody };
    });
    let overlaps = 0;
    for (let i = 0; i < routes.length; i += 1) for (let j = i + 1; j < routes.length; j += 1) {
      for (let a = 1; a < routes[i].points.length; a += 1) for (let b = 1; b < routes[j].points.length; b += 1) {
        const p = routes[i].points[a - 1]; const q = routes[i].points[a];
        const r = routes[j].points[b - 1]; const s = routes[j].points[b];
        if (p.y === q.y && r.y === s.y && p.y === r.y
          && Math.min(Math.max(p.x, q.x), Math.max(r.x, s.x)) - Math.max(Math.min(p.x, q.x), Math.min(r.x, s.x)) > .5) overlaps += 1;
        if (p.x === q.x && r.x === s.x && p.x === r.x
          && Math.min(Math.max(p.y, q.y), Math.max(r.y, s.y)) - Math.max(Math.min(p.y, q.y), Math.min(r.y, s.y)) > .5) overlaps += 1;
      }
    }
    const labels = [...document.querySelectorAll(`#${profile.prefix}-editor-components .pico-editor-pin-label`)]
      .filter((node) => node.offsetParent).map((node) => ({ text: node.textContent, rect: node.getBoundingClientRect() }));
    let labelOverlaps = 0;
    const labelPairs = [];
    for (let i = 0; i < labels.length; i += 1) for (let j = i + 1; j < labels.length; j += 1) {
      if (Math.min(labels[i].rect.right, labels[j].rect.right) > Math.max(labels[i].rect.left, labels[j].rect.left)
        && Math.min(labels[i].rect.bottom, labels[j].rect.bottom) > Math.max(labels[i].rect.top, labels[j].rect.top)) {
        labelOverlaps += 1; labelPairs.push([labels[i].text, labels[j].text]);
      }
    }
    return { attached: routes.every((route) => route.attached), bodyClear: routes.every((route) => !route.crossesBody),
      overlaps, labelOverlaps, labelPairs,
      labelDetails: labels.map((label) => ({ text: label.text, x: label.rect.x, y: label.rect.y, width: label.rect.width, height: label.rect.height })),
      overflow: document.documentElement.scrollWidth - innerWidth,
      blockedRoutes: routes.filter((route) => route.crossesBody).map((route) => ({ id: route.id, points: route.points })), bodies };
  }, profile);
}

let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  for (const [index, profile] of profiles.entries()) {
    await page.selectOption('#board-select', profile.id);
    await page.waitForFunction((key) => window[key]?.state().active === true, profile.global);
    const before = await page.evaluate((key) => window[key].state(), profile.global);
    const partsVisible = await page.locator(`${profile.root} [data-shared-surface="parts"]`).isVisible();
    const inspectorVisible = await page.locator(`${profile.root} [data-shared-surface="inspector"]`).isVisible();
    assert(partsVisible && inspectorVisible, `${profile.id}: side panels absent before fullscreen`);
    if (index === 2) await page.evaluate(() => { document.querySelector('#stm32-public-workbench [data-shared-surface="canvas"]').requestFullscreen = undefined; });
    await page.click(`#${profile.prefix}-fullscreen`);
    await page.waitForFunction(({ root, prefix }) => document.fullscreenElement
      || document.querySelector(root).classList.contains('shared-canvas-focus'), profile);
    await page.waitForFunction((prefix) => document.querySelector(`#${prefix}-fullscreen`).textContent === 'Exit fullscreen', profile.prefix);
    await page.setViewportSize({ width: 1265, height: 760 });
    await page.click(`#${profile.prefix}-zoom-in`);
    await page.click(`#${profile.prefix}-fit`);
    const expanded = await geometry(page, profile);
    assert(expanded.attached && expanded.bodyClear && expanded.overlaps === 0 && expanded.labelOverlaps === 0 && expanded.overflow <= 1,
      `${profile.id}: fullscreen geometry ${JSON.stringify(expanded)}`);
    if (await page.evaluate(() => Boolean(document.fullscreenElement))) await page.click(`#${profile.prefix}-fullscreen`);
    else await page.keyboard.press('Escape');
    await page.waitForFunction(({ root }) => !document.fullscreenElement
      && !document.querySelector(root).classList.contains('shared-canvas-focus'), profile);
    await page.waitForFunction((prefix) => document.querySelector(`#${prefix}-fullscreen`).textContent === 'Fullscreen', profile.prefix);
    const after = await page.evaluate((key) => window[key].state(), profile.global);
    assert.deepEqual(after.project ?? { source: after.source, circuit: after.circuit },
      before.project ?? { source: before.source, circuit: before.circuit }, `${profile.id}: authored data changed`);
    assert.equal(after.artifact, null, `${profile.id}: fullscreen revived executable authority`);
    assert(await page.locator(`${profile.root} [data-shared-surface="parts"]`).isVisible(), `${profile.id}: Parts not restored`);
    assert(await page.locator(`${profile.root} [data-shared-surface="inspector"]`).isVisible(), `${profile.id}: Inspector not restored`);
    const restored = await geometry(page, profile);
    assert(restored.attached && restored.bodyClear && restored.overlaps === 0 && restored.labelOverlaps === 0,
      `${profile.id}: exit geometry ${JSON.stringify(restored)}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click(`#${profile.prefix}-fullscreen`);
    await page.waitForFunction(({ root }) => document.fullscreenElement
      || document.querySelector(root).classList.contains('shared-canvas-focus'), profile);
    await page.click(`#${profile.prefix}-fit`);
    const mobile = await geometry(page, profile);
    assert(mobile.attached && mobile.bodyClear && mobile.overlaps === 0 && mobile.labelOverlaps === 0 && mobile.overflow <= 1,
      `${profile.id}: mobile fullscreen geometry ${JSON.stringify(mobile)}`);
    if (await page.evaluate(() => Boolean(document.fullscreenElement))) await page.click(`#${profile.prefix}-fullscreen`);
    else await page.keyboard.press('Escape');
    await page.waitForFunction(({ root }) => !document.fullscreenElement
      && !document.querySelector(root).classList.contains('shared-canvas-focus'), profile);
    const mobileRestored = await geometry(page, profile);
    assert(mobileRestored.attached && mobileRestored.bodyClear && mobileRestored.overlaps === 0
      && mobileRestored.labelOverlaps === 0 && mobileRestored.overflow <= 1,
    `${profile.id}: mobile exit geometry ${JSON.stringify(mobileRestored)}`);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  console.log(JSON.stringify({ result: 'pass', profiles: 3, nativeAndFallback: true, escapeExit: true,
    fitZoom: true, panelRestore: true, authoredDataStable: true, staleAuthority: false, wireLane: 'WIRE-LANE-01' }));
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); });
