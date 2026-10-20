// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { COMPONENT_SUPPORT_PROFILES } from './component-support-matrix.mjs';
import { CONTROLLER_CAPABILITIES } from './controller-capabilities.mjs';
import { RELEASE_VERSION } from './release-metadata.mjs';
import { exactKeys, parseStrictJson } from './strict-json.mjs';

export const PHYSICAL_CHECKLIST_SCHEMA = 'intent-mcu-physical-verification-checklist@1';
export const PHYSICAL_CHECKLIST_DEFINITION_VERSION = 1;
export const PHYSICAL_CHECKLIST_LIMIT = 64 * 1024;
export const PHYSICAL_CHECKLIST_STRING_LIMIT = 500;
export const PHYSICAL_CHECKLIST_BASELINE_COMMIT = '9baecd8f110dd1dc666e0a3525a83bc65e619071';
export const PHYSICAL_CHECKLIST_DEFINITION_SHA256 = '54885ae6568193925f117ddd366e7912f014e48a1f817f48851d957cf7b66f9e';

const TOP_KEYS = ['schema', 'definitionVersion', 'productRelease', 'sourceCommit', 'profile',
  'controllerModel', 'definitionSha256', 'evidenceBoundary', 'items', 'authority'];
const BOUNDARY_KEYS = ['origin', 'physicalEvidencePresent', 'independentlyVerified', 'certification'];
const ITEM_KEYS = ['id', 'category', 'subject', 'simulatorBasis', 'guidance', 'status', 'observation'];
const OBSERVATION_KEYS = ['value', 'unit', 'method', 'conditions', 'reference', 'notes'];
const AUTHORITY_KEYS = ['apply', 'build', 'run', 'flash', 'deviceAccess', 'verdict', 'certification'];
const CATEGORIES = new Set(['supply', 'noise', 'current-load', 'timing', 'input', 'serial', 'reset-boot']);
const BASES = new Set(['tested', 'project-model', 'unavailable']);
const STATUSES = new Set(['manual-not-measured', 'manual-recorded', 'not-applicable', 'profile-unavailable']);
const ID = /^[a-z][a-z0-9-]{0,95}$/u;
const HASH = /^[a-f0-9]{64}$/u;

const fail = (code, details = []) => { throw Object.assign(new Error(code), { code, details }); };
const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
};

function boundedString(value, path, { required = false } = {}) {
  if (typeof value !== 'string' || [...value].length > PHYSICAL_CHECKLIST_STRING_LIMIT
      || /[\u0000-\u001f\u007f-\u009f]/u.test(value)
      || [...value].some((character) => {
        const point = character.codePointAt(0);
        return point >= 0xd800 && point <= 0xdfff;
      }) || (required && (!value || value !== value.trim()))) fail('PHYSICAL_CHECKLIST_STRING', [path]);
  return value;
}

