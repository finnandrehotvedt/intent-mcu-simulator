#!/usr/bin/env node
// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmod, readFile, unlink, writeFile } from 'node:fs/promises';
import net from 'node:net';

import {
  FLASH_BYTES, QEMU_BINARY_SHA256, ROM_SHA256, ROM_VERSION,
} from './artifact.mjs';
import { FQBN, MARKER_PATTERN, PROFILE, exactKeys } from './protocol.mjs';
import { observeQemuGpio } from './qemu-gpio-observer.mjs';
import { interpretObservation } from './gpio2-adapter.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const QEMU = '/opt/qemu/bin/qemu-system-riscv32';
const FLASH = '/tmp/public-c3-flash.bin';
const SERIAL = '/tmp/public-c3-serial.bin';
const QMP = '/tmp/public-c3-qmp.sock';

function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitMarker(marker, count, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const bytes = await readFile(SERIAL);
      if (bytes.toString('utf8').split(marker).length - 1 >= count) return bytes;
    } catch {}
    await sleep(20);
  }
  throw new Error('RUNTIME_UART_TIMEOUT');
}

async function qmpClient(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let socket;
  while (!socket && Date.now() < deadline) {
    try {
      socket = await new Promise((resolve, reject) => {
        const value = net.createConnection(QMP);
        value.once('connect', () => resolve(value));
        value.once('error', reject);
      });
    } catch { await sleep(20); }
  }
  if (!socket) throw new Error('RUNTIME_QMP_UNAVAILABLE');
  socket.setEncoding('utf8');
  let buffer = '';
  const queue = [];
  const waiters = [];
  socket.on('data', (chunk) => {
    buffer += chunk;
    for (;;) {
      const newline = buffer.indexOf('\n');
      if (newline < 0) break;
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      const index = waiters.findIndex(({ predicate }) => predicate(message));
      if (index >= 0) waiters.splice(index, 1)[0].resolve(message); else queue.push(message);
    }
  });
  const wait = (predicate) => {
    const index = queue.findIndex(predicate);
    if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('RUNTIME_QMP_TIMEOUT')), timeoutMs);
      waiters.push({ predicate, resolve: (value) => { clearTimeout(timer); resolve(value); } });
    });
  };
  await wait((value) => Boolean(value.QMP));
  const execute = async (command, id) => {
    socket.write(`${JSON.stringify({ execute: command, id })}\n`);
    const result = await wait((value) => value.id === id);
    if (result.error) throw new Error('RUNTIME_QMP_COMMAND_FAILED');
  };
  await execute('qmp_capabilities', 'capabilities');
  return { execute, close: () => socket.end() };
}

function bootEpochs(serial, marker) {
  const text = serial.toString('utf8').replaceAll('\r', '');
  return text.split('ESP-ROM:').slice(1).filter((epoch) => epoch.includes(marker)).map((epoch) => {
    const value = {
      version: /^([^\n]+)/u.exec(epoch)?.[1],
      reset: /rst:([^,\n]+)/u.exec(epoch)?.[1],
      boot: /boot:([^\n]+)/u.exec(epoch)?.[1],
      mode: /mode:([^,\n]+)/u.exec(epoch)?.[1],
      entry: /entry (0x[0-9a-f]+)/u.exec(epoch)?.[1], marker,
    };
    if (value.version !== ROM_VERSION || value.boot !== '0x8 (SPI_FAST_FLASH_BOOT)'
      || value.mode !== 'DIO' || value.entry !== '0x403cbf10') {
      throw new Error('RUNTIME_BOOT_PROVENANCE_INVALID');
    }
    return value;
  });
}

