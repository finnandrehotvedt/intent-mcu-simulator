// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMcpProtocolRouter, MCP_PROTOCOL_VERSION, MCP_TOOLS, parseMcpLine,
} from '../src/mcp-adapter-protocol.mjs';

const sourceIdentity = Object.freeze({ product: 'Intent MCU Simulator', version: '1.1.0-rc.95',
  source: 'https://github.com/finnandrehotvedt/intent-mcu-simulator', license: 'Apache-2.0', generated: false });
const ready = Object.freeze({ context: Object.freeze({ profile: 'board.atmega328p-16mhz-v1', generation: 3 }),
  sourceIdentity,
  origin: 'https://lab.teachthecompany.com', actions: Object.freeze([
  'project.create', 'patch.propose', 'project.validate', 'firmware.build',
  'runtime.run', 'result.read', 'project.export',
]) });
const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
  protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '1' },
} };

const dynamicContext = (request, generation = 9) => ({
  schema: 'intent-mcu-external-client-context-result@1', requestId: request.requestId,
  ok: true, code: 'EXTERNAL_CLIENT_CONTEXT_READ', executed: false,
  router: 'intent-mcu-bounded-action-router@1',
  context: { profile: 'board.atmega328p-16mhz-v1', generation }, actions: [...ready.actions],
  sourceIdentity,
  review: { status: 'No proposal reviewed.', proposalPending: false, applyEnabled: false },
  origin: ready.origin, reviewMode: 'visible', humanReviewSurface: true,
  applyAuthority: false, genericCommand: false, durableServerProject: false, publicEndpoint: false,
});

test('X14 negotiates the supported MCP lifecycle before exposing four bounded tools', async () => {
  const router = createMcpProtocolRouter({ ready, sendCanonical: async (value) => dynamicContext(value) });
  const early = await router.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  assert.equal(early.error.code, -32002);
  const init = await router.handle(initialize);
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.deepEqual(init.result.capabilities, { tools: { listChanged: false } });
  await router.handle({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  const listed = await router.handle({ jsonrpc: '2.0', id: 'list', method: 'tools/list', params: {} });
  assert.deepEqual(listed.result.tools.map((item) => item.name), MCP_TOOLS.map((item) => item.name));
  assert.equal(JSON.stringify(listed).includes('patch.apply'), false);
  const context = await router.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
    name: 'intent_mcu_context', arguments: {},
  } });
  assert.equal(context.result.structuredContent.context.generation, 9);
  assert.equal(context.result.structuredContent.applyAuthority, false);
  assert.equal(context.result.structuredContent.humanReviewSurface, true);
});

