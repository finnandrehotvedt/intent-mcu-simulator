// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { appendFileSync, chmodSync, openSync, closeSync } from 'node:fs';

export function createX37PrivateRuntimeJournal(evidenceDirectory) {
  if (typeof evidenceDirectory !== 'string' || !evidenceDirectory.startsWith('/')) {
    throw Object.assign(new Error('X37_JOURNAL_CONFIGURATION'), { code: 'X37_JOURNAL_CONFIGURATION' });
  }
  const path = `${evidenceDirectory}/runtime-journal.ndjson`;
  const descriptor = openSync(path, 'wx', 0o600); closeSync(descriptor); chmodSync(path, 0o600);
  let rows = 0;
  return Object.freeze({ path, append(type, value) {
    if (rows >= 64 || !['environment', 'observation', 'failure', 'cleanup'].includes(type)) {
      throw Object.assign(new Error('X37_JOURNAL_LIMIT'), { code: 'X37_JOURNAL_LIMIT' });
    }
    const row = { schema: 'intent-mcu-x37-private-runtime-journal@1', row: ++rows, type, value };
    const text = `${JSON.stringify(row)}\n`;
    if (Buffer.byteLength(text) > 16_384) throw Object.assign(new Error('X37_JOURNAL_ROW_LIMIT'), { code: 'X37_JOURNAL_ROW_LIMIT' });
    appendFileSync(path, text, { encoding: 'utf8', mode: 0o600 }); return row;
  }, snapshot: () => ({ path, rows, mode: '0600' }) });
}
