// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTHORED_CHANGE_REVIEW_PROFILES,
  AUTHORED_CHANGE_REVIEW_SCHEMA,
  createAuthoredChangeReview,
} from '../src/authored-change-review.mjs';

const BASE = 'a'.repeat(64);
const CANDIDATE = 'b'.repeat(64);
const SOURCE_NAMES = Object.freeze({
  'board.atmega328p-16mhz-v1': 'main.ino',
  'board.rp2040-pico-v1': 'main.c',
  'board.esp32-c3-devmodule-v1': 'sketch.ino',
  'board.stm32f429zi-nucleo144-v1': 'main.c',
});

function project(profile, source, { components = [], nets = [], layout = null } = {}) {
  const authoredSource = profile === 'board.atmega328p-16mhz-v1'
    ? { files: [{ name: 'main.ino', content: source }] } : source;
  return {
    profile,
    source: authoredSource,
    circuit: { components, nets },
    ...(layout ? { layout } : {}),
  };
}

function review(profile, before, after, extra = {}) {
  return createAuthoredChangeReview({
    profile, baseProjectSha256: BASE, candidateProjectSha256: CANDIDATE,
    before, after, ...extra,
  });
}

test('X64 creates an identity-bound literal source review for every exact public profile', () => {
  assert.deepEqual(AUTHORED_CHANGE_REVIEW_PROFILES, [
    'board.atmega328p-16mhz-v1',
    'board.rp2040-pico-v1',
    'board.esp32-c3-devmodule-v1',
    'board.stm32f429zi-nucleo144-v1',
  ]);
  for (const profile of AUTHORED_CHANGE_REVIEW_PROFILES) {
    const value = review(profile, project(profile, 'line one\nline two\n'), project(profile, 'line one\nline changed\n'));
    assert.equal(value.schema, AUTHORED_CHANGE_REVIEW_SCHEMA, profile);
    assert.equal(value.profile, profile);
    assert.equal(value.baseProjectSha256, BASE);
    assert.equal(value.candidateProjectSha256, CANDIDATE);
    assert.deepEqual(value.authority, { apply: false, build: false, run: false, verdict: false });
    assert.equal(value.sourceDiffs.length, 1);
    assert.equal(value.sourceDiffs[0].name, SOURCE_NAMES[profile]);
    assert.match(value.sourceDiffs[0].text, /-line two\n\+line changed\n/u);
    assert.match(value.summaryRows[0].summary, /1 added line, 1 removed line/u);
  }
});

test('X64 reports only schema-owned component units and exact endpoint peers', () => {
  const profile = 'board.atmega328p-16mhz-v1';
  const board = { id: 'board-1', type: profile, label: 'Controller', properties: {}, controls: {} };
  const resistorBefore = { id: 'resistor-1', type: 'resistor.fixed-v1', label: 'LED resistor',
    properties: { ohms: 220 }, controls: {} };
  const resistorAfter = { ...resistorBefore, properties: { ohms: 330 } };
  const before = project(profile, 'const int level = 1;\n', {
    components: [board, resistorBefore],
    nets: [{ id: 'net-drive', endpoints: [{ component: 'board-1', pin: 'D13' },
      { component: 'resistor-1', pin: 'A' }] }],
  });
  const after = project(profile, 'const int level = 0;\n', {
    components: [board, resistorAfter],
    nets: [{ id: 'net-drive', endpoints: [{ component: 'board-1', pin: 'D12' },
      { component: 'resistor-1', pin: 'A' }] }],
  });
  const value = review(profile, before, after);
  const component = value.summaryRows.find((row) => row.id === 'component:resistor-1');
  const net = value.summaryRows.find((row) => row.id === 'net:net-drive');
  assert.match(component.summary, /220 Ω to 330 Ω/u);
  assert.match(net.summary, /Reconnected resistor-1\.A on net net-drive from board-1\.D13 to board-1\.D12/u);
  assert.doesNotMatch(value.summaryRows.find((row) => row.kind === 'source').summary, /level|meaning|GPIO/u);
});

test('X64 keeps property units with their typed owner when a component type changes', () => {
  const profile = 'board.atmega328p-16mhz-v1';
  const before = project(profile, 'same\n', { components: [{ id: 'part-1', type: 'resistor.fixed-v1',
    label: 'Part', properties: { ohms: 220 }, controls: {} }] });
  const after = project(profile, 'same\n', { components: [{ id: 'part-1', type: 'terminal.serial-uart-v1',
    label: 'Part', properties: { baud: 9_600, encoding: 'utf-8', historyLimit: 512 }, controls: {} }] });
  const value = review(profile, before, after);
  const row = value.summaryRows.find((item) => item.id === 'component:part-1');
  assert.match(row.summary, /properties\.ohms from 220 Ω to null/u);
  assert.match(row.summary, /properties\.baud from null to 9600 baud/u);
  assert.doesNotMatch(row.summary, /null Ω|null baud/u);
});

