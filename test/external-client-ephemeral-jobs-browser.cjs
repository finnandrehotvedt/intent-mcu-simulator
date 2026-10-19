// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const base = process.env.EXTERNAL_CLIENT_TEST_URL || 'http://127.0.0.1:18766';
const profile = 'board.atmega328p-16mhz-v1';

(async () => {
  const target = new URL(base); const env = { ...process.env };
  if (target.protocol === 'http:' && target.hostname === '127.0.0.1') {
    env.NODE_ENV = 'test'; env.INTENT_MCU_ADAPTER_TEST_ORIGIN = target.origin;
  } else { delete env.NODE_ENV; delete env.INTENT_MCU_ADAPTER_TEST_ORIGIN; }
  const child = spawn(process.execPath, ['tools/external-client-adapter.mjs'], {
    cwd: process.cwd(), env, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = ''; let buffer = ''; let readyResolve;
  const readyPromise = new Promise((resolve) => { readyResolve = resolve; });
  const pending = new Map();
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let boundary;
    while ((boundary = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 1);
      if (!line) continue;
      const value = JSON.parse(line);
      if (value.schema === 'intent-mcu-external-client-ready@1') { readyResolve(value); continue; }
      const requestId = value.requestId ?? value.request?.requestId;
      const resolve = pending.get(requestId);
      if (!resolve) throw new Error(`unmatched adapter response: ${line}`);
      pending.delete(requestId); resolve(value);
    }
  });
  const send = (value) => new Promise((resolve) => {
    pending.set(value.requestId, resolve); child.stdin.write(`${JSON.stringify(value)}\n`);
  });
  try {
    const ready = await readyPromise;
    assert.equal(ready.jobRequestSchema, 'intent-mcu-external-client-job-request@1');
    assert.equal(ready.actions.length, 7); assert.equal(ready.applyAuthority, false);
    let generation = ready.context.generation;
    const action = (actionName, payload, requestId, ttlMs = 30_000) => {
      const now = Date.now();
      return send({ schema: ready.requestSchema, action: actionName, requestId, profile,
        expectedGeneration: generation, issuedAtMs: now, expiresAtMs: now + ttlMs, payload });
    };
    const job = (operation, targetRequestId, requestId) => send({
      schema: ready.jobRequestSchema, requestId, targetRequestId, operation,
    });

    let response = await action('project.create', {
      starterId: 'avr-thermostat-boundary-v1', firmwareVariant: 'correct',
    }, 'x12-create-request');
    assert.equal(response.category, 'success'); generation = response.generation.after;
    response = await action('firmware.build', {}, 'x12-build-request');
    assert.equal(response.category, 'success');

    const runPromise = action('runtime.run', { experimentId: 'avr-thermostat-boundary-v1' },
      'x12-cancelled-run-request');
    await new Promise((resolve) => setTimeout(resolve, 50));
    const cancelled = await send({ schema: 'intent-mcu-external-client-cancel@1',
      requestId: 'x12-cancel-control', targetRequestId: 'x12-cancelled-run-request' });
    assert.equal(cancelled.code, 'ACTION_CANCEL_REQUESTED');
    const cancelledResult = await runPromise;
    assert.equal(cancelledResult.category, 'cancelled');
    const cancelledEvidence = await job('export', 'x12-cancelled-run-request', 'x12-cancel-export');
    assert.equal(cancelledEvidence.evidence.result.category, 'cancelled');
    await new Promise((resolve) => setTimeout(resolve, 250));
    const cancelledRead = await job('read', 'x12-cancelled-run-request', 'x12-cancel-read');
    assert.equal(cancelledRead.job.state, 'cancelled');

    const current = await action('result.read', {}, 'x12-current-result');
    assert.equal(current.category, 'success'); assert.equal(current.testVerdict, null);
    const rebuilt = await action('firmware.build', {}, 'x12-rebuild-request');
    assert.equal(rebuilt.category, 'success');
    const rerun = await action('runtime.run', { experimentId: 'avr-thermostat-boundary-v1' },
      'x12-fresh-run-request');
    assert.equal(rerun.category, 'success', JSON.stringify(rerun));
    assert.equal(rerun.testVerdict.status, 'passed');

    const shortId = 'x12-short-validate-request';
    const short = await action('project.validate', {}, shortId, 1_000);
    assert.equal(short.category, 'success');
    const exported = await job('export', shortId, 'x12-short-export');
    assert.equal(exported.code, 'JOB_EVIDENCE_EXPORTED');
    assert.equal(exported.evidence.request.requestId, shortId);
    assert.equal(exported.evidence.request.profile, profile);
    assert.deepEqual(exported.evidence.sourceIdentity, ready.sourceIdentity);
    assert.equal(exported.evidence.dataOnly, true);
    assert.equal(exported.evidence.restoresRuntimeAuthority, false);
    assert.equal(exported.evidence.restoresVerdictAuthority, false);
    assert.equal(exported.evidence.artifactCacheRetainedSeparately, false);
    const { parseExternalClientLine } = await import('../src/external-client-protocol.mjs');
    assert.throws(() => parseExternalClientLine(JSON.stringify(exported.evidence)), /ACTION_REQUEST_SHAPE/u);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const expired = await job('read', shortId, 'x12-expired-read');
    assert.equal(expired.code, 'JOB_EXPIRED');
    assert.equal(expired.evidence, undefined);

    process.stdout.write(`${JSON.stringify({ status: 'pass', transport: ready.transport,
      actions: ready.actions.length, cancelledRequest: cancelledResult.request.requestId,
      cancelledCategory: cancelledResult.category, lateSuccess: false,
      rerunVerdict: rerun.testVerdict.status, exportedJob: shortId,
      exportedDataOnly: exported.evidence.dataOnly, expiredCode: expired.code,
      fixtureClock: false, controlledShortTtlMs: 1_000,
      artifactCacheRetainedSeparately: false, durableServerProject: false })}\n`);
  } finally {
    child.stdin.end();
    await new Promise((resolve) => child.once('exit', resolve));
    if (child.exitCode !== 0) throw new Error(`adapter exit ${child.exitCode}: ${stderr}`);
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
