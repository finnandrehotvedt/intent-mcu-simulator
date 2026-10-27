// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  BME280_ADDRESS,
  BME280_DEFINITION,
  BME280_HUMIDITY_MAX_PERCENT,
  BME280_HUMIDITY_MIN_PERCENT,
  BME280_MODEL,
  BME280_PRESSURE_MAX_HPA,
  BME280_PRESSURE_MIN_HPA,
  BME280_RENDERER,
  BME280_RUNTIME_ADAPTER,
  BME280_TEMPERATURE_MAX_C,
  BME280_TEMPERATURE_MIN_C,
  BME280_TYPE,
  BME280_VALUE_STEP,
  bme280RawSample,
  bme280RegisterMap,
  compensateBme280,
  createBme280Component,
  validateBme280Component,
} from '../expansion-drafts/bme280-environment-v1.mjs';
import { createBme280Artwork } from '../expansion-drafts/bme280-environment-artwork-v1.mjs';
import { BME280_ENVIRONMENT_SOURCE } from '../expansion-drafts/bme280-environment-example-v1.mjs';
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
  PRE_CMP094_BME280_CURRENT_MODEL_LIBRARY_LOCK,
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

test('CMP-094 owns one fixed-address BME280 definition and original four-terminal artwork', () => {
  assert.equal(Object.isFrozen(BME280_DEFINITION), true);
  assert.equal(BME280_DEFINITION.type, BME280_TYPE);
  assert.equal(BME280_DEFINITION.modelRef, BME280_MODEL);
  assert.equal(BME280_DEFINITION.artwork.renderer, BME280_RENDERER);
  assert.equal(CANDIDATE_UI_COMPONENTS[BME280_TYPE], BME280_DEFINITION);
  assert.equal(BME280_ADDRESS, 0x76);
  assert.deepEqual(BME280_DEFINITION.pins.map(({ id }) => id), ['VCC', 'GND', 'SDA', 'SCL']);
  assert.deepEqual(BME280_DEFINITION.controlKeys,
    ['temperatureC', 'humidityPercent', 'pressureHpa']);
  assert.deepEqual([
    BME280_TEMPERATURE_MIN_C, BME280_TEMPERATURE_MAX_C,
    BME280_HUMIDITY_MIN_PERCENT, BME280_HUMIDITY_MAX_PERCENT,
    BME280_PRESSURE_MIN_HPA, BME280_PRESSURE_MAX_HPA, BME280_VALUE_STEP,
  ], [-40, 85, 0, 100, 300, 1100, 0.1]);

  const component = createBme280Component('bme280-1', 'Room BME280');
  assert.equal(validateBme280Component(component), true);
  assert.deepEqual(createCandidateUiComponent(BME280_TYPE, 'bme280-1'),
    createBme280Component('bme280-1'));
  const documentObject = { createElementNS: (_namespace, name) => new Node(name) };
  const svg = createBme280Artwork(documentObject, BME280_DEFINITION, component);
  assert.equal(svg.attributes['data-artwork-key'], BME280_RENDERER);
  assert.equal(svg.attributes['data-pressure-hpa'], '1013.2');
  assert.deepEqual(svg.children.filter((item) => item.attributes['data-terminal-pin'])
    .map((item) => item.attributes['data-terminal-pin']), ['VCC', 'GND', 'SDA', 'SCL']);
});

test('BME280 register map exposes standard identity, calibration and accurately compensated raw data', () => {
  for (const controls of [[23.5, 50, 1013.2], [-12.3, 64.7, 987.6], [85, 100, 1100]]) {
    const sample = bme280RawSample(...controls);
    assert.ok(Math.abs(sample.compensated.temperatureC - controls[0]) < 0.01);
    assert.ok(Math.abs(sample.compensated.humidityPercent - controls[1]) < 0.01);
    assert.ok(Math.abs(sample.compensated.pressureHpa - controls[2]) < 0.01);
    assert.deepEqual(compensateBme280(
      sample.rawTemperature, sample.rawPressure, sample.rawHumidity), sample.compensated);
  }
  const registers = bme280RegisterMap(23.5, 50, 1013.2);
  assert.equal(registers.length, 256);
  assert.equal(registers[0xd0], 0x60);
  assert.notEqual(registers[0x88], 0);
  assert.notDeepEqual(Array.from(registers.slice(0xf7, 0xff)), Array(8).fill(0));
  assert.throws(() => bme280RegisterMap(23.55, 50, 1013.2), /BME280_ENVIRONMENT/u);
});

