// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { sha256Text, stableStringify } from './regression-matrix-contract.mjs';

export const LONG_DURATION_SUITE_SCHEMA = 'intent-mcu-long-duration-suite@1';
export const LONG_DURATION_REPORT_SCHEMA = 'intent-mcu-long-duration-report@1';
export const X28_SUITE_ID = 'x28-avr-long-duration-properties-v1';

export const X28_GOOD_SOURCE = `/* Intent MCU X28 fixture-only timer shortcut v1 */
#include <Arduino.h>
extern volatile unsigned long timer0_millis;

unsigned long x28Started = 0;
bool x28StartedReady = false;
uint8_t x28WrapPhase = 0;
uint8_t x28LastButton = HIGH;
uint16_t x28Changes = 0;

void setup() {
  Serial.begin(9600);
  pinMode(13, OUTPUT);
  pinMode(2, INPUT_PULLUP);
  timer0_millis = 0xFFFFFFDFUL;
  Serial.println("X28 BOOT");
}

void loop() {
  const unsigned long now = millis();
  if (!x28StartedReady) {
    x28Started = now;
    x28StartedReady = true;
  }
  const unsigned long elapsed = now - x28Started;
  if (x28WrapPhase == 0 && elapsed >= 16UL) {
    digitalWrite(13, HIGH);
    Serial.print("X28 PRE ");
    Serial.println(now);
    x28WrapPhase = 1;
  }
  if (x28WrapPhase == 1 && elapsed >= 48UL) {
    digitalWrite(13, LOW);
    Serial.print("X28 POST ");
    Serial.println(now);
    x28WrapPhase = 2;
  }
  const uint8_t button = digitalRead(2);
  if (button != x28LastButton) {
    x28LastButton = button;
    x28Changes += 1;
    digitalWrite(13, button == LOW ? HIGH : LOW);
    if (x28Changes == 128) Serial.println("X28 SEQ 128");
  }
}
`;

export const X28_KNOWN_BAD_SOURCE = `/* Intent MCU X28 known-bad direct deadline v1 */
#include <Arduino.h>
extern volatile unsigned long timer0_millis;

void setup() {
  Serial.begin(9600);
  pinMode(13, OUTPUT);
  timer0_millis = 0xFFFFFFDFUL;
}

void loop() {
  static const unsigned long deadline = millis() + 48UL;
  static bool emitted = false;
  const unsigned long now = millis();
  if (!emitted && now >= deadline) {
    digitalWrite(13, HIGH);
    Serial.print("X28 BAD ");
    Serial.println(now);
    emitted = true;
  }
}
`;

const SUITE = {
  schema: LONG_DURATION_SUITE_SCHEMA,
  suiteId: X28_SUITE_ID,
  suiteVersion: '1.0.0',
  profile: 'board.atmega328p-16mhz-v1',
  fixture: {
    id: 'x28-avr-timer0-millis-fixture-v1',
    sourceSha256: '1384fcf292b40f47e00f5ddebe022ec12af774a648e325a886ab17d6a1f63b8d',
    knownBadSourceSha256: 'a9962ec6524b892764e1c8e0ddc0dc83702018e38fb5acde79564c24738f1d7c',
    timerSeam: 'Arduino AVR core 1.8.8 external timer0_millis symbol',
    shortcut: 'fixture sets timer0_millis to UINT32_MAX - 32; CPU cycles are never fast-forwarded',
  },
  cells: [
    {
      cellId: 'X28-MILLIS-UNSIGNED-WRAP',
      minimumVirtualMilliseconds: 96,
      expected: {
        preMillisMinimum: 4294967270,
        preMillisMaximum: 4294967295,
        postMillisMinimum: 8,
        postMillisMaximum: 32,
        d13HighCycleMinimum: 240000,
        d13HighCycleMaximum: 320000,
        d13LowCycleMinimum: 720000,
        d13LowCycleMaximum: 840000,
        uartMarkers: ['X28 PRE', 'X28 POST'],
      },
    },
    {
      cellId: 'X28-FIVE-RESET-EPOCHS',
      resetEpochs: 5,
      epochVirtualMilliseconds: 100,
      expected: { cycleZero: true, emptyTransientAuthority: true, identicalProducerEvidence: true },
    },
    {
      cellId: 'X28-128-ORDERED-D2',
      eventCount: 128,
      eventSpacingCycles: 256000,
      minimumVirtualMilliseconds: 2048,
      expected: { finalD13: false, uartMarker: 'X28 SEQ 128', droppedInputs: 0 },
    },
  ],
  limits: {
    controller: 'ATmega328P only',
    physicalTimeClaimed: false,
    exhaustiveStateSpaceClaimed: false,
    watchdogBrownoutOrEepromClaimed: false,
  },
};

