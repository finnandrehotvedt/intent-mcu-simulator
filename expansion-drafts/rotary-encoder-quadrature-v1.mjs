// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';

export const ROTARY_ENCODER_TYPE = 'input.rotary-encoder-quadrature-v1';
export const ROTARY_ENCODER_MODEL = 'model.rotary-encoder-quadrature-ideal-v1';
export const ROTARY_ENCODER_RENDERER = 'input-rotary-encoder-quadrature';
export const ROTARY_ENCODER_RUNTIME_TYPE = 'button.momentary-v1';
export const ROTARY_ENCODER_PHASE_CYCLES = 16_000;
export const ROTARY_ENCODER_DETENT_MIN = -999;
export const ROTARY_ENCODER_DETENT_MAX = 999;

const BOARD_TYPE = 'board.atmega328p-16mhz-v1';
const GROUND_PIN = /^GND[123]$/u;
const INTERRUPT_PIN = /^D[23]$/u;
const clone = (value) => structuredClone(value);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function pin(id, label, role, x) {
  return {
    id, label, role,
    signals: role === 'ground' ? ['ground.reference'] : ['digital.quadrature-contact'],
    capabilities: role === 'ground' ? ['ground.reference'] : ['digital.quadrature-contact'],
    constraints: role === 'ground'
      ? { voltage: 0 }
      : { voltageMin: 0, voltageMax: 5, pullMode: 'input-pullup' },
    anchor: { x, y: 0.92 },
  };
}

export const ROTARY_ENCODER_DEFINITION = deepFreeze({
  family: 'input.rotary-encoder-quadrature',
  variant: 'ideal-two-bit-gray-contact',
  type: ROTARY_ENCODER_TYPE,
  version: 1,
  displayName: 'Quadrature rotary encoder',
  manufacturer: 'Intent Learning',
  partNumber: 'IL-ENCODER-AB-COM',
  pins: [
    pin('A', 'Phase A · INPUT_PULLUP', 'digital-out', 0.2),
    pin('COM', 'Common · ground', 'ground', 0.5),
    pin('B', 'Phase B · INPUT_PULLUP', 'digital-out', 0.8),
  ],
  propertyKeys: ['encoding', 'pullMode'],
  propertySchema: {
    encoding: { kind: 'enum', values: ['gray-2bit'], default: 'gray-2bit' },
    pullMode: { kind: 'enum', values: ['input-pullup'], default: 'input-pullup' },
  },
  controlKeys: ['detent'],
  modelRef: ROTARY_ENCODER_MODEL,
  internalTerminalGroups: [],
  selectable: true,
  artwork: {
    renderer: ROTARY_ENCODER_RENDERER,
    thumbnail: ROTARY_ENCODER_RENDERER,
    viewBox: [0, 0, 128, 110], cssWidth: 128, cssHeight: 110,
    provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced package, photograph or third-party simulator artwork.',
    license: 'Apache-2.0',
  },
  catalog: {
    category: 'inputs',
    aliases: ['rotary encoder', 'quadrature encoder', 'incremental encoder', 'a b common'],
    functions: ['direction input', 'incremental position input', 'Gray-code demonstration'],
    interfaces: ['GPIO'],
    supplyVolts: { min: 0, max: 5 },
    package: 'original virtual A/B/COM contact encoder',
  },
  support: {
    status: 'simulated',
    limitations: [
      'A and B must connect directly to the supported AVR external-interrupt pins D2 and D3, one unique phase per pin; COM must connect directly to board ground.',
      'Each detent emits the deterministic ideal Gray sequence CW 11→01→00→10→11 or CCW 11→10→00→01→11 at 16,000 cycles per phase.',
      'A/B are open contacts read HIGH through firmware INPUT_PULLUP and close LOW to COM. Firmware must decode the transitions; the UI never writes a counter value.',
      'No contact bounce, resistance, acceleration, missed edges, shaft switch, mechanical timing or physical detent behavior is modelled.',
    ],
  },
});

export function validateRotaryEncoderDefinition(definition = ROTARY_ENCODER_DEFINITION) {
  return exactKeys(definition, [
    'family', 'variant', 'type', 'version', 'displayName', 'manufacturer', 'partNumber',
    'pins', 'propertyKeys', 'propertySchema', 'controlKeys', 'modelRef',
    'internalTerminalGroups', 'selectable', 'artwork', 'catalog', 'support',
  ]) && JSON.stringify(definition) === JSON.stringify(ROTARY_ENCODER_DEFINITION);
}

