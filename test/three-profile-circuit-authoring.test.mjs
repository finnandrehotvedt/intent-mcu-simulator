// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { Esp32C3CircuitEditor, normalizeEsp32C3CircuitDraft } from '../src/esp32c3-public-circuit.mjs';
import { Rp2040PicoCircuitEditor, normalizeRp2040PicoCircuitDraft } from '../src/rp2040-pico-circuit.mjs';
import { Stm32CircuitEditor, normalizeStm32CircuitDraft } from '../src/stm32-public-circuit.mjs';

const profiles = [
  { name: 'Pico', Editor: Rp2040PicoCircuitEditor, normalize: normalizeRp2040PicoCircuitDraft,
    source: { component: 'pico-1', pin: 'GP0' }, ground: { component: 'pico-1', pin: 'GND3' } },
  { name: 'C3', Editor: Esp32C3CircuitEditor, normalize: normalizeEsp32C3CircuitDraft,
    source: { component: 'c3-1', pin: 'GPIO2' }, ground: { component: 'c3-1', pin: 'GND' } },
  { name: 'STM32', Editor: Stm32CircuitEditor, normalize: normalizeStm32CircuitDraft,
    source: { component: 'stm32-1', pin: 'PB0' }, ground: { component: 'stm32-1', pin: 'GND' } },
];
const withoutIdCounters = (value) => {
  const copy = structuredClone(value); delete copy.layout.idCounters; return copy;
};

