// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { X34_PROBE_BYTES, X34_PROBE_SYMBOL } from './x34-precision-fixture.mjs';

const ELF32_HEADER_BYTES = 52;
const ELF32_SECTION_BYTES = 40;
const ELF32_SYMBOL_BYTES = 16;
const AVR_MACHINE = 83;
const SHT_SYMTAB = 2;
const STB_GLOBAL = 1;
const STT_OBJECT = 1;
const SHN_UNDEF = 0;
const AVR_DATA_MARKER = 0x800000;
const AVR_SRAM_START = 0x100;
const AVR_SRAM_END_EXCLUSIVE = 0x900;
const SHA256 = /^[a-f0-9]{64}$/u;

function reject(code) { throw Object.assign(new Error(code), { code }); }
function inBounds(offset, length, total) {
  return Number.isSafeInteger(offset) && Number.isSafeInteger(length)
    && offset >= 0 && length >= 0 && offset <= total && length <= total - offset;
}
function bytesFromBase64(value) {
  if (typeof value !== 'string' || !value || value.length % 4 !== 0) reject('X34_ELF_BASE64_INVALID');
  let binary;
  try { binary = atob(value); } catch { reject('X34_ELF_BASE64_INVALID'); }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.byteLength < ELF32_HEADER_BYTES) reject('X34_ELF_HEADER_INVALID');
  return bytes;
}
async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
function cString(bytes, offset, end) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= end) reject('X34_ELF_STRING_OFFSET_INVALID');
  let cursor = offset;
  while (cursor < end && bytes[cursor] !== 0) cursor += 1;
  if (cursor >= end) reject('X34_ELF_STRING_UNTERMINATED');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset, cursor)); }
  catch { reject('X34_ELF_STRING_INVALID'); }
}

export async function parseX34ProbeSymbol(artifact) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)
      || !SHA256.test(artifact.elfSha256 ?? '') || typeof artifact.elfBase64 !== 'string') {
    reject('X34_ELF_ARTIFACT_INVALID');
  }
  const bytes = bytesFromBase64(artifact.elfBase64);
  if (await sha256(bytes) !== artifact.elfSha256) reject('X34_ELF_HASH_MISMATCH');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46
      || bytes[4] !== 1 || bytes[5] !== 1 || bytes[6] !== 1
      || view.getUint16(18, true) !== AVR_MACHINE) reject('X34_ELF_HEADER_INVALID');
  const sectionOffset = view.getUint32(32, true);
  const sectionEntryBytes = view.getUint16(46, true);
  const sectionCount = view.getUint16(48, true);
  if (sectionEntryBytes !== ELF32_SECTION_BYTES || sectionCount < 1
      || sectionCount > 512 || !inBounds(sectionOffset, sectionEntryBytes * sectionCount, bytes.length)) {
    reject('X34_ELF_SECTION_TABLE_INVALID');
  }
  const sections = Array.from({ length: sectionCount }, (_, index) => {
    const offset = sectionOffset + index * sectionEntryBytes;
    return {
      index,
      type: view.getUint32(offset + 4, true),
      address: view.getUint32(offset + 12, true),
      offset: view.getUint32(offset + 16, true),
      size: view.getUint32(offset + 20, true),
      link: view.getUint32(offset + 24, true),
      entryBytes: view.getUint32(offset + 36, true),
    };
  });
  const matches = [];
  const definedObjects = [];
  for (const table of sections.filter((section) => section.type === SHT_SYMTAB)) {
    if (table.entryBytes !== ELF32_SYMBOL_BYTES || table.size % table.entryBytes !== 0
        || !inBounds(table.offset, table.size, bytes.length) || table.link >= sections.length) {
      reject('X34_ELF_SYMBOL_TABLE_INVALID');
    }
    const strings = sections[table.link];
    if (!inBounds(strings.offset, strings.size, bytes.length)) reject('X34_ELF_STRING_TABLE_INVALID');
    for (let cursor = table.offset; cursor < table.offset + table.size; cursor += table.entryBytes) {
      const nameOffset = view.getUint32(cursor, true);
      if (nameOffset >= strings.size) reject('X34_ELF_STRING_OFFSET_INVALID');
      const name = cString(bytes, strings.offset + nameOffset, strings.offset + strings.size);
      const record = {
        name,
        value: view.getUint32(cursor + 4, true),
        size: view.getUint32(cursor + 8, true),
        binding: view.getUint8(cursor + 12) >> 4,
        type: view.getUint8(cursor + 12) & 0x0f,
        other: view.getUint8(cursor + 13),
        sectionIndex: view.getUint16(cursor + 14, true),
      };
      if (record.type === STT_OBJECT && record.sectionIndex !== SHN_UNDEF && record.size > 0) {
        definedObjects.push(record);
      }
      if (name === X34_PROBE_SYMBOL) matches.push(record);
    }
  }
  if (matches.length !== 1) reject(matches.length ? 'X34_ELF_SYMBOL_DUPLICATE' : 'X34_ELF_SYMBOL_MISSING');
  const symbol = matches[0];
  if (symbol.binding !== STB_GLOBAL || symbol.type !== STT_OBJECT || symbol.other !== 0
      || symbol.sectionIndex === SHN_UNDEF || symbol.sectionIndex >= sections.length
      || symbol.size !== X34_PROBE_BYTES) reject('X34_ELF_SYMBOL_CONTRACT_INVALID');
  const owner = sections[symbol.sectionIndex];
  if (symbol.value < owner.address || symbol.size > owner.size
      || symbol.value - owner.address > owner.size - symbol.size) reject('X34_ELF_SYMBOL_SECTION_BOUNDS');
  if (definedObjects.some((candidate) => candidate !== symbol
      && candidate.sectionIndex === symbol.sectionIndex
      && candidate.value < symbol.value + symbol.size
      && symbol.value < candidate.value + candidate.size)) reject('X34_ELF_SYMBOL_OVERLAP');
  if (symbol.value < AVR_DATA_MARKER) reject('X34_ELF_SYMBOL_DATA_MARKER');
  const dataAddress = symbol.value - AVR_DATA_MARKER;
  if (dataAddress < AVR_SRAM_START || dataAddress + symbol.size > AVR_SRAM_END_EXCLUSIVE) {
    reject('X34_ELF_SYMBOL_SRAM_BOUNDS');
  }
  return Object.freeze({
    symbol: X34_PROBE_SYMBOL,
    dataAddress,
    size: symbol.size,
    elfSha256: artifact.elfSha256,
    binding: 'global',
    type: 'object',
  });
}