export function createRotaryEncoderComponent(id, label = 'Quadrature rotary encoder', detent = 0) {
  const component = {
    id,
    type: ROTARY_ENCODER_TYPE,
    label,
    properties: { encoding: 'gray-2bit', pullMode: 'input-pullup' },
    controls: { detent },
  };
  if (!validateRotaryEncoderComponent(component)) throw new TypeError('ROTARY_ENCODER_STATE');
  return component;
}

export function validateRotaryEncoderComponent(component) {
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && component.type === ROTARY_ENCODER_TYPE
    && exactKeys(component.properties, ['encoding', 'pullMode'])
    && component.properties.encoding === 'gray-2bit'
    && component.properties.pullMode === 'input-pullup'
    && exactKeys(component.controls, ['detent'])
    && Number.isInteger(component.controls.detent)
    && component.controls.detent >= ROTARY_ENCODER_DETENT_MIN
    && component.controls.detent <= ROTARY_ENCODER_DETENT_MAX;
}

export function nextRotaryEncoderDetent(component, direction) {
  if (!validateRotaryEncoderComponent(component) || !['cw', 'ccw'].includes(direction)) {
    throw new TypeError('ROTARY_ENCODER_CONTROL');
  }
  const delta = direction === 'cw' ? 1 : -1;
  const detent = component.controls.detent + delta;
  if (detent < ROTARY_ENCODER_DETENT_MIN || detent > ROTARY_ENCODER_DETENT_MAX) {
    throw new RangeError('ROTARY_ENCODER_DETENT_RANGE');
  }
  return detent;
}

function fail(code, details = []) { return { ok: false, code, details }; }
function endpointKey(endpoint) { return `${endpoint.component}.${endpoint.pin}`; }

function indexes(graph) {
  const components = new Map(graph.components.map((component) => [component.id, component]));
  const nets = new Map(graph.nets.map((net) => [net.id, net]));
  const endpointToNet = new Map();
  for (const net of graph.nets) {
    for (const endpoint of net.endpoints) endpointToNet.set(endpointKey(endpoint), net.id);
  }
  return { components, nets, endpointToNet };
}

function boardEndpoints(index, netId) {
  return (index.nets.get(netId)?.endpoints ?? []).filter(
    (endpoint) => index.components.get(endpoint.component)?.type === BOARD_TYPE,
  );
}

