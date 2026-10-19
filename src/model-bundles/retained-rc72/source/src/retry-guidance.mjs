// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const RETRY_AFTER_MAX_SECONDS = 300;

const CONSERVATIVE_RETRY_SECONDS = Object.freeze({
  ORIGIN_RATE_LIMIT: 60,
  JOB_CAPACITY: 5,
  BUILD_QUEUE_FULL: 3,
  SESSION_LIMIT: 5,
  BUILD_CONCURRENCY_LIMIT: 2,
  RUNTIME_CONCURRENCY_LIMIT: 2,
  RATE_LIMIT: 60,
});

export const RETRYABLE_CAPACITY_CODES = Object.freeze(Object.keys(CONSERVATIVE_RETRY_SECONDS));
const retryableCodeSet = new Set(RETRYABLE_CAPACITY_CODES);

export function isRetryableCapacityCode(code) {
  return retryableCodeSet.has(code);
}

export function boundedRetryAfterSeconds(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= RETRY_AFTER_MAX_SECONDS
    ? value : null;
}

export function retryAfterForCode(code, authoritativeSeconds = null) {
  if (!Object.hasOwn(CONSERVATIVE_RETRY_SECONDS, code)) return null;
  return boundedRetryAfterSeconds(authoritativeSeconds)
    ?? CONSERVATIVE_RETRY_SECONDS[code];
}

export function retryFields(code, authoritativeSeconds = null) {
  const retryAfterSeconds = retryAfterForCode(code, authoritativeSeconds);
  return retryAfterSeconds === null ? {} : {
    retryAfterSeconds,
    retryAdvisory: true,
    retryReservesCapacity: false,
    requiresNewRequestId: true,
  };
}

export function retryHeaders(code, authoritativeSeconds = null) {
  const retryAfterSeconds = retryAfterForCode(code, authoritativeSeconds);
  return retryAfterSeconds === null ? {} : { 'Retry-After': String(retryAfterSeconds) };
}

export function retryGuidanceFromResponse(headerValue, body = {}) {
  if (typeof headerValue !== 'string' || !/^[1-9][0-9]{0,2}$/u.test(headerValue)) return null;
  const headerSeconds = boundedRetryAfterSeconds(Number(headerValue));
  const bodySeconds = boundedRetryAfterSeconds(body?.retryAfterSeconds);
  if (headerSeconds === null || bodySeconds !== headerSeconds
      || body?.retryAdvisory !== true || body?.retryReservesCapacity !== false
      || body?.requiresNewRequestId !== true) return null;
  return Object.freeze({ afterSeconds: headerSeconds, afterMs: headerSeconds * 1000,
    advisory: true, reservesCapacity: false, requiresNewRequestId: true });
}

export function retryMessage(code, guidance) {
  return guidance
    ? `${code}. Try again in ${guidance.afterSeconds} seconds with a new request. Capacity is not reserved.`
    : `${code}. Try again later with a new request; capacity is not reserved.`;
}

export function retryResultFields(value) {
  const seconds = boundedRetryAfterSeconds(value?.retryAfterSeconds);
  if (seconds === null || value?.retryAdvisory !== true
      || value?.retryReservesCapacity !== false || value?.requiresNewRequestId !== true) return {};
  return { retryAfterSeconds: seconds, retryAdvisory: true,
    retryReservesCapacity: false, requiresNewRequestId: true };
}
