// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  AVR_ALLOCATOR_ID, normalizeAvrAllocatorProvenance,
} from '../compiler/avr-allocator-provenance.mjs';

export const X43_AVR_HEAP_SYMBOL_SCHEMA = 'intent-mcu-x43-avr-heap-symbols@1';
export const X43_AVR_HEAP_SAMPLE_SCHEMA = 'intent-mcu-x43-avr-heap-frontier-sample@1';
export const X43_AVR_HEAP_ALLOCATOR = AVR_ALLOCATOR_ID;

const HEADER_BYTES = 52;
const PROGRAM_BYTES = 32;
const SECTION_BYTES = 40;
const SYMBOL_BYTES = 16;
const AVR_MACHINE = 83;
const PT_LOAD = 1;
const PF_READ_WRITE = 6;
const SHT_SYMTAB = 2;
const STB_GLOBAL = 1;
const STT_NOTYPE = 0;
const STT_OBJECT = 1;
const STT_FUNC = 2;
const SHN_UNDEF = 0;
const DATA_MARKER = 0x800000;
const SRAM_START = 0x0100;
const RAMEND = 0x08ff;
const HASH = /^[a-f0-9]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const REQUIRED = Object.freeze([
  '_end', '__heap_start', '__brkval', '__flp', '__malloc_heap_start', '__malloc_heap_end',
  '__malloc_margin', 'malloc', 'free',
]);

function reject(code) { throw Object.assign(new Error(code), { code }); }
function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}
function bounded(offset, length, total) {
  return Number.isSafeInteger(offset) && Number.isSafeInteger(length)
    && offset >= 0 && length >= 0 && offset <= total && length <= total - offset;
}
function decode(value) {
  if (typeof value !== 'string' || !value || value.length % 4) reject('X43_HEAP_ELF_BASE64_INVALID');
  let binary;
  try { binary = atob(value); } catch { reject('X43_HEAP_ELF_BASE64_INVALID'); }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length < HEADER_BYTES) reject('X43_HEAP_ELF_HEADER_INVALID');
  return bytes;
}
async function digest(bytes, cryptoImpl) {
  if (!cryptoImpl?.subtle) reject('X43_HEAP_CRYPTO_UNAVAILABLE');
  const value = await cryptoImpl.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function stringAt(bytes, offset, end) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= end) reject('X43_HEAP_ELF_STRING_OFFSET_INVALID');
  let cursor = offset;
  while (cursor < end && bytes[cursor] !== 0) cursor += 1;
  if (cursor >= end) reject('X43_HEAP_ELF_STRING_UNTERMINATED');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset, cursor)); }
  catch { return reject('X43_HEAP_ELF_STRING_INVALID'); }
}
function dataAddress(symbol, size, code) {
  if (symbol.value < DATA_MARKER) reject(code);
  const address = symbol.value - DATA_MARKER;
  if (address < SRAM_START || address > RAMEND || size < 0 || address + size - 1 > RAMEND) reject(code);
  return address;
}
function symbolInSection(symbol, sections, allowEnd = false) {
  const section = sections[symbol.sectionIndex];
  if (!section || !Number.isSafeInteger(section.address) || !Number.isSafeInteger(section.size)) return false;
  const end = section.address + section.size;
  const symbolEnd = symbol.value + symbol.size;
  return Number.isSafeInteger(end) && Number.isSafeInteger(symbolEnd)
    && symbol.value >= section.address
    && (allowEnd && symbol.size === 0 ? symbol.value <= end : symbolEnd <= end);
}
function staticHeapBoundary(symbol, programs, bytesLength, sections) {
  const boundaries = [symbol._end, symbol.__heap_start];
  if (boundaries.some((item) => item.binding !== STB_GLOBAL || item.type !== STT_NOTYPE
      || item.other !== 0 || item.size !== 0 || item.sectionIndex === SHN_UNDEF
      || item.sectionIndex >= sections.length || item.value < DATA_MARKER + SRAM_START
      || item.value - DATA_MARKER > RAMEND)) return null;
  const associatedSection = sections[boundaries[0].sectionIndex];
  if (boundaries[1].sectionIndex !== boundaries[0].sectionIndex
      || !associatedSection || (associatedSection.flags & 2) !== 0) return null;
  const writableLoads = programs.filter((program) => program.type === PT_LOAD
    && (program.flags & 2) !== 0).sort((left, right) => left.virtualAddress - right.virtualAddress);
  if (!writableLoads.length || writableLoads.some((program) => program.flags !== PF_READ_WRITE
      || program.memoryBytes < 1 || program.fileBytes > program.memoryBytes
      || !bounded(program.offset, program.fileBytes, bytesLength)
      || program.virtualAddress < DATA_MARKER + SRAM_START
      || !Number.isSafeInteger(program.virtualAddress + program.memoryBytes)
      || program.virtualAddress + program.memoryBytes > DATA_MARKER + RAMEND + 1)) return null;
  if (writableLoads[0].virtualAddress !== DATA_MARKER + SRAM_START
      || writableLoads.some((program, index) => index > 0
        && program.virtualAddress !== writableLoads[index - 1].virtualAddress
          + writableLoads[index - 1].memoryBytes)) return null;
  const exactEnd = writableLoads.at(-1).virtualAddress + writableLoads.at(-1).memoryBytes;
  if (boundaries.some((item) => item.value !== exactEnd)) return null;
  return exactEnd - DATA_MARKER;
}
function binding(value) {
  if (!exactKeys(value, ['artifactIdentity', 'modelImplementationSha256', 'modelExecutionContextSha256'])
      || !HASH.test(value.artifactIdentity ?? '') || !HASH.test(value.modelImplementationSha256 ?? '')
      || !HASH.test(value.modelExecutionContextSha256 ?? '')) reject('X43_HEAP_BINDING_INVALID');
  return structuredClone(value);
}

