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

test('session with closed stdin preserves the one-use ticket before any network request', async (context) => {
  let requests = 0;
  const server = createServer((_request, response) => { requests += 1; response.end('{}'); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const { ticketPath } = await fixture(context, JSON.stringify(ticket(origin)));
  const result = await run(['--session', ticketPath], { INTENT_MCU_ALLOW_LOOPBACK_TICKET: '1' });
  secretSafe(result); assert.match(result.stderr, /API_SESSION_STDIN_REQUIRED/u);
  assert.equal(requests, 0); await access(ticketPath);
});

test('open pipe buffers an immediate inspect command before ticket claim completes', async (context) => {
  const pending = new Map();
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8'); request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const input = JSON.parse(body); let value;
      if (input.operation === 'pairing.claim') value = { ok: true, sessionId: 'session-pipe-0001',
        projectId: 'project-pipe-0001', clientCapability: 'synthetic-capability',
        scopes: ['discover', 'read_project'], revision: 0, expiresAt: Date.now() + 900_000 };
      else if (input.operation === 'request.submit') {
        pending.set(input.request.request_id, input.request.command);
        value = { ok: true, code: 'API_REQUEST_QUEUED' };
      } else if (input.operation === 'result.read') {
        const command = pending.get(input.requestId); const common = { status: 'accepted',
          code: 'OK', revision_before: 0, revision_after: 0, changes: [] };
        value = command === 'capabilities.list' ? { ...common, commands: [] }
          : command === 'project.inspect' ? { ...common, project: { circuit: { components: [], nets: [] } } }
            : command === 'components.catalog' ? { ...common, profile: 'board.atmega328p-16mhz-v1', components: {} }
              : command === 'components.list' ? { ...common, components: [] }
                : command === 'nets.list' ? { ...common, nets: [] }
                  : { ...common, validation: { ok: true } };
      } else value = { ok: false, code: 'API_UNEXPECTED' };
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const { ticketPath } = await fixture(context, JSON.stringify(ticket(origin)));
  const child = spawn(process.execPath, ['tools/browser-session-edit-client.mjs', '--session', ticketPath],
    { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, INTENT_MCU_ALLOW_LOOPBACK_TICKET: '1' } });
  let output = ''; child.stdout.on('data', (chunk) => { output += chunk; });
  child.stdin.write('{"command":"inspect"}\n');
  const deadline = Date.now() + 4_000;
  while (!output.includes('"mode":"inspected"') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.match(output, /"mode":"inspected"/u);
  child.stdin.end('{"command":"close"}\n');
  assert.equal(await new Promise((resolve) => child.on('close', resolve)), 0);
  assert.match(output, /API_SESSION_LOCAL_CLOSED/u);
  await absent(ticketPath);
});

test('ambiguous submit retries the exact request id and payload before continuing', async (context) => {
  const pending = new Map(); const submissions = []; let dropped = false;
  const server = createServer((request, response) => {
    let body = ''; request.setEncoding('utf8'); request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const input = JSON.parse(body); let value;
      if (input.operation === 'pairing.claim') value = { ok: true, sessionId: 'session-reconcile-0001',
        projectId: 'project-reconcile-0001', clientCapability: 'synthetic-capability',
        scopes: ['discover', 'read_project'], revision: 0, expiresAt: Date.now() + 900_000 };
      else if (input.operation === 'request.submit') {
        submissions.push(structuredClone(input.request));
        if (!dropped) { dropped = true; pending.set(input.request.request_id, input.request.command);
          request.socket.destroy(); return; }
        if (submissions.length === 2) value = { ok: true, code: 'API_REQUEST_RECONCILE',
          reconciliation: { request_id: input.request.request_id, status: 'pending' } };
        else { pending.set(input.request.request_id, input.request.command);
          value = { ok: true, code: 'API_REQUEST_QUEUED' }; }
      } else if (input.operation === 'result.read') {
        const command = pending.get(input.requestId); const common = { status: 'accepted',
          code: 'OK', revision_before: 0, revision_after: 0, changes: [] };
        value = command === 'capabilities.list' ? { ...common, commands: [] }
          : command === 'project.inspect' ? { ...common, project: { circuit: { components: [], nets: [] } } }
            : command === 'components.catalog' ? { ...common, profile: 'board.atmega328p-16mhz-v1', components: {} }
              : command === 'components.list' ? { ...common, components: [] }
                : command === 'nets.list' ? { ...common, nets: [] }
                  : { ...common, validation: { ok: true } };
      } else value = { ok: false, code: 'API_UNEXPECTED' };
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const { ticketPath } = await fixture(context, JSON.stringify(ticket(origin)));
  const child = spawn(process.execPath, ['tools/browser-session-edit-client.mjs', '--session', ticketPath],
    { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, INTENT_MCU_ALLOW_LOOPBACK_TICKET: '1' } });
  let output = ''; child.stdout.on('data', (chunk) => { output += chunk; });
  child.stdin.write('{"command":"inspect"}\n');
  const deadline = Date.now() + 6_000;
  while (!output.includes('"mode":"inspected"') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.match(output, /"mode":"inspected"/u);
  assert.equal(submissions.length >= 2, true);
  assert.deepEqual(submissions[1], submissions[0]);
  child.stdin.end('{"command":"close"}\n');
  assert.equal(await new Promise((resolve) => child.on('close', resolve)), 0);
  await absent(ticketPath);
});

test('inspect resynchronizes revision before later read-only discovery requests', async (context) => {
  const pending = new Map(); const submitted = [];
  const server = createServer((request, response) => {
    let body = ''; request.setEncoding('utf8'); request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const input = JSON.parse(body); let value;
      if (input.operation === 'pairing.claim') value = { ok: true, sessionId: 'session-resync-0001',
        projectId: 'project-resync-0001', clientCapability: 'synthetic-capability',
        scopes: ['discover', 'read_project'], revision: 0, expiresAt: Date.now() + 900_000 };
      else if (input.operation === 'request.submit') {
        submitted.push(structuredClone(input.request)); pending.set(input.request.request_id, input.request.command);
        value = { ok: true, code: 'API_REQUEST_QUEUED' };
      } else if (input.operation === 'result.read') {
        const command = pending.get(input.requestId); const common = { status: 'accepted', code: 'OK',
          revision_before: command === 'project.inspect' ? 0 : 4, revision_after: 4, changes: [] };
        value = command === 'project.inspect' ? { ...common, project: { circuit: { components: [], nets: [] } } }
          : command === 'capabilities.list' ? { ...common, commands: [] }
            : command === 'components.catalog' ? { ...common, profile: 'board.atmega328p-16mhz-v1', components: {} }
              : command === 'components.list' ? { ...common, components: [] }
                : command === 'nets.list' ? { ...common, nets: [] }
                  : { ...common, validation: { ok: true } };
      } else value = { ok: false, code: 'API_UNEXPECTED' };
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { ticketPath } = await fixture(context, JSON.stringify(ticket(`http://127.0.0.1:${server.address().port}`)));
  const child = spawn(process.execPath, ['tools/browser-session-edit-client.mjs', '--session', ticketPath],
    { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, INTENT_MCU_ALLOW_LOOPBACK_TICKET: '1' } });
  let output = ''; child.stdout.on('data', (chunk) => { output += chunk; }); child.stdin.write('{"command":"inspect"}\n');
  const deadline = Date.now() + 4_000;
  while (!output.includes('"mode":"inspected"') && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(output, /"mode":"inspected"/u);
  assert.equal(submitted[0].command, 'project.inspect'); assert.equal(submitted[0].expected_revision, 0);
  assert(submitted.slice(1).every((request) => request.expected_revision === 4));
  child.stdin.end('{"command":"close"}\n'); assert.equal(await new Promise((resolve) => child.on('close', resolve)), 0);
});

test('terminal authentication rejection is reported once and closes the retained client', async (context) => {
  let submissions = 0;
  const server = createServer((request, response) => {
    let body = ''; request.setEncoding('utf8'); request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const input = JSON.parse(body); const value = input.operation === 'pairing.claim'
        ? { ok: true, sessionId: 'session-revoked-0001', projectId: 'project-revoked-0001',
          clientCapability: 'synthetic-capability', scopes: ['discover', 'read_project'], revision: 0,
          expiresAt: Date.now() + 900_000 }
        : (submissions += 1, { ok: false, code: 'API_AUTH_REQUIRED' });
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { ticketPath } = await fixture(context, JSON.stringify(ticket(`http://127.0.0.1:${server.address().port}`)));
  const child = spawn(process.execPath, ['tools/browser-session-edit-client.mjs', '--session', ticketPath],
    { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, INTENT_MCU_ALLOW_LOOPBACK_TICKET: '1' } });
  let output = ''; child.stdout.on('data', (chunk) => { output += chunk; }); child.stdin.write('{"command":"inspect"}\n');
  assert.equal(await new Promise((resolve) => child.on('close', resolve)), 0);
  assert.match(output, /API_AUTH_REQUIRED/u); assert.equal(submissions, 1);
});

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
