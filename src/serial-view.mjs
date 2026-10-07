// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const BYTE_LIMIT = 16_384;

function relevantByte(record, direction) {
  if (!Number.isInteger(record?.value) || record.value < 0 || record.value > 255) return null;
  if (direction === 'tx') return record.direction === 'tx' ? record.value : null;
  return record.direction === 'rx-request' && record.accepted !== false ? record.value : null;
}

export function serialText(records, direction = 'tx') {
  const bytes = records.map((record) => relevantByte(record, direction)).filter((value) => value !== null).slice(-BYTE_LIMIT);
  return new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(bytes)).replace(/\r\n?/gu, '\n');
}

export function serialLines(records, direction = 'tx') {
  const text = serialText(records, direction);
  if (!text) return [];
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

export function serialInputBytes(text, lineEnding = 'none') {
  const suffix = { none: '', lf: '\n', crlf: '\r\n' }[lineEnding];
  if (suffix === undefined) throw new Error('SERIAL_LINE_ENDING');
  return [...new TextEncoder().encode(`${text}${suffix}`)];
}

export function serialEventText(records) {
  return records.map((entry) => `${Number(entry.virtualMilliseconds ?? 0).toFixed(3).padStart(12)} ms · ${String(entry.direction ?? 'event').toUpperCase().padEnd(11)} · ${entry.text || '—'}`).join('\n');
}
