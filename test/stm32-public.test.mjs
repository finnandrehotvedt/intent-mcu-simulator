// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadStm32F429FirmwareArtifact } from '../stm32/artifact.mjs';
import {
  STM32_BUILD_SCHEMA, STM32_PROFILE, STM32_RUN_SCHEMA,
  sourceForStm32, validateStm32Source,
} from '../stm32/protocol.mjs';
import { childOutput, createStm32PublicService } from '../stm32/public-service.mjs';
import {
  Stm32CircuitEditor, createStm32CircuitDraft, normalizeStm32CircuitDraft, validateStm32Circuit,
} from '../src/stm32-public-circuit.mjs';
import { STM32_EXECUTION_IDENTITIES } from '../src/stm32-execution-identities.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const imageLock = Object.freeze({ image: 'local/not-used:1', imageId: `sha256:${'a'.repeat(64)}`,
  runtimeImageIds: [], toolchainManifestSha256: 'b'.repeat(64) });

test('STM32 named PB0 teaching circuit validates and edits transactionally', () => {
  const draft = createStm32CircuitDraft();
  const validated = validateStm32Circuit(draft);
  assert.equal(validated.ok, true);
  assert.deepEqual({ source: validated.model.sourcePin, sourcePin: validated.model.sourcePhysicalPin,
    ground: validated.model.groundAnchor, groundPin: validated.model.groundPhysicalPin,
    resistor: validated.model.resistorOhms },
  { source: 'PB0', sourcePin: 34, ground: 'GND', groundPin: 19, resistor: 220 });
  assert.deepEqual(normalizeStm32CircuitDraft(draft), validated.draft);

  const editor = new Stm32CircuitEditor(draft);
  editor.select({ kind: 'component', id: 'resistor-1' });
  assert.equal(editor.moveComponent('resistor-1', 0.6, 0.4).ok, true);
  assert.equal(editor.rotateComponent('resistor-1').draft.layout.positions['resistor-1'].rotation, 90);
  const deleted = editor.deleteSelected();
  assert.equal(deleted.ok, true);
  assert.equal(deleted.validation.code, 'STM32_SERIES_RESISTOR_REQUIRED');
  assert.equal(editor.undo().validation.ok, true);
  assert.equal(editor.redo().validation.code, 'STM32_SERIES_RESISTOR_REQUIRED');
  assert.equal(editor.undo().validation.ok, true);

  const unsafe = createStm32CircuitDraft();
  unsafe.components.find((item) => item.id === 'resistor-1').properties.ohms = 22;
  assert.equal(validateStm32Circuit(unsafe).code, 'STM32_LED_OVERCURRENT');
});

function strictFixture() {
  const flash = new Uint8Array(0x102);
  const flashView = new DataView(flash.buffer);
  flashView.setUint32(0, 0x20030000, true);
  flashView.setUint32(4, 0x08000101, true);
  flashView.setUint16(0x100, 0xe7fe, true);
  const bytes = new Uint8Array(0x100 + flash.byteLength);
  const view = new DataView(bytes.buffer);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1, 0], 0);
  view.setUint16(16, 2, true);
  view.setUint16(18, 40, true);
  view.setUint32(20, 1, true);
  view.setUint32(24, 0x08000101, true);
  view.setUint32(28, 52, true);
  view.setUint32(36, 0x05000000, true);
  view.setUint16(40, 52, true);
  view.setUint16(42, 32, true);
  view.setUint16(44, 1, true);
  view.setUint32(52, 1, true);
  view.setUint32(56, 0x100, true);
  view.setUint32(60, 0x08000000, true);
  view.setUint32(64, 0x08000000, true);
  view.setUint32(68, flash.byteLength, true);
  view.setUint32(72, flash.byteLength, true);
  view.setUint32(76, 5, true);
  view.setUint32(80, 0x100, true);
  bytes.set(flash, 0x100);
  const sha256 = digest(bytes);
  const loaded = loadStm32F429FirmwareArtifact({ profile: STM32_PROFILE,
    format: 'elf32', bytes, expectedSha256: sha256 });
  return { bytes, sha256, loaded };
}

