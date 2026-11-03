// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules',
  'playwright',
));

const base = process.env.FIRMWARE_ACCEPTANCE_URL || 'http://127.0.0.1:18999';
const componentId = 'dc-motor-encoder-1';

async function discardUnsaved(page) {
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
    await page.click('#unsaved-discard');
  }
}

async function openExample(page) {
  await page.setInputFiles(
    '#project-open-input',
    path.resolve('examples/indicators-actuators/avr-dc-motor-encoder.intent-mcu.json'),
  );
  await discardUnsaved(page);
  await page.waitForFunction((id) => window.__M6_PROJECT__()?.candidateCircuit?.components
    ?.some((item) => item.id === id), componentId);
  if (await page.locator('#model-library-migrate').isEnabled()) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#model-library-migrate'),
    ]);
    await page.setInputFiles('#project-open-input', fs.readFileSync(await download.path()));
    await discardUnsaved(page);
  }
  if (await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) {
    await page.click('#workbench-project-dialog .workbench-popup-close');
  }
}

async function neighborPins(page) {
  return page.evaluate(() => [7, 8, 9].map((pin) => ({
    pin,
    level: window.__M6_STATE__.runtime?.pins?.find((item) => item.pin === `D${pin}`)?.level,
  })));
}

async function turn(page, direction, expectedStates, expectedCounts) {
  const eventOffset = await page.evaluate(() => window.__M6_STATE__.runtime.eventLog.log.length);
  const serialBefore = await page.locator('#serial-output').textContent();
  await page.click(`[data-control="${componentId}.detent-${direction}"]:visible`);
  await page.waitForFunction(({ offset }) => window.__M6_STATE__.runtime.eventLog.log.length >= offset + 4,
    { offset: eventOffset });
  const expectedLines = expectedStates.map((state, index) =>
    `phase=${state},count=${expectedCounts[index]}`);
  try {
    await page.waitForFunction(({ offset, lines }) => document.querySelector('#serial-output').textContent
      .slice(offset).includes(`${lines.join('\n')}\n`), { offset: serialBefore.length, lines: expectedLines },
    { timeout: 15000 });
  } catch (error) {
    const actual = await page.evaluate(({ eventOffset: offset, serialOffset }) => ({
      serial: document.querySelector('#serial-output').textContent.slice(serialOffset),
      events: window.__M6_STATE__.runtime.eventLog.log.slice(offset, offset + 8),
    }), { eventOffset, serialOffset: serialBefore.length });
    throw new Error(`DC_MOTOR_ENCODER_UART:${error.message}:${JSON.stringify(actual)}`);
  }
  const events = await page.evaluate(({ offset }) => window.__M6_STATE__.runtime.eventLog.log
    .slice(offset, offset + 4), { offset: eventOffset });
  const levels = { 2: true, 3: true };
  const states = events.map((event) => {
    levels[event.pin] = event.level;
    return `${levels[2] ? 1 : 0}${levels[3] ? 1 : 0}`;
  });
  assert.deepEqual(states, expectedStates);
  assert.deepEqual(events.map((event) => event.pin), direction === 'cw' ? [2, 3, 2, 3] : [3, 2, 3, 2]);
  assert(events.slice(1).every((event, index) =>
    event.targetCycle - events[index].targetCycle === 16000));
  return {
    direction,
    states,
    pins: events.map((event) => event.pin),
    levels: events.map((event) => event.level),
    phaseCycles: events.slice(1).map((event, index) => event.targetCycle - events[index].targetCycle),
    uart: expectedLines,
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(90000);
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.click('#workbench-view-advanced');
    await openExample(page);

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
      const project = window.__M6_PROJECT__().project;
      return {
        artifact: window.__M6_STATE__.artifactIdentity,
        input: window.__M6_STATE__.inputIdentity,
        source: project.source.files.map((fileEntry) => fileEntry.content).join('\n'),
      };
    });
    assert.doesNotMatch(identity.source, /analogWrite|RPM/u);

    await page.click('#quick-run');
    await page.waitForFunction(() => !document.querySelector('#speed').disabled);
    await page.evaluate(() => {
      const speed = document.querySelector('#speed');
      speed.value = 'maximum';
      speed.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.click('#serial-tab');
    await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('READY\n'));
    const before = await neighborPins(page);
    assert.deepEqual(before, [7, 8, 9].map((pin) => ({ pin, level: false })));
    const observations = [
      await turn(page, 'cw', ['01', '00', '10', '11'], [0, 0, 0, 1]),
      await turn(page, 'ccw', ['10', '00', '01', '11'], [1, 1, 1, 0]),
    ];
    const after = await neighborPins(page);
    assert.deepEqual(after, before, 'D7-D9 motor command pins changed during independent encoder detents');
    const detent = await page.evaluate((id) => window.__M6_PROJECT__().candidateCircuit.components
      .find((item) => item.id === id).controls.detent, componentId);
    assert.equal(detent, 0);
    await page.click('#workbench-instruments-dialog .workbench-popup-close');
    await page.click('#quick-stop');
    process.stdout.write(`${JSON.stringify({
      ok: true,
      models: 1,
      fields: 1,
      actualBuilds: 1,
      artifactIdentity: identity.artifact,
      inputIdentity: identity.input,
      sourceSha256: crypto.createHash('sha256').update(identity.source).digest('hex'),
      observations,
      motorCommandPins: { before, after },
      finalDetent: detent,
      limitations: 'Independent manual ideal quadrature only; no PWM, direction, elapsed-time, RPM or artwork inference.',
    })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
