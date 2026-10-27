// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPONENT_CATALOG,
  catalogEntries,
  validateComponentCatalog,
} from '../src/component-catalog.mjs';
import {
  FOUNDATION_DRAFT_SCHEMA,
  FOUNDATION_PRIMITIVE_DRAFTS,
  canonicalFoundationPrimitiveDraftJson,
  validateFoundationPrimitiveDraft,
  validateFoundationPrimitiveDraftSet,
} from '../expansion-drafts/foundation-primitives-v3.mjs';

const clone = (value) => structuredClone(value);

test('four foundation primitives are complete non-selectable unsupported contracts', () => {
  assert.equal(validateFoundationPrimitiveDraftSet(), true);
  assert.deepEqual(FOUNDATION_PRIMITIVE_DRAFTS.map((item) => item.type), [
    'capacitor.nonpolarized-v1',
    'diode.rectifier-v1',
    'reference.power-5v-v1',
    'reference.ground-v1',
  ]);
  for (const definition of FOUNDATION_PRIMITIVE_DRAFTS) {
    assert.equal(definition.schema, FOUNDATION_DRAFT_SCHEMA);
    assert.equal(definition.selectable, false);
    assert.equal(definition.runtimeStatus, 'unsupported');
    assert.equal(definition.activation, 'contract-only');
    assert.equal(definition.electrical.runPolicy, 'block-when-connected');
    assert.equal(Object.isFrozen(definition), true);
    assert.equal(Object.isFrozen(definition.pins), true);
    assert.equal(definition.acceptanceFixtures.some((item) => item.expected === 'ACCEPT'), true);
    assert.equal(definition.acceptanceFixtures.some((item) => item.expected !== 'ACCEPT'), true);
  }
});

test('pin identities, units, defaults and allowed ranges remain exact', () => {
  const byType = Object.fromEntries(FOUNDATION_PRIMITIVE_DRAFTS.map((item) => [item.type, item]));
  assert.deepEqual(byType['capacitor.nonpolarized-v1'].pins.map((item) => item.id), ['A', 'B']);
  assert.deepEqual(byType['diode.rectifier-v1'].pins.map((item) => item.id), ['ANODE', 'CATHODE']);
  assert.deepEqual(byType['reference.power-5v-v1'].pins.map((item) => item.id), ['OUT']);
  assert.deepEqual(byType['reference.ground-v1'].pins.map((item) => item.id), ['REF']);
  assert.deepEqual(byType['capacitor.nonpolarized-v1'].properties[0], {
    key: 'capacitanceFarads', kind: 'number', unit: 'F', default: 100e-9,
    minimum: 1e-12, maximum: 1, editable: true,
  });
  assert.equal(byType['diode.rectifier-v1'].properties[0].default, 0.7);
  assert.equal(byType['diode.rectifier-v1'].properties[1].maximum, 1_000);
  assert.equal(byType['reference.power-5v-v1'].properties[0].minimum, 5);
  assert.equal(byType['reference.power-5v-v1'].properties[0].maximum, 5);
  assert.equal(byType['reference.ground-v1'].properties[0].default, 0);
});

test('every invalid-state fixture resolves to a declared blocking diagnostic', () => {
  for (const definition of FOUNDATION_PRIMITIVE_DRAFTS) {
    const declared = new Set(definition.diagnostics.map((item) => item.code));
    for (const fixture of definition.acceptanceFixtures.filter((item) => item.expected !== 'ACCEPT')) {
      assert.equal(declared.has(fixture.expected), true, `${definition.type}/${fixture.id}`);
    }
    assert.equal(definition.diagnostics.every((item) => item.severity === 'block'), true);
  }
});

test('draft validator rejects activation, malformed pins, ranges and undeclared fixture outcomes', () => {
  const base = FOUNDATION_PRIMITIVE_DRAFTS[0];
  for (const mutate of [
    (item) => { item.selectable = true; },
    (item) => { item.runtimeStatus = 'simulated'; },
    (item) => { item.activation = 'active'; },
    (item) => { item.pins[1].id = item.pins[0].id; },
    (item) => { item.pins[0].anchor.x = 2; },
    (item) => { item.properties[0].default = item.properties[0].maximum + 1; },
    (item) => { item.properties[0].editable = false; },
    (item) => { item.diagnostics[0].severity = 'warning'; },
    (item) => { item.acceptanceFixtures[0].expected = 'UNDECLARED_DIAGNOSTIC'; },
    (item) => { item.untrusted = true; },
  ]) {
    const invalid = clone(base); mutate(invalid);
    assert.equal(validateFoundationPrimitiveDraft(invalid), false);
  }
});

test('canonical draft bytes are deterministic and contain no third-party product marks', () => {
  const first = canonicalFoundationPrimitiveDraftJson();
  const second = canonicalFoundationPrimitiveDraftJson(clone(FOUNDATION_PRIMITIVE_DRAFTS));
  assert.equal(first, second);
  assert.deepEqual(JSON.parse(first).map((item) => item.type), [...FOUNDATION_PRIMITIVE_DRAFTS]
    .map((item) => item.type).sort());
  assert.doesNotMatch(first, /Arduino|Fritzing|Tinkercad|Wokwi/iu);
});

test('drafts cannot alter the active component catalogue or selectable count', () => {
  assert.equal(validateComponentCatalog(COMPONENT_CATALOG), true);
  assert.equal(catalogEntries({ selectableOnly: true }).length, 6);
  for (const definition of FOUNDATION_PRIMITIVE_DRAFTS) {
    assert.equal(Object.hasOwn(COMPONENT_CATALOG, definition.type), false);
  }
});
