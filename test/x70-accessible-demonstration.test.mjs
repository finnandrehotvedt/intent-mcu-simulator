// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ACCESSIBLE_DEMONSTRATION_SCHEMA,
  accessibleDemonstrationInputGuard,
  accessibleMeasurementsFromSharedSummary,
  avrAccessibleRuntimeBindingMatches,
  createAccessibleDemonstration,
  stableAccessibleDemonstrationStringify,
  validateAccessibleDemonstrationReport,
} from '../src/accessible-demonstration-export.mjs';
import {
  AVR_PROFILE, ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE,
} from '../src/compile-targets.mjs';
import { createEsp32C3CircuitDraft } from '../src/esp32c3-public-circuit.mjs';
import { createExampleProject } from '../src/example-projects.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { sharedInstrumentSummary } from '../src/instrument-capabilities.mjs';
import { createLifecycleState, transitionLifecycle } from '../src/lifecycle.mjs';
import { RELEASE_VERSION } from '../src/release-metadata.mjs';
import { createRp2040PicoCircuitDraft } from '../src/rp2040-pico-circuit.mjs';
import { createStm32CircuitDraft } from '../src/stm32-public-circuit.mjs';
import { createMaximumSupportedGraphFixture } from './maximum-supported-graph-fixture.mjs';

const clone = (value) => structuredClone(value);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const noMeasurements = () => ({
  status: 'no-current-measurements', artifactIdentity: null, revision: null,
  reason: 'No current source-bound runtime measurements were present when this local snapshot was created.',
  authority: 'none',
});
const unavailable = (reason) => ({ classification: 'unavailable', provenance: reason,
  time: { basis: 'unavailable', cycle: null, virtualMilliseconds: null },
  retention: { retained: null, dropped: null, limit: null }, value: null });
const observed = (classification, provenance, basis, value, retained = 1, limit = null) => ({
  classification, provenance, time: { basis, cycle: basis === 'virtual-cycle' || basis === 'virtual-cycle-and-nanoseconds' ? 32_000 : null,
    virtualMilliseconds: basis === 'virtual-cycle' || basis === 'virtual-cycle-and-nanoseconds' ? 2 : null },
  retention: { retained, dropped: 0, limit }, value,
});

