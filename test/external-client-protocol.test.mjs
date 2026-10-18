// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedActionRequest } from '../src/bounded-action-contracts.mjs';
import {
  EXTERNAL_CLIENT_CANCEL_SCHEMA, EXTERNAL_CLIENT_ORIGIN,
  parseExternalClientLine, resolveExternalClientOrigin,
} from '../src/external-client-protocol.mjs';

const profile = 'board.atmega328p-16mhz-v1';
const now = 1_800_000_000_000;

test('production origin is fixed and only a test-only loopback override is accepted', () => {
  assert.equal(resolveExternalClientOrigin({}), EXTERNAL_CLIENT_ORIGIN);
  assert.throws(() => resolveExternalClientOrigin({ INTENT_MCU_ADAPTER_TEST_ORIGIN: 'https://evil.example' }), /PINNED/);
  assert.equal(resolveExternalClientOrigin({ NODE_ENV: 'test', INTENT_MCU_ADAPTER_TEST_ORIGIN: 'http://127.0.0.1:18766' }), 'http://127.0.0.1:18766');
  for (const value of ['http://localhost:18766', 'http://127.0.0.1:18766/path', 'https://127.0.0.1:18766']) {
    assert.throws(() => resolveExternalClientOrigin({ NODE_ENV: 'test', INTENT_MCU_ADAPTER_TEST_ORIGIN: value }), /INVALID/);
  }
});

test('transport accepts exactly the existing action request and bounded cancel envelope', () => {
  const source = boundedActionRequest('project.validate', profile, 3, {}, { now, ttlMs: 5_000, requestId: 'external-valid-request' });
  const action = parseExternalClientLine(source, now + 1);
  assert.equal(action.kind, 'action'); assert.equal(action.value.action, 'project.validate'); assert.equal(action.source, source);
  const cancel = parseExternalClientLine(JSON.stringify({ schema: EXTERNAL_CLIENT_CANCEL_SCHEMA,
    requestId: 'external-cancel-request', targetRequestId: 'external-valid-request' }), now);
  assert.equal(cancel.kind, 'cancel');
});

test('client cannot select origin, apply, shell, eval, generic command or unknown fields', () => {
  for (const action of ['patch.apply', 'shell.exec', 'javascript.eval', 'command']) {
    const value = JSON.parse(boundedActionRequest('project.validate', profile, 3, {}, { now, requestId: `external-${action.replace('.', '-')}-request` }));
    value.action = action;
    assert.throws(() => parseExternalClientLine(JSON.stringify(value), now + 1), /ACTION_UNSUPPORTED/);
  }
  const withOrigin = JSON.parse(boundedActionRequest('project.validate', profile, 3, {}, { now, requestId: 'external-origin-request' }));
  withOrigin.origin = 'https://evil.example';
  assert.throws(() => parseExternalClientLine(JSON.stringify(withOrigin), now + 1), /ACTION_REQUEST_SHAPE/);
});

test('strict transport retains TTL, profile, generation, replay ID and byte limits', () => {
  const expired = boundedActionRequest('result.read', profile, 3, {}, { now, ttlMs: 1, requestId: 'external-expired-request' });
  assert.throws(() => parseExternalClientLine(expired, now + 2), /ACTION_EXPIRED/);
  assert.throws(() => parseExternalClientLine('x'.repeat(49 * 1024), now), /LINE_LIMIT/);
});
