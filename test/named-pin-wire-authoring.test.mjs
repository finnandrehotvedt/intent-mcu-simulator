// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { Esp32C3CircuitEditor } from '../src/esp32c3-public-circuit.mjs';
import { Rp2040PicoCircuitEditor } from '../src/rp2040-pico-circuit.mjs';
import { Stm32CircuitEditor } from '../src/stm32-public-circuit.mjs';

const profiles = [
  {
    name: 'RP2040 Pico', Editor: Rp2040PicoCircuitEditor, prefix: 'RP2040',
    sourceNet: 'net-gpio0', board: { component: 'pico-1', pin: 'GP0' },
    sourceLead: { component: 'resistor-1', pin: 'B' }, otherLead: { component: 'resistor-1', pin: 'A' },
    ground: { component: 'pico-1', pin: 'GND3' },
  },
  {
    name: 'ESP32-C3', Editor: Esp32C3CircuitEditor, prefix: 'C3',
    sourceNet: 'net-gpio2', board: { component: 'c3-1', pin: 'GPIO2' },
    sourceLead: { component: 'resistor-1', pin: 'A' }, otherLead: { component: 'resistor-1', pin: 'B' },
    ground: { component: 'c3-1', pin: 'GND' },
  },
  {
    name: 'STM32F429ZI', Editor: Stm32CircuitEditor, prefix: 'STM32',
    sourceNet: 'net-pb0', board: { component: 'stm32-1', pin: 'PB0' },
    sourceLead: { component: 'resistor-1', pin: 'A' }, otherLead: { component: 'resistor-1', pin: 'B' },
    ground: { component: 'stm32-1', pin: 'GND' },
  },
];

const ledAnode = { component: 'led-1', pin: 'ANODE' };
const ledCathode = { component: 'led-1', pin: 'CATHODE' };

function deleteNet(editor, id) {
  editor.select({ kind: 'net', id });
  const result = editor.deleteSelected();
  assert.equal(result.ok, true);
}

