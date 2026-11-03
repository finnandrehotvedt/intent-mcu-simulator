// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules',
  'playwright',
));

const base = process.env.FIRMWARE_ACCEPTANCE_URL || 'http://127.0.0.1:18999';

async function discardUnsaved(page) {
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
    await page.click('#unsaved-discard');
  }
}

async function loadStarter(page, starterId, componentId) {
  await page.click('#workbench-view-simple');
  await page.click('#beginner-examples');
  await page.click(`.starter-card[data-example="${starterId}"] .starter-action`);
  await discardUnsaved(page);
  await page.waitForFunction((id) => window.__M6_PROJECT__()?.candidateCircuit?.components
    ?.some((item) => item.id === id), componentId);
  await page.click('#workbench-view-advanced');
  if (await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) {
    await page.click('#workbench-project-dialog .workbench-popup-close');
  }
}

async function buildRun(page) {
  await page.click('#quick-build');
  await page.waitForFunction(() => ['succeeded', 'failed'].includes(window.__M6_STATE__.buildState));
  const build = await page.evaluate(() => ({
    state: window.__M6_STATE__.buildState,
    log: document.querySelector('#build-log').textContent,
    diagnostics: document.querySelector('#diagnostics').textContent,
    technical: document.querySelector('#technical-error-detail').textContent,
  }));
  assert.equal(build.state, 'succeeded', JSON.stringify(build));
  const identity = await page.evaluate(() => {
    const source = window.__M6_PROJECT__().project.source.files
      .map((fileEntry) => fileEntry.content).join('\n');
    return {
      artifact: window.__M6_STATE__.artifactIdentity,
      input: window.__M6_STATE__.inputIdentity,
      source,
      sourceSha256: null,
    };
  });
  identity.sourceSha256 = crypto.createHash('sha256').update(identity.source).digest('hex');
  assert.match(identity.source, /analogRead\((?:A1|TEMP_PIN)\)/u);
  await page.click('#quick-run');
  await page.waitForFunction(() => !document.querySelector('#speed').disabled);
  await page.evaluate(() => {
    const speed = document.querySelector('#speed');
    speed.value = '0.1';
    speed.dispatchEvent(new Event('change', { bubbles: true }));
  });
  if (!(await page.locator('#workbench-instruments-dialog').evaluate((node) => node.open))) {
    await page.click('#instruments-open');
    await page.waitForFunction(() => document.querySelector('#workbench-instruments-dialog').open);
  }
  await page.waitForFunction(() => document.querySelector('#serial-output').textContent.trim().length > 0);
  return identity;
}

async function setAndObserve(page, token, authoredValue, workerValue, expectedUart, expectedD13 = null) {
  const eventOffset = await page.evaluate(() => window.__M6_STATE__.runtime.eventLog.log.length);
  const serialOffset = (await page.locator('#serial-output').textContent()).length;
  const dispatched = await page.evaluate(({ controlToken, value }) => {
    const node = [...document.querySelectorAll(`[data-control="${controlToken}"]`)]
      .find((candidate) => candidate.getClientRects().length > 0);
    if (!node) return false;
    node.value = String(value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, { controlToken: token, value: authoredValue });
  assert.equal(dispatched, true, `${token} visible input missing`);
  try {
    await page.waitForFunction(({ offset, value }) => window.__M6_STATE__.runtime.eventLog.log.slice(offset)
      .some((event) => event.type === 'control' && event.key === 'position' && event.value === value),
    { offset: eventOffset, value: workerValue }, { timeout: 10000 });
  } catch (error) {
    const actual = await page.evaluate((offset) => ({
      events: window.__M6_STATE__.runtime.eventLog.log.slice(offset, offset + 12),
      message: document.querySelector('#project-message').textContent,
      runtimeState: document.querySelector('#worker-state').textContent,
    }), eventOffset);
    throw new Error(`CORE_ANALOGUE_WORKER:${token}:${authoredValue}:${error.message}:${JSON.stringify(actual)}`);
  }
  await page.waitForFunction(({ offset, expected }) => document.querySelector('#serial-output').textContent
    .slice(offset).split(/\r?\n/u).includes(expected), { offset: serialOffset, expected: expectedUart });
  if (expectedD13 !== null) {
    await page.waitForFunction((level) => window.__M6_STATE__.runtime.pins
      .find((pin) => pin.pin === 'D13')?.level === level, expectedD13);
  }
  return page.evaluate(({ offset, expected }) => {
    const event = window.__M6_STATE__.runtime.eventLog.log.slice(offset)
      .find((item) => item.type === 'control' && item.key === 'position' && item.value === expected);
    const analogPin = window.__M6_STATE__.runtime.pins.find((pin) => pin.pin === 'A1');
    const d13 = window.__M6_STATE__.runtime.pins.find((pin) => pin.pin === 'D13');
    return {
      worker: event && { componentId: event.componentId, key: event.key, value: event.value,
        targetCycle: event.targetCycle },
      analogPin,
      d13: d13 && { pin: d13.pin, level: d13.level },
    };
  }, { offset: eventOffset, expected: workerValue });
}

async function stopRuntime(page) {
  if (await page.locator('#workbench-instruments-dialog').evaluate((node) => node.open)) {
    await page.click('#workbench-instruments-dialog .workbench-popup-close');
  }
  await page.click('#quick-stop');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(90000);
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);

    let lightIdentity = null; let lightLow = null; let lightHigh = null;
    if (process.env.CORE_ANALOGUE_SKIP_LIGHT !== '1') {
      await loadStarter(page, 'avr-light-analogue', 'light-sensor-1');
      lightIdentity = await buildRun(page);
      lightLow = await setAndObserve(page, 'light-sensor-1.lightLevel', 0, 0, '0', false);
      lightHigh = await setAndObserve(page, 'light-sensor-1.lightLevel', 100, 1, '1023', true);
      await stopRuntime(page);
    }

    await loadStarter(page, 'temperature-lcd-threshold', 'temperature-sensor-1');
    const temperatureIdentity = await buildRun(page);
    const temperatureLow = await setAndObserve(
      page, 'temperature-sensor-1.temperatureC', -50, 0, 'TEMP_C=-50 STATE=COOL',
    );
    const temperatureHigh = await setAndObserve(
      page, 'temperature-sensor-1.temperatureC', 150, 1, 'TEMP_C=149 STATE=HOT',
    );

    process.stdout.write(`${JSON.stringify({
      ok: true,
      models: lightIdentity ? 2 : 1,
      fields: lightIdentity ? 2 : 1,
      actualBuilds: lightIdentity ? 2 : 1,
      light: lightIdentity ? {
        pin: 'A1',
        identity: { artifact: lightIdentity.artifact, input: lightIdentity.input,
          sourceSha256: lightIdentity.sourceSha256 },
        observations: [{ authored: 0, adc: 0, runtime: lightLow },
          { authored: 1, adc: 1023, runtime: lightHigh }],
      } : null,
      temperature: {
        pin: 'A1',
        identity: { artifact: temperatureIdentity.artifact, input: temperatureIdentity.input,
          sourceSha256: temperatureIdentity.sourceSha256 },
        observations: [{ authoredC: -50, normalized: 0, firmwareC: -50, runtime: temperatureLow },
          { authoredC: 150, normalized: 1, firmwareC: 149, runtime: temperatureHigh }],
        quantization: 'Firmware uses integer (ADC*200)/1024-50; authored 150 °C quantizes to reported 149 °C at ADC 1023.',
      },
    })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
