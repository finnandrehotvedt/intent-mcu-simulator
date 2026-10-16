export const RP2040_FIRMWARE_ARTIFACT_SCHEMA = 'intent-mcu-rp2040-firmware-artifact@1';
export const RP2040_UF2_FAMILY_ID = 0xe48bff56;
export const RP2040_UF2_FAMILY_FLAG = 0x00002000;

export const RP2040_SUPPORTED_MEMORY_MAP = Object.freeze({
  id: 'rp2040-pico-2m-flash-264k-sram-v1',
  flash: Object.freeze({ start: 0x10000000, end: 0x10200000, bytes: 2 * 1024 * 1024 }),
  sram: Object.freeze({ start: 0x20000000, end: 0x20042000, bytes: 264 * 1024 }),
});

export const RP2040_FIRMWARE_LIMITS = Object.freeze({
  maxContainerBytes: 4 * 1024 * 1024,
  maxUf2Blocks: 8192,
  maxElfLoadSegments: 32,
  maxLoadedBytes: RP2040_SUPPORTED_MEMORY_MAP.flash.bytes
    + RP2040_SUPPORTED_MEMORY_MAP.sram.bytes,
});

export const RP2040_FIRMWARE_ERROR_CODES = Object.freeze([
  'FIRMWARE_INPUT_INVALID',
  'FIRMWARE_SIZE_INVALID',
  'FIRMWARE_FORMAT_UNSUPPORTED',
  'FIRMWARE_HASH_MISMATCH',
  'FIRMWARE_UF2_MAGIC_INVALID',
  'FIRMWARE_UF2_FLAGS_UNSUPPORTED',
  'FIRMWARE_UF2_FAMILY_INVALID',
  'FIRMWARE_UF2_BLOCK_INVALID',
  'FIRMWARE_ELF_HEADER_INVALID',
  'FIRMWARE_ELF_ARCH_INVALID',
  'FIRMWARE_ELF_FLAGS_UNSUPPORTED',
  'FIRMWARE_ELF_PROGRAM_TYPE_UNSUPPORTED',
  'FIRMWARE_SEGMENT_INVALID',
  'FIRMWARE_ADDRESS_OUT_OF_RANGE',
  'FIRMWARE_SEGMENT_OVERLAP',
  'FIRMWARE_ENTRYPOINT_INVALID',
]);

const SHA256 = /^[0-9a-f]{64}$/u;
const UF2_MAGIC_START0 = 0x0a324655;
const UF2_MAGIC_START1 = 0x9e5d5157;
const UF2_MAGIC_END = 0x0ab16f30;
const ELF_HEADER_BYTES = 52;
const ELF_PROGRAM_HEADER_BYTES = 32;
const ELF_SECTION_HEADER_BYTES = 40;
const ELF_MACHINE_ARM = 40;
const ELF_EABI5 = 0x05000000;
const ELF_FLOAT_SOFT = 0x00000200;
const ELF_SUPPORTED_FLAGS = new Set([ELF_EABI5, ELF_EABI5 | ELF_FLOAT_SOFT]);

export class Rp2040FirmwareArtifactError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'Rp2040FirmwareArtifactError';
    this.code = code;
  }
}

function fail(code, detail = '') {
  throw new Rp2040FirmwareArtifactError(code, detail);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) fail('FIRMWARE_INPUT_INVALID', 'Web Crypto unavailable');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function checkedRange(start, size, code = 'FIRMWARE_SEGMENT_INVALID') {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(size) || start < 0 || size < 1) {
    fail(code, 'invalid range');
  }
  const end = start + size;
  if (!Number.isSafeInteger(end) || end > 0x1_0000_0000) fail(code, 'range overflow');
  return { start, end };
}

function checkedFileRange(offset, size, containerBytes, code) {
  const range = checkedRange(offset, Math.max(size, 1), code);
  const end = offset + size;
  if (size < 0 || end > containerBytes || end < offset || range.start > containerBytes) {
    fail(code, 'truncated file range');
  }
  return { start: offset, end };
}

