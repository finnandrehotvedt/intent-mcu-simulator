// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';

import { API03_PROFILE_MATRIX, prepareApiBatch } from '../src/browser-session-edit.mjs';

const project = { profile: 'board.rp2040-pico-v1', circuit: {} };
const position = { x: 0.4, y: 0.5, rotation: 0 };

test('canonical profile matrix publishes duplicate, branch and endpoint disconnect on all profiles', () => {
  for (const profile of Object.values(API03_PROFILE_MATRIX)) {
    assert.deepEqual(profile.batchOperations.slice(-3),
      ['wire.connect', 'wire.branch.connect', 'wire.disconnect']);
    assert(profile.batchOperations.includes('component.duplicate'));
  }
});

test('canonical parser maps duplicate, branch and endpoint disconnect to reducer commands', () => {
  assert.deepEqual(prepareApiBatch(project, [
    { command: 'component.duplicate', component_id: 'led-1', id: 'led-2', position },
    { command: 'wire.branch.connect', net_id: 'net-ground', endpoint: { component: 'led-2', pin: 'CATHODE' } },
    { command: 'wire.disconnect', net_id: 'net-ground', endpoint: { component: 'led-2', pin: 'CATHODE' } },
  ]).map(({ type }) => type), ['component.duplicate', 'wire.branch', 'wire.branch.delete']);
});

test('canonical parser rejects unknown fields and incomplete branch/disconnect shapes', () => {
  for (const operation of [
    { command: 'component.duplicate', component_id: 'led-1', id: 'led-2', position, extra: true },
    { command: 'wire.branch.connect', net_id: 'net-ground' },
    { command: 'wire.disconnect', net_id: 'net-ground', endpoint: { component: 'led-2' } },
  ]) assert.throws(() => prepareApiBatch(project, [operation]), /^Error: API_/u);
});
