// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const result = (fault, action, modelBoundary) => Object.freeze({ fault, action, modelBoundary });

export function faultDiagnostic(code) {
  const stable = typeof code === 'string' ? code : '';
  if (/(?:^|_)POWER_SHORT$/u.test(stable)) return result(
    'supported-rail-short',
    'Disconnect the supported supply from ground, then validate the circuit again.',
    'This detects a direct short between the profile’s named ideal supply and ground references; it does not predict physical damage.',
  );
  if (/(?:^|_)OUTPUT_CONTENTION$/u.test(stable)) return result(
    'known-digital-output-contention',
    'Disconnect the opposing digital outputs or configure one as an input, then validate again.',
    'Contention is reported only when supported named outputs have known opposing logical drive levels.',
  );
  if (/(?:^|_)MULTIPLE_DIGITAL_IO_NET_UNSUPPORTED$/u.test(stable)) return result(
    'multiple-digital-io-net-unsupported',
    'Separate the digital I/O pins onto different nets; this profile does not authorize a shared multi-output connection.',
    'The firmware can later change direction and drive, so an unresolved multi-I/O net is rejected instead of being treated as electrically safe.',
  );
  if (/(?:VCC_REQUIRES_5V|WRONG_SUPPLY|SUPPLY_REQUIRES_5V)$/u.test(stable)) return result(
    'supported-supply-role-mismatch',
    'Connect VCC only to the supported 5 V reference and keep ground on the declared ground terminal.',
    'This checks the declared ideal terminal role; arbitrary cross-controller rail wiring is unavailable.',
  );
  if (/(?:^|_)GROUND_REQUIRED$/u.test(stable)) return result(
    'missing-supported-ground',
    'Connect the circuit’s declared ground terminal to the named ground pin, then validate again.',
    'This checks the supported named ground path and does not infer an omitted ground.',
  );
  if (/(?:REVERSE_POLARITY)$/u.test(stable)) return result(
    'supported-led-polarity',
    'Reverse the LED connections so the anode faces the supported output path and the cathode faces ground.',
    'Polarity is checked only for the documented ideal LED topology.',
  );
  if (/(?:SERIES_RESISTOR_REQUIRED)$/u.test(stable)) return result(
    'missing-supported-current-limiting',
    'Add the required series resistor in the documented LED path, then validate again.',
    'The validator requires the documented ideal series path; it is not a general analogue solver.',
  );
  if (/(?:LED_OVERCURRENT)$/u.test(stable)) return result(
    'bounded-ideal-led-overcurrent',
    'Increase the series resistance to keep the ideal-model LED current within this profile’s limit.',
    'Current is a bounded nominal calculation, not a physical tolerance, thermal or safety prediction.',
  );
  if (/(?:PATH_OPEN|UNSUPPORTED_PATH|UNSUPPORTED_TOPOLOGY)$/u.test(stable)) return result(
    'unsupported-or-open-path',
    'Complete the documented named-pin path without extra branches, then validate again.',
    'Only the documented topology is modelled; an arbitrary circuit solver is not provided.',
  );
  return null;
}
