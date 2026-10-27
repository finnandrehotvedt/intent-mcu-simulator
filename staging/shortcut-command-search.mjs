// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export function normalizeCommandSearch(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').trim().toLowerCase();
}

export function commandSearchMatches(searchText, query) {
  const normalizedQuery = normalizeCommandSearch(query);
  return !normalizedQuery || normalizeCommandSearch(searchText).includes(normalizedQuery);
}

export function installShortcutCommandSearch(root = document) {
  const dialog = root.querySelector('#shortcut-settings-dialog');
  const input = root.querySelector('#shortcut-command-search');
  const clear = root.querySelector('#shortcut-command-search-clear');
  const count = root.querySelector('#shortcut-command-search-count');
  const entries = [...root.querySelectorAll('[data-command-search]')];
  if (!dialog || !input || !clear || !count || entries.length === 0) return false;

  const render = () => {
    let visible = 0;
    for (const entry of entries) {
      entry.hidden = !commandSearchMatches(entry.dataset.commandSearch, input.value);
      if (!entry.hidden) visible += 1;
    }
    clear.hidden = input.value.length === 0;
    count.textContent = `${visible} of ${entries.length} commands shown`;
  };
  input.addEventListener('input', render);
  clear.addEventListener('click', () => {
    input.value = '';
    render();
    input.focus();
  });
  dialog.addEventListener('close', () => {
    input.value = '';
    render();
  });
  render();
  return true;
}

if (typeof document !== 'undefined') installShortcutCommandSearch();
