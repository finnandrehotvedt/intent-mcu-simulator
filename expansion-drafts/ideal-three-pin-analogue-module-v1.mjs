// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { CIRCUIT_SCHEMA } from '../src/circuit-schema.mjs';
import { exactKeys } from '../src/strict-json.mjs';

export const IDEAL_ANALOGUE_MODULE_RUNTIME_TYPE = 'potentiometer.linear-v1';

const BOARD_TYPE = 'board.atmega328p-16mhz-v1';
const GROUND_REFERENCE_TYPE = 'reference.ground-v1';
const clone = (value) => structuredClone(value);
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;

export function createIdealThreePinPoweredModulePins(outputPin) {
  if (!exactKeys(outputPin, [
    'id', 'label', 'role', 'signals', 'capabilities', 'constraints', 'anchor',
  ]) || typeof outputPin.id !== 'string' || !outputPin.id
      || typeof outputPin.label !== 'string' || !outputPin.label
      || typeof outputPin.role !== 'string' || !outputPin.role
      || !Array.isArray(outputPin.signals) || !Array.isArray(outputPin.capabilities)
      || !outputPin.constraints || typeof outputPin.constraints !== 'object'
      || !exactKeys(outputPin.anchor, ['x', 'y'])) {
    throw new TypeError('IDEAL_THREE_PIN_POWERED_MODULE_OUTPUT');
  }
  return [
    {
      id: 'VCC', label: '5 V supply', role: 'power-in',
      signals: ['power.5v-reference'], capabilities: ['power.5v-reference'],
      constraints: { voltage: 5 }, anchor: { x: 0.2, y: 0.92 },
    },
    {
      id: 'GND', label: '0 V reference', role: 'ground',
      signals: ['ground.reference'], capabilities: ['ground.reference'],
      constraints: { voltage: 0 }, anchor: { x: 0.5, y: 0.92 },
    },
    clone(outputPin),
  ];
}

export function createIdealThreePinAnaloguePins(outputLabel = 'Ideal analogue output') {
  return createIdealThreePinPoweredModulePins({
    id: 'AOUT', label: outputLabel, role: 'analogue-out',
    signals: ['analogue.scalar-0-5v'], capabilities: ['analogue.scalar-0-5v'],
    constraints: { voltageMin: 0, voltageMax: 5 }, anchor: { x: 0.8, y: 0.92 },
  });
}

function connectedNet(graph, componentId, pin) {
  return graph.nets.find((net) => net.endpoints.some(
    (endpoint) => endpoint.component === componentId && endpoint.pin === pin,
  )) ?? null;
}

function boardEndpoint(net, boardIds, predicate) {
  return net?.endpoints.find((endpoint) => boardIds.has(endpoint.component) && predicate(endpoint.pin)) ?? null;
}

function unsupportedBoardEndpoint(net, boardIds, predicate) {
  return net?.endpoints.find((endpoint) => boardIds.has(endpoint.component) && !predicate(endpoint.pin)) ?? null;
}

function failure(prefix, suffix, component = null, net = null, extra = []) {
  return {
    ok: false,
    code: `${prefix}_${suffix}`,
    details: [...(component ? [component.id] : []), ...(net ? [net.id] : []), ...extra],
  };
}

