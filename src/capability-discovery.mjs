// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { BUILD_LIMITS } from './build-limits.mjs';
import {
  BOUNDED_ACTIONS, BOUNDED_ACTION_AUTHORITY, BOUNDED_ACTION_REQUEST_LIMIT,
  BOUNDED_ACTION_RESULT_LIMIT, BOUNDED_ACTION_TTL_MAX_MS,
} from './bounded-action-contracts.mjs';
import { CIRCUIT_LIMITS, COMPONENT_CATALOG } from './component-catalog.mjs';
import {
  COMPONENT_SUPPORT_CELLS, COMPONENT_SUPPORT_MODELS, COMPONENT_SUPPORT_PROFILES,
} from './component-support-matrix.mjs';
import { CONTROLLER_CAPABILITIES } from './controller-capabilities.mjs';
import { CANDIDATE_COMPILER_TARGETS } from './compile-targets.mjs';
import { ESP32C3_BOARD_DEFINITION } from './esp32c3-public-circuit.mjs';
import { EXTERNAL_CLIENT_RESULT_LIMIT, EXTERNAL_CLIENT_RESULT_SCHEMA } from './external-client-results.mjs';
import { PROJECT_ENVELOPE_LIMIT, PROJECT_ENVELOPE_SCHEMA } from './project-envelope.mjs';
import { PUBLIC_CONTROLLER_VIEW_SCHEMA, publicControllerViews } from './public-controller-workbench-view.mjs';
import { RP2040_PICO_BOARD_DEFINITION } from './rp2040-pico-circuit.mjs';
import { STM32_BOARD_DEFINITION } from './stm32-public-circuit.mjs';

export const CAPABILITY_DISCOVERY_SCHEMA = 'intent-mcu-capability-discovery@1';
export const CAPABILITY_DISCOVERY_REQUEST_SCHEMA = 'intent-mcu-capability-discovery-request@1';
export const CAPABILITY_DISCOVERY_RESULT_SCHEMA = 'intent-mcu-capability-discovery-result@1';
export const CAPABILITY_DISCOVERY_LIMIT = BOUNDED_ACTION_RESULT_LIMIT;
export const PRODUCT_VERSION = '1.1.0-rc.44';
export const PRODUCT_SOURCE = 'https://github.com/finnandrehotvedt/intent-mcu-simulator';

const PROFILE_ORDER = COMPONENT_SUPPORT_PROFILES.map(({ id }) => id);
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$/u;
const boards = Object.freeze({
  'board.atmega328p-16mhz-v1': COMPONENT_CATALOG['board.atmega328p-16mhz-v1'],
  'board.rp2040-pico-v1': RP2040_PICO_BOARD_DEFINITION,
  'board.esp32-c3-devmodule-v1': ESP32C3_BOARD_DEFINITION,
  'board.stm32f429zi-nucleo144-v1': STM32_BOARD_DEFINITION,
});

const clone = (value) => structuredClone(value);
const exactKeys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));

function publicPin(pin) {
  return {
    id: pin.id, label: pin.label, role: pin.role,
    signals: [...pin.signals], capabilities: [...pin.capabilities], constraints: { ...pin.constraints },
  };
}

function profileRecord(profile) {
  const board = boards[profile];
  const target = CANDIDATE_COMPILER_TARGETS[profile];
  const capability = CONTROLLER_CAPABILITIES.profiles[profile];
  const view = publicControllerViews().find((item) => item.profile === profile);
  return {
    id: profile,
    board: {
      name: board.displayName, family: board.family, variant: board.variant,
      modelRef: board.modelRef, pins: board.pins.map(publicPin),
      limitations: [...board.support.limitations],
    },
    source: clone(capability.language),
    apis: clone(capability.peripherals),
    compiler: {
      requestSchema: target.requestSchema,
      fqbn: target.fqbn,
      toolchainIdentitySha256: target.toolchainIdentitySha256,
      status: target.compilerStatus,
      compileAvailable: target.compileAvailable,
      fixedBuildFlags: [...target.fixedBuildFlags],
    },
    runtime: {
      status: target.runtimeStatus,
      publicExecution: view.publicExecution,
      boundary: view.runtime,
      limitation: view.limitation,
      availability: clone(target.availability),
    },
    uiAuthority: { schema: PUBLIC_CONTROLLER_VIEW_SCHEMA, status: view.status, mode: view.mode },
    parts: COMPONENT_SUPPORT_CELLS.filter((cell) => cell.profile === profile).map(clone),
  };
}

