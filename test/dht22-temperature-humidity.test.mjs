// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DHT22_DEFINITION,
  DHT22_HUMIDITY_MAX_PERCENT,
  DHT22_HUMIDITY_MIN_PERCENT,
  DHT22_MODEL,
  DHT22_RENDERER,
  DHT22_RUNTIME_ADAPTER,
  DHT22_TEMPERATURE_MAX_C,
  DHT22_TEMPERATURE_MIN_C,
  DHT22_TYPE,
  DHT22_VALUE_STEP,
  createDht22Component,
  dht22Payload,
  validateDht22Component,
} from '../expansion-drafts/dht22-temperature-humidity-v1.mjs';
import { createDht22Artwork } from '../expansion-drafts/dht22-temperature-humidity-artwork-v1.mjs';
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
  PRE_CMP093_DHT22_CURRENT_MODEL_LIBRARY_LOCK,
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

test('CMP-093 owns one exact decimal DHT22 definition and original three-terminal artwork', () => {
  assert.equal(Object.isFrozen(DHT22_DEFINITION), true);
  assert.equal(DHT22_DEFINITION.type, DHT22_TYPE);
  assert.equal(DHT22_DEFINITION.modelRef, DHT22_MODEL);
  assert.equal(DHT22_DEFINITION.artwork.renderer, DHT22_RENDERER);
  assert.equal(CANDIDATE_UI_COMPONENTS[DHT22_TYPE], DHT22_DEFINITION);
  assert.deepEqual(DHT22_DEFINITION.pins.map(({ id }) => id), ['VCC', 'DATA', 'GND']);
  assert.deepEqual(DHT22_DEFINITION.controlKeys, ['temperatureC', 'humidityPercent']);
  assert.deepEqual([
    DHT22_TEMPERATURE_MIN_C, DHT22_TEMPERATURE_MAX_C,
    DHT22_HUMIDITY_MIN_PERCENT, DHT22_HUMIDITY_MAX_PERCENT, DHT22_VALUE_STEP,
  ], [-40, 80, 0, 100, 0.1]);

  const component = createDht22Component('dht22-1', 'Room DHT22');
  assert.equal(validateDht22Component(component), true);
  assert.deepEqual(createCandidateUiComponent(DHT22_TYPE, 'dht22-1'),
    createDht22Component('dht22-1'));
  assert.deepEqual(dht22Payload(23.5, 64.7), [2, 135, 0, 235, 116]);
  assert.deepEqual(dht22Payload(-12.3, 64.7), [2, 135, 128, 123, 132]);
  assert.throws(() => dht22Payload(80.1, 64.7), /DHT22_ENVIRONMENT/u);

  const documentObject = { createElementNS: (_namespace, name) => new Node(name) };
  const svg = createDht22Artwork(documentObject, DHT22_DEFINITION, component);
  assert.equal(svg.attributes['data-artwork-key'], DHT22_RENDERER);
  assert.equal(svg.attributes['data-temperature-c'], '23.5');
  assert.equal(svg.attributes['data-humidity-percent'], '50');
  assert.deepEqual(svg.children.filter((item) => item.attributes['data-terminal-pin'])
    .map((item) => item.attributes['data-terminal-pin']), ['VCC', 'DATA', 'GND']);
});

test('DHT22 starter is exact, runnable and projected to one AVR D5 protocol device', () => {
  const starter = createAvrReferenceStarter('avr-dht22-temperature-humidity');
  const fixture = readFileSync(new URL('./fixtures/dht22_read/dht22_read.ino', import.meta.url), 'utf8');
  assert.equal(starter.project.project.source.files[0].content, fixture);
  const opened = openCandidateUiSession(starter.text);
  assert.equal(opened.ok, true, opened.code);
  assert.deepEqual(opened.session.runnable, { ok: true, code: 'OK', details: [] });
  const component = opened.session.visualProject.circuit.components.find(({ id }) => id === 'dht22-1');
  assert.deepEqual(component.controls, { temperatureC: 23.5, humidityPercent: 50 });
  const support = opened.session.runtimeSupport.find(({ componentId }) => componentId === 'dht22-1');
  assert.equal(support.status, 'projected-simulated');
  assert.equal(support.runtimeAdapter, DHT22_RUNTIME_ADAPTER);
  assert.deepEqual(support.runtimeProjection, {
    componentId: 'dht22-1', type: DHT22_TYPE, boardPin: 'D5', boardPinNumber: 5,
    temperatureC: 23.5, humidityPercent: 50, payload: [1, 244, 0, 235, 224],
    runtimeAdapter: DHT22_RUNTIME_ADAPTER,
  });
});