function currentSummaries() {
  const hash = (character) => character.repeat(64);
  return [
    { schema: 'intent-mcu-shared-instrument-summary@1', profile: AVR_PROFILE, revision: 7,
      artifactIdentity: hash('a'), state: 'current-runtime', provenance: 'Compiled artifact → avr8js worker → project-owned circuit model',
      channels: {
        serial: observed('recorded-runtime', 'USART0 TX/RX records from the current avr8js worker snapshot', 'virtual-cycle',
          { records: [{ direction: 'tx', cycle: 31_000, value: 65, text: 'A', virtualMilliseconds: 1.9375, baud: 9600, frameCycles: 16640 }] }, 1, 4096),
        gpio: observed('recorded-runtime', 'D0–D13/A0–A5 pin state from the current avr8js worker snapshot', 'virtual-cycle',
          { pins: [{ pin: 'D13', mode: 'OUTPUT', level: true, externalDrive: 'RELEASED', pwm: null, diagnostic: 'OK' }], selectedPin: 'D13' }, 1, 20),
        logic: observed('recorded-runtime', 'Digital transitions from the current avr8js worker snapshot', 'virtual-cycle',
          { channels: ['D13'], transitions: [{ pin: 'D13', cycle: 30_000, level: true }] }, 1, 100000),
        input: observed('recorded-runtime', 'Ordered controls and USART0 RX from the current avr8js worker snapshot', 'virtual-cycle',
          { records: 1 }, 1, 10000),
      } },
    { schema: 'intent-mcu-shared-instrument-summary@1', profile: RP2040_PROFILE, revision: 7,
      artifactIdentity: hash('b'), state: 'current-runtime', provenance: 'Compiled UF2 → rp2040js worker',
      channels: {
        serial: observed('recorded-runtime', 'UART0 output from the current rp2040js worker snapshot', 'virtual-cycle',
          { records: [{ direction: 'tx', cycle: 31_000, value: 80, text: 'P', virtualMilliseconds: 0.248 }], text: 'P' }, 1, 4096),
        gpio: observed('recorded-runtime', 'GPIO0 state from the current rp2040js worker snapshot', 'virtual-cycle',
          { pins: [{ pin: 'GPIO0', mode: 'output', level: true, lastCycle: 31_000 }], selectedPin: 'GPIO0' }, 1, 1),
        logic: observed('recorded-runtime', 'GPIO0 transitions from the current rp2040js worker snapshot', 'virtual-cycle-and-nanoseconds',
          { channels: ['GPIO0'], transitions: [{ pin: 'GPIO0', cycle: 31_000, virtualNanos: 248_000, level: true }] }, 1),
        input: unavailable('No public RP2040 runtime input evidence is approved.'),
      } },
    { schema: 'intent-mcu-shared-instrument-summary@1', profile: ESP32C3_PROFILE, revision: 7,
      artifactIdentity: hash('c'), state: 'current-runtime', provenance: 'Compiled flash → Espressif QEMU CPU/UART',
      channels: {
        serial: observed('recorded-runtime', 'Actual Espressif QEMU UART output from the current flash execution', 'reset-epoch-sequence',
          { text: 'C3', bootEpochs: [{ version: 'ESP-ROM:esp32c3-api1-20210207', reset: '0x1 (POWERON)',
            boot: '0x8 (SPI_FAST_FLASH_BOOT)', mode: 'DIO', entry: '0x403cbf10', marker: 'C3' }] }, 1),
        gpio: observed('project-model', 'Project-owned GPIO2 register adapter; not QEMU pin state', 'adapter-epoch-sequence',
          { pins: [{ pin: 'GPIO2', schema: 'intent-mcu-project-c3-gpio2-state@1', generation: 1,
            epoch: 2, writes: 4, outputLatchHigh: true, outputEnabled: true, outputMatrixSignal: 128,
            outputEnableFromGpioRegister: true, ioMuxFunction: 1, muxConfigured: true,
            drive: 'high', volts: 3.3, provenance: { cpuExecution: 'Espressif QEMU esp32c3 actual executed stores',
              peripheralModel: 'IntentForce project-owned register adapter', qemuPinStateObserved: false } }],
          selectedPin: 'GPIO2', source: { pin: 2, mode: 'OUTPUT', level: 'HIGH' } }, 2),
        logic: observed('project-model', 'Project-owned GPIO2 adapter epoch sequence; not QEMU CPU GPIO or pin timing', 'adapter-epoch-sequence',
          { channels: ['GPIO2 model'], transitions: [
            { channel: 'GPIO2 model', sequence: 1, level: true, state: 'high' },
            { channel: 'GPIO2 model', sequence: 2, level: true, state: 'high' },
          ] }, 2, 2),
        input: unavailable('No public ESP32-C3 runtime input evidence is available.'),
      } },
    { schema: 'intent-mcu-shared-instrument-summary@1', profile: STM32F429ZI_PROFILE, revision: 7,
      artifactIdentity: hash('d'), state: 'current-runtime', provenance: 'Compiled ELF → Renode 1.17.0',
      channels: {
        serial: observed('recorded-runtime', 'Actual Renode USART3 output from the current ELF execution', 'reset-epoch-sequence',
          { text: 'STM32\n' }, 2, 2),
        gpio: observed('recorded-runtime', 'PB0 level observed by Renode in the current ELF execution', 'instruction-order-only',
          { pins: [{ pin: 'PB0', level: true }], selectedPin: 'PB0' }, 1, 1),
        logic: observed('recorded-runtime', 'Actual Renode PB0 final observation; no timed transition waveform is produced', 'instruction-order-only',
          { channels: ['PB0'], transitions: [{ channel: 'PB0', sequence: 1, level: true, state: 'final-observation' }] }, 1, 1),
        input: unavailable('No public STM32 runtime input evidence is available.'),
      } },
  ];
}