function availableRuntimeId(base, used) {
  for (let ordinal = 1; ordinal <= 99; ordinal += 1) {
    const suffix = ordinal === 1 ? 'b' : `b-${ordinal}`;
    const candidate = `${base.slice(0, 44 - suffix.length)}-${suffix}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  throw new Error('ROTARY_ENCODER_RUNTIME_ID');
}

export function projectRotaryEncoders(value) {
  const graph = clone(value);
  const components = graph.components.filter((component) => component.type === ROTARY_ENCODER_TYPE);
  if (!components.length) {
    return { ok: true, runtimeGraph: graph, encoders: [], runtimePositionSources: {} };
  }
  const index = indexes(graph);
  const inspections = [];
  for (const component of components) {
    if (!validateRotaryEncoderComponent(component)) return fail('ROTARY_ENCODER_STATE', [component.id]);
    const aNet = index.endpointToNet.get(`${component.id}.A`) ?? null;
    const bNet = index.endpointToNet.get(`${component.id}.B`) ?? null;
    const commonNet = index.endpointToNet.get(`${component.id}.COM`) ?? null;
    if (!aNet || !bNet || !commonNet) return fail('ROTARY_ENCODER_TERMINALS_REQUIRED', [component.id]);
    if (new Set([aNet, bNet, commonNet]).size !== 3) return fail('ROTARY_ENCODER_TERMINAL_SHORT', [component.id]);
    const phases = [['A', aNet], ['B', bNet]].map(([phase, netId]) => {
      const endpoints = index.nets.get(netId)?.endpoints ?? [];
      const boards = boardEndpoints(index, netId);
      if (endpoints.length !== 2 || boards.length !== 1 || !INTERRUPT_PIN.test(boards[0].pin)) {
        return fail(`ROTARY_ENCODER_${phase}_REQUIRES_D2_OR_D3`, [component.id, netId]);
      }
      return { ok: true, phase, netId, boardPin: boards[0].pin, boardPinNumber: Number(boards[0].pin.slice(1)) };
    });
    const rejected = phases.find((phase) => !phase.ok);
    if (rejected) return rejected;
    if (phases[0].boardPin === phases[1].boardPin) return fail('ROTARY_ENCODER_PHASES_REQUIRE_UNIQUE_PINS', [component.id]);
    const commonEndpoints = index.nets.get(commonNet)?.endpoints ?? [];
    const commonBoards = boardEndpoints(index, commonNet);
    if (commonEndpoints.length !== 2 || commonBoards.length !== 1 || !GROUND_PIN.test(commonBoards[0].pin)) {
      return fail('ROTARY_ENCODER_COM_REQUIRES_GROUND', [component.id, commonNet]);
    }
    inspections.push({ component, commonNet, phases });
  }

  const usedIds = new Set(graph.components.map((component) => component.id));
  const mapping = new Map();
  const runtimePositionSources = {};
  for (const inspection of inspections) {
    const ids = { A: inspection.component.id, B: availableRuntimeId(inspection.component.id, usedIds) };
    mapping.set(inspection.component.id, ids);
    runtimePositionSources[ids.A] = inspection.component.id;
    runtimePositionSources[ids.B] = inspection.component.id;
  }
  graph.components = graph.components.flatMap((component) => {
    const ids = mapping.get(component.id);
    if (!ids) return [component];
    return ['A', 'B'].map((phase) => ({
      id: ids[phase], type: ROTARY_ENCODER_RUNTIME_TYPE,
      label: `${component.label} (${phase})`,
      properties: { normallyOpen: true }, controls: { pressed: false },
    }));
  });
  graph.nets = graph.nets.map((net) => ({
    id: net.id,
    endpoints: net.endpoints.flatMap((endpoint) => {
      const ids = mapping.get(endpoint.component);
      if (!ids) return [endpoint];
      if (endpoint.pin === 'COM') return [
        { component: ids.A, pin: 'B' }, { component: ids.B, pin: 'B' },
      ];
      return [{ component: ids[endpoint.pin], pin: 'A' }];
    }),
  }));
  return {
    ok: true,
    runtimeGraph: graph,
    encoders: inspections.map((inspection) => {
      const ids = mapping.get(inspection.component.id);
      const byPhase = Object.fromEntries(inspection.phases.map((phase) => [phase.phase, phase]));
      return {
        componentId: inspection.component.id,
        commonNet: inspection.commonNet,
        detent: inspection.component.controls.detent,
        restState: '11',
        phaseCycles: ROTARY_ENCODER_PHASE_CYCLES,
        phases: {
          A: { ...clone(byPhase.A), runtimeComponentId: ids.A },
          B: { ...clone(byPhase.B), runtimeComponentId: ids.B },
        },
        sequences: { cw: ['11', '01', '00', '10', '11'], ccw: ['11', '10', '00', '01', '11'] },
        electricalModel: 'ideal-normally-open-a-b-contacts-to-ground-with-firmware-input-pullup',
      };
    }),
    runtimePositionSources,
  };
}

export function rotaryEncoderDigitalSequence(projection, direction) {
  if (!projection || !['cw', 'ccw'].includes(direction)
      || !Number.isInteger(projection.phaseCycles) || projection.phaseCycles !== ROTARY_ENCODER_PHASE_CYCLES
      || !Number.isInteger(projection.phases?.A?.boardPinNumber)
      || !Number.isInteger(projection.phases?.B?.boardPinNumber)) {
    throw new TypeError('ROTARY_ENCODER_SEQUENCE');
  }
  const states = direction === 'cw'
    ? [[false, true], [false, false], [true, false], [true, true]]
    : [[true, false], [false, false], [false, true], [true, true]];
  let previous = [true, true];
  return states.map((state, index) => {
    const changedPhase = state[0] !== previous[0] ? 'A' : 'B';
    previous = state;
    return {
      offsetCycles: ROTARY_ENCODER_PHASE_CYCLES * (index + 1),
      pin: projection.phases[changedPhase].boardPinNumber,
      level: changedPhase === 'A' ? state[0] : state[1],
    };
  });
}
