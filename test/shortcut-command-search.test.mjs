// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { commandSearchMatches, normalizeCommandSearch } from '../staging/shortcut-command-search.mjs';

test('command search is case-insensitive, whitespace-bounded and accent-stable', () => {
  assert.equal(normalizeCommandSearch('  PåUSE  '), 'pause');
  assert.equal(commandSearchMatches('Build compile firmware B', 'BUILD'), true);
  assert.equal(commandSearchMatches('Stop end cancel Shift F5', 'f5'), true);
  assert.equal(commandSearchMatches('Run start interact F5', 'reset'), false);
  assert.equal(commandSearchMatches('Reset restart not assigned', ''), true);
});