test('M2 context is dynamically forwarded with strict request/result identity and no startup reuse', async () => {
  const forwarded = []; let generation = 40;
  const router = createMcpProtocolRouter({ ready, sendCanonical: async (value) => {
    forwarded.push(value); generation += 1; return dynamicContext(value, generation);
  } });
  await router.handle(initialize);
  await router.handle({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  const first = await router.handle({ jsonrpc: '2.0', id: 'context-one', method: 'tools/call', params: {
    name: 'intent_mcu_context', arguments: {},
  } });
  const second = await router.handle({ jsonrpc: '2.0', id: 'context-two', method: 'tools/call', params: {
    name: 'intent_mcu_context', arguments: {},
  } });
  assert.deepEqual(forwarded.map((value) => value.schema), [
    'intent-mcu-external-client-context-request@1', 'intent-mcu-external-client-context-request@1',
  ]);
  assert.deepEqual(forwarded.map((value) => value.requestId), ['mcp-context-0001', 'mcp-context-0002']);
  assert.equal(first.result.structuredContent.context.generation, 41);
  assert.equal(second.result.structuredContent.context.generation, 42);
  assert.notEqual(second.result.structuredContent.context.generation, ready.context.generation);
  assert.equal(second.result.structuredContent.actions.length, 7);
  assert.equal(second.result.structuredContent.actions.includes('patch.apply'), false);

  const invalidArgs = await router.handle({ jsonrpc: '2.0', id: 'context-invalid', method: 'tools/call', params: {
    name: 'intent_mcu_context', arguments: { selector: 'body' },
  } });
  assert.equal(invalidArgs.result.structuredContent.code, 'MCP_CONTEXT_ARGUMENTS');
  assert.equal(forwarded.length, 2);
});

test('M2 context rejects mismatched downstream request identity', async () => {
  const router = createMcpProtocolRouter({ ready, sendCanonical: async (value) => ({
    ...dynamicContext(value), requestId: 'mcp-context-wrong',
  }) });
  await router.handle(initialize);
  await router.handle({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  const response = await router.handle({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: {
    name: 'intent_mcu_context', arguments: {},
  } });
  assert.equal(response.result.structuredContent.code, 'MCP_CONTEXT_RESPONSE_INVALID');
  assert.equal(response.result.isError, true);
});

test('X14 tool calls wrap but do not reinterpret canonical discovery action and job envelopes', async () => {
  const forwarded = [];
  const router = createMcpProtocolRouter({ ready, sendCanonical: async (value) => {
    forwarded.push(value); return { ok: true, code: 'CANONICAL', echoed: value };
  } });
  await router.handle(initialize);
  await router.handle({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  const discovery = await router.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: {
    name: 'intent_mcu_discover', arguments: { requestId: 'mcp-discovery-request', acceptSchema: 'intent-mcu-capability-discovery@1' },
  } });
  const now = Date.now();
  const action = await router.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
    name: 'intent_mcu_action', arguments: { schema: 'intent-mcu-bounded-action-request@1',
      action: 'project.validate', requestId: 'mcp-action-request', profile: 'board.atmega328p-16mhz-v1',
      expectedGeneration: 1, issuedAtMs: now, expiresAtMs: now + 30_000, payload: {} },
  } });
  const job = await router.handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: {
    name: 'intent_mcu_job', arguments: { requestId: 'mcp-job-request', targetRequestId: 'mcp-action-request', operation: 'read' },
  } });
  assert.equal(forwarded[0].schema, 'intent-mcu-capability-discovery-request@1');
  assert.equal(forwarded[1].schema, 'intent-mcu-bounded-action-request@1');
  assert.equal(forwarded[2].schema, 'intent-mcu-external-client-job-request@1');
  for (const result of [discovery, action, job]) {
    assert.equal(result.result.isError, false);
    assert.deepEqual(JSON.parse(result.result.content[0].text), result.result.structuredContent);
  }
});

test('X14 MCP cancellation maps only an active tools/call request to canonical cancellation', async () => {
  const forwarded = []; let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const router = createMcpProtocolRouter({ ready, sendCanonical: async (value) => {
    forwarded.push(value);
    if (value.schema === 'intent-mcu-bounded-action-request@1') return blocked;
    return { ok: true, code: 'ACTION_CANCEL_REQUESTED' };
  } });
  await router.handle(initialize);
  await router.handle({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  const now = Date.now();
  const call = router.handle({ jsonrpc: '2.0', id: 'active-call', method: 'tools/call', params: {
    name: 'intent_mcu_action', arguments: { schema: 'intent-mcu-bounded-action-request@1',
      action: 'runtime.run', requestId: 'mcp-active-action', profile: 'board.atmega328p-16mhz-v1',
      expectedGeneration: 1, issuedAtMs: now, expiresAtMs: now + 30_000,
      payload: { experimentId: 'avr-thermostat-boundary-v1' } },
  } });
  await new Promise((resolve) => setImmediate(resolve));
  await router.handle({ jsonrpc: '2.0', method: 'notifications/cancelled', params: {
    requestId: 'active-call', reason: 'test',
  } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(forwarded[1].schema, 'intent-mcu-external-client-cancel@1');
  assert.equal(forwarded[1].targetRequestId, 'mcp-active-action');
  release({ ok: false, code: 'ACTION_CANCELLED', executed: false });
  const response = await call;
  assert.equal(response.result.isError, true);
  assert.equal(response.result.structuredContent.code, 'ACTION_CANCELLED');
});

test('X14 rejects malformed protocol and invented tools without adding authority', async () => {
  assert.throws(() => parseMcpLine('{"jsonrpc":"2.0","id":1,"id":2}'), /DUPLICATE_KEY/u);
  const router = createMcpProtocolRouter({ ready, sendCanonical: async () => assert.fail('must not forward') });
  const negotiated = await router.handle({ ...initialize, params: { ...initialize.params, protocolVersion: '2099-01-01' } });
  assert.equal(negotiated.result.protocolVersion, MCP_PROTOCOL_VERSION);
  await router.handle({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  const invented = await router.handle({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: {
    name: 'shell_execute', arguments: { command: 'true' },
  } });
  assert.equal(invented.result.isError, true);
  assert.equal(invented.result.structuredContent.code, 'MCP_TOOL_NOT_FOUND');
});
