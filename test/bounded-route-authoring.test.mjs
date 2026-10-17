// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Rp2040PicoCircuitEditor, createRp2040PicoCircuitDraft, normalizeRp2040PicoCircuitDraft,
} from '../src/rp2040-pico-circuit.mjs';
import {
  Esp32C3CircuitEditor, createEsp32C3CircuitDraft, normalizeEsp32C3CircuitDraft,
} from '../src/esp32c3-public-circuit.mjs';
import {
  Stm32CircuitEditor, createStm32CircuitDraft, normalizeStm32CircuitDraft,
} from '../src/stm32-public-circuit.mjs';

const clone = (value) => structuredClone(value);
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;

const profiles = [
  { name: 'Pico', create: createRp2040PicoCircuitDraft, normalize: normalizeRp2040PicoCircuitDraft,
    Editor: Rp2040PicoCircuitEditor, sourceNet: 'net-gpio0' },
  { name: 'C3', create: createEsp32C3CircuitDraft, normalize: normalizeEsp32C3CircuitDraft,
    Editor: Esp32C3CircuitEditor, sourceNet: 'net-gpio2' },
  { name: 'STM32', create: createStm32CircuitDraft, normalize: normalizeStm32CircuitDraft,
    Editor: Stm32CircuitEditor, sourceNet: 'net-pb0' },
];

function family(net) {
  const [left, right] = net.endpoints;
  return {
    schema: 'intent-mcu-route@1',
    branches: [
      { endpoint: clone(left), points: [{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.5 }] },
      { endpoint: clone(right), points: [{ x: 0.8, y: 0.8 }, { x: 0.5, y: 0.8 }, { x: 0.5, y: 0.5 }] },
    ],
  };
}

test('old bounded circuit files migrate deterministically to empty route storage', () => {
  for (const profile of profiles) {
    const prior = profile.create();
    delete prior.layout.wireRoutes;
    const normalized = profile.normalize(prior);
    assert.deepEqual(normalized.layout.wireRoutes, {}, profile.name);
    assert.deepEqual(profile.normalize(normalized), normalized, profile.name);
  }
});

test('route and colour edits preserve electrical identity and use one exact undo transaction', () => {
  for (const profile of profiles) {
    const editor = new profile.Editor();
    const before = editor.snapshot().draft;
    const net = before.nets.find((candidate) => candidate.id === 'net-series');
    const route = editor.setWireRoute(net.id, family(net));
    assert.equal(route.ok, true, profile.name);
    assert.equal(route.changeKind, 'layout', profile.name);
    const beforeNoop = editor.snapshot();
    const noop = editor.setWireRoute(net.id, family(net));
    assert.equal(noop.changed, false, profile.name);
    assert.deepEqual(editor.snapshot(), beforeNoop, profile.name);
    const coloured = editor.setWireColor(net.id, '#5f8cff');
    assert.equal(coloured.ok, true, profile.name);
    assert.equal(coloured.changeKind, 'layout', profile.name);
    const after = editor.snapshot().draft;
    assert.deepEqual(after.components, before.components, profile.name);
    assert.deepEqual(after.nets, before.nets, profile.name);
    assert.equal(after.layout.wireStyles[net.id], '#5f8cff', profile.name);
    assert.equal(after.layout.wireRoutes[net.id].schema, 'intent-mcu-route@1', profile.name);
    assert.equal(editor.undo().changeKind, 'layout', profile.name);
    assert.notEqual(editor.snapshot().draft.layout.wireStyles[net.id], '#5f8cff', profile.name);
    assert.equal(editor.redo().changeKind, 'layout', profile.name);
    assert.equal(editor.snapshot().draft.layout.wireStyles[net.id], '#5f8cff', profile.name);
  }
});

test('diagonal malformed duplicate and unsupported layout edits reject atomically', () => {
  for (const profile of profiles) {
    const editor = new profile.Editor();
    const before = editor.snapshot();
    const net = before.draft.nets.find((candidate) => candidate.id === 'net-series');
    const diagonal = family(net);
    diagonal.branches[0].points = [{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.5 }];
    assert.equal(editor.setWireRoute(net.id, diagonal).ok, false, profile.name);
    assert.equal(editor.setWireColor(net.id, '#ffffff').ok, false, profile.name);
    assert.equal(editor.setWireRoute('unknown-net', family(net)).ok, false, profile.name);
    assert.deepEqual(editor.snapshot(), before, profile.name);
    const duplicated = family(net);
    duplicated.branches[1].endpoint = clone(duplicated.branches[0].endpoint);
    assert.equal(editor.setWireRoute(net.id, duplicated).ok, false, profile.name);
    assert.deepEqual(editor.snapshot(), before, profile.name);
  }
});

test('endpoint reconnect retires stored route while preserving stable net identity', () => {
  for (const profile of profiles) {
    const editor = new profile.Editor();
    const draft = editor.snapshot().draft;
    const sourceNet = draft.nets.find((candidate) => candidate.id === profile.sourceNet);
    editor.select({ kind: 'net', id: 'net-series' });
    assert.equal(editor.deleteSelected().ok, true, profile.name);
    assert.equal(editor.setWireRoute(sourceNet.id, family(sourceNet)).ok, true, profile.name);
    const resistorEndpoint = sourceNet.endpoints.find((endpoint) => endpoint.component === 'resistor-1');
    const otherLead = resistorEndpoint.pin === 'A' ? 'B' : 'A';
    editor.select({ kind: 'net', id: sourceNet.id });
    const reconnected = editor.reconnectEndpoint(sourceNet.id, resistorEndpoint,
      { component: 'resistor-1', pin: otherLead });
    assert.equal(reconnected.ok, true, profile.name);
    assert.equal(reconnected.draft.nets.find((net) => net.id === sourceNet.id).id, sourceNet.id, profile.name);
    assert.equal(Object.hasOwn(reconnected.draft.layout.wireRoutes, sourceNet.id), false, profile.name);
    assert(reconnected.draft.nets.find((net) => net.id === sourceNet.id).endpoints
      .some((endpoint) => endpointKey(endpoint) === `resistor-1.${otherLead}`), profile.name);
    assert.equal(editor.undo().ok, true, profile.name);
    const restored = editor.snapshot().draft;
    assert.equal(restored.layout.wireRoutes[sourceNet.id].schema, 'intent-mcu-route@1', profile.name);
    assert(restored.nets.find((net) => net.id === sourceNet.id).endpoints
      .some((endpoint) => endpointKey(endpoint) === endpointKey(resistorEndpoint)), profile.name);
    assert.equal(editor.redo().ok, true, profile.name);
    assert.equal(Object.hasOwn(editor.snapshot().draft.layout.wireRoutes, sourceNet.id), false, profile.name);
  }
});
