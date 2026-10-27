// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { DockerBuildBroker, loadImageLock } from '../compiler/docker-broker.mjs';
import { normalizeBuildRequestValue } from '../compiler/build-protocol.mjs';
import { BME280_ENVIRONMENT_SOURCE } from '../expansion-drafts/bme280-environment-example-v1.mjs';
import { RuntimeKernel } from '../src/runtime-kernel.mjs';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';

const request = normalizeBuildRequestValue({
  schema: 'teach-lab-build-request@1',
  board: 'board.atmega328p-16mhz-v1',
  files: [{ name: 'main.ino', content: BME280_ENVIRONMENT_SOURCE }],
});
const result = await new DockerBuildBroker({ imageLock: await loadImageLock() }).compile(request);
assert.equal(result.status, 'succeeded', JSON.stringify(result.diagnostics));
assert.equal(result.code, 'BUILD_OK');
assert.equal(result.isolation.networkInterfaces.join(','), 'lo');
const kernel = new RuntimeKernel(result.artifact.hex, DEFAULT_CIRCUIT, {
  i2cDevices: [{ type: 'bme280', componentId: 'bme280-1', address: 0x76,
    temperatureC: 23.5, humidityPercent: 50, pressureHpa: 1013.2 }],
});
kernel.adapter.runUntilCycle(20_000_000, 40_000_000);
const snapshot = kernel.snapshot();
const serial = String.fromCharCode(...snapshot.serial.filter((item) => item.direction === 'tx')
  .map((item) => item.value));
assert.match(serial, /TEMP_C=23\.5 HUMIDITY_RH=50\.0 PRESSURE_HPA=1013\.2 CHIP=0x60/u);
assert.equal(snapshot.unsupported.length, 0);
assert(snapshot.i2c.some((item) => item.kind === 'read' && item.register === 0xd0
  && item.value === 0x60));
if (process.env.BME280_HEX_OUTPUT) await writeFile(process.env.BME280_HEX_OUTPUT, result.artifact.hex);
process.stdout.write(`${JSON.stringify({ result: 'pass', hexSha256: result.artifact.hexSha256,
  hexBytes: result.artifact.hexBytes, serial: serial.trim().split('\n').at(-1),
  i2cRecords: snapshot.i2c.length })}\n`);
