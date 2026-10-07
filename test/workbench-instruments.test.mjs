// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCircuit } from '../src/circuit-engine.mjs';
import { createExampleProject, exampleCatalog } from '../src/example-projects.mjs';
import { serialInputBytes, serialLines, serialText } from '../src/serial-view.mjs';
import { cursorCycles, waveformPaths } from '../src/waveform-view.mjs';

test('four ordinary examples are validated editable projects', () => {
  assert.deepEqual(exampleCatalog().map((entry) => entry.id), ['blink', 'button', 'adc', 'pwm']);
  for (const { id } of exampleCatalog()) {
    const example = createExampleProject(id);
    assert.equal(validateCircuit(example.project.circuit).ok, true, id);
    assert.match(example.project.source.files[0].content, /void setup/);
    assert.equal(example.project.build.status, 'dirty');
  }
});

test('serial text assembles bytes and normalizes line endings', () => {
  const records = [...new TextEncoder().encode('one\r\ntwo\rthree\n')].map((value) => ({ direction: 'tx', value }));
  assert.equal(serialText(records), 'one\ntwo\nthree\n');
  assert.deepEqual(serialLines(records), ['one', 'two', 'three']);
  assert.deepEqual(serialInputBytes('go', 'crlf'), [103, 111, 13, 10]);
  assert.throws(() => serialInputBytes('go', 'invalid'), /SERIAL_LINE_ENDING/u);
});

test('waveform paths use actual transitions and user cursor positions', () => {
  const transitions = [
    { pin: 'D2', cycle: 100, level: true }, { pin: 'D2', cycle: 200, level: false },
    { pin: 'D3', cycle: 150, level: true },
  ];
  const model = waveformPaths(transitions, ['D2', 'D3'], { edgeLimit: 10, width: 500, height: 180 });
  assert.equal(model.records.length, 3);
  assert.equal(model.paths.length, 2);
  assert.match(model.paths[0].d, /H .* V .* H .* V/u);
  assert.deepEqual(cursorCycles(model, 0.25, 0.75), {
    first: 125, second: 175, deltaCycles: 50, deltaMilliseconds: 0.003125,
  });
});