async function run(mode, sourceSha256, flashSha256, marker, flash) {
  if (!['run', 'watchdog'].includes(mode) || !SHA256.test(sourceSha256)
    || !SHA256.test(flashSha256) || !MARKER_PATTERN.test(marker)
    || !(flash instanceof Uint8Array)) {
    throw new Error('RUNTIME_COMMAND_INVALID');
  }
  const [qemu, rom] = await Promise.all([
    readFile(QEMU), readFile('/opt/qemu/share/qemu/esp32c3-rom.bin'),
  ]);
  if (digest(qemu) !== QEMU_BINARY_SHA256 || digest(rom) !== ROM_SHA256
    || flash.length !== FLASH_BYTES || digest(flash) !== flashSha256) {
    throw new Error('RUNTIME_IDENTITY_MISMATCH');
  }
  if (flash[2] !== 2 || flash.subarray(0x10000).indexOf(Buffer.from(marker, 'ascii')) < 0) {
    throw new Error('RUNTIME_SOURCE_BINDING_INVALID');
  }
  await writeFile(FLASH, flash, { mode: 0o600 });
  flash.fill(0);
  await chmod(FLASH, 0o600);
  if (mode === 'run') {
    try {
      const observation = await observeQemuGpio({
        qemuPath: QEMU, firmwarePath: FLASH, firmwareKind: 'flash', marker,
        epochs: 2, timeoutMs: 12_000, serialPath: SERIAL, qmpPath: QMP,
      });
      const serial = Buffer.from(observation.serialText, 'utf8');
      const epochs = bootEpochs(serial, marker);
      if (epochs.length !== 2 || serial.toString('utf8').split(marker).length - 1 !== 2) {
        throw new Error('RUNTIME_UART_MISMATCH');
      }
      const adapterEpochs = interpretObservation(observation);
      return {
        schema: 'intent-mcu-esp32c3-public-runtime@1',
        profile: PROFILE, fqbn: FQBN, sourceSha256, flashSha256, marker,
        engine: { provider: 'Espressif', family: 'QEMU', version: '9.2.2-esp_develop_20260417',
          machine: 'esp32c3', binarySha256: QEMU_BINARY_SHA256, actualExecution: true },
        rom: { version: ROM_VERSION, sha256: ROM_SHA256 }, mode,
        uart: { exactApplicationText: marker, markerCount: 2,
          serialBytes: serial.length, sha256: digest(serial), bootEpochs: epochs,
          finalLf: serial.at(-1) === 0x0a },
        gpio: {
          cpuExecution: observation.cpuExecution,
          executedWrites: observation.events.length,
          adapterEpochs,
          peripheralInterpretation: observation.peripheralInterpretation,
          qemuPinStateObserved: false,
        },
        resetReplay: true, watchdog: false,
        lifecycle: { cpuPauseSupported: false, serialPlaybackPauseSupported: true },
        isolation: { network: 'none', durableSourceStorage: false },
        gpioPinStateObserved: false, generalEsp32Support: false, publicSupport: true,
        boundedPublicSupport: true,
        stderrBytes: observation.stderrBytes,
      };
    } finally {
      await Promise.all([FLASH, SERIAL, QMP].map((path) => unlink(path).catch(() => {})));
    }
  }
  const child = spawn(QEMU, [
    '-M', 'esp32c3', '-accel', 'tcg,thread=single', '-display', 'none',
    '-monitor', 'none', '-serial', `file:${SERIAL}`,
    '-qmp', `unix:${QMP},server=on,wait=off`, '-nic', 'none',
    '-drive', `file=${FLASH},if=mtd,format=raw`, '-L', '/opt/qemu/share/qemu',
  ], { env: { HOME: '/tmp', LD_LIBRARY_PATH: '/opt/qemu/deps', PATH: '/usr/bin:/bin' },
    stdio: ['ignore', 'ignore', 'pipe'] });
  let stderrBytes = 0;
  child.stderr.on('data', (chunk) => { stderrBytes = Math.min(65536, stderrBytes + chunk.length); });
  const closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  const hardTimer = setTimeout(() => child.kill('SIGKILL'), 20000);
  let qmp;
  let watchdog = false;
  try {
    await waitMarker(marker, 1, 8000);
    if (mode === 'run') {
      qmp = await qmpClient(3000);
      await qmp.execute('system_reset', 'reset');
      await waitMarker(marker, 2, 8000);
      await qmp.execute('quit', 'quit').catch(() => {});
    } else {
      await sleep(250);
      child.kill('SIGKILL');
      watchdog = true;
    }
    const outcome = await closed;
    if (mode === 'run' && outcome.code !== 0) throw new Error('RUNTIME_CHILD_FAILED');
    if (mode === 'watchdog' && outcome.signal !== 'SIGKILL') throw new Error('RUNTIME_WATCHDOG_FAILED');
    const serial = await readFile(SERIAL);
    const epochs = bootEpochs(serial, marker);
    const expected = mode === 'run' ? 2 : 1;
    if (epochs.length !== expected || serial.toString('utf8').split(marker).length - 1 !== expected) {
      throw new Error('RUNTIME_UART_MISMATCH');
    }
    return {
      schema: 'intent-mcu-esp32c3-public-runtime@1',
      profile: PROFILE, fqbn: FQBN, sourceSha256, flashSha256, marker,
      engine: { provider: 'Espressif', family: 'QEMU', version: '9.2.2-esp_develop_20260417',
        machine: 'esp32c3', binarySha256: QEMU_BINARY_SHA256, actualExecution: true },
      rom: { version: ROM_VERSION, sha256: ROM_SHA256 }, mode,
      uart: { exactApplicationText: marker, markerCount: expected,
        serialBytes: serial.length, sha256: digest(serial), bootEpochs: epochs,
        finalLf: serial.at(-1) === 0x0a },
      resetReplay: mode === 'run', watchdog,
      lifecycle: { cpuPauseSupported: false, serialPlaybackPauseSupported: true },
      isolation: { network: 'none', durableSourceStorage: false },
      gpioPinStateObserved: false, generalEsp32Support: false, publicSupport: true,
      boundedPublicSupport: true,
      stderrBytes,
    };
  } finally {
    clearTimeout(hardTimer);
    qmp?.close();
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await Promise.all([FLASH, SERIAL, QMP].map((path) => unlink(path).catch(() => {})));
  }
}

async function readJob() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 6 * 1024 * 1024) throw new Error('RUNTIME_REQUEST_LIMIT');
    chunks.push(chunk);
  }
  let job;
  try { job = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('RUNTIME_REQUEST_INVALID'); }
  if (!exactKeys(job, ['schema', 'mode', 'sourceSha256', 'flashSha256', 'marker', 'flashBase64'])
    || job.schema !== 'intent-mcu-esp32c3-runtime-job@1'
    || typeof job.flashBase64 !== 'string' || job.flashBase64.length % 4 !== 0
    || !/^[A-Za-z0-9+/]*={0,2}$/u.test(job.flashBase64)) {
    throw new Error('RUNTIME_REQUEST_INVALID');
  }
  const flash = Buffer.from(job.flashBase64, 'base64');
  if (flash.toString('base64') !== job.flashBase64) {
    flash.fill(0);
    throw new Error('RUNTIME_REQUEST_INVALID');
  }
  return { ...job, flash };
}

export async function main() {
  try {
    const job = await readJob();
    try {
      process.stdout.write(`${JSON.stringify(await run(
        job.mode, job.sourceSha256, job.flashSha256, job.marker, job.flash,
      ))}\n`);
    } finally { job.flash.fill(0); }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
    process.exitCode = 1;
  }
}

if (process.env.INTENT_MCU_C3_IMPORT_CHECK !== '1') await main();
