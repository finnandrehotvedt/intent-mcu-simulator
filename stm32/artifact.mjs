// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';

export const STM32F429_FIRMWARE_ARTIFACT_SCHEMA =
  'intent-mcu-stm32f429-firmware-artifact@1';
export const STM32F429_PROFILE = 'board.stm32f429zi-nucleo144-v1';

export const STM32F429_SUPPORTED_MEMORY_MAP = Object.freeze({
  id: 'stm32f429zi-private-flash-sram-v1',
  flash: Object.freeze({ start: 0x08000000, end: 0x08200000, bytes: 2 * 1024 * 1024 }),
  sram: Object.freeze({ start: 0x20000000, end: 0x20030000, bytes: 192 * 1024 }),
});

export const STM32F429_FIRMWARE_LIMITS = Object.freeze({
  maxContainerBytes: 48 * 1024,
  maxLoadSegments: 8,
  maxLoadedBytes: 512 * 1024,
});

export const STM32F429_FIRMWARE_ERROR_CODES = Object.freeze([
  'FIRMWARE_INPUT_INVALID',
  'FIRMWARE_PROFILE_INVALID',
  'FIRMWARE_SIZE_INVALID',
  'FIRMWARE_FORMAT_UNSUPPORTED',
  'FIRMWARE_HASH_MISMATCH',
  'FIRMWARE_ELF_HEADER_INVALID',
  'FIRMWARE_ELF_ARCH_INVALID',
  'FIRMWARE_ELF_FLAGS_UNSUPPORTED',
  'FIRMWARE_ELF_PROGRAM_TYPE_UNSUPPORTED',
  'FIRMWARE_SEGMENT_INVALID',
  'FIRMWARE_ADDRESS_OUT_OF_RANGE',
  'FIRMWARE_SEGMENT_OVERLAP',
  'FIRMWARE_VECTOR_INVALID',
  'FIRMWARE_ENTRYPOINT_INVALID',
]);

const SHA256 = /^[0-9a-f]{64}$/u;
const ELF_HEADER_BYTES = 52;
const ELF_PROGRAM_HEADER_BYTES = 32;
const ELF_MACHINE_ARM = 40;
const ELF_EABI5 = 0x05000000;
const ELF_EABI5_SOFT_FLOAT = 0x05000200;

export class Stm32F429FirmwareArtifactError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'Stm32F429FirmwareArtifactError';
    this.code = code;
  }
}

function fail(code, detail = '') {
  throw new Stm32F429FirmwareArtifactError(code, detail);
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)
    || ArrayBuffer.isView(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function checkedRange(start, size, code = 'FIRMWARE_SEGMENT_INVALID') {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(size) || start < 0 || size < 1) {
    fail(code, 'invalid range');
  }
  const end = start + size;
  if (!Number.isSafeInteger(end) || end > 0x1_0000_0000 || end <= start) {
    fail(code, 'range overflow');
  }
  return { start, end };
}

function checkedFileRange(offset, size, containerBytes, code) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 1) {
    fail(code, 'invalid file range');
  }
  const end = offset + size;
  if (!Number.isSafeInteger(end) || end > containerBytes || end <= offset) {
    fail(code, 'truncated file range');
  }
  return { start: offset, end };
}

function memoryRegion(address, bytes) {
  const range = checkedRange(address, bytes, 'FIRMWARE_ADDRESS_OUT_OF_RANGE');
  for (const [region, map] of Object.entries(STM32F429_SUPPORTED_MEMORY_MAP)) {
    if (region === 'id') continue;
    if (range.start >= map.start && range.end <= map.end) return { region, ...range };
  }
  fail('FIRMWARE_ADDRESS_OUT_OF_RANGE', `0x${address.toString(16)}+${bytes}`);
}

function assertNoOverlap(ranges, code = 'FIRMWARE_SEGMENT_OVERLAP') {
  const ordered = [...ranges].sort((left, right) => left.start - right.start
    || left.end - right.end);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].start < ordered[index - 1].end) fail(code, 'overlapping ranges');
  }
}

function powerOfTwo(value) {
  return value > 0 && (value & (value - 1)) === 0;
}

