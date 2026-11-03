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
const componentId = 'rotary-selector-1';
const runtimeIds = [1, 2, 3, 4].map((position) => `${componentId}-p${position}`);

async function discardUnsaved(page) {
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
    await page.click('#unsaved-discard');
  }
}

async function openSelectorExample(page) {
  await page.setInputFiles(
    '#project-open-input',
    path.resolve('examples/rotary-selector-indicators/avr-rotary-selector-4.intent-mcu.json'),
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

async function runtimeSnapshot(page, eventOffset = 0) {
  return page.evaluate(({ ids, offset }) => {
    const runtime = window.__M6_STATE__.runtime;
    const controls = ids.map((id) => Boolean(runtime?.circuit?.controls?.[id]?.pressed));
    const pins = [2, 3, 4, 5].map((pin) => ({
      pin,
      level: runtime?.pins?.find((item) => item.pin === `D${pin}`)?.level,
    }));
    const events = (runtime?.eventLog?.log ?? []).slice(offset)
      .filter((event) => event.type === 'control')
      .map(({ componentId: id, key, value, targetCycle }) => ({ id, key, value, targetCycle }));
    return { controls, pins, events, eventLogLength: runtime?.eventLog?.log?.length ?? 0 };
  }, { ids: runtimeIds, offset: eventOffset });
}

function assertOneHot(snapshot, position) {
  assert.deepEqual(
    snapshot.controls,
    [1, 2, 3, 4].map((candidate) => candidate === position),
    `runtime contact state for position ${position}`,
  );
  assert.deepEqual(
    snapshot.pins,
    [2, 3, 4, 5].map((pin) => ({ pin, level: pin !== position + 1 })),
    `D2-D5 one-hot pull-up state for position ${position}`,
  );
}

async function waitForPosition(page, position, serialOffset, eventOffset = null) {
  await page.waitForFunction(({ expected, ids, offset }) => {
    const runtime = window.__M6_STATE__.runtime;
    const controls = ids.map((id) => Boolean(runtime?.circuit?.controls?.[id]?.pressed));
    const pins = [2, 3, 4, 5].map((pin) => runtime?.pins
      ?.find((item) => item.pin === `D${pin}`)?.level);
    const oneHot = controls.every((pressed, index) => pressed === (index + 1 === expected))
      && pins.every((level, index) => level === (index + 1 !== expected));
    const uart = document.querySelector('#serial-output').textContent.slice(offset);
    return oneHot && uart.split(/\r?\n/u).includes(String(expected));
  }, { expected: position, ids: runtimeIds, offset: serialOffset });
  const snapshot = await runtimeSnapshot(page, eventOffset ?? 0);
  assertOneHot(snapshot, position);
  return snapshot;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(90000);
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.click('#workbench-view-advanced');
    await openSelectorExample(page);

    await page.click('#quick-build');
    await page.waitForFunction(() => ['succeeded', 'failed'].includes(window.__M6_STATE__.buildState));
    const buildState = await page.evaluate(() => window.__M6_STATE__.buildState);
    const buildFailure = await page.evaluate(() => ({
      state: window.__M6_STATE__.buildState,
      log: document.querySelector('#build-log').textContent,
      diagnostics: document.querySelector('#diagnostics').textContent,
      technical: document.querySelector('#technical-error-detail').textContent,
    }));
    assert.equal(buildState, 'succeeded', JSON.stringify(buildFailure));
    const identity = await page.evaluate(() => {
      const project = window.__M6_PROJECT__().project;
      return {
        artifact: window.__M6_STATE__.artifactIdentity,
        input: window.__M6_STATE__.inputIdentity,
        source: project.source.files.map((fileEntry) => fileEntry.content).join('\n'),
      };
    });

    await page.click('#quick-run');
    await page.waitForFunction(() => !document.querySelector('#speed').disabled);
    await page.evaluate(() => {
      const speed = document.querySelector('#speed');
      speed.value = 'maximum';
      speed.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.click('#serial-tab');

    const observations = [];
    const initial = await waitForPosition(page, 1, 0);
    observations.push({ position: 1, controls: initial.controls, pins: initial.pins, initial: true });
    const control = page.locator(`[data-control="${componentId}.position"]:visible`);

    for (const position of [2, 3, 4, 1]) {
      const serialBefore = await page.locator('#serial-output').textContent();
      const eventOffset = await page.evaluate(() => window.__M6_STATE__.runtime.eventLog.log.length);
      await control.selectOption(String(position));
      await page.waitForFunction(({ offset }) => window.__M6_STATE__.runtime.eventLog.log.length >= offset + 5,
        { offset: eventOffset });
      const snapshot = await waitForPosition(page, position, serialBefore.length, eventOffset);
      assert.deepEqual(snapshot.events.slice(0, 5), [
        ...runtimeIds.map((id) => ({ id, key: 'pressed', value: false,
          targetCycle: snapshot.events.find((event) => event.id === id && event.value === false)?.targetCycle })),
        { id: `${componentId}-p${position}`, key: 'pressed', value: true,
          targetCycle: snapshot.events[4]?.targetCycle },
      ], `release-all/close-selected order for position ${position}`);
      assert(snapshot.events.slice(1, 5).every((event, index) =>
        event.targetCycle >= snapshot.events[index].targetCycle), 'selector worker events moved backwards');
      const uartDelta = (await page.locator('#serial-output').textContent()).slice(serialBefore.length);
      const uart = uartDelta.split(/\r?\n/u).filter((line) => /^[0-4]$/u.test(line));
      const acceptedIndex = uart.indexOf(String(position));
      assert.notEqual(acceptedIndex, -1, `position ${position} missing from UART: ${JSON.stringify(uartDelta)}`);
      assert(uart.slice(acceptedIndex).every((line) => line === String(position)),
        `non-selected position appeared after ${position}: ${JSON.stringify(uart)}`);
      observations.push({ position, controls: snapshot.controls, pins: snapshot.pins,
        workerEvents: snapshot.events.slice(0, 5), uart });
    }

    assert.equal(await control.inputValue(), '1');
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
      sequence: [1, 2, 3, 4, 1],
      observations,
    })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
