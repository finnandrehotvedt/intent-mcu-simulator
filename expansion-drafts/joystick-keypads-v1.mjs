// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const ANALOG_JOYSTICK_TYPE = 'input.analog-joystick-2axis-v1';
export const KEYPAD_3X4_TYPE = 'input.matrix-keypad-3x4-v1';
export const KEYPAD_4X4_TYPE = 'input.matrix-keypad-4x4-v1';
const freeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
const pin = (id, label, role, x, y) => ({ id, label, role, signals: [role], capabilities: [role], constraints: {}, anchor: { x, y } });
const artwork = (renderer, width = 150) => ({ renderer, thumbnail: renderer, viewBox: [0, 0, width, 126], cssWidth: width, cssHeight: 126,
  provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.', license: 'Apache-2.0' });
const support = (limitations) => ({ status: 'partial', limitations });

export const ANALOG_JOYSTICK_DEFINITION = freeze({
  family: 'input.analogue-position', variant: 'two-axis-with-push-switch', type: ANALOG_JOYSTICK_TYPE,
  version: 1, displayName: 'Two-axis analogue joystick', manufacturer: 'Generic', partNumber: 'JOY-XY-SW-5',
  pins: [pin('VCC', '5 V supply', 'power.input', 0.08, 0.92), pin('GND', 'Ground', 'ground.reference', 0.29, 0.92),
    pin('VRX', 'X-axis analogue output', 'analogue.output', 0.5, 0.92), pin('VRY', 'Y-axis analogue output', 'analogue.output', 0.71, 0.92),
    pin('SW', 'Active-low push switch', 'passive.contact', 0.92, 0.92)],
  propertyKeys: ['axisRangeVolts'], propertySchema: { axisRangeVolts: { kind: 'number', default: 5, minimum: 5, maximum: 5 } },
  controlKeys: ['x', 'y', 'pressed'], modelRef: 'model.analog-joystick-2axis-ideal-v1', internalTerminalGroups: [], selectable: true,
  artwork: artwork('input-analog-joystick-2axis'),
  catalog: { category: 'inputs', aliases: ['joystick', 'thumb stick', 'xy stick'], functions: ['two analogue axes', 'momentary push input'], interfaces: ['ADC', 'GPIO'], supplyVolts: { min: 5, max: 5 }, package: 'five-terminal joystick module' },
  support: support(['X and Y are independent ideal 0–5 V ratios and SW is an ideal active-low contact to GND.', 'No dead zone, spring mechanics, axis coupling, tolerance, noise, bounce, force or physical travel model.']),
});

function keypadDefinition({ type, columns, renderer, displayName, partNumber }) {
  const pins = [];
  for (let row = 1; row <= 4; row += 1) pins.push(pin(`R${row}`, `Row ${row}`, 'passive.matrix-row', row / 5, 0.92));
  for (let column = 1; column <= columns; column += 1) pins.push(pin(`C${column}`, `Column ${column}`, 'passive.matrix-column', column / (columns + 1), 0.08));
  return freeze({ family: 'input.matrix-keypad', variant: `4-row-${columns}-column`, type, version: 1,
    displayName, manufacturer: 'Generic', partNumber, pins, propertyKeys: ['rows', 'columns'],
    propertySchema: { rows: { kind: 'integer', default: 4, minimum: 4, maximum: 4 }, columns: { kind: 'integer', default: columns, minimum: columns, maximum: columns } },
    controlKeys: ['pressedKey'], modelRef: `model.matrix-keypad-4x${columns}-ideal-v1`, internalTerminalGroups: [], selectable: true,
    artwork: artwork(renderer, columns === 3 ? 132 : 154),
    catalog: { category: 'inputs', aliases: [`${columns}x4 keypad`, `4x${columns} matrix keypad`], functions: ['scanned key matrix'], interfaces: ['GPIO'], supplyVolts: { min: 0, max: 5 }, package: `${4 + columns}-terminal passive matrix` },
    support: support(['Exactly one selected key closes one explicit row-to-column contact; no key invents a ground or supply connection.', 'No ghosting suppression, diode matrix, debounce, rollover timing, membrane resistance, force or physical key travel model.']),
  });
}
export const KEYPAD_3X4_DEFINITION = keypadDefinition({ type: KEYPAD_3X4_TYPE, columns: 3, renderer: 'input-matrix-keypad-3x4', displayName: '3×4 matrix keypad', partNumber: 'KEYPAD-3X4' });
export const KEYPAD_4X4_DEFINITION = keypadDefinition({ type: KEYPAD_4X4_TYPE, columns: 4, renderer: 'input-matrix-keypad-4x4', displayName: '4×4 matrix keypad', partNumber: 'KEYPAD-4X4' });
export const JOYSTICK_KEYPAD_DEFINITIONS = freeze({ [ANALOG_JOYSTICK_TYPE]: ANALOG_JOYSTICK_DEFINITION,
  [KEYPAD_3X4_TYPE]: KEYPAD_3X4_DEFINITION, [KEYPAD_4X4_TYPE]: KEYPAD_4X4_DEFINITION });

export function createJoystickKeypad(type, id) {
  if (type === ANALOG_JOYSTICK_TYPE) return { id, type, label: ANALOG_JOYSTICK_DEFINITION.displayName,
    properties: { axisRangeVolts: 5 }, controls: { x: 0.5, y: 0.5, pressed: false } };
  const definition = JOYSTICK_KEYPAD_DEFINITIONS[type];
  if (!definition) throw new TypeError('JOYSTICK_KEYPAD_TYPE');
  return { id, type, label: definition.displayName, properties: { rows: 4, columns: type === KEYPAD_3X4_TYPE ? 3 : 4 }, controls: { pressedKey: 'none' } };
}
export function validateJoystickKeypad(component) {
  if (!component || typeof component.id !== 'string' || typeof component.label !== 'string') return false;
  if (component.type === ANALOG_JOYSTICK_TYPE) return component.properties?.axisRangeVolts === 5
    && ['x', 'y'].every((axis) => Number.isFinite(component.controls?.[axis]) && component.controls[axis] >= 0 && component.controls[axis] <= 1)
    && typeof component.controls.pressed === 'boolean';
  const columns = component.type === KEYPAD_3X4_TYPE ? 3 : component.type === KEYPAD_4X4_TYPE ? 4 : 0;
  return columns > 0 && component.properties?.rows === 4 && component.properties?.columns === columns
    && (component.controls?.pressedKey === 'none' || /^R[1-4]C[1-4]$/u.test(component.controls?.pressedKey)
      && Number(component.controls.pressedKey.at(-1)) <= columns);
}
export function joystickVoltages(component) {
  if (!validateJoystickKeypad(component) || component.type !== ANALOG_JOYSTICK_TYPE) throw new TypeError('ANALOG_JOYSTICK_STATE');
  return { VRX: component.controls.x * 5, VRY: component.controls.y * 5, switchClosed: component.controls.pressed };
}
export function keypadContact(component) {
  if (!validateJoystickKeypad(component) || ![KEYPAD_3X4_TYPE, KEYPAD_4X4_TYPE].includes(component.type)) throw new TypeError('MATRIX_KEYPAD_STATE');
  if (component.controls.pressedKey === 'none') return null;
  return { row: component.controls.pressedKey.slice(0, 2), column: component.controls.pressedKey.slice(2) };
}

const childId = (base, suffix) => `${base.slice(0, 47 - suffix.length)}-${suffix}`;
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;

export function projectJoystickKeypads(value) {
  const graph = structuredClone(value);
  const runtimePositionSources = {};
  const replacements = new Map();
  const sharedEndpoints = [];
  const inputs = [];
  graph.components = graph.components.flatMap((component) => {
    if (component.type === ANALOG_JOYSTICK_TYPE) {
      const xId = childId(component.id, 'x'); const yId = childId(component.id, 'y');
      const switchId = childId(component.id, 'sw');
      for (const id of [xId, yId, switchId]) runtimePositionSources[id] = component.id;
      replacements.set(component.id, {
        VCC: { component: xId, pin: 'HIGH' }, GND: { component: xId, pin: 'LOW' },
        VRX: { component: xId, pin: 'WIPER' }, VRY: { component: yId, pin: 'WIPER' },
        SW: { component: switchId, pin: 'A' },
      });
      sharedEndpoints.push({ source: `${component.id}.VCC`, endpoints: [{ component: yId, pin: 'HIGH' }] },
        { source: `${component.id}.GND`, endpoints: [{ component: yId, pin: 'LOW' }, { component: switchId, pin: 'B' }] });
      inputs.push({ componentId: component.id, kind: 'joystick', x: component.controls.x,
        y: component.controls.y, pressed: component.controls.pressed, runtimeIds: { x: xId, y: yId, switch: switchId } });
      return [
        { id: xId, type: 'potentiometer.linear-v1', label: `${component.label} X`, properties: { ohms: 10_000, taper: 'linear' }, controls: { position: component.controls.x } },
        { id: yId, type: 'potentiometer.linear-v1', label: `${component.label} Y`, properties: { ohms: 10_000, taper: 'linear' }, controls: { position: component.controls.y } },
        { id: switchId, type: 'button.momentary-v1', label: `${component.label} switch`, properties: { normallyOpen: true }, controls: { pressed: component.controls.pressed } },
      ];
    }
    if ([KEYPAD_3X4_TYPE, KEYPAD_4X4_TYPE].includes(component.type)) {
      const contact = keypadContact(component);
      if (!contact) { replacements.set(component.id, {}); inputs.push({ componentId: component.id, kind: 'keypad', pressedKey: 'none', runtimeId: null }); return []; }
      const runtimeId = childId(component.id, 'key'); runtimePositionSources[runtimeId] = component.id;
      replacements.set(component.id, { [contact.row]: { component: runtimeId, pin: 'A' }, [contact.column]: { component: runtimeId, pin: 'B' } });
      inputs.push({ componentId: component.id, kind: 'keypad', pressedKey: component.controls.pressedKey, runtimeId });
      return [{ id: runtimeId, type: 'button.momentary-v1', label: `${component.label} ${component.controls.pressedKey}`,
        properties: { normallyOpen: true }, controls: { pressed: true } }];
    }
    return [component];
  });
  graph.nets = graph.nets.map((net) => {
    const originalKeys = new Set(net.endpoints.map(endpointKey));
    const endpoints = net.endpoints.flatMap((endpoint) => {
      const map = replacements.get(endpoint.component);
      return map ? (map[endpoint.pin] ? [map[endpoint.pin]] : []) : [endpoint];
    });
    for (const shared of sharedEndpoints) if (originalKeys.has(shared.source)) endpoints.push(...shared.endpoints);
    return { ...net, endpoints };
  }).filter((net) => net.endpoints.length >= 2);
  const netIds = new Set(graph.nets.map(({ id }) => id));
  graph.junctions = graph.junctions.filter((junction) => netIds.has(junction.net));
  return { ok: true, runtimeGraph: graph, inputs, runtimePositionSources };
}
