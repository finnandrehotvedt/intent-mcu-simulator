// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createX42DigitalEdgeTriggerCapture,
  X42_CAPTURE_ROW_LIMIT,
  X42_OBSERVED_AFTER_ARM_LIMIT,
  X42_OBSERVER_INTERVAL_MS,
  X42_SOURCE_ROW_LIMIT,
  X42_UPDATE_ROW_LIMIT,
  x42TriggerAvailability,
} from '../src/x42-digital-edge-trigger-capture.mjs';

const AVR_FIXTURE = process.env.X42_AVR_FIXTURE
  ?? '/srv/codex-workspaces/intentforce-station/handoffs/desktop-etvt6l5-ct109-lab-x70-avr-pico-acceptance-recovery-20261020-001/browser/avr-recovery/failure-state.json';
const PICO_FIXTURE = process.env.X42_PICO_FIXTURE
  ?? '/srv/codex-workspaces/intentforce-station/handoffs/desktop-etvt6l5-ct109-lab-x70-pico-final-acceptance-20261020-001/browser/pico-final/failure-state.json';
const AVR_SHA256 = '5989993916aa2a07eb2be6ae31546801565e71a7f32484a8715f83f4f2d64946';
const PICO_SHA256 = '13ba2986b2c7a4e3b0c4f4750f174a6f011078dba0dd6b4734e6eea2e1f0893e';