test('decimal DHT22 controls are independent, signed, validated and exact across Save/Open', () => {
  const session = openCandidateUiSession(
    createAvrReferenceStarter('avr-dht22-temperature-humidity').text).session;
  const set = (key, value) => {
    const prepared = candidateContactControl(session, 'dht22-1', key, value);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    assert.deepEqual(prepared.worker, { command: 'dht22-control', componentId: 'dht22-1', key, value });
    const applied = session.apply({ ...prepared.command, revision: session.revision });
    assert.equal(applied.ok, true, JSON.stringify(applied));
  };
  set('temperatureC', -12.3);
  set('humidityPercent', 64.7);
  assert.equal(candidateContactControl(session, 'dht22-1', 'temperatureC', 80.1).ok, false);
  assert.equal(candidateContactControl(session, 'dht22-1', 'humidityPercent', -0.1).ok, false);
  const saved = session.saveText();
  const reopened = openCandidateUiSession(saved);
  assert.equal(reopened.ok, true, reopened.code);
  assert.equal(reopened.session.saveText(), saved);
  const component = reopened.session.visualProject.circuit.components.find(({ id }) => id === 'dht22-1');
  assert.deepEqual(component.controls, { temperatureC: -12.3, humidityPercent: 64.7 });
  assert.deepEqual(reopened.session.runtimeSupport.find(
    ({ componentId }) => componentId === 'dht22-1').runtimeProjection.payload,
  [2, 135, 128, 123, 132]);
});

test('current model and support matrix claim DHT22 only for executable AVR', () => {
  assert.deepEqual(CURRENT_MODEL_LIBRARY_IMPLEMENTATION.evaluateProduction(DHT22_TYPE, {
    temperatureC: -12.3, humidityPercent: 64.7,
  }), { ok: true, code: 'OK', result: {
    temperatureC: -12.3, humidityPercent: 64.7, payload: [2, 135, 128, 123, 132],
  } });
  assert.equal(CURRENT_MODEL_LIBRARY_IMPLEMENTATION.evaluateProduction(DHT22_TYPE, {
    temperatureC: -12.35, humidityPercent: 64.7,
  }).code, 'MODEL_LIBRARY_PRODUCTION_INPUT');
  const profiles = [
    'board.atmega328p-16mhz-v1', 'board.rp2040-pico-v1',
    'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1',
  ];
  assert.deepEqual(profiles.map((profile) => componentSupportCell(profile, DHT22_TYPE)?.available),
    [true, false, false, false]);
  assert.equal(componentSupportCell(profiles[0], DHT22_TYPE).status, 'simulated');
  assert.match(componentSupportCell(profiles[1], DHT22_TYPE).limitations.join(' '), /does not yet admit/u);
  assert.equal(CURRENT_MODEL_LIBRARY_MANIFEST.entries.filter(
    ({ componentType }) => componentType === DHT22_TYPE).length, 1);
});

test('the exact public rc144 model lock opens as data-only and reports only the DHT22 addition', () => {
  assert.equal(PRE_CMP093_DHT22_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256,
    'c85acf51a649bd04f426869d6fea6423793198f1b4471cbfbca1484d2712cf8f');
  assert.equal(PRE_CMP093_DHT22_CURRENT_MODEL_LIBRARY_LOCK.implementationSha256,
    '41c9942b252ca24aa3a5f426eeaf29aeb4b67cf3224c2dfb04756a6aa07ad118');
  assert.equal(resolveModelLibrary(PRE_CMP093_DHT22_CURRENT_MODEL_LIBRARY_LOCK).role,
    'pre-cmp093-dht22-current-migration');
  assert.equal(modelLibraryExecutionIdentity(
    PRE_CMP093_DHT22_CURRENT_MODEL_LIBRARY_LOCK).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const preview = modelLibraryMigrationPreview(
    PRE_CMP093_DHT22_CURRENT_MODEL_LIBRARY_LOCK, CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.semanticChanges.map(({ profile, componentType, kind }) => ({
    profile, componentType, kind,
  })), [{ profile: 'board.atmega328p-16mhz-v1', componentType: DHT22_TYPE, kind: 'added' }]);
  assert.deepEqual(preview.rendererChanges, []);
  assert.equal(preview.unchanged.length, 73);
});
