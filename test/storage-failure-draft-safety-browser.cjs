// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const base = process.env.DRAFT_SAFETY_URL || 'http://127.0.0.1:18932';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const startupContext = await browser.newContext({ serviceWorkers: 'block' });
    const startup = await startupContext.newPage();
    await startup.goto(base);
    await startup.waitForFunction(() => window.__M11_READY__);
    await startup.waitForTimeout(50);
    const startupPersistence = await startup.evaluate(() => {
      const id = sessionStorage.getItem('intent-mcu.active-draft-id.v1');
      const profiles = [
        ['board.rp2040-pico-v1', '__RP2040_PUBLIC_WORKBENCH__', '#pico-source', '#pico-project-name'],
        ['board.esp32-c3-devmodule-v1', '__ESP32C3_PUBLIC_WORKBENCH__', '#c3-source', '#c3-project-name'],
        ['board.stm32f429zi-nucleo144-v1', '__STM32_PUBLIC_WORKBENCH__', '#stm32-source', '#stm32-project-name'],
      ];
      return profiles.map(([profile, owner, source, name]) => {
        const state = window[owner].state();
        const raw = localStorage.getItem(`intent-mcu.profile-draft.v1.${profile}.tab.${id}`);
        const saved = JSON.parse(raw);
        return {
          profile,
          rawPresent: Boolean(raw),
          circuitExact: JSON.stringify(saved.circuit) === JSON.stringify(state.circuitEditor.draft),
          sourceExact: saved.authoredSource === document.querySelector(source).value,
          nameExact: saved.authoredName === document.querySelector(name).value.trim(),
          jsonRoundTripExact: JSON.stringify(JSON.parse(JSON.stringify(saved))) === JSON.stringify(saved),
        };
      });
    });
    for (const result of startupPersistence) assert.deepEqual(result, {
      profile: result.profile, rawPresent: true, circuitExact: true, sourceExact: true,
      nameExact: true, jsonRoundTripExact: true,
    }, `${result.profile}: startup recovery lost authored fields`);
    const nonFinite = await startup.evaluate(() => [
      window.__RP2040_PUBLIC_WORKBENCH__, window.__ESP32C3_PUBLIC_WORKBENCH__, window.__STM32_PUBLIC_WORKBENCH__,
    ].map((owner) => {
      const before = JSON.stringify(owner.state().circuitEditor.draft);
      const outcome = owner.setComponentProperty('resistor-1', 'ohms', Number.POSITIVE_INFINITY);
      return { accepted: outcome?.ok === true, unchanged: JSON.stringify(owner.state().circuitEditor.draft) === before };
    }));
    for (const result of nonFinite) assert.deepEqual(result, { accepted: false, unchanged: true },
      'non-finite authored value was accepted or changed a profile draft');
    assert.doesNotMatch(await startup.locator('#project-message').innerText(), /Browser recovery .* could not be saved/iu);
    await startupContext.close();

    const corruptContext = await browser.newContext({ serviceWorkers: 'block' });
    const corrupt = await corruptContext.newPage();
    const corruptId = '11111111-1111-4111-8111-111111111111';
    await corrupt.addInitScript(({ id }) => {
      sessionStorage.setItem('intent-mcu.active-draft-id.v1', id);
      localStorage.setItem(`teach-lab.simulator.project.v2.tab.${id}`, '{corrupt');
    }, { id: corruptId });
    await corrupt.goto(base);
    await corrupt.waitForFunction(() => window.__M11_READY__);
    assert.equal(await corrupt.evaluate(() => window.__M6_PROJECT__().circuit.components.length), 0,
      'corrupt active draft must not be replaced by the starter example');
    assert.equal(await corrupt.evaluate((id) => localStorage.getItem(`teach-lab.simulator.project.v2.tab.${id}`), corruptId), '{corrupt',
      'corrupt bytes must remain available for recovery');
    await corruptContext.close();

    const controllerCorruptContext = await browser.newContext({ serviceWorkers: 'block' });
    const controllerCorrupt = await controllerCorruptContext.newPage();
    const controllerId = '22222222-2222-4222-8222-222222222222';
    const controllerProfiles = [
      ['board.rp2040-pico-v1', '#pico-message', '#pico-save'],
      ['board.esp32-c3-devmodule-v1', '#c3-message', '#c3-save'],
      ['board.stm32f429zi-nucleo144-v1', '#stm32-message', '#stm32-save'],
    ];
    await controllerCorrupt.addInitScript(({ id, profiles }) => {
      sessionStorage.setItem('intent-mcu.active-draft-id.v1', id);
      for (const [profile] of profiles) {
        localStorage.setItem(`intent-mcu.profile-draft.v1.${profile}.tab.${id}`, `{corrupt-${profile}`);
      }
    }, { id: controllerId, profiles: controllerProfiles });
    await controllerCorrupt.goto(base);
    await controllerCorrupt.waitForFunction(() => window.__M11_READY__);
    for (const [profile, message, save] of controllerProfiles) {
      const key = `intent-mcu.profile-draft.v1.${profile}.tab.${controllerId}`;
      assert.equal(await controllerCorrupt.evaluate((value) => localStorage.getItem(value), key), `{corrupt-${profile}`,
        `${profile}: corrupt profile bytes were overwritten during startup`);
      assert.match(await controllerCorrupt.textContent(message), /original bytes remain untouched/iu,
        `${profile}: corrupt profile draft did not expose recovery guidance`);
      assert.equal(await controllerCorrupt.locator(save).isDisabled(), false,
        `${profile}: Download copy must remain available`);
    }
    await controllerCorruptContext.close();

    const quotaContext = await browser.newContext({ serviceWorkers: 'block' });
    const quota = await quotaContext.newPage();
    await quota.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key, value) {
        if (String(key).includes('teach-lab.simulator.project.v2')) {
          throw new DOMException('Storage quota test', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });
    await quota.goto(base);
    await quota.waitForFunction(() => window.__M11_READY__);
    await quota.click('#beginner-scratch');
    await quota.waitForFunction(() => window.__M6_PROJECT__().circuit.components.length === 0);
    await quota.keyboard.press('Escape');
    await quota.evaluate(() => window.__M6_IMPORT__(JSON.stringify({ ...window.__M6_PROJECT__(),
      metadata: { ...window.__M6_PROJECT__().metadata, name: 'Unsaved in-memory work' } })));
    assert.equal(await quota.evaluate(() => window.__M6_PROJECT__().metadata.name), 'Unsaved in-memory work');
    assert.equal(await quota.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), 0);
    assert.equal(await quota.locator('#recovery-export').isDisabled(), false,
      'failed local persistence must expose recovery download');
    await quotaContext.close();

    const controllerQuotaContext = await browser.newContext({ serviceWorkers: 'block' });
    const controllerQuota = await controllerQuotaContext.newPage();
    await controllerQuota.addInitScript(() => {
      window.__profileSetKeys = [];
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key, value) {
        if (String(key).includes('intent-mcu.profile-draft.v1.')) {
          window.__profileSetKeys.push(String(key));
          throw new DOMException('Profile draft quota test', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });
    await controllerQuota.goto(base);
    await controllerQuota.waitForFunction(() => window.__M11_READY__);
    await controllerQuota.selectOption('#board-select', 'board.rp2040-pico-v1');
    await controllerQuota.evaluate(() => {
      const source = document.querySelector('#pico-source');
      source.value += '\n// unsaved profile work';
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await controllerQuota.waitForTimeout(250);
    assert.ok((await controllerQuota.evaluate(() => window.__profileSetKeys)).length > 0,
      'profile draft persistence was not attempted');
    assert.match(await controllerQuota.textContent('#project-message'), /in-memory project remains usable/iu);
    assert.match(await controllerQuota.textContent('#project-message'), /use Save copy before leaving/iu);
    assert.equal(await controllerQuota.locator('#pico-save').isDisabled(), false,
      'profile quota failure must leave Download copy available');
    assert.equal(await controllerQuota.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), 0);
    await controllerQuotaContext.close();

    process.stdout.write(`${JSON.stringify({ result: 'pass', startupProfilesPersistedLosslessly: 3, corruptDraftAtomic: true,
      controllerCorruptDraftsAtomic: 3, quotaFailureKeepsInMemoryWork: true,
      controllerQuotaFailureVisible: true, recoveryDownloadEnabled: true, nativeBuilds: 0, nativeRuns: 0 })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