export function inspectIdealThreePinPoweredModules(value, contract) {
  const {
    type, diagnosticPrefix, validateComponent, outputPinId,
    outputBoardPin, outputRequiresSuffix,
  } = contract ?? {};
  if (typeof type !== 'string' || !type
      || typeof diagnosticPrefix !== 'string' || !/^[A-Z][A-Z0-9_]+$/u.test(diagnosticPrefix)
      || typeof validateComponent !== 'function'
      || typeof outputPinId !== 'string' || !/^[A-Z][A-Z0-9_]+$/u.test(outputPinId)
      || typeof outputBoardPin !== 'function'
      || typeof outputRequiresSuffix !== 'string' || !/^[A-Z][A-Z0-9_]+$/u.test(outputRequiresSuffix)) {
    throw new TypeError('IDEAL_THREE_PIN_POWERED_MODULE_CONTRACT');
  }
  if (!exactKeys(value, ['schema', 'components', 'nets', 'junctions'])
      || value.schema !== CIRCUIT_SCHEMA
      || !Array.isArray(value.components) || !Array.isArray(value.nets) || !Array.isArray(value.junctions)) {
    return failure(diagnosticPrefix, 'CIRCUIT_SHAPE');
  }
  const modules = value.components.filter((component) => component.type === type);
  if (!modules.length) return { ok: true, runtimeGraph: clone(value), modules: [] };
  if (value.components.filter((component) => component.type === BOARD_TYPE).length !== 1) {
    return failure(diagnosticPrefix, 'CONTROLLER_REQUIRED');
  }
  const boardIds = new Set(value.components.filter((component) => component.type === BOARD_TYPE)
    .map((component) => component.id));
  const groundReferenceIds = new Set(value.components.filter(
    (component) => component.type === GROUND_REFERENCE_TYPE,
  ).map((component) => component.id));

  const records = [];
  for (const module of modules) {
    if (!validateComponent(module)) return failure(diagnosticPrefix, 'STATE', module);
    const vccNet = connectedNet(value, module.id, 'VCC');
    const groundNet = connectedNet(value, module.id, 'GND');
    const outputNet = connectedNet(value, module.id, outputPinId);
    if (!vccNet) return failure(diagnosticPrefix, 'VCC_DISCONNECTED', module);
    if (!groundNet) return failure(diagnosticPrefix, 'GND_DISCONNECTED', module);
    if (!outputNet) return failure(diagnosticPrefix, `${outputPinId}_DISCONNECTED`, module);

    const fiveVolt = boardEndpoint(vccNet, boardIds, (pin) => pin === '5V');
    if (!fiveVolt || unsupportedBoardEndpoint(vccNet, boardIds, (pin) => pin === '5V')) {
      return failure(diagnosticPrefix, 'VCC_REQUIRES_5V', module, vccNet);
    }
    const ground = boardEndpoint(groundNet, boardIds, (pin) => /^GND[123]$/u.test(pin))
      ?? groundNet.endpoints.find((endpoint) => groundReferenceIds.has(endpoint.component)
        && endpoint.pin === 'REF');
    if (!ground || unsupportedBoardEndpoint(groundNet, boardIds, (pin) => /^GND[123]$/u.test(pin))) {
      return failure(diagnosticPrefix, 'GND_REQUIRED', module, groundNet);
    }
    if (vccNet.id === groundNet.id) return failure(diagnosticPrefix, 'POWER_SHORT', module, vccNet);
    if (outputNet.endpoints.length !== 2) {
      return failure(
        diagnosticPrefix, `${outputPinId}_UNSUPPORTED_TOPOLOGY`, module, outputNet,
        [String(outputNet.endpoints.length)],
      );
    }
    const boardOutput = boardEndpoint(outputNet, boardIds, outputBoardPin);
    if (!boardOutput || outputNet.endpoints.some(
      (endpoint) => endpointKey(endpoint) !== endpointKey({ component: module.id, pin: outputPinId })
        && endpointKey(endpoint) !== endpointKey(boardOutput),
    )) return failure(diagnosticPrefix, outputRequiresSuffix, module, outputNet);
    records.push({
      componentId: module.id,
      boardPin: boardOutput.pin,
      outputNetId: outputNet.id,
      component: clone(module),
    });
  }
  return { ok: true, runtimeGraph: clone(value), modules: records };
}

export function projectIdealThreePinAnalogueModules(value, contract) {
  const {
    type, diagnosticPrefix, validateComponent, controlKey, valueToVoltage, transferModel,
  } = contract ?? {};
  if (typeof type !== 'string' || !type
      || typeof diagnosticPrefix !== 'string' || !/^[A-Z][A-Z0-9_]+$/u.test(diagnosticPrefix)
      || typeof validateComponent !== 'function'
      || typeof controlKey !== 'string' || !controlKey
      || typeof valueToVoltage !== 'function'
      || typeof transferModel !== 'string' || !transferModel) {
    throw new TypeError('IDEAL_ANALOGUE_MODULE_CONTRACT');
  }
  const inspected = inspectIdealThreePinPoweredModules(value, {
    type,
    diagnosticPrefix,
    validateComponent,
    outputPinId: 'AOUT',
    outputBoardPin: (pin) => /^A[0-5]$/u.test(pin),
    outputRequiresSuffix: 'AOUT_REQUIRES_ANALOGUE',
  });
  if (!inspected.ok) return inspected;
  const records = [];
  for (const module of inspected.modules) {
    const controlValue = module.component.controls[controlKey];
    const voltage = valueToVoltage(controlValue);
    if (!Number.isFinite(voltage) || voltage < 0 || voltage > 5) {
      return failure(
        diagnosticPrefix, 'TRANSFER_RANGE', module.component,
        inspected.runtimeGraph.nets.find((net) => net.id === module.outputNetId), [String(voltage)],
      );
    }
    records.push({
      componentId: module.componentId,
      boardPin: module.boardPin,
      controlKey,
      controlValue,
      voltage,
      position: voltage / 5,
      supplyVolts: 5,
      transferModel,
    });
  }

  const moduleIds = new Set(records.map((module) => module.componentId));
  const pinProjection = { VCC: 'HIGH', GND: 'LOW', AOUT: 'WIPER' };
  const recordById = new Map(records.map((record) => [record.componentId, record]));
  const runtimeGraph = inspected.runtimeGraph;
  runtimeGraph.components = runtimeGraph.components.map((component) => moduleIds.has(component.id) ? {
    id: component.id,
    type: IDEAL_ANALOGUE_MODULE_RUNTIME_TYPE,
    label: component.label,
    properties: { ohms: 10_000, taper: 'linear' },
    controls: { position: recordById.get(component.id).position },
  } : component);
  runtimeGraph.nets = runtimeGraph.nets.map((net) => ({
    id: net.id,
    endpoints: net.endpoints.map((endpoint) => moduleIds.has(endpoint.component) ? {
      component: endpoint.component,
      pin: pinProjection[endpoint.pin],
    } : endpoint),
  }));
  return { ok: true, runtimeGraph, modules: records };
}
