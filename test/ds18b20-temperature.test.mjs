// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DS18B20_DEFINITION,
  DS18B20_MODEL,
  DS18B20_RENDERER,
  DS18B20_RUNTIME_ADAPTER,
  DS18B20_TEMPERATURE_MAX_C,
  DS18B20_TEMPERATURE_MIN_C,
  DS18B20_TEMPERATURE_STEP_C,
  DS18B20_TYPE,
  createDs18b20Component,
  ds18b20Crc8,
  ds18b20Scratchpad,
  validateDs18b20Component,
} from '../expansion-drafts/ds18b20-temperature-v1.mjs';
import { createDs18b20Artwork } from '../expansion-drafts/ds18b20-temperature-artwork-v1.mjs';
import { createAvrReferenceStarter } from '../src/avr-reference-starters.mjs';
import {
  CANDIDATE_UI_COMPONENTS,
  candidateContactControl,
  createCandidateUiComponent,
  openCandidateUiSession,
} from '../src/candidate-existing-ui-adapter.mjs';
import { componentSupportCell } from '../src/component-support-matrix.mjs';
import {
  CURRENT_MODEL_LIBRARY_LOCK,
  PRE_CMP091_DS18B20_CURRENT_MODEL_LIBRARY_LOCK,
  modelLibraryExecutionIdentity,
  modelLibraryMigrationPreview,
  resolveModelLibrary,
} from '../src/model-library.mjs';
import { CURRENT_MODEL_LIBRARY_IMPLEMENTATION } from '../src/model-library-current-resolver.mjs';
import { CURRENT_MODEL_LIBRARY_MANIFEST } from '../src/model-library-snapshots.mjs';

