// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RuntimeKernel } from '../src/runtime-kernel.mjs';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';

const path = process.env.BME280_HEX;
if (!path) throw new Error('BME280_HEX_REQUIRED');
const hex = await readFile(path, 'utf8');
const options = (temperatureC, humidityPercent, pressureHpa) => ({
  i2cDevices: [{ type: 'bme280', componentId: 'bme280-1', address: 0x76,
    temperatureC, humidityPercent, pressureHpa }],
});
const kernel = new RuntimeKernel(hex, DEFAULT_CIRCUIT, options(23.5, 50, 1013.2));
kernel.adapter.runUntilCycle(20_000_000, 40_000_000);
let snapshot = kernel.snapshot();
const serial = String.fromCharCode(...snapshot.serial.filter((item) => item.direction === 'tx')
  .map((item) => item.value));
assert.match(serial, /TEMP_C=23\.5 HUMIDITY_RH=50\.0 PRESSURE_HPA=1013\.2 CHIP=0x60/u);
assert(snapshot.i2c.some((item) => item.kind === 'address' && item.address === 0x76
  && item.read && item.acknowledged));
assert(snapshot.i2c.some((item) => item.kind === 'read' && item.register === 0xd0
  && item.value === 0x60 && item.acknowledged));
assert(snapshot.i2c.some((item) => item.kind === 'read' && item.register === 0xf7));
assert.equal(snapshot.unsupported.length, 0);

kernel.adapter.setBme280Environment('bme280-1', 'temperatureC', -12.3);
kernel.adapter.setBme280Environment('bme280-1', 'humidityPercent', 64.7);
kernel.adapter.setBme280Environment('bme280-1', 'pressureHpa', 987.6);
kernel.adapter.runUntilCycle(40_000_000, 50_000_000);
snapshot = kernel.snapshot();
const updatedSerial = String.fromCharCode(...snapshot.serial.filter((item) => item.direction === 'tx')
  .map((item) => item.value));
assert.match(updatedSerial, /TEMP_C=-12\.3 HUMIDITY_RH=64\.7 PRESSURE_HPA=987\.6 CHIP=0x60/u);
assert.deepEqual(snapshot.bme280[0], {
  componentId: 'bme280-1', address: 0x76, temperatureC: -12.3,
  humidityPercent: 64.7, pressureHpa: 987.6, registerPointer: 0xff,
});

const disconnected = new RuntimeKernel(hex, DEFAULT_CIRCUIT);
disconnected.adapter.runUntilCycle(1_000_000, 5_000_000);
assert(disconnected.snapshot().i2c.some((item) => item.kind === 'address'
  && item.address === 0x76 && !item.acknowledged));
process.stdout.write(`${JSON.stringify({ result: 'pass', serial: updatedSerial.trim().split('\n').at(-1),
  records: snapshot.i2c.length, disconnectedNack: true })}\n`);
