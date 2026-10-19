// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { CURRENT_MODEL_LIBRARY_IMPLEMENTATION } from './model-library-current-resolver.mjs';
import { RETAINED_MODEL_LIBRARY_IMPLEMENTATION } from './model-library-retained-resolver.mjs';

// The production bundle registry is deliberately finite. Lock data is never
// interpreted as a path, URL or package name. The caller must first match a
// complete allowlisted lock, then selects one of these two static imports.
export function productionModelBundle(retained) {
  if (retained === true) return RETAINED_MODEL_LIBRARY_IMPLEMENTATION;
  if (retained === false) return CURRENT_MODEL_LIBRARY_IMPLEMENTATION;
  throw new TypeError('MODEL_LIBRARY_REGISTRY_SELECTION');
}