export async function parseX43AvrHeapSymbols(artifact, rawBinding, cryptoImpl = globalThis.crypto) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)
      || !Object.keys(artifact).every((key) => ['elfBase64', 'elfSha256', 'allocatorProvenance'].includes(key))
      || !Object.hasOwn(artifact, 'elfBase64') || !Object.hasOwn(artifact, 'elfSha256')
      || !HASH.test(artifact.elfSha256 ?? '')
      || typeof artifact.elfBase64 !== 'string') reject('X43_HEAP_ELF_ARTIFACT_INVALID');
  const acceptedBinding = binding(rawBinding);
  const bytes = decode(artifact.elfBase64);
  if (await digest(bytes, cryptoImpl) !== artifact.elfSha256) reject('X43_HEAP_ELF_HASH_MISMATCH');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46
      || bytes[4] !== 1 || bytes[5] !== 1 || bytes[6] !== 1
      || view.getUint16(18, true) !== AVR_MACHINE) reject('X43_HEAP_ELF_HEADER_INVALID');
  const sectionOffset = view.getUint32(32, true);
  const programOffset = view.getUint32(28, true);
  const programEntryBytes = view.getUint16(42, true);
  const programCount = view.getUint16(44, true);
  if (programEntryBytes !== PROGRAM_BYTES || programCount < 1 || programCount > 128
      || !bounded(programOffset, programEntryBytes * programCount, bytes.length)) {
    reject('X43_HEAP_ELF_PROGRAM_TABLE_INVALID');
  }
  const programs = Array.from({ length: programCount }, (_, index) => {
    const offset = programOffset + index * programEntryBytes;
    return { type: view.getUint32(offset, true), offset: view.getUint32(offset + 4, true),
      virtualAddress: view.getUint32(offset + 8, true), fileBytes: view.getUint32(offset + 16, true),
      memoryBytes: view.getUint32(offset + 20, true), flags: view.getUint32(offset + 24, true) };
  });
  const sectionEntryBytes = view.getUint16(46, true);
  const sectionCount = view.getUint16(48, true);
  if (sectionEntryBytes !== SECTION_BYTES || sectionCount < 1 || sectionCount > 512
      || !bounded(sectionOffset, sectionEntryBytes * sectionCount, bytes.length)) {
    reject('X43_HEAP_ELF_SECTION_TABLE_INVALID');
  }
  const sections = Array.from({ length: sectionCount }, (_, index) => {
    const offset = sectionOffset + index * sectionEntryBytes;
    return { index, type: view.getUint32(offset + 4, true), flags: view.getUint32(offset + 8, true),
      address: view.getUint32(offset + 12, true),
      offset: view.getUint32(offset + 16, true), size: view.getUint32(offset + 20, true),
      link: view.getUint32(offset + 24, true), entryBytes: view.getUint32(offset + 36, true) };
  });
  const provenance = normalizeAvrAllocatorProvenance(
    artifact.allocatorProvenance, artifact.elfSha256,
  );
  const unavailable = (reason) => Object.freeze({ schema: X43_AVR_HEAP_SYMBOL_SCHEMA,
    state: 'unavailable', reason,
    artifactIdentity: acceptedBinding.artifactIdentity, elfSha256: artifact.elfSha256,
    modelImplementationSha256: acceptedBinding.modelImplementationSha256,
    modelExecutionContextSha256: acceptedBinding.modelExecutionContextSha256,
    allocator: null, provenance, symbols: null });
  if (provenance.state !== 'supported') return unavailable(provenance.reason);
  const matches = new Map(REQUIRED.map((name) => [name, []]));
  for (const table of sections.filter((section) => section.type === SHT_SYMTAB)) {
    if (table.entryBytes !== SYMBOL_BYTES || table.size % SYMBOL_BYTES
        || !bounded(table.offset, table.size, bytes.length) || table.link >= sections.length) {
      reject('X43_HEAP_ELF_SYMBOL_TABLE_INVALID');
    }
    const strings = sections[table.link];
    if (!bounded(strings.offset, strings.size, bytes.length)) reject('X43_HEAP_ELF_STRING_TABLE_INVALID');
    for (let cursor = table.offset; cursor < table.offset + table.size; cursor += SYMBOL_BYTES) {
      const nameOffset = view.getUint32(cursor, true);
      if (nameOffset >= strings.size) reject('X43_HEAP_ELF_STRING_OFFSET_INVALID');
      const name = stringAt(bytes, strings.offset + nameOffset, strings.offset + strings.size);
      if (!matches.has(name)) continue;
      matches.get(name).push({ name, value: view.getUint32(cursor + 4, true),
        size: view.getUint32(cursor + 8, true), binding: view.getUint8(cursor + 12) >> 4,
        type: view.getUint8(cursor + 12) & 0x0f, other: view.getUint8(cursor + 13),
        sectionIndex: view.getUint16(cursor + 14, true) });
    }
  }
  const missing = REQUIRED.filter((name) => matches.get(name).length === 0);
  if (missing.length) return unavailable('allocator-elf-symbol-set-mismatch');
  if (REQUIRED.some((name) => matches.get(name).length !== 1)) {
    return unavailable('allocator-elf-symbol-set-mismatch');
  }
  const symbol = Object.fromEntries(REQUIRED.map((name) => [name, matches.get(name)[0]]));
  const objects = ['__brkval', '__flp', '__malloc_heap_start', '__malloc_heap_end', '__malloc_margin'];
  for (const name of objects) {
    const item = symbol[name];
    if (item.binding !== STB_GLOBAL || item.type !== STT_OBJECT || item.other !== 0
        || item.sectionIndex === SHN_UNDEF || item.sectionIndex >= sections.length || item.size !== 2
        || !symbolInSection(item, sections) || item.value < DATA_MARKER + SRAM_START
        || item.value - DATA_MARKER + 1 > RAMEND) {
      return unavailable('allocator-elf-object-proof-invalid');
    }
  }
  for (const name of ['malloc', 'free']) {
    const item = symbol[name];
    if (item.binding !== STB_GLOBAL || item.type !== STT_FUNC || item.other !== 0
        || item.sectionIndex === SHN_UNDEF || item.sectionIndex >= sections.length || item.size < 1
        || !symbolInSection(item, sections)) {
      return unavailable('allocator-elf-function-proof-invalid');
    }
  }
  const staticHeapStart = staticHeapBoundary(symbol, programs, bytes.length, sections);
  if (staticHeapStart === null) {
    return unavailable('allocator-elf-static-end-invalid');
  }
  const addresses = Object.fromEntries(objects.map((name) => [name,
    dataAddress(symbol[name], symbol[name].size, 'X43_HEAP_ELF_ALLOCATOR_OBJECT_SRAM_BOUNDS')]));
  const ranges = Object.values(addresses).map((start) => ({ start, end: start + 2 }));
  if (ranges.some((range, index) => ranges.some((other, otherIndex) => index !== otherIndex
      && range.start < other.end && other.start < range.end))) {
    return unavailable('allocator-elf-object-overlap');
  }
  if (ranges.some(({ end }) => end > staticHeapStart)) {
    return unavailable('allocator-elf-static-boundary-invalid');
  }
  return Object.freeze({ schema: X43_AVR_HEAP_SYMBOL_SCHEMA, state: 'supported', reason: null,
    artifactIdentity: acceptedBinding.artifactIdentity, elfSha256: artifact.elfSha256,
    modelImplementationSha256: acceptedBinding.modelImplementationSha256,
    modelExecutionContextSha256: acceptedBinding.modelExecutionContextSha256,
    allocator: X43_AVR_HEAP_ALLOCATOR, provenance,
    symbols: Object.freeze({ staticHeapStart, brkvalAddress: addresses.__brkval,
      freeListAddress: addresses.__flp, heapStartAddress: addresses.__malloc_heap_start,
      heapEndAddress: addresses.__malloc_heap_end, marginAddress: addresses.__malloc_margin }) });
}

