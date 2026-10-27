// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  KEYBOARD_SHORTCUT_SCHEMA,
  defaultKeyboardShortcuts,
  keyboardEventShortcut,
  parseKeyboardShortcuts,
  shortcutFromKeyboardEvent,
  validateKeyboardShortcuts,
} from '../src/keyboard-shortcuts.mjs';

const keyboardEvent = (key, overrides = {}) => ({
  key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...overrides,
});

test('defaults expose five visible actions and leave the bounded sequence opt-in', () => {
  const result = validateKeyboardShortcuts(DEFAULT_KEYBOARD_SHORTCUTS);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.bindings, {
    build: 'B', run: 'F5', pause: 'P', reset: '', stop: 'Shift+F5', sequence: '',
  });
  assert.deepEqual(result.value.sequence, { enabled: false, steps: ['build', 'run'] });
});

test('custom settings reject duplicate keys, browser modifiers and the authoring R key', () => {
  const duplicate = defaultKeyboardShortcuts();
  duplicate.bindings.run = 'B';
  assert.deepEqual(validateKeyboardShortcuts(duplicate), {
    ok: false, code: 'SHORTCUT_CONFLICT', shortcut: 'B', actions: ['build', 'run'],
  });
  assert.equal(shortcutFromKeyboardEvent(keyboardEvent('k', { ctrlKey: true })).code,
    'SHORTCUT_MODIFIER_UNSUPPORTED');
  assert.equal(shortcutFromKeyboardEvent(keyboardEvent('r')).code,
    'SHORTCUT_AUTHORING_CONFLICT');
});

test('capture canonicalizes supported keys and Delete clears one assignment', () => {
  assert.deepEqual(shortcutFromKeyboardEvent(keyboardEvent('k')), { ok: true, value: 'K' });
  assert.deepEqual(shortcutFromKeyboardEvent(keyboardEvent('K', { shiftKey: true })),
    { ok: true, value: 'Shift+K' });
  assert.deepEqual(shortcutFromKeyboardEvent(keyboardEvent('F5', { shiftKey: true })),
    { ok: true, value: 'Shift+F5' });
  assert.deepEqual(shortcutFromKeyboardEvent(keyboardEvent('Delete')), { ok: true, value: '' });
  assert.equal(keyboardEventShortcut(keyboardEvent('F5')), 'F5');
});

test('stored data is exact-schema, data-only and fails closed to caller-controlled defaults', () => {
  const settings = defaultKeyboardShortcuts();
  settings.bindings.build = 'K';
  settings.bindings.sequence = 'Shift+G';
  settings.sequence.enabled = true;
  const parsed = parseKeyboardShortcuts(JSON.stringify(settings));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.schema, KEYBOARD_SHORTCUT_SCHEMA);
  assert.deepEqual(parsed.value.sequence.steps, ['build', 'run']);
  assert.equal(parseKeyboardShortcuts('{').code, 'SHORTCUT_SETTINGS_INVALID_JSON');
  assert.equal(parseKeyboardShortcuts(JSON.stringify({ ...settings, executable: 'alert(1)' })).code,
    'SHORTCUT_SETTINGS_INVALID');
});

test('an enabled sequence requires its own non-conflicting activation key', () => {
  const settings = defaultKeyboardShortcuts();
  settings.sequence.enabled = true;
  assert.deepEqual(validateKeyboardShortcuts(settings), {
    ok: false, code: 'SHORTCUT_SEQUENCE_KEY_REQUIRED',
  });
});
