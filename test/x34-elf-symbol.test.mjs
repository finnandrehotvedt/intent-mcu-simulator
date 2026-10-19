// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { parseX34ProbeSymbol } from '../src/x34-avr-probe-symbol.mjs';

const target = 'intent_x34_probe_v1';
const enc = new TextEncoder();
const sha256 = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map((part) => part.toString(16).padStart(2, '0')).join('');

async function elfArtifact({ symbols = null, corruptNameOffset = false, hash = null } = {}) {
  const records = symbols ?? [{ name: target, value: 0x800100, size: 4, bind: 1, type: 1, section: 1 }];
  const names = [''].concat([...new Set(records.map((item) => item.name))]);
  const stringBytes = enc.encode(`${names.join('\0')}\0`);
  const nameOffsets = new Map(); let offset = 0;
  for (const name of names) { nameOffsets.set(name, offset); offset += enc.encode(name).length + 1; }
  const sectionOffset = 52; const sectionCount = 4; const sectionBytes = 40;
  const stringOffset = sectionOffset + sectionCount * sectionBytes;
  const symbolOffset = stringOffset + stringBytes.length;
  const symbolCount = records.length + 1;
  const bytes = new Uint8Array(symbolOffset + symbolCount * 16);
  const view = new DataView(bytes.buffer);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1], 0);
  view.setUint16(18, 83, true); view.setUint32(32, sectionOffset, true);
  view.setUint16(46, sectionBytes, true); view.setUint16(48, sectionCount, true);
  const section = (index, { type, address = 0, fileOffset = 0, size = 0, link = 0, entryBytes = 0 }) => {
    const base = sectionOffset + index * sectionBytes;
    view.setUint32(base + 4, type, true); view.setUint32(base + 12, address, true);
    view.setUint32(base + 16, fileOffset, true); view.setUint32(base + 20, size, true);
    view.setUint32(base + 24, link, true); view.setUint32(base + 36, entryBytes, true);
  };
  section(1, { type: 1, address: 0x800000, size: 0x2000 });
  section(2, { type: 3, fileOffset: stringOffset, size: stringBytes.length });
  section(3, { type: 2, fileOffset: symbolOffset, size: symbolCount * 16, link: 2, entryBytes: 16 });
  bytes.set(stringBytes, stringOffset);
  records.forEach((record, index) => {
    const base = symbolOffset + (index + 1) * 16;
    view.setUint32(base, corruptNameOffset && index === 0 ? stringBytes.length : nameOffsets.get(record.name), true);
    view.setUint32(base + 4, record.value, true); view.setUint32(base + 8, record.size, true);
    view.setUint8(base + 12, (record.bind << 4) | record.type); view.setUint16(base + 14, record.section, true);
  });
  return { elfBase64: Buffer.from(bytes).toString('base64'), elfSha256: hash ?? await sha256(bytes) };
}

test('strict parser accepts only the exact global four-byte SRAM object', async () => {
  assert.deepEqual(await parseX34ProbeSymbol(await elfArtifact()), {
    symbol: target, dataAddress: 0x100, size: 4,
    elfSha256: await sha256(Buffer.from((await elfArtifact()).elfBase64, 'base64')),
    binding: 'global', type: 'object',
  });
});

test('all mandated malformed symbol classes reject before execution', async () => {
  const cases = [
    ['missing', [{ name: 'other', value: 0x800100, size: 4, bind: 1, type: 1, section: 1 }], 'X34_ELF_SYMBOL_MISSING'],
    ['duplicate', [{ name: target, value: 0x800100, size: 4, bind: 1, type: 1, section: 1 }, { name: target, value: 0x800108, size: 4, bind: 1, type: 1, section: 1 }], 'X34_ELF_SYMBOL_DUPLICATE'],
    ['weak', [{ name: target, value: 0x800100, size: 4, bind: 2, type: 1, section: 1 }], 'X34_ELF_SYMBOL_CONTRACT_INVALID'],
    ['local', [{ name: target, value: 0x800100, size: 4, bind: 0, type: 1, section: 1 }], 'X34_ELF_SYMBOL_CONTRACT_INVALID'],
    ['wrong type', [{ name: target, value: 0x800100, size: 4, bind: 1, type: 2, section: 1 }], 'X34_ELF_SYMBOL_CONTRACT_INVALID'],
    ['wrong size', [{ name: target, value: 0x800100, size: 3, bind: 1, type: 1, section: 1 }], 'X34_ELF_SYMBOL_CONTRACT_INVALID'],
    ['undefined', [{ name: target, value: 0x800100, size: 4, bind: 1, type: 1, section: 0 }], 'X34_ELF_SYMBOL_CONTRACT_INVALID'],
    ['out of SRAM', [{ name: target, value: 0x800900, size: 4, bind: 1, type: 1, section: 1 }], 'X34_ELF_SYMBOL_SRAM_BOUNDS'],
    ['overlap', [{ name: target, value: 0x800100, size: 4, bind: 1, type: 1, section: 1 }, { name: 'other', value: 0x800102, size: 4, bind: 1, type: 1, section: 1 }], 'X34_ELF_SYMBOL_OVERLAP'],
  ];
  for (const [name, symbols, code] of cases) {
    await assert.rejects(parseX34ProbeSymbol(await elfArtifact({ symbols })), { code }, name);
  }
  await assert.rejects(parseX34ProbeSymbol(await elfArtifact({ hash: '0'.repeat(64) })), { code: 'X34_ELF_HASH_MISMATCH' });
  await assert.rejects(parseX34ProbeSymbol(await elfArtifact({ corruptNameOffset: true })), { code: 'X34_ELF_STRING_OFFSET_INVALID' });
});
