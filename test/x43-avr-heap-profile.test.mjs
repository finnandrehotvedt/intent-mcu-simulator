// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { RuntimeKernel } from '../src/runtime-kernel.mjs';
import {
  X43_AVR_HEAP_ALLOCATOR, parseX43AvrHeapSymbols, sampleX43AvrHeapFrontier,
  validateX43AvrHeapSample, validateX43AvrHeapSymbols,
} from '../src/x43-avr-heap-profile.mjs';
import {
  AVR_ALLOCATOR_ARCHIVE_SHA256, AVR_ALLOCATOR_ID, AVR_ALLOCATOR_MEMBER,
  AVR_ALLOCATOR_MEMBER_SHA256, AVR_ALLOCATOR_PROVENANCE_SCHEMA, AVR_ALLOCATOR_SYMBOLS,
} from '../compiler/avr-allocator-provenance.mjs';

const binding = { artifactIdentity: 'a'.repeat(64), modelImplementationSha256: 'b'.repeat(64),
  modelExecutionContextSha256: 'c'.repeat(64) };
const records = [
  { name: '_end', value: 0x800180, size: 0, binding: 1, type: 0, sectionIndex: 3 },
  { name: '__heap_start', value: 0x800180, size: 0, binding: 1, type: 0, sectionIndex: 3 },
  { name: '__brkval', value: 0x800110, size: 2, binding: 1, type: 1, sectionIndex: 2 },
  { name: '__flp', value: 0x800112, size: 2, binding: 1, type: 1, sectionIndex: 2 },
  { name: '__malloc_heap_start', value: 0x800114, size: 2, binding: 1, type: 1, sectionIndex: 2 },
  { name: '__malloc_heap_end', value: 0x800116, size: 2, binding: 1, type: 1, sectionIndex: 2 },
  { name: '__malloc_margin', value: 0x800118, size: 2, binding: 1, type: 1, sectionIndex: 2 },
  { name: 'malloc', value: 0x100, size: 48, binding: 1, type: 2, sectionIndex: 1 },
  { name: 'free', value: 0x140, size: 32, binding: 1, type: 2, sectionIndex: 1 },
];

function u32(bytes, offset, value) { new DataView(bytes.buffer).setUint32(offset, value, true); }
function u16(bytes, offset, value) { new DataView(bytes.buffer).setUint16(offset, value, true); }

async function fixture(symbols = records, provenance = 'supported', programs = [
  { type: 1, offset: 0, virtualAddress: 0x800100, fileBytes: 0, memoryBytes: 0x80, flags: 6 },
]) {
  const names = [''].concat([...new Set(symbols.map(({ name }) => name))]);
  const offsets = new Map();
  const strings = [];
  for (const name of names) {
    offsets.set(name, strings.length);
    strings.push(...Buffer.from(name, 'utf8'), 0);
  }
  const programOffset = 52;
  const sectionOffset = programOffset + programs.length * 32;
  const stringOffset = sectionOffset + 6 * 40;
  const symbolOffset = stringOffset + strings.length;
  const bytes = new Uint8Array(symbolOffset + (symbols.length + 1) * 16);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1], 0);
  u16(bytes, 18, 83); u32(bytes, 28, programOffset); u32(bytes, 32, sectionOffset);
  u16(bytes, 42, 32); u16(bytes, 44, programs.length); u16(bytes, 46, 40); u16(bytes, 48, 6);
  programs.forEach((program, index) => {
    const base = programOffset + index * 32;
    u32(bytes, base, program.type); u32(bytes, base + 4, program.offset);
    u32(bytes, base + 8, program.virtualAddress); u32(bytes, base + 16, program.fileBytes);
    u32(bytes, base + 20, program.memoryBytes); u32(bytes, base + 24, program.flags);
  });
  const section = (index, { type, flags = 0, address = 0, offset = 0, size = 0,
    link = 0, entryBytes = 0 }) => {
    const base = sectionOffset + index * 40;
    u32(bytes, base + 4, type); u32(bytes, base + 8, flags); u32(bytes, base + 12, address);
    u32(bytes, base + 16, offset);
    u32(bytes, base + 20, size); u32(bytes, base + 24, link); u32(bytes, base + 36, entryBytes);
  };
  section(1, { type: 1, flags: 6, address: 0, size: 0x800 });
  section(2, { type: 1, flags: 3, address: 0x800100, size: 0x80 });
  section(3, { type: 1, address: 0, size: 1 });
  section(4, { type: 3, offset: stringOffset, size: strings.length });
  section(5, { type: 2, offset: symbolOffset, size: (symbols.length + 1) * 16, link: 4, entryBytes: 16 });
  bytes.set(strings, stringOffset);
  symbols.forEach((record, index) => {
    const base = symbolOffset + (index + 1) * 16;
    u32(bytes, base, offsets.get(record.name)); u32(bytes, base + 4, record.value);
    u32(bytes, base + 8, record.size); bytes[base + 12] = (record.binding << 4) | record.type;
    u16(bytes, base + 14, record.sectionIndex ?? 1);
  });
  const hash = Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex');
  const supported = { schema: AVR_ALLOCATOR_PROVENANCE_SCHEMA, state: 'supported', reason: null,
    elfSha256: hash, allocator: AVR_ALLOCATOR_ID, archiveSha256: AVR_ALLOCATOR_ARCHIVE_SHA256,
    member: AVR_ALLOCATOR_MEMBER, memberSha256: AVR_ALLOCATOR_MEMBER_SHA256,
    symbols: [...AVR_ALLOCATOR_SYMBOLS] };
  return { elfBase64: Buffer.from(bytes).toString('base64'), elfSha256: hash,
    allocatorProvenance: provenance === 'supported' ? supported : provenance };
}

