// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const ESP32C3_ARDUINO_FLASH_SCHEMA =
  'intent-mcu-esp32c3-arduino-flash-artifact@1';
export const ESP32C3_ARDUINO_PROFILE = 'board.esp32-c3-devmodule-v1';
export const ESP32C3_ARDUINO_FQBN = 'esp32:esp32:esp32c3:FlashMode=dio';
export const ESP32C3_ARDUINO_BASE_FQBN = 'esp32:esp32:esp32c3';

export const ESP32C3_ARDUINO_FLASH_LOCK = Object.freeze(JSON.parse(readFileSync(
  new URL('./flash-lock.json', import.meta.url), 'utf8',
)));

const FLASH_BYTES = 4 * 1024 * 1024;
const ELF_MACHINE_RISCV = 243;
const EXPECTED_FILE_KEYS = Object.freeze([
  'source', 'bootloader', 'partitions', 'bootApp0', 'application', 'elf',
  'mergedFlash', 'flashArgs', 'partitionCsv',
]);
const COMPONENTS = Object.freeze([
  Object.freeze(['bootloader', 0x0000]),
  Object.freeze(['partitions', 0x8000]),
  Object.freeze(['bootApp0', 0xe000]),
  Object.freeze(['application', 0x10000]),
]);
const LOAD_RANGES = Object.freeze([
  Object.freeze([0x3c000000, 0x3c800000, 'DROM']),
  Object.freeze([0x3fc80000, 0x3fce0000, 'DRAM']),
  Object.freeze([0x4037c000, 0x403e0000, 'IRAM']),
  Object.freeze([0x42000000, 0x42800000, 'IROM']),
  Object.freeze([0x50000000, 0x50002000, 'RTC']),
]);
const EXPECTED_PARTITIONS = Object.freeze([
  Object.freeze(['nvs', 1, 2, 0x9000, 0x5000]),
  Object.freeze(['otadata', 1, 0, 0xe000, 0x2000]),
  Object.freeze(['app0', 0, 0x10, 0x10000, 0x140000]),
  Object.freeze(['app1', 0, 0x11, 0x150000, 0x140000]),
  Object.freeze(['spiffs', 1, 0x82, 0x290000, 0x160000]),
  Object.freeze(['coredump', 1, 3, 0x3f0000, 0x10000]),
]);
const FLASH_ARGS = [
  '--flash-mode dio --flash-freq 80m --flash-size 4MB',
  '0x0 sketch.ino.bootloader.bin',
  '0x8000 sketch.ino.partitions.bin',
  '0xe000 boot_app0.bin',
  '0x10000 sketch.ino.bin',
  '',
].join('\n');

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function asBuffer(value, code = 'FLASH_ARTIFACT_INVALID') {
  if (!(value instanceof Uint8Array)) fail(code);
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertIdentity(bytes, expectedBytes, expectedSha256, code) {
  if (bytes.length !== expectedBytes || sha256(bytes) !== expectedSha256) fail(code);
}

function rangeName(address, bytes) {
  const end = address + bytes;
  if (!Number.isSafeInteger(end) || end < address) fail('FLASH_LOAD_RANGE_INVALID');
  const range = LOAD_RANGES.find(([start, limit]) => address >= start && end <= limit);
  if (!range) fail('FLASH_LOAD_RANGE_INVALID');
  return range[2];
}

function assertNoOverlaps(segments) {
  const sorted = [...segments].filter((segment) => segment.memoryBytes > 0)
    .sort((left, right) => left.address - right.address);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    if (previous.address + previous.memoryBytes > sorted[index].address) {
      fail('FLASH_LOAD_RANGE_OVERLAP');
    }
  }
}

export function parseEsp32C3Image(value) {
  const bytes = asBuffer(value);
  if (bytes.length < 64 || bytes[0] !== 0xe9 || bytes[1] < 1 || bytes[1] > 16
    || bytes[2] !== 2 || bytes.readUInt16LE(12) !== 5) {
    fail('FLASH_IMAGE_HEADER_INVALID');
  }
  const entry = bytes.readUInt32LE(4);
  const segments = [];
  let offset = 24;
  for (let index = 0; index < bytes[1]; index += 1) {
    if (offset + 8 > bytes.length) fail('FLASH_IMAGE_SEGMENT_INVALID');
    const address = bytes.readUInt32LE(offset);
    const dataBytes = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataBytes < 1 || dataOffset + dataBytes > bytes.length) {
      fail('FLASH_IMAGE_SEGMENT_INVALID');
    }
    segments.push(Object.freeze({
      index, address, fileOffset: dataOffset, fileBytes: dataBytes,
      memoryBytes: dataBytes, memory: rangeName(address, dataBytes),
    }));
    offset = dataOffset + dataBytes;
  }
  assertNoOverlaps(segments);
  if (!segments.some((segment) => entry >= segment.address
    && entry < segment.address + segment.memoryBytes)) {
    fail('FLASH_IMAGE_ENTRY_INVALID');
  }
  return Object.freeze({ entry, chipId: 5, flashMode: 'dio', segments: Object.freeze(segments) });
}