test('bounded STM32 source accepts only PB0 level and uppercase USART3 marker', () => {
  assert.deepEqual(validateStm32Source(sourceForStm32('STM32 HIGH', true)).pb0, true);
  assert.deepEqual(validateStm32Source(sourceForStm32('STM32 LOW', false)).pb0, false);
  for (const source of [
    sourceForStm32('STM32 HIGH', true).replace('intent_pb0_output', 'intent_pb1_output'),
    sourceForStm32('STM32 HIGH', true).replace('STM32 HIGH', 'lowercase'),
    `${sourceForStm32('STM32 HIGH', true)}intent_spi1();\n`,
  ]) assert.throws(() => validateStm32Source(source), /SOURCE_POLICY_REJECTED/u);
});

test('late abort during fake child cleanup rejects natural completion after exact absence check', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'stm32-fake-docker-'));
  const fakeDocker = join(directory, 'docker');
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(fakeDocker, `#!/bin/sh
case "$1" in
  run) printf '{"ok":true}\\n'; exit 0 ;;
  rm) sleep 0.08; exit 0 ;;
  container) printf 'Error: No such container: fake\\n' >&2; exit 1 ;;
  kill) exit 0 ;;
esac
exit 2
`, { mode: 0o755 });
  const controller = new AbortController();
  const pending = childOutput({ docker: fakeDocker, args: ['run'], timeoutMs: 2_000,
    outputLimit: 1024, signal: controller.signal, containerName: 'fake' });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(pending, /OPERATION_CANCELLED/u);
});

