// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createThermostatExperiment } from './thermostat-experiment.mjs';
import {
  RP2040_PUBLIC_PROJECT_SCHEMA, RP2040_PUBLIC_SOURCE,
} from './rp2040-public-workbench.mjs';
import { createRp2040PicoCircuitDraft, RP2040_PICO_PROFILE } from './rp2040-pico-circuit.mjs';
import {
  C3_PUBLIC_PROJECT_SCHEMA, C3_PUBLIC_SOURCE,
} from './esp32c3-public-workbench.mjs';
import { createEsp32C3CircuitDraft } from './esp32c3-public-circuit.mjs';
import { PROFILE as ESP32C3_PROFILE } from '../c3/protocol.mjs';
import {
  STM32_EDITABLE_PROJECT_SCHEMA, STM32_PUBLIC_SOURCE,
} from './stm32-public-workbench.mjs';
import { createStm32CircuitDraft } from './stm32-public-circuit.mjs';
import { STM32_PROFILE } from '../stm32/protocol.mjs';

export const REGRESSION_MATRIX_SCHEMA = 'intent-mcu-regression-matrix@1';
export const REGRESSION_REPORT_SCHEMA = 'intent-mcu-regression-report@1';
export const REGRESSION_EXPECTATION_OVERRIDE_SCHEMA = 'intent-mcu-regression-expectation-override@1';
export const X26_MATRIX_ID = 'x26-four-profile-output-observation-v1';

const clone = (value) => structuredClone(value);
const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
};
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`,
  ).join(',')}}`;
  return JSON.stringify(value);
}