export function parseEsp32C3Elf(value) {
  const bytes = asBuffer(value);
  if (bytes.length < 52 || bytes[0] !== 0x7f || bytes[1] !== 0x45
    || bytes[2] !== 0x4c || bytes[3] !== 0x46 || bytes[4] !== 1
    || bytes[5] !== 1 || bytes[6] !== 1 || bytes.readUInt16LE(16) !== 2
    || bytes.readUInt16LE(18) !== ELF_MACHINE_RISCV
    || bytes.readUInt32LE(20) !== 1 || bytes.readUInt16LE(40) !== 52
    || bytes.readUInt16LE(42) !== 32) {
    fail('FLASH_ELF_HEADER_INVALID');
  }
  const entry = bytes.readUInt32LE(24);
  const programOffset = bytes.readUInt32LE(28);
  const programCount = bytes.readUInt16LE(44);
  if (programCount < 1 || programCount > 32
    || programOffset + programCount * 32 > bytes.length) {
    fail('FLASH_ELF_HEADER_INVALID');
  }
  const segments = [];
  for (let index = 0; index < programCount; index += 1) {
    const offset = programOffset + index * 32;
    if (bytes.readUInt32LE(offset) !== 1) continue;
    const fileOffset = bytes.readUInt32LE(offset + 4);
    const address = bytes.readUInt32LE(offset + 8);
    const physicalAddress = bytes.readUInt32LE(offset + 12);
    const fileBytes = bytes.readUInt32LE(offset + 16);
    const memoryBytes = bytes.readUInt32LE(offset + 20);
    const flags = bytes.readUInt32LE(offset + 24);
    if (physicalAddress !== address || fileBytes > memoryBytes
      || fileOffset + fileBytes > bytes.length || memoryBytes < 1) {
      fail('FLASH_ELF_SEGMENT_INVALID');
    }
    segments.push(Object.freeze({
      index, address, fileOffset, fileBytes, memoryBytes, flags,
      memory: rangeName(address, memoryBytes),
    }));
  }
  // Arduino-ESP32 may emit a seventh, BSS-only RTC load segment when the
  // bounded GPIO HAL path is linked. Every segment is still range-checked,
  // non-overlapping and entry-bound above/below; accept only the two observed
  // fixed-toolchain shapes rather than assuming that all sketches have six.
  if (segments.length < 6 || segments.length > 7) fail('FLASH_ELF_SEGMENT_INVALID');
  assertNoOverlaps(segments);
  if (!segments.some((segment) => (segment.flags & 1) === 1
    && entry >= segment.address && entry < segment.address + segment.memoryBytes)) {
    fail('FLASH_ELF_ENTRY_INVALID');
  }
  return Object.freeze({ entry, machine: 'riscv32', segments: Object.freeze(segments) });
}

export function parsePartitionTable(value) {
  const bytes = asBuffer(value);
  if (bytes.length !== 3072) fail('FLASH_PARTITION_TABLE_INVALID');
  const partitions = [];
  for (let offset = 0; offset + 32 <= bytes.length; offset += 32) {
    if (bytes[offset] === 0xff && bytes[offset + 1] === 0xff) break;
    if (bytes[offset] === 0xeb && bytes[offset + 1] === 0xeb) continue;
    if (bytes[offset] !== 0xaa || bytes[offset + 1] !== 0x50) {
      fail('FLASH_PARTITION_TABLE_INVALID');
    }
    const label = bytes.subarray(offset + 12, offset + 28).toString('utf8')
      .replace(/\0.*$/u, '');
    partitions.push(Object.freeze({
      label, type: bytes[offset + 2], subtype: bytes[offset + 3],
      offset: bytes.readUInt32LE(offset + 4), size: bytes.readUInt32LE(offset + 8),
    }));
  }
  const actual = partitions.map((part) => [
    part.label, part.type, part.subtype, part.offset, part.size,
  ]);
  if (JSON.stringify(actual) !== JSON.stringify(EXPECTED_PARTITIONS)) {
    fail('FLASH_PARTITION_LAYOUT_INVALID');
  }
  for (let index = 1; index < partitions.length; index += 1) {
    const previous = partitions[index - 1];
    if (previous.offset + previous.size > partitions[index].offset) {
      fail('FLASH_PARTITION_LAYOUT_INVALID');
    }
  }
  if (partitions.at(-1).offset + partitions.at(-1).size !== FLASH_BYTES) {
    fail('FLASH_PARTITION_LAYOUT_INVALID');
  }
  return Object.freeze(partitions);
}

