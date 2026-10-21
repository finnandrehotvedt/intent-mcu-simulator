// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

const base = process.env.M2_ADAPTER_TEST_URL || 'http://127.0.0.1:18766';

(async () => {
  const child = spawn(process.execPath, ['tools/mcp-adapter.mjs'], {
    cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'test',
      INTENT_MCU_ADAPTER_TEST_ORIGIN: new URL(base).origin },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const exit = new Promise((resolve) => child.once('exit', resolve));
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const pending = new Map();
  lines.on('line', (line) => {
    const value = JSON.parse(line); const waiter = pending.get(value.id);
    if (waiter) { pending.delete(value.id); waiter(value); }
  });
  let sequence = 0;
  const request = (method, params = {}) => new Promise((resolve) => {
    sequence += 1; pending.set(sequence, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: sequence, method, params })}\n`);
  });
  const tool = async (name, args) => (await request('tools/call', { name, arguments: args })).result.structuredContent;
  try {
    const initialized = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {},
      clientInfo: { name: 'm2-zero-producer-context-proof', version: '1' } });
    assert.equal(initialized.result.protocolVersion, '2025-06-18');
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
    const first = await tool('intent_mcu_context', {});
    assert.equal(first.ok, true);
    assert.equal(first.schema, 'intent-mcu-mcp-context@1');
    const now = Date.now();
    const created = await tool('intent_mcu_action', {
      schema: 'intent-mcu-bounded-action-request@1', action: 'project.create',
      requestId: 'm2-mcp-create-request', profile: first.context.profile,
      expectedGeneration: first.context.generation, issuedAtMs: now, expiresAtMs: now + 30_000,
      payload: { starterId: 'avr-thermostat-boundary-v1', firmwareVariant: 'known-bad-equality' },
    });
    assert.equal(created.ok, true);
    const second = await tool('intent_mcu_context', {});
    assert.equal(second.context.generation, created.generation.after);
    assert(second.context.generation > first.context.generation);
    assert.equal(second.sourceIdentity.version, first.sourceIdentity.version);
    assert.equal(second.actions.length, 7);
    assert.equal(second.actions.includes('patch.apply'), false);
    assert.equal(second.applyAuthority, false);
    process.stdout.write(`${JSON.stringify({ status: 'pass', transport: 'mcp-stdio',
      generationBefore: first.context.generation, generationAfter: second.context.generation,
      actions: second.actions.length, producerActions: 0, applyAuthority: false })}\n`);
  } finally { child.stdin.end(); await exit; }
})().catch((error) => { console.error(error); process.exitCode = 1; });
