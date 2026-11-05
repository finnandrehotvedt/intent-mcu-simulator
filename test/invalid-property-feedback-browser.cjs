// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.INVALID_PROPERTY_URL || 'http://127.0.0.1:19001';
const cases = [
  {
    name: 'potentiometer', starter: 'adc', starterName: 'ADC dial',
    componentId: 'pot-1', key: 'ohms', original: 10_000, corrected: 5_000,
    upperInvalid: 10_000_001, rangeFragments: ['1', '10,000,000', 'Ω'],
  },
  {
    name: 'trimmer', starter: 'trimmer', starterName: 'Trimmer calibration',
    componentId: 'trimmer-1', key: 'ohms', original: 10_000, corrected: 5_000,
    upperInvalid: 10_000_001, rangeFragments: ['1', '10,000,000', 'Ω'],
  },
  {
    name: 'raw-passive-capacitor', file: 'examples/passive-energy-storage/avr-passive-energy-storage.intent-mcu.json',
    componentId: 'capacitor-1', key: 'capacitanceFarads', original: 1e-7, corrected: 4.7e-7,
    upperInvalid: 1.1, rangeFragments: ['0.000000000001', '1', 'F'],
  },
];

async function discardIfRequired(page) {
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
    await page.click('#unsaved-discard');
  }
}

