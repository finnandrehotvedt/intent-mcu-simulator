// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { THERMOSTAT_EXPERIMENT_SOURCE } from '../src/thermostat-experiment.mjs';
import {
  X34_FIXTURE_LIMITS, X34_INSTRUMENTED_SOURCE, X34_PROBE_BYTES,
  X34_PROBE_SYMBOL, instrumentX34ThermostatSource,
} from '../src/x34-precision-fixture.mjs';

test('X34 source transform is exact, private and semantically one-way', () => {
  assert.equal(instrumentX34ThermostatSource(), X34_INSTRUMENTED_SOURCE);
  assert.notEqual(X34_INSTRUMENTED_SOURCE, THERMOSTAT_EXPERIMENT_SOURCE);
  assert.equal(THERMOSTAT_EXPERIMENT_SOURCE.includes(X34_PROBE_SYMBOL), false);
  assert.match(X34_INSTRUMENTED_SOURCE, /static_assert\(sizeof\(IntentX34ProbeV1\) == 4/u);
  assert.match(X34_INSTRUMENTED_SOURCE, /temperatureC = temperatureC/u);
  assert.match(X34_INSTRUMENTED_SOURCE, /d13Level = heating \? 1 : 0/u);
  assert.equal(X34_PROBE_BYTES, 4);
  assert.equal(X34_FIXTURE_LIMITS.maximumCompletedTransactions, 16);
  assert.equal(X34_FIXTURE_LIMITS.commitWrapAccepted, false);
  assert.equal(X34_FIXTURE_LIMITS.publicStarterChanged, false);
  assert.equal(X34_FIXTURE_LIMITS.genericMemoryApi, false);
});

test('X34 transform rejects any source drift', () => {
  assert.throws(() => instrumentX34ThermostatSource(`${THERMOSTAT_EXPERIMENT_SOURCE}\n`), {
    code: 'X34_BASE_SOURCE_MISMATCH',
  });
  assert.throws(() => instrumentX34ThermostatSource(''), { code: 'X34_BASE_SOURCE_MISMATCH' });
});
