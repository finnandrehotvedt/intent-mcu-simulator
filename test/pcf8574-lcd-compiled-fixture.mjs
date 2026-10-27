// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RuntimeKernel } from '../src/runtime-kernel.mjs';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { createPcf8574LcdDecoder } from '../expansion-drafts/pcf8574-lcd-backpack-v1.mjs';

const path = process.env.PCF8574_LCD_HEX;
if (!path) throw new Error('PCF8574_LCD_HEX_REQUIRED');
const hex = await readFile(path, 'utf8');
const kernel = new RuntimeKernel(hex, DEFAULT_CIRCUIT, {
  i2cDevices: [{ type: 'pcf8574-lcd', address: 0x27 }],
});
kernel.adapter.runUntilCycle(8_000_000, 20_000_000);
const snapshot = kernel.snapshot();
assert(snapshot.i2c.some((item) => item.kind === 'address' && item.address === 0x27 && item.acknowledged));
assert(snapshot.i2c.every((item) => item.kind !== 'write' || item.acknowledged));
const display = createPcf8574LcdDecoder().consume(snapshot.i2c, { i2cDrops: snapshot.retentionDrops.i2c });
assert.equal(display.status, 'ready', JSON.stringify(display.error));
assert.deepEqual(display.lines, ['I2C LCD ready   ', 'Address 0x27    ']);

const disconnected = new RuntimeKernel(hex, DEFAULT_CIRCUIT);
disconnected.adapter.runUntilCycle(1_000_000, 5_000_000);
assert(disconnected.snapshot().i2c.some((item) => item.kind === 'address' && item.address === 0x27 && !item.acknowledged));
process.stdout.write(`${JSON.stringify({ result: 'pass', lines: display.lines, records: snapshot.i2c.length, disconnectedNack: true })}\n`);