function fixtures() {
  const avr = createExampleProject('blink').project;
  const pico = createRp2040PicoCircuitDraft();
  const c3 = createEsp32C3CircuitDraft();
  const stm32 = createStm32CircuitDraft();
  return [
    [AVR_PROFILE, avr.circuit, avr.layout],
    [RP2040_PROFILE, pico, pico.layout],
    [ESP32C3_PROFILE, c3, c3.layout],
    [STM32F429ZI_PROFILE, stm32, stm32.layout],
  ];
}

function input(profile, graph, layout) {
  return {
    productRelease: RELEASE_VERSION, profile, projectName: `${profile} demonstration`,
    graph: clone(graph), layout: clone(layout), modelLibraryLock: clone(CURRENT_MODEL_LIBRARY_LOCK),
    measurements: noMeasurements(), generation: 3, revision: 7,
  };
}

function rehash(report) {
  report.project.circuitSha256 = sha256(JSON.stringify({
    components: report.components.map((component) => ({
      id: component.id, type: component.type, label: component.label,
      properties: Object.fromEntries(component.properties.map(({ name, value }) => [name, value])),
    })),
    nets: report.nets.map((net) => ({ id: net.id,
      endpoints: net.endpoints.map(({ componentId, pinId }) => ({ componentId, pinId })) })),
    junctions: report.junctions.map(({ id, netId }) => ({ id, netId })),
  }));
  const { integrity: _integrity, ...projection } = report;
  report.integrity.reportSha256 = sha256(stableAccessibleDemonstrationStringify(projection));
  return report;
}