export async function sha256Text(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

const MATRIX = {
  schema: REGRESSION_MATRIX_SCHEMA,
  matrixId: X26_MATRIX_ID,
  matrixVersion: '1.0.0',
  requirementFamilyId: 'REQ-EDITED-SOURCE-OUTPUT-OBSERVATION',
  cells: [
    {
      caseId: 'X26-AVR-THERMOSTAT-D13', profile: 'board.atmega328p-16mhz-v1',
      profileVersion: 'atmega328p-16mhz-v1', adapterId: 'existing.avr-thermostat-worker-v1',
      fixtureId: 'avr-thermostat-boundary-v1',
      fixtureSha256: '1b7bcd61cb63bc7c9ae0e6166ef924b1b97ecb299ea93b5fabda1caf26783b89',
      sourceSha256: 'abc65e1212c72aaed7325c059cb785a8872b45fddc7ba67ceb0cb098d2c0da76',
      toolchain: 'Arduino AVR core 1.8.8 · avr-gcc 7.3.0-atmel3.6.1-arduino7',
      runtime: 'avr8js 0.21.1 browser worker', scenarioId: 'avr-thermostat-four-boundary-scenarios-v1',
      observationOwner: 'actual worker D13 plus UART and ordered input evidence',
      expected: { kind: 'avr.thermostat-summary', scenariosPassed: 4, scenariosTotal: 4, equalityD13: false },
      limitation: 'Ideal A1 sensor, ideal no-bounce D2 input and D13 command indicator only; no physical heater or broad AVR equivalence.',
    },
    {
      caseId: 'X26-RP2040-GPIO0-UART0', profile: RP2040_PICO_PROFILE,
      profileVersion: 'rp2040-pico-v1', adapterId: 'existing.rp2040-public-workbench-v1',
      fixtureId: 'rp2040-public-default-v1',
      fixtureSha256: '82d3078c3d5a19719669e2255b0757229c59aaa96d7e3ee2c00f27ebca39e314',
      sourceSha256: '3911a5623da0e486b811c1224c3f0a83928fbfb12c1ce19a447c2fbe01f3c6d8',
      toolchain: 'Arm GNU 14.3.1 · fixed project startup/runtime/linker contract',
      runtime: 'rp2040js 1.4.0 browser worker', scenarioId: 'rp2040-default-gpio0-high-uart0-v1',
      observationOwner: 'actual rp2040js GPIO0 and UART0 worker snapshot',
      expected: { kind: 'rp2040.gpio-uart', gpio0: true, uartText: 'PICO PUBLIC' },
      limitation: 'Bounded GPIO0/UART0 subset only; no full Pico SDK, PIO, DMA, USB, multicore or physical-device equivalence.',
    },
    {
      caseId: 'X26-ESP32C3-QEMU-UART-GPIO2-MODEL', profile: ESP32C3_PROFILE,
      profileVersion: 'esp32-c3-devmodule-v1', adapterId: 'existing.esp32c3-public-workbench-v1',
      fixtureId: 'esp32c3-public-default-v1',
      fixtureSha256: '266df2b22bbcb7da83fb79893e92bc6c169ddfc02b387b9098289643727499c8',
      sourceSha256: 'd936fc50b2c874d6af660ece56abbb024c86e7b30462c403542b8d2166b85480',
      toolchain: 'Arduino CLI 1.5.1 · Arduino-ESP32 3.3.10 · esp-rv32 2601',
      runtime: 'Espressif QEMU 9.2.2-esp_develop_20260417 CPU/UART',
      scenarioId: 'esp32c3-default-qemu-marker-gpio2-model-v1',
      observationOwner: 'actual QEMU CPU/UART plus separately labelled project-owned GPIO2 register model',
      expected: { kind: 'esp32c3.qemu-uart-plus-gpio2-model', qemuMarker: 'C3_PUBLIC', qemuBootEpochs: 2,
        qemuPinStateObserved: false, modeledLedCode: 'LED_ON' },
      limitation: 'QEMU pin state is not observed. GPIO2/LED is a separate project model and is never reported as QEMU pin evidence.',
    },
    {
      caseId: 'X26-STM32-RENODE-PB0-USART3', profile: STM32_PROFILE,
      profileVersion: 'stm32f429zi-nucleo144-v1', adapterId: 'existing.stm32-public-workbench-v1',
      fixtureId: 'stm32-public-default-v1',
      fixtureSha256: 'b8a2fbf96b350b53160270f7c09ba6b004b70a96981dc487ebd168b01a425cab',
      sourceSha256: 'cfc2a242e56429ee1062308dd8e0653ecbf57456eea0090b354816bfc56eb8d0',
      toolchain: 'Arm GNU 14.3.1 · fixed project startup/runtime/linker contract',
      runtime: 'Renode 1.17.0 CPU/PB0/USART3', scenarioId: 'stm32-default-pb0-high-usart3-v1',
      observationOwner: 'actual Renode PB0 and USART3 across reset replay',
      expected: { kind: 'stm32.renode-pb0-usart3', pb0: true, uartText: 'STM32 PUBLIC\n', bootEpochs: 2 },
      limitation: 'Bounded STM32F429ZI source and Renode subset with an ideal LED path; no analogue, arbitrary ELF or physical-board equivalence.',
    },
  ],
};

export const X26_REGRESSION_MATRIX = deepFreeze(MATRIX);

export function regressionFixture(caseId) {
  if (caseId === 'X26-AVR-THERMOSTAT-D13') return clone(createThermostatExperiment('correct').project);
  if (caseId === 'X26-RP2040-GPIO0-UART0') return {
    schema: RP2040_PUBLIC_PROJECT_SCHEMA, name: 'Pico GPIO0 source project', profile: RP2040_PICO_PROFILE,
    source: RP2040_PUBLIC_SOURCE, circuit: createRp2040PicoCircuitDraft(),
  };
  if (caseId === 'X26-ESP32C3-QEMU-UART-GPIO2-MODEL') return {
    schema: C3_PUBLIC_PROJECT_SCHEMA, name: 'ESP32-C3 GPIO2 source project', profile: ESP32C3_PROFILE,
    source: C3_PUBLIC_SOURCE, circuit: createEsp32C3CircuitDraft(),
  };
  if (caseId === 'X26-STM32-RENODE-PB0-USART3') return {
    schema: STM32_EDITABLE_PROJECT_SCHEMA, name: 'STM32F429 PB0 source project', profile: STM32_PROFILE,
    source: STM32_PUBLIC_SOURCE, circuit: createStm32CircuitDraft(),
  };
  throw Object.assign(new Error('REGRESSION_MATRIX_CASE_UNKNOWN'), { code: 'REGRESSION_MATRIX_CASE_UNKNOWN' });
}

function sourceFromFixture(caseId, fixture) {
  if (caseId === 'X26-AVR-THERMOSTAT-D13') {
    return fixture.project.source.files.find((file) => file.name === 'main.ino')?.content ?? '';
  }
  return fixture.source;
}

export async function regressionMatrixIdentity(matrix = X26_REGRESSION_MATRIX) {
  return sha256Text(stableStringify(matrix));
}

export async function validateRegressionMatrix(value) {
  if (!exactKeys(value, ['schema', 'matrixId', 'matrixVersion', 'requirementFamilyId', 'cells'])
      || value.schema !== REGRESSION_MATRIX_SCHEMA || value.matrixId !== X26_MATRIX_ID
      || value.matrixVersion !== '1.0.0'
      || value.requirementFamilyId !== 'REQ-EDITED-SOURCE-OUTPUT-OBSERVATION'
      || stableStringify(value) !== stableStringify(X26_REGRESSION_MATRIX)) {
    throw Object.assign(new Error('REGRESSION_MATRIX_CONTRACT_DRIFT'), { code: 'REGRESSION_MATRIX_CONTRACT_DRIFT' });
  }
  const ids = new Set();
  for (const cell of value.cells) {
    if (ids.has(cell.caseId)) throw Object.assign(new Error('REGRESSION_MATRIX_DUPLICATE_CASE'), { code: 'REGRESSION_MATRIX_DUPLICATE_CASE' });
    ids.add(cell.caseId);
    const fixture = regressionFixture(cell.caseId);
    const [fixtureSha256, sourceSha256] = await Promise.all([
      sha256Text(JSON.stringify(fixture)), sha256Text(sourceFromFixture(cell.caseId, fixture)),
    ]);
    if (fixtureSha256 !== cell.fixtureSha256) throw Object.assign(new Error('REGRESSION_MATRIX_FIXTURE_HASH_STALE'), { code: 'REGRESSION_MATRIX_FIXTURE_HASH_STALE' });
    if (sourceSha256 !== cell.sourceSha256) throw Object.assign(new Error('REGRESSION_MATRIX_SOURCE_HASH_STALE'), { code: 'REGRESSION_MATRIX_SOURCE_HASH_STALE' });
  }
  return deepFreeze(clone(value));
}

export async function createExpectationOverride(caseId, expected, matrix = X26_REGRESSION_MATRIX) {
  await validateRegressionMatrix(matrix);
  const cell = matrix.cells.find((item) => item.caseId === caseId);
  if (!cell) throw Object.assign(new Error('REGRESSION_EXPECTATION_CASE_UNKNOWN'), { code: 'REGRESSION_EXPECTATION_CASE_UNKNOWN' });
  if (!exactKeys(expected, Object.keys(cell.expected)) || expected.kind !== cell.expected.kind
      || stableStringify(expected) === stableStringify(cell.expected)) {
    throw Object.assign(new Error('REGRESSION_EXPECTATION_OVERRIDE_INVALID'), { code: 'REGRESSION_EXPECTATION_OVERRIDE_INVALID' });
  }
  return deepFreeze({
    schema: REGRESSION_EXPECTATION_OVERRIDE_SCHEMA,
    caseId,
    baseMatrixSha256: await regressionMatrixIdentity(matrix),
    expected: clone(expected),
  });
}

export async function validateExpectationOverride(value, matrix = X26_REGRESSION_MATRIX) {
  if (!exactKeys(value, ['schema', 'caseId', 'baseMatrixSha256', 'expected'])
      || value.schema !== REGRESSION_EXPECTATION_OVERRIDE_SCHEMA
      || value.baseMatrixSha256 !== await regressionMatrixIdentity(matrix)) {
    throw Object.assign(new Error('REGRESSION_EXPECTATION_OVERRIDE_STALE'), { code: 'REGRESSION_EXPECTATION_OVERRIDE_STALE' });
  }
  return createExpectationOverride(value.caseId, value.expected, matrix);
}

export function semanticRegressionProjection(report) {
  return {
    schema: report.schema,
    matrixId: report.matrixId,
    matrixSha256: report.matrixSha256,
    selector: report.selector,
    expectationOverrideSha256: report.expectationOverrideSha256,
    results: report.results.map((item) => ({
      caseId: item.caseId, profile: item.profile, profileVersion: item.profileVersion,
      fixtureSha256: item.fixtureSha256, sourceSha256: item.sourceSha256,
      artifactSha256: item.artifactSha256, producer: item.producer,
      expected: item.expected, actual: item.actual, outcome: item.outcome,
      limitation: item.limitation,
    })),
  };
}
