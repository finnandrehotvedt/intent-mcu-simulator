// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const base = process.env.DRAFT_SAFETY_URL || 'http://127.0.0.1:18932';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
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

    process.stdout.write(`${JSON.stringify({ result: 'pass', corruptDraftAtomic: true,
      quotaFailureKeepsInMemoryWork: true, recoveryDownloadEnabled: true, nativeBuilds: 0, nativeRuns: 0 })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
