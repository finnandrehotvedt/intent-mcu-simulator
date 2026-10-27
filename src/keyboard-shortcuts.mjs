// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const KEYBOARD_SHORTCUT_SCHEMA = 'intent-mcu-keyboard-shortcuts@1';
export const KEYBOARD_SHORTCUT_STORAGE_KEY = 'intent-mcu.keyboard-shortcuts.v1';
export const KEYBOARD_SHORTCUT_ACTIONS = Object.freeze([
  'build', 'run', 'pause', 'reset', 'stop', 'sequence',
]);

export const DEFAULT_KEYBOARD_SHORTCUTS = Object.freeze({
  schema: KEYBOARD_SHORTCUT_SCHEMA,
  bindings: Object.freeze({
    build: 'B', run: 'F5', pause: 'P', reset: '', stop: 'Shift+F5', sequence: '',
  }),
  sequence: Object.freeze({ enabled: false, steps: Object.freeze(['build', 'run']) }),
});

const SHORTCUT = /^(?:Shift\+)?(?:[A-Z0-9]|F5)$/u;
const RESERVED = new Set(['R']);

function copy(value) {
  return {
    schema: KEYBOARD_SHORTCUT_SCHEMA,
    bindings: Object.fromEntries(KEYBOARD_SHORTCUT_ACTIONS.map((action) => [action, value.bindings[action]])),
    sequence: { enabled: value.sequence.enabled, steps: [...value.sequence.steps] },
  };
}

export function defaultKeyboardShortcuts() {
  return copy(DEFAULT_KEYBOARD_SHORTCUTS);
}

export function validateKeyboardShortcuts(value) {
  if (!value || Object.keys(value).sort().join(',') !== 'bindings,schema,sequence'
      || value.schema !== KEYBOARD_SHORTCUT_SCHEMA || !value.bindings || !value.sequence
      || Object.keys(value.bindings).sort().join(',') !== [...KEYBOARD_SHORTCUT_ACTIONS].sort().join(',')
      || Object.keys(value.sequence).sort().join(',') !== 'enabled,steps'
      || typeof value.sequence.enabled !== 'boolean'
      || !Array.isArray(value.sequence.steps)
      || value.sequence.steps.length !== 2
      || value.sequence.steps[0] !== 'build' || value.sequence.steps[1] !== 'run') {
    return { ok: false, code: 'SHORTCUT_SETTINGS_INVALID' };
  }
  const bindings = {};
  const owners = new Map();
  for (const action of KEYBOARD_SHORTCUT_ACTIONS) {
    const binding = value.bindings[action];
    if (typeof binding !== 'string' || (binding && (!SHORTCUT.test(binding) || RESERVED.has(binding)))) {
      return { ok: false, code: 'SHORTCUT_KEY_UNSUPPORTED', action };
    }
    if (binding && owners.has(binding)) {
      return {
        ok: false, code: 'SHORTCUT_CONFLICT', shortcut: binding,
        actions: [owners.get(binding), action],
      };
    }
    if (binding) owners.set(binding, action);
    bindings[action] = binding;
  }
  return {
    ok: true,
    value: {
      schema: KEYBOARD_SHORTCUT_SCHEMA,
      bindings,
      sequence: { enabled: value.sequence.enabled, steps: ['build', 'run'] },
    },
  };
}

export function parseKeyboardShortcuts(source) {
  if (typeof source !== 'string' || !source) return { ok: false, code: 'SHORTCUT_SETTINGS_MISSING' };
  try { return validateKeyboardShortcuts(JSON.parse(source)); }
  catch { return { ok: false, code: 'SHORTCUT_SETTINGS_INVALID_JSON' }; }
}

export function shortcutFromKeyboardEvent(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return { ok: false, code: 'SHORTCUT_MODIFIER_UNSUPPORTED' };
  }
  if (event.key === 'Backspace' || event.key === 'Delete') return { ok: true, value: '' };
  let base = '';
  if (event.key === 'F5') base = 'F5';
  else if (/^[a-z0-9]$/iu.test(event.key)) base = event.key.toUpperCase();
  else return { ok: false, code: 'SHORTCUT_KEY_UNSUPPORTED' };
  const value = `${event.shiftKey ? 'Shift+' : ''}${base}`;
  if (RESERVED.has(value)) return { ok: false, code: 'SHORTCUT_AUTHORING_CONFLICT' };
  return { ok: true, value };
}

export function keyboardEventShortcut(event) {
  const result = shortcutFromKeyboardEvent(event);
  return result.ok ? result.value : null;
}

export function keyboardShortcutLabel(value) {
  return value || 'Not assigned';
}
