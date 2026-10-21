// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

const base = process.env.M2_ADAPTER_TEST_URL || 'http://127.0.0.1:18766';
const visible = process.env.M2_EXPECT_VISIBLE === '1';

function startAdapter(extraEnvironment = {}) {
  const child = spawn(process.execPath, ['tools/external-client-adapter.mjs'], {
    cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'test',
      INTENT_MCU_ADAPTER_TEST_ORIGIN: new URL(base).origin, ...extraEnvironment },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const queued = []; const waiters = [];
  lines.on('line', (line) => {
    const value = JSON.parse(line); const waiter = waiters.shift();
    if (waiter) waiter(value); else queued.push(value);
  });
  const next = () => queued.length ? Promise.resolve(queued.shift())
    : new Promise((resolve) => waiters.push(resolve));
  const send = async (value) => { const response = next(); child.stdin.write(`${JSON.stringify(value)}\n`); return response; };
  return { child, next, send };
}

(async () => {
  const modeEnv = visible ? { INTENT_MCU_ADAPTER_REVIEW_MODE: 'visible' } : {};
  const adapter = startAdapter(modeEnv);
  const exit = new Promise((resolve) => adapter.child.once('exit', resolve));
  try {
    const ready = await adapter.next();
    assert.equal(ready.schema, 'intent-mcu-external-client-ready@1');
    assert.equal(ready.reviewMode, visible ? 'visible' : 'headless');
    assert.equal(ready.humanReviewSurface, visible);
    assert.equal(ready.actions.length, 7);
    assert.equal(ready.actions.includes('patch.apply'), false);
    const first = await adapter.send({ schema: 'intent-mcu-external-client-context-request@1',
      requestId: 'm2-context-first-request' });
    assert.equal(first.ok, true);
    assert.equal(first.context.generation, ready.context.generation);
    assert.equal(first.sourceIdentity.version, ready.sourceIdentity.version);
    const now = Date.now();
    const created = await adapter.send({ schema: 'intent-mcu-bounded-action-request@1',
      action: 'project.create', requestId: 'm2-context-create-request', profile: first.context.profile,
      expectedGeneration: first.context.generation, issuedAtMs: now, expiresAtMs: now + 30_000,
      payload: { starterId: 'avr-thermostat-boundary-v1', firmwareVariant: 'known-bad-equality' } });
    assert.equal(created.ok, true);
    const second = await adapter.send({ schema: 'intent-mcu-external-client-context-request@1',
      requestId: 'm2-context-second-request' });
    assert.equal(second.ok, true);
    assert.equal(second.context.generation, created.generation.after);
    assert(second.context.generation > first.context.generation);
    assert.equal(second.applyAuthority, false);
    assert.equal(second.review.proposalPending, false);
    process.stdout.write(`${JSON.stringify({ status: 'pass', mode: ready.reviewMode,
      humanReviewSurface: ready.humanReviewSurface, generationBefore: first.context.generation,
      generationAfter: second.context.generation, actions: second.actions.length,
      producerActions: 0, applyAuthority: second.applyAuthority })}\n`);
  } finally { adapter.child.stdin.end(); await exit; }
})().catch((error) => { console.error(error); process.exitCode = 1; });
