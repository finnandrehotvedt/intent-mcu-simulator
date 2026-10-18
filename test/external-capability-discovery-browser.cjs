// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const base = process.env.EXTERNAL_CLIENT_TEST_URL || 'http://127.0.0.1:18766';

const target = new URL(base);
const env = { ...process.env };
if (target.protocol === 'http:' && target.hostname === '127.0.0.1') {
  env.NODE_ENV = 'test'; env.INTENT_MCU_ADAPTER_TEST_ORIGIN = target.origin;
}
const child = spawn(process.execPath, ['examples/external-capability-discovery-example.mjs'], {
  cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = ''; let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk; });
child.stderr.on('data', (chunk) => { stderr += chunk; });
child.on('exit', (code) => {
  if (code !== 0) throw new Error(`discovery example exit ${code}: ${stderr}\n${stdout}`);
  const result = JSON.parse(stdout.trim().split('\n').filter(Boolean).at(-1));
  assert.equal(result.status, 'pass');
  assert.equal(result.ready.actions.length, 7);
  assert.equal(result.ready.discoveryReadOnly, true);
  assert.equal(result.discovery.executed, false);
  assert.equal(result.discovery.discovery.profiles.length, 4);
  assert.equal(result.discovery.discovery.parts.length, 19);
  assert.equal(result.supported.ok, true);
  assert.equal(result.supported.action, 'project.create');
  assert.equal(result.unsupportedCapability.status, 'unavailable');
  assert.equal(result.unsupportedVersion.code, 'CAPABILITY_DISCOVERY_VERSION_UNSUPPORTED');
  assert.equal(result.unsupportedVersion.executed, false);
  assert.equal(result.rejectedAction.code, 'ACTION_UNSUPPORTED');
  assert.equal(result.rejectedAction.executed, false);
  process.stdout.write(`${JSON.stringify({ status: 'pass', profiles: 4, parts: 19,
    supportedAction: result.supported.action, unsupportedCapability: 'Pico ADC',
    unsupportedVersion: result.unsupportedVersion.code, inventedAction: result.rejectedAction.code })}\n`);
});
