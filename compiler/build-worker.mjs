// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import dns from 'node:dns/promises';
import net from 'node:net';
import {
  BUILD_LIMITS,
  WORKER_JOB_SCHEMA,
  normalizeBuildRequestValue,
  parseStrictJson,
  sha256,
  sourceDigest,
} from './build-protocol.mjs';

const WORKSPACE = '/workspace';
const SKETCH = `${WORKSPACE}/main`;
const BUILD = `${WORKSPACE}/build`;
const OUTPUT = `${WORKSPACE}/out`;

function exactKeys(value, expected) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

async function readStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > BUILD_LIMITS.requestBytes) throw Object.assign(new Error('worker input too large'), { code: 'REQUEST_LIMIT' });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function blockedTcp() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '1.1.1.1', port: 53 });
    const timer = setTimeout(() => { socket.destroy(); resolve(true); }, 250);
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(false); });
    socket.once('error', () => { clearTimeout(timer); resolve(true); });
  });
}

async function readOptional(pathname) {
  try { return (await readFile(pathname, 'utf8')).trim(); } catch { return null; }
}

async function cannotWrite(pathname) {
  try {
    await writeFile(pathname, 'probe', { flag: 'wx' });
    await rm(pathname, { force: true });
    return false;
  } catch { return true; }
}

async function isolationEvidence() {
  let dnsBlocked = false;
  try { await dns.lookup('example.com'); } catch { dnsBlocked = true; }
  const status = await readFile('/proc/self/status', 'utf8');
  const field = (name) => new RegExp(`^${name}:\\s*(.+)$`, 'm').exec(status)?.[1] ?? null;
  const devices = await readdir('/dev');
  return {
    uid: process.getuid?.(),
    gid: process.getgid?.(),
    networkInterfaces: Object.keys(networkInterfaces()).sort(),
    dnsBlocked,
    tcpBlocked: await blockedTcp(),
    dockerSocketAbsent: await access('/var/run/docker.sock', fsConstants.F_OK).then(() => false, () => true),
    unsafeDevices: devices.filter((name) => /^(?:ttyUSB|ttyACM|video|sg|sd|nvme)/.test(name)),
    rootFilesystemReadOnly: await cannotWrite('/teach-lab-write-probe'),
    toolchainReadOnly: await cannotWrite('/opt/arduino/teach-lab-write-probe'),
    capabilityMask: field('CapEff'),
    noNewPrivileges: field('NoNewPrivs'),
    seccomp: field('Seccomp'),
    pidsMax: await readOptional('/sys/fs/cgroup/pids.max'),
    memoryMax: await readOptional('/sys/fs/cgroup/memory.max'),
    cpuMax: await readOptional('/sys/fs/cgroup/cpu.max'),
    suspiciousEnvironmentKeys: Object.keys(process.env).filter((key) => /(?:secret|token|password|credential|cookie|api[_-]?key)/i.test(key)),
  };
}

function runCompiler() {
  const args = [
    'compile', '--config-file', '/opt/arduino/arduino-cli.yaml',
    '--fqbn', 'arduino:avr:uno', '--build-path', BUILD, '--output-dir', OUTPUT,
    '--warnings', 'all', '--no-color', SKETCH,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/local/bin/arduino-cli', args, {
      shell: false,
      env: {
        PATH: process.env.PATH,
        HOME: '/tmp/home',
        ARDUINO_DIRECTORIES_DATA: '/tmp/data',
        ARDUINO_DIRECTORIES_DOWNLOADS: '/tmp/downloads',
        ARDUINO_DIRECTORIES_USER: '/tmp/user',
        NO_UPDATE_NOTIFIER: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    const collect = (target) => (chunk) => {
      bytes += chunk.length;
      if (bytes > BUILD_LIMITS.diagnosticsBytes) child.kill('SIGKILL');
      else target.push(chunk);
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({
      code,
      signal,
      overflow: bytes > BUILD_LIMITS.diagnosticsBytes,
      text: Buffer.concat([...stdout, ...stderr]).toString('utf8'),
    }));
  });
}