function write16(memory, address, value) {
  memory[address] = value & 0xff;
  memory[address + 1] = value >> 8;
}

async function savedArtifact(bytes) {
  const elfSha256 = Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex');
  return { elfBase64: Buffer.from(bytes).toString('base64'), elfSha256,
    allocatorProvenance: { schema: AVR_ALLOCATOR_PROVENANCE_SCHEMA, state: 'supported', reason: null,
      elfSha256, allocator: AVR_ALLOCATOR_ID, archiveSha256: AVR_ALLOCATOR_ARCHIVE_SHA256,
      member: AVR_ALLOCATOR_MEMBER, memberSha256: AVR_ALLOCATOR_MEMBER_SHA256,
      symbols: [...AVR_ALLOCATOR_SYMBOLS] } };
}

function savedSymbolOffset(bytes, expectedName) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectionOffset = view.getUint32(32, true); const sectionBytes = view.getUint16(46, true);
  const sectionCount = view.getUint16(48, true); const sections = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const offset = sectionOffset + index * sectionBytes;
    sections.push({ type: view.getUint32(offset + 4, true), offset: view.getUint32(offset + 16, true),
      size: view.getUint32(offset + 20, true), link: view.getUint32(offset + 24, true),
      entryBytes: view.getUint32(offset + 36, true) });
  }
  for (const table of sections.filter(({ type }) => type === 2)) {
    const strings = sections[table.link];
    for (let cursor = table.offset; cursor < table.offset + table.size; cursor += table.entryBytes) {
      const nameStart = strings.offset + view.getUint32(cursor, true); let nameEnd = nameStart;
      while (bytes[nameEnd] !== 0) nameEnd += 1;
      if (Buffer.from(bytes.subarray(nameStart, nameEnd)).toString('utf8') === expectedName) return cursor;
    }
  }
  throw new Error(`SAVED_ELF_SYMBOL_MISSING:${expectedName}`);
}

test('strict ELF parser binds the exact avr-libc allocator symbol set to artifact and model identities', async () => {
  const parsed = validateX43AvrHeapSymbols(await parseX43AvrHeapSymbols(await fixture(), binding, webcrypto));
  assert.equal(parsed.state, 'supported');
  assert.equal(parsed.allocator, X43_AVR_HEAP_ALLOCATOR);
  assert.deepEqual(parsed.symbols, { staticHeapStart: 0x0180, brkvalAddress: 0x0110,
    freeListAddress: 0x0112, heapStartAddress: 0x0114, heapEndAddress: 0x0116,
    marginAddress: 0x0118 });
  assert.equal(parsed.artifactIdentity, binding.artifactIdentity);
  assert.equal(parsed.modelImplementationSha256, binding.modelImplementationSha256);
});

test('saved native ELF proves the real linker boundary and supports synthetic-memory sampling offline', async () => {
  const encoded = (await readFile(new URL('./fixtures/x43-avr-heap-native-6b708a11.elf.base64',
    import.meta.url), 'utf8')).trim();
  const allocatorProvenance = { schema: AVR_ALLOCATOR_PROVENANCE_SCHEMA, state: 'supported', reason: null,
    elfSha256: '6b708a11e4687be346885158a410e232b6085548bdf888126af077169eed7f33',
    allocator: AVR_ALLOCATOR_ID, archiveSha256: AVR_ALLOCATOR_ARCHIVE_SHA256,
    member: AVR_ALLOCATOR_MEMBER, memberSha256: AVR_ALLOCATOR_MEMBER_SHA256,
    symbols: [...AVR_ALLOCATOR_SYMBOLS] };
  const parsed = await parseX43AvrHeapSymbols({ elfBase64: encoded,
    elfSha256: allocatorProvenance.elfSha256, allocatorProvenance }, binding, webcrypto);
  assert.equal(parsed.state, 'supported');
  assert.deepEqual(parsed.symbols, { staticHeapStart: 0x0116, brkvalAddress: 0x0112,
    freeListAddress: 0x0114, heapStartAddress: 0x0102, heapEndAddress: 0x0100,
    marginAddress: 0x0104 });
  const memory = new Uint8Array(0x900);
  write16(memory, 0x0102, 0x0116); write16(memory, 0x0100, 0);
  write16(memory, 0x0104, 128); write16(memory, 0x0112, 0); write16(memory, 0x0114, 0);
  const sample = sampleX43AvrHeapFrontier(parsed, memory,
    { pointer: 0x08e0, cycle: 1, instructions: 1 }, 'saved-elf-synthetic-memory');
  assert.equal(sample.frontier, 0x0116);
  assert.equal(sample.semantics.measuresAllocatorFrontier, true);
  assert.equal(sample.semantics.measuresLiveOrUsedHeapBytes, false);
});

