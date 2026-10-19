// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { THERMOSTAT_EXPERIMENT_SOURCE } from './thermostat-source.mjs';

export const X34_FIXTURE_ID = 'x34-avr-thermostat-instrumented-v1';
export const X34_PROBE_SYMBOL = 'intent_x34_probe_v1';
export const X34_PROBE_BYTES = 4;
export const X34_MAX_COMPLETED_TRANSACTIONS = 16;

const declarationAnchor = 'const byte TEMP_PIN = A1;';
const writeAnchor = '  digitalWrite(HEATER_LED_PIN, heating ? HIGH : LOW);';
const mailbox = `struct __attribute__((packed)) IntentX34ProbeV1 {
  uint8_t commit;
  int16_t temperatureC;
  uint8_t d13Level;
};
static_assert(sizeof(IntentX34ProbeV1) == 4, "X34 probe size");
extern "C" {
volatile IntentX34ProbeV1 intent_x34_probe_v1 __attribute__((used)) = {0, -32768, 0xff};
}

${declarationAnchor}`;
const writes = `${writeAnchor}
  intent_x34_probe_v1.commit++;
  intent_x34_probe_v1.temperatureC = temperatureC;
  intent_x34_probe_v1.d13Level = heating ? 1 : 0;
  intent_x34_probe_v1.commit++;`;

function exactlyOnce(source, anchor) {
  return source.indexOf(anchor) >= 0 && source.indexOf(anchor) === source.lastIndexOf(anchor);
}

export function instrumentX34ThermostatSource(source = THERMOSTAT_EXPERIMENT_SOURCE) {
  if (source !== THERMOSTAT_EXPERIMENT_SOURCE
      || !exactlyOnce(source, declarationAnchor) || !exactlyOnce(source, writeAnchor)) {
    throw Object.assign(new Error('X34_BASE_SOURCE_MISMATCH'), { code: 'X34_BASE_SOURCE_MISMATCH' });
  }
  const instrumented = source.replace(declarationAnchor, mailbox).replace(writeAnchor, writes);
  if (instrumented === source || !instrumented.includes(X34_PROBE_SYMBOL)) {
    throw Object.assign(new Error('X34_SOURCE_TRANSFORM_INVALID'), { code: 'X34_SOURCE_TRANSFORM_INVALID' });
  }
  return instrumented;
}

export const X34_INSTRUMENTED_SOURCE = instrumentX34ThermostatSource();

export const X34_FIXTURE_LIMITS = Object.freeze({
  privateInstrumentedFixture: true,
  publicStarterChanged: false,
  unmodifiedPublicArtifactClaimed: false,
  computationalVoltageTolerance: 1e-12,
  maximumCompletedTransactions: X34_MAX_COMPLETED_TRANSACTIONS,
  commitWrapAccepted: false,
  genericMemoryApi: false,
  debugger: false,
  physicalProof: false,
  otherProfilesNormalized: false,
});
