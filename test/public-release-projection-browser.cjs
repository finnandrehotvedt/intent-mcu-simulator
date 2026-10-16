// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.PUBLIC_PROJECTION_URL || 'http://127.0.0.1:18770';
const screenshotDirectory = process.env.PUBLIC_PROJECTION_SCREENSHOT_DIR || null;

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
    c3Hidden: document.querySelector('#c3-public-workbench')?.hidden,
    stm32Hidden: document.querySelector('#stm32-public-workbench')?.hidden,
    workspaceHidden: document.querySelector('#workbench-workspace')?.hidden,
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
  assert(!pico.returnHidden && pico.firmwareHidden && pico.runtimeHidden && pico.promptHidden && pico.starterHidden && !pico.picoHidden && pico.c3Hidden && pico.stm32Hidden, 'Pico workbench visibility');
  assert(!pico.boardDisabled && pico.projectOpenDisabled && pico.parkedHidden && pico.workspaceHidden, 'Pico parked AVR project');
  assert(pico.runtimeWorkerCreations === 0, 'Pico selection created a runtime worker');
  assert(pico.overflow <= 1, `Pico desktop overflow ${pico.overflow}`);
  reports.push({ profile: pico.profile, mode: pico.mode, overflow: pico.overflow });

  await page.locator('#board-select').selectOption('board.esp32-c3-devmodule-v1');
  await page.waitForFunction(() => window.__PUBLIC_CONTROLLER_PROJECTION__?.selectedProfile === 'board.esp32-c3-devmodule-v1');
  const c3 = await snapshot(page);
  assert(c3.selected.label === 'ESP32-C3', `C3 label ${c3.selected.label}`);
  assert(c3.selected.publicExecution === true && c3.selected.publicSupport === true, 'C3 public boundary');
  assert(c3.badge === 'Supported subset' && c3.mode === 'c3-source', 'C3 badge/mode');
  assert(!c3.buildDisabled && c3.runDisabled && !c3.primaryDisabled, 'C3 execution controls');
  assert(!c3.returnHidden && c3.firmwareHidden && c3.runtimeHidden && c3.promptHidden && c3.starterHidden && c3.picoHidden && !c3.c3Hidden && c3.stm32Hidden, 'C3 workbench visibility');
  assert(!c3.boardDisabled && c3.projectOpenDisabled && c3.parkedHidden && c3.workspaceHidden, 'C3 parked AVR project');
  assert(c3.runtimeWorkerCreations === 0, 'C3 selection created an AVR runtime worker');
  assert(c3.overflow <= 1, `C3 desktop overflow ${c3.overflow}`);
  reports.push({ profile: c3.profile, mode: c3.mode, overflow: c3.overflow });

  const stm32Profile = 'board.stm32f429zi-nucleo144-v1';
  await page.locator('#board-select').selectOption(stm32Profile);
  await page.waitForFunction((expected) => window.__PUBLIC_CONTROLLER_PROJECTION__?.selectedProfile === expected, stm32Profile);
  const stm32 = await snapshot(page);
  assert(stm32.selected.label === 'STM32F429ZI', `STM32 label ${stm32.selected.label}`);
  assert(stm32.selected.publicExecution === true && stm32.selected.publicSupport === true, 'STM32 public boundary');
  assert(stm32.badge === 'Supported subset' && stm32.mode === 'stm32-source', 'STM32 badge/mode');
  assert(!stm32.buildDisabled && stm32.runDisabled && !stm32.primaryDisabled, 'STM32 execution controls');
  assert(!stm32.returnHidden && stm32.firmwareHidden && stm32.runtimeHidden && stm32.promptHidden && stm32.starterHidden && stm32.picoHidden && stm32.c3Hidden && !stm32.stm32Hidden, 'STM32 workbench visibility');
  assert(!stm32.boardDisabled && stm32.projectOpenDisabled && stm32.parkedHidden && stm32.workspaceHidden, 'STM32 parked AVR project');
  assert(stm32.runtimeWorkerCreations === 0, 'STM32 selection created an AVR runtime worker');
  assert(stm32.overflow <= 1, `STM32 desktop overflow ${stm32.overflow}`);
  reports.push({ profile: stm32.profile, mode: stm32.mode, overflow: stm32.overflow });

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
  assert(!returned.projectOpenDisabled && returned.parkedHidden && !returned.workspaceHidden, 'AVR project controls restored');
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
