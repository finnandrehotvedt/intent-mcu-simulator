// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const AVR_RUNTIME_READY_TIMEOUT_MS = 15_000;
export const AVR_RUNTIME_READY_GRACE_MS = 1_000;
export const AVR_RUNTIME_WATCHDOG_TIMEOUT_MS = 2_000;
export const AVR_RUNTIME_WATCHDOG_GRACE_MS = 1_000;

function positiveFinite(value, code) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(code);
  return value;
}

export function createRuntimeSilenceGuard({ timeoutMs, graceMs }) {
  const timeout = positiveFinite(timeoutMs, 'RUNTIME_SILENCE_TIMEOUT');
  const grace = positiveFinite(graceMs, 'RUNTIME_SILENCE_GRACE');
  let graceStartedAt = null;
  let graceObservedAt = null;

  const reset = () => {
    graceStartedAt = null;
    graceObservedAt = null;
  };

  return Object.freeze({
    reset,
    assess({ active, now, lastObservedAt }) {
      if (typeof active !== 'boolean' || !Number.isFinite(now)
          || !Number.isFinite(lastObservedAt) || now < lastObservedAt) {
        throw new TypeError('RUNTIME_SILENCE_SAMPLE');
      }
      if (!active) {
        reset();
        return { expired: false, phase: 'inactive', retryAfterMs: null };
      }
      const silenceMs = now - lastObservedAt;
      if (silenceMs <= timeout) {
        reset();
        return {
          expired: false,
          phase: 'monitoring',
          retryAfterMs: Math.max(1, timeout - silenceMs),
        };
      }
      if (graceStartedAt === null || graceObservedAt !== lastObservedAt) {
        graceStartedAt = now;
        graceObservedAt = lastObservedAt;
        return { expired: false, phase: 'grace', retryAfterMs: grace };
      }
      const graceElapsedMs = now - graceStartedAt;
      if (graceElapsedMs < grace) {
        return {
          expired: false,
          phase: 'grace',
          retryAfterMs: Math.max(1, grace - graceElapsedMs),
        };
      }
      return { expired: true, phase: 'expired', retryAfterMs: null };
    },
  });
}
