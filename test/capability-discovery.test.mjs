// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPABILITY_DISCOVERY_REQUEST_SCHEMA, CAPABILITY_DISCOVERY_SCHEMA,
  PRODUCT_VERSION, capabilityDiscoveryResult, capabilityDiscoverySnapshot,
} from '../src/capability-discovery.mjs';
import { BOUNDED_ACTIONS } from '../src/bounded-action-contracts.mjs';
import { COMPONENT_SUPPORT_CELLS } from '../src/component-support-matrix.mjs';
import { CONTROLLER_CAPABILITIES } from '../src/controller-capabilities.mjs';
import { CANDIDATE_COMPILER_TARGETS } from '../src/compile-targets.mjs';
import { publicControllerViews } from '../src/public-controller-workbench-view.mjs';

const request = (acceptSchema = CAPABILITY_DISCOVERY_SCHEMA) => ({
  schema: CAPABILITY_DISCOVERY_REQUEST_SCHEMA,
  requestId: 'discovery-unit-request',
  acceptSchema,
});

test('discovery exposes all four canonical profile, UI, pin, API, part and toolchain authorities', () => {
  const discovered = capabilityDiscoverySnapshot();
  assert.equal(discovered.schema, CAPABILITY_DISCOVERY_SCHEMA);
  assert.equal(discovered.identity.version, PRODUCT_VERSION);
  assert.match(discovered.identity.source, /^https:\/\/github\.com\//u);
  assert.equal(discovered.profiles.length, 4);
  assert.deepEqual(discovered.profiles.map(({ id }) => id).sort(), Object.keys(CANDIDATE_COMPILER_TARGETS).sort());
  assert.deepEqual(discovered.profiles.map(({ uiAuthority }) => uiAuthority.status), publicControllerViews().map(({ status }) => status));
  for (const profile of discovered.profiles) {
    assert(profile.board.pins.length >= 2, `${profile.id} named pins missing`);
    assert.deepEqual(profile.apis, CONTROLLER_CAPABILITIES.profiles[profile.id].peripherals);
    assert.deepEqual(profile.parts, COMPONENT_SUPPORT_CELLS.filter((cell) => cell.profile === profile.id));
    assert.match(profile.compiler.toolchainIdentitySha256, /^[a-f0-9]{64}$/u);
  }
  assert.equal(discovered.profiles.find(({ id }) => id === 'board.rp2040-pico-v1').apis.adc.status, 'unavailable');
  assert.equal(discovered.actions.count, 7);
  assert.deepEqual(discovered.actions.names, BOUNDED_ACTIONS);
  assert.equal(discovered.actions.applyAuthority, false);
  assert.equal(discovered.transport.publicEndpoint, false);
  assert(new TextEncoder().encode(JSON.stringify(discovered)).byteLength <= discovered.transport.maximumResponseBytes);
});

test('discovery is read-only and rejects unsupported versions and invented request fields', () => {
  const result = capabilityDiscoveryResult(request());
  assert.equal(result.ok, true);
  assert.equal(result.executed, false);
  assert.equal(result.discovery.transport.readOnlyDiscovery, true);
  assert.throws(() => capabilityDiscoveryResult(request('intent-mcu-capability-discovery@99')), /VERSION_UNSUPPORTED/);
  assert.throws(() => capabilityDiscoveryResult({ ...request(), profile: 'invented' }), /REQUEST_SHAPE/);
});