for (const profile of profiles) {
  test(`${profile.name} creates all three stable nets from named endpoints`, () => {
    const editor = new profile.Editor();
    for (const id of [profile.sourceNet, 'net-series', 'net-ground']) deleteNet(editor, id);
    assert.equal(editor.snapshot().draft.nets.length, 0);
    const initialRevision = editor.revision;

    const pending = editor.activateEndpoint(profile.board);
    assert.equal(pending.ok, true); assert.equal(pending.changed, false);
    assert.equal(pending.wireDraft.mode, 'connect-target'); assert.equal(editor.revision, initialRevision);
    const self = editor.activateEndpoint(profile.board);
    assert.equal(self.ok, false); assert.equal(self.code, `${profile.prefix}_SELF_CONNECTION`);
    assert.equal(editor.snapshot().wireDraft.mode, 'connect-target'); assert.equal(editor.revision, initialRevision);
    assert.equal(editor.cancelWireDraft().wireDraft.mode, 'none');

    editor.activateEndpoint(profile.board);
    let result = editor.activateEndpoint(profile.sourceLead);
    assert.equal(result.ok, true); assert.equal(result.changed, true); assert.equal(result.netId, profile.sourceNet);
    assert.equal(result.selection.id, profile.sourceNet);

    editor.activateEndpoint(profile.otherLead);
    result = editor.activateEndpoint(ledAnode);
    assert.equal(result.netId, 'net-series'); assert.equal(result.validation.ok, false);

    editor.activateEndpoint(ledCathode);
    result = editor.activateEndpoint(profile.ground);
    assert.equal(result.netId, 'net-ground'); assert.equal(result.validation.ok, true);
    assert.deepEqual(result.draft.nets.map((net) => net.id), [profile.sourceNet, 'net-ground', 'net-series'].sort());

    const occupied = editor.activateEndpoint(profile.board);
    assert.equal(occupied.ok, false); assert.equal(occupied.code, `${profile.prefix}_ENDPOINT_OCCUPIED`);
    const beforeInvalid = editor.snapshot();
    const unknown = editor.connectEndpoints({ ...profile.board, pin: 'UNKNOWN' }, ledAnode);
    assert.equal(unknown.ok, false); assert.equal(unknown.code, `${profile.prefix}_ENDPOINT_INVALID`);
    assert.deepEqual(editor.snapshot().draft, beforeInvalid.draft); assert.equal(editor.revision, beforeInvalid.revision);

    const undo = editor.undo(); assert.equal(undo.ok, true); assert.equal(undo.validation.ok, false);
    const redo = editor.redo(); assert.equal(redo.ok, true); assert.equal(redo.validation.ok, true);
    const reopened = new profile.Editor(JSON.parse(JSON.stringify(redo.draft)));
    assert.equal(reopened.snapshot().validation.ok, true);
    assert.deepEqual(reopened.snapshot().draft.nets, redo.draft.nets);
  });

  test(`${profile.name} reconnects one selected cable endpoint and preserves history`, () => {
    const editor = new profile.Editor();
    deleteNet(editor, 'net-series');
    const revision = editor.revision;
    let result = editor.beginReconnect(profile.sourceNet);
    assert.equal(result.ok, true); assert.equal(result.wireDraft.mode, 'reconnect-source');
    assert.equal(editor.revision, revision);

    result = editor.activateEndpoint(ledAnode);
    assert.equal(result.ok, false); assert.equal(result.code, `${profile.prefix}_RECONNECT_SOURCE_INVALID`);
    assert.equal(editor.snapshot().wireDraft.mode, 'reconnect-source');

    result = editor.activateEndpoint(profile.sourceLead);
    assert.equal(result.ok, true); assert.equal(result.wireDraft.mode, 'reconnect-target');
    const occupied = editor.activateEndpoint(profile.ground);
    assert.equal(occupied.ok, false); assert.equal(occupied.code, `${profile.prefix}_ENDPOINT_OCCUPIED`);
    assert.equal(editor.snapshot().wireDraft.mode, 'reconnect-target');

    result = editor.activateEndpoint(profile.otherLead);
    assert.equal(result.ok, true); assert.equal(result.changed, true);
    assert.equal(result.code, `${profile.prefix}_ENDPOINT_RECONNECTED`);
    assert.equal(result.netId, profile.sourceNet); assert.equal(result.validation.ok, false);
    const source = result.draft.nets.find((net) => net.id === profile.sourceNet);
    assert(source.endpoints.some((endpoint) => endpoint.component === profile.otherLead.component
      && endpoint.pin === profile.otherLead.pin));

    editor.activateEndpoint(profile.sourceLead);
    result = editor.activateEndpoint(ledAnode);
    assert.equal(result.ok, true); assert.equal(result.netId, 'net-series'); assert.equal(result.validation.ok, true);
    assert.equal(editor.undo().validation.ok, false);
    assert.equal(editor.undo().draft.nets.find((net) => net.id === profile.sourceNet)
      .endpoints.some((endpoint) => endpoint.pin === profile.sourceLead.pin), true);
    assert.equal(editor.redo().draft.nets.find((net) => net.id === profile.sourceNet)
      .endpoints.some((endpoint) => endpoint.pin === profile.otherLead.pin), true);
    assert.equal(editor.redo().validation.ok, true);
  });

  test(`${profile.name} rejects unsupported and duplicate endpoint operations atomically`, () => {
    const editor = new profile.Editor();
    deleteNet(editor, profile.sourceNet);
    deleteNet(editor, 'net-ground');
    const before = editor.snapshot();
    let result = editor.connectEndpoints(profile.board, ledCathode);
    assert.equal(result.ok, false); assert.equal(result.code, `${profile.prefix}_CONNECTION_UNSUPPORTED`);
    assert.deepEqual(editor.snapshot().draft, before.draft); assert.equal(editor.revision, before.revision);
    result = editor.connectEndpoints(profile.board, profile.board);
    assert.equal(result.ok, false); assert.equal(result.code, `${profile.prefix}_SELF_CONNECTION`);
    result = editor.connectEndpoints(profile.board, profile.otherLead);
    assert.equal(result.ok, false); assert.equal(result.code, `${profile.prefix}_ENDPOINT_OCCUPIED`);
    assert.deepEqual(editor.snapshot().draft, before.draft); assert.equal(editor.revision, before.revision);
  });
}
