// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseProjectV2 } from '../src/project-v2.mjs';
import { Rp2040PicoCircuitEditor } from '../src/rp2040-pico-circuit.mjs';
import { Esp32C3CircuitEditor } from '../src/esp32c3-public-circuit.mjs';
import { Stm32CircuitEditor } from '../src/stm32-public-circuit.mjs';
import { normalizeRp2040PublicProject } from '../src/rp2040-public-workbench.mjs';
import { normalizeEsp32C3PublicProject } from '../src/esp32c3-public-workbench.mjs';
import { normalizeStm32PublicProject } from '../src/stm32-public-workbench.mjs';

await import('../scripts/generate-basic-component-examples.mjs');
const ROOT = new URL('../examples/basic-components/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('CMP-001/002/037 examples are canonical, hashed and electrically named', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  assert.equal(manifest.schema, 'intent-mcu-basic-component-example-manifest@1');
  assert.deepEqual(manifest.entries.flatMap((entry) => entry.requirementIds), ['CMP-001', 'CMP-002', 'CMP-037']);
  for (const entry of manifest.entries) {
    const bytes = await readFile(new URL(entry.file, ROOT), 'utf8');
    const opened = parseProjectV2(bytes);
    assert.equal(opened.ok, true, `${entry.id}:${opened.code}`);
    assert.equal(sha256(bytes), entry.projectSha256, entry.id);
    assert.equal(sha256(opened.project.source.files[0].content), entry.sourceSha256, `${entry.id}:source`);
    assert(Object.keys(entry.namedPins).length >= 2, `${entry.id}:pins`);
    assert.match(entry.profileBehavior['board.atmega328p-16mhz-v1'], /executable/u);
  }
});

test('CMP-002 cross-profile combined examples reopen with exact hashes and honest firmware limits', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  const variants = manifest.entries.find(({ id }) => id === 'avr-analogue-potentiometer').crossProfileAuthoring;
  const editors = { 'board.rp2040-pico-v1': Rp2040PicoCircuitEditor,
    'board.esp32-c3-devmodule-v1': Esp32C3CircuitEditor,
    'board.stm32f429zi-nucleo144-v1': Stm32CircuitEditor };
  const normalizers = { 'board.rp2040-pico-v1': normalizeRp2040PublicProject,
    'board.esp32-c3-devmodule-v1': normalizeEsp32C3PublicProject,
    'board.stm32f429zi-nucleo144-v1': normalizeStm32PublicProject };
  assert.equal(variants.length, 3);
  for (const variant of variants) {
    const bytes = await readFile(new URL(variant.file, ROOT), 'utf8');
    assert.equal(sha256(bytes), variant.projectSha256, variant.id);
    assert.equal(variant.sourceSha256, null);
    assert.match(variant.firmware, /unavailable/u);
    const project = normalizers[variant.profile](JSON.parse(bytes));
    const reopened = new editors[variant.profile](project.circuit).snapshot().draft;
    assert.deepEqual(reopened.components.map(({ id }) => id), variant.componentIds);
    for (const pin of ['HIGH', 'WIPER', 'LOW']) assert(reopened.nets.some(({ endpoints }) => endpoints.some(
      ({ component, pin: actual }) => component === 'potentiometer-1' && actual === pin)));
  }
});

test('CMP-001/037 cross-profile series examples reopen with exact components nets and hashes', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  const entries = manifest.entries.filter(({ requirementIds }) => requirementIds.some((id) => ['CMP-001', 'CMP-037'].includes(id)));
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0].crossProfileAuthoring, entries[1].crossProfileAuthoring);
  for (const variant of entries[0].crossProfileAuthoring) {
    const bytes = await readFile(new URL(variant.file, ROOT), 'utf8');
    assert.equal(sha256(bytes), variant.projectSha256, variant.id);
    const project = JSON.parse(bytes);
    const normalizers = { 'board.rp2040-pico-v1': normalizeRp2040PublicProject,
      'board.esp32-c3-devmodule-v1': normalizeEsp32C3PublicProject,
      'board.stm32f429zi-nucleo144-v1': normalizeStm32PublicProject };
    const circuit = normalizers[variant.profile](project).circuit;
    assert.deepEqual(circuit.components.map(({ id }) => id), variant.componentIds);
    assert.deepEqual(circuit.nets.map(({ id, endpoints }) => ({ id,
      endpoints: endpoints.map(({ component, pin }) => `${component}.${pin}`) })), variant.exactNets);
    assert(circuit.components.some(({ type }) => type === 'resistor.fixed-v1'));
    assert(circuit.components.some(({ type }) => type === 'led.basic-v1'));
  }
});

test('basic examples preserve exact validated topology and values', async () => {
  const blink = parseProjectV2(await readFile(new URL('avr-blink.intent-mcu.json', ROOT), 'utf8')).project;
  const adc = parseProjectV2(await readFile(new URL('avr-adc.intent-mcu.json', ROOT), 'utf8')).project;
  assert.deepEqual(blink.circuit.components.map((item) => item.type),
    ['board.atmega328p-16mhz-v1', 'led.basic-v1', 'resistor.fixed-v1']);
  assert.equal(blink.circuit.components.find((item) => item.type === 'resistor.fixed-v1').properties.ohms, 220);
  assert.deepEqual(adc.circuit.components.map((item) => item.type),
    ['board.atmega328p-16mhz-v1', 'potentiometer.linear-v1']);
  assert.equal(adc.circuit.components.find((item) => item.type === 'potentiometer.linear-v1').properties.ohms, 10000);
});
