// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadStm32F429FirmwareArtifact } from './artifact.mjs';
import { STM32_PROFILE, exactKeys, validateStm32Source } from './protocol.mjs';

const JOB_SCHEMA = 'intent-mcu-stm32-builder-job@1';
const RESULT_SCHEMA = 'intent-mcu-stm32-builder-result@1';
const CONTRACT = '/opt/intent-mcu/stm32/contract';
const WORK = '/workspace';

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function emit(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }

function canonicalizeElf(raw) {
  if (!(raw instanceof Uint8Array) || raw.byteLength < 52 || raw.byteLength > 48 * 1024) {
    throw new Error('SOURCE_BUILD_OUTPUT_INVALID');
  }
  const input = new Uint8Array(raw);
  const inputView = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (input[0] !== 0x7f || input[1] !== 0x45 || input[2] !== 0x4c || input[3] !== 0x46
    || input[4] !== 1 || input[5] !== 1 || input[6] !== 1) {
    throw new Error('SOURCE_BUILD_OUTPUT_INVALID');
  }
  const programOffset = inputView.getUint32(28, true);
  const programEntryBytes = inputView.getUint16(42, true);
  const programCount = inputView.getUint16(44, true);
  let transportBytes = programOffset + programEntryBytes * programCount;
  if (programOffset < 52 || programEntryBytes !== 32 || programCount < 1 || programCount > 8
    || transportBytes > input.byteLength) throw new Error('SOURCE_BUILD_OUTPUT_INVALID');
  for (let index = 0; index < programCount; index += 1) {
    const offset = programOffset + index * programEntryBytes;
    const end = inputView.getUint32(offset + 4, true) + inputView.getUint32(offset + 16, true);
    if (!Number.isSafeInteger(end) || end > input.byteLength) {
      throw new Error('SOURCE_BUILD_OUTPUT_INVALID');
    }
    transportBytes = Math.max(transportBytes, end);
  }
  const elf = input.slice(0, transportBytes);
  const view = new DataView(elf.buffer, elf.byteOffset, elf.byteLength);
  view.setUint32(32, 0, true);
  view.setUint16(46, 0, true);
  view.setUint16(48, 0, true);
  view.setUint16(50, 0, true);
  return elf;
}

async function inputJson() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 8192) throw new Error('BUILD_JOB_SIZE_INVALID');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

try {
  const job = await inputJson();
  if (!exactKeys(job, ['schema', 'profile', 'source', 'sourceSha256'])
    || job.schema !== JOB_SCHEMA || job.profile !== STM32_PROFILE
    || !/^[0-9a-f]{64}$/u.test(job.sourceSha256 ?? '')) throw new Error('BUILD_JOB_INVALID');
  const source = validateStm32Source(job.source);
  if (sha256(Buffer.from(source.source, 'utf8')) !== job.sourceSha256) {
    throw new Error('BUILD_SOURCE_IDENTITY_MISMATCH');
  }
  writeFileSync(`${WORK}/source.c`, source.source, { encoding: 'ascii', mode: 0o600 });
  const output = spawnSync('/opt/arm/bin/arm-none-eabi-gcc', [
    '-mcpu=cortex-m4', '-mthumb', '-mfloat-abi=soft',
    '-std=c11', '-Os', '-g0', '-Wall', '-Wextra', '-Werror',
    '-ffreestanding', '-fno-builtin', '-fno-common', '-fno-pic', '-fno-pie',
    '-fno-stack-protector', '-fno-unwind-tables', '-fno-asynchronous-unwind-tables',
    '-ffunction-sections', '-fdata-sections', `-I${CONTRACT}`,
    '-include', `${CONTRACT}/intent_stm32_runtime.h`, '-nostdlib',
    '-Wl,--gc-sections', '-Wl,--build-id=none', `-Wl,-T,${CONTRACT}/stm32f429.ld`,
    `${CONTRACT}/startup.S`, `${CONTRACT}/runtime.c`, `${WORK}/source.c`,
    '-o', `${WORK}/firmware.raw.elf`,
  ], {
    encoding: 'utf8', timeout: 8000, maxBuffer: 64 * 1024,
    env: { PATH: '/opt/arm/bin:/usr/bin:/bin', LC_ALL: 'C', SOURCE_DATE_EPOCH: '1760572800' },
  });
  if (output.error || output.status !== 0) {
    emit({ schema: RESULT_SCHEMA, status: 'failed', code: 'SOURCE_BUILD_COMPILE_FAILED',
      diagnostic: String(output.stderr ?? output.error?.message ?? '').replaceAll(WORK, '').slice(-2000) });
    process.exitCode = 2;
  } else {
    const elf = canonicalizeElf(new Uint8Array(readFileSync(`${WORK}/firmware.raw.elf`)));
    const elfSha256 = sha256(elf);
    const loaded = loadStm32F429FirmwareArtifact({
      profile: STM32_PROFILE, format: 'elf32', bytes: elf, expectedSha256: elfSha256,
    });
    emit({
      schema: RESULT_SCHEMA,
      status: 'succeeded',
      profile: STM32_PROFILE,
      sourceSha256: job.sourceSha256,
      behavior: { pb0: source.pb0, marker: source.marker, uartText: source.uartText },
      elf: { format: 'elf32', bytes: elf.byteLength, sha256: elfSha256,
        base64: Buffer.from(elf).toString('base64') },
      vector: {
        initialStackPointer: loaded.descriptor.initialStackPointer,
        resetVector: loaded.descriptor.resetVector,
        entryPoint: loaded.descriptor.entryPoint,
      },
      compiler: { id: 'arm-none-eabi-gcc', version: '14.3.1', release: '14.3.rel1',
        compilerInvoked: true, network: 'none' },
    });
    elf.fill(0);
  }
} catch (error) {
  emit({ schema: RESULT_SCHEMA, status: 'failed', code: error?.code ?? error?.message ?? 'BUILD_WORKER_FAILED' });
  process.exitCode = 2;
}
