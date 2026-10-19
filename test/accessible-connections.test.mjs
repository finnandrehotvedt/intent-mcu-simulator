// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCESSIBLE_CONNECTION_VIEW_SCHEMA,
  createAccessibleConnectionView,
} from '../src/accessible-connections.mjs';

const catalogue = Object.freeze({
  board: Object.freeze({ displayName: 'Learning controller', pins: Object.freeze([
    Object.freeze({ id: 'GND', label: 'Ground' }), Object.freeze({ id: 'D1', label: 'Digital 1' }),
  ]) }),
  led: Object.freeze({ displayName: 'Indicator', pins: Object.freeze([
    Object.freeze({ id: 'CATHODE', label: 'Cathode' }), Object.freeze({ id: 'ANODE', label: 'Anode' }),
  ]) }),
});

function input(overrides = {}) {
  return {
    profile: 'board.test-v1', revision: 4,
    components: [
      { id: 'led-1', type: 'led', label: 'Status LED' },
      { id: 'board-1', type: 'board', label: 'Controller' },
    ],
    nets: [
      { id: 'net-signal', endpoints: [{ component: 'led-1', pin: 'ANODE' }, { component: 'board-1', pin: 'D1' }] },
      { id: 'net-ground', endpoints: [{ component: 'board-1', pin: 'GND' }, { component: 'led-1', pin: 'CATHODE' }] },
    ],
    junctions: [], catalogue,
    wireColors: { 'net-signal': '#f04f5f', 'net-ground': '#303943' },
    limits: { components: 4, nets: 4, endpoints: 8 },
    validation: { checked: true, ok: true, code: 'OK', diagnostics: [] },
    ...overrides,
  };
}

test('projects every component, named pin, net and endpoint in stable ID order', () => {
  const view = createAccessibleConnectionView(input());
  assert.equal(view.schema, ACCESSIBLE_CONNECTION_VIEW_SCHEMA);
  assert.deepEqual(view.components.map(({ id }) => id), ['board-1', 'led-1']);
  assert.deepEqual(view.pins.map(({ key }) => key), [
    'board-1.D1', 'board-1.GND', 'led-1.ANODE', 'led-1.CATHODE',
  ]);
  assert.deepEqual(view.nets.map(({ id }) => id), ['net-ground', 'net-signal']);
  assert.equal(view.summary.endpoints, 4);
  assert.match(view.nets[1].accessibleLabel, /Controller — Digital 1 \(board-1\.D1\)/u);
  assert.equal(Object.isFrozen(view.components[0].pins), true);
});

test('semantic identity ignores cable colour and all layout coordinates', () => {
  const first = createAccessibleConnectionView(input());
  const recolored = createAccessibleConnectionView(input({
    wireColors: { 'net-signal': '#a8ff3f', 'net-ground': '#5f8cff' },
  }));
  assert.equal(first.semanticIdentity, recolored.semanticIdentity);
  assert.notEqual(first.nets[0].color, recolored.nets[0].color);
});

test('empty validated draft produces a readable empty projection', () => {
  const view = createAccessibleConnectionView(input({ components: [], nets: [], junctions: [], catalogue: {}, wireColors: {} }));
  assert.deepEqual(view.summary, { components: 0, pins: 0, nets: 0, endpoints: 0 });
  assert.deepEqual(view.components, []); assert.deepEqual(view.nets, []);
});

test('electrically invalid but schema-checked draft retains validator-owned diagnostics', () => {
  const view = createAccessibleConnectionView(input({
    validation: { checked: true, ok: false, code: 'SERIES_PATH_OPEN', diagnostics: ['Connect the cathode to ground.'] },
  }));
  assert.equal(view.validation.ok, false);
  assert.deepEqual(view.validation.diagnostics, ['Connect the cathode to ground.']);
});

test('rejects malformed, unvalidated, duplicate, unknown and over-limit graphs', () => {
  assert.throws(() => createAccessibleConnectionView(input({
    validation: { checked: false, ok: true, code: 'OK', diagnostics: [] },
  })), { code: 'ACCESSIBLE_CONNECTION_VALIDATION_INVALID' });
  assert.throws(() => createAccessibleConnectionView(input({
    nets: [{ id: 'net-bad', endpoints: [{ component: 'board-1', pin: 'NOPE' }, { component: 'led-1', pin: 'ANODE' }] }],
  })), { code: 'ACCESSIBLE_CONNECTION_ENDPOINT_UNKNOWN' });
  assert.throws(() => createAccessibleConnectionView(input({
    nets: [
      { id: 'net-a', endpoints: [{ component: 'board-1', pin: 'D1' }, { component: 'led-1', pin: 'ANODE' }] },
      { id: 'net-b', endpoints: [{ component: 'board-1', pin: 'D1' }, { component: 'led-1', pin: 'CATHODE' }] },
    ],
  })), { code: 'ACCESSIBLE_CONNECTION_ENDPOINT_DUPLICATE' });
  assert.throws(() => createAccessibleConnectionView(input({ limits: { components: 1, nets: 4, endpoints: 8 } })),
    { code: 'ACCESSIBLE_CONNECTION_LIMIT_EXCEEDED' });
  assert.throws(() => createAccessibleConnectionView({ ...input(), extra: true }),
    { code: 'ACCESSIBLE_CONNECTION_INPUT_INVALID' });
});
