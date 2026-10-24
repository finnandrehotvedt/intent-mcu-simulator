// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';
import { createBrowserSessionHttpHandler } from '../src/browser-session-http.mjs';
import { createBrowserSessionRelay } from '../src/browser-session-relay.mjs';

const run = (command, args, input) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (value) => { stdout += value; });
  child.stderr.on('data', (value) => { stderr += value; });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`${stderr}\nexit ${code}`)));
  child.stdin.end(input);
});

test('transport fixture correlates an independent CLI over real HTTP', async (context) => {
  const relay = createBrowserSessionRelay();
  let origin;
  const server = createServer(async (request, response) => {
    const handled = await createBrowserSessionHttpHandler(relay, { publicOrigin: origin })(request, response);
    if (!handled) { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const registered = relay.registerOwner({ sessionId: 'session-integration', projectId: 'project-integration',
    tabId: 'tab-integration', revision: 7 });
  const pairing = relay.createPairing({ sessionId: 'session-integration',
    ownerCapability: registered.ownerCapability });
  const owner = setInterval(() => {
    const pulled = relay.pull({ sessionId: 'session-integration', ownerCapability: registered.ownerCapability });
    if (pulled.code !== 'API_COMMAND_AVAILABLE') return;
    const data = pulled.request.command === 'capabilities.list'
      ? { commands: ['capabilities.list', 'component.pins'] }
      : { component_id: 'led-placed-1', pins: [
        { id: 'ANODE', label: 'Anode', role: 'power', connected: true },
        { id: 'CATHODE', label: 'Cathode', role: 'ground', connected: true },
      ] };
    relay.complete({ sessionId: 'session-integration', ownerCapability: registered.ownerCapability,
      result: { schema: 'intent-mcu-browser-session-result@1', request_id: pulled.request.request_id,
        status: 'accepted', code: 'API_READ', revision_before: 7, revision_after: 7,
        changes: [], ...data } });
  }, 10);
  context.after(() => clearInterval(owner));

  const stdout = await run(process.execPath, ['tools/browser-session-readonly-client.mjs', origin,
    'led-placed-1'], `${pairing.pairingSecret}\n`);
  const output = JSON.parse(stdout);
  assert.equal(output.status, 'pass');
  assert.equal(output.component_id, 'led-placed-1');
  assert.deepEqual(output.pins.map((pin) => pin.id), ['ANODE', 'CATHODE']);

  const rejected = await fetch(`${origin}/api/session/v1`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.invalid' },
    body: JSON.stringify({ operation: 'pairing.claim', pairingSecret: 'not-a-secret', scopes: ['discover'] }) });
  assert.equal(rejected.status, 403);
  assert.equal((await rejected.json()).code, 'API_ORIGIN');
});
