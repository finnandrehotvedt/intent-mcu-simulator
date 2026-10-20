// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { parseX49ProbeSymbol } from '../src/x49-avr-probe-symbol.mjs';

const target = 'intent_x49_probe_v1'; const encoder = new TextEncoder();
const sha256 = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map((value) => value.toString(16).padStart(2, '0')).join('');

async function elf({ symbols = null, hash = null } = {}) {
  const records = symbols ?? [{ name: target, value: 0x800100, size: 4, bind: 1, type: 1, section: 1 }];
  const names = [''].concat([...new Set(records.map((item) => item.name))]);
  const strings = encoder.encode(`${names.join('\0')}\0`); const offsets = new Map(); let cursor = 0;
  for (const name of names) { offsets.set(name, cursor); cursor += encoder.encode(name).length + 1; }
  const sectionStart = 52; const stringStart = sectionStart + 4 * 40;
  const symbolStart = stringStart + strings.length; const bytes = new Uint8Array(symbolStart + (records.length + 1) * 16);
  const view = new DataView(bytes.buffer); bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1]);
  view.setUint16(18, 83, true); view.setUint32(32, sectionStart, true);
  view.setUint16(46, 40, true); view.setUint16(48, 4, true);
  const section = (index, type, address, offset, size, link = 0, entryBytes = 0) => {
    const base = sectionStart + index * 40; view.setUint32(base + 4, type, true);
    view.setUint32(base + 12, address, true); view.setUint32(base + 16, offset, true);
    view.setUint32(base + 20, size, true); view.setUint32(base + 24, link, true);
    view.setUint32(base + 36, entryBytes, true);
  };
  section(1, 1, 0x800000, 0, 0x2000); section(2, 3, 0, stringStart, strings.length);
  section(3, 2, 0, symbolStart, (records.length + 1) * 16, 2, 16); bytes.set(strings, stringStart);
  records.forEach((item, index) => { const base = symbolStart + (index + 1) * 16;
    view.setUint32(base, offsets.get(item.name), true); view.setUint32(base + 4, item.value, true);
    view.setUint32(base + 8, item.size, true); view.setUint8(base + 12, (item.bind << 4) | item.type);
    view.setUint16(base + 14, item.section, true); });
  return { elfBase64: Buffer.from(bytes).toString('base64'), elfSha256: hash ?? await sha256(bytes) };
}

test('X49 ELF proof accepts exactly one global four-byte SRAM object', async () => {
  const artifact = await elf();
  assert.deepEqual(await parseX49ProbeSymbol(artifact), { symbol: target, dataAddress: 0x100,
    size: 4, elfSha256: artifact.elfSha256, binding: 'global', type: 'object' });
});

test('X49 ELF proof rejects symbol, binding, size, range, overlap and hash drift', async () => {
  const cases = [
    [[{ name: 'other', value: 0x800100, size: 4, bind: 1, type: 1, section: 1 }], 'X49_ELF_SYMBOL_MISSING'],
    [[{ name: target, value: 0x800100, size: 4, bind: 1, type: 1, section: 1 },
      { name: target, value: 0x800108, size: 4, bind: 1, type: 1, section: 1 }], 'X49_ELF_SYMBOL_DUPLICATE'],
    [[{ name: target, value: 0x800100, size: 4, bind: 2, type: 1, section: 1 }], 'X49_ELF_SYMBOL_CONTRACT_INVALID'],
    [[{ name: target, value: 0x800100, size: 3, bind: 1, type: 1, section: 1 }], 'X49_ELF_SYMBOL_CONTRACT_INVALID'],
    [[{ name: target, value: 0x800900, size: 4, bind: 1, type: 1, section: 1 }], 'X49_ELF_SYMBOL_SRAM_BOUNDS'],
    [[{ name: target, value: 0x800100, size: 4, bind: 1, type: 1, section: 1 },
      { name: 'overlap', value: 0x800102, size: 4, bind: 1, type: 1, section: 1 }], 'X49_ELF_SYMBOL_OVERLAP'],
  ];
  for (const [symbols, code] of cases) await assert.rejects(parseX49ProbeSymbol(await elf({ symbols })), { code });
  await assert.rejects(parseX49ProbeSymbol(await elf({ hash: '0'.repeat(64) })),
    { code: 'X49_ELF_HASH_MISMATCH' });
});
