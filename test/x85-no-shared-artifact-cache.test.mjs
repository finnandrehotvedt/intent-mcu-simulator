// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BuildCoordinator } from '../compiler/build-coordinator.mjs';
import {
  BUILD_REQUEST_SCHEMA, RP2040_BUILD_REQUEST_SCHEMA, RP2040_BOARD_PROFILE, sha256,
} from '../compiler/build-protocol.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const imageLock = Object.freeze({
  imageId: `sha256:${'a'.repeat(64)}`,
  toolchainManifestSha256: 'b'.repeat(64),
});
const avrSource = 'void setup(){pinMode(13,OUTPUT);} void loop(){digitalWrite(13,HIGH);delay(100);digitalWrite(13,LOW);delay(100);}';
const picoSource = `/* Intent MCU Simulator public RP2040 source v1 */
int main(void)
{
  intent_gpio0_output(1u);
  intent_uart0_text("X85 PICO MODEL");
  intent_halt();
}
`;

function request(board) {
  return JSON.stringify(board === AVR
    ? { schema: BUILD_REQUEST_SCHEMA, board, files: [{ name: 'main.ino', content: avrSource }] }
    : { schema: RP2040_BUILD_REQUEST_SCHEMA, board, files: [{ name: 'main.c', content: picoSource }] });
}

function avrWorker() {
  const hex = ':00000001FF';
  const elfBase64 = Buffer.from('x85-private-artifact', 'utf8').toString('base64');
  return {
    status: 'succeeded', code: 'BUILD_OK', imageId: imageLock.imageId,
    diagnostics: [], text: '', isolation: { network: 'none' },
    artifact: {
      hex, hexSha256: sha256(hex), elfBase64,
      elfSha256: sha256(Buffer.from(elfBase64, 'base64')),
    },
  };
}

async function terminal(coordinator, claim, origin) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = coordinator.status(claim.jobId, claim.capability, origin);
    if (['succeeded', 'failed', 'cancelled', 'timeout'].includes(status.status)) return status;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('MODEL_JOB_DID_NOT_COMPLETE');
}

test('X85 identical successful AVR requests invoke the broker twice and never report a cache hit', async () => {
  let calls = 0;
  const coordinator = new BuildCoordinator({
    broker: { async compile() { calls += 1; return avrWorker(); } },
    imageLock,
    identityLockFor: () => imageLock,
    jobTtlMs: 5_000,
  });
  assert.equal('cache' in coordinator, false);
  assert.equal('cacheLimit' in coordinator, false);
  const firstClaim = coordinator.submit(request(AVR), '198.51.100.10');
  const first = await terminal(coordinator, firstClaim, '198.51.100.10');
  const secondClaim = coordinator.submit(request(AVR), '198.51.100.10');
  const second = await terminal(coordinator, secondClaim, '198.51.100.10');
  assert.equal(calls, 2);
  assert.notEqual(firstClaim.jobId, secondClaim.jobId);
  assert.notEqual(firstClaim.capability, secondClaim.capability);
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, false);
  assert.equal(first.result.artifactIdentity, second.result.artifactIdentity);
  assert.throws(() => coordinator.status(firstClaim.jobId, secondClaim.capability, '198.51.100.10'),
    (error) => error.code === 'JOB_NOT_FOUND');
  assert.throws(() => coordinator.status(firstClaim.jobId, firstClaim.capability, '198.51.100.11'),
    (error) => error.code === 'JOB_NOT_FOUND');
  coordinator.prune(Date.now() + 10_000);
  assert.equal(coordinator.jobs.size, 0);
  assert.throws(() => coordinator.status(firstClaim.jobId, firstClaim.capability, '198.51.100.10'),
    (error) => error.code === 'JOB_NOT_FOUND');
});

test('X85 valid RP2040 requests traverse the broker independently with compatibility false', async () => {
  let calls = 0;
  const coordinator = new BuildCoordinator({
    broker: { async compile() {
      calls += 1;
      return { status: 'failed', code: 'CONTROLLED_MODEL_FAILURE', diagnostics: [], text: 'Controlled model result.' };
    } },
    imageLock,
    identityLockFor: () => imageLock,
  });
  const firstClaim = coordinator.submit(request(RP2040_BOARD_PROFILE), '198.51.100.20');
  const first = await terminal(coordinator, firstClaim, '198.51.100.20');
  const secondClaim = coordinator.submit(request(RP2040_BOARD_PROFILE), '198.51.100.20');
  const second = await terminal(coordinator, secondClaim, '198.51.100.20');
  assert.equal(calls, 2);
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, false);
  assert.equal(first.status, 'failed');
  assert.equal(second.status, 'failed');
});

test('X85 has no replacement shared artifact cache in coordinator, C3 or STM32 services', async () => {
  const sources = await Promise.all([
    readFile(new URL('../compiler/build-coordinator.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../c3/public-service.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stm32/public-service.mjs', import.meta.url), 'utf8'),
  ]);
  for (const source of sources) {
    assert.doesNotMatch(source, /artifactCache|cacheHit\s*=\s*true|this\.cache|cache\.(?:get|set)\(/u);
  }
});
