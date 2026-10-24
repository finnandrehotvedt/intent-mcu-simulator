// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { networkInterfaces } from 'node:os';
import dns from 'node:dns/promises';
import net from 'node:net';

const WORKSPACE = '/workspace';
const CONTRACT = '/opt/teach-lab/rp2040-contract';
const SOURCE = `${WORKSPACE}/source.c`;
const ELF = `${WORKSPACE}/firmware.elf`;
const BINARY = `${WORKSPACE}/firmware.bin`;
const REQUEST_SCHEMA = 'intent-mcu-rp2040-source-build-request@1';
const JOB_SCHEMA = 'teach-lab-worker-job@1';
const PROFILE = 'board.rp2040-pico-v1';
const TOOLCHAIN_ARCHIVE_SHA256 = '8f6903f8ceb084d9227b9ef991490413014d991874a1e34074443c2a72b14dbd';
const UF2_MAGIC_START0 = 0x0a324655;
const UF2_MAGIC_START1 = 0x9e5d5157;
const UF2_MAGIC_END = 0x0ab16f30;
const UF2_FAMILY_FLAG = 0x00002000;
const UF2_FAMILY_ID = 0xe48bff56;
const FLASH_START = 0x10000000;
const CONSTANT_SOURCE_PATTERN = /^\/\* Intent MCU Simulator public RP2040 source v1 \*\/\nint main\(void\)\n\{\n  intent_gpio0_output\(([01])u\);\n  intent_uart0_text\("([A-Z0-9 _-]{1,24})"\);\n  intent_halt\(\);\n\}\n$/u;
const X37_REFLECT_SOURCE = `/* Intent MCU Simulator private X37 RP2040 reflect source v1 */
int main(void)
{
  intent_gpio0_reflect_gpio1_4096();
  intent_uart0_text("X37 REFLECT");
  intent_halt();
}
`;
const X37_TURNAROUND_SOURCE = `/* Intent MCU Simulator private X37 RP2040 turnaround source v1 */
int main(void)
{
  intent_x37_turnaround_8192();
  intent_uart0_text("X37 TURNAROUND");
  intent_halt();
}
`;
const validSource = (source) => CONSTANT_SOURCE_PATTERN.test(source)
  || source === X37_REFLECT_SOURCE || source === X37_TURNAROUND_SOURCE;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

async function readStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 16 * 1024) throw Object.assign(new Error('worker input too large'), { code: 'REQUEST_LIMIT' });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function validateJob(value) {
  if (!exactKeys(value, ['schema', 'request', 'sourceDigest']) || value.schema !== JOB_SCHEMA
      || !exactKeys(value.request, ['schema', 'board', 'files'])
      || value.request.schema !== REQUEST_SCHEMA || value.request.board !== PROFILE
      || !Array.isArray(value.request.files) || value.request.files.length !== 1
      || !exactKeys(value.request.files[0], ['name', 'content'])
      || value.request.files[0].name !== 'main.c'
      || typeof value.request.files[0].content !== 'string'
      || !/^[0-9a-f]{64}$/u.test(value.sourceDigest)) {
    throw Object.assign(new Error('invalid RP2040 worker job'), { code: 'WORKER_JOB_SHAPE' });
  }
  const canonical = Buffer.from(JSON.stringify({
    schema: value.request.schema,
    board: value.request.board,
    files: [{ name: 'main.c', content: value.request.files[0].content }],
  }));
  if (sha256(canonical) !== value.sourceDigest) {
    throw Object.assign(new Error('source identity mismatch'), { code: 'SOURCE_IDENTITY_MISMATCH' });
  }
  const source = value.request.files[0].content;
  if (Buffer.byteLength(source, 'utf8') > 4096 || !validSource(source)) {
    throw Object.assign(new Error('bounded source policy rejected input'), { code: 'SOURCE_POLICY_REJECTED' });
  }
  return { source, sourceSha256: sha256(source) };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      env: { PATH: '/opt/arm/bin:/usr/bin:/bin', HOME: '/tmp/home', LC_ALL: 'C', SOURCE_DATE_EPOCH: '1760572800' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    const collect = (target) => (chunk) => {
      bytes += chunk.length;
      if (bytes > 256 * 1024) child.kill('SIGKILL');
      else target.push(chunk);
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({
      code, signal, overflow: bytes > 256 * 1024,
      text: Buffer.concat([...stdout, ...stderr]).toString('utf8'),
    }));
  });
}

