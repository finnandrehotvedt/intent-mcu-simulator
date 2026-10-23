// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict'); const crypto = require('node:crypto');
const fs = require('node:fs'); const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const origin = process.env.X92_STM32_NATIVE_ORIGIN; const evidence = process.env.X92_STM32_NATIVE_EVIDENCE;
assert.equal(origin, 'http://127.0.0.1:18766'); assert(evidence); const raw = []; const counts = { build: 0, run: 0, quiescence: 0 };
const save = () => fs.writeFileSync(path.join(evidence, 'raw-http.json'), `${JSON.stringify(raw, null, 2)}\n`, { mode: 0o600 });
(async () => { const browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route('**/api/stm32/**', async (route) => { const name = new URL(route.request().url()).pathname.split('/').pop();
    if (!(name in counts) || ++counts[name] > 1) { raw.push({ kind: 'blocked-extra-producer', name }); save(); return route.abort('blockedbyclient'); }
    try { const response = await route.fetch(); const body = (await response.body()).toString('utf8');
      raw.push({ kind: 'http', name, status: response.status(), headers: response.headers(), body }); save();
      await route.fulfill({ response, body });
    } catch (error) { raw.push({ kind: 'transport-error', name, message: error.message }); save(); await route.abort('connectionfailed'); }
  });
  try { const attested = await page.request.get(`${origin}/__private/x92-stm32-target`, { headers: { 'X-X92-STM32-Target': process.env.X92_STM32_TARGET_NONCE } });
    const targetText = await attested.text(); raw.push({ kind: 'target', status: attested.status(), body: targetText }); save();
    assert.equal(attested.status(), 200); const target = JSON.parse(targetText);
    assert.equal(target.gitCommit, process.env.X92_STM32_EXPECTED_GIT); assert.equal(target.distMainSha256, process.env.X92_STM32_EXPECTED_DIST);
    assert.equal(target.stm32Service, true); assert.equal(target.defaultProviders, true);
    const main = await page.request.get(`${origin}/main.js`); const mainBytes = await main.body();
    const downloaded = crypto.createHash('sha256').update(mainBytes).digest('hex');
    raw.push({ kind: 'downloaded-main', status: main.status(), sha256: downloaded }); save();
    assert.equal(downloaded, process.env.X92_STM32_EXPECTED_DIST); assert.deepEqual(counts, { build: 0, run: 0, quiescence: 0 });
    assert.equal((await page.goto(origin, { waitUntil: 'domcontentloaded' }))?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ && window.__AGENT_ACTIONS__);
    await page.selectOption('#board-select', 'board.stm32f429zi-nucleo144-v1');
    await page.waitForFunction(() => window.__STM32_PUBLIC_WORKBENCH__?.state().active === true);
    await page.click('#quick-build'); await page.waitForFunction(() => window.__STM32_PUBLIC_WORKBENCH__.state().phase === 'built');
    await page.click('#brief-tests-open'); await page.click('#x92-budget-start');
    const result = await page.evaluate(async () => window.__AGENT_ACTIONS__.execute(window.__AGENT_ACTIONS__.request('runtime.run', {}, { requestId: 'x92-stm32-native-proof', ttlMs: 30000 })));
    fs.writeFileSync(path.join(evidence, 'raw-result.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    assert.deepEqual(counts, { build: 1, run: 1, quiescence: 1 }); assert.equal(result.ok, true);
    assert.equal(result.privatePermitAccepted, true); assert.equal(result.completion.processExited, true);
    assert.equal(result.completion.daemonContainerAbsent, true); assert.equal(result.completion.completedNaturally, true);
    assert.match(result.completion.signature, /^[a-f0-9]{64}$/u); assert.deepEqual(result.completion.binding, result.result.executionIdentity);
    assert.equal(result.result.runtime.engine.id, 'renode'); assert.equal(result.result.runtime.engine.actualExecution, true);
    assert.equal(result.experimentBudget.charged.runs, 1); await page.screenshot({ path: path.join(evidence, 'product.png'), fullPage: true });
  } catch (error) { save(); fs.writeFileSync(path.join(evidence, 'failure.json'), `${JSON.stringify({ name: error.name, message: error.message, stack: error.stack, counts, raw }, null, 2)}\n`, { flag: 'wx', mode: 0o600 }); throw error;
  } finally { save(); await browser.close(); } })().catch((error) => { console.error(error); process.exitCode = 1; });
