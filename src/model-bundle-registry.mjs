// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  PRE_X48_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION,
  PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION,
  PRE_X55_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION,
  PRE_X47_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION,
  PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION,
  PRE_X47_UI_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION,
  PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION,
  PRIOR_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION,
} from './model-library-current-resolver.mjs';
import { RETAINED_MODEL_LIBRARY_IMPLEMENTATION } from './model-library-retained-resolver.mjs';

// The production bundle registry is deliberately finite. Lock data is never
// interpreted as a path, URL or package name. The caller must first match a
// complete allowlisted lock, then selects one of these finite static imports.
export function productionModelBundle(role) {
  if (role === 'retained') return RETAINED_MODEL_LIBRARY_IMPLEMENTATION;
  if (role === 'pre-x48-current-migration') {
    return PRE_X48_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION;
  }
  if (role === 'pre-x55-control-label-current-migration') {
    return PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION;
  }
  if (role === 'pre-x55-current-migration') return PRE_X55_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION;
  if (role === 'prior-current-migration') return PRIOR_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION;
  if (role === 'pre-x47-current-migration') return PRE_X47_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION;
  if (role === 'pre-x47-validation-current-migration') {
    return PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION;
  }
  if (role === 'pre-x47-ui-current-migration') {
    return PRE_X47_UI_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION;
  }
  if (role === 'pre-x47-async-current-migration') {
    return PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION;
  }
  if (role === 'current') return CURRENT_MODEL_LIBRARY_IMPLEMENTATION;
  throw new TypeError('MODEL_LIBRARY_REGISTRY_SELECTION');
}
