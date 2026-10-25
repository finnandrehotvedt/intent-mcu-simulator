#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { stdin, stderr, stdout } from 'node:process';

const args = process.argv.slice(2);
const sessionMode = args[0] === '--session';
const ticketMode = args[0] === '--ticket' || sessionMode;
let [origin, planPath] = ticketMode ? [null, sessionMode ? null : args[2]] : args;
const ticketPath = ticketMode ? args[1] : null;
const EDITABLE_PROFILES = new Set(['board.atmega328p-16mhz-v1', 'board.rp2040-pico-v1',
  'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1']);
if ((!ticketMode && (!origin || args.length > 2)) || (ticketMode && (!ticketPath || args.length > (sessionMode ? 2 : 3)))) {
  stderr.write('Usage: node client.mjs ORIGIN [NONSECRET_PLAN.json]\n       node client.mjs --ticket PAIRING.intentpair [NONSECRET_PLAN.json]\n       node client.mjs --session PAIRING.intentpair\n'); process.exit(2);
}
// Install the line reader before the persistence probe. Node's readline
// buffers an immediate first JSONL command while the caller keeps the pipe
// open; no bytes are lost during the preflight delay.
let pipedLines = null;
if (!stdin.isTTY) pipedLines = createInterface({ input: stdin, crlfDelay: Infinity, terminal: false })[Symbol.asyncIterator]();
async function requirePersistentSessionInput() {
  if (!sessionMode || stdin.isTTY) return;
  if (stdin.readableEnded || stdin.destroyed) throw new Error('API_SESSION_STDIN_REQUIRED');
  let ended = false;
  const markEnded = () => { ended = true; };
  stdin.once('end', markEnded); stdin.once('close', markEnded);
  stdin.resume();
  await new Promise((resolve) => setTimeout(resolve, 75));
  stdin.off('end', markEnded); stdin.off('close', markEnded);
  if (ended || stdin.readableEnded || stdin.destroyed) throw new Error('API_SESSION_STDIN_REQUIRED');
}
// A session ticket is one-use. Prove that the caller retained a writable stdin
// before reading or deleting it, so a detached one-shot command cannot consume
// the user's only pairing and then exit immediately.
await requirePersistentSessionInput();
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
function validatePlan(value) {
  if (!value || value.schema !== 'intent-mcu-browser-session-plan@1' || !Array.isArray(value.commands)
      || value.commands.length === 0 || value.commands.length > 16
      || Object.keys(value).some((key) => !['schema', 'commands', 'allow_component_removal'].includes(key))) throw new Error('API_PLAN_SHAPE');
  if (value.commands.some((command) => command?.command === 'component.remove')
      && value.allow_component_removal !== true) throw new Error('API_PLAN_REMOVAL_NOT_ALLOWED');
  return value;
}
let plan = null;
if (planPath) {
  const bytes = await readFile(planPath);
  if (bytes.length > 48 * 1024) throw new Error('API_PLAN_LIMIT');
  try { plan = validatePlan(JSON.parse(bytes.toString('utf8'))); }
  catch (error) { throw new Error(error.message?.startsWith('API_') ? error.message : 'API_PLAN_SHAPE'); }
}
const post = async (operation, value = {}, capability = null) => {
  const response = await fetch(endpoint, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json',
    ...(capability ? { Authorization: `Bearer ${capability}` } : {}) }, body: JSON.stringify({ operation, ...value }) });
  return response.json();
};
const scopes = sessionMode ? ticketScopes : ['discover', 'read_project', ...(plan ? ['edit_circuit'] : [])];
if (ticketScopes && scopes.some((scope) => !ticketScopes.includes(scope))) throw new Error('API_PAIRING_TICKET_SCOPE');
const claim = await post('pairing.claim', { pairingSecret, scopes });
if (!claim.ok) throw new Error(claim.code);
let sequence = 1; let revision = claim.revision;
let lastSubmitAt = 0;
let submitAmbiguous = false;
let sessionHeartbeat = null;
if (sessionMode) {
  sessionHeartbeat = setInterval(async () => {
    try {
      const renewed = await post('client.heartbeat', { sessionId: claim.sessionId }, claim.clientCapability);
      if (!renewed.ok) {
        stdout.write(`${JSON.stringify({ status: 'rejected', code: renewed.code })}\n`);
        process.exit(0);
      }
    } catch {
      stdout.write('{"status":"rejected","code":"API_SESSION_HEARTBEAT_FAILED"}\n');
      process.exit(0);
    }
  }, 60_000);
}
async function execute(command, args = {}) {
  if (submitAmbiguous) throw new Error('API_SUBMIT_RECONCILIATION_REQUIRED');
  const requestId = `cli-${randomUUID()}`;
  const request = { schema: 'intent-mcu-browser-session-request@1', request_id: requestId,
    session_id: claim.sessionId, project_id: claim.projectId, expected_revision: revision,
    sequence, command, arguments: args };
  let queued;
  const paceMs = 210 - (Date.now() - lastSubmitAt);
  if (paceMs > 0) await new Promise((resolve) => setTimeout(resolve, paceMs));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      lastSubmitAt = Date.now();
      queued = await post('request.submit', { sessionId: claim.sessionId, request }, claim.clientCapability);
      break;
    } catch (error) {
      if (attempt === 2) { submitAmbiguous = true;
        throw Object.assign(new Error('API_SUBMIT_RECONCILIATION_REQUIRED'), { cause: error }); }
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  const reconciled = queued.status ? queued
    : queued.code === 'API_REQUEST_RECONCILE' && queued.reconciliation?.status !== 'pending'
      ? queued.reconciliation : null;
  if (!queued.ok && !reconciled) throw new Error(queued.code);
  if (!reconciled && !['API_REQUEST_QUEUED', 'API_REQUEST_RECONCILE'].includes(queued.code)) throw new Error(queued.code);
  sequence += 1;
  if (reconciled) { if (Number.isInteger(reconciled.revision_after)) revision = reconciled.revision_after;
    return reconciled; }
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
let staticDiscovery = null;
async function discoverProject() {
  const capabilities = staticDiscovery?.capabilities ?? await accepted('capabilities.list');
  const project = await accepted('project.inspect');
  const catalog = staticDiscovery?.catalog ?? await accepted('components.catalog');
  const components = await accepted('components.list');
  const nets = await accepted('nets.list');
  const componentPins = { ...(staticDiscovery?.componentPins ?? {}) };
  for (const component of components.components) if (!componentPins[component.id]) {
    componentPins[component.id] = (await accepted('component.pins', { component_id: component.id })).pins;
  }
  const validation = await accepted('circuit.validate');
  staticDiscovery = { capabilities, catalog, componentPins };
  return { discovery: { profile: catalog.profile, project_id: claim.projectId, revision,
    commands: capabilities.commands, components: components.components, nets: nets.nets,
    pins: componentPins, validation: validation.validation,
    authoring: validation.authoring ?? validation.validation,
    runtime: validation.runtime ?? validation.validation,
    executable: validation.executable ?? validation.validation?.ok === true }, project, catalog, components };
}
function validateNamedPins(candidate, components, catalog) {
  const typeById = new Map(components.components.map((item) => [item.id, item.type]));
  for (const command of candidate.commands) if (command?.command === 'component.add') typeById.set(command.id, command.type);
  for (const command of candidate.commands) if (command?.command === 'component.duplicate') {
    const sourceType = typeById.get(command.component_id);
    if (sourceType) typeById.set(command.id, sourceType);
  }
  for (const command of candidate.commands) {
    const endpoints = command?.command === 'wire.connect' ? [command.from, command.to]
      : ['wire.branch.connect', 'wire.disconnect'].includes(command?.command) && command.endpoint
        ? [command.endpoint] : [];
    for (const endpointValue of endpoints) {
      const type = typeById.get(endpointValue?.component); const pins = catalog.components[type]?.pins;
      if (!type || !pins?.some((pin) => pin.id === endpointValue?.pin)) throw new Error('API_PLAN_NAMED_PIN_UNKNOWN');
    }
  }
}
if (sessionMode) {
  let lastState = null;
  stdout.write(`${JSON.stringify({ status: 'ready', mode: 'session', project_id: claim.projectId,
    revision, scopes: claim.scopes, expires_at: claim.expiresAt })}\n`);
  try {
    for await (const line of pipedLines ?? createInterface({ input: stdin, output: stderr, terminal: true })) {
      let input;
      try { input = JSON.parse(String(line)); }
      catch { stdout.write('{"status":"rejected","code":"API_SESSION_INPUT_SHAPE"}\n'); continue; }
      try {
      if (!input || typeof input !== 'object' || Array.isArray(input)
          || typeof input.command !== 'string') throw new Error('API_SESSION_INPUT_SHAPE');
      if (input.command === 'close' && Object.keys(input).join('|') === 'command') {
        clearInterval(sessionHeartbeat);
        stdout.write('{"status":"closed","code":"API_SESSION_LOCAL_CLOSED"}\n'); break;
      }
      if (input.command === 'inspect' && Object.keys(input).join('|') === 'command') {
        lastState = await discoverProject(); stdout.write(`${JSON.stringify({ status: 'pass', mode: 'inspected', discovery: lastState.discovery })}\n`); continue;
      }
      if (input.command === 'apply' && Object.keys(input).sort().join('|') === 'command|plan') {
        if (!claim.scopes.includes('edit_circuit')) throw new Error('API_SCOPE_REQUIRED');
        const candidate = validatePlan(input.plan); const current = lastState ?? await discoverProject();
        if (!EDITABLE_PROFILES.has(current.catalog.profile)) throw new Error('API_PROFILE_READ_ONLY');
        validateNamedPins(candidate, current.components, current.catalog);
        const applied = await accepted('edit.batch', { commands: candidate.commands });
        lastState = null;
        stdout.write(`${JSON.stringify({ status: 'pass', mode: 'edited', transaction_id: applied.transaction_id,
          changes: applied.changes, revision_after: revision })}\n`); continue;
      }
      if (input.command === 'undo' && Object.keys(input).sort().join('|') === 'command|transaction_id'
          && typeof input.transaction_id === 'string') {
        const undone = await accepted('edit.undo', { transaction_id: input.transaction_id });
        lastState = null; stdout.write(`${JSON.stringify({ status: 'pass', mode: 'undone',
          transaction_id: input.transaction_id, undo: undone.code, revision_after: revision,
        })}\n`); continue;
      }
        throw new Error('API_SESSION_COMMAND_UNSUPPORTED');
      } catch (error) {
        const code = typeof error?.message === 'string' && error.message.startsWith('API_')
          ? error.message : 'API_SESSION_FAILED';
        stdout.write(`${JSON.stringify({ status: 'rejected', code })}\n`);
        if (['API_EXPIRED', 'API_AUTH_REQUIRED', 'API_OWNER_GONE', 'API_CLIENT_GONE'].includes(code)) break;
      }
    }
  } finally {
    if (sessionHeartbeat) clearInterval(sessionHeartbeat);
    sessionHeartbeat = null;
  }
  process.exit(0);
}
const { discovery, catalog, components } = await discoverProject();
if (!plan) { stdout.write(`${JSON.stringify({ status: 'pass', mode: 'read-only', discovery })}\n`); process.exit(0); }
if (!EDITABLE_PROFILES.has(catalog.profile)) throw new Error('API_PROFILE_READ_ONLY');
validateNamedPins(plan, components, catalog);
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