class Node {
  constructor(name) { this.name = name; this.attributes = {}; this.children = []; this.textContent = ''; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  append(...children) { this.children.push(...children); }
}

test('CMP-091 owns one exact DS18B20 definition, scratchpad and original probe artwork', () => {
  assert.equal(Object.isFrozen(DS18B20_DEFINITION), true);
  assert.equal(DS18B20_DEFINITION.type, DS18B20_TYPE);
  assert.equal(DS18B20_DEFINITION.modelRef, DS18B20_MODEL);
  assert.equal(DS18B20_DEFINITION.artwork.renderer, DS18B20_RENDERER);
  assert.equal(CANDIDATE_UI_COMPONENTS[DS18B20_TYPE], DS18B20_DEFINITION);
  assert.deepEqual(DS18B20_DEFINITION.pins.map(({ id }) => id), ['VCC', 'DQ', 'GND']);
  assert.deepEqual(DS18B20_DEFINITION.controlKeys, ['temperatureC']);
  assert.deepEqual([
    DS18B20_TEMPERATURE_MIN_C, DS18B20_TEMPERATURE_MAX_C, DS18B20_TEMPERATURE_STEP_C,
  ], [-55, 125, 0.0625]);

  const component = createDs18b20Component('ds18b20-1', 'Tank probe');
  assert.equal(validateDs18b20Component(component), true);
  assert.deepEqual(createCandidateUiComponent(DS18B20_TYPE, 'ds18b20-1'),
    createDs18b20Component('ds18b20-1'));
  const scratchpad = ds18b20Scratchpad(31.25);
  assert.deepEqual(scratchpad.slice(0, 2), [0xf4, 0x01]);
  assert.equal(ds18b20Crc8(scratchpad.slice(0, 8)), scratchpad[8]);
  assert.deepEqual(ds18b20Scratchpad(-10.125).slice(0, 2), [0x5e, 0xff]);
  assert.throws(() => ds18b20Scratchpad(31.2), /DS18B20_TEMPERATURE/u);

  const documentObject = { createElementNS: (_namespace, name) => new Node(name) };
  const svg = createDs18b20Artwork(documentObject, DS18B20_DEFINITION, component);
  assert.equal(svg.attributes['data-artwork-key'], DS18B20_RENDERER);
  assert.equal(svg.attributes['data-temperature-c'], '23.5');
  assert.deepEqual(svg.children.filter((item) => item.attributes['data-terminal-pin'])
    .map((item) => item.attributes['data-terminal-pin']), ['VCC', 'DQ', 'GND']);
});

test('DS18B20 starter is exact, runnable and projected to one AVR D3 OneWire device', () => {
  const starter = createAvrReferenceStarter('avr-ds18b20-temperature');
  const fixture = readFileSync(new URL('./fixtures/ds18b20_read/ds18b20_read.ino', import.meta.url), 'utf8');
  assert.equal(starter.project.project.source.files[0].content, fixture);
  const opened = openCandidateUiSession(starter.text);
  assert.equal(opened.ok, true, opened.code);
  assert.deepEqual(opened.session.runnable, { ok: true, code: 'OK', details: [] });
  const component = opened.session.visualProject.circuit.components.find(
    ({ id }) => id === 'ds18b20-1');
  assert.deepEqual(component.controls, { temperatureC: 23.5 });
  const support = opened.session.runtimeSupport.find(({ componentId }) => componentId === 'ds18b20-1');
  assert.equal(support.status, 'projected-simulated');
  assert.equal(support.runtimeAdapter, DS18B20_RUNTIME_ADAPTER);
  assert.deepEqual(support.runtimeProjection, {
    componentId: 'ds18b20-1', type: DS18B20_TYPE, boardPin: 'D3', boardPinNumber: 3,
    temperatureC: 23.5, scratchpad: ds18b20Scratchpad(23.5),
    runtimeAdapter: DS18B20_RUNTIME_ADAPTER,
  });
});

test('DS18B20 temperature is validated and exact across Save/Open', () => {
  const session = openCandidateUiSession(
    createAvrReferenceStarter('avr-ds18b20-temperature').text).session;
  const prepared = candidateContactControl(session, 'ds18b20-1', 'temperatureC', 31.25);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  assert.deepEqual(prepared.worker,
    { command: 'ds18b20-control', componentId: 'ds18b20-1', key: 'temperatureC', value: 31.25 });
  assert.equal(session.apply({ ...prepared.command, revision: session.revision }).ok, true);
  assert.equal(candidateContactControl(session, 'ds18b20-1', 'temperatureC', 31.2).ok, false);
  assert.equal(candidateContactControl(session, 'ds18b20-1', 'temperatureC', 126).ok, false);
  const saved = session.saveText();
  const reopened = openCandidateUiSession(saved);
  assert.equal(reopened.ok, true, reopened.code);
  assert.equal(reopened.session.saveText(), saved);
  const component = reopened.session.visualProject.circuit.components.find(
    ({ id }) => id === 'ds18b20-1');
  assert.deepEqual(component.controls, { temperatureC: 31.25 });
  assert.deepEqual(reopened.session.runtimeSupport.find(
    ({ componentId }) => componentId === 'ds18b20-1').runtimeProjection.scratchpad,
  ds18b20Scratchpad(31.25));
});

test('current model and support matrix claim DS18B20 only for executable AVR', () => {
  assert.deepEqual(CURRENT_MODEL_LIBRARY_IMPLEMENTATION.evaluateProduction(DS18B20_TYPE, {
    temperatureC: 31.25,
  }), { ok: true, code: 'OK', result: {
    temperatureC: 31.25, scratchpad: ds18b20Scratchpad(31.25),
  } });
  assert.equal(CURRENT_MODEL_LIBRARY_IMPLEMENTATION.evaluateProduction(DS18B20_TYPE, {
    temperatureC: 31.2,
  }).code, 'MODEL_LIBRARY_PRODUCTION_INPUT');
  const profiles = [
    'board.atmega328p-16mhz-v1', 'board.rp2040-pico-v1',
    'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1',
  ];
  assert.deepEqual(profiles.map((profile) => componentSupportCell(profile, DS18B20_TYPE)?.available),
    [true, false, false, false]);
  assert.equal(componentSupportCell(profiles[0], DS18B20_TYPE).status, 'simulated');
  assert.match(componentSupportCell(profiles[1], DS18B20_TYPE).limitations.join(' '), /does not yet admit/u);
  assert.equal(CURRENT_MODEL_LIBRARY_MANIFEST.entries.filter(
    ({ componentType }) => componentType === DS18B20_TYPE).length, 1);
});

test('the exact public rc143 model lock migrates by adding only DS18B20', () => {
  assert.equal(PRE_CMP091_DS18B20_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256,
    'bccc4e6e72663981af1434c30ad50c37c901abd5a8f9bc634af96ba1e746c951');
  assert.equal(resolveModelLibrary(PRE_CMP091_DS18B20_CURRENT_MODEL_LIBRARY_LOCK).role,
    'pre-cmp091-ds18b20-current-migration');
  assert.equal(modelLibraryExecutionIdentity(
    PRE_CMP091_DS18B20_CURRENT_MODEL_LIBRARY_LOCK).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const preview = modelLibraryMigrationPreview(
    PRE_CMP091_DS18B20_CURRENT_MODEL_LIBRARY_LOCK, CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.semanticChanges.map(({ profile, componentType, kind }) => ({
    profile, componentType, kind,
  })), [{
    profile: 'board.atmega328p-16mhz-v1', componentType: DS18B20_TYPE, kind: 'added',
  }]);
  assert.deepEqual(preview.rendererChanges, []);
  assert.equal(preview.unchanged.length, 72);
});
