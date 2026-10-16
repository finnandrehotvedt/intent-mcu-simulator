// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import { timingSafeEqual } from 'node:crypto';

import {
  ESP32C3_ARDUINO_FLASH_LOCK as LOCK,
  parseEsp32C3Elf,
  parseEsp32C3Image,
  parsePartitionTable,
  sha256,
} from './flash-loader.mjs';
import { FQBN, PROFILE, exactKeys, fault, validateBoundedSource } from './protocol.mjs';

const FILE_KEYS = Object.freeze([
  'bootloader', 'partitions', 'bootApp0', 'application', 'elf',
  'mergedFlash', 'flashArgs', 'partitionCsv',
]);
const OFFSETS = Object.freeze({ bootloader: 0, partitions: 0x8000, bootApp0: 0xe000, application: 0x10000 });
const SHA256 = /^[0-9a-f]{64}$/u;

function equalHash(observed, expected) {
  return SHA256.test(observed) && SHA256.test(expected)
    && timingSafeEqual(Buffer.from(observed, 'hex'), Buffer.from(expected, 'hex'));
}

function identity(name, bytes, record) {
  if (!(bytes instanceof Uint8Array) || !exactKeys(record, ['sha256', 'bytes'])
    || !Number.isSafeInteger(record.bytes) || record.bytes < 1
    || bytes.length !== record.bytes || !equalHash(sha256(bytes), record.sha256)) {
    throw fault(`BUILD_${name.toUpperCase()}_IDENTITY_MISMATCH`);
  }
}

export function validateBuiltArtifact({ source, marker, manifest, files } = {}) {
  const normalized = validateBoundedSource(source);
  if (normalized.marker !== marker || !exactKeys(files, FILE_KEYS)
    || !manifest || manifest.status !== 'succeeded' || manifest.code !== 'BUILD_OK'
    || manifest.profile !== PROFILE || manifest.fqbn !== FQBN
    || manifest.marker !== marker || !exactKeys(manifest.files, FILE_KEYS)) {
    throw fault('BUILD_ARTIFACT_SHAPE_INVALID');
  }
  const sourceBytes = Buffer.from(normalized.source, 'utf8');
  const sourceSha256 = sha256(sourceBytes);
  if (!equalHash(sourceSha256, manifest.sourceSha256)) {
    throw fault('BUILD_SOURCE_IDENTITY_MISMATCH');
  }
  for (const name of FILE_KEYS) identity(name, files[name], manifest.files[name]);
  if (files.bootloader.length !== LOCK.flash.bootloaderBytes
    || !equalHash(sha256(files.bootloader), LOCK.flash.bootloaderSha256)
    || files.partitions.length !== 3072
    || !equalHash(sha256(files.partitions), LOCK.flash.partitionBinSha256)
    || files.bootApp0.length !== 8192
    || !equalHash(sha256(files.bootApp0), LOCK.flash.bootApp0Sha256)
    || !equalHash(sha256(files.partitionCsv), LOCK.flash.partitionCsvSha256)) {
    throw fault('BUILD_FIXED_FLASH_IDENTITY_MISMATCH');
  }
  const flashArgs = Buffer.from(files.flashArgs).toString('utf8');
  const expectedArgs = [
    '--flash-mode dio --flash-freq 80m --flash-size 4MB',
    '0x0 sketch.ino.bootloader.bin',
    '0x8000 sketch.ino.partitions.bin',
    '0xe000 boot_app0.bin',
    '0x10000 sketch.ino.bin',
    '',
  ].join('\n');
  if (flashArgs !== expectedArgs) throw fault('BUILD_FLASH_ARGUMENTS_INVALID');
  const markerBytes = Buffer.from(marker, 'ascii');
  if (!sourceBytes.includes(markerBytes) || !Buffer.from(files.application).includes(markerBytes)) {
    throw fault('BUILD_SOURCE_BINDING_INVALID');
  }
  const bootloader = parseEsp32C3Image(files.bootloader);
  const application = parseEsp32C3Image(files.application);
  const elf = parseEsp32C3Elf(files.elf);
  const partitions = parsePartitionTable(files.partitions);
  if (application.entry !== elf.entry) throw fault('BUILD_ENTRY_IDENTITY_MISMATCH');
  const appPartition = partitions.find((entry) => entry.label === 'app0');
  if (!appPartition || files.application.length > appPartition.size) {
    throw fault('BUILD_APPLICATION_RANGE_INVALID');
  }
  if (files.mergedFlash.length !== LOCK.flash.bytes) {
    throw fault('BUILD_MERGED_FLASH_SIZE_INVALID');
  }
  const reconstructed = Buffer.alloc(LOCK.flash.bytes, 0xff);
  for (const [name, offset] of Object.entries(OFFSETS)) Buffer.from(files[name]).copy(reconstructed, offset);
  if (!timingSafeEqual(reconstructed, Buffer.from(files.mergedFlash))) {
    reconstructed.fill(0);
    throw fault('BUILD_MERGED_FLASH_LAYOUT_INVALID');
  }
  reconstructed.fill(0);
  return Object.freeze({
    schema: 'intent-mcu-esp32c3-public-artifact@1', profile: PROFILE, fqbn: FQBN,
    sourceSha256, marker,
    flash: Object.freeze({
      bytes: files.mergedFlash.length, sha256: sha256(files.mergedFlash), mode: 'dio',
      applicationBytes: files.application.length,
      applicationSha256: sha256(files.application), elfSha256: sha256(files.elf),
      applicationEntry: application.entry,
    }),
    toolchain: Object.freeze({
      arduinoCli: '1.5.1', arduinoEsp32: '3.3.10', espIdf: '5.5.4',
      compiler: 'esp-rv32 2601', toolchainBaseImageId: LOCK.builder.imageId,
    }),
    isolation: Object.freeze({ network: 'none', durableSourceStorage: false }),
    gpioPinStateObserved: false, generalEsp32Support: false, publicSupport: true,
    boundedPublicSupport: true,
  });
}

export const BUILDER_IMAGE = LOCK.builder.image;
export const BUILDER_IMAGE_ID = LOCK.builder.imageId;
export const QEMU_IMAGE = LOCK.qemu.image;
export const QEMU_IMAGE_ID = LOCK.qemu.imageId;
export const QEMU_BINARY_SHA256 = LOCK.qemu.binarySha256;
export const ROM_SHA256 = LOCK.rom.sha256;
export const ROM_VERSION = LOCK.rom.version;
export const FLASH_BYTES = LOCK.flash.bytes;
