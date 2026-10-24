#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { randomUUID } from 'node:crypto';
import { stdin } from 'node:process';

const [origin, componentId] = process.argv.slice(2);
if (!origin || !componentId) {
  console.error('Usage: printf pairing-secret | browser-session-readonly-client.mjs ORIGIN COMPONENT_ID');
  process.exit(2);
}
let secretBytes = '';
stdin.setEncoding('utf8');
for await (const chunk of stdin) {
  secretBytes += chunk;
  if (secretBytes.length > 256) throw new Error('API_PAIRING_INPUT_LIMIT');
}
const pairingSecret = secretBytes.trim(); secretBytes = '';
if (!pairingSecret) throw new Error('API_PAIRING_INPUT_REQUIRED');
const endpoint = new URL('/api/session/v1', origin);
const post = async (operation, value = {}, capability = null) => {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json',
    ...(capability ? { Authorization: `Bearer ${capability}` } : {}) },
    body: JSON.stringify({ operation, ...value }) });
  return response.json();
};
const claim = await post('pairing.claim', { pairingSecret, scopes: ['discover', 'read_project'] });
if (!claim.ok) throw new Error(claim.code);
let sequence = 1;
let revision = claim.revision;
async function execute(command, args = {}) {
  const requestId = `cli-${randomUUID()}`;
  const request = { schema: 'intent-mcu-browser-session-request@1', request_id: requestId,
    session_id: claim.sessionId, project_id: claim.projectId, expected_revision: revision,
    sequence: sequence++, command, arguments: args };
  const queued = await post('request.submit', { sessionId: claim.sessionId, request }, claim.clientCapability);
  if (!queued.ok) throw new Error(queued.code);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await post('result.read', { sessionId: claim.sessionId, requestId }, claim.clientCapability);
    if (result.code !== 'API_RESULT_PENDING') { if (Number.isInteger(result.revision_after)) revision = result.revision_after; return result; }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('API_TIMEOUT');
}
const capabilities = await execute('capabilities.list');
const pins = await execute('component.pins', { component_id: componentId });
process.stdout.write(`${JSON.stringify({ status: 'pass', commands: capabilities.commands,
  component_id: pins.component_id, pins: pins.pins })}\n`);