test('public STM32 service binds source to strict ELF and returns actual-runtime truth without retention', async (context) => {
  const fixture = strictFixture();
  let buildCalls = 0;
  let runCalls = 0;
  const service = createStm32PublicService({
    builderImageLock: imageLock, runtimeImageLock: imageLock, testMode: true,
    builder: async ({ source, sourceSha256 }) => {
      buildCalls += 1;
      const parsed = validateStm32Source(source);
      return {
        schema: 'intent-mcu-stm32-builder-result@1', status: 'succeeded', profile: STM32_PROFILE,
        sourceSha256, behavior: { pb0: parsed.pb0, marker: parsed.marker, uartText: parsed.uartText },
        elf: { format: 'elf32', bytes: fixture.bytes.byteLength, sha256: fixture.sha256,
          base64: Buffer.from(fixture.bytes).toString('base64') },
        vector: { initialStackPointer: fixture.loaded.descriptor.initialStackPointer,
          resetVector: fixture.loaded.descriptor.resetVector,
          entryPoint: fixture.loaded.descriptor.entryPoint },
        compiler: { id: 'arm-none-eabi-gcc', version: '14.3.1', compilerInvoked: true },
      };
    },
    runtime: async ({ expected }) => {
      runCalls += 1;
      return { engine: { version: '1.17.0' }, observed: { pb0: expected.pb0,
        uartText: expected.uartText }, resetReplay: true };
    },
  });
  const server = http.createServer((request, response) => { void service.handle(request, response); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => { await service.close(); await new Promise((resolve) => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'Content-Type': 'application/json', Origin: base, 'X-Intent-MCU-STM32': '1' };
  const source = sourceForStm32('STM32 HIGH', true);

  const rejected = await fetch(`${base}/api/stm32/build`, { method: 'POST',
    headers: { ...headers, Origin: 'https://wrong.example' }, body: '{}' });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get('cache-control'), 'no-store');
  assert.equal(rejected.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');

  const invalid = await fetch(`${base}/api/stm32/build`, { method: 'POST', headers,
    body: JSON.stringify({ schema: STM32_BUILD_SCHEMA, profile: STM32_PROFILE,
      sourceRevision: 1, source: source.replace('STM32 HIGH', 'lowercase') }) });
  assert.equal(invalid.status, 422);
  assert.equal(buildCalls, 0);

  const builtResponse = await fetch(`${base}/api/stm32/build`, { method: 'POST', headers,
    body: JSON.stringify({ schema: STM32_BUILD_SCHEMA, profile: STM32_PROFILE,
      sourceRevision: 2, source }) });
  assert.equal(builtResponse.status, 200);
  const built = await builtResponse.json();
  assert.equal(built.sourceSha256, digest(source));
  assert.equal(built.artifact.sha256, fixture.sha256);
  assert.equal(built.retainedServerBytes, 0);
  assert.equal(buildCalls, 1);

  const stale = await fetch(`${base}/api/stm32/run`, { method: 'POST', headers,
    body: JSON.stringify({ schema: STM32_RUN_SCHEMA, profile: STM32_PROFILE,
      sourceRevision: 2, source, sourceSha256: '0'.repeat(64), artifact: built.artifact }) });
  assert.equal(stale.status, 409);
  assert.equal(runCalls, 0);

  const x92Binding = { schema: 'intent-mcu-x92-stm32-execution-binding@1', profile: STM32_PROFILE,
    requestNonce: 'Stm32ServiceTest001', projectGeneration: 9,
    sourceIdentity: `sha256:${built.sourceSha256}`, graphIdentity: `sha256:${'c'.repeat(64)}`,
    elfIdentity: `sha256:${built.artifact.sha256}`,
    modelIdentity: `sha256:${CURRENT_MODEL_LIBRARY_LOCK.implementationSha256}`,
    compiler: { imageIdentity: STM32_EXECUTION_IDENTITIES.compilerImageIdentity,
      toolchainIdentity: STM32_EXECUTION_IDENTITIES.compilerToolchainIdentity },
    runtime: { imageIdentity: STM32_EXECUTION_IDENTITIES.runtimeImageIdentity,
      binaryIdentity: STM32_EXECUTION_IDENTITIES.runtimeBinaryIdentity } };
  for (const rejectedBinding of [
    { ...x92Binding, extra: true },
    { ...x92Binding, sourceIdentity: `sha256:${'e'.repeat(64)}` },
    { ...x92Binding, elfIdentity: `sha256:${'e'.repeat(64)}` },
    { ...x92Binding, modelIdentity: `sha256:${'e'.repeat(64)}` },
    { ...x92Binding, compiler: { ...x92Binding.compiler,
      imageIdentity: `sha256:${'e'.repeat(64)}` } },
    { ...x92Binding, runtime: { ...x92Binding.runtime,
      binaryIdentity: `sha256:${'e'.repeat(64)}` } },
  ]) {
    const rejectedRun = await fetch(`${base}/api/stm32/run`, { method: 'POST', headers,
      body: JSON.stringify({ schema: STM32_RUN_SCHEMA, profile: STM32_PROFILE,
        sourceRevision: 2, source, sourceSha256: built.sourceSha256, artifact: built.artifact,
        x92Binding: rejectedBinding }) });
    assert.notEqual(rejectedRun.status, 200);
    assert.equal(runCalls, 0);
  }
  const runResponse = await fetch(`${base}/api/stm32/run`, { method: 'POST', headers,
    body: JSON.stringify({ schema: STM32_RUN_SCHEMA, profile: STM32_PROFILE,
      sourceRevision: 2, source, sourceSha256: built.sourceSha256, artifact: built.artifact,
      x92Binding }) });
  assert.equal(runResponse.status, 200);
  const result = await runResponse.json();
  assert.deepEqual(result.observed, { pb0: true, uartText: 'STM32 HIGH\n' });
  assert.equal(result.engine.actualExecution, true);
  assert.equal(result.resetReplay, true);
  assert.equal(result.bootEpochs, 2);
  assert.equal(result.retainedServerBytes, 0);
  assert.equal(result.completion.processExited, true);
  assert.equal(result.completion.daemonContainerAbsent, true);
  assert.deepEqual(result.completion.binding, x92Binding);
  const quiescenceResponse = await fetch(`${base}/api/stm32/quiescence`, { method: 'POST', headers,
    body: JSON.stringify({ schema: 'intent-mcu-x92-stm32-quiescence-request@1',
      binding: x92Binding, completion: result.completion }) });
  assert.equal(quiescenceResponse.status, 200);
  assert.deepEqual((await quiescenceResponse.json()).completion, result.completion);
  const replay = await fetch(`${base}/api/stm32/quiescence`, { method: 'POST', headers,
    body: JSON.stringify({ schema: 'intent-mcu-x92-stm32-quiescence-request@1',
      binding: x92Binding, completion: result.completion }) });
  assert.equal(replay.status, 409);
  assert.equal(service.metrics().retainedServerBytes, 0);
  assert.equal(runCalls, 1);
});
