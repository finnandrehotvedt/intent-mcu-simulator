#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { boundedActionRequest } from '../src/bounded-action-contracts.mjs';
import {
  CAPABILITY_DISCOVERY_REQUEST_SCHEMA, CAPABILITY_DISCOVERY_SCHEMA,
} from '../src/capability-discovery.mjs';
import { EXTERNAL_CLIENT_READY_SCHEMA } from '../src/external-client-protocol.mjs';

const adapter = fileURLToPath(new URL('../tools/external-client-adapter.mjs', import.meta.url));
const child = spawn(process.execPath, [adapter], { stdio: ['pipe', 'pipe', 'inherit'], env: process.env });
const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
const waiters = []; const messages = [];
lines.on('line', (line) => { const value = JSON.parse(line); const waiter = waiters.shift();
  if (waiter) waiter(value); else messages.push(value); });
const next = () => messages.length ? Promise.resolve(messages.shift()) : new Promise((resolve) => waiters.push(resolve));
const send = async (value) => { const response = next(); child.stdin.write(`${JSON.stringify(value)}\n`); return response; };

try {
  const ready = await next();
  if (ready.schema !== EXTERNAL_CLIENT_READY_SCHEMA) throw new Error('EXTERNAL_CLIENT_NOT_READY');
  const discovery = await send({ schema: CAPABILITY_DISCOVERY_REQUEST_SCHEMA,
    requestId: 'external-discovery-example', acceptSchema: CAPABILITY_DISCOVERY_SCHEMA });
  if (!discovery.ok) throw new Error(`DISCOVERY_FAILED:${JSON.stringify(discovery)}`);
  const avr = discovery.discovery.profiles.find((profile) => profile.id === 'board.atmega328p-16mhz-v1');
  const unavailable = discovery.discovery.profiles.find((profile) => profile.id === 'board.rp2040-pico-v1').apis.adc;
  if (!avr || avr.apis.gpio.status !== 'tested' || unavailable.status !== 'unavailable') throw new Error('DISCOVERY_UNTRUTHFUL');
  const supportedAction = discovery.discovery.actions.names.find((name) => name === 'project.create');
  if (!supportedAction) throw new Error('DISCOVERED_ACTION_MISSING');
  const starterId = avr.parts.find((part) => part.model === avr.id)?.reference?.starters?.[0];
  if (!starterId) throw new Error('DISCOVERED_STARTER_MISSING');
  const supported = await send(JSON.parse(boundedActionRequest(supportedAction, avr.id,
    ready.context.generation, { starterId }, { requestId: 'external-discovered-action', ttlMs: 30_000 })));
  const unsupportedVersion = await send({ schema: CAPABILITY_DISCOVERY_REQUEST_SCHEMA,
    requestId: 'external-unsupported-version', acceptSchema: 'intent-mcu-capability-discovery@99' });
  const inventedAction = JSON.parse(boundedActionRequest('project.validate', avr.id,
    supported.generationAfter ?? ready.context.generation, {}, { requestId: 'external-invented-action', ttlMs: 30_000 }));
  inventedAction.action = 'capability.adc.enable';
  const rejectedAction = await send(inventedAction);
  process.stdout.write(`${JSON.stringify({ status: 'pass', ready, discovery, supported,
    unsupportedCapability: { profile: 'board.rp2040-pico-v1', api: 'adc', ...unavailable },
    unsupportedVersion, rejectedAction })}\n`);
} finally {
  child.stdin.end();
  await new Promise((resolve) => child.once('exit', resolve));
}
