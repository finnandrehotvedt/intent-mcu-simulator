#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import readline from 'node:readline';
import {
  EXTERNAL_CLIENT_CONTROL_RESULT_SCHEMA, EXTERNAL_CLIENT_READY_SCHEMA,
  EXTERNAL_CLIENT_JOB_REQUEST_SCHEMA,
  externalClientError, externalClientLineAssociation, parseExternalClientLine, resolveExternalClientOrigin,
} from '../src/external-client-protocol.mjs';
import { createExternalClientJobLedger } from '../src/external-client-jobs.mjs';
import {
  EXTERNAL_CLIENT_RESULT_SCHEMA, externalClientRequestAssociation, externalClientResult,
} from '../src/external-client-results.mjs';

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
  let jobs = null;
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  };
  try {
    await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true && Boolean(window.__AGENT_ACTIONS__)
      && Boolean(window.__CAPABILITY_DISCOVERY__));
    const ready = await page.evaluate(() => ({
      schema: 'intent-mcu-external-client-ready@1',
      router: window.__AGENT_ACTIONS__.schema,
      requestSchema: window.__AGENT_ACTIONS__.requestSchema,
      actions: [...window.__AGENT_ACTIONS__.actions],
      context: window.__AGENT_ACTIONS__.context(),
      externalEndpoint: window.__AGENT_ACTIONS__.externalEndpoint,
      applyAuthority: false,
      genericCommand: false,
      discoverySchema: window.__CAPABILITY_DISCOVERY__.schema,
      discoveryRequestSchema: window.__CAPABILITY_DISCOVERY__.requestSchema,
      discoveryReadOnly: window.__CAPABILITY_DISCOVERY__.readOnly,
      sourceIdentity: window.__CAPABILITY_DISCOVERY__.snapshot().identity,
    }));
    if (ready.schema !== EXTERNAL_CLIENT_READY_SCHEMA || ready.actions.length !== 7
        || ready.externalEndpoint !== false || ready.applyAuthority !== false || ready.discoveryReadOnly !== true) {
      throw new Error('EXTERNAL_CLIENT_PAGE_CONTRACT_MISMATCH');
    }
    write({ ...ready, transport: 'stdio', origin, durableServerProject: false,
      resultSchema: EXTERNAL_CLIENT_RESULT_SCHEMA,
      jobRequestSchema: EXTERNAL_CLIENT_JOB_REQUEST_SCHEMA,
      jobLifetime: 'action-request-expiresAtMs', jobEvidenceDataOnly: true });

    jobs = createExternalClientJobLedger();
    const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
    input.on('line', async (line) => {
      let parsed;
      try { parsed = parseExternalClientLine(line); }
      catch (error) {
        const association = externalClientLineAssociation(line);
        write(externalClientResult(externalClientError(error.code ?? error.message, association.requestId),
          association, ready.sourceIdentity)); return;
      }
      if (parsed.kind === 'cancel') {
        const result = await page.evaluate((target) => window.__AGENT_ACTIONS__.cancel(target), parsed.value.targetRequestId);
        if (result.ok) jobs.cancellationRequested(parsed.value.targetRequestId);
        write({ schema: EXTERNAL_CLIENT_CONTROL_RESULT_SCHEMA, requestId: parsed.value.requestId,
          targetRequestId: parsed.value.targetRequestId, ...result });
        return;
      }
      if (parsed.kind === 'job') {
        write({ requestId: parsed.value.requestId, ...jobs.inspect(
          parsed.value.targetRequestId, parsed.value.operation,
        ) });
        return;
      }
      if (parsed.kind === 'discovery') {
        try {
          const result = await page.evaluate((request) => window.__CAPABILITY_DISCOVERY__.request(request), parsed.value);
          write(result);
        } catch (error) {
          const failure = externalClientError(
            error.code ?? error.message ?? 'CAPABILITY_DISCOVERY_FAILED', parsed.value.requestId,
          );
          write(externalClientResult(failure, parsed.value, ready.sourceIdentity));
        }
        return;
      }
      let tracked = false;
      try {
        tracked = Boolean(jobs.begin(parsed.value, ready.sourceIdentity));
        // Fixed adapter code forwards data only. The client cannot provide a function or script.
        const result = await page.evaluate((source) => window.__AGENT_ACTIONS__.execute(source), parsed.source);
        const external = externalClientResult(result, parsed.value, ready.sourceIdentity);
        if (tracked) jobs.complete(parsed.value.requestId, external);
        write(external);
      } catch (error) {
        const failure = externalClientError(
          error.code ?? error.message ?? 'EXTERNAL_CLIENT_ACTION_FAILED', parsed.value.requestId,
        );
        const external = externalClientResult(failure, externalClientRequestAssociation(parsed.value), ready.sourceIdentity);
        if (tracked) jobs.complete(parsed.value.requestId, external);
        write(external);
      }
    });
    await new Promise((resolve) => input.once('close', resolve));
  } finally { jobs?.dispose(); await close(); }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runExternalClientAdapter().catch((error) => {
    write(externalClientError(error.code ?? error.message ?? 'EXTERNAL_CLIENT_START_FAILED'));
    process.exitCode = 1;
  });
}
