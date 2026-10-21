#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import readline from 'node:readline';
import {
  EXTERNAL_CLIENT_CONTEXT_RESULT_SCHEMA, EXTERNAL_CLIENT_CONTROL_RESULT_SCHEMA,
  EXTERNAL_CLIENT_READY_SCHEMA, EXTERNAL_CLIENT_JOB_REQUEST_SCHEMA,
  externalClientError, externalClientLineAssociation, parseExternalClientContextSnapshot,
  parseExternalClientContextResult, parseExternalClientLine, resolveExternalClientOrigin,
  resolveExternalClientReviewMode,
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

const pageError = (code) => Object.assign(new Error(code), { code });
const sameIdentity = (left, right) => JSON.stringify(left) === JSON.stringify(right);

// This fixed function is the complete browser read surface. No client value is
// accepted as a selector, expression or function.
export function browserContextSnapshot(boundWindow = window) {
  const actions = boundWindow.__AGENT_ACTIONS__;
  const discovery = boundWindow.__CAPABILITY_DISCOVERY__;
  const patch = boundWindow.__PROJECT_PATCH__;
  const status = boundWindow.document.getElementById('project-patch-status');
  const apply = boundWindow.document.getElementById('project-patch-apply');
  if (!actions || !discovery || !patch || !status || !apply) throw new Error('EXTERNAL_CLIENT_PAGE_CONTRACT_MISMATCH');
  return {
    router: actions.schema,
    actions: [...actions.actions],
    context: actions.context(),
    sourceIdentity: discovery.snapshot().identity,
    review: {
      status: status.textContent.trim(),
      proposalPending: Boolean(patch.state()),
      applyEnabled: apply.disabled === false,
    },
  };
}

export function createExternalClientPageGuard({ page, sessionHandle, expectedUrl, expectedSourceIdentity,
  inFlight = () => 0, operationEpoch = () => 0 } = {}) {
  if (!page || !sessionHandle || typeof sessionHandle.evaluate !== 'function'
      || typeof expectedUrl !== 'string' || !expectedSourceIdentity || typeof inFlight !== 'function'
      || typeof operationEpoch !== 'function') {
    throw new TypeError('EXTERNAL_CLIENT_PAGE_GUARD_CONFIGURATION');
  }
  let retired = page.isClosed();
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) retired = true; });
  page.on('close', () => { retired = true; });
  const assertBoundSession = () => {
    if (page.isClosed()) throw pageError('EXTERNAL_CLIENT_PAGE_CLOSED');
    if (retired || page.url() !== expectedUrl) throw pageError('EXTERNAL_CLIENT_PAGE_REPLACED');
  };
  const evaluate = async (pageFunction, argument) => {
    assertBoundSession();
    try {
      const value = await sessionHandle.evaluate(pageFunction, argument);
      assertBoundSession();
      return value;
    } catch (error) {
      if (page.isClosed()) throw pageError('EXTERNAL_CLIENT_PAGE_CLOSED');
      if (retired || page.url() !== expectedUrl) throw pageError('EXTERNAL_CLIENT_PAGE_REPLACED');
      if (/execution context was destroyed|jsHandle is disposed|cannot find context/iu.test(error.message ?? '')) {
        retired = true;
        throw pageError('EXTERNAL_CLIENT_PAGE_REPLACED');
      }
      throw error;
    }
  };
  const snapshot = async ({ requireIdle = false } = {}) => {
    if (requireIdle && inFlight() !== 0) throw pageError('EXTERNAL_CLIENT_CONTEXT_BUSY');
    const beforeOperationEpoch = operationEpoch();
    let value;
    try { value = parseExternalClientContextSnapshot(await evaluate(browserContextSnapshot)); }
    catch (error) {
      if (page.isClosed()) throw pageError('EXTERNAL_CLIENT_PAGE_CLOSED');
      throw pageError(error.code ?? error.message ?? 'EXTERNAL_CLIENT_CONTEXT_READ_FAILED');
    }
    if (requireIdle && (inFlight() !== 0 || operationEpoch() !== beforeOperationEpoch)) {
      throw pageError('EXTERNAL_CLIENT_CONTEXT_BUSY');
    }
    if (!sameIdentity(value.sourceIdentity, expectedSourceIdentity)) throw pageError('EXTERNAL_CLIENT_SOURCE_IDENTITY_DRIFT');
    return value;
  };
  return Object.freeze({ evaluate, snapshot });
}

