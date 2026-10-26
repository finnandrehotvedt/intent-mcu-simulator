// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseProjectV2 } from '../src/project-v2.mjs';

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
