// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTROL_RUNTIME_EVIDENCE_SCHEMA, controlRuntimeEvidenceMatrix,
} from '../src/control-runtime-evidence.mjs';

test('runtime evidence matrix covers exactly fifty-three AVR models and sixty-six retained fields', () => {
  const matrix = controlRuntimeEvidenceMatrix();
  assert.equal(matrix.schema, CONTROL_RUNTIME_EVIDENCE_SCHEMA);
  assert.equal(matrix.models, 53);
  assert.equal(matrix.fields, 66);
  assert.equal(matrix.rows.length, 66);
  assert.equal(new Set(matrix.rows.map((row) => `${row.model}.${row.field}`)).size, 66);
  assert(matrix.rows.every((row) => row.workerEvent && row.observable && row.evidenceSource));
  assert.deepEqual(matrix.rows.filter((row) => !row.authored).map((row) => row.field), ['outputActive']);
  assert(matrix.excluded.includes('saved model state alone'));
});
