// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { Atmega328PAdapter } from '../src/atmega328p-adapter.mjs';

const base = process.env.INTENT_MCU_LOCAL_URL ?? 'http://127.0.0.1:18766';
const source = 'void setup(){pinMode(13,OUTPUT);} void loop(){digitalWrite(13,HIGH);delay(150);digitalWrite(13,LOW);delay(150);}';
const request = {
  schema: 'teach-lab-build-request@1', board: 'board.atmega328p-16mhz-v1',
  files: [{ name: 'main.ino', content: source }],
};

const ready = await fetch(`${base}/readyz`);
if (ready.status !== 200) {
  assert.fail(`compiler readiness failed: ${await ready.text()}`);
}
const submitted = await fetch(`${base}/api/build`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1', Origin: base },
  body: JSON.stringify(request),
});
if (submitted.status !== 202) {
  assert.fail(`build submission failed: ${await submitted.text()}`);
}
const claim = await submitted.json();
let result;
for (let attempt = 0; attempt < 200; attempt += 1) {
  const response = await fetch(`${base}/api/build/${claim.jobId}`, {
    headers: { Authorization: `Bearer ${claim.capability}` },
  });
  assert.equal(response.status, 200);
  result = await response.json();
  if (['succeeded', 'failed', 'cancelled', 'timeout'].includes(result.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 50));
}
assert.equal(result?.status, 'succeeded', `build failed: ${JSON.stringify(result)}`);
const adapter = new Atmega328PAdapter(result.result.artifact.hex);
adapter.runUntilCycle(8_000_000);
const transitions = adapter.trace.filter((entry) => entry.pin === 13).slice(0, 4);
assert.ok(transitions.length >= 4, 'compiled Blink did not produce GPIO transitions');
const intervals = transitions.slice(1).map((entry, index) => entry.cycle - transitions[index].cycle);
assert.ok(intervals.every((cycles) => Math.abs(cycles - 2_400_000) <= 2_048), `unexpected intervals: ${intervals}`);
process.stdout.write(`${JSON.stringify({ status: 'passed', artifact: result.result.artifactIdentity, intervals })}\n`);
