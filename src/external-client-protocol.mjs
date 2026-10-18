// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { BOUNDED_ACTION_REQUEST_LIMIT, parseBoundedActionRequest } from './bounded-action-contracts.mjs';
import { exactKeys, parseStrictJson } from './strict-json.mjs';
import {
  CAPABILITY_DISCOVERY_REQUEST_SCHEMA, parseCapabilityDiscoveryRequest,
} from './capability-discovery.mjs';

export const EXTERNAL_CLIENT_READY_SCHEMA = 'intent-mcu-external-client-ready@1';
export const EXTERNAL_CLIENT_CANCEL_SCHEMA = 'intent-mcu-external-client-cancel@1';
export const EXTERNAL_CLIENT_CONTROL_RESULT_SCHEMA = 'intent-mcu-external-client-control-result@1';
export const EXTERNAL_CLIENT_ERROR_SCHEMA = 'intent-mcu-external-client-error@1';
export const EXTERNAL_CLIENT_ORIGIN = 'https://lab.teachthecompany.com';

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$/u;

export function resolveExternalClientOrigin(environment = process.env) {
  const candidate = environment.INTENT_MCU_ADAPTER_TEST_ORIGIN;
  if (!candidate) return EXTERNAL_CLIENT_ORIGIN;
  if (environment.NODE_ENV !== 'test') throw new Error('EXTERNAL_CLIENT_ORIGIN_PINNED');
  const url = new URL(candidate);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('EXTERNAL_CLIENT_TEST_ORIGIN_INVALID');
  }
  return url.origin;
}

export function parseExternalClientLine(line, now = Date.now()) {
  if (typeof line !== 'string' || new TextEncoder().encode(line).byteLength > BOUNDED_ACTION_REQUEST_LIMIT) {
    throw Object.assign(new Error('EXTERNAL_CLIENT_LINE_LIMIT'), { code: 'EXTERNAL_CLIENT_LINE_LIMIT' });
  }
  const value = parseStrictJson(line, BOUNDED_ACTION_REQUEST_LIMIT);
  if (value?.schema === CAPABILITY_DISCOVERY_REQUEST_SCHEMA) {
    return Object.freeze({ kind: 'discovery', value: parseCapabilityDiscoveryRequest(value) });
  }
  if (value?.schema === EXTERNAL_CLIENT_CANCEL_SCHEMA) {
    if (!exactKeys(value, ['schema', 'requestId', 'targetRequestId'])
        || !REQUEST_ID.test(value.requestId) || !REQUEST_ID.test(value.targetRequestId)) {
      throw Object.assign(new Error('EXTERNAL_CLIENT_CANCEL_SHAPE'), { code: 'EXTERNAL_CLIENT_CANCEL_SHAPE' });
    }
    return Object.freeze({ kind: 'cancel', value: structuredClone(value) });
  }
  return Object.freeze({ kind: 'action', value: parseBoundedActionRequest(line, now), source: line });
}

export function externalClientError(code, requestId = null) {
  return Object.freeze({
    schema: EXTERNAL_CLIENT_ERROR_SCHEMA,
    ok: false,
    code,
    requestId: typeof requestId === 'string' && REQUEST_ID.test(requestId) ? requestId : null,
    executed: false,
  });
}
