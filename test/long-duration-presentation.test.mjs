// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { longDurationPresentation } from '../src/long-duration-presentation.mjs';

const cases = [
  {
    cellId: 'X28-MILLIS-UNSIGNED-WRAP',
    expected: { preMillisMinimum: 4294967264, preMillisMaximum: 4294967295, postMillisMinimum: 0, postMillisMaximum: 31 },
    actual: { preMillis: 4294967279, postMillis: 15, d13High: { cycle: 264169 }, d13Low: { cycle: 772074 }, finalD13: false },
    label: 'Unsigned millis() wrap',
    visible: ['PRE 4,294,967,279 · POST 15', 'D13 HIGH at 264,169 cycles', 'D13 LOW at 772,074 cycles'],
  },
  {
    cellId: 'X28-FIVE-RESET-EPOCHS', expected: {},
    actual: { epochs: 5, cycleZeroAndEmpty: true, identicalProducerEvidence: true, finalD13: false },
    label: 'Five reset epochs', visible: ['5 epochs observed', 'Cycle zero + empty: yes', 'Identical evidence: yes'],
  },
  {
    cellId: 'X28-128-ORDERED-D2', expected: {},
    actual: { events: 128, ordered: true, droppedInputs: 0, pending: 0, finalD13: false, uartMarkerObserved: true },
    rawVirtualTime: { virtualMilliseconds: 2098 },
    label: '128 ordered D2 events', visible: ['128 events · ordered yes', '2,098 ms virtual time', '0 input drops · 0 pending'],
  },
  {
    cellId: 'X28-KNOWN-BAD-DIRECT-DEADLINE', expected: {},
    actual: { badMillis: 17, d13High: { cycle: 264169 }, failedAsExpected: true },
    label: 'Known-bad direct deadline', visible: ['BAD millis 17', 'Runtime difference: observed'],
  },
];

test('X28 presentation maps every evidence row to concise human-readable facts', () => {
  for (const fixture of cases) {
    const presentation = longDurationPresentation(fixture);
    assert.equal(presentation.label, fixture.label);
    assert.ok(presentation.expected.length >= 3);
    assert.ok(presentation.actual.length >= 2);
    const visible = [...presentation.expected, ...presentation.actual].join('\n');
    for (const phrase of fixture.visible) assert.match(visible, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
    assert.doesNotMatch(visible, /[{}\[\]"]/u);
  }
});

test('X28 presentation rejects unknown evidence cells', () => {
  assert.throws(() => longDurationPresentation({ cellId: 'X28-UNKNOWN' }), { code: 'LONG_DURATION_PRESENTATION_CELL_UNKNOWN' });
});

test('X28 evidence table keeps concise columns and keyboard-accessible complete records', async () => {
  const [html, main, css] = await Promise.all([
    readFile(new URL('../staging/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../staging/main.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../staging/styles.css', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /<th>Cell<\/th><th>Expected<\/th><th>Observed<\/th><th>Outcome<\/th><th>Full evidence<\/th>/u);
  assert.match(main, /document\.createElement\('details'\)/u);
  assert.match(main, /View complete raw records/u);
  for (const key of ['expected', 'actual', 'outcome', 'rawVirtualTime']) assert.match(main, new RegExp(`${key}: result\\.${key}`, 'u'));
  assert.match(css, /\.long-duration-outcome-badge[^}]*white-space: nowrap/u);
  assert.match(css, /\.long-duration-raw summary:focus-visible/u);
  assert.match(css, /body:has\(> \.serial-dock:not\(\[hidden\]\)\) main/u);
});
