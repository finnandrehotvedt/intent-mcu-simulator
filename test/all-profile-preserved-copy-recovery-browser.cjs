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
  if (await page.locator('#workbench-inspector-dialog').getAttribute('open') !== null) {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#workbench-inspector-dialog').open);
  }
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
    const publishedLocks = [
      { release: '1.1.0-rc.136', id: '71000000-0000-4000-8000-000000000136',
        manifestSha256: '49f5b582520551f6c7c3f68cd196c616dfde297988b7a85497e4e42664c97128',
        implementationSha256: 'cfaf5e18f657b2663c6ac776604af9d8aa3313997b36312e0dfe4b25359154d3' },
      { release: '1.1.0-rc.137', id: '72000000-0000-4000-8000-000000000137',
        manifestSha256: '709444f9c162942ebe960f43cdc8147300c93877100a34a5630a1e1c7bd63c4d',
        implementationSha256: '7dfa75c67b84ba2b1f04002f2c1ee5d6a3c84dea94a263a09adb47a277bde71d' },
    ].map((entry) => ({ ...entry, key: `teach-lab.simulator.project.v2.tab.${entry.id}` }));
    const unknownLockKey = 'teach-lab.simulator.project.v2.tab.73000000-0000-4000-8000-000000000138';
    const publishedRaw = await page.evaluate(({ raw, publishedLocks, unknownLockKey }) => {
      const basis = JSON.parse(raw);
      const records = publishedLocks.map((entry) => {
        const value = structuredClone(basis);
        value.modelLibrary = { ...value.modelLibrary,
          manifestSha256: entry.manifestSha256, implementationSha256: entry.implementationSha256 };
        const encoded = JSON.stringify(value);
        localStorage.setItem(entry.key, encoded);
        return [entry.key, encoded];
      });
      const unknown = structuredClone(basis);
      unknown.modelLibrary = { ...unknown.modelLibrary,
        manifestSha256: 'a'.repeat(64), implementationSha256: 'b'.repeat(64) };
      localStorage.setItem(unknownLockKey, JSON.stringify(unknown));
      return Object.fromEntries(records);
    }, { raw: avr.raw, publishedLocks, unknownLockKey });
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
      if (profile === 'board.esp32-c3-devmodule-v1') {
        await page.evaluate((name) => window[name].setComponentProperty('resistor-1', 'ohms', 330), owner);
      }
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
    for (const entry of publishedLocks) assert(optionSummary.some((text) => text.includes(entry.release)
      && text.includes('data-only migration') && text.includes(`draft ${entry.id.slice(0, 8)}`)),
    `${entry.release}: published recovery identity was not presented as migration-only`);
    assert(optionSummary.some((text) => text.includes('MODEL_LIBRARY_LOCK_UNTRUSTED')
      && text.includes('draft 73000000')), 'truly unknown model lock was not rejected visibly');
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
      assert(await page.locator('#project-draft-recovery-status').isVisible(),
        `${record.profile}: shared recovery status is hidden`);
      assert.match(await page.textContent('#project-draft-recovery-status'), /Original key unchanged/iu,
        `${record.profile}: shared recovery status omitted success`);
      assert(await page.locator('#browser-draft-recovery').evaluate((node) => node.open),
        `${record.profile}: shared recovery panel did not remain open`);
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
      if (record.profile === 'board.esp32-c3-devmodule-v1') {
        if (await page.locator('#workbench-project-dialog').getAttribute('open') !== null) await page.keyboard.press('Escape');
        await page.locator('#c3-editor-components [data-component-id="resistor-1"]').click();
        await page.click('#toggle-inspector');
        await page.waitForSelector('#workbench-inspector-dialog[open]');
        const inspector = page.locator('#c3-part-properties');
        const input = inspector.locator('[data-bounded-property="ohms"]');
        assert.equal(await input.inputValue(), '330', 'C3 recovered resistor did not begin at 330 ohms');
        await input.fill('470');
        await inspector.locator('[data-bounded-model-apply]').click();
        await page.waitForFunction(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state()
          .circuitEditor.draft.components.find((component) => component.id === 'resistor-1').properties.ohms === 470);
        const beforeCancel = await page.evaluate(() => {
          const state = window.__ESP32C3_PUBLIC_WORKBENCH__.state();
          return { activeId: sessionStorage.getItem('intent-mcu.active-draft-id.v1'),
            profile: document.querySelector('#board-select').value,
            source: document.querySelector('#c3-source').value,
            name: document.querySelector('#c3-project-name').value,
            circuit: state.circuitEditor.draft };
        });
        await openRecovery(page);
        const picoRecord = records.find((item) => item.profile === 'board.rp2040-pico-v1');
        await page.selectOption('#project-draft-recovery', picoRecord.key);
        await page.click('#project-draft-recover');
        await page.waitForSelector('#unsaved-change-dialog[open]');
        assert.match(await page.textContent('#unsaved-change-description'), /replace authored changes/iu,
          'C3 Inspector edit did not trigger recovery unsaved guard');
        await page.click('#unsaved-keep');
        const afterCancel = await page.evaluate(() => {
          const state = window.__ESP32C3_PUBLIC_WORKBENCH__.state();
          return { activeId: sessionStorage.getItem('intent-mcu.active-draft-id.v1'),
            profile: document.querySelector('#board-select').value,
            source: document.querySelector('#c3-source').value,
            name: document.querySelector('#c3-project-name').value,
            circuit: state.circuitEditor.draft };
        });
        assert.deepEqual(afterCancel, beforeCancel,
          'Keep editing changed recovered C3 copy/source/layout/profile/active key');
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), record.key), record.raw,
          'Keep editing changed original C3 bytes');
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), picoRecord.key), picoRecord.raw,
          'Keep editing changed original Pico bytes');
        assert(await page.locator('#project-draft-recovery-status').isVisible(),
          'shared recovery status was hidden after Keep editing');
      }
      await openRecovery(page);
    }

    for (const entry of publishedLocks) {
      await page.selectOption('#project-draft-recovery', entry.key);
      await page.click('#project-draft-recover');
      if (await page.locator('#unsaved-change-dialog').getAttribute('open') !== null) await page.click('#unsaved-discard');
      await page.waitForTimeout(200);
      assert.match(await page.textContent('#project-message'),
        new RegExp(`Published ${entry.release.replaceAll('.', '\\.')}.+migrated as data only.+fresh Build`, 'iu'));
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), entry.key), publishedRaw[entry.key],
        `${entry.release}: published original bytes changed`);
      assert.deepEqual(await page.evaluate(() => window.__M6_PROJECT__().circuit), avr.project.circuit,
        `${entry.release}: recovered graph changed`);
      await openRecovery(page);
    }

    const beforeUnknown = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    const unknownRaw = await page.evaluate((key) => localStorage.getItem(key), unknownLockKey);
    await page.selectOption('#project-draft-recovery', unknownLockKey);
    await page.click('#project-draft-recover');
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), unknownLockKey), unknownRaw);
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), beforeUnknown);
    assert.match(await page.textContent('#project-message'), /invalid.+original preserved bytes remain untouched/iu);
    assert(await page.locator('#project-draft-recovery-status').isVisible());
    assert.match(await page.textContent('#project-draft-recovery-status'), /invalid.+original preserved bytes remain untouched/iu);
    await openRecovery(page);

    const beforeInvalid = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    const invalidRaw = await page.evaluate((key) => localStorage.getItem(key), invalidKey);
    await page.selectOption('#project-draft-recovery', invalidKey);
    await page.click('#project-draft-recover');
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), invalidKey), invalidRaw);
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), beforeInvalid);
    assert.match(await page.textContent('#project-message'), /original preserved bytes remain untouched/iu);
    assert(await page.locator('#project-draft-recovery-status').isVisible());
    assert.match(await page.textContent('#project-draft-recovery-status'), /original preserved bytes remain untouched/iu);

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
      recoveredEditGuarded: true, keepEditingPreserved: true, sharedStatusVisible: true,
      publishedLockMigrations: 2, unknownLockRejected: true,
      duplicateLabelsDistinguished: true, originalStorageMutation: false, nativeBuilds: 0, nativeRuns: 0 })}\n`);
  } finally { await context.close(); await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
