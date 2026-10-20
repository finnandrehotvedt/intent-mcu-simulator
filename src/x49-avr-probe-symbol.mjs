// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { X49_PROBE_BYTES, X49_PROBE_SYMBOL } from './x49-instrumented-fixture-contract.mjs';

const HEADER = 52; const SECTION = 40; const SYMBOL = 16;
const HASH = /^[a-f0-9]{64}$/u;
const reject = (code) => { throw Object.assign(new Error(code), { code }); };
const bounded = (offset, length, total) => Number.isSafeInteger(offset)
  && Number.isSafeInteger(length) && offset >= 0 && length >= 0
  && offset <= total && length <= total - offset;

function decode(value) {
  if (typeof value !== 'string' || !value || value.length % 4) reject('X49_ELF_BASE64_INVALID');
  let binary; try { binary = atob(value); } catch { reject('X49_ELF_BASE64_INVALID'); }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length < HEADER) reject('X49_ELF_HEADER_INVALID');
  return bytes;
}

async function digest(bytes, cryptoImpl) {
  const value = await cryptoImpl.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function stringAt(bytes, offset, end) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= end) reject('X49_ELF_STRING_OFFSET_INVALID');
  let cursor = offset; while (cursor < end && bytes[cursor] !== 0) cursor += 1;
  if (cursor >= end) reject('X49_ELF_STRING_UNTERMINATED');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset, cursor)); }
  catch { return reject('X49_ELF_STRING_INVALID'); }
}

export async function parseX49ProbeSymbol(artifact, cryptoImpl = globalThis.crypto) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)
      || Object.keys(artifact).sort().join('|') !== 'elfBase64|elfSha256'
      || !HASH.test(artifact.elfSha256 ?? '') || typeof artifact.elfBase64 !== 'string') {
    reject('X49_ELF_ARTIFACT_INVALID');
  }
  const bytes = decode(artifact.elfBase64);
  if (await digest(bytes, cryptoImpl) !== artifact.elfSha256) reject('X49_ELF_HASH_MISMATCH');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46
      || bytes[4] !== 1 || bytes[5] !== 1 || bytes[6] !== 1 || view.getUint16(18, true) !== 83) {
    reject('X49_ELF_HEADER_INVALID');
  }
  const start = view.getUint32(32, true); const bytesPerSection = view.getUint16(46, true);
  const count = view.getUint16(48, true);
  if (bytesPerSection !== SECTION || count < 1 || count > 512
      || !bounded(start, bytesPerSection * count, bytes.length)) reject('X49_ELF_SECTION_TABLE_INVALID');
  const sections = Array.from({ length: count }, (_, index) => {
    const offset = start + index * bytesPerSection;
    return { index, type: view.getUint32(offset + 4, true), address: view.getUint32(offset + 12, true),
      offset: view.getUint32(offset + 16, true), size: view.getUint32(offset + 20, true),
      link: view.getUint32(offset + 24, true), entryBytes: view.getUint32(offset + 36, true) };
  });
  const matches = []; const objects = [];
  for (const table of sections.filter((item) => item.type === 2)) {
    if (table.entryBytes !== SYMBOL || table.size % SYMBOL || !bounded(table.offset, table.size, bytes.length)
        || table.link >= sections.length) reject('X49_ELF_SYMBOL_TABLE_INVALID');
    const strings = sections[table.link];
    if (!bounded(strings.offset, strings.size, bytes.length)) reject('X49_ELF_STRING_TABLE_INVALID');
    for (let cursor = table.offset; cursor < table.offset + table.size; cursor += SYMBOL) {
      const nameOffset = view.getUint32(cursor, true);
      if (nameOffset >= strings.size) reject('X49_ELF_STRING_OFFSET_INVALID');
      const item = { name: stringAt(bytes, strings.offset + nameOffset, strings.offset + strings.size),
        value: view.getUint32(cursor + 4, true), size: view.getUint32(cursor + 8, true),
        binding: view.getUint8(cursor + 12) >> 4, type: view.getUint8(cursor + 12) & 0x0f,
        other: view.getUint8(cursor + 13), sectionIndex: view.getUint16(cursor + 14, true) };
      if (item.type === 1 && item.sectionIndex !== 0 && item.size > 0) objects.push(item);
      if (item.name === X49_PROBE_SYMBOL) matches.push(item);
    }
  }
  if (matches.length !== 1) reject(matches.length ? 'X49_ELF_SYMBOL_DUPLICATE' : 'X49_ELF_SYMBOL_MISSING');
  const item = matches[0];
  if (item.binding !== 1 || item.type !== 1 || item.other !== 0 || item.sectionIndex === 0
      || item.sectionIndex >= sections.length || item.size !== X49_PROBE_BYTES) {
    reject('X49_ELF_SYMBOL_CONTRACT_INVALID');
  }
  const owner = sections[item.sectionIndex];
  if (item.value < owner.address || item.size > owner.size
      || item.value - owner.address > owner.size - item.size) reject('X49_ELF_SYMBOL_SECTION_BOUNDS');
  if (objects.some((other) => other !== item && other.sectionIndex === item.sectionIndex
      && other.value < item.value + item.size && item.value < other.value + other.size)) {
    reject('X49_ELF_SYMBOL_OVERLAP');
  }
  if (item.value < 0x800000) reject('X49_ELF_SYMBOL_DATA_MARKER');
  const dataAddress = item.value - 0x800000;
  if (dataAddress < 0x100 || dataAddress + item.size > 0x900) reject('X49_ELF_SYMBOL_SRAM_BOUNDS');
  return Object.freeze({ symbol: X49_PROBE_SYMBOL, dataAddress, size: item.size,
    elfSha256: artifact.elfSha256, binding: 'global', type: 'object' });
}
