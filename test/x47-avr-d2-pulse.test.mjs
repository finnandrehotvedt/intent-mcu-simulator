// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import {
  captureX47PulseSource,
  canonicalX47PulseText,
  createX47PulseContext,
  createX47PulseContextFromSource,
  createX47PulsePreviewOwner,
  createX47PulseRecord,
  expandX47PulseRecord,
  inspectX47AvrD2Target,
  parseX47PulseText,
  validateX47PulseRecord,
  x47PulseSourceMatches,
  X47_AVR_PROFILE,
  X47_GENERATOR_ID,
  X47_MAX_END_CYCLES,
  X47_PULSE_SCHEMA,
} from '../src/x47-avr-d2-pulse.mjs';

const identity = `sha256:${'a'.repeat(64)}`;
const target = Object.freeze({
  componentId: 'button-1', componentType: 'button.momentary-v1',
  inputEndpoint: 'board-1.D2', contactEndpoint: 'button-1.A',
  groundEndpoint: 'board-1.GND1', groundContactEndpoint: 'button-1.B',
});
const context = (overrides = {}) => ({
  profile: X47_AVR_PROFILE, sourceProjectRevision: 7, graphIdentity: identity, target,
  ...overrides,
});
const record = (overrides = {}) => ({
  schema: X47_PULSE_SCHEMA,
  profile: X47_AVR_PROFILE,
  generatorId: X47_GENERATOR_ID,
  target,
  startOffsetCycles: 16_000,
  widthCycles: 32_000,
  timeBasis: 'avr-native-cycle',
  clockHertz: 16_000_000,
  idleLevel: true,
  activeLevel: false,
  randomness: 'none',
  seed: null,
  sourceProjectRevision: 7,
  graphIdentity: identity,
  ...overrides,
});

test('validated D2-to-ground graph produces one deterministic bound context', async () => {
  assert.deepEqual(inspectX47AvrD2Target(DEFAULT_CIRCUIT), target);
  const first = await createX47PulseContext(X47_AVR_PROFILE, 7, DEFAULT_CIRCUIT);
  const second = await createX47PulseContext(X47_AVR_PROFILE, 7, structuredClone(DEFAULT_CIRCUIT));
  assert.deepEqual(first, second);
  assert.match(first.graphIdentity, /^sha256:[0-9a-f]{64}$/u);
  const changed = structuredClone(DEFAULT_CIRCUIT);
  changed.components.find((item) => item.id === 'button-1').label = 'Changed button label';
  assert.notEqual((await createX47PulseContext(X47_AVR_PROFILE, 7, changed)).graphIdentity,
    first.graphIdentity);
});

test('source capture is immutable and exposes any graph or revision race after hashing', async () => {
  const mutable = structuredClone(DEFAULT_CIRCUIT);
  const source = captureX47PulseSource(X47_AVR_PROFILE, 3, 7, mutable);
  assert.equal(Object.isFrozen(source), true);
  assert.equal(Object.isFrozen(source.graphSnapshot), true);
  assert.equal(Object.isFrozen(source.graphSnapshot.components[0]), true);
  mutable.components.find((item) => item.id === 'button-1').label = 'Changed during digest';
  assert.equal(x47PulseSourceMatches(source, X47_AVR_PROFILE, 3, 7, mutable), false);
  assert.equal(x47PulseSourceMatches(source, X47_AVR_PROFILE, 4, 7, DEFAULT_CIRCUIT), false);
  assert.equal(x47PulseSourceMatches(source, X47_AVR_PROFILE, 3, 8, DEFAULT_CIRCUIT), false);
  assert.equal(x47PulseSourceMatches(source, X47_AVR_PROFILE, 3, 7, DEFAULT_CIRCUIT), true);
  const capturedContext = await createX47PulseContextFromSource(source);
  const directContext = await createX47PulseContext(X47_AVR_PROFILE, 7, DEFAULT_CIRCUIT);
  assert.deepEqual(capturedContext, directContext);
  assert.throws(() => { source.graphSnapshot.components[0].label = 'forbidden'; }, TypeError);
});

