#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import readline from 'node:readline';
import { EXTERNAL_CLIENT_READY_SCHEMA } from '../src/external-client-protocol.mjs';
import { createMcpProtocolRouter, parseMcpLine } from '../src/mcp-adapter-protocol.mjs';

const downstreamPath = fileURLToPath(new URL('./external-client-adapter.mjs', import.meta.url));
const write = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const responseRequestId = (value) => value?.request?.requestId ?? value?.requestId ?? null;

export async function runMcpAdapter({ environment = process.env } = {}) {
  const downstream = spawn(process.execPath, [downstreamPath], {
    env: environment, stdio: ['pipe', 'pipe', 'inherit'],
  });
  const downstreamExit = new Promise((resolve) => downstream.once('exit', resolve));
  const pending = new Map();
  let readyResolve; let readyReject;
  const readyPromise = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const downstreamLines = readline.createInterface({ input: downstream.stdout, crlfDelay: Infinity, terminal: false });
  downstreamLines.on('line', (line) => {
    let value;
    try { value = JSON.parse(line); } catch { readyReject(Object.assign(new Error('MCP_DOWNSTREAM_INVALID_JSON'), { code: 'MCP_DOWNSTREAM_INVALID_JSON' })); return; }
    if (value?.schema === EXTERNAL_CLIENT_READY_SCHEMA) { readyResolve(value); return; }
    const requestId = responseRequestId(value);
    const waiter = pending.get(requestId);
    if (!waiter) return;
    pending.delete(requestId); waiter.resolve(value);
  });
  downstream.once('error', readyReject);
  downstream.once('exit', (code) => {
    const error = Object.assign(new Error(`MCP_DOWNSTREAM_EXIT_${code}`), { code: 'MCP_DOWNSTREAM_EXIT' });
    readyReject(error);
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  });

  const close = () => {
    if (!downstream.stdin.destroyed) downstream.stdin.end();
  };
  try {
    const ready = await readyPromise;
    const sendCanonical = (value) => new Promise((resolve, reject) => {
      const requestId = value?.requestId;
      if (typeof requestId !== 'string' || pending.has(requestId)) {
        reject(Object.assign(new Error('MCP_DOWNSTREAM_REQUEST_ID'), { code: 'MCP_DOWNSTREAM_REQUEST_ID' })); return;
      }
      pending.set(requestId, { resolve, reject });
      downstream.stdin.write(`${JSON.stringify(value)}\n`, (error) => {
        if (!error) return;
        pending.delete(requestId); reject(Object.assign(error, { code: 'MCP_DOWNSTREAM_WRITE' }));
      });
    });
    const router = createMcpProtocolRouter({ ready, sendCanonical });
    const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
    input.on('line', (line) => {
      void (async () => {
        let message;
        try { message = parseMcpLine(line); }
        catch (error) { write({ jsonrpc: '2.0', id: null, error: {
          code: Number.isInteger(error.code) ? error.code : -32700, message: 'Parse error',
        } }); return; }
        const response = await router.handle(message);
        if (response) write(response);
      })();
    });
    await new Promise((resolve) => input.once('close', resolve));
  } finally {
    close();
    await downstreamExit;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runMcpAdapter().catch((error) => {
    write({ jsonrpc: '2.0', id: null, error: { code: -32603, message: error.code ?? 'MCP_ADAPTER_START_FAILED' } });
    process.exitCode = 1;
  });
}
