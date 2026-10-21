// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { BOUNDED_ACTION_REQUEST_LIMIT } from './bounded-action-contracts.mjs';
import { CAPABILITY_DISCOVERY_REQUEST_SCHEMA, CAPABILITY_DISCOVERY_SCHEMA } from './capability-discovery.mjs';
import {
  EXTERNAL_CLIENT_CANCEL_SCHEMA, EXTERNAL_CLIENT_JOB_REQUEST_SCHEMA,
} from './external-client-protocol.mjs';
import { parseStrictJson } from './strict-json.mjs';

export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const MCP_SERVER_NAME = 'intent-mcu-thin-adapter';
export const MCP_SERVER_VERSION = '1.0.0';
export const MCP_LINE_LIMIT = BOUNDED_ACTION_REQUEST_LIMIT + 16 * 1024;

const REQUEST_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$';
const PROFILE_PATTERN = '^board\\.[a-z0-9.-]+-v[0-9]+$';
const idKey = (id) => `${typeof id}:${String(id)}`;
const validId = (id) => typeof id === 'string' || (Number.isSafeInteger(id) && id >= 0);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const requestId = { type: 'string', pattern: REQUEST_ID_PATTERN };
const noExtra = (properties, required = Object.keys(properties)) => ({
  type: 'object', properties, required, additionalProperties: false,
});

export const MCP_TOOLS = Object.freeze([
  Object.freeze({
    name: 'intent_mcu_context',
    title: 'Read current Intent MCU adapter context',
    description: 'Read the fixed origin, active profile and current generation needed to form a bounded action request.',
    inputSchema: noExtra({}),
  }),
  Object.freeze({
    name: 'intent_mcu_discover',
    title: 'Discover Intent MCU capabilities',
    description: 'Read the canonical profiles, seven actions, limits and schemas. This grants no execution authority.',
    inputSchema: noExtra({
      requestId,
      acceptSchema: { type: 'string', const: CAPABILITY_DISCOVERY_SCHEMA },
    }),
  }),
  Object.freeze({
    name: 'intent_mcu_action',
    title: 'Run one bounded Intent MCU action',
    description: 'Forward one exact canonical bounded-action request. There is no Apply, shell, eval or generic command.',
    inputSchema: noExtra({
      schema: { type: 'string', const: 'intent-mcu-bounded-action-request@1' },
      action: { type: 'string', enum: [
        'project.create', 'patch.propose', 'project.validate', 'firmware.build',
        'runtime.run', 'result.read', 'project.export',
      ] },
      requestId,
      profile: { type: 'string', pattern: PROFILE_PATTERN },
      expectedGeneration: { type: 'integer', minimum: 1 },
      issuedAtMs: { type: 'integer', minimum: 0 },
      expiresAtMs: { type: 'integer', minimum: 1 },
      payload: { type: 'object' },
    }),
  }),
  Object.freeze({
    name: 'intent_mcu_job',
    title: 'Read or export ephemeral job evidence',
    description: 'Read or export one existing short-lived job by request ID. Exported evidence cannot restore authority.',
    inputSchema: noExtra({
      requestId,
      targetRequestId: requestId,
      operation: { type: 'string', enum: ['read', 'export'] },
    }),
  }),
]);

export function parseMcpLine(line) {
  if (typeof line !== 'string' || new TextEncoder().encode(line).byteLength > MCP_LINE_LIMIT) {
    throw Object.assign(new Error('MCP_LINE_LIMIT'), { code: -32600 });
  }
  return parseStrictJson(line, MCP_LINE_LIMIT);
}

function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id: validId(id) || id === null ? id : null, error };
}

function toolResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: structuredClone(value),
    isError: value?.ok === false,
  };
}