export async function runExternalClientAdapter({ environment = process.env } = {}) {
  const origin = resolveExternalClientOrigin(environment);
  const reviewMode = resolveExternalClientReviewMode(environment);
  const { chromium } = loadPlaywright(environment);
  const browser = await chromium.launch({ headless: reviewMode.headless });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  let jobs = null;
  let pageOperations = 0;
  let pageOperationEpoch = 0;
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
    const sessionHandle = await page.evaluateHandle(() => window);
    const initial = parseExternalClientContextSnapshot(await sessionHandle.evaluate(browserContextSnapshot));
    const ready = {
      schema: 'intent-mcu-external-client-ready@1',
      router: initial.router,
      requestSchema: await sessionHandle.evaluate((boundWindow) => boundWindow.__AGENT_ACTIONS__.requestSchema),
      actions: initial.actions,
      context: initial.context,
      externalEndpoint: await sessionHandle.evaluate((boundWindow) => boundWindow.__AGENT_ACTIONS__.externalEndpoint),
      applyAuthority: false,
      genericCommand: false,
      discoverySchema: await sessionHandle.evaluate((boundWindow) => boundWindow.__CAPABILITY_DISCOVERY__.schema),
      discoveryRequestSchema: await sessionHandle.evaluate((boundWindow) => boundWindow.__CAPABILITY_DISCOVERY__.requestSchema),
      discoveryReadOnly: await sessionHandle.evaluate((boundWindow) => boundWindow.__CAPABILITY_DISCOVERY__.readOnly),
      sourceIdentity: initial.sourceIdentity,
    };
    if (ready.schema !== EXTERNAL_CLIENT_READY_SCHEMA || ready.actions.length !== 7
        || ready.externalEndpoint !== false || ready.applyAuthority !== false || ready.discoveryReadOnly !== true) {
      throw new Error('EXTERNAL_CLIENT_PAGE_CONTRACT_MISMATCH');
    }
    const guard = createExternalClientPageGuard({ page, sessionHandle, expectedUrl: `${origin}/`,
      expectedSourceIdentity: ready.sourceIdentity, inFlight: () => pageOperations,
      operationEpoch: () => pageOperationEpoch });
    write({ ...ready, transport: 'stdio', origin, durableServerProject: false,
      resultSchema: EXTERNAL_CLIENT_RESULT_SCHEMA,
      jobRequestSchema: EXTERNAL_CLIENT_JOB_REQUEST_SCHEMA,
      jobLifetime: 'action-request-expiresAtMs', jobEvidenceDataOnly: true,
      reviewMode: reviewMode.mode, humanReviewSurface: reviewMode.humanReviewSurface });

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
        pageOperations += 1; pageOperationEpoch += 1;
        try {
          await guard.snapshot();
          const result = await guard.evaluate(
            (boundWindow, target) => boundWindow.__AGENT_ACTIONS__.cancel(target), parsed.value.targetRequestId,
          );
          await guard.snapshot();
          if (result.ok) jobs.cancellationRequested(parsed.value.targetRequestId);
          write({ schema: EXTERNAL_CLIENT_CONTROL_RESULT_SCHEMA, requestId: parsed.value.requestId,
            targetRequestId: parsed.value.targetRequestId, ...result });
        } catch (error) {
          write(externalClientError(error.code ?? error.message ?? 'EXTERNAL_CLIENT_CANCEL_FAILED',
            parsed.value.requestId));
        } finally { pageOperations -= 1; }
        return;
      }
      if (parsed.kind === 'job') {
        write({ requestId: parsed.value.requestId, ...jobs.inspect(
          parsed.value.targetRequestId, parsed.value.operation,
        ) });
        return;
      }
      if (parsed.kind === 'context') {
        try {
          const current = await guard.snapshot({ requireIdle: true });
          const result = { schema: EXTERNAL_CLIENT_CONTEXT_RESULT_SCHEMA, requestId: parsed.value.requestId,
            ok: true, code: 'EXTERNAL_CLIENT_CONTEXT_READ', executed: false,
            router: current.router, context: current.context, actions: current.actions,
            sourceIdentity: current.sourceIdentity,
            review: current.review, origin, reviewMode: reviewMode.mode,
            humanReviewSurface: reviewMode.humanReviewSurface,
            applyAuthority: false, genericCommand: false, durableServerProject: false, publicEndpoint: false };
          write(parseExternalClientContextResult(result, { requestId: parsed.value.requestId,
            sourceIdentity: ready.sourceIdentity, origin }));
        } catch (error) {
          write(externalClientError(error.code ?? error.message ?? 'EXTERNAL_CLIENT_CONTEXT_READ_FAILED',
            parsed.value.requestId));
        }
        return;
      }
      if (parsed.kind === 'discovery') {
        pageOperations += 1; pageOperationEpoch += 1;
        try {
          await guard.snapshot();
          const result = await guard.evaluate(
            (boundWindow, request) => boundWindow.__CAPABILITY_DISCOVERY__.request(request), parsed.value,
          );
          await guard.snapshot();
          write(result);
        } catch (error) {
          const failure = externalClientError(
            error.code ?? error.message ?? 'CAPABILITY_DISCOVERY_FAILED', parsed.value.requestId,
          );
          write(externalClientResult(failure, parsed.value, ready.sourceIdentity));
        } finally { pageOperations -= 1; }
        return;
      }
      let tracked = false;
      pageOperations += 1; pageOperationEpoch += 1;
      try {
        await guard.snapshot();
        tracked = Boolean(jobs.begin(parsed.value, ready.sourceIdentity));
        // Fixed adapter code forwards data only. The client cannot provide a function or script.
        const result = await guard.evaluate(
          (boundWindow, source) => boundWindow.__AGENT_ACTIONS__.execute(source), parsed.source,
        );
        await guard.snapshot();
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
      } finally { pageOperations -= 1; }
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
