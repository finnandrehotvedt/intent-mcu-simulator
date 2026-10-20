// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';
import { THERMOSTAT_EXPERIMENT_SOURCE } from './thermostat-source.mjs';

export const X49_INSTRUMENTED_FIXTURE_ID = 'x49-avr-thermostat-instrumented-v1';
export const X49_PROBE_SYMBOL = 'intent_x49_probe_v1';
export const X49_PROBE_TYPE = 'IntentX49ProbeV1';
export const X49_PROBE_BYTES = 4;
export const X49_RUNTIME_PROBE_SCHEMA = 'intent-mcu-x49-runtime-probe@1';
export const X49_BASE_SOURCE_SHA256 = 'abc65e1212c72aaed7325c059cb785a8872b45fddc7ba67ceb0cb098d2c0da76';
export const X49_INSTRUMENTED_SOURCE_SHA256 = 'c2ff7626609b34c397ce8f5910a2c53819b483f2002c93252fd9225448d90710';

const HASH = /^[a-f0-9]{64}$/u;
const SRAM_START = 0x100;
const SRAM_END = 0x900;
const declarationAnchor = 'const byte TEMP_PIN = A1;';
const writeAnchor = '  digitalWrite(HEATER_LED_PIN, heating ? HIGH : LOW);';
const reject = (code) => { throw Object.assign(new Error(code), { code }); };
const clone = (value) => structuredClone(value);

const mailboxDeclaration = `struct __attribute__((packed)) ${X49_PROBE_TYPE} {
  uint8_t commit;
  int16_t temperatureC;
  uint8_t d13Level;
};
static_assert(sizeof(${X49_PROBE_TYPE}) == ${X49_PROBE_BYTES}, "X49 probe size");
extern "C" {
volatile ${X49_PROBE_TYPE} ${X49_PROBE_SYMBOL} __attribute__((used)) = {0, -32768, 0xff};
}

${declarationAnchor}`;

const mailboxWrites = `${writeAnchor}
  ${X49_PROBE_SYMBOL}.commit++;
  ${X49_PROBE_SYMBOL}.temperatureC = temperatureC;
  ${X49_PROBE_SYMBOL}.d13Level = heating ? 1 : 0;
  ${X49_PROBE_SYMBOL}.commit++;`;

function exactlyOnce(source, anchor) {
  return source.indexOf(anchor) >= 0 && source.indexOf(anchor) === source.lastIndexOf(anchor);
}

export function instrumentX49ThermostatSource(source = THERMOSTAT_EXPERIMENT_SOURCE) {
  if (source !== THERMOSTAT_EXPERIMENT_SOURCE
      || !exactlyOnce(source, declarationAnchor) || !exactlyOnce(source, writeAnchor)) {
    reject('X49_BASE_SOURCE_MISMATCH');
  }
  const instrumented = source
    .replace(declarationAnchor, mailboxDeclaration)
    .replace(writeAnchor, mailboxWrites);
  if (instrumented === source || !exactlyOnce(instrumented, `volatile ${X49_PROBE_TYPE} ${X49_PROBE_SYMBOL}`)
      || !exactlyOnce(instrumented, `static_assert(sizeof(${X49_PROBE_TYPE}) == ${X49_PROBE_BYTES}`)) {
    reject('X49_SOURCE_TRANSFORM_INVALID');
  }
  return instrumented;
}

export const X49_INSTRUMENTED_SOURCE = instrumentX49ThermostatSource();

export function validateX49RuntimeProbe(value) {
  if (!exactKeys(value, ['schema', 'fixtureId', 'sourceSha256', 'artifactIdentity', 'symbol'])
      || value.schema !== X49_RUNTIME_PROBE_SCHEMA
      || value.fixtureId !== X49_INSTRUMENTED_FIXTURE_ID
      || value.sourceSha256 !== X49_INSTRUMENTED_SOURCE_SHA256
      || !HASH.test(value.artifactIdentity ?? '')
      || !exactKeys(value.symbol, ['symbol', 'dataAddress', 'size', 'elfSha256', 'binding', 'type'])
      || value.symbol.symbol !== X49_PROBE_SYMBOL || value.symbol.size !== X49_PROBE_BYTES
      || value.symbol.binding !== 'global' || value.symbol.type !== 'object'
      || !HASH.test(value.symbol.elfSha256 ?? '')
      || !Number.isSafeInteger(value.symbol.dataAddress)
      || value.symbol.dataAddress < SRAM_START
      || value.symbol.dataAddress + value.symbol.size > SRAM_END) {
    reject('X49_RUNTIME_PROBE_INVALID');
  }
  return clone(value);
}

export const X49_INSTRUMENTED_FIXTURE_LIMITS = Object.freeze({
  privateInstrumentedFixture: true,
  publicArtifactChanged: false,
  nativeEvidenceClaimed: false,
  compiledArtifactCreated: false,
  exactBaseSourceRequired: true,
  exactGlobalPackedObjectRequired: true,
  arbitraryMemoryExposed: false,
  physicalProof: false,
});
