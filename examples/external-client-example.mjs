#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { boundedActionRequest } from '../src/bounded-action-contracts.mjs';
import { EXTERNAL_CLIENT_READY_SCHEMA } from '../src/external-client-protocol.mjs';

const adapter = fileURLToPath(new URL('../tools/external-client-adapter.mjs', import.meta.url));
const child = spawn(process.execPath, [adapter], { stdio: ['pipe', 'pipe', 'inherit'], env: process.env });
const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
const waiters = []; const messages = [];
lines.on('line', (line) => {
  const value = JSON.parse(line); const waiter = waiters.shift();
  if (waiter) waiter(value); else messages.push(value);
});
const next = () => messages.length ? Promise.resolve(messages.shift())
  : new Promise((resolve) => waiters.push(resolve));
const send = async (source) => { const response = next(); child.stdin.write(`${source}\n`); return response; };

try {
  const ready = await next();
  if (ready.schema !== EXTERNAL_CLIENT_READY_SCHEMA) throw new Error(`EXTERNAL_CLIENT_NOT_READY:${JSON.stringify(ready)}`);
  let generation = ready.context.generation;
  let sequence = 0;
  const call = async (action, payload = {}) => {
    sequence += 1;
    const requestId = `external-example-${String(sequence).padStart(2, '0')}-request`;
    const result = await send(boundedActionRequest(action, ready.context.profile, generation, payload,
      { ttlMs: 30_000, requestId }));
    if (!result.ok) throw new Error(`${action}:${JSON.stringify(result)}`);
    generation = result.generationAfter;
    return result;
  };
  const created = await call('project.create', { starterId: 'avr-thermostat-boundary-v1' });
  const proposed = await call('patch.propose', { description: 'Change the thermostat status message while preserving every requirement.' });
  const validated = await call('project.validate');
  const built = await call('firmware.build');
  const ran = await call('runtime.run');
  const read = await call('result.read');
  const exported = await call('project.export');
  process.stdout.write(`${JSON.stringify({
    status: 'pass', transport: ready.transport, origin: ready.origin, actions: ready.actions,
    applyAuthority: ready.applyAuthority, genericCommand: ready.genericCommand,
    created: created.result, prompt: proposed.result.prompt, validation: validated.result,
    artifactIdentity: built.result.artifactIdentity, run: ran.result, read: read.result,
    export: exported.result,
  })}\n`);
} finally {
  child.stdin.end();
  await new Promise((resolve) => child.once('exit', resolve));
}