test('BME280 starter is exact, runnable and projected to AVR A4/A5 I2C', () => {
  const starter = createAvrReferenceStarter('avr-bme280-environment');
  const fixture = readFileSync(new URL('./fixtures/bme280_read/bme280_read.ino', import.meta.url), 'utf8');
  assert.equal(BME280_ENVIRONMENT_SOURCE, fixture);
  assert.equal(starter.project.project.source.files[0].content, fixture);
  const opened = openCandidateUiSession(starter.text);
  assert.equal(opened.ok, true, opened.code);
  assert.deepEqual(opened.session.runnable, { ok: true, code: 'OK', details: [] });
  const component = opened.session.visualProject.circuit.components.find(({ id }) => id === 'bme280-1');
  assert.deepEqual(component.controls,
    { temperatureC: 23.5, humidityPercent: 50, pressureHpa: 1013.2 });
  const support = opened.session.runtimeSupport.find(({ componentId }) => componentId === 'bme280-1');
  assert.equal(support.status, 'projected-simulated');
  assert.equal(support.runtimeAdapter, BME280_RUNTIME_ADAPTER);
  assert.deepEqual(support.runtimeProjection, {
    componentId: 'bme280-1', type: BME280_TYPE, address: BME280_ADDRESS,
    sdaPin: 'A4', sclPin: 'A5', temperatureC: 23.5, humidityPercent: 50,
    pressureHpa: 1013.2, runtimeAdapter: BME280_RUNTIME_ADAPTER,
  });
});

test('three BME280 controls are independently validated and exact across Save/Open', () => {
  const session = openCandidateUiSession(createAvrReferenceStarter('avr-bme280-environment').text).session;
  for (const [key, value] of [['temperatureC', -12.3], ['humidityPercent', 64.7], ['pressureHpa', 987.6]]) {
    const prepared = candidateContactControl(session, 'bme280-1', key, value);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    assert.deepEqual(prepared.worker, { command: 'bme280-control', componentId: 'bme280-1', key, value });
    assert.equal(session.apply({ ...prepared.command, revision: session.revision }).ok, true);
  }
  assert.equal(candidateContactControl(session, 'bme280-1', 'temperatureC', 85.1).ok, false);
  assert.equal(candidateContactControl(session, 'bme280-1', 'humidityPercent', -0.1).ok, false);
  assert.equal(candidateContactControl(session, 'bme280-1', 'pressureHpa', 1100.1).ok, false);
  const saved = session.saveText();
  const reopened = openCandidateUiSession(saved);
  assert.equal(reopened.ok, true, reopened.code);
  assert.equal(reopened.session.saveText(), saved);
  assert.deepEqual(reopened.session.visualProject.circuit.components.find(
    ({ id }) => id === 'bme280-1').controls,
  { temperatureC: -12.3, humidityPercent: 64.7, pressureHpa: 987.6 });
});

test('current model and support matrix add BME280 only to executable AVR', () => {
  const evaluated = CURRENT_MODEL_LIBRARY_IMPLEMENTATION.evaluateProduction(BME280_TYPE, {
    temperatureC: -12.3, humidityPercent: 64.7, pressureHpa: 987.6,
  });
  assert.equal(evaluated.ok, true);
  assert.deepEqual({
    temperatureC: evaluated.result.temperatureC,
    humidityPercent: evaluated.result.humidityPercent,
    pressureHpa: evaluated.result.pressureHpa,
  }, { temperatureC: -12.3, humidityPercent: 64.7, pressureHpa: 987.6 });
  assert.equal(CURRENT_MODEL_LIBRARY_IMPLEMENTATION.evaluateProduction(BME280_TYPE, {
    temperatureC: -12.35, humidityPercent: 64.7, pressureHpa: 987.6,
  }).code, 'MODEL_LIBRARY_PRODUCTION_INPUT');
  const profiles = [
    'board.atmega328p-16mhz-v1', 'board.rp2040-pico-v1',
    'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1',
  ];
  assert.deepEqual(profiles.map((profile) => componentSupportCell(profile, BME280_TYPE)?.available),
    [true, false, false, false]);
  assert.equal(componentSupportCell(profiles[0], BME280_TYPE).status, 'simulated');
  assert.equal(CURRENT_MODEL_LIBRARY_MANIFEST.entries.filter(
    ({ componentType }) => componentType === BME280_TYPE).length, 1);
});

test('terminal DHT22 model lock remains data-only and migrates by adding only BME280', () => {
  assert.equal(resolveModelLibrary(PRE_CMP094_BME280_CURRENT_MODEL_LIBRARY_LOCK).role,
    'pre-cmp094-bme280-current-migration');
  assert.equal(modelLibraryExecutionIdentity(
    PRE_CMP094_BME280_CURRENT_MODEL_LIBRARY_LOCK).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const preview = modelLibraryMigrationPreview(
    PRE_CMP094_BME280_CURRENT_MODEL_LIBRARY_LOCK, CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.semanticChanges.map(({ profile, componentType, kind }) => ({
    profile, componentType, kind,
  })), [{ profile: 'board.atmega328p-16mhz-v1', componentType: BME280_TYPE, kind: 'added' }]);
  assert.deepEqual(preview.rendererChanges, []);
  assert.equal(preview.unchanged.length, 74);
});