function memoryRegion(address, bytes) {
  const range = checkedRange(address, bytes, 'FIRMWARE_ADDRESS_OUT_OF_RANGE');
  for (const [region, map] of Object.entries(RP2040_SUPPORTED_MEMORY_MAP)) {
    if (region === 'id') continue;
    if (range.start >= map.start && range.end <= map.end) return { region, ...range };
  }
  fail('FIRMWARE_ADDRESS_OUT_OF_RANGE', `0x${address.toString(16)}+${bytes}`);
}

function assertNoOverlap(ranges, code = 'FIRMWARE_SEGMENT_OVERLAP') {
  const ordered = [...ranges].sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < ordered.length; index++) {
    if (ordered[index].start < ordered[index - 1].end) fail(code, 'overlapping ranges');
  }
}

function vectorTable(loadSegments) {
  const first = loadSegments.find((segment) => segment.address === RP2040_SUPPORTED_MEMORY_MAP.flash.start
    && segment.data.byteLength >= 8);
  if (!first) fail('FIRMWARE_ENTRYPOINT_INVALID', 'missing flash vector table');
  const view = new DataView(first.data.buffer, first.data.byteOffset, first.data.byteLength);
  const initialStackPointer = view.getUint32(0, true);
  const resetVector = view.getUint32(4, true);
  const sram = RP2040_SUPPORTED_MEMORY_MAP.sram;
  if (initialStackPointer <= sram.start || initialStackPointer > sram.end
    || initialStackPointer % 8 !== 0) {
    fail('FIRMWARE_ENTRYPOINT_INVALID', 'invalid initial stack pointer');
  }
  if ((resetVector & 1) !== 1) fail('FIRMWARE_ENTRYPOINT_INVALID', 'reset vector is not Thumb');
  const entryPoint = resetVector & 0xfffffffe;
  const executable = loadSegments.some((segment) => segment.flags.includes('execute')
    && entryPoint >= segment.address && entryPoint + 2 <= segment.address + segment.fileBytes);
  if (!executable || entryPoint % 2 !== 0) {
    fail('FIRMWARE_ENTRYPOINT_INVALID', 'reset vector is outside executable bytes');
  }
  return { initialStackPointer, resetVector, entryPoint };
}

async function finalizeArtifact({ format, bytes, actualSha256, loadSegments, formatDetails }) {
  if (!loadSegments.length) fail('FIRMWARE_SEGMENT_INVALID', 'no load segments');
  if (loadSegments.reduce((total, segment) => total + segment.memoryBytes, 0)
    > RP2040_FIRMWARE_LIMITS.maxLoadedBytes) {
    fail('FIRMWARE_SIZE_INVALID', 'loaded image exceeds memory map');
  }
  assertNoOverlap(loadSegments.map((segment) => checkedRange(segment.address, segment.memoryBytes)));
  const vector = vectorTable(loadSegments);
  const segments = [];
  for (const segment of loadSegments) {
    const region = memoryRegion(segment.address, segment.memoryBytes).region;
    segments.push({
      region,
      address: segment.address,
      fileBytes: segment.fileBytes,
      memoryBytes: segment.memoryBytes,
      flags: [...segment.flags],
      sha256: await sha256(segment.data),
    });
  }
  return {
    descriptor: deepFreeze({
      schema: RP2040_FIRMWARE_ARTIFACT_SCHEMA,
      profile: 'board.rp2040-pico-v1',
      architecture: 'armv6m',
      mcuVariant: 'RP2040',
      purpose: 'precompiled-rp2040-experimental-conformance',
      format,
      container: { bytes: bytes.byteLength, sha256: actualSha256 },
      memoryMap: RP2040_SUPPORTED_MEMORY_MAP,
      initialStackPointer: vector.initialStackPointer,
      resetVector: vector.resetVector,
      entryPoint: vector.entryPoint,
      segments,
      formatDetails,
    }),
    loadSegments: loadSegments.map((segment) => ({
      ...segment,
      region: memoryRegion(segment.address, segment.memoryBytes).region,
      flags: [...segment.flags],
      data: new Uint8Array(segment.data),
    })),
  };
}

