// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import http from 'node:http';
import path from 'node:path';
import { BuildCoordinator } from '../compiler/build-coordinator.mjs';
import { DockerBuildBroker, loadImageLock } from '../compiler/docker-broker.mjs';
import { createRequestHandler } from '../compiler/http-gateway.mjs';

const root = path.resolve(process.env.STAGING_ROOT ?? new URL('../dist', import.meta.url).pathname);
const host = process.env.STAGING_HOST ?? '127.0.0.1';
const port = Number(process.env.STAGING_PORT ?? 18766);
if (process.env.ENABLE_ESP32C3_COMPILE_ONLY === '1') {
  throw new Error('PUBLIC_PROJECTION_PRIVATE_TARGET_FORBIDDEN');
}
const imageLockPath = process.env.COMPILER_IMAGE_LOCK ? path.resolve(process.env.COMPILER_IMAGE_LOCK) : undefined;
const imageLock = await loadImageLock(imageLockPath);
const avrBroker = new DockerBuildBroker({ imageLock });
const coordinator = new BuildCoordinator({
  broker: avrBroker,
  imageLock,
  identityLockFor: (profile) => profile === 'board.atmega328p-16mhz-v1' ? imageLock : null,
});
const publicOrigin = process.env.PUBLIC_ORIGIN || null;
const trustProxy = process.env.TRUST_PROXY === '1';
const deploymentScope = process.env.DEPLOYMENT_SCOPE ?? 'public-release-projection';
const readiness = { ready: false, code: 'TOOLCHAIN_IMAGE_UNVERIFIED' };
async function verifyCompiler() {
  try {
    // Public readiness covers only the accepted AVR service. Preview-only
    // profiles have no broker, route, runtime or lazy private image load.
    await avrBroker.verifyImage();
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