test('saved native ELF rejects altered boundary symbols and writable load authority', async () => {
  const encoded = (await readFile(new URL('./fixtures/x43-avr-heap-native-6b708a11.elf.base64',
    import.meta.url), 'utf8')).trim();
  const source = Uint8Array.from(Buffer.from(encoded, 'base64'));
  const changedHeapStart = source.slice();
  u32(changedHeapStart, savedSymbolOffset(changedHeapStart, '__heap_start') + 4, 0x800115);
  const undefinedEnd = source.slice();
  u16(undefinedEnd, savedSymbolOffset(undefinedEnd, '_end') + 14, 0);
  const customAllocatedEnd = source.slice();
  u16(customAllocatedEnd, savedSymbolOffset(customAllocatedEnd, '_end') + 14, 1);
  const shortenedBss = source.slice();
  const shortenedView = new DataView(shortenedBss.buffer); const programs = shortenedView.getUint32(28, true);
  u32(shortenedBss, programs + 2 * 32 + 20, 0x0f);
  const executableWritable = source.slice();
  const executableView = new DataView(executableWritable.buffer);
  u32(executableWritable, executableView.getUint32(28, true) + 24, 7);
  for (const bytes of [changedHeapStart, undefinedEnd, customAllocatedEnd,
    shortenedBss, executableWritable]) {
    assert.equal((await parseX43AvrHeapSymbols(await savedArtifact(bytes), binding, webcrypto)).reason,
      'allocator-elf-static-end-invalid');
  }
});

test('missing or malformed allocator ELF proof is unavailable without becoming build authority', async () => {
  const unavailable = await parseX43AvrHeapSymbols(await fixture(records.filter(
    ({ name }) => !['malloc', 'free', '__brkval', '__flp', '__malloc_heap_start',
      '__malloc_heap_end', '__malloc_margin'].includes(name))), binding, webcrypto);
  assert.equal(unavailable.state, 'unavailable');
  assert.equal(unavailable.reason, 'allocator-elf-symbol-set-mismatch');
  assert.equal((await parseX43AvrHeapSymbols(await fixture([...records,
    { ...records[1] }]), binding, webcrypto)).reason, 'allocator-elf-symbol-set-mismatch');
  const malformed = await parseX43AvrHeapSymbols(await fixture(records.map((record) =>
    record.name === '__brkval' ? { ...record, type: 2 } : record)), binding, webcrypto);
  assert.equal(malformed.reason, 'allocator-elf-object-proof-invalid');
});

