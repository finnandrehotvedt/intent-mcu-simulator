// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const marker = 'SYNTHETIC_PAIRING_SECRET_MUST_NOT_APPEAR';
const run = (args, env = {}) => new Promise((resolve) => {
  const child = spawn(process.execPath, ['tools/browser-session-edit-client.mjs', ...args],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('close', (code) => resolve({ code, stdout, stderr }));
});
const ticket = (origin, overrides = {}) => ({
  schema: 'intent-mcu-browser-session-pairing-ticket@1', origin,
  pairing_secret: marker, expires_at: Date.now() + 60_000,
  scopes: ['discover', 'read_project'], ...overrides,
});
async function fixture(context, contents, name = 'pairing.intentpair') {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'intent-mcu-pairing-ticket-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const ticketPath = path.join(directory, name);
  if (contents !== null) await writeFile(ticketPath, contents);
  return { directory, ticketPath };
}
const absent = (file) => assert.rejects(access(file));
const secretSafe = (result) => {
  assert.notEqual(result.code, 0);
  assert.doesNotMatch(result.stdout, new RegExp(marker, 'u'));
  assert.doesNotMatch(result.stderr, new RegExp(marker, 'u'));
};

test('malformed secret-bearing JSON returns one fixed code and is deleted', async (context) => {
  const { ticketPath } = await fixture(context, `{"pairing_secret":"${marker}",BROKEN}`);
  const result = await run(['--ticket', ticketPath]);
  secretSafe(result); assert.match(result.stderr, /API_PAIRING_TICKET_SHAPE/u);
  await absent(ticketPath);
});

test('missing, oversized and expired tickets fail closed without secret output', async (context) => {
  const missing = await fixture(context, null, 'missing.intentpair');
  assert.notEqual((await run(['--ticket', missing.ticketPath])).code, 0);
  const oversized = await fixture(context, `${marker}${'x'.repeat(5000)}`, 'oversized.intentpair');
  const oversizedResult = await run(['--ticket', oversized.ticketPath]);
  secretSafe(oversizedResult); assert.match(oversizedResult.stderr, /API_PAIRING_TICKET_LIMIT/u); await absent(oversized.ticketPath);
  const expired = await fixture(context, JSON.stringify(ticket('https://lab.teachthecompany.com',
    { expires_at: Date.now() - 1 })), 'expired.intentpair');
  const expiredResult = await run(['--ticket', expired.ticketPath]);
  secretSafe(expiredResult); assert.match(expiredResult.stderr, /API_PAIRING_TICKET_SHAPE/u); await absent(expired.ticketPath);
});

test('foreign, credentialed, path, query and insecure non-loopback origins make zero requests', async (context) => {
  let requests = 0;
  const server = createServer((_request, response) => { requests += 1; response.end('{}'); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const origins = ['https://example.invalid', `http://user:pass@127.0.0.1:${port}`,
    `http://127.0.0.1:${port}/path`, `http://127.0.0.1:${port}?query=1`,
    `http://127.0.0.1:${port}#fragment`, 'http://192.0.2.10:8123', `http://127.0.0.1:${port}`];
  for (const [index, origin] of origins.entries()) {
    const { ticketPath } = await fixture(context, JSON.stringify(ticket(origin)), `origin-${index}.intentpair`);
    const result = await run(['--ticket', ticketPath]);
    secretSafe(result); assert.match(result.stderr, /API_PAIRING_TICKET_ORIGIN/u); await absent(ticketPath);
  }
  assert.equal(requests, 0);
});

test('ticket scope mismatch is rejected before network access', async (context) => {
  let requests = 0;
  const server = createServer((_request, response) => { requests += 1; response.end('{}'); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const { directory, ticketPath } = await fixture(context, JSON.stringify(ticket(origin)));
  const planPath = path.join(directory, 'plan.json');
  await writeFile(planPath, JSON.stringify({ schema: 'intent-mcu-browser-session-plan@1',
    commands: [{ command: 'component.add', id: 'led-safe', type: 'led.basic-v1', x: 1, y: 1 }] }));
  const result = await run(['--ticket', ticketPath, planPath], { INTENT_MCU_ALLOW_LOOPBACK_TICKET: '1' });
  secretSafe(result); assert.match(result.stderr, /API_PAIRING_TICKET_SCOPE/u);
  assert.equal(requests, 0); await absent(ticketPath);
});

test('explicit loopback mode reaches only the allowed origin and refuses redirects', async (context) => {
  let redirectTargetRequests = 0;
  const target = createServer((_request, response) => { redirectTargetRequests += 1; response.end('{}'); });
  await new Promise((resolve) => target.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => target.close(resolve)));
  let sourceRequests = 0;
  const source = createServer((_request, response) => {
    sourceRequests += 1; response.writeHead(302, { Location: `http://127.0.0.1:${target.address().port}/capture` }); response.end();
  });
  await new Promise((resolve) => source.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => source.close(resolve)));
  const { ticketPath } = await fixture(context, JSON.stringify(ticket(`http://127.0.0.1:${source.address().port}`)));
  const result = await run(['--ticket', ticketPath], { INTENT_MCU_ALLOW_LOOPBACK_TICKET: '1' });
  secretSafe(result); assert.match(result.stderr, /fetch failed/iu);
  assert.equal(sourceRequests, 1); assert.equal(redirectTargetRequests, 0); await absent(ticketPath);
});