test('X70 produces stable all-profile source-owned geometry and explicit no-current status', async () => {
  for (const [profile, graph, layout] of fixtures()) {
    const first = await createAccessibleDemonstration(input(profile, graph, layout));
    const second = await createAccessibleDemonstration(input(profile, graph, layout));
    assert.equal(first.svg, second.svg, profile);
    assert.deepEqual(first.report, second.report, profile);
    assert.equal(first.report.schema, ACCESSIBLE_DEMONSTRATION_SCHEMA);
    assert.equal(first.report.productRelease, RELEASE_VERSION);
    assert.deepEqual(first.report.modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
    assert.equal(first.report.measurements.status, 'no-current-measurements');
    assert.equal(first.report.measurements.artifactIdentity, null);
    assert.equal(first.report.measurements.authority, 'none');
    assert.match(first.svg, /<title id="x70-title">/u);
    assert.match(first.svg, /No current measurements/u);
    assert.doesNotMatch(first.svg, /<(?:script|style|foreignObject|image|use|a)\b|\b(?:href|onload)=|javascript:/iu);
    await validateAccessibleDemonstrationReport(first.report);
    const pins = new Map(first.report.components.flatMap((component) =>
      component.pins.map((pin) => [`${component.id}.${pin.id}`, pin.point])));
    for (const net of first.report.nets) {
      assert.equal(net.paths.length, net.endpoints.length);
      for (const path of net.paths) assert.deepEqual(path.points[0], pins.get(path.endpoint));
    }
  }
});

test('X70 v2 projects strict current native measurements for all four profiles', async () => {
  const summaries = currentSummaries();
  for (const [index, [profile, graph, layout]] of fixtures().entries()) {
    const measurements = accessibleMeasurementsFromSharedSummary(summaries[index]);
    const source = { ...input(profile, graph, layout), measurements };
    const first = await createAccessibleDemonstration(source);
    const second = await createAccessibleDemonstration(source);
    assert.equal(first.svg, second.svg, profile);
    assert.equal(first.report.measurements.status, 'current-runtime-measurements');
    assert.equal(first.report.measurements.profile, profile);
    assert.equal(first.report.measurements.artifactIdentity, summaries[index].artifactIdentity);
    assert.equal(first.report.measurements.revision, 7);
    assert.equal(first.report.measurements.authority, 'observation-only');
    assert.deepEqual(first.report.measurements.channels.map(({ id }) => id), ['serial', 'gpio', 'logic', 'input']);
    assert.match(first.svg, /Current runtime measurements/u);
    assert.match(first.svg, /observation-only/iu);
    await validateAccessibleDemonstrationReport(first.report);
  }
  const c3 = accessibleMeasurementsFromSharedSummary(summaries[2]);
  assert.equal(c3.channels.find(({ id }) => id === 'gpio').classification, 'project-model');
  assert.match(c3.channels.find(({ id }) => id === 'gpio').provenance, /not QEMU pin state/u);
  assert.equal(c3.channels.find(({ id }) => id === 'gpio').retention.retained, 2);
  assert.equal(c3.channels.find(({ id }) => id === 'gpio').value.pins.length, 1);
  const stm32 = accessibleMeasurementsFromSharedSummary(summaries[3]);
  assert.equal(stm32.channels.find(({ id }) => id === 'logic').time.basis, 'instruction-order-only');
});

test('X70 v2 rejects extra, stale, relabelled and invented measurement facts', async () => {
  const [profile, graph, layout] = fixtures()[2];
  const summary = currentSummaries()[2];
  for (const [name, mutate] of [
    ['summary extra', (value) => { value.extra = true; }],
    ['channel extra', (value) => { value.channels.serial.extra = true; }],
    ['C3 QEMU relabel', (value) => { value.channels.gpio.provenance = 'Actual QEMU pin state'; }],
    ['C3 recorded relabel', (value) => { value.channels.gpio.classification = 'recorded-runtime'; }],
    ['unknown time', (value) => { value.channels.logic.time.basis = 'wall-clock'; }],
    ['invented input', (value) => { value.channels.input = observed('recorded-runtime', 'invented', 'virtual-cycle', { records: 1 }); }],
    ['serial record extra', (value) => { value.channels.serial.value = { records: [{ text: 'C3', secret: true }], text: 'C3' }; }],
  ]) {
    const value = clone(summary); mutate(value);
    assert.throws(() => accessibleMeasurementsFromSharedSummary(value), undefined, name);
  }
  const accepted = accessibleMeasurementsFromSharedSummary(summary);
  for (const [name, mutate] of [
    ['profile binding', (value) => { value.profile = RP2040_PROFILE; }],
    ['revision binding', (value) => { value.revision += 1; }],
    ['extra field', (value) => { value.extra = true; }],
    ['STM32-like invented waveform', (value) => { value.channels[2].time.basis = 'virtual-cycle'; }],
  ]) {
    const measurements = clone(accepted); mutate(measurements);
    await assert.rejects(() => createAccessibleDemonstration({ ...input(profile, graph, layout), measurements }),
      undefined, name);
  }
});

test('X70 v2 rejects semantic measurement forgeries even after report rehash', async () => {
  const reports = [];
  for (const [index, [profile, graph, layout]] of fixtures().entries()) {
    const measurements = accessibleMeasurementsFromSharedSummary(currentSummaries()[index]);
    reports.push((await createAccessibleDemonstration({ ...input(profile, graph, layout), measurements })).report);
  }
  const cases = [
    ['AVR wrong known-time basis', 0, (report) => {
      const channel = report.measurements.channels[0];
      channel.time = { basis: 'instruction-order-only', cycle: null, virtualMilliseconds: null };
    }],
    ['C3 wrong pin identity', 2, (report) => {
      const channel = report.measurements.channels[1];
      channel.value.pins[0].pin = 'GPIO3'; channel.value.selectedPin = 'GPIO3';
    }],
    ['STM32 invented waveform', 3, (report) => {
      const channel = report.measurements.channels[2];
      channel.value.transitions.push({ channel: 'PB0', sequence: 2, level: false, state: 'final-observation' });
      channel.value.displayed = 2; channel.retention.retained = 2; channel.retention.limit = 2;
    }],
    ['unavailable channel with a known cycle', 1, (report) => {
      report.measurements.channels[3].time.cycle = 1;
    }],
    ['retention does not match projected records', 0, (report) => {
      report.measurements.channels[0].retention.retained += 1;
    }],
  ];
  for (const [name, index, mutate] of cases) {
    const forged = clone(reports[index]); mutate(forged);
    await assert.rejects(() => validateAccessibleDemonstrationReport(rehash(forged)), undefined, name);
  }
});

test('X70 AVR binding rejects a valid old runtime joined to a new artifact identity', () => {
  const hash = (character) => character.repeat(64);
  const base = {
    projectArtifactIdentity: hash('a'), stateArtifactIdentity: hash('a'),
    artifact: { artifactIdentity: hash('a'), inputIdentity: hash('b'), projectGeneration: 4 },
    binding: { artifactIdentity: hash('a'), projectGeneration: 4, runtimeGeneration: 9 },
    runtimeIdentity: { artifactIdentity: hash('a'), projectGeneration: 4, runtimeGeneration: 9,
      modelImplementationSha256: hash('c'), modelExecutionContextSha256: hash('d') },
    build: { artifactIdentity: hash('a'), inputIdentity: hash('b'), modelImplementationSha256: hash('c'),
      modelExecutionContextSha256: hash('d'), toolchainIdentitySha256: hash('e'),
      toolchainImageId: `sha256:${hash('f')}` },
    runtimeModelExecutionContextSha256: hash('d'), loadedSourceIdentity: '{"source":"current"}',
    currentSourceIdentity: '{"source":"current"}', modelImplementationSha256: hash('c'),
    expectedToolchainIdentitySha256: hash('e'),
  };
  assert.equal(avrAccessibleRuntimeBindingMatches(base), true);
  const rebound = clone(base);
  rebound.projectArtifactIdentity = hash('9'); rebound.stateArtifactIdentity = hash('9');
  rebound.artifact.artifactIdentity = hash('9'); rebound.binding.artifactIdentity = hash('9');
  rebound.build.artifactIdentity = hash('9');
  assert.equal(avrAccessibleRuntimeBindingMatches(rebound), false);
  const staleSource = clone(base); staleSource.currentSourceIdentity = '{"source":"edited"}';
  assert.equal(avrAccessibleRuntimeBindingMatches(staleSource), false);
});

test('X70 AVR Save/Open seam retires runtime authority without another producer', () => {
  const main = readFileSync(new URL('../staging/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /function installPreparedProjectEnvelope[\s\S]*installProjectGeneration\(\{[\s\S]*reason: 'project\.file-open'/u);
  assert.match(main, /function installProjectGeneration[\s\S]*stopRuntime\(runtimeMessage, \{ updateLifecycle: false \}\)[\s\S]*type: 'project\.install'/u);
  assert.match(main, /publish\(\{[\s\S]*artifactIdentity: null[\s\S]*runtime: null/u);

  const hash = (character) => character.repeat(64);
  let lifecycle = createLifecycleState({ empty: false });
  const started = transitionLifecycle(lifecycle, { type: 'build.start' });
  lifecycle = transitionLifecycle(started.state, { type: 'build.succeeded', binding: started.binding,
    artifactIdentity: hash('a'), inputIdentity: hash('b') }).state;
  const loaded = transitionLifecycle(lifecycle, { type: 'runtime.load' });
  lifecycle = transitionLifecycle(loaded.state, { type: 'runtime.run' }).state;
  lifecycle = transitionLifecycle(lifecycle, { type: 'runtime.pause' }).state;
  assert.equal(lifecycle.phase, 'paused');
  const opened = transitionLifecycle(lifecycle, {
    type: 'project.install', empty: false, reason: 'project.file-open',
  }).state;
  assert.equal(opened.phase, 'editing');
  assert.equal(opened.artifact, null);
  assert.equal(opened.runtimeBinding, null);
  const summary = sharedInstrumentSummary(AVR_PROFILE, {
    lifecycle: opened, artifactIdentity: null, runtime: null,
  });
  assert.equal(summary.state, 'no-current-runtime');
  assert.equal(summary.artifactIdentity, null);
  assert(Object.values(summary.channels).every((channel) => channel.classification === 'unavailable'));
});

test('X70 rechecks live guard after every asynchronous boundary', async () => {
  const [profile, graph, layout] = fixtures()[0];
  let current = true; let calls = 0;
  const guardedSha = async (value) => {
    calls += 1;
    const digest = sha256(value);
    if (calls === 1) current = false;
    return digest;
  };
  await assert.rejects(() => createAccessibleDemonstration(input(profile, graph, layout), {
    sha256: guardedSha, isCurrent: () => current,
  }), /ACCESSIBLE_DEMONSTRATION_STALE_EXPORT/u);
});

test('X70 includes authored movement rotation and Inspector-equivalent property changes', async () => {
  const graph = createRp2040PicoCircuitDraft();
  const beforeInput = input(RP2040_PROFILE, graph, graph.layout);
  const before = await createAccessibleDemonstration(beforeInput);
  const edited = clone(graph);
  edited.components.find(({ id }) => id === 'resistor-1').properties.ohms = 330;
  edited.layout.positions['resistor-1'] = { x: 0.61, y: 0.39, rotation: 90 };
  const after = await createAccessibleDemonstration(input(RP2040_PROFILE, edited, edited.layout));
  assert.notEqual(after.svg, before.svg);
  assert.equal(after.report.components.find(({ id }) => id === 'resistor-1')
    .properties.find(({ name }) => name === 'ohms').value, 330);
  assert.deepEqual(after.report.components.find(({ id }) => id === 'resistor-1').position,
    { x: 0.61, y: 0.39, rotation: 90 });
  assert.notEqual(accessibleDemonstrationInputGuard(beforeInput),
    accessibleDemonstrationInputGuard(input(RP2040_PROFILE, edited, edited.layout)));
});

test('X70 strict boundaries reject unknown identities, malformed graph/layout and positive synthetic evidence', async () => {
  const [profile, graph, layout] = fixtures()[0];
  const base = input(profile, graph, layout);
  const cases = [
    ['profile', (value) => { value.profile = 'board.unknown-v1'; }],
    ['release', (value) => { value.productRelease = '1.1.0-rc.fake'; }],
    ['model', (value) => { value.modelLibraryLock.version = 'forged'; }],
    ['pin', (value) => { value.graph.nets[0].endpoints[0].pin = 'NOPE'; }],
    ['duplicate endpoint', (value) => { value.graph.nets[1].endpoints[0] = clone(value.graph.nets[0].endpoints[0]); }],
    ['position', (value) => { value.layout.positions[Object.keys(value.layout.positions)[0]].x = 4; }],
    ['route', (value) => { value.layout.wireRoutes[value.graph.nets[0].id] = { schema: 'intent-mcu-route@1', branches: [] }; }],
    ['text', (value) => { value.projectName = `bad\u0000name`; }],
    ['oversize', (value) => { value.projectName = 'x'.repeat(600_000); }],
    ['synthetic runtime', (value) => { value.measurements = { status: 'current-runtime',
      artifactIdentity: 'a'.repeat(64), revision: 1, reason: 'test', authority: 'test' }; }],
  ];
  for (const [name, mutate] of cases) {
    const value = clone(base); mutate(value);
    await assert.rejects(() => createAccessibleDemonstration(value), undefined, name);
  }
});

test('X70 report hash, shape, ordering, route terminal and no-current authority reject tampering', async () => {
  const [profile, graph, layout] = fixtures()[1];
  const baseline = (await createAccessibleDemonstration(input(profile, graph, layout))).report;
  for (const [name, mutate] of [
    ['hash', (value) => { value.integrity.reportSha256 = '0'.repeat(64); }],
    ['extra', (value) => { value.extra = true; }],
    ['measurement', (value) => { value.measurements.authority = 'runtime'; }],
    ['route terminal', (value) => { value.nets[0].paths[0].points[0].x += 0.01; }],
    ['duplicate component', (value) => { value.components.push(clone(value.components[0])); }],
    ['order', (value) => { value.nets.reverse(); }],
  ]) {
    const candidate = clone(baseline); mutate(candidate);
    await assert.rejects(() => validateAccessibleDemonstrationReport(candidate), undefined, name);
  }
  assert.equal(stableAccessibleDemonstrationStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test('X70 rejects invalid or missing authored properties even after an attacker recomputes both hashes', async () => {
  const [profile, graph, layout] = fixtures()[1];
  const baseline = (await createAccessibleDemonstration(input(profile, graph, layout))).report;
  const resistor = baseline.components.find(({ id }) => id === 'resistor-1');
  assert(resistor);
  const invalid = clone(baseline);
  invalid.components.find(({ id }) => id === 'resistor-1')
    .properties.find(({ name }) => name === 'ohms').value = 'not-a-resistance';
  await assert.rejects(() => validateAccessibleDemonstrationReport(rehash(invalid)),
    /ACCESSIBLE_DEMONSTRATION_PROPERTY/u);
  const missing = clone(baseline);
  missing.components.find(({ id }) => id === 'resistor-1').properties = [];
  await assert.rejects(() => validateAccessibleDemonstrationReport(rehash(missing)),
    /ACCESSIBLE_DEMONSTRATION_PROPERTY/u);
});

test('X70 captures all input before its first await', async () => {
  const [profile, graph, layout] = fixtures()[1];
  const source = input(profile, graph, layout);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const delayedSha = async (value) => {
    calls += 1;
    if (calls === 1) await gate;
    return sha256(value);
  };
  const pending = createAccessibleDemonstration(source, { sha256: delayedSha });
  source.generation = 99;
  source.revision = 101;
  source.projectName = 'mutated outside the export';
  source.measurements.authority = 'runtime';
  source.graph.components[0].label = 'mutated component';
  source.layout.positions[Object.keys(source.layout.positions)[0]].x = 0.99;
  release();
  const result = await pending;
  assert.equal(result.report.project.generation, 3);
  assert.equal(result.report.project.revision, 7);
  assert.equal(result.report.project.name, `${profile} demonstration`);
  assert.equal(result.report.measurements.authority, 'none');
  assert.notEqual(result.report.components[0].label, 'mutated component');
});

test('X70 renders exact graph limits and long Unicode copy without clipping or hidden report text', async () => {
  const fixture = createMaximumSupportedGraphFixture();
  const graph = fixture.project.candidateCircuit;
  const layout = fixture.project.candidateLayout;
  const result = await createAccessibleDemonstration({
    ...input(AVR_PROFILE, graph, layout),
    projectName: 'Ø'.repeat(80),
  });
  assert.deepEqual({ components: result.report.counts.components, nets: result.report.counts.nets,
    endpoints: result.report.counts.endpoints }, { components: 64, nets: 128, endpoints: 256 });
  const height = Number(result.svg.match(/viewBox="0 0 1600 ([0-9.]+)"/u)?.[1]);
  assert(Number.isFinite(height) && height > 1000);
  const textCoordinates = [...result.svg.matchAll(/<text[^>]*\bx="([0-9.]+)"[^>]*\by="([0-9.]+)"/gu)];
  assert(textCoordinates.length > 300);
  for (const [, x, y] of textCoordinates) {
    assert(Number(x) >= 0 && Number(x) <= 1600, `text x=${x}`);
    assert(Number(y) >= 0 && Number(y) <= height, `text y=${y} height=${height}`);
  }
  assert.doesNotMatch(result.svg, /\b(?:display|visibility)\s*=|opacity="0"/iu);
  for (const net of result.report.nets) {
    for (const endpoint of net.endpoints) {
      assert(result.svg.includes(`data-kind="endpoint-label" data-id="${endpoint.key}"`), endpoint.key);
    }
  }
  for (const component of result.report.components) {
    assert(result.svg.includes(component.model.id), component.model.id);
    assert(result.svg.includes(component.model.support), component.model.support);
    for (const limitation of component.model.assumptions) assert(result.svg.includes(limitation), limitation);
  }
});
