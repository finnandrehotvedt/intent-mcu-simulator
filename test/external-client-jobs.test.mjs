// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { createExternalClientJobLedger } from '../src/external-client-jobs.mjs';

const identity = Object.freeze({ product: 'Intent MCU Simulator', version: 'test', generated: false });
const request = Object.freeze({ requestId: 'x12-ledger-request', action: 'project.validate',
  profile: 'board.atmega328p-16mhz-v1', expectedGeneration: 7,
  issuedAtMs: 1_000, expiresAtMs: 2_000 });

test('X12 exports bounded data-only evidence then deletes job payload at exact expiry', () => {
  let now = 1_000; const timers = [];
  const ledger = createExternalClientJobLedger({ now: () => now,
    schedule: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    unschedule: () => {} });
  ledger.begin(request, identity);
  ledger.complete(request.requestId, { schema: 'intent-mcu-external-client-result@1',
    category: 'success', request: { requestId: request.requestId } });
  assert.equal(ledger.begin(request, identity), null, 'replay must not replace retained evidence');
  const exported = ledger.inspect(request.requestId, 'export');
  assert.equal(exported.code, 'JOB_EVIDENCE_EXPORTED');
  assert.equal(exported.evidence.dataOnly, true);
  assert.equal(exported.evidence.restoresRuntimeAuthority, false);
  assert.equal(exported.evidence.restoresVerdictAuthority, false);
  assert.equal(exported.evidence.artifactCacheRetainedSeparately, false);
  assert.equal(timers[0].delay, 1_000);
  now = 2_000; ledger.prune();
  assert.equal(ledger.hasPayload(request.requestId), false);
  assert.equal(ledger.inspect(request.requestId, 'read').code, 'JOB_EXPIRED');
});

test('X12 cancellation remains distinct and active evidence cannot export early', () => {
  const ledger = createExternalClientJobLedger({ now: () => 1_100,
    schedule: () => 1, unschedule: () => {} });
  ledger.begin(request, identity);
  assert.equal(ledger.inspect(request.requestId, 'export').code, 'JOB_EVIDENCE_NOT_READY');
  assert.equal(ledger.cancellationRequested(request.requestId), true);
  ledger.complete(request.requestId, { schema: 'intent-mcu-external-client-result@1', category: 'cancelled' });
  const read = ledger.inspect(request.requestId, 'read');
  assert.equal(read.job.state, 'cancelled');
  assert.equal(read.job.durableServerProject, false);
});

test('X12 real short timer removes its requester-scoped payload with no shared artifact cache', async () => {
  const start = Date.now();
  const ledger = createExternalClientJobLedger();
  ledger.begin({ ...request, issuedAtMs: start, expiresAtMs: start + 30 }, identity);
  ledger.complete(request.requestId, { schema: 'intent-mcu-external-client-result@1', category: 'success' });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(ledger.hasPayload(request.requestId), false);
  assert.equal(ledger.inspect(request.requestId, 'read').code, 'JOB_EXPIRED');
});
