#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { stdin, stderr, stdout } from 'node:process';

const args = process.argv.slice(2);
const ticketMode = args[0] === '--ticket';
let [origin, planPath] = ticketMode ? [null, args[2]] : args;
const ticketPath = ticketMode ? args[1] : null;
if ((!ticketMode && (!origin || args.length > 2)) || (ticketMode && (!ticketPath || args.length > 3))) {
  stderr.write('Usage: node client.mjs ORIGIN [NONSECRET_PLAN.json]\n       node client.mjs --ticket PAIRING.intentpair [NONSECRET_PLAN.json]\n'); process.exit(2);
}
let pairingSecret = null;
let ticketScopes = null;
if (ticketMode) {
  const bytes = await readFile(ticketPath);
  await unlink(ticketPath);
  if (bytes.length > 4096) throw new Error('API_PAIRING_TICKET_LIMIT');
  let ticket;
  try { ticket = JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('API_PAIRING_TICKET_SHAPE'); }
  const keys = Object.keys(ticket ?? {}).sort().join('|');
  let ticketUrl;
  try { ticketUrl = new URL(ticket?.origin); }
  catch { throw new Error('API_PAIRING_TICKET_ORIGIN'); }
  const canonicalOrigin = ticketUrl.origin;
  const productionOrigin = canonicalOrigin === 'https://lab.teachthecompany.com';
  const loopbackPort = Number(ticketUrl.port);
  const explicitLoopback = process.env.INTENT_MCU_ALLOW_LOOPBACK_TICKET === '1'
    && ['127.0.0.1', 'localhost'].includes(ticketUrl.hostname)
    && ['http:', 'https:'].includes(ticketUrl.protocol)
    && Number.isInteger(loopbackPort) && loopbackPort >= 1024 && loopbackPort <= 65535;
  if (keys !== 'expires_at|origin|pairing_secret|schema|scopes'
      || ticket.schema !== 'intent-mcu-browser-session-pairing-ticket@1'
      || typeof ticket.origin !== 'string' || typeof ticket.pairing_secret !== 'string'
      || ticket.pairing_secret.length === 0 || ticket.pairing_secret.length > 256
      || !Number.isSafeInteger(ticket.expires_at) || ticket.expires_at <= Date.now()
      || !Array.isArray(ticket.scopes) || ticket.scopes.length === 0
      || ticket.scopes.some((scope) => !['discover', 'read_project', 'edit_circuit'].includes(scope))
      || new Set(ticket.scopes).size !== ticket.scopes.length) {
    throw new Error('API_PAIRING_TICKET_SHAPE');
  }
  if (ticket.origin !== canonicalOrigin || ticketUrl.username || ticketUrl.password
      || ticketUrl.pathname !== '/' || ticketUrl.search || ticketUrl.hash
      || (!productionOrigin && !explicitLoopback)) throw new Error('API_PAIRING_TICKET_ORIGIN');
  origin = ticket.origin; pairingSecret = ticket.pairing_secret; ticketScopes = ticket.scopes;
}
const endpoint = new URL('/api/session/v1', origin);
let pipedLines = null;
if (!stdin.isTTY) pipedLines = createInterface({ input: stdin, crlfDelay: Infinity, terminal: false })[Symbol.asyncIterator]();
async function hiddenLine(prompt) {
  if (!stdin.isTTY) return String((await pipedLines.next()).value ?? '').trim();
  stdin.setRawMode(true); stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => { stdin.off('data', onData); process.off('SIGINT', onSigint);
      stdin.setRawMode(false); stdin.pause(); stderr.write('\n'); };
    const cancel = () => { cleanup(); reject(new Error('API_INPUT_CANCELLED')); };
    const onSigint = () => cancel();
    const finish = () => { cleanup(); resolve(value); };
    const onData = (chunk) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') { cancel(); return; }
        if (character === '\r' || character === '\n') { finish(); return; }
        if (character === '\u007f' || character === '\b') { value = value.slice(0, -1); continue; }
        if (value.length < 256) value += character;
      }
    };
    process.once('SIGINT', onSigint);
    stdin.on('data', onData);
    stderr.write(prompt);
  });
}
async function ordinaryLine(prompt) {
  if (!stdin.isTTY) return String((await pipedLines.next()).value ?? '').trim();
  const terminal = createInterface({ input: stdin, output: stderr, terminal: true });
  try { return (await new Promise((resolve) => terminal.question(prompt, resolve))).trim(); }
  finally { terminal.close(); }
}
if (!pairingSecret) pairingSecret = await hiddenLine('Pairing secret (hidden): ');
if (!pairingSecret || pairingSecret.length > 256) throw new Error('API_PAIRING_INPUT_REQUIRED');
let plan = null;
if (planPath) {
  const bytes = await readFile(planPath);
  if (bytes.length > 48 * 1024) throw new Error('API_PLAN_LIMIT');
  plan = JSON.parse(bytes.toString('utf8'));
  if (!plan || plan.schema !== 'intent-mcu-browser-session-plan@1' || !Array.isArray(plan.commands)
      || plan.commands.length === 0 || plan.commands.length > 16
      || Object.keys(plan).some((key) => !['schema', 'commands', 'allow_component_removal'].includes(key))) throw new Error('API_PLAN_SHAPE');
  if (plan.commands.some((command) => command?.command === 'component.remove')
      && plan.allow_component_removal !== true) throw new Error('API_PLAN_REMOVAL_NOT_ALLOWED');
}
const post = async (operation, value = {}, capability = null) => {
  const response = await fetch(endpoint, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json',
    ...(capability ? { Authorization: `Bearer ${capability}` } : {}) }, body: JSON.stringify({ operation, ...value }) });
  return response.json();
};
const scopes = ['discover', 'read_project', ...(plan ? ['edit_circuit'] : [])];
if (ticketScopes && scopes.some((scope) => !ticketScopes.includes(scope))) throw new Error('API_PAIRING_TICKET_SCOPE');
const claim = await post('pairing.claim', { pairingSecret, scopes });
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
    if (result.code !== 'API_RESULT_PENDING') { if (Number.isInteger(result.revision_after)) revision = result.revision_after; return result; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('API_TIMEOUT');
}
const accepted = async (command, args = {}) => {
  const result = await execute(command, args); if (result.status !== 'accepted') throw new Error(result.code); return result;
};
const capabilities = await accepted('capabilities.list');
const project = await accepted('project.inspect');
const catalog = await accepted('components.catalog');
const components = await accepted('components.list');
const nets = await accepted('nets.list');
const componentPins = {};
for (const component of components.components) componentPins[component.id] = (await accepted('component.pins', { component_id: component.id })).pins;
const validation = await accepted('circuit.validate');
const discovery = { profile: catalog.profile, project_id: claim.projectId, revision,
  commands: capabilities.commands, components: components.components, nets: nets.nets,
  pins: componentPins, validation: validation.validation };