test('strict canonical bytes round-trip with exact fixed contract', () => {
  const value = createX47PulseRecord({ startOffsetCycles: 16_000, widthCycles: 32_000 }, context());
  const expected = '{"schema":"intent-mcu-x47-avr-d2-pulse@1","profile":"board.atmega328p-16mhz-v1","generatorId":"x47-avr-d2-active-low-pulse-v1","target":{"componentId":"button-1","componentType":"button.momentary-v1","inputEndpoint":"board-1.D2","contactEndpoint":"button-1.A","groundEndpoint":"board-1.GND1","groundContactEndpoint":"button-1.B"},"startOffsetCycles":16000,"widthCycles":32000,"timeBasis":"avr-native-cycle","clockHertz":16000000,"idleLevel":true,"activeLevel":false,"randomness":"none","seed":null,"sourceProjectRevision":7,"graphIdentity":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}\n';
  assert.equal(canonicalX47PulseText(value, context()), expected);
  assert.deepEqual(parseX47PulseText(expected, context()), value);
  assert.throws(() => parseX47PulseText(expected.replace('"schema":', '"schema":"duplicate","schema":'), context()),
    { code: 'DUPLICATE_KEY' });
});

test('one pulse expands atomically to exactly LOW then HIGH on D2', () => {
  assert.deepEqual(expandX47PulseRecord(record(), context()), [
    { pin: 'D2', offsetCycles: 16_000, level: false },
    { pin: 'D2', offsetCycles: 48_000, level: true },
  ]);
  assert.deepEqual(expandX47PulseRecord(record({ startOffsetCycles: 1, widthCycles: 1_599_999 }),
    context()), [
    { pin: 'D2', offsetCycles: 1, level: false },
    { pin: 'D2', offsetCycles: X47_MAX_END_CYCLES, level: true },
  ]);
});

test('unknown, executable-bearing, variable and unsafe records fail closed', () => {
  for (const [value, code] of [
    [{ ...record(), extra: true }, 'X47_RECORD_KEYS'],
    [{ ...record(), apply: true }, 'X47_RECORD_KEYS'],
    [{ ...record(), startOffsetCycles: 0 }, 'X47_START_OFFSET'],
    [{ ...record(), startOffsetCycles: 1.5 }, 'X47_START_OFFSET'],
    [{ ...record(), widthCycles: -1 }, 'X47_WIDTH'],
    [{ ...record(), startOffsetCycles: 1_600_000, widthCycles: 1 }, 'X47_END_OFFSET'],
    [{ ...record(), widthCycles: Number.MAX_SAFE_INTEGER }, 'X47_END_OFFSET'],
    [{ ...record(), profile: 'board.rp2040-pico-v1' }, 'X47_RECORD_IDENTITY'],
    [{ ...record(), activeLevel: true }, 'X47_FIXED_CONTRACT'],
    [{ ...record(), idleLevel: false }, 'X47_FIXED_CONTRACT'],
    [{ ...record(), randomness: 'seeded' }, 'X47_FIXED_CONTRACT'],
    [{ ...record(), seed: 1 }, 'X47_FIXED_CONTRACT'],
    [{ ...record(), timeBasis: 'millisecond' }, 'X47_FIXED_CONTRACT'],
    [{ ...record(), target: { ...target, pin: 'D3' } }, 'X47_TARGET'],
  ]) assert.throws(() => validateX47PulseRecord(value, context()), { code });
});

test('stale revision, graph and target identity are rejected', () => {
  for (const stale of [
    context({ sourceProjectRevision: 8 }),
    context({ graphIdentity: `sha256:${'b'.repeat(64)}` }),
    context({ target: { ...target, componentId: 'button-2', contactEndpoint: 'button-2.A',
      groundContactEndpoint: 'button-2.B' } }),
  ]) assert.throws(() => validateX47PulseRecord(record(), stale), { code: 'X47_STALE_BINDING' });
});

