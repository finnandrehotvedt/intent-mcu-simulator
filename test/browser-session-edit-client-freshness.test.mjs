// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';

const secretMarker = 'SYNTHETIC_SECRET_VALUE_MUST_NOT_LEAK';
const clone = (value) => structuredClone(value);

function sessionClient(ticketPath) {
  const child = spawn(process.execPath, ['tools/browser-session-edit-client.mjs', '--session', ticketPath], {
    stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, INTENT_MCU_ALLOW_LOOPBACK_TICKET: '1' },
  });
  const queued = []; const waiting = []; let stderr = '';
  createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', (line) => {
    const value = JSON.parse(line); const resolve = waiting.shift();
    if (resolve) resolve(value); else queued.push(value);
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const next = () => queued.length ? Promise.resolve(queued.shift())
    : new Promise((resolve) => waiting.push(resolve));
  const send = (value) => { child.stdin.write(`${JSON.stringify(value)}\n`); return next(); };
  const done = new Promise((resolve, reject) => child.on('close', (code) => code === 0
    ? resolve() : reject(new Error(`${stderr}\nexit ${code}`))));
  return { send, next, done, output: () => ({ stderr, queued: clone(queued) }) };
}

test('persistent client refreshes mutable pins, drops removed IDs and preserves one stable property error',
  async (context) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'intent-mcu-client-freshness-'));
    context.after(() => rm(directory, { recursive: true, force: true }));
    const catalog = {
      profile: 'board.atmega328p-16mhz-v1',
      components: {
        'board.atmega328p-16mhz-v1': { propertyKeys: [], pins: [{ id: 'D4' }, { id: 'GND2' }] },
        'resistor.fixed-v1': { propertyKeys: ['ohms'], pins: [{ id: 'A' }, { id: 'B' }] },
        'led.basic-v1': { propertyKeys: ['color'], pins: [{ id: 'ANODE' }, { id: 'CATHODE' }] },
      },
    };
    let components = [{ id: 'board-1', type: 'board.atmega328p-16mhz-v1' }];
    let nets = []; let revision = 0; let transactionNumber = 0;
    const transactions = new Map(); const pending = new Map(); const pinRequests = [];
    const snapshot = () => ({ components: clone(components), nets: clone(nets) });
    const install = (value) => { components = clone(value.components); nets = clone(value.nets); };
    const connected = (component, pin) => nets.some((net) => net.endpoints
      .some((endpoint) => endpoint.component === component && endpoint.pin === pin));
    const componentPins = (componentId) => {
      const component = components.find(({ id }) => id === componentId);
      if (!component) return null;
      return catalog.components[component.type].pins.map(({ id }) => ({
        id, label: id, role: 'signal', connected: connected(component.id, id),
      }));
    };
    const result = (request, value) => ({ status: 'accepted', code: 'OK',
      revision_before: request.expected_revision, revision_after: revision, changes: [], ...value });
    const applyBatch = (request) => {
      const commands = request.arguments.commands;
      if (commands.some(({ command, value }) => command === 'component.property.set' && value === -1)) {
        return result(request, { status: 'rejected', code: 'INVALID_COMPONENT_PROPERTIES' });
      }
      if (commands.some(({ command, value }) => command === 'component.property.set' && value === 13)) {
        return result(request, { status: 'rejected', code: `internal ${secretMarker}` });
      }
      const before = snapshot();
      for (const command of commands) {
        if (command.command === 'component.add') components.push({ id: command.id, type: command.type });
        if (command.command === 'component.remove') {
          components = components.filter(({ id }) => id !== command.component_id);
          nets = nets.filter((net) => !net.endpoints.some(({ component }) => component === command.component_id));
        }
        if (command.command === 'wire.connect') nets.push({ id: command.net_id,
          endpoints: [clone(command.from), clone(command.to)] });
        if (command.command === 'wire.disconnect') nets = nets.filter(({ id }) => id !== command.net_id);
      }
      revision += 1; const transactionId = `synthetic-transaction-${++transactionNumber}`;
      transactions.set(transactionId, { before, after: snapshot() });
      return result(request, { code: 'API_BATCH_COMMITTED', transaction_id: transactionId,
        changes: commands.map(({ command }) => ({ operation: command })) });
    };
    const commandResult = (request) => {
      if (request.command !== 'project.inspect' && request.expected_revision !== revision) {
        return result(request, { status: 'rejected', code: 'API_STALE_REVISION' });
      }
      if (request.command === 'project.inspect') return result(request, { code: 'API_PROJECT_READ',
        project: { circuit: snapshot() } });
      if (request.command === 'capabilities.list') return result(request, { commands: [
        'capabilities.list', 'components.catalog', 'project.inspect', 'components.list', 'component.pins',
        'nets.list', 'circuit.validate', 'edit.batch', 'edit.undo', 'edit.redo',
      ] });
      if (request.command === 'components.catalog') return result(request, catalog);
      if (request.command === 'components.list') return result(request, { components: clone(components) });
      if (request.command === 'nets.list') return result(request, { nets: clone(nets) });
      if (request.command === 'component.pins') {
        pinRequests.push({ revision, component_id: request.arguments.component_id,
          type: components.find(({ id }) => id === request.arguments.component_id)?.type });
        const pins = componentPins(request.arguments.component_id);
        return pins ? result(request, { pins })
          : result(request, { status: 'rejected', code: 'API_COMPONENT_UNKNOWN' });
      }
      if (request.command === 'circuit.validate') return result(request, { validation: { ok: true } });
      if (request.command === 'edit.batch') return applyBatch(request);
      if (request.command === 'edit.undo') {
        const transaction = transactions.get(request.arguments.transaction_id);
        if (!transaction) return result(request, { status: 'rejected', code: 'API_TRANSACTION_UNKNOWN' });
        install(transaction.before); revision += 1;
        return result(request, { code: 'API_TRANSACTION_UNDONE', transaction_id: request.arguments.transaction_id });
      }
      return result(request, { status: 'rejected', code: 'API_COMMAND_UNSUPPORTED' });
    };
    const server = createServer((request, response) => {
      let body = ''; request.setEncoding('utf8'); request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        const input = JSON.parse(body); let value;
        if (input.operation === 'pairing.claim') value = { ok: true, sessionId: 'session-freshness-0001',
          projectId: 'project-freshness-0001', clientCapability: 'synthetic-client-capability',
          scopes: ['discover', 'read_project', 'edit_circuit'], revision, expiresAt: Date.now() + 900_000 };
        else if (input.operation === 'request.submit') {
          pending.set(input.request.request_id, clone(input.request));
          value = { ok: true, code: 'API_REQUEST_QUEUED' };
        } else if (input.operation === 'result.read') {
          const queued = pending.get(input.requestId); value = commandResult(queued); pending.delete(input.requestId);
        } else value = { ok: false, code: 'API_UNEXPECTED' };
        response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value));
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    context.after(() => new Promise((resolve) => server.close(resolve)));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const ticketPath = path.join(directory, 'pairing.intentpair');
    await writeFile(ticketPath, JSON.stringify({ schema: 'intent-mcu-browser-session-pairing-ticket@1', origin,
      pairing_secret: 'synthetic-pairing-secret', expires_at: Date.now() + 60_000,
      scopes: ['discover', 'read_project', 'edit_circuit'] }));
    const client = sessionClient(ticketPath);
    assert.equal((await client.next()).mode, 'session');
    const inspect = () => client.send({ command: 'inspect' });
    const apply = (commands, allowRemoval = false) => client.send({ command: 'apply', plan: {
      schema: 'intent-mcu-browser-session-plan@1', commands,
      ...(allowRemoval ? { allow_component_removal: true } : {}),
    } });
    const pin = (value, component, id) => value.discovery.pins[component].find((item) => item.id === id);

    const initial = await inspect();
    assert.equal(pin(initial, 'board-1', 'D4').connected, false);
    const branchCommands = [
      { command: 'component.add', id: 'fresh-resistor', type: 'resistor.fixed-v1',
        position: { x: 0.5, y: 0.2, rotation: 0 } },
      { command: 'component.add', id: 'fresh-led', type: 'led.basic-v1',
        position: { x: 0.7, y: 0.3, rotation: 0 } },
      { command: 'wire.connect', net_id: 'fresh-drive', from: { component: 'board-1', pin: 'D4' },
        to: { component: 'fresh-resistor', pin: 'A' } },
      { command: 'wire.connect', net_id: 'fresh-series', from: { component: 'fresh-resistor', pin: 'B' },
        to: { component: 'fresh-led', pin: 'ANODE' } },
      { command: 'wire.connect', net_id: 'fresh-ground', from: { component: 'fresh-led', pin: 'CATHODE' },
        to: { component: 'board-1', pin: 'GND2' } },
    ];
    const branch = await apply(branchCommands); assert.equal(branch.mode, 'edited');
    const connectedBranch = await inspect();
    assert.equal(pin(connectedBranch, 'board-1', 'D4').connected, true);
    assert.equal(pin(connectedBranch, 'fresh-resistor', 'A').connected, true);
    assert.equal(pin(connectedBranch, 'fresh-led', 'CATHODE').connected, true);

    assert.equal((await client.send({ command: 'undo', transaction_id: branch.transaction_id })).mode, 'undone');
    assert.equal(pin(await inspect(), 'board-1', 'D4').connected, false);
    const branchTransaction = transactions.get(branch.transaction_id);
    install(branchTransaction.after); revision += 1; // Owner-side GUI Redo between client commands.
    assert.equal(pin(await inspect(), 'board-1', 'D4').connected, true);

    const cleanup = await apply([
      { command: 'wire.disconnect', net_id: 'fresh-drive' },
      { command: 'wire.disconnect', net_id: 'fresh-series' },
      { command: 'wire.disconnect', net_id: 'fresh-ground' },
      { command: 'component.remove', component_id: 'fresh-resistor' },
      { command: 'component.remove', component_id: 'fresh-led' },
    ], true);
    assert.equal(cleanup.mode, 'edited');
    const cleaned = await inspect();
    assert.equal(pin(cleaned, 'board-1', 'D4').connected, false);
    assert.equal(Object.hasOwn(cleaned.discovery.pins, 'fresh-resistor'), false);
    assert.equal(Object.hasOwn(cleaned.discovery.pins, 'fresh-led'), false);

    assert.equal((await apply([{ command: 'component.add', id: 'reused-part', type: 'resistor.fixed-v1',
      position: { x: 0.5, y: 0.6, rotation: 0 } }])).mode, 'edited');
    assert.deepEqual((await inspect()).discovery.pins['reused-part'].map(({ id }) => id), ['A', 'B']);
    assert.equal((await apply([{ command: 'component.remove', component_id: 'reused-part' }], true)).mode, 'edited');
    assert.equal(Object.hasOwn((await inspect()).discovery.pins, 'reused-part'), false);
    assert.equal((await apply([{ command: 'component.add', id: 'reused-part', type: 'led.basic-v1',
      position: { x: 0.7, y: 0.6, rotation: 0 } }])).mode, 'edited');
    const reused = await inspect();
    assert.deepEqual(reused.discovery.pins['reused-part'].map(({ id }) => id), ['ANODE', 'CATHODE']);
    assert.equal(reused.discovery.pins['reused-part'].some(({ id }) => id === 'A'), false);

    nets.push({ id: 'gui-net', endpoints: [{ component: 'board-1', pin: 'D4' },
      { component: 'reused-part', pin: 'ANODE' }] }); revision += 1;
    const afterGuiChange = await inspect();
    assert.equal(pin(afterGuiChange, 'board-1', 'D4').connected, true);
    assert.equal(pin(afterGuiChange, 'reused-part', 'ANODE').connected, true);
    nets = nets.filter(({ id }) => id !== 'gui-net'); revision += 1;
    assert.equal(pin(await inspect(), 'board-1', 'D4').connected, false);

    assert.equal((await apply([{ command: 'component.add', id: 'property-resistor', type: 'resistor.fixed-v1',
      position: { x: 0.4, y: 0.7, rotation: 0 } }])).mode, 'edited');
    const beforeInvalid = (await inspect()).discovery.revision;
    const invalid = await apply([{ command: 'component.property.set', component_id: 'property-resistor',
      key: 'ohms', value: -1 }]);
    assert.deepEqual(invalid, { status: 'rejected', code: 'INVALID_COMPONENT_PROPERTIES' });
    assert.equal((await inspect()).discovery.revision, beforeInvalid);
    const masked = await apply([{ command: 'component.property.set', component_id: 'property-resistor',
      key: 'ohms', value: 13 }]);
    assert.deepEqual(masked, { status: 'rejected', code: 'API_SESSION_FAILED' });
    assert.equal(JSON.stringify(masked).includes(secretMarker), false);

    const reusedPinRequests = pinRequests.filter(({ component_id }) => component_id === 'reused-part');
    assert.deepEqual(reusedPinRequests.map(({ type }) => type), ['resistor.fixed-v1', 'led.basic-v1']);
    const pinRequestsBeforeFinal = pinRequests.length;
    const finalInspect = await inspect();
    assert.equal(pinRequests.length - pinRequestsBeforeFinal, 0);
    assert.equal(new Set(Object.keys(finalInspect.discovery.pins)).size, finalInspect.discovery.components.length);
    assert.deepEqual(new Set(Object.keys(finalInspect.discovery.pins)),
      new Set(finalInspect.discovery.components.map(({ id }) => id)));
    assert.equal((await client.send({ command: 'close' })).code, 'API_SESSION_LOCAL_CLOSED');
    await client.done;
    assert.equal(client.output().stderr.includes(secretMarker), false);
  });