export function validateX43AvrHeapSymbols(value) {
  if (!exactKeys(value, ['schema', 'state', 'reason', 'artifactIdentity', 'elfSha256',
    'modelImplementationSha256', 'modelExecutionContextSha256', 'allocator', 'provenance', 'symbols'])
      || value.schema !== X43_AVR_HEAP_SYMBOL_SCHEMA || !['supported', 'unavailable'].includes(value.state)
      || !HASH.test(value.artifactIdentity ?? '') || !HASH.test(value.elfSha256 ?? '')
      || !HASH.test(value.modelImplementationSha256 ?? '')
      || !HASH.test(value.modelExecutionContextSha256 ?? '')) reject('X43_HEAP_SYMBOL_PROFILE_INVALID');
  const provenance = normalizeAvrAllocatorProvenance(value.provenance, value.elfSha256);
  if (JSON.stringify(provenance) !== JSON.stringify(value.provenance)) {
    reject('X43_HEAP_SYMBOL_PROFILE_INVALID');
  }
  if (value.state === 'unavailable') {
    if (typeof value.reason !== 'string' || value.allocator !== null || value.symbols !== null) {
      reject('X43_HEAP_SYMBOL_PROFILE_INVALID');
    }
    return structuredClone(value);
  }
  if (value.reason !== null || value.allocator !== X43_AVR_HEAP_ALLOCATOR
      || provenance.state !== 'supported'
      || !exactKeys(value.symbols, ['staticHeapStart', 'brkvalAddress', 'freeListAddress',
        'heapStartAddress', 'heapEndAddress', 'marginAddress'])
      || !Number.isInteger(value.symbols.staticHeapStart)
      || value.symbols.staticHeapStart < SRAM_START || value.symbols.staticHeapStart > RAMEND
      || ['brkvalAddress', 'freeListAddress', 'heapStartAddress', 'heapEndAddress', 'marginAddress']
        .some((key) => !Number.isInteger(value.symbols[key])
          || value.symbols[key] < SRAM_START || value.symbols[key] + 1 > RAMEND)) {
    reject('X43_HEAP_SYMBOL_PROFILE_INVALID');
  }
  const objectStarts = ['brkvalAddress', 'freeListAddress', 'heapStartAddress',
    'heapEndAddress', 'marginAddress'].map((key) => value.symbols[key]);
  if (objectStarts.some((start, index) => objectStarts.some((other, otherIndex) =>
    index !== otherIndex && start < other + 2 && other < start + 2))
      || objectStarts.some((start) => start + 2 > value.symbols.staticHeapStart)) {
    reject('X43_HEAP_SYMBOL_PROFILE_INVALID');
  }
  return structuredClone(value);
}

