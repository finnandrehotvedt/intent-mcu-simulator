// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { API_SESSION_CLIENT_URL, API_SESSION_PROTOCOL_URL,
  CODEX_PAIRING_INSTRUCTIONS } from '../src/browser-session-codex-instructions.mjs';

test('copyable Codex instructions are public, self-contained and secret-safe', () => {
  assert.match(CODEX_PAIRING_INSTRUCTIONS, /https:\/\/lab\.teachthecompany\.com\//);
  assert.ok(CODEX_PAIRING_INSTRUCTIONS.includes(API_SESSION_PROTOCOL_URL));
  assert.ok(CODEX_PAIRING_INSTRUCTIONS.includes(API_SESSION_CLIENT_URL));
  for (const required of ['discover before editing', 'named pins', 'atomic edit.batch', 'Undo',
    'AVR', 'read-only', 'Build', 'Run', '.intentpair', 'Never ask me to paste']) {
    assert.ok(CODEX_PAIRING_INSTRUCTIONS.toLowerCase().includes(required.toLowerCase()), required);
  }
  assert.doesNotMatch(CODEX_PAIRING_INSTRUCTIONS, /Bearer [A-Za-z0-9_-]{20,}/);
  assert.ok(CODEX_PAIRING_INSTRUCTIONS.includes('node .\\client.mjs --session .\\intent-mcu-pairing.intentpair'));
  assert.match(CODEX_PAIRING_INSTRUCTIONS, /exec_command using tty:true/);
  assert.match(CODEX_PAIRING_INSTRUCTIONS, /session_id/);
  assert.match(CODEX_PAIRING_INSTRUCTIONS, /write_stdin/);
  assert.match(CODEX_PAIRING_INSTRUCTIONS, /never fall back to a one-shot/);
  assert.match(CODEX_PAIRING_INSTRUCTIONS, /One ticket is claimed once/);
  assert.match(CODEX_PAIRING_INSTRUCTIONS, /Retain that same process handle across later chat turns/);
  assert.match(CODEX_PAIRING_INSTRUCTIONS, /API_SESSION_STDIN_REQUIRED/);
  assert.match(CODEX_PAIRING_INSTRUCTIONS, /reusable process\/session handle/);
  assert.match(CODEX_PAIRING_INSTRUCTIONS, /heartbeat every 60 seconds/);
  assert.match(CODEX_PAIRING_INSTRUCTIONS, /browser-session-style continuity/);
  assert.match(CODEX_PAIRING_INSTRUCTIONS, /two missed client heartbeats/);
  assert.doesNotMatch(CODEX_PAIRING_INSTRUCTIONS, /printf|PAIRING_SECRET=/);
  assert.match(CODEX_PAIRING_INSTRUCTIONS, /Never auto-undo/);
});

test('build exposes versioned protocol, complete client and exact metaprompt', async () => {
  const [protocol, client, prompt] = await Promise.all([
    readFile(new URL('../dist/api/session/v1/protocol.txt', import.meta.url), 'utf8'),
    readFile(new URL('../dist/api/session/v1/client.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/api/session/v1/codex-instructions.txt', import.meta.url), 'utf8'),
  ]);
  assert.match(protocol, /intent-mcu-browser-session-request@1/);
  assert.match(protocol, /API_STALE_REVISION/);
  assert.match(client, /pairing\.claim/);
  assert.match(client, /intent-mcu-browser-session-pairing-ticket@1/);
  assert.match(client, /API_SESSION_LOCAL_CLOSED/);
  assert.match(client, /mode: 'session'/);
  assert.match(client, /await unlink\(ticketPath\)/);
  assert.match(client, /requirePersistentSessionInput/);
  assert.ok(client.indexOf('await requirePersistentSessionInput()') < client.indexOf('await readFile(ticketPath)'));
  assert.match(client, /edit\.batch/);
  assert.match(client, /API_PLAN_REMOVAL_NOT_ALLOWED/);
  assert.doesNotMatch(client, /component\.remove.*before\.components/s);
  assert.match(client, /if \(!plan\).*mode: 'read-only'/s);
  assert.match(client, /stdin\.off\('data', onData\); process\.off\('SIGINT', onSigint\);/);
  assert.match(client, /stdin\.setRawMode\(false\); stdin\.pause\(\)/);
  assert.equal(prompt, `${CODEX_PAIRING_INSTRUCTIONS}\n`);
});
