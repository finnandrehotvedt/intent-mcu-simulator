#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { MCP_PROTOCOL_VERSION } from '../src/mcp-adapter-protocol.mjs';

const adapter = fileURLToPath(new URL('../tools/mcp-adapter.mjs', import.meta.url));

async function createClient() {
  const child = spawn(process.execPath, [adapter], { stdio: ['pipe', 'pipe', 'inherit'], env: process.env });
  const childExit = new Promise((resolve) => child.once('exit', resolve));
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const waiters = new Map(); let rpcSequence = 0;
  lines.on('line', (line) => {
    const value = JSON.parse(line); const key = `${typeof value.id}:${String(value.id)}`;
    const waiter = waiters.get(key);
    if (waiter) { waiters.delete(key); waiter(value); }
  });
  const request = (method, params = {}) => new Promise((resolve) => {
    rpcSequence += 1; const id = rpcSequence; waiters.set(`number:${id}`, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const notify = (method, params = {}) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  const tool = async (name, args) => {
    const response = await request('tools/call', { name, arguments: args });
    if (response.error) throw new Error(JSON.stringify(response.error));
    return response.result;
  };
  const initialized = await request('initialize', {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'intent-mcu-independent-reference-client', version: '1.0.0' },
  });
  if (initialized.result?.protocolVersion !== MCP_PROTOCOL_VERSION) throw new Error('MCP_VERSION_NEGOTIATION_FAILED');
  notify('notifications/initialized');
  return { initialized, request, tool, close: async () => { child.stdin.end(); await childExit; } };
}

let canonicalSequence = 0;
const nextCanonicalId = (label) => {
  canonicalSequence += 1; return `mcp-reference-${label}-${String(canonicalSequence).padStart(2, '0')}`;
};

async function runVariant(firmwareVariant, prefix) {
  const client = await createClient();
  try {
    const listed = await client.request('tools/list');
    const names = listed.result?.tools?.map((item) => item.name) ?? [];
    if (names.length !== 4 || names.includes('patch.apply')) throw new Error('MCP_TOOL_AUTHORITY_MISMATCH');
    const contextResult = await client.tool('intent_mcu_context', {});
    const adapterContext = contextResult.structuredContent;
    if (!adapterContext?.ok || adapterContext.applyAuthority !== false) throw new Error('MCP_CONTEXT_FAILED');
    const discoveryResult = await client.tool('intent_mcu_discover', {
      requestId: nextCanonicalId(`${prefix}-discover`), acceptSchema: 'intent-mcu-capability-discovery@1',
    });
    const discovery = discoveryResult.structuredContent;
    if (!discovery?.ok || discovery.discovery.actions.count !== 7
        || discovery.discovery.actions.applyAuthority !== false) throw new Error('MCP_DISCOVERY_FAILED');

    const profile = 'board.atmega328p-16mhz-v1'; let generation = adapterContext.context.generation;
    const action = async (name, payload, label) => {
      const now = Date.now(); const requestId = nextCanonicalId(`${prefix}-${label}`);
      const result = await client.tool('intent_mcu_action', {
        schema: 'intent-mcu-bounded-action-request@1', action: name, requestId, profile,
        expectedGeneration: generation, issuedAtMs: now, expiresAtMs: now + 30_000, payload,
      });
      const external = result.structuredContent;
      generation = external.generation?.after ?? generation;
      return { requestId, result, external };
    };
    const created = await action('project.create', {
      starterId: 'avr-thermostat-boundary-v1', firmwareVariant,
    }, 'create');
    if (created.external.category !== 'success') throw new Error(`MCP_CREATE_FAILED:${JSON.stringify(created.external)}`);
    const built = await action('firmware.build', {}, 'build');
    if (built.external.category !== 'success') throw new Error(`MCP_BUILD_FAILED:${JSON.stringify(built.external)}`);
    const ran = await action('runtime.run', { experimentId: 'avr-thermostat-boundary-v1' }, 'run');
    const read = await action('result.read', {}, 'read');
    const job = await client.tool('intent_mcu_job', {
      requestId: nextCanonicalId(`${prefix}-job`), targetRequestId: ran.requestId, operation: 'read',
    });
    return { protocolVersion: client.initialized.result.protocolVersion, names, discovery, built, ran, read,
      job: job.structuredContent };
  } finally { await client.close(); }
}

const correct = await runVariant('correct', 'correct');
const knownBad = await runVariant('known-bad-equality', 'known-bad');
if (correct.ran.external.category !== 'success' || correct.ran.external.testVerdict?.status !== 'passed') {
  throw new Error(`MCP_CORRECT_REFERENCE_FAILED:${JSON.stringify(correct.ran.external)}`);
}
if (knownBad.ran.external.category !== 'test-failure'
    || knownBad.ran.external.testVerdict?.scenarioId !== 'THERM-SCENARIO-EQUALITY-ENABLED') {
  throw new Error(`MCP_KNOWN_BAD_REFERENCE_FAILED:${JSON.stringify(knownBad.ran.external)}`);
}
process.stdout.write(`${JSON.stringify({
  status: 'pass', transport: 'mcp-stdio', protocolVersion: correct.protocolVersion,
  tools: correct.names, canonicalActions: correct.discovery.discovery.actions.names,
  correct: { category: correct.ran.external.category, verdict: correct.ran.external.testVerdict.status,
    artifact: correct.ran.external.testVerdict.artifactIdentity, job: correct.job.code },
  knownBad: { category: knownBad.ran.external.category, verdict: knownBad.ran.external.testVerdict.status,
    scenario: knownBad.ran.external.testVerdict.scenarioId,
    artifact: knownBad.ran.external.testVerdict.artifactIdentity, job: knownBad.job.code },
  applyAuthority: false, genericCommand: false, publicEndpoint: false,
})}\n`);
