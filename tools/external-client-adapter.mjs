#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import readline from 'node:readline';
import {
  EXTERNAL_CLIENT_CONTROL_RESULT_SCHEMA, EXTERNAL_CLIENT_READY_SCHEMA,
  externalClientError, parseExternalClientLine, resolveExternalClientOrigin,
} from '../src/external-client-protocol.mjs';

const write = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

function loadPlaywright(environment = process.env) {
  const base = environment.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
  return createRequire(import.meta.url)(`${base}/playwright`);
}

export async function runExternalClientAdapter({ environment = process.env } = {}) {
  const origin = resolveExternalClientOrigin(environment);
  const { chromium } = loadPlaywright(environment);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  };
  try {
    await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true && Boolean(window.__AGENT_ACTIONS__));
    const ready = await page.evaluate(() => ({
      schema: 'intent-mcu-external-client-ready@1',
      router: window.__AGENT_ACTIONS__.schema,
      requestSchema: window.__AGENT_ACTIONS__.requestSchema,
      actions: [...window.__AGENT_ACTIONS__.actions],
      context: window.__AGENT_ACTIONS__.context(),
      externalEndpoint: window.__AGENT_ACTIONS__.externalEndpoint,
      applyAuthority: false,
      genericCommand: false,
    }));
    if (ready.schema !== EXTERNAL_CLIENT_READY_SCHEMA || ready.actions.length !== 7
        || ready.externalEndpoint !== false || ready.applyAuthority !== false) {
      throw new Error('EXTERNAL_CLIENT_PAGE_CONTRACT_MISMATCH');
    }
    write({ ...ready, transport: 'stdio', origin, durableServerProject: false });

    const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
    input.on('line', async (line) => {
      let parsed;
      try { parsed = parseExternalClientLine(line); }
      catch (error) { write(externalClientError(error.code ?? error.message)); return; }
      if (parsed.kind === 'cancel') {
        const result = await page.evaluate((target) => window.__AGENT_ACTIONS__.cancel(target), parsed.value.targetRequestId);
        write({ schema: EXTERNAL_CLIENT_CONTROL_RESULT_SCHEMA, requestId: parsed.value.requestId,
          targetRequestId: parsed.value.targetRequestId, ...result });
        return;
      }
      try {
        // Fixed adapter code forwards data only. The client cannot provide a function or script.
        const result = await page.evaluate((source) => window.__AGENT_ACTIONS__.execute(source), parsed.source);
        write(result);
      } catch (error) {
        write(externalClientError(error.code ?? error.message ?? 'EXTERNAL_CLIENT_ACTION_FAILED', parsed.value.requestId));
      }
    });
    await new Promise((resolve) => input.once('close', resolve));
  } finally { await close(); }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runExternalClientAdapter().catch((error) => {
    write(externalClientError(error.code ?? error.message ?? 'EXTERNAL_CLIENT_START_FAILED'));
    process.exitCode = 1;
  });
}