function cleanDiagnostic(value) {
  return String(value ?? '')
    .replaceAll(SOURCE, 'main.c')
    .replaceAll(CONTRACT, '<fixed-contract>')
    .replace(/\/opt\/arm\/[^\s:]*/gu, '<arm-toolchain>')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .slice(-64 * 1024);
}

function encodeUf2(image) {
  const padded = new Uint8Array(Math.ceil(image.byteLength / 4) * 4);
  padded.set(image);
  const blockCount = Math.ceil(padded.byteLength / 256);
  const result = new Uint8Array(blockCount * 512);
  for (let block = 0; block < blockCount; block += 1) {
    const offset = block * 512;
    const sourceOffset = block * 256;
    const payloadBytes = Math.min(256, padded.byteLength - sourceOffset);
    const view = new DataView(result.buffer, offset, 512);
    view.setUint32(0, UF2_MAGIC_START0, true);
    view.setUint32(4, UF2_MAGIC_START1, true);
    view.setUint32(8, UF2_FAMILY_FLAG, true);
    view.setUint32(12, FLASH_START + sourceOffset, true);
    view.setUint32(16, payloadBytes, true);
    view.setUint32(20, block, true);
    view.setUint32(24, blockCount, true);
    view.setUint32(28, UF2_FAMILY_ID, true);
    result.set(padded.slice(sourceOffset, sourceOffset + payloadBytes), offset + 32);
    view.setUint32(508, UF2_MAGIC_END, true);
  }
  return result;
}

async function blockedTcp() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '1.1.1.1', port: 53 });
    const timer = setTimeout(() => { socket.destroy(); resolve(true); }, 250);
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(false); });
    socket.once('error', () => { clearTimeout(timer); resolve(true); });
  });
}

async function cannotWrite(pathname) {
  try { await writeFile(pathname, 'probe', { flag: 'wx' }); await rm(pathname, { force: true }); return false; }
  catch { return true; }
}

async function isolationEvidence() {
  let dnsBlocked = false;
  try { await dns.lookup('example.com'); } catch { dnsBlocked = true; }
  const status = await readFile('/proc/self/status', 'utf8');
  const field = (name) => new RegExp(`^${name}:\\s*(.+)$`, 'm').exec(status)?.[1] ?? null;
  return {
    uid: process.getuid?.(), gid: process.getgid?.(),
    networkInterfaces: Object.keys(networkInterfaces()).sort(),
    dnsBlocked, tcpBlocked: await blockedTcp(),
    dockerSocketAbsent: await access('/var/run/docker.sock', fsConstants.F_OK).then(() => false, () => true),
    rootFilesystemReadOnly: await cannotWrite('/intent-mcu-write-probe'),
    toolchainReadOnly: await cannotWrite('/opt/arm/intent-mcu-write-probe'),
    capabilityMask: field('CapEff'), noNewPrivileges: field('NoNewPrivs'), seccomp: field('Seccomp'),
    pidsMax: await readFile('/sys/fs/cgroup/pids.max', 'utf8').then((value) => value.trim(), () => null),
    memoryMax: await readFile('/sys/fs/cgroup/memory.max', 'utf8').then((value) => value.trim(), () => null),
    suspiciousEnvironmentKeys: Object.keys(process.env).filter((key) => /(?:secret|token|password|credential|cookie|api[_-]?key)/iu.test(key)),
  };
}