async function openProject(page, entry) {
  if (await page.locator('#workbench-inspector-dialog').evaluate((node) => node.open)) {
    await page.click('#workbench-inspector-dialog .workbench-popup-close');
  }
  if (entry.starter) {
    if (!(await page.locator('#workbench-project-dialog').evaluate((node) => node.open))) {
      await page.click('#project-files-open');
      await page.waitForSelector('#workbench-project-dialog[open]');
    }
    await page.click('#project-demo');
    await page.waitForSelector('#example-picker-dialog[open]');
    await page.locator(`.starter-card[data-example="${entry.starter}"] .starter-action`).click();
  } else {
    await page.setInputFiles('#project-open-input', {
      name: path.basename(entry.file), mimeType: 'application/json', buffer: fs.readFileSync(entry.file),
    });
  }
  try {
    await page.waitForFunction(({ componentId }) => {
      const project = window.__M6_PROJECT__(); const graph = project?.circuit ?? project?.candidateCircuit;
      return graph?.components.some(({ id }) => id === componentId)
        || document.querySelector('#unsaved-change-dialog').open;
    }, entry, { timeout: 10_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => {
      const project = window.__M6_PROJECT__(); const graph = project?.circuit ?? project?.candidateCircuit;
      return { ids: graph?.components.map(({ id }) => id), name: project?.metadata?.name,
        unsaved: document.querySelector('#unsaved-change-dialog').open,
        projectDialog: document.querySelector('#workbench-project-dialog').open,
        message: document.querySelector('#project-message').textContent,
        technical: document.querySelector('#technical-error-detail').textContent };
    });
    throw new Error(`${entry.name}: project open stalled: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  await discardIfRequired(page);
  await page.waitForFunction(({ componentId }) => {
    const project = window.__M6_PROJECT__();
    const graph = project?.circuit ?? project?.candidateCircuit;
    return graph?.components.some(({ id }) => id === componentId);
  }, entry);
  if (entry.starterName) {
    assert.equal(await page.evaluate(() => window.__M6_PROJECT__().metadata.name), entry.starterName);
  }
  if (await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) {
    await page.click('#workbench-project-dialog .workbench-popup-close');
  }
}

async function selectAndOpenInspector(page, componentId) {
  await page.locator(`.circuit-component[data-component-id="${componentId}"]`).click();
  const dialog = page.locator('#workbench-inspector-dialog');
  if (!(await dialog.evaluate((node) => node.open))) await page.click('#toggle-inspector');
  await page.waitForFunction((id) => document.querySelector('#selection-name').textContent.includes(id), componentId);
}

async function projectState(page, entry) {
  return page.evaluate(({ componentId, key }) => {
    const project = structuredClone(window.__M6_PROJECT__());
    const graph = project.circuit ?? project.candidateCircuit;
    const component = graph.components.find(({ id }) => id === componentId);
    const value = component.properties[key];
    component.properties[key] = '__NORMALIZED_PROPERTY__';
    return {
      value,
      revision: window.__M6_STATE__.revision,
      normalizedProject: JSON.stringify(project),
      undoDisabled: document.querySelector('#undo').disabled,
      redoDisabled: document.querySelector('#redo').disabled,
    };
  }, entry);
}

async function setField(page, entry, value) {
  const input = page.locator(`#property-editor [data-property="${entry.key}"]`);
  await input.fill(String(value));
  await input.press('Tab');
  return input;
}

async function useProjectHistoryAction(page, action) {
  if (await page.locator('#workbench-inspector-dialog').evaluate((node) => node.open)) {
    await page.click('#workbench-inspector-dialog .workbench-popup-close');
  }
  await page.click('#project-files-open');
  await page.waitForSelector('#workbench-project-dialog[open]');
  await page.click(`#${action}`);
  await page.click('#workbench-project-dialog .workbench-popup-close');
  await page.waitForFunction(() => !document.querySelector('#workbench-project-dialog').open);
}

async function assertBoundFieldError(page, entry, expectedValue) {
  const input = page.locator(`#property-editor [data-property="${entry.key}"]`);
  assert.equal(await input.getAttribute('aria-invalid'), 'true', `${entry.name}: aria-invalid`);
  const descriptionId = await input.getAttribute('aria-describedby');
  assert(descriptionId, `${entry.name}: missing aria-describedby`);
  const description = page.locator(`#${descriptionId}`);
  assert.equal(await description.isVisible(), true, `${entry.name}: explanation not visible`);
  const text = (await description.textContent()).trim();
  for (const fragment of entry.rangeFragments) assert(text.includes(fragment), `${entry.name}: ${text}`);
  assert.match(text, /saved project is unchanged/iu, `${entry.name}: ${text}`);
  assert.doesNotMatch(text, /INVALID_|component\.property|details|revision/iu, `${entry.name}: raw detail leaked`);
  assert.equal(await input.inputValue(), String(expectedValue), `${entry.name}: attempted value not retained in field`);
}

async function assertCleanField(page, entry, expectedValue) {
  const input = page.locator(`#property-editor [data-property="${entry.key}"]`);
  assert.equal(await input.inputValue(), String(expectedValue), `${entry.name}: field value`);
  assert.equal(await input.getAttribute('aria-invalid'), 'false', `${entry.name}: stale invalid state`);
  const descriptionId = await input.getAttribute('aria-describedby');
  assert(descriptionId, `${entry.name}: missing persistent description binding`);
  const description = page.locator(`#${descriptionId}`);
  assert.equal(await description.isVisible(), false, `${entry.name}: stale explanation visible`);
  assert.equal((await description.textContent()).trim(), '', `${entry.name}: stale explanation text`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(60_000);
    const errors = []; const outside = []; let buildRequests = 0;
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== new URL(base).origin) outside.push(request.url());
      if (request.method() === 'POST' && /\/api\/(?:build|compile)/u.test(url.pathname)) buildRequests += 1;
    });
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
    await page.route('**/api/page-views', (route) => route.fulfill({ status: 200,
      contentType: 'application/json', body: '{"status":"disabled"}' }));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.click('#workbench-view-advanced');

    const observations = [];
    let enumRejections = 0;
    for (const entry of cases) {
      await openProject(page, entry);
      await selectAndOpenInspector(page, entry.componentId);
      const before = await projectState(page, entry);
      assert.equal(before.value, entry.original, `${entry.name}: original`);

      if (entry.name === 'potentiometer') {
        const taperEntry = { ...entry, key: 'taper', name: 'potentiometer-taper' };
        const beforeTaper = await projectState(page, taperEntry);
        await setField(page, taperEntry, 'log');
        const taperInput = page.locator('#property-editor [data-property="taper"]');
        assert.equal(await taperInput.getAttribute('aria-invalid'), 'true');
        const taperDescription = page.locator(`#${await taperInput.getAttribute('aria-describedby')}`);
        assert.equal(await taperDescription.isVisible(), true);
        const taperText = (await taperDescription.textContent()).trim();
        assert.match(taperText, /supported values: linear/iu);
        assert.doesNotMatch(taperText, /number|whole number|INVALID_|details|revision/iu);
        assert.deepEqual(await projectState(page, taperEntry), beforeTaper,
          'potentiometer-taper: rejected enum mutated project/history');
        assert.doesNotMatch(await page.locator('#project-message').textContent(), /INVALID_COMPONENT_PROPERTIES/u,
          'potentiometer-taper: raw rejection leaked outside the field');
        await setField(page, taperEntry, 'linear');
        await assertCleanField(page, taperEntry, 'linear');
        assert.deepEqual(await projectState(page, taperEntry), beforeTaper,
          'potentiometer-taper: restoring saved value mutated project/history');
        enumRejections += 1;
      }

      await setField(page, entry, -1);
      await assertBoundFieldError(page, entry, -1);
      const afterNegative = await projectState(page, entry);
      assert.deepEqual(afterNegative, before, `${entry.name}: rejected negative mutated project/history`);

      await setField(page, entry, entry.upperInvalid);
      await assertBoundFieldError(page, entry, entry.upperInvalid);
      const afterUpper = await projectState(page, entry);
      assert.deepEqual(afterUpper, before, `${entry.name}: rejected upper bound mutated project/history`);

      await setField(page, entry, entry.corrected);
      await page.waitForFunction(({ componentId, key, corrected }) => {
        const project = window.__M6_PROJECT__(); const graph = project.circuit ?? project.candidateCircuit;
        return graph.components.find(({ id }) => id === componentId)?.properties[key] === corrected;
      }, entry);
      await assertCleanField(page, entry, entry.corrected);
      const committed = await projectState(page, entry);
      assert.equal(committed.revision, before.revision + 1, `${entry.name}: corrected revision`);
      assert.equal(committed.normalizedProject, before.normalizedProject, `${entry.name}: unrelated project state`);
      assert.equal(committed.undoDisabled, false, `${entry.name}: corrected edit missing Undo`);

      await useProjectHistoryAction(page, 'undo');
      await page.waitForFunction(({ componentId, key, original }) => {
        const project = window.__M6_PROJECT__(); const graph = project.circuit ?? project.candidateCircuit;
        return graph.components.find(({ id }) => id === componentId)?.properties[key] === original;
      }, entry);
      const undone = await projectState(page, entry);
      assert.equal(undone.revision, before.revision + 2, `${entry.name}: Undo revision`);
      assert.equal(undone.redoDisabled, false, `${entry.name}: missing Redo`);
      await selectAndOpenInspector(page, entry.componentId);
      await assertCleanField(page, entry, entry.original);

      await useProjectHistoryAction(page, 'redo');
      await page.waitForFunction(({ componentId, key, corrected }) => {
        const project = window.__M6_PROJECT__(); const graph = project.circuit ?? project.candidateCircuit;
        return graph.components.find(({ id }) => id === componentId)?.properties[key] === corrected;
      }, entry);
      const redone = await projectState(page, entry);
      assert.equal(redone.revision, before.revision + 3, `${entry.name}: Redo revision`);
      await selectAndOpenInspector(page, entry.componentId);
      await assertCleanField(page, entry, entry.corrected);

      await setField(page, entry, -1); await assertBoundFieldError(page, entry, -1);
      await page.click('#workbench-inspector-dialog .workbench-popup-close');
      await page.locator('.circuit-component[data-component-id="board-1"]').click();
      await page.waitForFunction(() => document.querySelector('#selection-name').textContent.includes('board-1'));
      await selectAndOpenInspector(page, entry.componentId);
      await assertCleanField(page, entry, entry.corrected);

      await setField(page, entry, -1); await assertBoundFieldError(page, entry, -1);
      await page.click('#workbench-inspector-dialog .workbench-popup-close');
      await page.waitForFunction(() => !document.querySelector('#workbench-inspector-dialog').open);
      await page.click('#toggle-inspector');
      await assertCleanField(page, entry, entry.corrected);

      observations.push({ name: entry.name, beforeRevision: before.revision,
        committedRevision: committed.revision, undoRevision: undone.revision,
        redoRevision: redone.revision, finalValue: redone.value });
    }

    assert.equal(buildRequests, 0);
    assert.deepEqual(outside, []);
    assert.deepEqual(errors, []);
    process.stdout.write(`${JSON.stringify({ ok: true, cases: observations,
      fieldBoundErrors: 3, upperBounds: 3, undoRedo: 3, selectionReset: 3,
      closeReopenReset: 3, enumRejections, buildRequests })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
