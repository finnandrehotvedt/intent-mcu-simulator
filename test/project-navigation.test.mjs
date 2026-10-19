// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
import assert from 'node:assert/strict';
import test from 'node:test';
import { createProjectNavigationView, searchProjectNavigation } from '../src/project-navigation.mjs';

const connections = Object.freeze({ schema: 'intent-mcu-accessible-connection-view@1',
  profile: 'board.atmega328p-16mhz-v1', semanticIdentity: 'graph-1', validation: { ok: true, code: 'OK', diagnostics: [] },
  components: [{ id: 'board-1', label: 'Controller', type: 'controller.v1', typeLabel: 'Controller' }],
  pins: [{ key: 'board-1.D13', id: 'D13', label: 'Digital 13', componentId: 'board-1',
    componentLabel: 'Controller', accessibleLabel: 'Controller — Digital 13 (board-1.D13), connected to net-led' }],
  nets: [{ id: 'net-led', accessibleLabel: 'net-led: Controller — Digital 13',
    endpoints: [{ key: 'board-1.D13', label: 'Controller — Digital 13' }] }] });
const make = (overrides = {}) => createProjectNavigationView({ profile: 'board.atmega328p-16mhz-v1',
  generation: 2, revision: 7, connections,
  sources: [{ name: 'main.ino', content: 'void setup() {}\n' }, { name: 'helpers.h', content: '#define LED_PIN 13\n' }],
  criteria: [{ id: 'REQ-LED', text: 'LED lights', testRefs: ['TEST-LED'] }],
  scenarios: [{ id: 'SCENARIO-EQUAL', name: 'At threshold', events: [{ id: 'EVENT-SETPOINT' }] }], ...overrides });

test('projects every approved owner with deterministic exact-first search', () => {
  const view = make();
  assert.deepEqual([...new Set(view.entries.map((entry) => entry.kind))], ['component', 'pin', 'net', 'file', 'source', 'test']);
  assert.equal(searchProjectNavigation(view, 'D１３').results[0].id, 'board-1.D13');
  assert.equal(searchProjectNavigation(view, 'helpers.h').results[0].kind, 'file');
  assert.equal(searchProjectNavigation(view, 'LED_PIN').results[0].id, 'helpers.h:1');
  assert.equal(searchProjectNavigation(view, 'TEST-LED').results[0].kind, 'test');
  assert.equal(searchProjectNavigation(view, 'At threshold').results[0].kind, 'test');
  assert.equal(searchProjectNavigation(view, 'EVENT-SETPOINT').results[0].target.eventId, 'EVENT-SETPOINT');
});

test('caps rendered results while retaining total and rejects malformed authority', () => {
  const sources = [{ name: 'main.ino', content: Array.from({ length: 110 }, (_, index) => `MATCH ${index}`).join('\n') }];
  const result = searchProjectNavigation(make({ sources }), 'MATCH');
  assert.equal(result.results.length, 100); assert.equal(result.total, 110); assert.equal(result.truncated, true);
  assert.throws(() => make({ sources: Array.from({ length: 9 }, (_, i) => ({ name: `f${i}.h`, content: '' })) }), /PROJECT_NAVIGATION_INPUT_INVALID/u);
  assert.throws(() => make({ criteria: [{ id: 'REQ', text: 'x', testRefs: Array(9).fill('TEST') }] }), /PROJECT_NAVIGATION_TEST_INVALID/u);
});

test('indexes zero-ref criteria, shared test IDs by owner, and full accepted long lines', () => {
  const long = `NEEDLE${'x'.repeat(5000)}`;
  const view = make({ sources: [{ name: 'main.ino', content: long }], criteria: [
    { id: 'REQ-A', text: 'No linked test yet', testRefs: [] },
    { id: 'REQ-B', text: 'First owner', testRefs: ['TEST-SHARED'] },
    { id: 'REQ-C', text: 'Second owner', testRefs: ['TEST-SHARED'] },
  ] });
  assert.equal(searchProjectNavigation(view, 'No linked').results[0].target.requirementId, 'REQ-A');
  assert.equal(searchProjectNavigation(view, 'TEST-SHARED').total, 2);
  assert.equal(searchProjectNavigation(view, 'NEEDLE').results[0].target.line, 1);
});

test('rejects unchecked, profile-mismatched and per-profile source violations', () => {
  assert.throws(() => make({ connections: { ...connections, validation: { code: 'UNCHECKED' } } }), /PROJECT_NAVIGATION_INPUT_INVALID/u);
  assert.throws(() => make({ connections: { ...connections, profile: 'board.rp2040-pico-v1' } }), /PROJECT_NAVIGATION_INPUT_INVALID/u);
  assert.throws(() => make({ generation: -1 }), /PROJECT_NAVIGATION_INPUT_INVALID/u);
  assert.throws(() => createProjectNavigationView({ profile: 'board.rp2040-pico-v1', generation: 1, revision: 1,
    sources: [{ name: 'wrong.c', content: '' }], criteria: [], scenarios: [],
    connections: { ...connections, profile: 'board.rp2040-pico-v1' } }), /PROJECT_NAVIGATION_SOURCE_LIMIT/u);
});

test('view is immutable and contains no runtime, artifact or serialization authority', () => {
  const view = make();
  assert(Object.isFrozen(view)); assert(Object.isFrozen(view.entries));
  const text = JSON.stringify(view);
  assert(!text.includes('artifact')); assert(!text.includes('runtime')); assert(!text.includes('verdict'));
});
