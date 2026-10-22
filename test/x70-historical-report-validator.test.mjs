// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  ACCESSIBLE_DEMONSTRATION_HISTORICAL_VALIDATION_SCHEMA,
  accessibleMeasurementsFromSharedSummary,
  createAccessibleDemonstration,
  parseAccessibleDemonstrationReport,
  parseHistoricalAccessibleDemonstrationReport,
  stableAccessibleDemonstrationStringify,
} from '../src/accessible-demonstration-export.mjs';
import {
  AVR_PROFILE, ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE,
} from '../src/compile-targets.mjs';
import { createEsp32C3CircuitDraft } from '../src/esp32c3-public-circuit.mjs';
import { createExampleProject } from '../src/example-projects.mjs';
import {
  CURRENT_MODEL_LIBRARY_LOCK, PRE_X47_CURRENT_MODEL_LIBRARY_LOCK, PRIOR_CURRENT_MODEL_LIBRARY_LOCK,
} from '../src/model-library.mjs';
import { RELEASE_VERSION } from '../src/release-metadata.mjs';
import { createRp2040PicoCircuitDraft } from '../src/rp2040-pico-circuit.mjs';
import { createStm32CircuitDraft } from '../src/stm32-public-circuit.mjs';

const clone = (value) => structuredClone(value);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const noMeasurements = () => ({
  status: 'no-current-measurements', artifactIdentity: null, revision: null,
  reason: 'No current source-bound runtime measurements were present when this local snapshot was created.',
  authority: 'none',
});
const fixtures = () => {
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
};
const lockFor = (profile) => profile === RP2040_PROFILE
  ? PRE_X47_CURRENT_MODEL_LIBRARY_LOCK : PRIOR_CURRENT_MODEL_LIBRARY_LOCK;

function rehash(report) {
  const { integrity: _integrity, ...projection } = report;
  report.integrity.reportSha256 = sha256(stableAccessibleDemonstrationStringify(projection));
  return report;
}

async function syntheticHistorical(profile, graph, layout, measurements = noMeasurements()) {
  const generated = await createAccessibleDemonstration({
    productRelease: RELEASE_VERSION,
    profile,
    projectName: `${profile} synthetic historical validator fixture`,
    graph: clone(graph),
    layout: clone(layout),
    modelLibraryLock: CURRENT_MODEL_LIBRARY_LOCK,
    measurements,
    generation: 3,
    revision: 7,
  });
  const report = clone(generated.report);
  report.productRelease = '1.1.0-rc.86';
  report.modelLibrary = clone(lockFor(profile));
  return rehash(report);
}

function avrSummary() {
  const observed = (classification, provenance, basis, value, retained, limit) => ({
    classification, provenance,
    time: { basis, cycle: 32_000, virtualMilliseconds: 2 },
    retention: { retained, dropped: 0, limit }, value,
  });
  return {
    schema: 'intent-mcu-shared-instrument-summary@1', profile: AVR_PROFILE,
    revision: 7, artifactIdentity: 'a'.repeat(64), state: 'current-runtime',
    provenance: 'Compiled artifact → avr8js worker → project-owned circuit model',
    channels: {
      serial: observed('recorded-runtime', 'USART0 TX/RX records from the current avr8js worker snapshot',
        'virtual-cycle', { records: [{ direction: 'tx', cycle: 31_000, value: 65, text: 'A',
          virtualMilliseconds: 1.9375, baud: 9600, frameCycles: 16640 }] }, 1, 4096),
      gpio: observed('recorded-runtime', 'D0–D13/A0–A5 pin state from the current avr8js worker snapshot',
        'virtual-cycle', { pins: [{ pin: 'D13', mode: 'OUTPUT', level: true, externalDrive: 'RELEASED',
          pwm: null, diagnostic: 'OK' }], selectedPin: 'D13' }, 1, 20),
      logic: observed('recorded-runtime', 'Digital transitions from the current avr8js worker snapshot',
        'virtual-cycle', { channels: ['D13'], transitions: [{ pin: 'D13', cycle: 30_000, level: true }] }, 1, 100000),
      input: observed('recorded-runtime', 'Ordered controls and USART0 RX from the current avr8js worker snapshot',
        'virtual-cycle', { records: 1 }, 1, 10000),
    },
  };
}

