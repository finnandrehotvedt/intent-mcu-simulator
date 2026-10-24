#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { randomUUID } from 'node:crypto';

const [origin, pairingSecret, componentId] = process.argv.slice(2);
if (!origin || !pairingSecret || !componentId) {
  console.error('Usage: browser-session-readonly-client.mjs ORIGIN PAIRING_SECRET COMPONENT_ID');
  process.exit(2);
}
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
