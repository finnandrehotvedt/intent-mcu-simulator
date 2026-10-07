// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { promisify } from 'node:util';
import { Atmega328PAdapter } from '../src/atmega328p-adapter.mjs';
import { normalizeBuildRequestValue } from '../compiler/build-protocol.mjs';
import { BrokerError, DockerBuildBroker, loadImageLock } from '../compiler/docker-broker.mjs';

const execFileAsync = promisify(execFile);
const imageLock = await loadImageLock();
const source = (delay = 250) => `void setup(){pinMode(13,OUTPUT);} void loop(){digitalWrite(13,HIGH);delay(${delay});digitalWrite(13,LOW);delay(${delay});}`;
const request = (content = source()) => normalizeBuildRequestValue({
  schema: 'teach-lab-build-request@1', board: 'board.atmega328p-16mhz-v1',
  files: [{ name: 'main.ino', content }],
});

function firstIntervals(hex, maxCycle) {
  const adapter = new Atmega328PAdapter(hex);
  adapter.runUntilCycle(maxCycle);
  const trace = adapter.trace.filter((entry) => entry.pin === 13).slice(0, 3);
  assert.equal(trace.length, 3);
  return { trace, intervals: [trace[1].cycle - trace[0].cycle, trace[2].cycle - trace[1].cycle] };
}

test('B-01/B-02/B-10 isolated clean builds produce verified artifacts and source-coupled traces', { timeout: 90_000 }, async () => {
  const broker = new DockerBuildBroker({ imageLock });
  const first = await broker.compile(request(source(250)));
  const repeated = await broker.compile(request(source(250)));
  const changed = await broker.compile(request(source(1000)));
  assert.equal(first.status, 'succeeded');
  assert.equal(first.artifact.hexSha256, repeated.artifact.hexSha256);
  assert.equal(first.artifact.elfSha256, repeated.artifact.elfSha256);
  assert.notEqual(first.artifact.hexSha256, changed.artifact.hexSha256);
  const fast = firstIntervals(first.artifact.hex, 9_000_000);
  const slow = firstIntervals(changed.artifact.hex, 33_000_000);
  assert.ok(fast.intervals.every((cycles) => Math.abs(cycles - 4_000_000) <= 2_048));
  assert.ok(slow.intervals.every((cycles) => Math.abs(cycles - 16_000_000) <= 2_048));
});

test('TEST-003 compiler-to-emulator timing distinguishes 300 ms and 150 ms Blink', { timeout: 60_000 }, async () => {
  const broker = new DockerBuildBroker({ imageLock });
  const slowBuild = await broker.compile(request(source(300)));
  const fastBuild = await broker.compile(request(source(150)));
  assert.equal(slowBuild.status, 'succeeded');
  assert.equal(fastBuild.status, 'succeeded');
  assert.notEqual(slowBuild.artifact.hexSha256, fastBuild.artifact.hexSha256);
  const slow = firstIntervals(slowBuild.artifact.hex, 11_000_000);
  const fast = firstIntervals(fastBuild.artifact.hex, 6_000_000);
  assert.ok(slow.intervals.every((cycles) => Math.abs(cycles - 4_800_000) <= 2_048), `${slow.intervals}`);
  assert.ok(fast.intervals.every((cycles) => Math.abs(cycles - 2_400_000) <= 2_048), `${fast.intervals}`);
});

test('B-03 syntax failure is bounded, sanitized and never returns an artifact', { timeout: 30_000 }, async () => {
  const result = await new DockerBuildBroker({ imageLock }).compile(request('void setup( {\nvoid loop(){}'));
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'COMPILE_FAILED');
  assert.equal(result.artifact, undefined);
  assert.ok(result.diagnostics.length > 0);
  assert.equal(result.text.includes('/workspace'), false);
  assert.equal(result.text.includes('/opt/arduino'), false);
  assert.ok(Buffer.byteLength(result.text) <= 1024 * 1024);
});

