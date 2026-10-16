// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.PUBLIC_PROJECTION_URL || 'http://127.0.0.1:18770';
const screenshotDirectory = process.env.PUBLIC_PROJECTION_SCREENSHOT_DIR || null;
const previewProfiles = [
  ['board.esp32-c3-devmodule-v1', 'ESP32-C3', 'c3-preview'],
  ['board.stm32f429zi-nucleo144-v1', 'STM32F429ZI', 'stm32-preview'],
];

function assert(value, message) { if (!value) throw new Error(message); }

async function snapshot(page) {
  return page.evaluate(() => ({
    profile: window.__PUBLIC_CONTROLLER_PROJECTION__?.selectedProfile,
    selected: structuredClone(window.__PUBLIC_CONTROLLER_PROJECTION__?.selected),
    runtimeWorkerCreations: window.__M6_STATE__?.runtimeWorkerCreations,
    badge: document.querySelector('#controller-workbench-badge')?.textContent.trim(),
    mode: document.querySelector('#controller-workbench')?.dataset.mode,
    buildDisabled: document.querySelector('#quick-build')?.disabled,
    runDisabled: document.querySelector('#quick-run')?.disabled,
    primaryDisabled: document.querySelector('#controller-primary-action')?.disabled,
    returnHidden: document.querySelector('#controller-return-avr')?.hidden,
    firmwareHidden: document.querySelector('#firmware-drawer')?.hidden,
    runtimeHidden: document.querySelector('#runtime-drawer')?.hidden,
    promptHidden: document.querySelector('#prompt-drawer')?.hidden,
    starterHidden: document.querySelector('#starter-gallery')?.hidden,
    picoHidden: document.querySelector('#pico-public-workbench')?.hidden,
    boardDisabled: document.querySelector('#board-select')?.disabled,
    projectOpenDisabled: document.querySelector('#project-open')?.disabled,
    parkedHidden: document.querySelector('#parked-circuit-notice')?.hidden,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const externalRequests = [];
  const privateOrPreviewRequests = [];
  const consoleErrors = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) externalRequests.push(request.url());
    if (/private-c3|esp32|stm32/i.test(`${url.pathname}${url.search}`)) privateOrPreviewRequests.push(request.url());
  });
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  const response = await page.goto(base, { waitUntil: 'networkidle' });
  assert(response && response.status() === 200, 'root did not load');
  await page.waitForFunction(() => window.__M11_READY__ === true && window.__PUBLIC_CONTROLLER_PROJECTION__?.views?.length === 4);
  const initial = await snapshot(page);
  assert(initial.profile === 'board.atmega328p-16mhz-v1', `initial profile ${initial.profile}`);
  assert(initial.selected.publicExecution === true && initial.badge === 'Supported', 'AVR support state');
  assert(initial.buildDisabled === false && initial.primaryDisabled === false, 'AVR Build controls');
  assert(initial.firmwareHidden === false && initial.runtimeHidden === false && initial.starterHidden === false, 'AVR workbench visible');
  assert(initial.overflow <= 1, `desktop initial overflow ${initial.overflow}`);

  const reports = [];
  await page.locator('#board-select').selectOption('board.rp2040-pico-v1');
  await page.waitForFunction(() => window.__PUBLIC_CONTROLLER_PROJECTION__?.selectedProfile === 'board.rp2040-pico-v1');
  const pico = await snapshot(page);
  assert(pico.selected.label === 'RP2040 Pico', `Pico label ${pico.selected.label}`);
  assert(pico.selected.publicExecution === true && pico.selected.publicSupport === true, 'Pico public boundary');
  assert(pico.badge === 'Supported subset' && pico.mode === 'rp2040-source', 'Pico badge/mode');
  assert(!pico.buildDisabled && pico.runDisabled && !pico.primaryDisabled, 'Pico execution controls');
  assert(!pico.returnHidden && pico.firmwareHidden && pico.runtimeHidden && pico.promptHidden && pico.starterHidden && !pico.picoHidden, 'Pico workbench visibility');
  assert(!pico.boardDisabled && pico.projectOpenDisabled && !pico.parkedHidden, 'Pico parked AVR project');
  assert(pico.runtimeWorkerCreations === 0, 'Pico selection created a runtime worker');
  assert(pico.overflow <= 1, `Pico desktop overflow ${pico.overflow}`);
  reports.push({ profile: pico.profile, mode: pico.mode, overflow: pico.overflow });

  for (const [profile, label, mode] of previewProfiles) {
    await page.locator('#board-select').selectOption(profile);
    await page.waitForFunction((expected) => window.__PUBLIC_CONTROLLER_PROJECTION__?.selectedProfile === expected, profile);
    const current = await snapshot(page);
    assert(current.selected.label === label, `${profile} label ${current.selected.label}`);
    assert(current.selected.publicExecution === false && current.selected.publicSupport === false, `${profile} public boundary`);
    assert(current.badge === 'Preview only' && current.mode === mode, `${profile} preview badge/mode`);
    assert(current.buildDisabled && current.runDisabled && current.primaryDisabled, `${profile} execution controls`);
    assert(!current.returnHidden && current.firmwareHidden && current.runtimeHidden && current.promptHidden && current.starterHidden, `${profile} preview visibility`);
    assert(!current.boardDisabled && current.projectOpenDisabled && !current.parkedHidden, `${profile} parked project controls`);
    assert(current.runtimeWorkerCreations === 0, `${profile} created a runtime worker`);
    assert(current.overflow <= 1, `${profile} desktop overflow ${current.overflow}`);
    reports.push({ profile, mode, overflow: current.overflow });
  }

  await page.locator('#board-select').selectOption('board.esp32-c3-devmodule-v1');
  if (screenshotDirectory) {
    fs.mkdirSync(screenshotDirectory, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDirectory, 'public-projection-desktop-c3-preview.png'), fullPage: true, animations: 'disabled' });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await snapshot(page);
  assert(mobile.overflow <= 1, `mobile preview overflow ${mobile.overflow}`);
  if (screenshotDirectory) await page.screenshot({ path: path.join(screenshotDirectory, 'public-projection-mobile-c3-preview.png'), fullPage: true, animations: 'disabled' });

  await page.click('#controller-return-avr');
  await page.waitForFunction(() => window.__PUBLIC_CONTROLLER_PROJECTION__?.selectedProfile === 'board.atmega328p-16mhz-v1');
  const returned = await snapshot(page);
  assert(returned.selected.publicExecution === true && returned.badge === 'Supported', 'return to AVR state');
  assert(!returned.buildDisabled && !returned.primaryDisabled, 'AVR controls restored');
  assert(!returned.firmwareHidden && !returned.runtimeHidden && !returned.promptHidden && !returned.starterHidden, 'AVR regions restored');
  assert(!returned.projectOpenDisabled && returned.parkedHidden, 'AVR project controls restored');
  assert(returned.overflow <= 1, `mobile AVR overflow ${returned.overflow}`);

  const privateRoute = await context.request.get(`${base}/private-c3/session`);
  assert(privateRoute.status() === 404, `private C3 route exposed: ${privateRoute.status()}`);
  assert(privateOrPreviewRequests.length === 0, `profile selection made private requests: ${privateOrPreviewRequests.join(', ')}`);
  assert(externalRequests.length === 0, `third-party page requests: ${externalRequests.join(', ')}`);
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`);

  await browser.close();
  process.stdout.write(`${JSON.stringify({ status: 'pass', initial, reports, mobile, returned, screenshots: screenshotDirectory })}\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
