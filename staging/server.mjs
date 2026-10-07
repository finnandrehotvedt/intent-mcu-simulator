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
const imageLockPath = process.env.COMPILER_IMAGE_LOCK ? path.resolve(process.env.COMPILER_IMAGE_LOCK) : undefined;
const imageLock = await loadImageLock(imageLockPath);
const broker = new DockerBuildBroker({ imageLock });
const coordinator = new BuildCoordinator({ broker, imageLock });
const publicOrigin = process.env.PUBLIC_ORIGIN || null;
const trustProxy = process.env.TRUST_PROXY === '1';
const deploymentScope = process.env.DEPLOYMENT_SCOPE ?? 'non-public-m13';
const readiness = { ready: false, code: 'TOOLCHAIN_IMAGE_UNVERIFIED' };
async function verifyCompiler() {
  try {
    await broker.verifyImage();
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
