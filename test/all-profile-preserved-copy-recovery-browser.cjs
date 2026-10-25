// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.DRAFT_RECOVERY_URL || 'http://127.0.0.1:18932';
const profiles = [
  ['board.rp2040-pico-v1', '#pico-source', '#pico-project-name', '__RP2040_PUBLIC_WORKBENCH__'],
  ['board.esp32-c3-devmodule-v1', '#c3-source', '#c3-project-name', '__ESP32C3_PUBLIC_WORKBENCH__'],
  ['board.stm32f429zi-nucleo144-v1', '#stm32-source', '#stm32-project-name', '__STM32_PUBLIC_WORKBENCH__'],
];
const orphanIds = [
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000004',
];

async function openRecovery(page) {
  if (!(await page.locator('#workbench-more').evaluate((node) => node.open))) await page.click('#workbench-more > summary');
  if (await page.locator('#workbench-project-dialog').getAttribute('open') === null) await page.click('#project-files-open');
  const recovery = page.locator('#browser-draft-recovery');
  await recovery.waitFor({ state: 'visible' });
  if (!(await recovery.evaluate((node) => node.open))) await recovery.locator('summary').click();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    page.on('pageerror', (error) => process.stderr.write(`PAGEERROR ${error.stack || error.message}\n`));
    await page.route('**/api/page-views', (route) => route.fulfill({ status: 200,
      contentType: 'application/json', body: JSON.stringify({ status: 'disabled' }) }));
    await page.goto(base); await page.waitForFunction(() => window.__M11_READY__);

    const avr = await page.evaluate(({ orphanId }) => {
      const project = structuredClone(window.__M6_PROJECT__());
      project.metadata.name = 'Recovered AVR drawing';
      const first = project.circuit.components[0];
      project.layout.positions[first.id].x = 0.19;
      window.__M6_IMPORT__(JSON.stringify(project));
      const activeId = sessionStorage.getItem('intent-mcu.active-draft-id.v1');
      const activeKey = `teach-lab.simulator.project.v2.tab.${activeId}`;
      const raw = localStorage.getItem(activeKey);
      const key = `teach-lab.simulator.project.v2.tab.${orphanId}`;
      localStorage.setItem(key, raw);
      localStorage.setItem('intent-mcu.draft-registry.v1', '[]');
      return { key, raw, project: structuredClone(window.__M6_PROJECT__()) };
    }, { orphanId: orphanIds[0] });

    const records = [{ profile: 'board.atmega328p-16mhz-v1', owner: '__M6_PROJECT__', ...avr }];
    for (let index = 0; index < profiles.length; index += 1) {
      const [profile, sourceSelector, nameSelector, owner] = profiles[index];
      await page.selectOption('#board-select', profile);
      await page.evaluate(({ sourceSelector, nameSelector, marker }) => {
        const source = document.querySelector(sourceSelector);
        source.value = `${source.value}\n// ${marker}`;
        source.dispatchEvent(new Event('input', { bubbles: true }));
        const name = document.querySelector(nameSelector);
        name.value = marker; name.dispatchEvent(new Event('input', { bubbles: true }));
        name.dispatchEvent(new Event('change', { bubbles: true }));
      }, { sourceSelector, nameSelector, marker: `Recovered ${profile}` });
      const state = await page.evaluate((name) => window[name].state(), owner);
      const component = state.circuitEditor.draft.components[0];
      await page.evaluate(({ owner, id }) => window[owner].moveCircuitComponent(id, 0.23, 0.31), { owner, id: component.id });
      const record = await page.evaluate(({ profile, owner, orphanId }) => {
        const activeId = sessionStorage.getItem('intent-mcu.active-draft-id.v1');
        const activeKey = `intent-mcu.profile-draft.v1.${profile}.tab.${activeId}`;
        const envelope = JSON.parse(localStorage.getItem(activeKey));
        delete envelope.updatedAt;
        const raw = JSON.stringify(envelope);
        const key = `intent-mcu.profile-draft.v1.${profile}.tab.${orphanId}`;
        localStorage.setItem(key, raw);
        const snapshot = window[owner].state();
        return { key, raw, source: snapshot.source ?? snapshot.project.source,
          name: snapshot.project?.name ?? envelope.authoredName,
          circuit: snapshot.circuitEditor.draft };
      }, { profile, owner, orphanId: orphanIds[index + 1] });
      records.push({ profile, owner, sourceSelector, nameSelector, ...record });
    }
    const invalidKey = `intent-mcu.profile-draft.v1.board.rp2040-pico-v1.tab.50000000-0000-4000-8000-000000000005`;
    const duplicateLabelKey = `intent-mcu.profile-draft.v1.board.rp2040-pico-v1.tab.60000000-0000-4000-8000-000000000006`;
    await page.evaluate(({ invalidKey, duplicateLabelKey, sourceKey }) => {
      localStorage.setItem(invalidKey, '{historical-invalid');
      localStorage.setItem(duplicateLabelKey, localStorage.getItem(sourceKey));
    }, { invalidKey, duplicateLabelKey, sourceKey: records[1].key });
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__M11_READY__);
    await openRecovery(page);
    const optionSummary = await page.locator('#project-draft-recovery option').allTextContents();
    for (const record of records) {
      assert(optionSummary.some((text) => text.includes(record.profile === 'board.atmega328p-16mhz-v1'
        ? 'Recovered AVR drawing' : `Recovered ${record.profile}`) && text.includes('parts') && text.includes('nets')),
      `${record.profile}: historical orphan not described in ${JSON.stringify(optionSummary)}`);
    }
    assert(optionSummary.some((text) => text.includes('saved time unknown')), 'historical unknown time was not disclosed');
    assert(optionSummary.some((text) => text.includes('invalid')), 'invalid preserved bytes were hidden');
    assert(optionSummary.some((text) => text.includes('draft 20000000'))
      && optionSummary.some((text) => text.includes('draft 60000000')),
    'otherwise identical historical drafts lacked distinct nonsecret identities');

    for (const record of records) {
      await page.selectOption('#project-draft-recovery', record.key);
      await page.click('#project-draft-recover');
      if (await page.locator('#unsaved-change-dialog').getAttribute('open') !== null) await page.click('#unsaved-discard');
      await page.waitForTimeout(300);
      assert.match(await page.textContent('#project-message'), /Original key unchanged/iu,
        `${record.profile}: recovery did not report preserved copy; ${await page.textContent('#technical-error-detail')}`);
      const proof = await page.evaluate(({ record }) => {
        const activeId = sessionStorage.getItem('intent-mcu.active-draft-id.v1');
        const value = record.owner === '__M6_PROJECT__' ? window.__M6_PROJECT__() : window[record.owner].state();
        const project = record.owner === '__M6_PROJECT__' ? value : value.project;
        const circuit = record.owner === '__M6_PROJECT__' ? value.circuit : value.circuitEditor.draft;
        return { activeId, original: localStorage.getItem(record.key), project, circuit, layout: project?.layout,
          source: record.owner === '__M6_PROJECT__' ? value.source : document.querySelector(record.sourceSelector).value,
          name: record.owner === '__M6_PROJECT__' ? value.metadata.name : document.querySelector(record.nameSelector).value };
      }, { record });
      assert.notEqual(proof.activeId, record.key.split('.tab.').at(-1), `${record.profile}: recovery reused source draft`);
      assert.equal(proof.original, record.raw, `${record.profile}: original raw bytes changed`);
      if (record.project) {
        assert.equal(proof.name, record.project.metadata.name, 'AVR name changed');
        assert.deepEqual(proof.circuit, record.project.circuit, 'AVR graph/layout changed');
        assert.deepEqual(proof.layout, record.project.layout, 'AVR layout changed');
      }
      else {
        assert.equal(proof.source, record.source, `${record.profile}: source changed`);
        assert.equal(proof.name, record.name, `${record.profile}: name changed`);
        assert.deepEqual(proof.circuit, record.circuit, `${record.profile}: graph/layout changed`);
      }
      await openRecovery(page);
    }

    const beforeInvalid = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    const invalidRaw = await page.evaluate((key) => localStorage.getItem(key), invalidKey);
    await page.selectOption('#project-draft-recovery', invalidKey);
    await page.click('#project-draft-recover');
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), invalidKey), invalidRaw);
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), beforeInvalid);
    assert.match(await page.textContent('#project-message'), /original preserved bytes remain untouched/iu);

    const duplicate = await context.newPage();
    await duplicate.route('**/api/page-views', (route) => route.fulfill({ status: 200,
      contentType: 'application/json', body: JSON.stringify({ status: 'disabled' }) }));
    await duplicate.goto(base); await duplicate.waitForFunction(() => window.__M11_READY__);
    assert.notEqual(await duplicate.evaluate(() => sessionStorage.getItem('intent-mcu.active-draft-id.v1')),
      await page.evaluate(() => sessionStorage.getItem('intent-mcu.active-draft-id.v1')));
    for (const record of records) assert.equal(await duplicate.evaluate((key) => localStorage.getItem(key), record.key), record.raw);
    assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), 0);
    process.stdout.write(`${JSON.stringify({ result: 'pass', historicalOrphansFound: 4,
      preservedCopyRecoveries: 4, invalidBytesUntouched: true, duplicateTabIsolated: true,
      duplicateLabelsDistinguished: true, originalStorageMutation: false, nativeBuilds: 0, nativeRuns: 0 })}\n`);
  } finally { await context.close(); await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
