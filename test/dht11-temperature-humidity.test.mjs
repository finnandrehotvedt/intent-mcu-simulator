// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DHT11_DEFINITION,
  DHT11_HUMIDITY_MAX_PERCENT,
  DHT11_HUMIDITY_MIN_PERCENT,
  DHT11_MODEL,
  DHT11_RENDERER,
  DHT11_RUNTIME_ADAPTER,
  DHT11_TEMPERATURE_MAX_C,
  DHT11_TEMPERATURE_MIN_C,
  DHT11_TYPE,
  createDht11Component,
  dht11Payload,
  validateDht11Component,
} from '../expansion-drafts/dht11-temperature-humidity-v1.mjs';
import { createDht11Artwork } from '../expansion-drafts/dht11-temperature-humidity-artwork-v1.mjs';
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
  PRE_CMP092_DHT11_CURRENT_MODEL_LIBRARY_LOCK,
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

test('CMP-092 owns one exact integer DHT11 definition and original three-terminal artwork', () => {
  assert.equal(Object.isFrozen(DHT11_DEFINITION), true);
  assert.equal(DHT11_DEFINITION.type, DHT11_TYPE);
  assert.equal(DHT11_DEFINITION.modelRef, DHT11_MODEL);
  assert.equal(DHT11_DEFINITION.artwork.renderer, DHT11_RENDERER);
  assert.equal(CANDIDATE_UI_COMPONENTS[DHT11_TYPE], DHT11_DEFINITION);
  assert.deepEqual(DHT11_DEFINITION.pins.map(({ id }) => id), ['VCC', 'DATA', 'GND']);
  assert.deepEqual(DHT11_DEFINITION.controlKeys, ['temperatureC', 'humidityPercent']);
  assert.deepEqual([
    DHT11_TEMPERATURE_MIN_C, DHT11_TEMPERATURE_MAX_C,
    DHT11_HUMIDITY_MIN_PERCENT, DHT11_HUMIDITY_MAX_PERCENT,
  ], [0, 50, 20, 90]);

  const component = createDht11Component('dht11-1', 'Room DHT11');
  assert.equal(validateDht11Component(component), true);
  assert.deepEqual(createCandidateUiComponent(DHT11_TYPE, 'dht11-1'),
    createDht11Component('dht11-1'));
  assert.deepEqual(dht11Payload(31, 64), [64, 0, 31, 0, 95]);
  assert.throws(() => dht11Payload(51, 64), /DHT11_ENVIRONMENT/u);

  const documentObject = { createElementNS: (_namespace, name) => new Node(name) };
  const svg = createDht11Artwork(documentObject, DHT11_DEFINITION, component);
  assert.equal(svg.attributes['data-artwork-key'], DHT11_RENDERER);
  assert.equal(svg.attributes['data-temperature-c'], '25');
  assert.equal(svg.attributes['data-humidity-percent'], '50');
  assert.deepEqual(svg.children.filter((item) => item.attributes['data-terminal-pin'])
    .map((item) => item.attributes['data-terminal-pin']), ['VCC', 'DATA', 'GND']);
});

test('DHT11 starter is exact, runnable and projected to one AVR D4 protocol device', () => {
  const starter = createAvrReferenceStarter('avr-dht11-temperature-humidity');
  const fixture = readFileSync(new URL('./fixtures/dht11_read/dht11_read.ino', import.meta.url), 'utf8');
  assert.equal(starter.project.project.source.files[0].content, fixture);
  const opened = openCandidateUiSession(starter.text);
  assert.equal(opened.ok, true, opened.code);
  assert.deepEqual(opened.session.runnable, { ok: true, code: 'OK', details: [] });
  const component = opened.session.visualProject.circuit.components.find(
    ({ id }) => id === 'dht11-1');
  assert.deepEqual(component.controls, { temperatureC: 25, humidityPercent: 50 });
  const support = opened.session.runtimeSupport.find(({ componentId }) => componentId === 'dht11-1');
  assert.equal(support.status, 'projected-simulated');
  assert.equal(support.runtimeAdapter, DHT11_RUNTIME_ADAPTER);
  assert.deepEqual(support.runtimeProjection, {
    componentId: 'dht11-1', type: DHT11_TYPE, boardPin: 'D4', boardPinNumber: 4,
    temperatureC: 25, humidityPercent: 50, payload: [50, 0, 25, 0, 75],
    runtimeAdapter: DHT11_RUNTIME_ADAPTER,
  });
});