function readUint16(memory, address) {
  if (!(memory instanceof Uint8Array) || address < 0 || address + 1 >= memory.length) {
    reject('X43_HEAP_MEMORY_BOUNDS');
  }
  return memory[address] | (memory[address + 1] << 8);
}

export function sampleX43AvrHeapFrontier(profileValue, memory, point, token) {
  const profile = validateX43AvrHeapSymbols(profileValue);
  if (profile.state !== 'supported') reject('X43_HEAP_ALLOCATOR_UNAVAILABLE');
  if (!TOKEN.test(token ?? '') || !exactKeys(point, ['pointer', 'cycle', 'instructions'])
      || !Number.isInteger(point.pointer) || point.pointer < SRAM_START || point.pointer > RAMEND
      || !Number.isSafeInteger(point.cycle) || point.cycle < 0
      || !Number.isSafeInteger(point.instructions) || point.instructions < 0) {
    reject('X43_HEAP_SAMPLE_REQUEST_INVALID');
  }
  const symbols = profile.symbols;
  const heapStart = readUint16(memory, symbols.heapStartAddress);
  const configuredHeapEnd = readUint16(memory, symbols.heapEndAddress);
  const allocatorMarginBytes = readUint16(memory, symbols.marginAddress);
  const rawBreak = readUint16(memory, symbols.brkvalAddress);
  const freeListPointer = readUint16(memory, symbols.freeListAddress);
  if (heapStart < symbols.staticHeapStart || heapStart > RAMEND
      || (configuredHeapEnd !== 0 && (configuredHeapEnd < heapStart || configuredHeapEnd > RAMEND))
      || (rawBreak !== 0 && (rawBreak < heapStart || rawBreak > RAMEND))
      || (freeListPointer !== 0 && (freeListPointer < heapStart || freeListPointer > RAMEND))) {
    reject('X43_HEAP_RUNTIME_POINTER_INVALID');
  }
  const frontier = rawBreak || heapStart;
  const relation = point.pointer > frontier ? 'separated'
    : point.pointer === frontier ? 'touching' : 'overlap-observed';
  return Object.freeze({ schema: X43_AVR_HEAP_SAMPLE_SCHEMA, token,
    artifactIdentity: profile.artifactIdentity, elfSha256: profile.elfSha256,
    modelImplementationSha256: profile.modelImplementationSha256,
    modelExecutionContextSha256: profile.modelExecutionContextSha256,
    allocator: profile.allocator, cycle: point.cycle, instructions: point.instructions,
    stackPointer: point.pointer, staticHeapStart: symbols.staticHeapStart,
    configuredHeapStart: heapStart, configuredHeapEnd: configuredHeapEnd || null,
    allocatorMarginBytes, allocatorExtended: rawBreak !== 0,
    frontier, frontierToStackAddressGapBytes: Math.max(0, point.pointer - frontier), relation,
    freeListState: freeListPointer === 0 ? 'none-observed' : 'present-not-inspected',
    semantics: Object.freeze({ measuresAllocatorFrontier: true, measuresHeapContents: false,
      measuresLiveOrUsedHeapBytes: false, measuresFragmentation: false,
      measuresFreeSram: false, measuresAllocatableRam: false,
      provesNoStackCollision: false, physicalHardwareBenchmark: false }) });
}

