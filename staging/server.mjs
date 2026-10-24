// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import http from 'node:http';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { BuildCoordinator } from '../compiler/build-coordinator.mjs';
import { DockerBuildBroker, loadImageLock } from '../compiler/docker-broker.mjs';
import { createRequestHandler } from '../compiler/http-gateway.mjs';
import { BuildProtocolError, RP2040_BOARD_PROFILE } from '../compiler/build-protocol.mjs';
import { createC3PublicService } from '../c3/public-service.mjs';
import { createStm32PublicService } from '../stm32/public-service.mjs';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { AggregatePageViewCounter, createPageViewHandler } from '../src/page-view-counter.mjs';

const execute = promisify(execFile);
const candidateRoot = path.resolve(new URL('../', import.meta.url).pathname);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const root = path.resolve(process.env.STAGING_ROOT ?? new URL('../dist', import.meta.url).pathname);
const host = process.env.STAGING_HOST ?? '127.0.0.1';
const port = Number(process.env.STAGING_PORT ?? 18766);
if (process.env.ENABLE_ESP32C3_COMPILE_ONLY === '1') {
  throw new Error('PUBLIC_PROJECTION_PRIVATE_TARGET_FORBIDDEN');
}
const imageLockPath = process.env.COMPILER_IMAGE_LOCK ? path.resolve(process.env.COMPILER_IMAGE_LOCK) : undefined;
const imageLock = await loadImageLock(imageLockPath);
const publicCompilerDeadlineMs = 30_000;
const rp2040ImageLockPath = process.env.RP2040_COMPILER_IMAGE_LOCK
  ? path.resolve(process.env.RP2040_COMPILER_IMAGE_LOCK) : null;
if (!rp2040ImageLockPath) throw new Error('RP2040_COMPILER_IMAGE_LOCK_REQUIRED');
const rp2040ImageLock = await loadImageLock(rp2040ImageLockPath);
const x37PrivateLockPath = process.env.X37_PRIVATE_COMPILER_IMAGE_LOCK
  ? path.resolve(process.env.X37_PRIVATE_COMPILER_IMAGE_LOCK) : null;
const x37PrivateRouteNonce = process.env.X37_PRIVATE_COMPILER_ROUTE_NONCE ?? null;
if (Boolean(x37PrivateLockPath) !== Boolean(x37PrivateRouteNonce)
    || (x37PrivateRouteNonce && !/^[A-Za-z0-9_-]{40,80}$/u.test(x37PrivateRouteNonce))) {
  throw new Error('X37_PRIVATE_COMPILER_ROUTE_CONFIGURATION_INVALID');
}
const x37PrivateImageLock = x37PrivateLockPath ? await loadImageLock(x37PrivateLockPath) : null;
const c3Enabled = process.env.ENABLE_ESP32C3_PUBLIC === '1';
let c3Service = null;
if (c3Enabled) {
  const builderLockPath = process.env.ESP32C3_BUILDER_IMAGE_LOCK
    ? path.resolve(process.env.ESP32C3_BUILDER_IMAGE_LOCK) : null;
  const runtimeLockPath = process.env.ESP32C3_RUNTIME_IMAGE_LOCK
    ? path.resolve(process.env.ESP32C3_RUNTIME_IMAGE_LOCK) : null;
  if (!builderLockPath || !runtimeLockPath) throw new Error('ESP32C3_IMAGE_LOCKS_REQUIRED');
  c3Service = createC3PublicService({
    builderImageLock: await loadImageLock(builderLockPath),
    runtimeImageLock: await loadImageLock(runtimeLockPath),
    publicOrigin: process.env.PUBLIC_ORIGIN || null,
    trustProxy: process.env.TRUST_PROXY === '1',
    testMode: process.env.C3_TEST_MODE === '1',
  });
}
const stm32Enabled = process.env.ENABLE_STM32_PUBLIC === '1';
let stm32Service = null;
if (stm32Enabled) {
  const builderLockPath = process.env.STM32_BUILDER_IMAGE_LOCK
    ? path.resolve(process.env.STM32_BUILDER_IMAGE_LOCK) : null;
  const runtimeLockPath = process.env.STM32_RUNTIME_IMAGE_LOCK
    ? path.resolve(process.env.STM32_RUNTIME_IMAGE_LOCK) : null;
  if (!builderLockPath || !runtimeLockPath) throw new Error('STM32_IMAGE_LOCKS_REQUIRED');
  stm32Service = createStm32PublicService({
    builderImageLock: await loadImageLock(builderLockPath),
    runtimeImageLock: await loadImageLock(runtimeLockPath),
    publicOrigin: process.env.PUBLIC_ORIGIN || null,
    trustProxy: process.env.TRUST_PROXY === '1',
    testMode: process.env.STM32_TEST_MODE === '1',
  });
}
const avrBroker = new DockerBuildBroker({ imageLock, deadlineMs: publicCompilerDeadlineMs });
const rp2040Broker = new DockerBuildBroker({ imageLock: rp2040ImageLock,
  deadlineMs: publicCompilerDeadlineMs });
const x37PrivateBroker = x37PrivateImageLock ? new DockerBuildBroker({ imageLock: x37PrivateImageLock,
  deadlineMs: publicCompilerDeadlineMs }) : null;