const RAW_DEFINITIONS = [
  {
    profile: 'board.atmega328p-16mhz-v1',
    items: [
      ['avr-supply-under-load', 'supply', 'Board supply at the physical 5 V/GND points under the user\'s exact load.', null, 'Nominal 5 V is a profile identity, not measured board voltage.'],
      ['avr-d13-level-current-load', 'current-load', 'D13 high/low level and actual LED-branch current under the physical resistor/LED load.', 'gpio', 'GPIO and ideal overcurrent checks are bounded virtual evidence only.'],
      ['avr-d13-transition-timing', 'timing', 'Edge timing, jitter and sustained behavior at D13.', 'timers', 'Virtual cycles and timing are not oscilloscope evidence.'],
      ['avr-a1-noise-accuracy', 'noise', 'A1 source noise, offset, repeatability and conversion behavior.', 'adc', 'The current ADC uses a bounded ideal 0–5 V scalar source.'],
      ['avr-d2-contact-input', 'input', 'Physical switch bounce, pull-up level and input susceptibility at D2.', 'gpio', 'The virtual button is ideal and does not model contact bounce.'],
      ['avr-usart0-signal', 'serial', 'Physical USART0 level, baud timing and line noise.', 'uart', 'Retained virtual bytes do not measure a board-level serial signal.'],
    ],
  },
  {
    profile: 'board.rp2040-pico-v1',
    items: [
      ['pico-supply-under-load', 'supply', 'Physical 3.3 V supply behavior under the exact GP0 LED load.', null, 'Nominal 3.3 V and ideal validation are not measured supply evidence.'],
      ['pico-gp0-level-current-load', 'current-load', 'GP0 level and branch current with the physical resistor/LED.', 'gpio', 'GP0 output is tested virtually; physical drive and load remain unmeasured.'],
      ['pico-gp0-transition-timing', 'timing', 'GP0 edge timing and jitter.', 'timers', 'Worker virtual nanoseconds are not physical timing evidence.'],
      ['pico-uart0-signal', 'serial', 'UART0 level, baud timing and line noise.', 'uart', 'Uppercase UART text is tested; electrical signaling is not.'],
      ['pico-unavailable-peripherals', 'input', 'ADC, PWM, timer, interrupt and broad SDK behavior.', null, 'Unavailable in this profile; no expected physical result is supplied.', true],
    ],
  },
  {
    profile: 'board.esp32-c3-devmodule-v1',
    items: [
      ['c3-supply-under-load', 'supply', 'Physical 3.3 V supply behavior under the exact GPIO2 LED load.', null, 'Nominal 3.3 V is not board measurement.'],
      ['c3-gpio2-level-current-load', 'current-load', 'GPIO2 level and branch current with the physical resistor/LED.', 'gpio', 'The LED is driven by a project model; QEMU pin state is not observed.'],
      ['c3-gpio2-transition-timing', 'timing', 'Physical GPIO2 edge timing, jitter and noise.', 'gpio', 'Executed register writes are not pin timing or waveform evidence.'],
      ['c3-gpio2-boot-strapping', 'reset-boot', 'Board-specific boot and strapping behavior with the user\'s physical GPIO2 load.', null, 'GPIO2 is a real-board strapping pin; the virtual example is not wiring advice.'],
      ['c3-uart-signal', 'serial', 'Physical UART level, boot/marker timing and line noise.', 'uart', 'QEMU UART text is tested; electrical signaling is not.'],
      ['c3-unavailable-peripherals', 'input', 'ADC, PWM, timers, interrupts, Wi-Fi, Bluetooth and broad peripherals.', null, 'Unavailable in this profile; no expected physical result is supplied.', true],
    ],
  },
  {
    profile: 'board.stm32f429zi-nucleo144-v1',
    items: [
      ['stm32-supply-under-load', 'supply', 'Physical 3.3 V supply behavior under the exact PB0 LED load.', null, 'Nominal 3.3 V and ideal validation are not measured supply evidence.'],
      ['stm32-pb0-level-current-load', 'current-load', 'PB0 level and branch current with the physical resistor/LED.', 'gpio', 'Renode observes PB0, but the external LED path is an ideal projection.'],
      ['stm32-pb0-transition-timing', 'timing', 'PB0 edge timing, jitter and load response.', 'timers', 'Instruction-order observation is not physical timing evidence.'],
      ['stm32-usart3-signal', 'serial', 'USART3 level, baud timing and line noise.', 'uart', 'Uppercase text is tested in Renode; electrical signaling is not.'],
      ['stm32-reset-replay', 'reset-boot', 'Physical reset/startup behavior and repeatability.', null, 'Two virtual epochs do not prove physical reset behavior.'],
      ['stm32-unavailable-peripherals', 'input', 'ADC, PWM, timers, interrupts, SDK/HAL and broad peripherals.', null, 'Unavailable in this profile; no expected physical result is supplied.', true],
    ],
  },
];