export function capabilityDiscoverySnapshot() {
  const value = {
    schema: CAPABILITY_DISCOVERY_SCHEMA,
    identity: {
      product: 'Intent MCU Simulator', version: PRODUCT_VERSION,
      source: PRODUCT_SOURCE, license: 'Apache-2.0', generated: false,
    },
    transport: {
      kind: 'local-stdio', readOnlyDiscovery: true, publicEndpoint: false,
      accountRequired: false, credentialRequired: false, pagination: null,
      maximumResponseBytes: CAPABILITY_DISCOVERY_LIMIT,
    },
    actions: {
      count: BOUNDED_ACTIONS.length, names: [...BOUNDED_ACTIONS],
      authority: clone(BOUNDED_ACTION_AUTHORITY), applyAuthority: false, genericCommand: false,
    },
    quotas: {
      actionRequestBytes: BOUNDED_ACTION_REQUEST_LIMIT,
      actionResultBytes: BOUNDED_ACTION_RESULT_LIMIT,
      externalClientResultBytes: EXTERNAL_CLIENT_RESULT_LIMIT,
      actionTtlMaximumMs: BOUNDED_ACTION_TTL_MAX_MS,
      build: clone(BUILD_LIMITS),
      circuit: clone(CIRCUIT_LIMITS),
      projectEnvelopeBytes: PROJECT_ENVELOPE_LIMIT,
    },
    contracts: {
      projectEnvelope: PROJECT_ENVELOPE_SCHEMA,
      controllerCapabilities: CONTROLLER_CAPABILITIES.schema,
      componentSupport: COMPONENT_SUPPORT_CELLS[0]?.schema ?? null,
      externalClientResult: EXTERNAL_CLIENT_RESULT_SCHEMA,
    },
    profiles: PROFILE_ORDER.map(profileRecord),
    parts: COMPONENT_SUPPORT_MODELS.map(clone),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (bytes > CAPABILITY_DISCOVERY_LIMIT) throw new Error('CAPABILITY_DISCOVERY_RESULT_LIMIT');
  return clone(value);
}

export function parseCapabilityDiscoveryRequest(value) {
  if (!exactKeys(value, ['schema', 'requestId', 'acceptSchema'])
      || value.schema !== CAPABILITY_DISCOVERY_REQUEST_SCHEMA) {
    throw Object.assign(new Error('CAPABILITY_DISCOVERY_REQUEST_SHAPE'), { code: 'CAPABILITY_DISCOVERY_REQUEST_SHAPE' });
  }
  if (!REQUEST_ID.test(value.requestId)) {
    throw Object.assign(new Error('CAPABILITY_DISCOVERY_REQUEST_ID'), { code: 'CAPABILITY_DISCOVERY_REQUEST_ID' });
  }
  if (value.acceptSchema !== CAPABILITY_DISCOVERY_SCHEMA) {
    throw Object.assign(new Error('CAPABILITY_DISCOVERY_VERSION_UNSUPPORTED'), { code: 'CAPABILITY_DISCOVERY_VERSION_UNSUPPORTED' });
  }
  return Object.freeze({ ...value });
}

export function capabilityDiscoveryResult(request) {
  const accepted = parseCapabilityDiscoveryRequest(request);
  return {
    schema: CAPABILITY_DISCOVERY_RESULT_SCHEMA, requestId: accepted.requestId,
    ok: true, code: 'CAPABILITY_DISCOVERY_COMPLETED', executed: false,
    discovery: capabilityDiscoverySnapshot(),
  };
}