const clone = (value) => structuredClone(value);
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const HASH = /^[0-9a-f]{64}$/u;

export const X28_LONG_DURATION_SUITE = Object.freeze(SUITE);

export async function longDurationSuiteIdentity(suite = X28_LONG_DURATION_SUITE) {
  return sha256Text(stableStringify(suite));
}

export async function validateLongDurationSuite(value = X28_LONG_DURATION_SUITE) {
  if (!exactKeys(value, ['schema', 'suiteId', 'suiteVersion', 'profile', 'fixture', 'cells', 'limits'])
      || value.schema !== LONG_DURATION_SUITE_SCHEMA || value.suiteId !== X28_SUITE_ID
      || stableStringify(value) !== stableStringify(X28_LONG_DURATION_SUITE)
      || !HASH.test(value.fixture.sourceSha256) || !HASH.test(value.fixture.knownBadSourceSha256)
      || value.cells.length !== 3 || new Set(value.cells.map((cell) => cell.cellId)).size !== 3) {
    throw Object.assign(new Error('LONG_DURATION_SUITE_CONTRACT_DRIFT'), { code: 'LONG_DURATION_SUITE_CONTRACT_DRIFT' });
  }
  const [sourceSha256, knownBadSourceSha256] = await Promise.all([
    sha256Text(X28_GOOD_SOURCE), sha256Text(X28_KNOWN_BAD_SOURCE),
  ]);
  if (sourceSha256 !== value.fixture.sourceSha256
      || knownBadSourceSha256 !== value.fixture.knownBadSourceSha256) {
    throw Object.assign(new Error('LONG_DURATION_FIXTURE_HASH_STALE'), { code: 'LONG_DURATION_FIXTURE_HASH_STALE' });
  }
  return clone(value);
}

export function semanticLongDurationProjection(report) {
  return {
    schema: report.schema,
    suiteId: report.suiteId,
    suiteSha256: report.suiteSha256,
    profile: report.profile,
    fixtureSha256: report.fixtureSha256,
    sourceSha256: report.sourceSha256,
    artifactSha256: report.artifactSha256,
    producer: report.producer,
    results: report.results.map(({ rawVirtualTime, durationMilliseconds, ...result }) => result),
    knownBad: (({ rawVirtualTime, durationMilliseconds, ...knownBad }) => knownBad)(report.knownBad),
    limits: report.limits,
  };
}

export async function validateLongDurationReport(value, suite = X28_LONG_DURATION_SUITE) {
  const validated = await validateLongDurationSuite(suite);
  if (!exactKeys(value, ['schema', 'suiteId', 'suiteSha256', 'profile', 'fixtureSha256', 'sourceSha256',
    'artifactSha256', 'producer', 'results', 'knownBad', 'limits', 'semanticSha256'])
      || value.schema !== LONG_DURATION_REPORT_SCHEMA || value.suiteId !== validated.suiteId
      || value.suiteSha256 !== await longDurationSuiteIdentity(validated)
      || value.profile !== validated.profile || value.fixtureSha256 !== validated.fixture.sourceSha256
      || value.sourceSha256 !== validated.fixture.sourceSha256 || !HASH.test(value.artifactSha256)
      || value.producer !== 'RuntimeKernel/avr8js 0.21.1 from compiler-generated HEX'
      || !Array.isArray(value.results) || value.results.length !== 3
      || new Set(value.results.map((result) => result.cellId)).size !== 3
      || !exactKeys(value.knownBad, ['sourceSha256', 'artifactSha256', 'actual', 'outcome', 'rawVirtualTime', 'durationMilliseconds'])
      || value.knownBad.sourceSha256 !== validated.fixture.knownBadSourceSha256
      || !HASH.test(value.knownBad.artifactSha256)
      || stableStringify(value.limits) !== stableStringify(validated.limits)
      || value.semanticSha256 !== await sha256Text(stableStringify(semanticLongDurationProjection(value)))) {
    throw Object.assign(new Error('LONG_DURATION_REPORT_STALE_OR_UNKNOWN'), { code: 'LONG_DURATION_REPORT_STALE_OR_UNKNOWN' });
  }
  for (const [index, result] of value.results.entries()) {
    if (!exactKeys(result, ['cellId', 'expected', 'actual', 'outcome', 'rawVirtualTime', 'durationMilliseconds'])
        || result.cellId !== validated.cells[index].cellId
        || result.outcome?.schema !== 'intent-mcu-experiment-outcome@1') {
      throw Object.assign(new Error('LONG_DURATION_REPORT_STALE_OR_UNKNOWN'), { code: 'LONG_DURATION_REPORT_STALE_OR_UNKNOWN' });
    }
  }
  return clone(value);
}