const profileLabels = new Map(COMPONENT_SUPPORT_PROFILES.map(({ id, label, nominalVolts }) =>
  [id, { label, nominalVolts }]));

export const PHYSICAL_CHECKLIST_DEFINITIONS = freeze(RAW_DEFINITIONS.map(({ profile, items }) => {
  const capabilities = CONTROLLER_CAPABILITIES.profiles[profile];
  const profileOwner = profileLabels.get(profile);
  if (!capabilities || !profileOwner) {
    fail('PHYSICAL_CHECKLIST_PROFILE_OWNER');
  }
  return {
    profile,
    controllerModel: profile,
    label: capabilities.label,
    nominalVolts: profileOwner.nominalVolts,
    items: items.map(([id, category, subject, capabilityKey, guidance, lockedUnavailable = false]) => {
      const simulatorBasis = capabilityKey ? capabilities.peripherals[capabilityKey]?.status : 'unavailable';
      if (!ID.test(id) || !CATEGORIES.has(category) || !BASES.has(simulatorBasis)
          || (lockedUnavailable && simulatorBasis !== 'unavailable')) fail('PHYSICAL_CHECKLIST_DEFINITION');
      return { id, category, subject, simulatorBasis, guidance, lockedUnavailable };
    }),
  };
}));

export function physicalChecklistDefinition(profile) {
  return PHYSICAL_CHECKLIST_DEFINITIONS.find((definition) => definition.profile === profile) ?? null;
}

export function createPhysicalChecklist(profile) {
  const definition = physicalChecklistDefinition(profile);
  if (!definition) fail('PHYSICAL_CHECKLIST_PROFILE_UNKNOWN', [profile]);
  return normalizePhysicalChecklist({
    schema: PHYSICAL_CHECKLIST_SCHEMA,
    definitionVersion: PHYSICAL_CHECKLIST_DEFINITION_VERSION,
    productRelease: RELEASE_VERSION,
    sourceCommit: PHYSICAL_CHECKLIST_BASELINE_COMMIT,
    profile,
    controllerModel: definition.controllerModel,
    definitionSha256: PHYSICAL_CHECKLIST_DEFINITION_SHA256,
    evidenceBoundary: {
      origin: 'manual-user-entry', physicalEvidencePresent: false,
      independentlyVerified: false, certification: false,
    },
    items: definition.items.map((item) => ({
      id: item.id, category: item.category, subject: item.subject,
      simulatorBasis: item.simulatorBasis, guidance: item.guidance,
      status: item.lockedUnavailable ? 'profile-unavailable' : 'manual-not-measured',
      observation: null,
    })),
    authority: {
      apply: false, build: false, run: false, flash: false,
      deviceAccess: false, verdict: false, certification: false,
    },
  });
}

function normalizeObservation(value, path) {
  if (!exactKeys(value, OBSERVATION_KEYS)) fail('PHYSICAL_CHECKLIST_OBSERVATION_SHAPE', [path]);
  return Object.fromEntries(OBSERVATION_KEYS.map((key) => [key,
    boundedString(value[key], `${path}.${key}`, { required: ['value', 'unit', 'method'].includes(key) })]));
}

