// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import net from 'node:net';

import { RspClient } from './rsp-observer.mjs';

export const GPIO2_WATCH_ADDRESSES = Object.freeze([
  0x60004004, // GPIO_OUT
  0x60004008, // GPIO_OUT_W1TS
  0x6000400c, // GPIO_OUT_W1TC
  0x60004020, // GPIO_ENABLE
  0x60004024, // GPIO_ENABLE_W1TS
  0x60004028, // GPIO_ENABLE_W1TC
  0x6000455c, // GPIO_FUNC2_OUT_SEL_CFG
  0x6000900c, // IO_MUX_GPIO2
]);

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function markerCount(path, marker) {
  try {
    const value = (await readFile(path)).toString('utf8');
    return value.split(marker).length - 1;
  } catch { return 0; }
}

async function connectQmp(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let socket;
  while (!socket && Date.now() < deadline) {
    try {
      socket = await new Promise((resolve, reject) => {
        const candidate = net.createConnection(path);
        candidate.once('connect', () => resolve(candidate));
        candidate.once('error', reject);
      });
    } catch { await sleep(10); }
  }
  if (!socket) throw new Error('GPIO_OBSERVER_QMP_UNAVAILABLE');
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
      let value;
      try { value = JSON.parse(line); } catch { continue; }
      const index = waiters.findIndex(({ predicate }) => predicate(value));
      if (index >= 0) waiters.splice(index, 1)[0].resolve(value); else queue.push(value);
    }
  });
  const wait = (predicate) => {
    const index = queue.findIndex(predicate);
    if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('GPIO_OBSERVER_QMP_TIMEOUT')), timeoutMs);
      waiters.push({ predicate, resolve: (value) => { clearTimeout(timer); resolve(value); } });
    });
  };
  await wait((value) => Boolean(value.QMP));
  let id = 0;
  const execute = async (command) => {
    id += 1;
    socket.write(`${JSON.stringify({ execute: command, id })}\n`);
    const value = await wait((entry) => entry.id === id);
    if (value.error) throw new Error('GPIO_OBSERVER_QMP_COMMAND_FAILED');
    return value.return;
  };
  await execute('qmp_capabilities');
  return { execute, close: () => socket.end() };
}

async function continueToMarker(rsp, serialPath, marker, expectedCount, timeoutMs) {
  let interrupted = false;
  const deadline = Date.now() + timeoutMs;
  const timer = setInterval(async () => {
    if (interrupted || Date.now() >= deadline) return;
    if (await markerCount(serialPath, marker) >= expectedCount) {
      interrupted = true;
      rsp.interrupt();
    }
  }, 10);
  try {
    const stop = await rsp.continue();
    if (Date.now() >= deadline) throw new Error('GPIO_OBSERVER_MARKER_TIMEOUT');
    return { stop, markerReached: interrupted };
  } finally { clearInterval(timer); }
}

export async function observeQemuGpio({
  qemuPath = '/opt/qemu/bin/qemu-system-riscv32', firmwarePath,
  firmwareKind = 'flash', marker, epochs = 2, timeoutMs = 12_000,
  serialPath = '/tmp/c3-gpio-observer-serial.bin',
  qmpPath = '/tmp/c3-gpio-observer-qmp.sock', gdbPort = 12341,
}) {
  if (!['flash', 'kernel'].includes(firmwareKind) || !firmwarePath
    || typeof marker !== 'string' || !marker || !Number.isSafeInteger(epochs)
    || epochs < 1 || epochs > 2) throw new Error('GPIO_OBSERVER_ARGUMENT_INVALID');
  await Promise.all([serialPath, qmpPath].map((path) => unlink(path).catch(() => {})));
  const firmwareArgs = firmwareKind === 'flash'
    ? ['-drive', `file=${firmwarePath},if=mtd,format=raw`]
    : ['-kernel', firmwarePath];
  const child = spawn(qemuPath, [
    '-M', 'esp32c3', '-accel', 'tcg,thread=single', '-S',
    '-gdb', `tcp:127.0.0.1:${gdbPort}`, '-display', 'none', '-monitor', 'none',
    '-serial', `file:${serialPath}`, '-qmp', `unix:${qmpPath},server=on,wait=off`,
    '-nic', 'none', ...firmwareArgs, '-L', '/opt/qemu/share/qemu',
  ], {
    env: { HOME: '/tmp', LD_LIBRARY_PATH: '/opt/qemu/deps', PATH: '/usr/bin:/bin' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { if (stderr.length < 64 * 1024) stderr += chunk; });
  const closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  const hardTimer = setTimeout(() => child.kill('SIGKILL'), timeoutMs * epochs + 5000);
  let rsp;
  let qmp;
  const events = [];
  try {
    [rsp, qmp] = await Promise.all([
      RspClient.connect({ port: gdbPort, timeoutMs: 5000 }), connectQmp(qmpPath, 5000),
    ]);
    await rsp.command('qSupported');
    for (const address of GPIO2_WATCH_ADDRESSES) await rsp.addWriteWatchpoint(address);
    for (let epoch = 1; epoch <= epochs; epoch += 1) {
      for (;;) {
        const outcome = await continueToMarker(rsp, serialPath, marker, epoch, timeoutMs);
        if (outcome.markerReached) break;
        const event = await rsp.executedStore(outcome.stop);
        if (!event) throw new Error('GPIO_OBSERVER_UNEXPECTED_STOP');
        events.push(Object.freeze({ epoch, ...event }));
        if (events.length > 4096) throw new Error('GPIO_OBSERVER_EVENT_LIMIT');
        if (event.storePending) {
          await rsp.removeWriteWatchpoint(event.watchAddress);
          const stepped = await rsp.step();
          if (!/^(?:S|T)05/iu.test(stepped)) throw new Error('GPIO_OBSERVER_STEP_FAILED');
          await rsp.addWriteWatchpoint(event.watchAddress);
        }
      }
      if (epoch < epochs) await qmp.execute('system_reset');
    }
    await qmp.execute('quit').catch(() => {});
    const outcome = await closed;
    if (outcome.code !== 0) throw new Error('GPIO_OBSERVER_CHILD_FAILED');
    const serial = await readFile(serialPath);
    return Object.freeze({
      schema: 'intent-mcu-c3-executed-register-writes@1',
      cpuExecution: 'Espressif QEMU esp32c3',
      peripheralInterpretation: 'IntentForce project-owned ESP32-C3 GPIO2 adapter',
      qemuPinStateObserved: false,
      marker,
      epochs,
      events,
      serialText: serial.toString('utf8'),
      serialBytes: serial.length,
      stderrBytes: Buffer.byteLength(stderr),
    });
  } catch (error) {
    const detail = stderr.replaceAll('\n', ' ').trim().slice(-800);
    throw new Error(detail ? `${error.message}:${detail}` : error.message);
  } finally {
    clearTimeout(hardTimer);
    rsp?.close(); qmp?.close();
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed.catch(() => {});
    await Promise.all([serialPath, qmpPath].map((path) => unlink(path).catch(() => {})));
  }
}