function coalesceUf2Blocks(blocks) {
  const groups = [];
  for (const block of blocks) {
    const previous = groups.at(-1);
    if (previous && previous.address + previous.bytes === block.address) {
      previous.blocks.push(block.data);
      previous.bytes += block.data.byteLength;
    } else {
      groups.push({ address: block.address, bytes: block.data.byteLength, blocks: [block.data] });
    }
  }
  return groups.map((group) => {
    const data = new Uint8Array(group.bytes);
    let offset = 0;
    for (const block of group.blocks) {
      data.set(block, offset);
      offset += block.byteLength;
    }
    return {
      address: group.address,
      fileBytes: data.byteLength,
      memoryBytes: data.byteLength,
      flags: ['read', 'execute'],
      data,
    };
  });
}

async function parseUf2(bytes, actualSha256) {
  if (bytes.byteLength < 512 || bytes.byteLength % 512 !== 0) {
    fail('FIRMWARE_SIZE_INVALID', 'UF2 must contain complete 512-byte blocks');
  }
  const blockCount = bytes.byteLength / 512;
  if (blockCount > RP2040_FIRMWARE_LIMITS.maxUf2Blocks) {
    fail('FIRMWARE_SIZE_INVALID', 'too many UF2 blocks');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const blocks = [];
  let declaredBlocks = null;
  for (let index = 0; index < blockCount; index++) {
    const offset = index * 512;
    if (view.getUint32(offset, true) !== UF2_MAGIC_START0
      || view.getUint32(offset + 4, true) !== UF2_MAGIC_START1
      || view.getUint32(offset + 508, true) !== UF2_MAGIC_END) {
      fail('FIRMWARE_UF2_MAGIC_INVALID', `block ${index}`);
    }
    const flags = view.getUint32(offset + 8, true);
    if (flags !== RP2040_UF2_FAMILY_FLAG) {
      fail('FIRMWARE_UF2_FLAGS_UNSUPPORTED', `0x${flags.toString(16)}`);
    }
    const address = view.getUint32(offset + 12, true);
    const payloadBytes = view.getUint32(offset + 16, true);
    const blockNumber = view.getUint32(offset + 20, true);
    const numberOfBlocks = view.getUint32(offset + 24, true);
    const familyId = view.getUint32(offset + 28, true);
    if (familyId !== RP2040_UF2_FAMILY_ID) fail('FIRMWARE_UF2_FAMILY_INVALID');
    if (payloadBytes < 4 || payloadBytes > 476 || payloadBytes % 4 !== 0
      || numberOfBlocks !== blockCount || blockNumber >= numberOfBlocks
      || numberOfBlocks > RP2040_FIRMWARE_LIMITS.maxUf2Blocks) {
      fail('FIRMWARE_UF2_BLOCK_INVALID', `block ${index}`);
    }
    declaredBlocks ??= numberOfBlocks;
    if (declaredBlocks !== numberOfBlocks) fail('FIRMWARE_UF2_BLOCK_INVALID', 'block-count drift');
    const mapped = memoryRegion(address, payloadBytes);
    if (mapped.region !== 'flash' || address % 4 !== 0) {
      fail('FIRMWARE_ADDRESS_OUT_OF_RANGE', 'UF2 payload is not aligned flash');
    }
    for (let pad = offset + 32 + payloadBytes; pad < offset + 508; pad++) {
      if (bytes[pad] !== 0) fail('FIRMWARE_UF2_FLAGS_UNSUPPORTED', 'undeclared trailing data');
    }
    blocks.push({
      blockNumber,
      address,
      data: bytes.slice(offset + 32, offset + 32 + payloadBytes),
    });
  }
  const byNumber = [...blocks].sort((left, right) => left.blockNumber - right.blockNumber);
  if (byNumber.some((block, index) => block.blockNumber !== index)) {
    fail('FIRMWARE_UF2_BLOCK_INVALID', 'duplicate or missing block number');
  }
  const byAddress = [...blocks].sort((left, right) => left.address - right.address);
  assertNoOverlap(byAddress.map((block) => checkedRange(block.address, block.data.byteLength)));
  const loadSegments = coalesceUf2Blocks(byAddress);
  return finalizeArtifact({
    format: 'uf2', bytes, actualSha256, loadSegments,
    formatDetails: {
      blockBytes: 512,
      blocks: blockCount,
      familyId: RP2040_UF2_FAMILY_ID,
      acceptedFlags: [RP2040_UF2_FAMILY_FLAG],
      unsupportedFlagsRejected: true,
    },
  });
}

function powerOfTwo(value) {
  return value > 0 && (value & (value - 1)) === 0;
}

async function parseElf(bytes, actualSha256) {
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
    || programCount > RP2040_FIRMWARE_LIMITS.maxElfLoadSegments) {
    fail('FIRMWARE_ELF_HEADER_INVALID', 'unsupported ELF executable layout');
  }
  if (machine !== ELF_MACHINE_ARM) fail('FIRMWARE_ELF_ARCH_INVALID', `machine ${machine}`);
  if (!ELF_SUPPORTED_FLAGS.has(flags)) {
    fail('FIRMWARE_ELF_FLAGS_UNSUPPORTED', `0x${flags.toString(16)}`);
  }
  const programTable = checkedFileRange(
    programOffset, programCount * programEntryBytes, bytes.byteLength, 'FIRMWARE_ELF_HEADER_INVALID',
  );
  if (programOffset < ELF_HEADER_BYTES) fail('FIRMWARE_ELF_HEADER_INVALID', 'program table overlaps header');
  if (sectionCount === 0) {
    if (sectionOffset !== 0 || sectionEntryBytes !== 0 || sectionNames !== 0) {
      fail('FIRMWARE_ELF_HEADER_INVALID', 'invalid empty section table');
    }
  } else {
    if (sectionEntryBytes !== ELF_SECTION_HEADER_BYTES || sectionNames >= sectionCount) {
      fail('FIRMWARE_ELF_HEADER_INVALID', 'invalid section table');
    }
    checkedFileRange(
      sectionOffset, sectionCount * sectionEntryBytes, bytes.byteLength, 'FIRMWARE_ELF_HEADER_INVALID',
    );
  }

  const loadSegments = [];
  const fileRanges = [];
  const memoryRanges = [];
  let loadedBytes = 0;
  for (let index = 0; index < programCount; index++) {
    const offset = programOffset + index * programEntryBytes;
    const programType = view.getUint32(offset, true);
    if (programType === 0) continue;
    if (programType !== 1) {
      fail('FIRMWARE_ELF_PROGRAM_TYPE_UNSUPPORTED', `type ${programType}`);
    }
    const fileOffset = view.getUint32(offset + 4, true);
    const virtualAddress = view.getUint32(offset + 8, true);
    const physicalAddress = view.getUint32(offset + 12, true);
    const fileBytes = view.getUint32(offset + 16, true);
    const memoryBytes = view.getUint32(offset + 20, true);
    const segmentFlags = view.getUint32(offset + 24, true);
    const alignment = view.getUint32(offset + 28, true);
    if (memoryBytes < 1 || fileBytes > memoryBytes || (physicalAddress !== 0
      && physicalAddress !== virtualAddress) || (segmentFlags & ~7) !== 0
      || (segmentFlags & 4) === 0 || (![0, 1].includes(alignment)
        && (!powerOfTwo(alignment) || alignment > 4096
          || virtualAddress % alignment !== fileOffset % alignment))) {
      fail('FIRMWARE_SEGMENT_INVALID', `program ${index}`);
    }
    const mapped = memoryRegion(virtualAddress, memoryBytes);
    if (mapped.region === 'flash' && (segmentFlags !== 5)) {
      fail('FIRMWARE_SEGMENT_INVALID', 'flash must be read-execute');
    }
    if (mapped.region === 'sram' && (segmentFlags !== 6)) {
      fail('FIRMWARE_SEGMENT_INVALID', 'SRAM must be read-write and non-executable');
    }
    loadedBytes += memoryBytes;
    if (loadedBytes > RP2040_FIRMWARE_LIMITS.maxLoadedBytes) {
      fail('FIRMWARE_SIZE_INVALID', 'loaded image exceeds memory map');
    }
    const memoryRange = checkedRange(virtualAddress, memoryBytes);
    if (memoryRanges.some((range) => memoryRange.start < range.end
      && range.start < memoryRange.end)) {
      fail('FIRMWARE_SEGMENT_OVERLAP', 'overlapping memory ranges');
    }
    memoryRanges.push(memoryRange);
    if (fileBytes > 0) {
      const fileRange = checkedFileRange(
        fileOffset, fileBytes, bytes.byteLength, 'FIRMWARE_SEGMENT_INVALID',
      );
      if (fileRange.start < programTable.end) {
        fail('FIRMWARE_SEGMENT_INVALID', 'load data overlaps ELF headers');
      }
      fileRanges.push(fileRange);
    }
    const data = new Uint8Array(memoryBytes);
    if (fileBytes > 0) data.set(bytes.slice(fileOffset, fileOffset + fileBytes));
    loadSegments.push({
      address: virtualAddress,
      fileBytes,
      memoryBytes,
      flags: mapped.region === 'flash' ? ['read', 'execute'] : ['read', 'write'],
      data,
    });
  }
  if (!loadSegments.length) fail('FIRMWARE_SEGMENT_INVALID', 'no PT_LOAD segment');
  assertNoOverlap(fileRanges, 'FIRMWARE_SEGMENT_OVERLAP');
  assertNoOverlap(loadSegments.map((segment) => checkedRange(segment.address, segment.memoryBytes)));
  const vector = vectorTable(loadSegments);
  if ((rawEntryPoint & 1) !== 1 || (rawEntryPoint & 0xfffffffe) !== vector.entryPoint) {
    fail('FIRMWARE_ENTRYPOINT_INVALID', 'ELF entry does not match reset vector');
  }
  return finalizeArtifact({
    format: 'elf32', bytes, actualSha256, loadSegments,
    formatDetails: {
      class: 'ELF32', endianness: 'little', type: 'ET_EXEC', machine: 'EM_ARM',
      armEabi: 5, flags, programHeaders: programCount, loadSegments: loadSegments.length,
      unsupportedProgramTypesRejected: true,
    },
  });
}

export async function loadRp2040FirmwareArtifact({ format, bytes, expectedSha256 } = {}) {
  if (!(bytes instanceof Uint8Array) || !SHA256.test(expectedSha256 ?? '')) {
    fail('FIRMWARE_INPUT_INVALID');
  }
  if (bytes.byteLength < 1 || bytes.byteLength > RP2040_FIRMWARE_LIMITS.maxContainerBytes) {
    fail('FIRMWARE_SIZE_INVALID');
  }
  if (!['uf2', 'elf32'].includes(format)) fail('FIRMWARE_FORMAT_UNSUPPORTED', String(format));
  const immutableBytes = new Uint8Array(bytes);
  const actualSha256 = await sha256(immutableBytes);
  if (actualSha256 !== expectedSha256) fail('FIRMWARE_HASH_MISMATCH');
  if (format === 'uf2') return parseUf2(immutableBytes, actualSha256);
  return parseElf(immutableBytes, actualSha256);
}