export function loadEsp32C3ArduinoFlashArtifact(request = {}) {
  if (!exactKeys(request, ['profile', 'fqbn', 'variant', 'files'])
    || request.profile !== ESP32C3_ARDUINO_PROFILE
    || request.fqbn !== ESP32C3_ARDUINO_FQBN
    || !['a', 'b'].includes(request.variant)
    || !exactKeys(request.files, EXPECTED_FILE_KEYS)) {
    fail('FLASH_REQUEST_INVALID');
  }
  const fixture = ESP32C3_ARDUINO_FLASH_LOCK.fixtures[request.variant];
  const files = Object.fromEntries(EXPECTED_FILE_KEYS.map((key) => [
    key, asBuffer(request.files[key]),
  ]));
  assertIdentity(files.source, fixture.sourceBytes, fixture.sourceSha256,
    'FLASH_SOURCE_IDENTITY_MISMATCH');
  assertIdentity(files.bootloader, ESP32C3_ARDUINO_FLASH_LOCK.flash.bootloaderBytes,
    ESP32C3_ARDUINO_FLASH_LOCK.flash.bootloaderSha256, 'FLASH_BOOTLOADER_IDENTITY_MISMATCH');
  assertIdentity(files.partitions, 3072,
    ESP32C3_ARDUINO_FLASH_LOCK.flash.partitionBinSha256, 'FLASH_PARTITION_IDENTITY_MISMATCH');
  assertIdentity(files.bootApp0, 8192,
    ESP32C3_ARDUINO_FLASH_LOCK.flash.bootApp0Sha256, 'FLASH_BOOT_APP_IDENTITY_MISMATCH');
  assertIdentity(files.application, fixture.applicationBytes, fixture.applicationSha256,
    'FLASH_APPLICATION_IDENTITY_MISMATCH');
  assertIdentity(files.elf, fixture.elfBytes, fixture.elfSha256,
    'FLASH_ELF_IDENTITY_MISMATCH');
  assertIdentity(files.mergedFlash, FLASH_BYTES, fixture.mergedFlashSha256,
    'FLASH_MERGED_IDENTITY_MISMATCH');
  assertIdentity(files.flashArgs, Buffer.byteLength(FLASH_ARGS),
    ESP32C3_ARDUINO_FLASH_LOCK.flash.flashArgsSha256, 'FLASH_LAYOUT_ARGUMENTS_INVALID');
  assertIdentity(files.partitionCsv, 305,
    ESP32C3_ARDUINO_FLASH_LOCK.flash.partitionCsvSha256, 'FLASH_PARTITION_CSV_INVALID');
  if (files.flashArgs.toString('utf8') !== FLASH_ARGS
    || !files.source.includes(Buffer.from(fixture.uartMarker, 'ascii'))
    || !files.application.includes(Buffer.from(fixture.uartMarker, 'ascii'))) {
    fail('FLASH_SOURCE_BINDING_INVALID');
  }

  const bootloaderImage = parseEsp32C3Image(files.bootloader);
  const applicationImage = parseEsp32C3Image(files.application);
  const elf = parseEsp32C3Elf(files.elf);
  const partitions = parsePartitionTable(files.partitions);
  if (applicationImage.entry !== elf.entry) fail('FLASH_ENTRY_IDENTITY_MISMATCH');
  const appPartition = partitions.find((part) => part.label === 'app0');
  if (!appPartition || files.application.length > appPartition.size) {
    fail('FLASH_APPLICATION_RANGE_INVALID');
  }
  const reconstructed = Buffer.alloc(FLASH_BYTES, 0xff);
  for (const [key, offset] of COMPONENTS) files[key].copy(reconstructed, offset);
  if (!reconstructed.equals(files.mergedFlash)) fail('FLASH_LAYOUT_MISMATCH');

  return Object.freeze({
    schema: ESP32C3_ARDUINO_FLASH_SCHEMA,
    profile: ESP32C3_ARDUINO_PROFILE,
    fqbn: ESP32C3_ARDUINO_FQBN,
    baseFqbn: ESP32C3_ARDUINO_BASE_FQBN,
    variant: request.variant,
    source: Object.freeze({ bytes: files.source.length, sha256: fixture.sourceSha256 }),
    framework: Object.freeze({
      arduinoEsp32Version: '3.3.10', espIdfVersion: '5.5.4',
      compiler: 'esp-rv32 2601',
    }),
    flash: Object.freeze({
      bytes: FLASH_BYTES, sha256: fixture.mergedFlashSha256,
      mode: 'dio', frequency: '80m', offsets: Object.freeze([0, 0x8000, 0xe000, 0x10000]),
      bootloaderEntry: bootloaderImage.entry, applicationEntry: applicationImage.entry,
      applicationSegments: applicationImage.segments,
      elfLoadSegments: elf.segments,
      partitions,
    }),
    uartMarker: fixture.uartMarker,
    gpioPinStateObserved: false,
    arbitraryFirmwareSupport: false,
    generalArduinoCompatibility: false,
    persistentUserProjectStorage: false,
    publicSupport: true,
  });
}