for (const profile of profiles) {
  test(`${profile.name} authors a non-template circuit from a controller-only project`, () => {
    const editor = new profile.Editor();
    assert.equal(editor.newProject().draft.components.length, 1);
    assert.equal(editor.snapshot().draft.nets.length, 0);

    assert.equal(editor.addComponent('resistor.fixed-v1').componentId, 'resistor-1');
    assert.equal(editor.addComponent('resistor.fixed-v1', { x: 0.64, y: 0.22 }).componentId, 'resistor-2');
    assert.equal(editor.addComponent('led.basic-v1').componentId, 'led-1');
    assert.equal(editor.addComponent('led.basic-v1', { x: 0.7, y: 0.72 }).componentId, 'led-2');
    assert.equal(editor.setComponentProperty('resistor-2', 'ohms', 470).ok, true);
    assert.equal(editor.moveComponent('led-2', 0.81, 0.67).ok, true);

    assert.equal(editor.connectEndpoints(profile.source, { component: 'resistor-1', pin: 'A' }).ok, true);
    assert.equal(editor.connectEndpoints({ component: 'resistor-1', pin: 'B' }, { component: 'led-1', pin: 'ANODE' }).ok, true);
    assert.equal(editor.connectEndpoints({ component: 'led-1', pin: 'CATHODE' }, profile.ground).ok, true);
    const authored = editor.snapshot().draft;
    assert.equal(authored.components.length, 5);
    assert.deepEqual(authored.components.map(({ id }) => id).sort(),
      ['led-1', 'led-2', 'resistor-1', 'resistor-2', profile.source.component].sort());
    assert.equal(authored.components.find(({ id }) => id === 'resistor-2').properties.ohms, 470);

    editor.select({ kind: 'net', id: 'net-series' });
    assert.equal(editor.deleteSelected().ok, true);
    assert.equal(editor.snapshot().draft.nets.some(({ id }) => id === 'net-series'), false);
    const disconnected = structuredClone(editor.snapshot().draft);
    assert.equal(editor.undo().ok, true);
    const connected = structuredClone(editor.snapshot().draft);
    assert.equal(editor.redo().ok, true);
    assert.deepEqual(editor.snapshot().draft, disconnected);
    assert.deepEqual(profile.normalize(JSON.parse(JSON.stringify(connected))), connected);

    const reopened = new profile.Editor(JSON.parse(JSON.stringify(connected)));
    assert.deepEqual(reopened.snapshot().draft, connected);
    assert.equal(reopened.snapshot().draft.layout.positions['led-2'].x, 0.81);
  });

  test(`${profile.name} canonical API batch adds multiple stable instances atomically`, () => {
    const editor = new profile.Editor();
    const before = structuredClone(editor.snapshot().draft);
    const result = editor.applyApiBatch([
      { command: 'component.add', id: 'resistor-2', type: 'resistor.fixed-v1', position: { x: 0.62, y: 0.7, rotation: 0 } },
      { command: 'component.add', id: 'led-2', type: 'led.basic-v1', position: { x: 0.8, y: 0.7, rotation: 0 } },
      { command: 'component.property.set', component_id: 'resistor-2', key: 'ohms', value: 470 },
    ], `rc139-${profile.name.toLowerCase()}-batch`);
    assert.equal(result.ok, true);
    assert.equal(result.draft.components.length, before.components.length + 2);
    assert.equal(editor.undoApi(`rc139-${profile.name.toLowerCase()}-batch`).ok, true);
    assert.deepEqual(withoutIdCounters(editor.snapshot().draft), withoutIdCounters(before));
    assert.equal(editor.snapshot().draft.layout.idCounters.resistor, 2);
    assert.equal(editor.snapshot().draft.layout.idCounters.led, 2);
    assert.equal(editor.redoApi(`rc139-${profile.name.toLowerCase()}-batch`).ok, true);
    assert.equal(editor.snapshot().draft.components.find(({ id }) => id === 'resistor-2').properties.ohms, 470);

    const accepted = JSON.stringify(editor.snapshot().draft);
    for (const operations of [
      [{ command: 'component.add', id: 'led-3', type: 'resistor.fixed-v1', position: { x: 0.4, y: 0.4, rotation: 0 } }],
      [{ command: 'wire.connect', net_id: 'net-unknown', from: { component: profile.source.component, pin: 'UNKNOWN' }, to: { component: 'resistor-2', pin: 'A' } }],
      [{ command: 'wire.connect', net_id: 'net-duplicate', from: profile.source, to: { component: 'resistor-1', pin: 'A' } }],
    ]) {
      const rejected = editor.applyApiBatch(operations, `negative-${Math.random()}`);
      assert.equal(rejected.ok, false);
      assert.equal(JSON.stringify(editor.snapshot().draft), accepted);
    }
  });

  test(`${profile.name} duplicates one disconnected part with stable IDs through UI and API owners`, () => {
    const editor = new profile.Editor();
    const first = editor.duplicateComponent('resistor-1', { x: 0.6, y: 0.6 });
    assert.equal(first.ok, true);
    assert.equal(first.componentId, 'resistor-2');
    assert.deepEqual(first.draft.components.find(({ id }) => id === 'resistor-2').properties,
      first.draft.components.find(({ id }) => id === 'resistor-1').properties);
    assert.deepEqual(first.draft.layout.positions['resistor-2'], { x: 0.6, y: 0.6, rotation: 0 });
    assert.equal(first.draft.nets.some((net) => net.endpoints.some(({ component }) => component === 'resistor-2')), false);

    editor.select({ kind: 'component', id: 'resistor-2' });
    assert.equal(editor.deleteSelected().ok, true);
    assert.equal(editor.addComponent('resistor.fixed-v1').componentId, 'resistor-3');
    assert.equal(editor.snapshot().draft.components.some(({ id }) => id === 'resistor-1'), true);
    assert.equal(editor.undo().ok, true);
    assert.equal(editor.snapshot().draft.components.some(({ id }) => id === 'resistor-3'), false);
    assert.equal(editor.snapshot().draft.layout.idCounters.resistor, 3);
    const reopenedIds = new profile.Editor(JSON.parse(JSON.stringify(editor.snapshot().draft)));
    assert.equal(reopenedIds.addComponent('resistor.fixed-v1').componentId, 'resistor-4');
    assert.equal(reopenedIds.newProject().ok, true);
    assert.equal(reopenedIds.addComponent('resistor.fixed-v1').componentId, 'resistor-1');
    for (let sequence = 2; sequence <= 16; sequence += 1) {
      const added = reopenedIds.addComponent('resistor.fixed-v1');
      assert.equal(added.componentId, `resistor-${sequence}`);
      reopenedIds.select({ kind: 'component', id: added.componentId });
      assert.equal(reopenedIds.deleteSelected().ok, true);
    }
    assert.match(reopenedIds.addComponent('resistor.fixed-v1').code, /COMPONENT_ID_LINEAGE_EXHAUSTED/u);

    const beforeApi = structuredClone(editor.snapshot().draft);
    const api = editor.applyApiBatch([{ command: 'component.duplicate', component_id: 'led-1', id: 'led-2',
      position: { x: 0.75, y: 0.75, rotation: 0 } }], `duplicate-${profile.name}`);
    assert.equal(api.ok, true);
    assert.equal(api.draft.components.some(({ id }) => id === 'led-2'), true);
    assert.equal(editor.undoApi(`duplicate-${profile.name}`).ok, true);
    assert.deepEqual(withoutIdCounters(editor.snapshot().draft), withoutIdCounters(beforeApi));
    assert.equal(editor.snapshot().draft.layout.idCounters.led, 2);
    assert.equal(editor.redoApi(`duplicate-${profile.name}`).ok, true);

    editor.select({ kind: 'net', id: 'net-ground' });
    assert.equal(editor.beginBranch().ok, true);
    const branched = editor.activateEndpoint({ component: 'led-2', pin: 'CATHODE' });
    assert.equal(branched.ok, true);
    assert.equal(branched.draft.nets.find(({ id }) => id === 'net-ground').endpoints.length, 3);
    assert.equal(branched.validation.ok, false);
    assert.equal(editor.deleteBranch('net-ground', { component: 'led-2', pin: 'CATHODE' }).ok, true);
    assert.equal(editor.snapshot().draft.nets.find(({ id }) => id === 'net-ground').endpoints.length, 2);

    const apiBranch = editor.applyApiBatch([{ command: 'wire.branch.connect', net_id: 'net-ground',
      endpoint: { component: 'led-2', pin: 'CATHODE' } }], `branch-${profile.name}`);
    assert.equal(apiBranch.ok, true);
    const apiDetach = editor.applyApiBatch([{ command: 'wire.disconnect', net_id: 'net-ground',
      endpoint: { component: 'led-2', pin: 'CATHODE' } }], `branch-delete-${profile.name}`);
    assert.equal(apiDetach.ok, true);
    assert.equal(apiDetach.draft.nets.find(({ id }) => id === 'net-ground').endpoints.length, 2);

    const accepted = JSON.stringify(editor.snapshot().draft);
    for (const operation of [
      { command: 'component.duplicate', component_id: profile.source.component, id: 'board-2',
        position: { x: 0.4, y: 0.4, rotation: 0 } },
      { command: 'component.duplicate', component_id: 'led-1', id: 'resistor-3',
        position: { x: 0.4, y: 0.4, rotation: 0 } },
      { command: 'component.duplicate', component_id: 'missing', id: 'led-3',
        position: { x: 0.4, y: 0.4, rotation: 0 } },
    ]) {
      assert.equal(editor.applyApiBatch([operation], `invalid-duplicate-${Math.random()}`).ok, false);
      assert.equal(JSON.stringify(editor.snapshot().draft), accepted);
    }
  });

  test(`${profile.name} persists mixed 3.3 V authoring-only parts and named-pin API wiring`, () => {
    const editor = new profile.Editor();
    assert.equal(editor.addComponent('ground.reference-3v3-v1').componentId, 'ground-1');
    assert.equal(editor.addComponent('button.momentary-3v3-v1').componentId, 'button-1');
    assert.equal(editor.addComponent('switch.toggle-3v3-v1').componentId, 'switch-1');
    const sourceNet = editor.snapshot().draft.nets.find((net) => net.endpoints.some((endpoint) =>
      endpoint.component === profile.source.component && endpoint.pin === profile.source.pin));
    assert.equal(editor.branchEndpoint(sourceNet.id, { component: 'button-1', pin: 'A' }).ok, true);
    assert.equal(editor.connectEndpoints({ component: 'button-1', pin: 'B' }, { component: 'ground-1', pin: 'GND' }).ok, true);
    const saved = JSON.parse(JSON.stringify(editor.snapshot().draft));
    assert.deepEqual(profile.normalize(saved), saved);
    assert.equal(editor.snapshot().validation.ok, false);

    const api = editor.applyApiBatch([
      { command: 'component.add', id: 'button-2', type: 'button.momentary-3v3-v1', position: { x: 0.7, y: 0.7, rotation: 0 } },
      { command: 'wire.branch.connect', net_id: saved.nets.find((net) => net.endpoints.some(({ component }) => component === 'ground-1')).id,
        endpoint: { component: 'button-2', pin: 'B' } },
    ], `mixed-${profile.name}`);
    assert.equal(api.ok, true);
    assert.equal(editor.undoApi(`mixed-${profile.name}`).ok, true);
    assert.deepEqual(withoutIdCounters(editor.snapshot().draft), withoutIdCounters(saved));
    assert.equal(editor.snapshot().draft.layout.idCounters.button, 2);
  });
}