test('names alone, unknown provenance, object overlap, SRAM-end and section mismatch stay unavailable', async () => {
  const namesOnly = await fixture(records, null);
  assert.equal((await parseX43AvrHeapSymbols(namesOnly, binding, webcrypto)).reason,
    'allocator-provenance-missing');
  const unknown = await fixture(records, 'supported');
  unknown.allocatorProvenance = { ...unknown.allocatorProvenance, allocator: 'project-malloc@1' };
  assert.equal((await parseX43AvrHeapSymbols(unknown, binding, webcrypto)).reason,
    'allocator-provenance-untrusted');
  const overlap = records.map((record) => record.name === '__flp'
    ? { ...record, value: 0x800111 } : record);
  assert.equal((await parseX43AvrHeapSymbols(await fixture(overlap), binding, webcrypto)).reason,
    'allocator-elf-object-overlap');
  const endOfSram = records.map((record) => record.name === '__brkval'
    ? { ...record, value: 0x8008ff } : record);
  assert.equal((await parseX43AvrHeapSymbols(await fixture(endOfSram), binding, webcrypto)).reason,
    'allocator-elf-object-proof-invalid');
  const sectionMismatch = records.map((record) => record.name === 'malloc'
    ? { ...record, sectionIndex: 2 } : record);
  assert.equal((await parseX43AvrHeapSymbols(await fixture(sectionMismatch), binding, webcrypto)).reason,
    'allocator-elf-function-proof-invalid');
  for (const changed of [
    records.map((record) => record.name === '__heap_start' ? { ...record, value: 0x80017f } : record),
    records.map((record) => record.name === '_end' ? { ...record, binding: 2 } : record),
    records.map((record) => record.name === '__heap_start' ? { ...record, sectionIndex: 0 } : record),
  ]) {
    assert.equal((await parseX43AvrHeapSymbols(await fixture(changed), binding, webcrypto)).reason,
      'allocator-elf-static-end-invalid');
  }
  const programVectors = [
    [{ type: 1, offset: 0, virtualAddress: 0x800101, fileBytes: 0, memoryBytes: 0x7f, flags: 6 }],
    [{ type: 1, offset: 0, virtualAddress: 0x800100, fileBytes: 0, memoryBytes: 0x7f, flags: 6 }],
    [{ type: 1, offset: 0, virtualAddress: 0x800100, fileBytes: 0, memoryBytes: 0x80, flags: 7 }],
    [{ type: 1, offset: 0, virtualAddress: 0x800100, fileBytes: 0x81, memoryBytes: 0x80, flags: 6 }],
    [
      { type: 1, offset: 0, virtualAddress: 0x800100, fileBytes: 0, memoryBytes: 0x20, flags: 6 },
      { type: 1, offset: 0, virtualAddress: 0x800121, fileBytes: 0, memoryBytes: 0x5f, flags: 6 },
    ],
    [{ type: 1, offset: 0, virtualAddress: 0x800100, fileBytes: 0, memoryBytes: 0x800, flags: 6 }],
  ];
  for (const programs of programVectors) {
    assert.equal((await parseX43AvrHeapSymbols(
      await fixture(records, 'supported', programs), binding, webcrypto)).reason,
    'allocator-elf-static-end-invalid');
  }
  const invalidProfile = structuredClone(await parseX43AvrHeapSymbols(await fixture(), binding, webcrypto));
  invalidProfile.symbols.brkvalAddress = 0x08ff;
  assert.throws(() => validateX43AvrHeapSymbols(invalidProfile), { code: 'X43_HEAP_SYMBOL_PROFILE_INVALID' });
});

test('one explicit fixed-address sample reports frontier-to-SP address gap without free-memory claims', async () => {
  const profile = await parseX43AvrHeapSymbols(await fixture(), binding, webcrypto);
  const memory = new Uint8Array(0x900);
  write16(memory, 0x0114, 0x0180); write16(memory, 0x0116, 0);
  write16(memory, 0x0118, 128); write16(memory, 0x0110, 0x01c0); write16(memory, 0x0112, 0x0190);
  const sampled = validateX43AvrHeapSample(sampleX43AvrHeapFrontier(profile, memory,
    { pointer: 0x08e0, cycle: 400, instructions: 200 }, 'heap-sample-1'));
  assert.equal(sampled.frontier, 0x01c0);
  assert.equal(sampled.frontierToStackAddressGapBytes, 0x08e0 - 0x01c0);
  assert.equal(sampled.relation, 'separated');
  assert.equal(sampled.freeListState, 'present-not-inspected');
  assert.equal(sampled.semantics.measuresAllocatorFrontier, true);
  assert.equal(sampled.semantics.measuresLiveOrUsedHeapBytes, false);
  assert.equal(sampled.semantics.measuresFragmentation, false);
  assert.equal(sampled.semantics.measuresFreeSram, false);
  assert.equal(sampled.semantics.measuresAllocatableRam, false);
  assert.equal(sampled.semantics.provesNoStackCollision, false);
});

test('runtime samples heap only on explicit request and reset clears the retained sample', async () => {
  const profile = await parseX43AvrHeapSymbols(await fixture(), binding, webcrypto);
  const runtime = new RuntimeKernel(':00000001FF', DEFAULT_CIRCUIT, { x43HeapProfile: profile });
  write16(runtime.adapter.cpu.data, 0x0114, 0x0180); write16(runtime.adapter.cpu.data, 0x0116, 0);
  write16(runtime.adapter.cpu.data, 0x0118, 128); write16(runtime.adapter.cpu.data, 0x0110, 0);
  write16(runtime.adapter.cpu.data, 0x0112, 0);
  assert.equal(runtime.snapshot().x43Heap, null);
  const sampled = runtime.sampleX43HeapFrontier('runtime-heap-sample').x43Heap;
  assert.equal(sampled.frontier, 0x0180);
  assert.equal(sampled.allocatorExtended, false);
  assert.equal(runtime.snapshot().x43Heap.token, 'runtime-heap-sample');
  assert.equal(runtime.reset().x43Heap, null);
});
