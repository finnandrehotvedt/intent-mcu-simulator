// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { X49_OFFSET_LIMITS } from './x49-sensor-offset.mjs';

export const X49_PUBLIC_AUTHORING_SCHEMA = 'intent-mcu-x49-public-authoring@1';
export const X49_PUBLIC_REFERENCE_C = 30;
export const X49_PUBLIC_NATIVE_OFFSET = 1;

const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };

export function calculateX49PublicPreview(offsetC) {
  if (!Number.isSafeInteger(offsetC)
      || offsetC < X49_OFFSET_LIMITS.minimum || offsetC > X49_OFFSET_LIMITS.maximum) {
    reject('X49_PUBLIC_OFFSET_INVALID');
  }
  const effectiveTemperatureC = X49_PUBLIC_REFERENCE_C + offsetC;
  const modelVoltage = (effectiveTemperatureC + 50) / 40;
  const adcCount = Math.round((modelVoltage / 5) * 1023);
  const firmwareIntegerC = Math.trunc((adcCount * 200) / 1024) - 50;
  return Object.freeze({
    schema: X49_PUBLIC_AUTHORING_SCHEMA,
    referenceTemperatureC: X49_PUBLIC_REFERENCE_C,
    offsetC,
    effectiveTemperatureC,
    calculated: Object.freeze({
      modelVoltage,
      adcCount,
      firmwareIntegerC,
      d13Level: firmwareIntegerC < X49_PUBLIC_REFERENCE_C,
    }),
    nativeEligible: offsetC === X49_PUBLIC_NATIVE_OFFSET,
    persistence: 'none',
  });
}

export function createX49PublicAuthoringOwner(initialOffsetC = X49_PUBLIC_NATIVE_OFFSET) {
  let preview = calculateX49PublicPreview(initialOffsetC);
  let revision = 1;
  return Object.freeze({
    select(offsetC) {
      preview = calculateX49PublicPreview(offsetC);
      revision += 1;
      return this.snapshot();
    },
    snapshot() {
      return clone({ ...preview, revision });
    },
  });
}