test('B-08 worker isolation readback proves offline non-privileged disposable boundary', { timeout: 30_000 }, async () => {
  const result = await new DockerBuildBroker({ imageLock }).compile(request());
  assert.deepEqual(result.isolation.networkInterfaces, ['lo']);
  assert.equal(result.isolation.dnsBlocked, true);
  assert.equal(result.isolation.tcpBlocked, true);
  assert.equal(result.isolation.dockerSocketAbsent, true);
  assert.deepEqual(result.isolation.unsafeDevices, []);
  assert.equal(result.isolation.rootFilesystemReadOnly, true);
  assert.equal(result.isolation.toolchainReadOnly, true);
  assert.equal(result.isolation.capabilityMask, '0000000000000000');
  assert.equal(result.isolation.noNewPrivileges, '1');
  assert.equal(result.isolation.seccomp, '2');
  assert.equal(result.isolation.pidsMax, '64');
  assert.equal(result.isolation.memoryMax, '268435456');
  assert.deepEqual(result.isolation.suspiciousEnvironmentKeys, []);
  assert.equal(result.imageId, imageLock.imageId);
});

test('B-13 main.ino plus project-local header/C++ builds through fixed ordering', { timeout: 30_000 }, async () => {
  const bounded = normalizeBuildRequestValue({
    schema: 'teach-lab-build-request@1', board: 'board.atmega328p-16mhz-v1',
    files: [
      { name: 'pulse.cpp', content: '#include "pulse.h"\n#include "pins.hpp"\n#include <Arduino.h>\nvoid pulse(){digitalWrite(LED_PIN,HIGH);delay(helper_delay());digitalWrite(LED_PIN,LOW);delay(helper_delay());}\n' },
      { name: 'main.ino', content: '#include "pulse.h"\n#include "pins.hpp"\nvoid setup(){pinMode(LED_PIN,OUTPUT);}\nvoid loop(){pulse();}\n' },
      { name: 'pins.hpp', content: '#pragma once\nconstexpr int LED_PIN = 13;\n' },
      { name: 'pulse.h', content: '#pragma once\n#ifdef __cplusplus\nextern "C" {\n#endif\nint helper_delay(void);\n#ifdef __cplusplus\n}\n#endif\nvoid pulse();\n' },
      { name: 'helper.c', content: '#include "pulse.h"\nint helper_delay(void){return 500;}\n' },
    ],
  });
  const result = await new DockerBuildBroker({ imageLock }).compile(bounded);
  assert.equal(result.status, 'succeeded');
  const trace = firstIntervals(result.artifact.hex, 17_000_000);
  assert.ok(trace.intervals.every((cycles) => Math.abs(cycles - 8_000_000) <= 2_048));
});

test('B-05/B-06 whole disposable job is removed on timeout and cancellation', { timeout: 30_000 }, async () => {
  const timeoutBroker = new DockerBuildBroker({ imageLock, deadlineMs: 1 });
  await assert.rejects(timeoutBroker.compile(request()), (error) => error instanceof BrokerError && error.code === 'BUILD_TIMEOUT');
  const controller = new AbortController();
  const cancelBroker = new DockerBuildBroker({ imageLock, deadlineMs: 12_000 });
  const pending = cancelBroker.compile(request(), { signal: controller.signal });
  setTimeout(() => controller.abort(), 25);
  await assert.rejects(pending, (error) => error instanceof BrokerError && error.code === 'BUILD_CANCELLED');
  await new Promise((resolve) => setTimeout(resolve, 100));
  const { stdout } = await execFileAsync('docker', ['ps', '-aq', '--filter', 'label=com.intentforce.teach-lab.role=disposable-build-job']);
  assert.equal(stdout.trim(), '');
  assert.equal(timeoutBroker.activeContainers.size, 0);
  assert.equal(cancelBroker.activeContainers.size, 0);
});
