#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { randomUUID } from 'node:crypto';
import { stdin } from 'node:process';

const [origin] = process.argv.slice(2);
if (!origin) { console.error('Usage: printf pairing-secret | browser-session-edit-client.mjs ORIGIN'); process.exit(2); }
let secretText = ''; stdin.setEncoding('utf8');
for await (const chunk of stdin) { secretText += chunk; if (secretText.length > 256) throw new Error('API_PAIRING_INPUT_LIMIT'); }
const pairingSecret = secretText.trim(); secretText = '';
if (!pairingSecret) throw new Error('API_PAIRING_INPUT_REQUIRED');
const endpoint = new URL('/api/session/v1', origin);
const post = async (operation, value = {}, capability = null) => {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json',
    ...(capability ? { Authorization: `Bearer ${capability}` } : {}) },
  body: JSON.stringify({ operation, ...value }) });
  return response.json();
};
const claim = await post('pairing.claim', { pairingSecret,
  scopes: ['discover', 'read_project', 'edit_circuit'] });
if (!claim.ok) throw new Error(claim.code);
let sequence = 1; let revision = claim.revision;
async function execute(command, args = {}) {
  const requestId = `cli-${randomUUID()}`;
  const request = { schema: 'intent-mcu-browser-session-request@1', request_id: requestId,
    session_id: claim.sessionId, project_id: claim.projectId, expected_revision: revision,
    sequence: sequence++, command, arguments: args };
  const queued = await post('request.submit', { sessionId: claim.sessionId, request }, claim.clientCapability);
  if (!queued.ok) throw new Error(queued.code);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await post('result.read', { sessionId: claim.sessionId, requestId }, claim.clientCapability);
    if (result.code !== 'API_RESULT_PENDING') {
      if (Number.isInteger(result.revision_after)) revision = result.revision_after;
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('API_TIMEOUT');
}
const capabilities = await execute('capabilities.list');
if (capabilities.status !== 'accepted' || !capabilities.commands.includes('edit.batch')) {
  throw new Error(capabilities.code ?? 'API_EDIT_UNAVAILABLE');
}
const project = await execute('project.inspect');
if (project.status !== 'accepted') throw new Error(project.code);
const catalog = await execute('components.catalog');
if (catalog.status !== 'accepted') throw new Error(catalog.code);
const before = await execute('components.list');
if (before.status !== 'accepted') throw new Error(before.code);
const operations = [
  ...before.components.map((component) => ({ command: 'component.remove', component_id: component.id })),
  { command: 'component.add', id: 'api-board-1', type: 'board.atmega328p-16mhz-v1',
    position: { x: 0.18, y: 0.42, rotation: 0 } },
  { command: 'component.add', id: 'api-resistor-1', type: 'resistor.fixed-v1',
    position: { x: 0.5, y: 0.28, rotation: 0 } },
  { command: 'component.add', id: 'api-led-1', type: 'led.basic-v1',
    position: { x: 0.78, y: 0.4, rotation: 0 } },
  { command: 'wire.connect', net_id: 'api-net-drive',
    from: { component: 'api-board-1', pin: 'D13' }, to: { component: 'api-resistor-1', pin: 'A' } },
  { command: 'wire.connect', net_id: 'api-net-series',
    from: { component: 'api-resistor-1', pin: 'B' }, to: { component: 'api-led-1', pin: 'ANODE' } },
  { command: 'wire.connect', net_id: 'api-net-ground',
    from: { component: 'api-led-1', pin: 'CATHODE' }, to: { component: 'api-board-1', pin: 'GND1' } },
];
if (operations.length > 16) throw new Error('API_BATCH_LIMIT');
const applied = await execute('edit.batch', { commands: operations });
if (applied.status !== 'accepted') throw new Error(applied.code);
const transactionId = applied.transaction_id;
const components = await execute('components.list'); const nets = await execute('nets.list');
const boardPins = await execute('component.pins', { component_id: 'api-board-1' });
const resistorPins = await execute('component.pins', { component_id: 'api-resistor-1' });
const ledPins = await execute('component.pins', { component_id: 'api-led-1' });
const validation = await execute('circuit.validate');
const holdMs = Number(process.env.API03_PAUSE_BEFORE_UNDO_MS ?? 0);
if (Number.isInteger(holdMs) && holdMs > 0 && holdMs <= 10_000) {
  await new Promise((resolve) => setTimeout(resolve, holdMs));
}
const undone = await execute('edit.undo', { transaction_id: transactionId });
if (undone.status !== 'accepted') throw new Error(undone.code);
const restored = await execute('project.inspect');
process.stdout.write(`${JSON.stringify({ status: 'pass', transaction_id: transactionId, changes: applied.changes,
  discovery: { profile: catalog.profile, project_id: claim.projectId,
    initial_component_count: project.project.circuit.components.length },
  assembled: { components: components.components.map((item) => item.id),
    nets: nets.nets.map((item) => item.id), named_pins: {
      board: boardPins.pins.map((item) => item.id), resistor: resistorPins.pins.map((item) => item.id),
      led: ledPins.pins.map((item) => item.id) }, validation: validation.code },
  undo: undone.code, restored_component_count: restored.project.circuit.components.length })}\n`);
