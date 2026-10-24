// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const run = (args) => new Promise((resolve) => {
  const child = spawn(process.execPath, ['tools/browser-session-edit-client.mjs', ...args],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('close', (code) => resolve({ code, stderr }));
});

test('strict local pairing ticket is removed before network use', async (context) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'intent-mcu-pairing-ticket-'));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  const ticketPath = path.join(fixture, 'pairing.intentpair');
  await writeFile(ticketPath, `${JSON.stringify({
    schema: 'intent-mcu-browser-session-pairing-ticket@1',
    origin: 'http://127.0.0.1:1',
    pairing_secret: 'test-only-one-use-secret',
    expires_at: Date.now() + 60_000,
    scopes: ['discover', 'read_project'],
  })}\n`);
  const result = await run(['--ticket', ticketPath]);
  assert.notEqual(result.code, 0);
  await assert.rejects(access(ticketPath));
  assert.doesNotMatch(result.stderr, /test-only-one-use-secret/u);
});

test('expired ticket fails closed and is still removed', async (context) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'intent-mcu-pairing-expired-'));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  const ticketPath = path.join(fixture, 'pairing.intentpair');
  await writeFile(ticketPath, JSON.stringify({
    schema: 'intent-mcu-browser-session-pairing-ticket@1', origin: 'https://lab.teachthecompany.com/',
    pairing_secret: 'expired-test-secret', expires_at: Date.now() - 1,
    scopes: ['discover', 'read_project'],
  }));
  const result = await run(['--ticket', ticketPath]);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /API_PAIRING_TICKET_SHAPE/u);
  await assert.rejects(access(ticketPath));
  assert.doesNotMatch(result.stderr, /expired-test-secret/u);
});
