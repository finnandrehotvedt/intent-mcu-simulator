// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import {
  BUILD_SCHEMA, COMMAND_SCHEMA, FQBN, PROFILE,
  sourceForGpio2, validateBoundedSource,
} from '../c3/protocol.mjs';
import {
  C3_REGISTERS, ProjectOwnedC3Gpio2Adapter, VALIDATED_LED_CIRCUIT,
  resolveLed, validateGpio2LedCircuit,
} from '../c3/gpio2-adapter.mjs';
import {
  ESP32C3_PIN_MAP,
  Esp32C3CircuitEditor,
  createEsp32C3CircuitDraft,
  esp32C3RuntimeCircuit,
  normalizeEsp32C3CircuitDraft,
  validateEsp32C3Circuit,
} from '../src/esp32c3-public-circuit.mjs';
import { createC3PublicService } from '../c3/public-service.mjs';

const imageLock = Object.freeze({
  image: 'local/not-used-in-unit-test:1', imageId: `sha256:${'a'.repeat(64)}`,
  runtimeImageIds: [], toolchainManifestSha256: 'b'.repeat(64),
});

function write(adapter, address, value, epoch = 1, generation = 1) {
  return adapter.write({ epoch, address, value, width: 4 }, { generation });
}

test('bounded ESP32-C3 source grammar accepts only the four GPIO2 variants and uppercase marker', () => {
  for (const mode of ['OUTPUT', 'INPUT']) for (const level of ['HIGH', 'LOW']) {
    const parsed = validateBoundedSource(sourceForGpio2(`C3_${mode}_${level}`, mode, level));
    assert.deepEqual(parsed.gpio, { pin: 2, mode, level });
  }
  for (const source of [
    sourceForGpio2('C3_GOOD').replace('pinMode(2', 'pinMode(3'),
    sourceForGpio2('C3_GOOD').replace('delay(1000)', 'delay(500)'),
    sourceForGpio2('C3_GOOD').replace('C3_GOOD', 'lowercase'),
    sourceForGpio2('C3_GOOD').replace('  pinMode(2, OUTPUT);\n  digitalWrite(2, HIGH);\n', ''),
    `${sourceForGpio2('C3_GOOD')}WiFi.begin();\n`,
  ]) assert.throws(() => validateBoundedSource(source), /SOURCE_POLICY_REJECTED/u);
});

test('project-owned GPIO2 adapter requires actual mux and output-enable writes', () => {
  const adapter = new ProjectOwnedC3Gpio2Adapter();
  write(adapter, C3_REGISTERS.OUT_W1TS, 4);
  write(adapter, C3_REGISTERS.ENABLE_W1TS, 4);
  assert.equal(adapter.snapshot().drive, 'high-impedance');
  write(adapter, C3_REGISTERS.FUNC2_OUT_SEL, 0x80);
  write(adapter, C3_REGISTERS.IO_MUX_GPIO2, 0x1000);
  assert.equal(adapter.snapshot().drive, 'high');
  assert.equal(adapter.snapshot().provenance.qemuPinStateObserved, false);
  write(adapter, C3_REGISTERS.OUT_W1TC, 4);
  assert.equal(adapter.snapshot().drive, 'low');
});

test('GPIO2 LED topology and current validation fail closed', () => {
  const accepted = validateGpio2LedCircuit(VALIDATED_LED_CIRCUIT);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.milliamps, 5.909);
  assert.equal(resolveLed({ drive: 'high' }, VALIDATED_LED_CIRCUIT).code, 'LED_ON');
  assert.equal(resolveLed({ drive: 'low' }, VALIDATED_LED_CIRCUIT).code, 'LED_OFF');
  const disconnected = structuredClone(VALIDATED_LED_CIRCUIT);
  disconnected.connections.pop();
  assert.equal(validateGpio2LedCircuit(disconnected).code, 'CIRCUIT_DISCONNECTED');
  const unsafe = structuredClone(VALIDATED_LED_CIRCUIT);
  unsafe.resistorOhms = 10;
  assert.equal(validateGpio2LedCircuit(unsafe).accepted, false);

  const redBoundary = structuredClone(VALIDATED_LED_CIRCUIT);
  redBoundary.resistorOhms = 109;
  assert.equal(validateGpio2LedCircuit(redBoundary).accepted, true);
  redBoundary.resistorOhms = 108;
  assert.equal(validateGpio2LedCircuit(redBoundary).code, 'CIRCUIT_OVERCURRENT');

  const blueBoundary = structuredClone(VALIDATED_LED_CIRCUIT);
  blueBoundary.resistorOhms = 30;
  blueBoundary.ledForwardVolts = 3;
  assert.equal(validateGpio2LedCircuit(blueBoundary).accepted, true);
  blueBoundary.ledForwardVolts = 2.7;
  assert.equal(validateGpio2LedCircuit(blueBoundary).code, 'CIRCUIT_ELECTRICAL_INVALID');
});