function sanitiseDiagnostics(text) {
  const clean = text
    .replaceAll(SKETCH + '/', '')
    .replaceAll(BUILD, '<build>')
    .replaceAll(OUTPUT, '<output>')
    .replace(/\/opt\/arduino\/[^\s:]*/g, '<toolchain>')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .slice(0, BUILD_LIMITS.diagnosticsBytes);
  const diagnostics = [];
  for (const line of clean.split('\n')) {
    const match = /^([^:\n]+):(\d+)(?::(\d+))?:\s*(?:(warning|error|note):\s*)?(.*)$/.exec(line.trim());
    if (match && diagnostics.length < 200) diagnostics.push({
      file: match[1].slice(0, 64),
      line: Number(match[2]),
      column: match[3] ? Number(match[3]) : null,
      severity: match[4] ?? 'error',
      message: match[5].slice(0, 500),
    });
  }
  return { text: clean, diagnostics };
}

async function prepare(request) {
  await Promise.all([
    rm(SKETCH, { recursive: true, force: true }),
    rm(BUILD, { recursive: true, force: true }),
    rm(OUTPUT, { recursive: true, force: true }),
  ]);
  await Promise.all([
    mkdir(SKETCH, { recursive: true }), mkdir(BUILD, { recursive: true }), mkdir(OUTPUT, { recursive: true }),
    mkdir('/tmp/data', { recursive: true }), mkdir('/tmp/downloads', { recursive: true }),
    mkdir('/tmp/user', { recursive: true }), mkdir('/tmp/home', { recursive: true }),
  ]);
  await symlink('/opt/arduino/data/packages', '/tmp/data/packages');
  await Promise.all([
    writeFile('/tmp/data/package_index.json', '{"packages":[]}\n'),
    writeFile('/tmp/data/library_index.json', '{"libraries":[]}\n'),
    ...request.files.map((file) => writeFile(`${SKETCH}/${file.name}`, file.content, { mode: 0o400 })),
  ]);
}

async function main() {
  const raw = await readStdin();
  const job = parseStrictJson(raw);
  if (!exactKeys(job, ['schema', 'request', 'sourceDigest']) || job.schema !== WORKER_JOB_SCHEMA) {
    throw Object.assign(new Error('invalid worker job'), { code: 'WORKER_JOB_SHAPE' });
  }
  const request = normalizeBuildRequestValue(job.request);
  if (sourceDigest(request) !== job.sourceDigest) throw Object.assign(new Error('source identity mismatch'), { code: 'SOURCE_IDENTITY_MISMATCH' });
  const isolation = await isolationEvidence();
  await prepare(request);
  const compiler = await runCompiler();
  const output = sanitiseDiagnostics(compiler.text);
  if (compiler.overflow) return { status: 'failed', code: 'DIAGNOSTIC_LIMIT', ...output, isolation };
  if (compiler.code !== 0) return { status: 'failed', code: 'COMPILE_FAILED', ...output, isolation };
  const [hex, elf] = await Promise.all([
    readFile(`${OUTPUT}/main.ino.hex`), readFile(`${OUTPUT}/main.ino.elf`),
  ]);
  if (hex.length + elf.length > BUILD_LIMITS.outputBytes) {
    return { status: 'failed', code: 'OUTPUT_LIMIT', text: '', diagnostics: [], isolation };
  }
  return {
    status: 'succeeded',
    code: 'BUILD_OK',
    diagnostics: output.diagnostics,
    text: output.text,
    isolation,
    artifact: {
      hex: hex.toString('utf8'),
      elfBase64: elf.toString('base64'),
      hexSha256: sha256(hex),
      elfSha256: sha256(elf),
      hexBytes: hex.length,
      elfBytes: elf.length,
    },
  };
}

try {
  const result = await main();
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    status: 'failed',
    code: error.code ?? 'WORKER_FAILURE',
    diagnostics: [],
    text: 'The isolated compiler worker rejected the job.',
  })}\n`);
  process.exitCode = 1;
}
