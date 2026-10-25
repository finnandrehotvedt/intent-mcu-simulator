// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
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
import { childJson, cleanupContainer, createC3PublicService } from '../c3/public-service.mjs';
import {
  Esp32C3PublicWorkbench, validateEsp32C3Retirement,
} from '../src/esp32c3-public-workbench.mjs';

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
  unknownPin.nets[0].endpoints.find((endpoint) => endpoint.component === 'c3-1').pin = 'NOT_A_PIN';
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

test('C3 disposal ACK waits for the owned operation exit and is exact, authenticated and idempotent', async (context) => {
  let childExited = false;
  const builder = ({ signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => setTimeout(() => {
      childExited = true;
      reject(Object.assign(new Error('OPERATION_CANCELLED'), {
        code: 'OPERATION_CANCELLED', cleanupConfirmed: true,
      }));
    }, 20), { once: true });
  });
  const service = createC3PublicService({
    builderImageLock: imageLock, runtimeImageLock: imageLock, builder,
  });
  const server = http.createServer((request, response) => { void service.handle(request, response); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await service.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const mutation = { 'Content-Type': 'application/json', Origin: base, 'X-Intent-MCU-C3': '1' };
  const created = await (await fetch(`${base}/api/c3/session`, {
    method: 'POST', headers: mutation, body: '{}',
  })).json();
  const authorized = { ...mutation, Authorization: `Bearer ${created.capability}` };
  const buildReceipt = await fetch(`${base}/api/c3/session/${created.sessionId}/build`, {
    method: 'POST', headers: authorized,
    body: JSON.stringify({ schema: BUILD_SCHEMA, profile: PROFILE, fqbn: FQBN,
      source: sourceForGpio2('C3_RETIRE'), sourceRevision: 1 }),
  });
  assert.equal(buildReceipt.status, 202);
  assert.equal((await buildReceipt.clone().json()).generation, 1,
    'accepted Build receipt must expose the generation owned by its pending operation');
  const disposeBody = JSON.stringify({ schema: COMMAND_SCHEMA, command: 'dispose', generation: 1,
    profile: PROFILE, fqbn: FQBN, sourceSha256: null, artifactSha256: null,
    circuit: VALIDATED_LED_CIRCUIT });
  const disposedResponse = await fetch(`${base}/api/c3/session/${created.sessionId}/command`, {
    method: 'POST', headers: authorized, body: disposeBody,
  });
  assert.equal(disposedResponse.status, 200);
  assert.equal(childExited, true, 'ACK must follow the fake child exit');
  const disposed = await disposedResponse.json();
  assert.deepEqual(validateEsp32C3Retirement(disposed, {
    sessionId: created.sessionId, generation: 1, sourceSha256: null, artifactSha256: null,
  }), { ok: true, code: 'C3_RETIREMENT_PROVEN' });
  assert.equal(disposed.processExited, true);
  assert.equal(disposed.operationRetired, true);
  assert.equal(disposed.retainedBytes, 0);
  assert.equal('capability' in disposed, false);
  assert.equal(service.metrics().activeSessions, 0);
  assert.equal(service.metrics().disposed, 1);

  const duplicate = await fetch(`${base}/api/c3/session/${created.sessionId}/command`, {
    method: 'POST', headers: authorized, body: disposeBody,
  });
  assert.equal(duplicate.status, 404);
  assert.equal(service.metrics().disposed, 1, 'retirement is charged exactly once');
});

test('C3 browser retirement proof rejects mismatched or incomplete ACKs', () => {
  const expected = { sessionId: 'A'.repeat(16), generation: 4,
    sourceSha256: 'a'.repeat(64), artifactSha256: 'b'.repeat(64) };
  const accepted = { schema: 'intent-mcu-c3-retirement@1', ...expected,
    state: 'disposed', retainedBytes: 0, processExited: true, operationRetired: true };
  assert.equal(validateEsp32C3Retirement(accepted, expected).ok, true);
  for (const changed of [
    { processExited: false }, { operationRetired: false }, { retainedBytes: 1 },
    { sessionId: 'B'.repeat(16) }, { generation: 5 }, { artifactSha256: 'c'.repeat(64) },
  ]) assert.throws(() => validateEsp32C3Retirement({ ...accepted, ...changed }, expected),
    /C3_RETIREMENT_ACK_INVALID/u);
});

test('C3 service retains an unproven tombstone when process cleanup is not confirmed', async (context) => {
  const builder = ({ signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(
      new Error('OPERATION_CLEANUP_FAILED'), { code: 'OPERATION_CLEANUP_FAILED' },
    )), { once: true });
  });
  const service = createC3PublicService({ builderImageLock: imageLock, runtimeImageLock: imageLock, builder });
  const server = http.createServer((request, response) => { void service.handle(request, response); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await service.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const mutation = { 'Content-Type': 'application/json', Origin: base, 'X-Intent-MCU-C3': '1' };
  const created = await (await fetch(`${base}/api/c3/session`, {
    method: 'POST', headers: mutation, body: '{}',
  })).json();
  const authorized = { ...mutation, Authorization: `Bearer ${created.capability}` };
  await fetch(`${base}/api/c3/session/${created.sessionId}/build`, {
    method: 'POST', headers: authorized,
    body: JSON.stringify({ schema: BUILD_SCHEMA, profile: PROFILE, fqbn: FQBN,
      source: sourceForGpio2('C3_UNPROVEN'), sourceRevision: 1 }),
  });
  const body = JSON.stringify({ schema: COMMAND_SCHEMA, command: 'dispose', generation: 1,
    profile: PROFILE, fqbn: FQBN, sourceSha256: null, artifactSha256: null,
    circuit: VALIDATED_LED_CIRCUIT });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${base}/api/c3/session/${created.sessionId}/command`, {
      method: 'POST', headers: authorized, body,
    });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, 'OPERATION_RETIREMENT_UNPROVEN');
    assert.equal(service.metrics().activeSessions, 1, 'failed cleanup retains the blocking tombstone');
    assert.equal(service.metrics().disposed, 0);
  }
});

test('C3 cleanup requires a successful exact-name absence query', async () => {
  const docker = '/fake/docker';
  const name = 'intent-mcu-c3-runtime-proof';
  const absent = async (binary, args) => ({ stdout: args.includes('ls') ? '' : '', stderr: '' });
  await cleanupContainer(docker, name, false, absent);

  for (const code of ['DAEMON_DOWN', 'INSPECT_TIMEOUT', 'PERMISSION_DENIED']) {
    const unknown = async (binary, args) => {
      if (args.includes('ls')) throw Object.assign(new Error(code), { code });
      return { stdout: '', stderr: '' };
    };
    await assert.rejects(() => cleanupContainer(docker, name, false, unknown),
      (error) => error.code === 'OPERATION_CLEANUP_UNPROVEN');
  }

  const present = async (binary, args) => ({ stdout: args.includes('ls') ? `${name}\n` : '', stderr: '' });
  await assert.rejects(() => cleanupContainer(docker, name, false, present),
    (error) => error.code === 'OPERATION_CLEANUP_FAILED');

  let queries = 0;
  const eventuallyAbsent = async (binary, args) => {
    if (!args.includes('ls')) return { stdout: '', stderr: '' };
    queries += 1;
    return { stdout: queries === 1 ? `${name}\n` : '', stderr: '' };
  };
  await cleanupContainer(docker, name, false, eventuallyAbsent);
  assert.equal(queries, 2);
});

test('C3 child owner cannot mark cancellation clean when exact absence query is unavailable', async () => {
  const controller = new AbortController();
  const spawnProcess = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.end = () => {};
    child.killed = false;
    child.kill = () => {
      child.killed = true;
      queueMicrotask(() => child.emit('close', null));
    };
    return child;
  };
  const dockerCommand = async (binary, args) => {
    if (args.includes('ls')) throw new Error('daemon unavailable');
    return { stdout: '', stderr: '' };
  };
  const operation = childJson({ docker: '/fake/docker', args: ['run'], input: '{}',
    timeoutMs: 1_000, outputLimit: 1024, signal: controller.signal,
    containerName: 'intent-mcu-c3-runtime-proof', dockerCommand, spawnProcess });
  controller.abort();
  await assert.rejects(operation, (error) =>
    error.code === 'OPERATION_CLEANUP_UNPROVEN' && error.cleanupConfirmed !== true);
});

function workbenchElements() {
  const element = (extra = {}) => ({ value: '', textContent: '', disabled: false, dataset: {},
    addEventListener() {}, setAttribute() {}, click() {}, ...extra });
  return {
    source: element(), name: element(), build: element(), run: element(), stop: element(),
    save: element(), open: element(), openInput: element({ files: [] }), state: element(),
    message: element(), terminal: element(), sourceHash: element(), flashHash: element(),
    diagram: element(), led: element(), circuitState: element(),
  };
}
function retirementResponse(value) {
  return { ok: true, headers: { get: () => null }, json: async () => value };
}
function retirementAck(expected) {
  return { schema: 'intent-mcu-c3-retirement@1', ...expected, state: 'disposed', retainedBytes: 0,
    processExited: true, operationRetired: true };
}
function ownedWorkbench(fetchFn) {
  const workbench = new Esp32C3PublicWorkbench({ elements: workbenchElements(), fetchFn });
  workbench.active = true;
  workbench.sessionId = 'S'.repeat(16);
  workbench.capability = 'C'.repeat(32);
  workbench.serverGeneration = 3;
  workbench.artifact = { sourceSha256: 'a'.repeat(64), flashSha256: 'b'.repeat(64) };
  workbench.artifactRevision = workbench.revision;
  return workbench;
}

test('C3 browser concurrent disposal joins one exact pending owner and one request', async () => {
  let release;
  let requests = 0;
  const held = new Promise((resolve) => { release = resolve; });
  const workbench = ownedWorkbench(async () => { requests += 1; return held; });
  const expected = { sessionId: 'S'.repeat(16), generation: 3,
    sourceSha256: 'a'.repeat(64), artifactSha256: 'b'.repeat(64) };
  let firstSettled = false;
  let secondSettled = false;
  let reentrant = null;
  workbench.onState = () => {
    if (workbench.sessionId === null && !reentrant) reentrant = workbench.dispose();
  };
  const first = workbench.dispose().then((value) => { firstSettled = true; return value; });
  const second = workbench.dispose().then((value) => { secondSettled = true; return value; });
  await Promise.resolve();
  assert.equal(firstSettled, false);
  assert.equal(secondSettled, false);
  assert.equal(requests, 1);
  assert.equal(workbench.sessionId, null, 'local authority is revoked before ACK');
  assert.equal((await workbench.build()).code, 'C3_RETIREMENT_UNPROVEN');
  release(retirementResponse(retirementAck(expected)));
  assert.deepEqual(await first, { ok: true, code: 'C3_RETIREMENT_PROVEN' });
  assert.deepEqual(await second, { ok: true, code: 'C3_RETIREMENT_PROVEN' });
  assert.deepEqual(await reentrant, { ok: true, code: 'C3_RETIREMENT_PROVEN' });
  assert.equal(requests, 1);
});

test('C3 concurrent session creation joins one private creation owner', async () => {
  let release;
  let requests = 0;
  const held = new Promise((resolve) => { release = resolve; });
  const workbench = new Esp32C3PublicWorkbench({ elements: workbenchElements(), fetchFn: async () => {
    requests += 1;
    return held;
  } });
  workbench.active = true;
  const first = workbench.ensureSession();
  const second = workbench.ensureSession();
  await Promise.resolve();
  assert.equal(requests, 1);
  release(retirementResponse({ sessionId: 'J'.repeat(16), capability: 'Q'.repeat(32), generation: 0 }));
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(workbench.sessionId, 'J'.repeat(16));
});

test('C3 browser failed retirement stays unproven and cannot become idle success', async () => {
  let requests = 0;
  const workbench = ownedWorkbench(async () => {
    requests += 1;
    throw Object.assign(new Error('network lost'), { code: 'NETWORK_LOST' });
  });
  assert.deepEqual(await workbench.dispose(), { ok: false, code: 'NETWORK_LOST' });
  assert.deepEqual(await workbench.dispose(), { ok: false, code: 'NETWORK_LOST' });
  assert.equal(requests, 1);
  assert.equal((await workbench.build()).code, 'C3_RETIREMENT_UNPROVEN');
  await assert.rejects(() => workbench.ensureSession(), /C3_RETIREMENT_UNPROVEN/u);
});

test('C3 browser wrong-owner ACK remains blocked while genuine idle is distinct', async () => {
  const workbench = ownedWorkbench(async () => retirementResponse(retirementAck({
    sessionId: 'X'.repeat(16), generation: 3,
    sourceSha256: 'a'.repeat(64), artifactSha256: 'b'.repeat(64),
  })));
  assert.deepEqual(await workbench.dispose(), { ok: false, code: 'C3_RETIREMENT_ACK_INVALID' });
  assert.deepEqual(await workbench.dispose(), { ok: false, code: 'C3_RETIREMENT_ACK_INVALID' });
  await assert.rejects(() => workbench.ensureSession(), /C3_RETIREMENT_UNPROVEN/u);

  const idle = new Esp32C3PublicWorkbench({ elements: workbenchElements(),
    fetchFn: async () => { throw new Error('must not fetch'); } });
  assert.deepEqual(await idle.dispose(), { ok: true, code: 'C3_RETIREMENT_IDLE' });
});

test('C3 page-exit disposal keeps the same private owner and keepalive proof path', async () => {
  let release;
  let requestOptions;
  const held = new Promise((resolve) => { release = resolve; });
  const workbench = ownedWorkbench(async (url, options) => {
    requestOptions = options;
    return held;
  });
  workbench.disposeForPageExit();
  await Promise.resolve();
  assert.equal(requestOptions.keepalive, true);
  assert.equal(workbench.sessionId, null);
  assert.equal((await workbench.build()).code, 'C3_RETIREMENT_UNPROVEN');
  release(retirementResponse(retirementAck({ sessionId: 'S'.repeat(16), generation: 3,
    sourceSha256: 'a'.repeat(64), artifactSha256: 'b'.repeat(64) })));
  assert.deepEqual(await workbench.dispose(), { ok: true, code: 'C3_RETIREMENT_PROVEN' });
});

test('C3 held session creation is retired exactly once and never reaches Build', async () => {
  let releaseCreation;
  let sessionRequests = 0;
  let buildRequests = 0;
  let disposalRequests = 0;
  const creation = new Promise((resolve) => { releaseCreation = resolve; });
  const created = { sessionId: 'N'.repeat(16), capability: 'K'.repeat(32), generation: 0 };
  const workbench = new Esp32C3PublicWorkbench({ elements: workbenchElements(), fetchFn: async (url) => {
    if (url.endsWith('/session')) { sessionRequests += 1; return creation; }
    if (url.endsWith('/build')) { buildRequests += 1; throw new Error('BUILD_MUST_NOT_POST'); }
    if (url.endsWith(`/session/${created.sessionId}/command`)) {
      disposalRequests += 1;
      return retirementResponse(retirementAck({ sessionId: created.sessionId, generation: 0,
        sourceSha256: null, artifactSha256: null }));
    }
    throw new Error(`UNEXPECTED_FETCH:${url}`);
  } });
  workbench.activate();
  const building = workbench.build();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(sessionRequests, 1);
  const retiring = workbench.deactivate();
  assert.equal(workbench.retirementOwner.status, 'pending');
  releaseCreation(retirementResponse(created));
  assert.equal(await retiring, undefined);
  assert.equal((await building).code, 'C3_BUILD_STALE');
  assert.equal(buildRequests, 0);
  assert.equal(disposalRequests, 1);
  assert.equal(workbench.sessionId, null);
  assert.equal(workbench.artifact, null);
  assert.deepEqual(await workbench.dispose(), { ok: true, code: 'C3_RETIREMENT_PROVEN' });
});

test('C3 failed late-session retirement stays unproven and synchronous reentry starts no producer', async () => {
  let releaseCreation;
  let requests = 0;
  const creation = new Promise((resolve) => { releaseCreation = resolve; });
  const workbench = new Esp32C3PublicWorkbench({ elements: workbenchElements(), fetchFn: async (url) => {
    requests += 1;
    if (url.endsWith('/session')) return creation;
    throw Object.assign(new Error('late retirement lost'), { code: 'NETWORK_LOST' });
  } });
  workbench.activate();
  const building = workbench.build();
  await Promise.resolve();
  await Promise.resolve();
  const retirement = workbench.deactivate();
  releaseCreation(retirementResponse({ sessionId: 'L'.repeat(16),
    capability: 'P'.repeat(32), generation: 0 }));
  assert.deepEqual(await retirement, undefined);
  assert.equal((await building).code, 'C3_BUILD_STALE');
  assert.deepEqual(await workbench.dispose(), { ok: false, code: 'NETWORK_LOST' });
  assert.equal(requests, 2);

  let reentered = false;
  let networkRequests = 0;
  const synchronous = new Esp32C3PublicWorkbench({ elements: workbenchElements(),
    fetchFn: async () => { networkRequests += 1; throw new Error('must not fetch'); } });
  synchronous.active = true;
  synchronous.onState = (state) => {
    if (state.phase === 'building' && !reentered) {
      reentered = true;
      void synchronous.deactivate();
    }
  };
  assert.equal((await synchronous.build()).code, 'C3_BUILD_STALE');
  assert.equal(networkRequests, 0);
});

test('C3 source invalidation owns failed late-session retirement and blocks replacement Build', async () => {
  let releaseCreation;
  let sessionRequests = 0;
  let buildRequests = 0;
  let disposalRequests = 0;
  const creation = new Promise((resolve) => { releaseCreation = resolve; });
  const created = { sessionId: 'V'.repeat(16), capability: 'W'.repeat(32), generation: 0 };
  const workbench = new Esp32C3PublicWorkbench({ elements: workbenchElements(), fetchFn: async (url) => {
    if (url.endsWith('/session')) { sessionRequests += 1; return creation; }
    if (url.endsWith('/build')) { buildRequests += 1; throw new Error('BUILD_MUST_NOT_POST'); }
    if (url.endsWith(`/session/${created.sessionId}/command`)) {
      disposalRequests += 1;
      throw Object.assign(new Error('cleanup response lost'), { code: 'NETWORK_LOST' });
    }
    throw new Error(`UNEXPECTED_FETCH:${url}`);
  } });
  workbench.activate();
  const firstBuild = workbench.build();
  await Promise.resolve();
  await Promise.resolve();
  workbench.invalidate('Source changed during session creation.');
  releaseCreation(retirementResponse(created));
  assert.equal((await firstBuild).code, 'C3_BUILD_STALE');
  assert.equal(workbench.retirementOwner.status, 'unproven');
  assert.deepEqual(await workbench.dispose(), { ok: false, code: 'NETWORK_LOST' });
  assert.equal((await workbench.build()).code, 'C3_RETIREMENT_UNPROVEN');
  assert.equal(sessionRequests, 1);
  assert.equal(disposalRequests, 1);
  assert.equal(buildRequests, 0);
  assert.equal(workbench.sessionId, null);
});

test('C3 source-invalidated late session rejects a wrong retirement ACK and stays blocked', async () => {
  let releaseCreation;
  let sessionRequests = 0;
  let buildRequests = 0;
  let disposalRequests = 0;
  const creation = new Promise((resolve) => { releaseCreation = resolve; });
  const created = { sessionId: 'A'.repeat(16), capability: 'B'.repeat(32), generation: 0 };
  const workbench = new Esp32C3PublicWorkbench({ elements: workbenchElements(), fetchFn: async (url) => {
    if (url.endsWith('/session')) { sessionRequests += 1; return creation; }
    if (url.endsWith('/build')) { buildRequests += 1; throw new Error('BUILD_MUST_NOT_POST'); }
    if (url.endsWith(`/session/${created.sessionId}/command`)) {
      disposalRequests += 1;
      return retirementResponse(retirementAck({ sessionId: 'X'.repeat(16), generation: 0,
        sourceSha256: null, artifactSha256: null }));
    }
    throw new Error(`UNEXPECTED_FETCH:${url}`);
  } });
  workbench.active = true;
  const pending = workbench.ensureSession();
  await Promise.resolve();
  workbench.invalidate('Source changed during session creation.');
  releaseCreation(retirementResponse(created));
  await assert.rejects(() => pending, /C3_SESSION_CREATION_RETIRED/u);
  assert.equal(workbench.retirementOwner.status, 'unproven');
  assert.deepEqual(await workbench.dispose(), { ok: false, code: 'C3_RETIREMENT_ACK_INVALID' });
  assert.equal((await workbench.build()).code, 'C3_RETIREMENT_UNPROVEN');
  assert.equal(sessionRequests, 1);
  assert.equal(disposalRequests, 1);
  assert.equal(buildRequests, 0);
});

test('C3 source-invalidated late session requires exact ACK before replacement is allowed', async () => {
  let releaseCreation;
  let sessionRequests = 0;
  const creation = new Promise((resolve) => { releaseCreation = resolve; });
  const firstCreated = { sessionId: 'Y'.repeat(16), capability: 'Z'.repeat(32), generation: 0 };
  const nextCreated = { sessionId: 'R'.repeat(16), capability: 'T'.repeat(32), generation: 0 };
  const workbench = new Esp32C3PublicWorkbench({ elements: workbenchElements(), fetchFn: async (url) => {
    if (url.endsWith('/session')) {
      sessionRequests += 1;
      return sessionRequests === 1 ? creation : retirementResponse(nextCreated);
    }
    if (url.endsWith(`/session/${firstCreated.sessionId}/command`)) {
      return retirementResponse(retirementAck({ sessionId: firstCreated.sessionId, generation: 0,
        sourceSha256: null, artifactSha256: null }));
    }
    throw new Error(`UNEXPECTED_FETCH:${url}`);
  } });
  workbench.active = true;
  const pending = workbench.ensureSession();
  await Promise.resolve();
  workbench.invalidate('Source changed during session creation.');
  releaseCreation(retirementResponse(firstCreated));
  await assert.rejects(() => pending, /C3_SESSION_CREATION_RETIRED/u);
  assert.equal(workbench.retirementOwner.status, 'proven');
  assert.equal(await workbench.ensureSession(), true);
  assert.equal(workbench.sessionId, nextCreated.sessionId);
  assert.equal(sessionRequests, 2);
});
