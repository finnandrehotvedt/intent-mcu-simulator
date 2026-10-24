// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { failureLedgerRecord, requestLedgerRecord, responseLedgerRecord } = require('./final-ux-runtime-route-ledger.cjs');

test('connect timeout preserves the exact attempted POST ledger without credentials', () => {
  const body = Buffer.from('{"schema":"teach-lab-build-request@1"}');
  const request = requestLedgerRecord({ method: 'POST', path: '/api/build',
    headers: { 'x-teach-lab-build': '1' }, body });
  const error = Object.assign(new TypeError('fetch failed'), { cause: {
    code: 'UND_ERR_CONNECT_TIMEOUT', address: 'lab.example:443', port: 443,
  } });
  const failure = failureLedgerRecord(error, { method: 'POST', path: '/api/build', stage: 'upstream-fetch' });
  assert.equal(request.mutationHeader, true); assert.equal(request.bodyBytes, body.length);
  assert.match(request.bodySha256, /^[a-f0-9]{64}$/u); assert.equal(request.bearerCapability, false);
  assert.equal(failure.cause.code, 'UND_ERR_CONNECT_TIMEOUT');
});

test('capability rejection preserves POST and bearer poll request/response ordering', () => {
  const requests = [
    requestLedgerRecord({ method: 'POST', path: '/api/build', headers: { 'x-teach-lab-build': '1' }, body: Buffer.from('{}') }),
    requestLedgerRecord({ method: 'GET', path: '/api/build/abc', headers: { authorization: 'Bearer opaque-capability' } }),
  ];
  const responses = [
    responseLedgerRecord({ path: '/api/build', status: 202, body: '{"jobId":"abc"}' }),
    responseLedgerRecord({ path: '/api/build/abc', status: 404, body: '{"code":"JOB_NOT_FOUND"}' }),
  ];
  assert.deepEqual(requests.map((value) => value.bearerCapability), [false, true]);
  assert.deepEqual(responses.map((value) => value.status), [202, 404]);
});

test('poll transport failure retains the bearer request and structured failure', () => {
  const request = requestLedgerRecord({ method: 'GET', path: '/api/build/abc',
    headers: { authorization: 'Bearer opaque-capability' } });
  const failure = failureLedgerRecord(new Error('socket closed'), {
    method: 'GET', path: '/api/build/abc', stage: 'upstream-fetch',
  });
  assert.equal(request.bearerCapability, true); assert.equal(failure.method, 'GET');
  assert.equal(failure.message, 'socket closed');
});