export function createMcpProtocolRouter({ ready, sendCanonical } = {}) {
  if (!object(ready) || ready.actions?.length !== 7 || typeof sendCanonical !== 'function') {
    throw new TypeError('MCP_ROUTER_CONFIGURATION');
  }
  let initializeResponded = false;
  let initialized = false;
  let cancelSequence = 0;
  const activeCalls = new Map();

  async function handle(message) {
    if (!object(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return rpcError(message?.id ?? null, -32600, 'Invalid Request');
    }
    const notification = !Object.hasOwn(message, 'id');
    if (!notification && !validId(message.id)) return rpcError(null, -32600, 'Invalid Request');

    if (message.method === 'initialize') {
      if (notification || initializeResponded || !object(message.params)
          || typeof message.params.protocolVersion !== 'string'
          || !object(message.params.capabilities) || !object(message.params.clientInfo)
          || typeof message.params.clientInfo.name !== 'string'
          || typeof message.params.clientInfo.version !== 'string') {
        return rpcError(message.id ?? null, -32602, 'Invalid initialize parameters');
      }
      initializeResponded = true;
      return rpcResult(message.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: MCP_SERVER_NAME, title: 'Intent MCU thin adapter', version: MCP_SERVER_VERSION },
        instructions: 'Use only the four listed tools. The adapter has no Apply, shell, eval, account, credential, public endpoint or durable project authority.',
      });
    }

    if (message.method === 'notifications/initialized') {
      if (!notification || !initializeResponded || (message.params !== undefined && !object(message.params))) return null;
      initialized = true;
      return null;
    }

    if (message.method === 'notifications/cancelled') {
      if (!notification || !initialized || !object(message.params) || !validId(message.params.requestId)) return null;
      const targetRequestId = activeCalls.get(idKey(message.params.requestId));
      if (!targetRequestId) return null;
      cancelSequence += 1;
      const cancellation = {
        schema: EXTERNAL_CLIENT_CANCEL_SCHEMA,
        requestId: `mcp-cancel-${String(cancelSequence).padStart(4, '0')}`,
        targetRequestId,
      };
      void sendCanonical(cancellation).catch(() => {});
      return null;
    }

    if (!initializeResponded || !initialized) {
      return notification ? null : rpcError(message.id, -32002, 'Server not initialized');
    }
    if (message.method === 'ping') return notification ? null : rpcResult(message.id, {});
    if (message.method === 'tools/list') {
      if (notification || (message.params !== undefined
          && (!object(message.params) || (message.params.cursor !== undefined && message.params.cursor !== null)))) {
        return rpcError(message.id ?? null, -32602, 'Invalid tools/list parameters');
      }
      return rpcResult(message.id, { tools: structuredClone(MCP_TOOLS) });
    }
    if (message.method === 'tools/call') {
      if (notification || !object(message.params) || typeof message.params.name !== 'string'
          || !object(message.params.arguments)) return rpcError(message.id ?? null, -32602, 'Invalid tools/call parameters');
      const { name, arguments: args } = message.params;
      let canonical;
      if (name === 'intent_mcu_context') return rpcResult(message.id, toolResult({
        schema: 'intent-mcu-mcp-context@1', ok: true, executed: false,
        context: structuredClone(ready.context), actions: structuredClone(ready.actions),
        origin: ready.origin, applyAuthority: false, genericCommand: false,
        durableServerProject: false, publicEndpoint: false,
      }));
      if (name === 'intent_mcu_discover') canonical = {
        schema: CAPABILITY_DISCOVERY_REQUEST_SCHEMA, ...structuredClone(args),
      };
      else if (name === 'intent_mcu_action') canonical = structuredClone(args);
      else if (name === 'intent_mcu_job') canonical = {
        schema: EXTERNAL_CLIENT_JOB_REQUEST_SCHEMA, ...structuredClone(args),
      };
      else return rpcResult(message.id, toolResult({ ok: false, code: 'MCP_TOOL_NOT_FOUND', executed: false }));

      if (name === 'intent_mcu_action' && typeof canonical.requestId === 'string') {
        activeCalls.set(idKey(message.id), canonical.requestId);
      }
      try { return rpcResult(message.id, toolResult(await sendCanonical(canonical))); }
      catch (error) {
        return rpcResult(message.id, toolResult({
          ok: false, code: error.code ?? 'MCP_DOWNSTREAM_FAILURE', executed: false,
        }));
      } finally { activeCalls.delete(idKey(message.id)); }
    }
    return notification ? null : rpcError(message.id, -32601, 'Method not found');
  }

  return Object.freeze({ handle, tools: MCP_TOOLS, protocolVersion: MCP_PROTOCOL_VERSION });
}
