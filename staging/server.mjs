// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import http from 'node:http';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { BuildCoordinator } from '../compiler/build-coordinator.mjs';
import { DockerBuildBroker, loadImageLock } from '../compiler/docker-broker.mjs';
import { createRequestHandler } from '../compiler/http-gateway.mjs';
import { RP2040_BOARD_PROFILE } from '../compiler/build-protocol.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const root = path.resolve(process.env.STAGING_ROOT ?? new URL('../dist', import.meta.url).pathname);
const host = process.env.STAGING_HOST ?? '127.0.0.1';
const port = Number(process.env.STAGING_PORT ?? 18766);
if (process.env.ENABLE_ESP32C3_COMPILE_ONLY === '1') {
  throw new Error('PUBLIC_PROJECTION_PRIVATE_TARGET_FORBIDDEN');
}
const imageLockPath = process.env.COMPILER_IMAGE_LOCK ? path.resolve(process.env.COMPILER_IMAGE_LOCK) : undefined;
const imageLock = await loadImageLock(imageLockPath);
const rp2040ImageLockPath = process.env.RP2040_COMPILER_IMAGE_LOCK
  ? path.resolve(process.env.RP2040_COMPILER_IMAGE_LOCK) : null;
if (!rp2040ImageLockPath) throw new Error('RP2040_COMPILER_IMAGE_LOCK_REQUIRED');
const rp2040ImageLock = await loadImageLock(rp2040ImageLockPath);
const avrBroker = new DockerBuildBroker({ imageLock });
const rp2040Broker = new DockerBuildBroker({ imageLock: rp2040ImageLock, deadlineMs: 12_000 });
const broker = Object.freeze({
  compile(request, options) {
    return (request.board === RP2040_BOARD_PROFILE ? rp2040Broker : avrBroker).compile(request, options);
  },
});
const coordinator = new BuildCoordinator({
  broker,
  imageLock,
  identityLockFor: (profile) => profile === 'board.atmega328p-16mhz-v1' ? imageLock
    : profile === RP2040_BOARD_PROFILE ? rp2040ImageLock : null,
  globalLimit: 1,
  perOriginLimit: 1,
  queueLimit: 4,
  rateLimit: 6,
  jobLimit: 24,
  cacheLimit: 8,
});
const publicOrigin = process.env.PUBLIC_ORIGIN || null;
const trustProxy = process.env.TRUST_PROXY === '1';
const deploymentScope = process.env.DEPLOYMENT_SCOPE ?? 'public-release-projection';
const readiness = { ready: false, code: 'TOOLCHAIN_IMAGE_UNVERIFIED' };
async function verifyCompiler() {
  try {
    await Promise.all([avrBroker.verifyImage(), rp2040Broker.verifyImage()]);
    readiness.ready = true;
    readiness.code = 'READY';
  } catch {
    readiness.ready = false;
    readiness.code = 'TOOLCHAIN_IMAGE_UNAVAILABLE';
  }
}
await verifyCompiler();
setInterval(verifyCompiler, 5_000).unref();
const handler = createRequestHandler({ coordinator, root, publicOrigin, trustProxy, deploymentScope, readiness: () => readiness });

const server = http.createServer(handler);

server.listen(port, host, () => process.stdout.write(`Intent MCU Simulator listening on http://${host}:${port}\n`));