test('public C3 editable circuit uses named physical pins and fail-closed electrical rules', () => {
  const draft = createEsp32C3CircuitDraft();
  const accepted = validateEsp32C3Circuit(draft);
  assert.equal(accepted.ok, true);
  assert.deepEqual(ESP32C3_PIN_MAP.GPIO2, {
    signal: 'GPIO2', connector: 'J1', physicalPin: 4, voltage: 3.3, capability: 'digital-output',
  });
  assert.deepEqual(ESP32C3_PIN_MAP.GND, {
    signal: 'GND', connector: 'J1', physicalPin: 6, voltage: 0, capability: 'ground-reference',
  });
  assert.equal(accepted.model.peakCurrentAmps <= 0.012, true);
  assert.equal(validateGpio2LedCircuit(esp32C3RuntimeCircuit(draft)).accepted, true);

  const reversed = structuredClone(draft);
  reversed.nets.find((net) => net.id === 'net-ground').endpoints[0].pin = 'ANODE';
  assert.equal(validateEsp32C3Circuit(reversed).ok, false);
  const overcurrent = structuredClone(draft);
  overcurrent.components.find((item) => item.id === 'resistor-1').properties.ohms = 10;
  assert.equal(validateEsp32C3Circuit(overcurrent).code, 'C3_LED_OVERCURRENT');
  const unknownPin = structuredClone(draft);
  unknownPin.nets[0].endpoints.find((endpoint) => endpoint.component === 'c3-1').pin = 'GPIO3';
  assert.throws(() => normalizeEsp32C3CircuitDraft(unknownPin), /C3_PIN_UNPROVEN/u);
});

test('public C3 editor shares bounded move rotate delete and history semantics', () => {
  const editor = new Esp32C3CircuitEditor();
  assert.equal(editor.snapshot().validation.ok, true);
  editor.select({ kind: 'component', id: 'resistor-1' });
  assert.equal(editor.moveComponent('resistor-1', 0.6, 0.35).ok, true);
  assert.equal(editor.rotateComponent('resistor-1').draft.layout.positions['resistor-1'].rotation, 90);
  const deleted = editor.deleteSelected();
  assert.equal(deleted.ok, true);
  assert.equal(deleted.validation.code, 'C3_SERIES_RESISTOR_REQUIRED');
  const undone = editor.undo();
  assert.equal(undone.validation.ok, true);
  assert.equal(undone.draft.layout.positions['resistor-1'].rotation, 90);
  assert.equal(editor.redo().validation.code, 'C3_SERIES_RESISTOR_REQUIRED');
  assert.equal(editor.undo().validation.ok, true);
  editor.select({ kind: 'component', id: 'c3-1' });
  assert.equal(editor.deleteSelected().code, 'C3_BOARD_FIXED');
  editor.select({ kind: 'net', id: 'net-ground' });
  assert.equal(editor.deleteSelected().validation.code, 'C3_GROUND_REQUIRED');
  assert.equal(editor.restoreExample().validation.ok, true);
});

test('public C3 service rejects cross-context access, limits sessions and retires invalid source', async (context) => {
  let clock = 1_000;
  const service = createC3PublicService({
    builderImageLock: imageLock, runtimeImageLock: imageLock, now: () => clock,
  });
  const server = http.createServer((request, response) => { void service.handle(request, response); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await service.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const mutation = { 'Content-Type': 'application/json', Origin: base, 'X-Intent-MCU-C3': '1' };

  const missingOrigin = await fetch(`${base}/api/c3/session`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Intent-MCU-C3': '1' }, body: '{}',
  });
  assert.equal(missingOrigin.status, 403);
  assert.equal((await missingOrigin.json()).code, 'REQUEST_CONTEXT_REJECTED');
  assert.equal(missingOrigin.headers.get('cache-control'), 'no-store');
  assert.equal(missingOrigin.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');

  const createdResponse = await fetch(`${base}/api/c3/session`, {
    method: 'POST', headers: mutation, body: '{}',
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.match(created.sessionId, /^[A-Za-z0-9_-]{16}$/u);
  assert.match(created.capability, /^[A-Za-z0-9_-]{32}$/u);
  assert.equal(created.transientMemoryOnly, true);

  const second = await fetch(`${base}/api/c3/session`, {
    method: 'POST', headers: mutation, body: '{}',
  });
  assert.equal(second.status, 429);
  assert.equal((await second.json()).code, 'SESSION_LIMIT');

  const invalidBuild = await fetch(`${base}/api/c3/session/${created.sessionId}/build`, {
    method: 'POST', headers: { ...mutation, Authorization: `Bearer ${created.capability}` },
    body: JSON.stringify({ schema: BUILD_SCHEMA, profile: PROFILE, fqbn: FQBN,
      source: sourceForGpio2('C3_BAD').replace('pinMode(2', 'pinMode(3'), sourceRevision: 1 }),
  });
  assert.equal(invalidBuild.status, 202);
  const receipt = await invalidBuild.json();
  const poll = await fetch(`${base}/api/c3/session/${created.sessionId}/build/${receipt.buildJobId}`, {
    headers: { Authorization: `Bearer ${created.capability}` },
  });
  assert.equal(poll.status, 200);
  assert.equal((await poll.json()).error.code, 'SOURCE_POLICY_REJECTED');

  const wrongCapability = await fetch(`${base}/api/c3/session/${created.sessionId}/command`, {
    method: 'POST', headers: { ...mutation, Authorization: `Bearer ${'z'.repeat(32)}` },
    body: JSON.stringify({ schema: COMMAND_SCHEMA, command: 'dispose', generation: 1,
      profile: PROFILE, fqbn: FQBN, sourceSha256: null, artifactSha256: null,
      circuit: VALIDATED_LED_CIRCUIT }),
  });
  assert.equal(wrongCapability.status, 404);

  clock += 5 * 60 * 1000 + 1;
  const replacement = await fetch(`${base}/api/c3/session`, {
    method: 'POST', headers: mutation, body: '{}',
  });
  assert.equal(replacement.status, 201);
  assert.equal(service.metrics().activeSessions, 1);
  assert.equal(service.metrics().disposed, 1);
});
