// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.EXTERNAL_CLIENT_TEST_URL || 'http://127.0.0.1:18766';

function runExternalExample() {
  return new Promise((resolve, reject) => {
    const target = new URL(base);
    const adapterEnv = { ...process.env };
    if (target.protocol === 'http:' && target.hostname === '127.0.0.1') {
      adapterEnv.NODE_ENV = 'test';
      adapterEnv.INTENT_MCU_ADAPTER_TEST_ORIGIN = target.origin;
    } else {
      delete adapterEnv.NODE_ENV;
      delete adapterEnv.INTENT_MCU_ADAPTER_TEST_ORIGIN;
    }
    const child = spawn(process.execPath, ['examples/external-client-example.mjs'], {
      cwd: process.cwd(),
      env: adapterEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) { reject(new Error(`external example exit ${code}: ${stderr}\n${stdout}`)); return; }
      const lines = stdout.trim().split('\n').filter(Boolean);
      try { resolve(JSON.parse(lines.at(-1))); }
      catch (error) { reject(new Error(`external example output: ${error.message}\n${stdout}`)); }
    });
  });
}

(async () => {
  const external = await runExternalExample();
  assert.equal(external.status, 'pass');
  assert.equal(external.transport, 'stdio');
  assert.equal(external.origin, new URL(base).origin);
  assert.equal(external.actions.length, 7);
  assert.equal(new Set(external.actions).size, 7);
  assert.equal(external.actions.includes('patch.apply'), false);
  assert.equal(external.applyAuthority, false);
  assert.equal(external.genericCommand, false);
  assert.match(external.artifactIdentity, /^[a-f0-9]{64}$/u);
  assert.equal(external.run.artifactIdentity, external.artifactIdentity);
  assert.equal(external.read.artifactIdentity, external.artifactIdentity);
  assert(external.read.cycle > 0, 'actual runtime cycle missing');
  assert(Array.isArray(external.read.pins) && external.read.pins.length > 0, 'actual pin evidence missing');
  assert.equal(external.read.verdict, null);

  // Test-only page driving is deliberately separate from the stdio client.
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true && Boolean(window.__AGENT_ACTIONS__));
    const direct = await page.evaluate(async () => {
      let sequence = 0;
      const call = async (action, payload = {}) => {
        sequence += 1;
        const request = window.__AGENT_ACTIONS__.request(action, payload,
          { ttlMs: 30_000, requestId: `external-direct-${String(sequence).padStart(2, '0')}-request` });
        return window.__AGENT_ACTIONS__.execute(request);
      };
      await call('project.create', { starterId: 'avr-thermostat-boundary-v1' });
      const proposed = await call('patch.propose', { description: 'Change the thermostat status message while preserving every requirement.' });
      const validated = await call('project.validate');
      const exported = await call('project.export');
      return { prompt: proposed.result.prompt, validation: validated.result, export: exported.result,
        actions: [...window.__AGENT_ACTIONS__.actions] };
    });
    // These are deterministic data bytes. No runtime cycle is normalized or compared.
    assert.equal(external.prompt, direct.prompt);
    assert.deepEqual(external.validation, direct.validation);
    assert.equal(external.export.projectText, direct.export.projectText);
    assert.equal(external.export.projectSha256, direct.export.projectSha256);
    assert.deepEqual(external.actions, direct.actions);
    assert.equal(await page.locator('#project-patch-apply').count(), 1);
    assert.equal(await page.locator('#project-patch-apply').isDisabled(), true,
      'Apply must remain unavailable until a separate browser review');
  } finally { await browser.close(); }

  process.stdout.write(`${JSON.stringify({ status: 'pass', transport: external.transport,
    contracts: external.actions, actualArtifactIdentity: external.artifactIdentity,
    actualRuntimeCycle: external.read.cycle, actualPinCount: external.read.pins.length,
    deterministicPromptBytes: Buffer.byteLength(external.prompt),
    deterministicProjectSha256: external.export.projectSha256,
    clientApplyAuthority: external.applyAuthority, runtimeEqualityFabricated: false })}\n`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
