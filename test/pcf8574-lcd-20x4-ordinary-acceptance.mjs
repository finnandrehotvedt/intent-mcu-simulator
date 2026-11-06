// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeBuildRequestValue } from '../compiler/build-protocol.mjs';
import { DockerBuildBroker, loadImageLock } from '../compiler/docker-broker.mjs';
import { RuntimeKernel } from '../src/runtime-kernel.mjs';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import {
  PCF8574_LCD_GEOMETRY_20X4,
  createPcf8574LcdDecoder,
} from '../expansion-drafts/pcf8574-lcd-backpack-v1.mjs';

const source = await readFile(new URL(
  '../fixtures/pcf8574_lcd_20x4_water_tank/pcf8574_lcd_20x4_water_tank.ino', import.meta.url,
), 'utf8');
const request = normalizeBuildRequestValue({
  schema: 'teach-lab-build-request@1',
  board: 'board.atmega328p-16mhz-v1',
  files: [{ name: 'main.ino', content: source }],
});
const imageLock = await loadImageLock();
const build = await new DockerBuildBroker({ imageLock }).compile(request);
assert.equal(build.status, 'succeeded', build.text);
assert.equal(build.imageId, imageLock.imageId);
assert.equal(build.isolation.networkInterfaces.join(','), 'lo');
assert.equal(build.isolation.capabilityMask, '0000000000000000');
assert.equal(build.isolation.rootFilesystemReadOnly, true);

const kernel = new RuntimeKernel(build.artifact.hex, DEFAULT_CIRCUIT, {
  i2cDevices: [{ type: 'pcf8574-lcd', address: 0x27, componentId: 'water-tank-lcd' }],
});
kernel.adapter.runUntilCycle(12_000_000, 30_000_000);
const snapshot = kernel.snapshot();
assert.equal(snapshot.retentionDrops.i2c, 0);
assert.equal(snapshot.unsupported.length, 0);
assert(snapshot.i2c.some((item) => item.kind === 'address'
  && item.address === 0x27 && item.acknowledged));
const display = createPcf8574LcdDecoder(0x27, PCF8574_LCD_GEOMETRY_20X4)
  .consume(snapshot.i2c, { i2cDrops: snapshot.retentionDrops.i2c });
assert.equal(display.status, 'ready', JSON.stringify(display.error));
assert.deepEqual(display.lines, [
  'Level: 20.0%        ',
  'Mode: AUTO          ',
  'Pump: ON            ',
  'Alarm: OK           ',
]);

const disconnected = new RuntimeKernel(build.artifact.hex, DEFAULT_CIRCUIT);
disconnected.adapter.runUntilCycle(1_000_000, 5_000_000);
assert(disconnected.snapshot().i2c.some((item) => item.kind === 'address'
  && item.address === 0x27 && !item.acknowledged));

process.stdout.write(`${JSON.stringify({
  result: 'pass',
  evidenceClass: 'project-owned-adapter-qualification-not-exact-visuino-substitute',
  actualBuilds: 1,
  toolchainImageId: build.imageId,
  inputIdentity: build.inputIdentity,
  artifactIdentity: build.artifactIdentity,
  hexSha256: build.artifact.hexSha256,
  elfSha256: build.artifact.elfSha256,
  lines: display.lines,
  disconnectedNack: true,
})}\n`);