export function normalizePhysicalChecklist(value) {
  if (!exactKeys(value, TOP_KEYS) || value.schema !== PHYSICAL_CHECKLIST_SCHEMA
      || value.definitionVersion !== PHYSICAL_CHECKLIST_DEFINITION_VERSION
      || value.productRelease !== RELEASE_VERSION
      || value.sourceCommit !== PHYSICAL_CHECKLIST_BASELINE_COMMIT
      || value.definitionSha256 !== PHYSICAL_CHECKLIST_DEFINITION_SHA256
      || !HASH.test(value.definitionSha256)) fail('PHYSICAL_CHECKLIST_IDENTITY');
  const definition = physicalChecklistDefinition(value.profile);
  if (!definition || value.controllerModel !== definition.controllerModel) fail('PHYSICAL_CHECKLIST_PROFILE_UNKNOWN');
  if (!exactKeys(value.evidenceBoundary, BOUNDARY_KEYS)
      || value.evidenceBoundary.origin !== 'manual-user-entry'
      || typeof value.evidenceBoundary.physicalEvidencePresent !== 'boolean'
      || value.evidenceBoundary.independentlyVerified !== false
      || value.evidenceBoundary.certification !== false) fail('PHYSICAL_CHECKLIST_BOUNDARY');
  if (!Array.isArray(value.items) || value.items.length !== definition.items.length) {
    fail('PHYSICAL_CHECKLIST_ITEMS');
  }
  const items = value.items.map((item, index) => {
    const expected = definition.items[index];
    const path = `$.items[${index}]`;
    if (!exactKeys(item, ITEM_KEYS) || item.id !== expected.id || item.category !== expected.category
        || item.subject !== expected.subject || item.simulatorBasis !== expected.simulatorBasis
        || item.guidance !== expected.guidance || !STATUSES.has(item.status)) {
      fail('PHYSICAL_CHECKLIST_ITEM_IDENTITY', [path]);
    }
    if (expected.lockedUnavailable && item.status !== 'profile-unavailable') {
      fail('PHYSICAL_CHECKLIST_UNAVAILABLE_STATUS', [path]);
    }
    if (!expected.lockedUnavailable && item.status === 'profile-unavailable') {
      fail('PHYSICAL_CHECKLIST_STATUS', [path]);
    }
    const observation = item.status === 'manual-recorded'
      ? normalizeObservation(item.observation, `${path}.observation`)
      : item.observation === null ? null : fail('PHYSICAL_CHECKLIST_OBSERVATION_STATUS', [path]);
    return { id: expected.id, category: expected.category, subject: expected.subject,
      simulatorBasis: expected.simulatorBasis, guidance: expected.guidance,
      status: item.status, observation };
  });
  const evidencePresent = items.some((item) => item.status === 'manual-recorded');
  if (value.evidenceBoundary.physicalEvidencePresent !== evidencePresent) {
    fail('PHYSICAL_CHECKLIST_EVIDENCE_FLAG');
  }
  if (!exactKeys(value.authority, AUTHORITY_KEYS)
      || AUTHORITY_KEYS.some((key) => value.authority[key] !== false)) fail('PHYSICAL_CHECKLIST_AUTHORITY');
  return {
    schema: PHYSICAL_CHECKLIST_SCHEMA,
    definitionVersion: PHYSICAL_CHECKLIST_DEFINITION_VERSION,
    productRelease: RELEASE_VERSION,
    sourceCommit: PHYSICAL_CHECKLIST_BASELINE_COMMIT,
    profile: definition.profile,
    controllerModel: definition.controllerModel,
    definitionSha256: PHYSICAL_CHECKLIST_DEFINITION_SHA256,
    evidenceBoundary: {
      origin: 'manual-user-entry', physicalEvidencePresent: evidencePresent,
      independentlyVerified: false, certification: false,
    },
    items,
    authority: Object.fromEntries(AUTHORITY_KEYS.map((key) => [key, false])),
  };
}

export function parsePhysicalChecklistText(source) {
  try {
    return normalizePhysicalChecklist(parseStrictJson(source, PHYSICAL_CHECKLIST_LIMIT));
  } catch (error) {
    if (error?.code === 'INPUT_LIMIT') fail('PHYSICAL_CHECKLIST_INPUT_LIMIT');
    throw error;
  }
}

export function canonicalPhysicalChecklistText(value) {
  const text = `${JSON.stringify(normalizePhysicalChecklist(value), null, 2)}\n`;
  if (new TextEncoder().encode(text).length > PHYSICAL_CHECKLIST_LIMIT) {
    fail('PHYSICAL_CHECKLIST_CANONICAL_LIMIT');
  }
  return text;
}