test('target inspection rejects missing, ambiguous and malformed wiring', () => {
  const missing = structuredClone(DEFAULT_CIRCUIT);
  missing.nets = missing.nets.filter((net) => net.id !== 'net-button-d2');
  assert.throws(() => inspectX47AvrD2Target(missing), { code: 'X47_TARGET_UNAVAILABLE' });
  const ambiguous = structuredClone(DEFAULT_CIRCUIT);
  ambiguous.components.push({ ...structuredClone(ambiguous.components.find((item) => item.id === 'button-1')),
    id: 'button-2', label: 'Second button' });
  ambiguous.nets.push(
    { id: 'net-button-2-d2', endpoints: [{ component: 'board-1', pin: 'D2' }, { component: 'button-2', pin: 'A' }] },
    { id: 'net-button-2-ground', endpoints: [{ component: 'board-1', pin: 'GND2' }, { component: 'button-2', pin: 'B' }] },
  );
  assert.throws(() => inspectX47AvrD2Target(ambiguous), { code: 'X47_TARGET_AMBIGUOUS' });
  const malformed = structuredClone(DEFAULT_CIRCUIT);
  malformed.nets[0].endpoints[0].extra = true;
  assert.throws(() => inspectX47AvrD2Target(malformed), { code: 'X47_GRAPH' });
});

test('preview owner preserves accepted bytes on rejection and clears atomically on lifecycle mismatch', () => {
  const owner = createX47PulsePreviewOwner();
  const accepted = owner.accept(record(), context());
  assert.equal(accepted.state, 'preview');
  assert.throws(() => owner.accept({ ...record(), widthCycles: 0 }, context()), { code: 'X47_WIDTH' });
  assert.deepEqual(owner.snapshot(), accepted, 'rejected replacement must not mutate accepted preview');
  const stale = owner.revalidate(context({ sourceProjectRevision: 8 }));
  assert.equal(stale.state, 'invalidated');
  assert.equal(stale.reason, 'X47_STALE_BINDING');
  assert.equal(stale.record, null);
  assert.deepEqual(stale.events, []);
  assert.equal(owner.revalidate(context()).state, 'invalidated', 'cleared authority cannot resurrect');
  assert.equal(owner.invalidate('X47_RESET').reason, 'X47_RESET');
});

test('shared shell keeps preview transient while current Apply is model-identity bound', async () => {
  const [shell, owner, modelClosure, support, controllers] = await Promise.all([
    readFile(new URL('../src/shared-workbench-shell.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/x47-avr-d2-pulse.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/generate-model-library-snapshots.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../staging/support.html', import.meta.url), 'utf8'),
    readFile(new URL('../staging/controllers.html', import.meta.url), 'utf8'),
  ]);
  for (const code of ['X47_SOURCE_EDITED', 'X47_BUILD_STARTED', 'X47_RUN_STARTED', 'X47_RESET',
    'X47_RUNTIME_RETIRED', 'X47_NEW_PROJECT', 'X47_EXAMPLE_OPENED', 'X47_OPEN_STARTED',
    'X47_PROJECT_OPENED', 'X47_PROFILE_CHANGED']) assert.match(shell, new RegExp(code, 'u'));
  assert.match(shell, /AVR D2 pulse/u);
  assert.match(shell, /Apply to paused D2/u);
  assert.match(shell, /support\.html#x47-avr-d2-pulse/u);
  assert.doesNotMatch(shell, /Private integration/u);
  assert.match(support, /id="x47-avr-d2-pulse"/u);
  assert.match(support, /accepted native emulator evidence covers A1 ramp/u);
  assert.match(support, /pressed-LOW D2 pulse, fresh re-pause, future pending A1 events and one Reset to cycle zero/u);
  assert.match(support, /Arbitrary signals, CSV\/network import, persistence\/replay, non-AVR profiles/u);
  assert.match(controllers, /id="x47-profile-boundary"/u);
  assert.match(controllers, /exact button-to-ground graph/u);
  assert.match(controllers, /support\.html#x47-avr-d2-pulse/u);
  assert.match(shell, /X47_SOURCE_CHANGED_DURING_HASH/u);
  assert.match(shell, /state: 'pending'.*record: null.*canonicalText: null.*events: \[\]/su);
  assert.match(shell, /snapshot: currentSnapshot/u);
  assert.match(shell, /x47PulseSourceMatches/u);
  assert.doesNotMatch(`${owner}\n${shell}`, /localStorage|sessionStorage|indexedDB|serviceWorker|postMessage\(/u);
  assert.doesNotMatch(`${owner}\n${shell}`, /queueDigitalSequence|digital-sequence/u);
  assert.match(modelClosure, /x47-ui-integration|shared-workbench-shell/u);
  assert.doesNotMatch(modelClosure, /x47-avr-d2-pulse/u);
});