function parseElf(bytes, actualSha256) {
  if (bytes.byteLength < ELF_HEADER_BYTES) fail('FIRMWARE_SIZE_INVALID', 'truncated ELF header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46
    || bytes[4] !== 1 || bytes[5] !== 1 || bytes[6] !== 1 || bytes[7] !== 0
    || bytes.slice(8, 16).some((byte) => byte !== 0)) {
    fail('FIRMWARE_ELF_HEADER_INVALID', 'requires ELF32 little-endian SYSV');
  }
  const type = view.getUint16(16, true);
  const machine = view.getUint16(18, true);
  const version = view.getUint32(20, true);
  const rawEntryPoint = view.getUint32(24, true);
  const programOffset = view.getUint32(28, true);
  const sectionOffset = view.getUint32(32, true);
  const flags = view.getUint32(36, true);
  const headerBytes = view.getUint16(40, true);
  const programEntryBytes = view.getUint16(42, true);
  const programCount = view.getUint16(44, true);
  const sectionEntryBytes = view.getUint16(46, true);
  const sectionCount = view.getUint16(48, true);
  const sectionNames = view.getUint16(50, true);
  if (type !== 2 || version !== 1 || headerBytes !== ELF_HEADER_BYTES
    || programEntryBytes !== ELF_PROGRAM_HEADER_BYTES || programCount < 1
    || programCount > STM32F429_FIRMWARE_LIMITS.maxLoadSegments
    || programOffset < ELF_HEADER_BYTES) {
    fail('FIRMWARE_ELF_HEADER_INVALID', 'unsupported executable layout');
  }
  if (machine !== ELF_MACHINE_ARM) fail('FIRMWARE_ELF_ARCH_INVALID', `machine ${machine}`);
  if (![ELF_EABI5, ELF_EABI5_SOFT_FLOAT].includes(flags)) {
    fail('FIRMWARE_ELF_FLAGS_UNSUPPORTED', `0x${flags.toString(16)}`);
  }
  if (sectionOffset !== 0 || sectionEntryBytes !== 0 || sectionCount !== 0 || sectionNames !== 0) {
    fail('FIRMWARE_ELF_HEADER_INVALID', 'section tables are outside the private subset');
  }
  const programTable = checkedFileRange(
    programOffset,
    programCount * programEntryBytes,
    bytes.byteLength,
    'FIRMWARE_ELF_HEADER_INVALID',
  );

  const loadSegments = [];
  const fileRanges = [];
  const memoryRanges = [];
  let loadedBytes = 0;
  for (let index = 0; index < programCount; index += 1) {
    const offset = programOffset + index * programEntryBytes;
    const programType = view.getUint32(offset, true);
    if (programType !== 1) {
      fail('FIRMWARE_ELF_PROGRAM_TYPE_UNSUPPORTED', `program ${index} type ${programType}`);
    }
    const fileOffset = view.getUint32(offset + 4, true);
    const virtualAddress = view.getUint32(offset + 8, true);
    const physicalAddress = view.getUint32(offset + 12, true);
    const fileBytes = view.getUint32(offset + 16, true);
    const memoryBytes = view.getUint32(offset + 20, true);
    const segmentFlags = view.getUint32(offset + 24, true);
    const alignment = view.getUint32(offset + 28, true);
    if (memoryBytes < 1 || fileBytes > memoryBytes || physicalAddress !== virtualAddress
      || (segmentFlags & ~7) !== 0 || (![0, 1].includes(alignment)
        && (!powerOfTwo(alignment) || alignment > 4096
          || virtualAddress % alignment !== fileOffset % alignment))) {
      fail('FIRMWARE_SEGMENT_INVALID', `program ${index}`);
    }
    const mapped = memoryRegion(virtualAddress, memoryBytes);
    if ((mapped.region === 'flash' && segmentFlags !== 5)
      || (mapped.region === 'sram' && segmentFlags !== 6)) {
      fail('FIRMWARE_SEGMENT_INVALID',
        mapped.region === 'flash' ? 'flash must be read-execute' : 'SRAM must be read-write');
    }
    loadedBytes += memoryBytes;
    if (loadedBytes > STM32F429_FIRMWARE_LIMITS.maxLoadedBytes) {
      fail('FIRMWARE_SIZE_INVALID', 'loaded image exceeds private subset');
    }
    const memoryRange = checkedRange(virtualAddress, memoryBytes);
    memoryRanges.push(memoryRange);
    let fileRange = null;
    if (fileBytes > 0) {
      fileRange = checkedFileRange(
        fileOffset, fileBytes, bytes.byteLength, 'FIRMWARE_SEGMENT_INVALID',
      );
      if (fileRange.start < programTable.end) {
        fail('FIRMWARE_SEGMENT_INVALID', 'load data overlaps ELF headers');
      }
      fileRanges.push(fileRange);
    }
    const data = new Uint8Array(memoryBytes);
    if (fileRange) data.set(bytes.slice(fileRange.start, fileRange.end));
    loadSegments.push({
      region: mapped.region,
      address: virtualAddress,
      fileBytes,
      memoryBytes,
      flags: mapped.region === 'flash' ? ['read', 'execute'] : ['read', 'write'],
      data,
    });
  }
  assertNoOverlap(memoryRanges);
  assertNoOverlap(fileRanges);

  const vectorSegment = loadSegments.find((segment) => segment.region === 'flash'
    && segment.address === STM32F429_SUPPORTED_MEMORY_MAP.flash.start
    && segment.fileBytes >= 8);
  if (!vectorSegment) fail('FIRMWARE_VECTOR_INVALID', 'missing flash vector table');
  const vector = new DataView(
    vectorSegment.data.buffer,
    vectorSegment.data.byteOffset,
    vectorSegment.data.byteLength,
  );
  const initialStackPointer = vector.getUint32(0, true);
  const resetVector = vector.getUint32(4, true);
  const sram = STM32F429_SUPPORTED_MEMORY_MAP.sram;
  if (initialStackPointer <= sram.start || initialStackPointer > sram.end
    || initialStackPointer % 8 !== 0) {
    fail('FIRMWARE_VECTOR_INVALID', 'initial SP is outside aligned SRAM top range');
  }
  if ((resetVector & 1) !== 1) fail('FIRMWARE_ENTRYPOINT_INVALID', 'reset vector is not Thumb');
  const entryPoint = resetVector & 0xfffffffe;
  const executable = loadSegments.some((segment) => segment.region === 'flash'
    && entryPoint >= segment.address && entryPoint + 2 <= segment.address + segment.fileBytes);
  if (!executable || entryPoint % 2 !== 0 || rawEntryPoint !== resetVector) {
    fail('FIRMWARE_ENTRYPOINT_INVALID', 'ELF entry/reset vector mismatch');
  }

  return {
    descriptor: deepFreeze({
      schema: STM32F429_FIRMWARE_ARTIFACT_SCHEMA,
      profile: STM32F429_PROFILE,
      architecture: 'armv7em',
      mcuVariant: 'STM32F429ZI',
      purpose: 'private-precompiled-renode-conformance-subset',
      format: 'elf32',
      container: { bytes: bytes.byteLength, sha256: actualSha256 },
      memoryMap: STM32F429_SUPPORTED_MEMORY_MAP,
      initialStackPointer,
      resetVector,
      entryPoint,
      segments: loadSegments.map((segment) => ({
        region: segment.region,
        address: segment.address,
        fileBytes: segment.fileBytes,
        memoryBytes: segment.memoryBytes,
        flags: [...segment.flags],
        sha256: sha256(segment.data),
      })),
      formatDetails: {
        class: 'ELF32',
        endianness: 'little',
        type: 'ET_EXEC',
        machine: 'EM_ARM',
        armEabi: 5,
        flags,
        programHeaders: programCount,
        sectionTableAccepted: false,
      },
      compiler: 'unavailable',
      fullStm32Support: false,
      publicSupport: false,
    }),
    loadSegments: loadSegments.map((segment) => ({
      ...segment,
      flags: [...segment.flags],
      data: new Uint8Array(segment.data),
    })),
  };
}

export function loadStm32F429FirmwareArtifact(request = {}) {
  if (!exactKeys(request, ['profile', 'format', 'bytes', 'expectedSha256'])) {
    fail('FIRMWARE_INPUT_INVALID', 'exact request fields required');
  }
  const { profile, format, bytes, expectedSha256 } = request;
  if (profile !== STM32F429_PROFILE) fail('FIRMWARE_PROFILE_INVALID', String(profile));
  if (!(bytes instanceof Uint8Array) || !SHA256.test(expectedSha256 ?? '')) {
    fail('FIRMWARE_INPUT_INVALID');
  }
  if (bytes.byteLength < 1
    || bytes.byteLength > STM32F429_FIRMWARE_LIMITS.maxContainerBytes) {
    fail('FIRMWARE_SIZE_INVALID');
  }
  if (format !== 'elf32') fail('FIRMWARE_FORMAT_UNSUPPORTED', String(format));
  const immutableBytes = new Uint8Array(bytes);
  const actualSha256 = sha256(immutableBytes);
  if (actualSha256 !== expectedSha256) fail('FIRMWARE_HASH_MISMATCH');
  return parseElf(immutableBytes, actualSha256);
}