async function compile(source) {
  await Promise.all([
    rm(SOURCE, { force: true }), rm(ELF, { force: true }), rm(BINARY, { force: true }),
    mkdir('/tmp/home', { recursive: true }),
  ]);
  await writeFile(SOURCE, source, { mode: 0o400 });
  const common = ['-mcpu=cortex-m0plus', '-mthumb', '-ffreestanding', '-fno-builtin', '-fno-common',
    '-fno-ident', '-ffunction-sections', '-fdata-sections', '-Os', '-g0', '-Wall', '-Wextra', '-Werror'];
  for (const [command, args] of [
    ['/opt/arm/bin/arm-none-eabi-gcc', [...common, '-x', 'assembler-with-cpp', '-c', `${CONTRACT}/startup.S`, '-o', `${WORKSPACE}/startup.o`]],
    ['/opt/arm/bin/arm-none-eabi-gcc', [...common, '-std=c11', '-nostdinc', '-include', `${CONTRACT}/intent_rp2040_runtime.h`, '-c', SOURCE, '-o', `${WORKSPACE}/source.o`]],
    ['/opt/arm/bin/arm-none-eabi-gcc', ['-mcpu=cortex-m0plus', '-mthumb', '-nostdlib', '-static', '-Wl,--build-id=none', '-Wl,--gc-sections', `-Wl,-T,${CONTRACT}/rp2040.ld`, `${WORKSPACE}/startup.o`, `${WORKSPACE}/source.o`, '-o', ELF]],
    ['/opt/arm/bin/arm-none-eabi-objcopy', ['-O', 'binary', ELF, BINARY]],
  ]) {
    const result = await run(command, args);
    if (result.overflow) throw Object.assign(new Error('compiler diagnostic limit'), { code: 'DIAGNOSTIC_LIMIT' });
    if (result.code !== 0) throw Object.assign(new Error(cleanDiagnostic(result.text)), { code: 'COMPILE_FAILED' });
  }
  const [elf, binary] = await Promise.all([readFile(ELF), readFile(BINARY)]);
  if (elf.byteLength < 1 || elf.byteLength > 4 * 1024 * 1024 || binary.byteLength < 9 || binary.byteLength > 2 * 1024 * 1024) {
    throw Object.assign(new Error('compiler output rejected'), { code: 'OUTPUT_LIMIT' });
  }
  const uf2 = encodeUf2(new Uint8Array(binary));
  return { elf, uf2 };
}

async function contractIdentity() {
  return Object.fromEntries(await Promise.all(['startup.S', 'rp2040.ld', 'intent_rp2040_runtime.h'].map(async (name) => {
    const bytes = await readFile(`${CONTRACT}/${name}`);
    return [name, { bytes: bytes.byteLength, sha256: sha256(bytes) }];
  })));
}

async function main() {
  const job = JSON.parse(await readStdin());
  const accepted = validateJob(job);
  const isolation = await isolationEvidence();
  const { elf, uf2 } = await compile(accepted.source);
  return {
    status: 'succeeded', code: 'BUILD_OK', diagnostics: [],
    text: 'Bounded RP2040 C11 source compiled in the fixed Arm GNU 14.3.1 toolchain.', isolation,
    artifact: {
      schema: 'intent-mcu-rp2040-compile-artifact@1', profile: PROFILE,
      sourceSha256: accepted.sourceSha256,
      compiler: { id: 'arm-none-eabi-gcc', version: '14.3.1', release: '14.3.rel1', archiveSha256: TOOLCHAIN_ARCHIVE_SHA256 },
      contract: await contractIdentity(),
      elf: { bytes: elf.byteLength, sha256: sha256(elf) },
      uf2: { bytes: uf2.byteLength, sha256: sha256(uf2), base64: Buffer.from(uf2).toString('base64') },
    },
  };
}

try {
  process.stdout.write(`${JSON.stringify(await main())}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    status: 'failed', code: error.code ?? 'WORKER_FAILURE', diagnostics: [],
    text: cleanDiagnostic(error.message || 'The bounded compiler worker rejected the job.'),
  })}\n`);
  process.exitCode = 1;
}