test('X64 preserves whitespace, CRLF, Unicode, HTML-like text and final-newline state literally', () => {
  const profile = 'board.atmega328p-16mhz-v1';
  const beforeText = 'const char* value = "<script>bad()</script>";\r\n\t// før';
  const afterText = 'const char* value = "<script>safe()</script>";\r\n\t// etter\n';
  const value = review(profile, project(profile, beforeText), project(profile, afterText));
  const diff = value.sourceDiffs[0].text;
  assert(diff.includes('-const char* value = "<script>bad()</script>";\r\n'));
  assert(diff.includes('+const char* value = "<script>safe()</script>";\r\n'));
  assert(diff.includes('-\t// før\n\\ No newline at end of file\n'));
  assert(diff.includes('+\t// etter\n'));
});

test('X64 accepts the maximum AVR source bytes, maximum topology row families and one long line', () => {
  const profile = 'board.atmega328p-16mhz-v1';
  const beforeSource = `${'x'.repeat(128 * 1024 - 2)}0\n`;
  const afterSource = `${'x'.repeat(128 * 1024 - 2)}1\n`;
  const componentsBefore = Array.from({ length: 64 }, (_, index) => ({
    id: `component-${index}`, type: 'led.basic-v1', label: `LED ${index}`,
    properties: { color: 'red' }, controls: {},
  }));
  const componentsAfter = componentsBefore.map((item) => ({ ...item, properties: { color: 'green' } }));
  const nets = Array.from({ length: 128 }, (_, index) => ({
    id: `net-${index}`, endpoints: [`component-${index % 64}.ANODE`, `board-1.D${index % 14}`],
  }));
  const beforeStyles = Object.fromEntries(nets.map((net) => [net.id, { color: 'red' }]));
  const afterStyles = Object.fromEntries(nets.map((net) => [net.id, { color: 'green' }]));
  const before = project(profile, beforeSource, { components: componentsBefore, nets,
    layout: { positions: {}, wireRoutes: {}, wireStyles: beforeStyles } });
  const after = project(profile, afterSource, { components: componentsAfter, nets,
    layout: { positions: {}, wireRoutes: {}, wireStyles: afterStyles } });
  const value = review(profile, before, after);
  assert.equal(value.summaryRows.length, 1 + 64 + 128);
  assert(value.sourceDiffs[0].text.length < value.limits.avrDiffBytes);
  assert.equal(value.sourceDiffs[0].minimal, true);
});

test('X64 bounded high-edit-distance fallback remains complete and explicit', () => {
  const profile = 'board.atmega328p-16mhz-v1';
  const beforeText = 'a\n'.repeat(32_768);
  const afterText = 'b\n'.repeat(32_768);
  const value = review(profile, project(profile, beforeText), project(profile, afterText));
  const diff = value.sourceDiffs[0];
  assert.equal(diff.minimal, false);
  assert.equal(diff.algorithm, 'complete-replacement-v1');
  assert.equal(diff.addedLines, 32_768);
  assert.equal(diff.removedLines, 32_768);
  assert.match(diff.text, /non-minimal complete replacement/u);
  assert.equal((diff.text.match(/^-a$/gmu) ?? []).length, 32_768);
  assert.equal((diff.text.match(/^\+b$/gmu) ?? []).length, 32_768);
});

test('X64 accounts for the diff budget across the complete accepted source set', () => {
  const profile = 'board.atmega328p-16mhz-v1';
  const files = Array.from({ length: 8 }, (_, index) => ({
    name: index === 0 ? 'main.ino' : `file${index}.cpp`,
    content: `${String.fromCharCode(97 + index)}\n`.repeat(8_000),
  }));
  const before = project(profile, 'unused\n'); before.source.files = files;
  const after = clone(before);
  after.source.files = files.map((file, index) => ({
    ...file, content: `${String.fromCharCode(107 + index)}\n`.repeat(8_000),
  }));
  const value = review(profile, before, after);
  assert.equal(value.sourceDiffs.length, 8);
  assert(value.sourceDiffs.reduce((total, diff) => total + new TextEncoder().encode(diff.text).byteLength, 0)
    <= value.limits.avrDiffBytes);
});

test('X64 rejects unsupported profiles, identical identities and unchanged authored content', () => {
  const before = project('board.rp2040-pico-v1', 'same\n');
  assert.throws(() => createAuthoredChangeReview({ profile: 'board.unknown-v1',
    baseProjectSha256: BASE, candidateProjectSha256: CANDIDATE, before, after: before }),
  { message: 'X64_PROFILE_MISMATCH' });
  assert.throws(() => createAuthoredChangeReview({ profile: 'board.rp2040-pico-v1',
    baseProjectSha256: BASE, candidateProjectSha256: BASE, before, after: before }),
  { message: 'X64_NO_DIFFERENCE' });
  assert.throws(() => review('board.rp2040-pico-v1', before, clone(before)),
    { message: 'X64_NO_DIFFERENCE' });
});

function clone(value) { return structuredClone(value); }