test('temperature and humidity controls are independent, validated and exact across Save/Open', () => {
  const session = openCandidateUiSession(
    createAvrReferenceStarter('avr-dht11-temperature-humidity').text).session;
  const set = (key, value) => {
    const prepared = candidateContactControl(session, 'dht11-1', key, value);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    assert.deepEqual(prepared.worker, { command: 'dht11-control', componentId: 'dht11-1', key, value });
    const applied = session.apply({ ...prepared.command, revision: session.revision });
    assert.equal(applied.ok, true, JSON.stringify(applied));
  };
  set('temperatureC', 31);
  set('humidityPercent', 64);
  assert.equal(candidateContactControl(session, 'dht11-1', 'temperatureC', 51).ok, false);
  assert.equal(candidateContactControl(session, 'dht11-1', 'humidityPercent', 19).ok, false);
  const saved = session.saveText();
  const reopened = openCandidateUiSession(saved);
  assert.equal(reopened.ok, true, reopened.code);
  assert.equal(reopened.session.saveText(), saved);
  const component = reopened.session.visualProject.circuit.components.find(
    ({ id }) => id === 'dht11-1');
  assert.deepEqual(component.controls, { temperatureC: 31, humidityPercent: 64 });
  assert.deepEqual(reopened.session.runtimeSupport.find(
    ({ componentId }) => componentId === 'dht11-1').runtimeProjection.payload,
  [64, 0, 31, 0, 95]);
});

test('current model and support matrix claim DHT11 only for executable AVR', () => {
  assert.deepEqual(CURRENT_MODEL_LIBRARY_IMPLEMENTATION.evaluateProduction(DHT11_TYPE, {
    temperatureC: 31, humidityPercent: 64,
  }), { ok: true, code: 'OK', result: {
    temperatureC: 31, humidityPercent: 64, payload: [64, 0, 31, 0, 95],
  } });
  assert.equal(CURRENT_MODEL_LIBRARY_IMPLEMENTATION.evaluateProduction(DHT11_TYPE, {
    temperatureC: 31, humidityPercent: 91,
  }).code, 'MODEL_LIBRARY_PRODUCTION_INPUT');
  const profiles = [
    'board.atmega328p-16mhz-v1', 'board.rp2040-pico-v1',
    'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1',
  ];
  assert.deepEqual(profiles.map((profile) => componentSupportCell(profile, DHT11_TYPE)?.available),
    [true, false, false, false]);
  assert.equal(componentSupportCell(profiles[0], DHT11_TYPE).status, 'simulated');
  assert.match(componentSupportCell(profiles[1], DHT11_TYPE).limitations.join(' '), /does not yet admit/u);
  assert.equal(CURRENT_MODEL_LIBRARY_MANIFEST.entries.filter(
    ({ componentType }) => componentType === DHT11_TYPE).length, 1);
});

test('the exact public rc142 model lock opens as data-only and reports DHT11 plus the later DS18B20 addition', () => {
  assert.equal(PRE_CMP092_DHT11_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256,
    '4d0e44325726cf6f1a33cbb8328b46da6dfbbce23bb0b2a14ce4b78e67e3d67f');
  assert.equal(PRE_CMP092_DHT11_CURRENT_MODEL_LIBRARY_LOCK.implementationSha256,
    'c559fac09e04af127b96d8e18c60b9514c74c5e91ebe919f1a897415a7279fbd');
  assert.equal(resolveModelLibrary(PRE_CMP092_DHT11_CURRENT_MODEL_LIBRARY_LOCK).role,
    'pre-cmp092-dht11-current-migration');
  assert.equal(modelLibraryExecutionIdentity(
    PRE_CMP092_DHT11_CURRENT_MODEL_LIBRARY_LOCK).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const preview = modelLibraryMigrationPreview(
    PRE_CMP092_DHT11_CURRENT_MODEL_LIBRARY_LOCK, CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.semanticChanges.map(({ profile, componentType, kind }) => ({
    profile, componentType, kind,
  })), [
    { profile: 'board.atmega328p-16mhz-v1', componentType: DHT11_TYPE, kind: 'added' },
    { profile: 'board.atmega328p-16mhz-v1', componentType: 'sensor.ds18b20-temperature-v1', kind: 'added' },
  ]);
  assert.deepEqual(preview.rendererChanges, []);
  assert.equal(preview.unchanged.length, 71);
});
