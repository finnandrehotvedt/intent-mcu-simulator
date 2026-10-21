// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { RuntimeKernel } from '../src/runtime-kernel.mjs';
import {
  X43_AVR_HEAP_ALLOCATOR, parseX43AvrHeapSymbols, sampleX43AvrHeapFrontier,
  validateX43AvrHeapSample, validateX43AvrHeapSymbols,
} from '../src/x43-avr-heap-profile.mjs';

const binding = { artifactIdentity: 'a'.repeat(64), modelImplementationSha256: 'b'.repeat(64),
  modelExecutionContextSha256: 'c'.repeat(64) };
const records = [
  { name: '_end', value: 0x800180, size: 0, binding: 1, type: 0 },
  { name: '__brkval', value: 0x800110, size: 2, binding: 1, type: 1 },
  { name: '__flp', value: 0x800112, size: 2, binding: 1, type: 1 },
  { name: '__malloc_heap_start', value: 0x800114, size: 2, binding: 1, type: 1 },
  { name: '__malloc_heap_end', value: 0x800116, size: 2, binding: 1, type: 1 },
  { name: '__malloc_margin', value: 0x800118, size: 2, binding: 1, type: 1 },
  { name: 'malloc', value: 0x100, size: 48, binding: 1, type: 2 },
  { name: 'free', value: 0x140, size: 32, binding: 1, type: 2 },
];

function u32(bytes, offset, value) { new DataView(bytes.buffer).setUint32(offset, value, true); }
function u16(bytes, offset, value) { new DataView(bytes.buffer).setUint16(offset, value, true); }

async function fixture(symbols = records) {
  const names = [''].concat([...new Set(symbols.map(({ name }) => name))]);
  const offsets = new Map();
  const strings = [];
  for (const name of names) {
    offsets.set(name, strings.length);
    strings.push(...Buffer.from(name, 'utf8'), 0);
  }
  const sectionOffset = 52;
  const stringOffset = sectionOffset + 4 * 40;
  const symbolOffset = stringOffset + strings.length;
  const bytes = new Uint8Array(symbolOffset + (symbols.length + 1) * 16);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1], 0);
  u16(bytes, 18, 83); u32(bytes, 32, sectionOffset); u16(bytes, 46, 40); u16(bytes, 48, 4);
  const section = (index, { type, address = 0, offset = 0, size = 0, link = 0, entryBytes = 0 }) => {
    const base = sectionOffset + index * 40;
    u32(bytes, base + 4, type); u32(bytes, base + 12, address); u32(bytes, base + 16, offset);
    u32(bytes, base + 20, size); u32(bytes, base + 24, link); u32(bytes, base + 36, entryBytes);
  };
  section(1, { type: 1, address: 0, size: 0x800900 });
  section(2, { type: 3, offset: stringOffset, size: strings.length });
  section(3, { type: 2, offset: symbolOffset, size: (symbols.length + 1) * 16, link: 2, entryBytes: 16 });
  bytes.set(strings, stringOffset);
  symbols.forEach((record, index) => {
    const base = symbolOffset + (index + 1) * 16;
    u32(bytes, base, offsets.get(record.name)); u32(bytes, base + 4, record.value);
    u32(bytes, base + 8, record.size); bytes[base + 12] = (record.binding << 4) | record.type;
    u16(bytes, base + 14, 1);
  });
  const hash = Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex');
  return { elfBase64: Buffer.from(bytes).toString('base64'), elfSha256: hash };
}

function write16(memory, address, value) {
  memory[address] = value & 0xff;
  memory[address + 1] = value >> 8;
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

test('missing allocator linkage is unavailable while malformed present authority rejects', async () => {
  const unavailable = await parseX43AvrHeapSymbols(await fixture(records.filter(
    ({ name }) => !['malloc', 'free', '__brkval', '__flp', '__malloc_heap_start',
      '__malloc_heap_end', '__malloc_margin'].includes(name))), binding, webcrypto);
  assert.equal(unavailable.state, 'unavailable');
  assert.equal(unavailable.reason, 'avr-libc-allocator-symbol-set-not-linked');
  await assert.rejects(parseX43AvrHeapSymbols(await fixture([...records,
    { ...records[1] }]), binding, webcrypto), { code: 'X43_HEAP_ELF_SYMBOL_DUPLICATE' });
  await assert.rejects(parseX43AvrHeapSymbols(await fixture(records.map((record) =>
    record.name === '__brkval' ? { ...record, type: 2 } : record)), binding, webcrypto),
  { code: 'X43_HEAP_ELF_ALLOCATOR_OBJECT_INVALID' });
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