async function fixture(path, hash) {
  const bytes = await readFile(path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
  return JSON.parse(bytes);
}

function prefix(source, length) {
  const summary = structuredClone(source.sharedSummary);
  const rows = summary.channels.logic.value.transitions.slice(0, length);
  summary.channels.logic.value.transitions = rows;
  summary.channels.logic.retention.retained = rows.length;
  summary.channels.logic.time.cycle = rows.at(-1)?.cycle ?? 0;
  summary.channels.logic.time.virtualMilliseconds = summary.channels.logic.time.cycle / 16_000;
  return summary;
}

test('checksum-pinned actual AVR rows prove arm-before-edge and exact 33-row capture', async () => {
  const actual = await fixture(AVR_FIXTURE, AVR_SHA256);
  const owner = createX42DigitalEdgeTriggerCapture();
  const lifecycle = actual.avrState.lifecycle;
  const armed = owner.arm(prefix(actual, 20), lifecycle, { channel: 'D3', edge: 'rising' });
  assert.equal(armed.state, 'armed');
  assert.equal(armed.binding.armFinalRow.sourceOrdinal, 19);
  assert.equal(owner.observe(prefix(actual, 20), lifecycle).state, 'armed', 'identical snapshot must be idempotent');
  const triggered = owner.observe(prefix(actual, 21), lifecycle);
  assert.equal(triggered.state, 'triggered');
  assert.equal(triggered.observedCandidateEdges, 1);
  const captured = owner.observe(prefix(actual, 37), lifecycle);
  assert.equal(captured.state, 'captured');
  assert.equal(captured.capture.armedBeforeTrigger, true);
  assert.equal(captured.capture.rows.length, X42_CAPTURE_ROW_LIMIT);
  assert.deepEqual(captured.capture.rows.map((row) => row.relativePosition),
    Array.from({ length: 33 }, (_, index) => index - 16));
  assert.equal(captured.capture.triggerCycle, actual.sharedSummary.channels.logic.value.transitions[20].cycle);
  assert.equal(captured.capture.rows[0].sourceOrdinal, 4);
  assert.equal(captured.capture.rows.at(-1).sourceOrdinal, 36);
});

test('historical actual edges cannot trigger and falling remains direction-specific', async () => {
  const actual = await fixture(AVR_FIXTURE, AVR_SHA256);
  const lifecycle = actual.avrState.lifecycle;
  const rising = createX42DigitalEdgeTriggerCapture();
  rising.arm(prefix(actual, 37), lifecycle, { channel: 'D3', edge: 'rising' });
  assert.equal(rising.observe(prefix(actual, 37), lifecycle).state, 'armed');
  assert.equal(rising.observe(prefix(actual, 38), lifecycle).state, 'armed');
  const falling = createX42DigitalEdgeTriggerCapture();
  falling.arm(prefix(actual, 19), lifecycle, { channel: 'D3', edge: 'falling' });
  assert.equal(falling.observe(prefix(actual, 20), lifecycle).state, 'triggered');
});

test('drop, overlap, stale identity and lifecycle changes fail closed without resurrection', async () => {
  const actual = await fixture(AVR_FIXTURE, AVR_SHA256);
  const lifecycle = actual.avrState.lifecycle;
  for (const [mutate, reason] of [
    [(summary) => { summary.channels.logic.retention.dropped = 1; }, 'X42_SOURCE_DISCONTINUITY'],
    [(summary) => { summary.channels.logic.value.transitions[19].level = true; }, 'X42_OVERLAP_AMBIGUOUS'],
  ]) {
    const owner = createX42DigitalEdgeTriggerCapture();
    owner.arm(prefix(actual, 20), lifecycle, { channel: 'D3', edge: 'rising' });
    const next = prefix(actual, 21); mutate(next);
    const invalid = owner.observe(next, lifecycle);
    assert.equal(invalid.state, 'invalidated');
    assert.equal(invalid.reason, reason);
    assert.equal(owner.observe(prefix(actual, 37), lifecycle).state, 'invalidated');
  }
  const owner = createX42DigitalEdgeTriggerCapture();
  owner.arm(prefix(actual, 20), lifecycle, { channel: 'D3', edge: 'rising' });
  const changed = structuredClone(lifecycle); changed.runtimeGeneration += 1;
  changed.runtimeBinding.runtimeGeneration += 1;
  assert.equal(owner.observe(prefix(actual, 21), changed).reason, 'X42_BINDING_CHANGED');
  const graphOwner = createX42DigitalEdgeTriggerCapture();
  graphOwner.arm(prefix(actual, 20), lifecycle, { channel: 'D3', edge: 'rising' });
  const graphRevision = prefix(actual, 21); graphRevision.revision += 1;
  assert.equal(graphOwner.observe(graphRevision, lifecycle).reason, 'X42_BINDING_CHANGED');
});

test('same-cycle duplicate values retain source ordinal and no-edge updates remain valid', async () => {
  const actual = await fixture(AVR_FIXTURE, AVR_SHA256);
  const lifecycle = actual.avrState.lifecycle;
  const base = prefix(actual, 20);
  const duplicate = structuredClone(base.channels.logic.value.transitions.at(-1));
  base.channels.logic.value.transitions.push(duplicate);
  base.channels.logic.retention.retained += 1;
  const owner = createX42DigitalEdgeTriggerCapture();
  owner.arm(base, lifecycle, { channel: 'D3', edge: 'rising' });
  assert.equal(owner.observe(structuredClone(base), lifecycle).state, 'armed');
  const next = structuredClone(base);
  next.channels.logic.value.transitions.push(structuredClone(duplicate));
  next.channels.logic.retention.retained += 1;
  assert.equal(owner.observe(next, lifecycle).state, 'armed');
  assert.equal(owner.snapshot().observedCandidateEdges, 1);
});

test('candidate budget processes the last allowed edge then terminates without growth', async () => {
  const actual = await fixture(AVR_FIXTURE, AVR_SHA256);
  const lifecycle = actual.avrState.lifecycle;
  const base = prefix(actual, 20);
  const owner = createX42DigitalEdgeTriggerCapture();
  owner.arm(base, lifecycle, { channel: 'D3', edge: 'rising' });
  const bounded = structuredClone(base);
  const cycle = bounded.channels.logic.value.transitions.at(-1).cycle;
  for (let index = 1; index <= X42_OBSERVED_AFTER_ARM_LIMIT; index += 1) {
    bounded.channels.logic.value.transitions.push({ cycle: cycle + index, pin: 'D3', level: false });
  }
  bounded.channels.logic.retention.retained = bounded.channels.logic.value.transitions.length;
  bounded.channels.logic.time.cycle = cycle + X42_OBSERVED_AFTER_ARM_LIMIT;
  bounded.channels.logic.time.virtualMilliseconds = bounded.channels.logic.time.cycle / 16_000;
  const result = owner.observe(bounded, lifecycle);
  assert.equal(result.state, 'not-triggered');
  assert.equal(result.observedCandidateEdges, X42_OBSERVED_AFTER_ARM_LIMIT);
  assert.equal(result.capture, null);
  assert.equal(owner.observe(bounded, lifecycle).state, 'not-triggered');
});

test('input and per-update budgets are fixed and oversized updates fail closed', async () => {
  assert.equal(X42_SOURCE_ROW_LIMIT, 100_000);
  assert.equal(X42_UPDATE_ROW_LIMIT, 8_192);
  assert.equal(X42_OBSERVER_INTERVAL_MS, 50);
  const actual = await fixture(AVR_FIXTURE, AVR_SHA256);
  const owner = createX42DigitalEdgeTriggerCapture();
  owner.arm(prefix(actual, 20), actual.avrState.lifecycle, { channel: 'D3', edge: 'rising' });
  const oversized = prefix(actual, 20);
  const last = oversized.channels.logic.value.transitions.at(-1);
  for (let index = 1; index <= X42_UPDATE_ROW_LIMIT + 1; index += 1) {
    oversized.channels.logic.value.transitions.push({ cycle: last.cycle + index, pin: 'D3', level: last.level });
  }
  oversized.channels.logic.retention.retained = oversized.channels.logic.value.transitions.length;
  oversized.channels.logic.time.cycle = oversized.channels.logic.value.transitions.at(-1).cycle;
  oversized.channels.logic.time.virtualMilliseconds = oversized.channels.logic.time.cycle / 16_000;
  assert.equal(owner.observe(oversized, actual.avrState.lifecycle).reason, 'X42_UPDATE_ROW_LIMIT');
});

test('strict schemas reject unknown keys and malformed source rows atomically', async () => {
  const actual = await fixture(AVR_FIXTURE, AVR_SHA256);
  const owner = createX42DigitalEdgeTriggerCapture();
  const unknown = prefix(actual, 20); unknown.extra = true;
  assert.throws(() => owner.arm(unknown, actual.avrState.lifecycle, { channel: 'D3', edge: 'rising' }),
    { code: 'X42_SUMMARY_KEYS' });
  const malformed = prefix(actual, 20); malformed.channels.logic.value.transitions[0].sequence = 1;
  assert.throws(() => owner.arm(malformed, actual.avrState.lifecycle, { channel: 'D3', edge: 'rising' }),
    { code: 'X42_ROW_KEYS' });
  assert.throws(() => owner.arm(prefix(actual, 20), actual.avrState.lifecycle,
    { channel: 'D3', edge: 'rising', extra: true }), { code: 'X42_CONFIG_KEYS' });
});

test('four-profile boundary is explicit and Pico actual fixture stays deferred', async () => {
  const [avr, pico] = await Promise.all([fixture(AVR_FIXTURE, AVR_SHA256), fixture(PICO_FIXTURE, PICO_SHA256)]);
  assert.equal(x42TriggerAvailability(avr.sharedSummary, avr.avrState.lifecycle).state, 'ready');
  const picoSummary = pico.sharedSummary;
  assert.equal(x42TriggerAvailability(picoSummary, {}).reason, 'deferred-retention-boundary');
  for (const [profile, reason] of [
    ['board.esp32-c3-devmodule-v1', 'unavailable-project-model-not-native-waveform'],
    ['board.stm32f429zi-nucleo144-v1', 'unavailable-final-observation-not-waveform'],
  ]) {
    const summary = structuredClone(avr.sharedSummary); summary.profile = profile;
    assert.equal(x42TriggerAvailability(summary, {}).reason, reason);
  }
});

test('shared shell keeps X42 transient, finite and outside the model closure', async () => {
  const [shell, owner, modelClosure] = await Promise.all([
    readFile(new URL('../src/shared-workbench-shell.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/x42-digital-edge-trigger-capture.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/generate-model-library-snapshots.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(shell, /setInterval\(observeNow, X42_OBSERVER_INTERVAL_MS\)/u);
  assert.match(shell, /if \(!\['armed', 'triggered'\]\.includes\(snapshot\.state\)\) stopObserver\(\)/u);
  for (const code of ['X42_PROFILE_CHANGED', 'X42_SOURCE_EDITED', 'X42_BUILD_STARTED',
    'X42_RESET', 'X42_STOP', 'X42_NEW_PROJECT', 'X42_EXAMPLE_LOADED']) assert.match(shell, new RegExp(code, 'u'));
  assert.doesNotMatch(`${owner}\n${shell}`, /localStorage|sessionStorage|indexedDB|serviceWorker/u);
  assert.doesNotMatch(modelClosure, /x42-digital-edge-trigger-capture|shared-workbench-shell/u);
});