test('X70 historical validator accepts only the finite rc86 profile/model combinations without rewriting identity', async () => {
  assert.equal(RELEASE_VERSION, '1.1.0-rc.112');
  for (const [profile, graph, layout] of fixtures()) {
    const report = await syntheticHistorical(profile, graph, layout);
    const before = stableAccessibleDemonstrationStringify(report);
    await assert.rejects(() => parseAccessibleDemonstrationReport(JSON.stringify(report)),
      /ACCESSIBLE_DEMONSTRATION_REPORT/u, `${profile}: current parser stayed release-bound`);
    const accepted = await parseHistoricalAccessibleDemonstrationReport(JSON.stringify(report));
    assert.equal(accepted.schema, ACCESSIBLE_DEMONSTRATION_HISTORICAL_VALIDATION_SCHEMA);
    assert.equal(accepted.historical, true);
    assert.equal(accepted.dataOnly, true);
    assert.equal(accepted.executableAuthority, false);
    assert.equal(accepted.currentRuntimeAuthority, false);
    assert.equal(accepted.verdictAuthority, false);
    assert.equal(accepted.validatedSurface, 'canonical-exported-projected-facts-only');
    assert.equal(accepted.nativeSourcePayloadRetained, 'not-proven');
    assert.equal(accepted.originalIdentity.productRelease, '1.1.0-rc.86');
    assert.equal(accepted.originalIdentity.profile, profile);
    assert.deepEqual(accepted.originalIdentity.modelLibrary, lockFor(profile));
    assert.deepEqual(accepted.report, report);
    assert.equal(stableAccessibleDemonstrationStringify(report), before, `${profile}: input mutated`);
  }
});

test('X70 historical validator applies the existing strict projected-current measurement union', async () => {
  const [profile, graph, layout] = fixtures()[0];
  const measurements = accessibleMeasurementsFromSharedSummary(avrSummary());
  const report = await syntheticHistorical(profile, graph, layout, measurements);
  const accepted = await parseHistoricalAccessibleDemonstrationReport(JSON.stringify(report));
  assert.equal(accepted.originalIdentity.artifactIdentity, 'a'.repeat(64));
  assert.deepEqual(accepted.report.measurements, measurements);
  assert.match(accepted.limitations.join(' '), /not proof that native source payload bytes were retained/u);
  assert.match(accepted.limitations.join(' '), /not make this report current or executable/u);
});

test('X70 historical validator rejects future, unknown, relabelled and mixed release/model identities', async () => {
  for (const [profile, graph, layout] of fixtures()) {
    const report = await syntheticHistorical(profile, graph, layout);
    for (const [name, mutate] of [
      ['current release', (value) => { value.productRelease = RELEASE_VERSION; }],
      ['older release', (value) => { value.productRelease = '1.1.0-rc.85'; }],
      ['future release', (value) => { value.productRelease = '1.1.0-rc.112'; }],
      ['mixed lock', (value) => { value.modelLibrary = clone(profile === RP2040_PROFILE
        ? PRIOR_CURRENT_MODEL_LIBRARY_LOCK : CURRENT_MODEL_LIBRARY_LOCK); }],
      ['forged schema', (value) => { value.schema = 'intent-mcu-accessible-demonstration@3'; }],
      ['unknown field', (value) => { value.historical = true; }],
      ['self-hashed lock', (value) => { value.modelLibrary.manifestSha256 = 'f'.repeat(64); }],
    ]) {
      const altered = clone(report); mutate(altered); rehash(altered);
      await assert.rejects(() => parseHistoricalAccessibleDemonstrationReport(JSON.stringify(altered)),
        undefined, `${profile}:${name}`);
    }
  }
});

test('X70 historical validator rejects recomputed-hash measurement and authored-model mutations', async () => {
  const [profile, graph, layout] = fixtures()[0];
  const report = await syntheticHistorical(profile, graph, layout,
    accessibleMeasurementsFromSharedSummary(avrSummary()));
  for (const [name, mutate] of [
    ['time', (value) => { value.measurements.channels[0].time.basis = 'wall-clock'; }],
    ['provenance', (value) => { value.measurements.channels[0].provenance = 'forged provenance'; }],
    ['classification', (value) => { value.measurements.channels[0].classification = 'physical-calibrated'; }],
    ['retention', (value) => { value.measurements.channels[0].retention.retained = 4097; }],
    ['channel extra', (value) => { value.measurements.channels[0].physicalTruth = true; }],
    ['model assumption', (value) => { value.components[0].model.assumptions[0] = 'calibrated hardware'; }],
    ['authored property', (value) => { value.components.find(({ type }) => type === 'resistor.fixed-v1')
      .properties.find(({ name: key }) => key === 'ohms').value = 999; }],
  ]) {
    const altered = clone(report); mutate(altered); rehash(altered);
    await assert.rejects(() => parseHistoricalAccessibleDemonstrationReport(JSON.stringify(altered)),
      undefined, name);
  }
});