export function validateX43AvrHeapSample(value) {
  if (!exactKeys(value, ['schema', 'token', 'artifactIdentity', 'elfSha256',
    'modelImplementationSha256', 'modelExecutionContextSha256', 'allocator', 'cycle',
    'instructions', 'stackPointer', 'staticHeapStart', 'configuredHeapStart',
    'configuredHeapEnd', 'allocatorMarginBytes', 'allocatorExtended', 'frontier',
    'frontierToStackAddressGapBytes', 'relation', 'freeListState', 'semantics'])
      || value.schema !== X43_AVR_HEAP_SAMPLE_SCHEMA || !TOKEN.test(value.token ?? '')
      || !HASH.test(value.artifactIdentity ?? '') || !HASH.test(value.elfSha256 ?? '')
      || !HASH.test(value.modelImplementationSha256 ?? '')
      || !HASH.test(value.modelExecutionContextSha256 ?? '')
      || value.allocator !== X43_AVR_HEAP_ALLOCATOR
      || !Number.isSafeInteger(value.cycle) || value.cycle < 0
      || !Number.isSafeInteger(value.instructions) || value.instructions < 0
      || !Number.isInteger(value.stackPointer) || value.stackPointer < SRAM_START || value.stackPointer > RAMEND
      || !Number.isInteger(value.staticHeapStart) || value.staticHeapStart < SRAM_START
      || value.staticHeapStart > RAMEND
      || !Number.isInteger(value.configuredHeapStart) || value.configuredHeapStart < value.staticHeapStart
      || value.configuredHeapStart > RAMEND
      || (value.configuredHeapEnd !== null && (!Number.isInteger(value.configuredHeapEnd)
        || value.configuredHeapEnd < value.configuredHeapStart || value.configuredHeapEnd > RAMEND))
      || !Number.isInteger(value.allocatorMarginBytes) || value.allocatorMarginBytes < 0
      || typeof value.allocatorExtended !== 'boolean'
      || !Number.isInteger(value.frontier) || value.frontier < value.configuredHeapStart
      || value.frontier > RAMEND
      || value.frontierToStackAddressGapBytes !== Math.max(0, value.stackPointer - value.frontier)
      || !['separated', 'touching', 'overlap-observed'].includes(value.relation)
      || !['none-observed', 'present-not-inspected'].includes(value.freeListState)
      || !exactKeys(value.semantics, ['measuresAllocatorFrontier', 'measuresHeapContents',
        'measuresLiveOrUsedHeapBytes', 'measuresFragmentation', 'measuresFreeSram',
        'measuresAllocatableRam', 'provesNoStackCollision', 'physicalHardwareBenchmark'])
      || value.semantics.measuresAllocatorFrontier !== true
      || Object.entries(value.semantics).some(([key, flag]) => key !== 'measuresAllocatorFrontier' && flag !== false)) {
    reject('X43_HEAP_SAMPLE_INVALID');
  }
  return structuredClone(value);
}