if (!plan) { stdout.write(`${JSON.stringify({ status: 'pass', mode: 'read-only', discovery })}\n`); process.exit(0); }
if (catalog.profile !== 'board.atmega328p-16mhz-v1') throw new Error('API_PROFILE_READ_ONLY');
const typeById = new Map(components.components.map((item) => [item.id, item.type]));
for (const command of plan.commands) if (command?.command === 'component.add') typeById.set(command.id, command.type);
for (const command of plan.commands) {
  if (command?.command !== 'wire.connect') continue;
  for (const endpointValue of [command.from, command.to]) {
    const type = typeById.get(endpointValue?.component); const pins = catalog.components[type]?.pins;
    if (!type || !pins?.some((pin) => pin.id === endpointValue?.pin)) throw new Error('API_PLAN_NAMED_PIN_UNKNOWN');
  }
}
const applied = await accepted('edit.batch', { commands: plan.commands });
const after = await accepted('project.inspect'); const afterNets = await accepted('nets.list');
stdout.write(`${JSON.stringify({ status: 'pass', mode: 'edited', discovery, transaction_id: applied.transaction_id,
  changes: applied.changes, revision_after: revision, project: after.project, nets: afterNets.nets })}\n`);
stderr.write('Edit committed. Type UNDO to undo only this transaction, or press Enter to keep it.\n');
if (await ordinaryLine('Action: ') !== 'UNDO') process.exit(0);
const undone = await accepted('edit.undo', { transaction_id: applied.transaction_id });
const restored = await accepted('project.inspect');
stdout.write(`${JSON.stringify({ status: 'pass', mode: 'undone', transaction_id: applied.transaction_id,
  undo: undone.code, revision_after: revision, project: restored.project })}\n`);
