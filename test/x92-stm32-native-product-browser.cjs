// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const origin = process.env.X92_STM32_NATIVE_ORIGIN; const evidence = process.env.X92_STM32_NATIVE_EVIDENCE;
assert.equal(origin, 'https://lab.teachthecompany.com'); assert(evidence); const raw = [];
(async () => { const browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('response', async (response) => { if (!response.url().startsWith(`${origin}/api/stm32/`)) return;
    let body; try { body = await response.text(); } catch (error) { body = `TRANSPORT_ERROR:${error.message}`; }
    raw.push({ url: response.url(), status: response.status(), headers: response.headers(), body });
    fs.writeFileSync(path.join(evidence, 'raw-http.json'), `${JSON.stringify(raw, null, 2)}\n`, { mode: 0o600 }); });
  try { assert.equal((await page.goto(origin, { waitUntil: 'domcontentloaded' }))?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ && window.__AGENT_ACTIONS__);
    await page.selectOption('#board-select', 'board.stm32f429zi-nucleo144-v1');
    await page.waitForFunction(() => window.__STM32_PUBLIC_WORKBENCH__?.state().active === true);
    await page.click('#quick-build'); await page.waitForFunction(() => window.__STM32_PUBLIC_WORKBENCH__.state().phase === 'built');
    await page.click('#brief-tests-open'); await page.click('#x92-budget-start');
    const result = await page.evaluate(async () => window.__AGENT_ACTIONS__.execute(
      window.__AGENT_ACTIONS__.request('runtime.run', {}, { requestId: 'x92-stm32-native-proof', ttlMs: 30000 })));
    fs.writeFileSync(path.join(evidence, 'raw-result.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await page.screenshot({ path: path.join(evidence, 'product.png'), fullPage: true });
    assert.equal(result.ok, true); assert.equal(result.privatePermitAccepted, true);
    assert.equal(result.completion.processExited, true); assert.equal(result.completion.daemonContainerAbsent, true);
    assert.equal(result.completion.completedNaturally, true); assert.match(result.completion.signature, /^[a-f0-9]{64}$/u);
    assert.deepEqual(result.completion.binding, result.result.executionIdentity);
    assert.equal(result.result.runtime.engine.id, 'renode'); assert.equal(result.result.runtime.engine.actualExecution, true);
    assert.equal(result.experimentBudget.charged.runs, 1);
  } catch (error) { fs.writeFileSync(path.join(evidence, 'failure.json'), `${JSON.stringify({ name: error.name, message: error.message, stack: error.stack, raw }, null, 2)}\n`, { flag: 'wx', mode: 0o600 }); throw error;
  } finally { await browser.close(); } })().catch((error) => { console.error(error); process.exitCode = 1; });