const broker = Object.freeze({
  compile(request, options) {
    if (options?.route === 'x37-reviewed') {
      if (request.board !== RP2040_BOARD_PROFILE || !x37PrivateBroker) {
        throw new Error('X37_PRIVATE_COMPILER_ROUTE_UNAVAILABLE');
      }
      return x37PrivateBroker.compile(request, options);
    }
    return (request.board === RP2040_BOARD_PROFILE ? rp2040Broker : avrBroker).compile(request, options);
  },
});
const coordinator = new BuildCoordinator({
  broker,
  imageLock,
  identityLockFor: (profile, route) => route === 'x37-reviewed' && profile === RP2040_BOARD_PROFILE ? x37PrivateImageLock
    : profile === 'board.atmega328p-16mhz-v1' ? imageLock
    : profile === RP2040_BOARD_PROFILE ? rp2040ImageLock : null,
  globalLimit: 1,
  perOriginLimit: 1,
  queueLimit: 4,
  rateLimit: 6,
  jobLimit: 24,
});
const publicOrigin = process.env.PUBLIC_ORIGIN || null;
const trustProxy = process.env.TRUST_PROXY === '1';
const deploymentScope = process.env.DEPLOYMENT_SCOPE ?? 'public-release-projection';
const readiness = { ready: false, code: 'TOOLCHAIN_IMAGE_UNVERIFIED' };
async function verifyCompiler() {
  try {
    await Promise.all([
      avrBroker.verifyImage(), rp2040Broker.verifyImage(), ...(x37PrivateBroker ? [x37PrivateBroker.verifyImage()] : []),
      ...(c3Service ? [c3Service.verifyImages()] : []),
      ...(stm32Service ? [stm32Service.verifyImages()] : []),
    ]);
    readiness.ready = true;
    readiness.code = 'READY';
  } catch {
    readiness.ready = false;
    readiness.code = 'TOOLCHAIN_IMAGE_UNAVAILABLE';
  }
}
await verifyCompiler();
setInterval(verifyCompiler, 5_000).unref();
const handler = createRequestHandler({ coordinator, root, publicOrigin, trustProxy, deploymentScope, readiness: () => readiness,
  resolveBuildRoute: (request) => {
    const supplied = request.headers['x-x37-compiler-route'];
    if (supplied === undefined) return null;
    if (!x37PrivateRouteNonce || supplied !== x37PrivateRouteNonce) {
      throw new BuildProtocolError('X37_PRIVATE_COMPILER_ROUTE_REJECTED', 'Private compiler route rejected', 403);
    }
    return 'x37-reviewed';
  } });
const pageViewStore = process.env.PAGE_VIEW_STORE_PATH
  ? new AggregatePageViewCounter({ file: path.resolve(process.env.PAGE_VIEW_STORE_PATH) }) : null;
const pageViewHandler = pageViewStore ? createPageViewHandler(pageViewStore, { publicOrigin }) : null;

const server = http.createServer(async (request, response) => {
  if (process.env.X92_STM32_PRIVATE_TARGET_NONCE
      && request.method === 'GET' && request.url === '/__private/x92-stm32-target'
      && request.headers['x-x92-stm32-target'] === process.env.X92_STM32_PRIVATE_TARGET_NONCE) {
    const [main, serviceBytes, runnerBytes, harnessBytes, browserBytes, head, status] = await Promise.all([
      readFile(path.join(root, 'main.js')),
      readFile(path.join(candidateRoot, 'stm32/public-service.mjs')),
      readFile(path.join(candidateRoot, 'stm32/renode-runner.py')),
      readFile(path.join(candidateRoot, 'scripts/x92-stm32-native-harness.mjs')),
      readFile(path.join(candidateRoot, 'test/x92-stm32-native-product-browser.cjs')),
      execute('git', ['rev-parse', 'HEAD'], { cwd: candidateRoot }),
      execute('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: candidateRoot }),
    ]);
    const service = stm32Service?.attestation();
    const { schema: serviceSchema, ...serviceEvidence } = service ?? {};
    const value = { schema: 'intent-mcu-x92-stm32-private-target@1',
      gitCommit: head.stdout.trim(), gitClean: status.stdout.length === 0,
      distMainSha256: sha256(main), modelIdentity: `sha256:${CURRENT_MODEL_LIBRARY_LOCK.implementationSha256}`,
      serviceSourceSha256: sha256(serviceBytes), runnerSourceSha256: sha256(runnerBytes),
      harnessSha256: sha256(harnessBytes), browserSha256: sha256(browserBytes),
      stm32Service: Boolean(service), serviceSchema, ...serviceEvidence,
      readiness: readiness.ready === true && readiness.code === 'READY' && service?.imagesVerified === true };
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(`${JSON.stringify(value)}\n`); return;
  }
  if (c3Service && await c3Service.handle(request, response)) return;
  if (stm32Service && await stm32Service.handle(request, response)) return;
  if (pageViewHandler && await pageViewHandler(request, response)) return;
  await handler(request, response);
});

for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => {
  await c3Service?.close();
  await stm32Service?.close();
  server.close(() => process.exit(0));
});

server.listen(port, host, () => process.stdout.write(`Intent MCU Simulator listening on http://${host}:${port}\n`));
