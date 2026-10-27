// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const SLIDE_SWITCH_TYPE = 'switch.slide-spdt-v1';
export const NC_BUTTON_TYPE = 'button.momentary-nc-v1';
export const LIMIT_SWITCH_TYPE = 'switch.limit-spdt-v1';

const pin = (id, label, x, y) => ({
  id, label, role: 'passive', signals: ['passive.contact'],
  capabilities: ['passive.contact'], constraints: {}, anchor: { x, y },
});
const artwork = (renderer, width = 124, height = 86) => ({
  renderer, thumbnail: renderer, viewBox: [0, 0, width, height],
  cssWidth: width, cssHeight: height,
  provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
  license: 'Apache-2.0',
});
const catalog = (aliases, functions, packageName) => ({
  category: 'inputs', aliases, functions, interfaces: ['GPIO'],
  supplyVolts: { min: 0, max: 5 }, package: packageName,
});
const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};

export const SLIDE_SWITCH_DEFINITION = freeze({
  family: 'input.slide-switch', variant: 'spdt-maintained-break-before-make',
  type: SLIDE_SWITCH_TYPE, version: 1, displayName: 'SPDT slide switch',
  manufacturer: 'Generic', partNumber: 'SW-SLIDE-SPDT',
  pins: [pin('COM', 'Common', 0.08, 0.72), pin('A', 'Throw A', 0.92, 0.36), pin('B', 'Throw B', 0.92, 0.76)],
  propertyKeys: ['transitionPolicy'], propertySchema: { transitionPolicy: { kind: 'enum', values: ['break-before-make'], default: 'break-before-make' } },
  controlKeys: ['selectedThrow'], modelRef: 'model.switch-slide-spdt-v1',
  internalTerminalGroups: [], selectable: true, artwork: artwork('switch-slide-spdt'),
  catalog: catalog(['slide switch', 'spdt slide'], ['digital input selection', 'maintained contact'], 'three-terminal slide switch'),
  support: { status: 'partial', limitations: ['Ideal maintained break-before-make contact only.', 'No bounce, resistance, current rating, travel or wear model.'] },
});

export const NC_BUTTON_DEFINITION = freeze({
  family: 'input.pushbutton', variant: 'momentary-normally-closed',
  type: NC_BUTTON_TYPE, version: 1, displayName: 'Normally-closed pushbutton',
  manufacturer: 'Generic', partNumber: 'SW-PUSH-NC',
  pins: [pin('A', 'Contact A', 0.08, 0.72), pin('B', 'Contact B', 0.92, 0.72)],
  propertyKeys: ['normallyClosed'], propertySchema: { normallyClosed: { kind: 'boolean', default: true } },
  controlKeys: ['pressed'], modelRef: 'model.button-momentary-nc-v1',
  internalTerminalGroups: [], selectable: true, artwork: artwork('button-momentary-nc', 104, 82),
  catalog: catalog(['nc button', 'normally closed pushbutton'], ['digital input', 'momentary opening contact'], 'two-terminal NC pushbutton'),
  support: { status: 'partial', limitations: ['Ideal normally-closed contact that opens only while pressed.', 'No bounce, resistance, force, travel or wear model.'] },
});

export const LIMIT_SWITCH_DEFINITION = freeze({
  family: 'input.limit-switch', variant: 'spdt-spring-return-break-before-make',
  type: LIMIT_SWITCH_TYPE, version: 1, displayName: 'SPDT limit switch',
  manufacturer: 'Generic', partNumber: 'SW-LIMIT-SPDT',
  pins: [pin('COM', 'Common', 0.08, 0.72), pin('NC', 'Normally closed', 0.92, 0.36), pin('NO', 'Normally open', 0.92, 0.76)],
  propertyKeys: ['transitionPolicy', 'restingThrow'], propertySchema: {
    transitionPolicy: { kind: 'enum', values: ['break-before-make'], default: 'break-before-make' },
    restingThrow: { kind: 'enum', values: ['NC'], default: 'NC' },
  },
  controlKeys: ['actuated'], modelRef: 'model.switch-limit-spdt-v1',
  internalTerminalGroups: [], selectable: true, artwork: artwork('switch-limit-spdt', 136, 92),
  catalog: catalog(['limit switch', 'microswitch', 'end stop'], ['digital input', 'spring-return changeover contact'], 'lever SPDT microswitch'),
  support: { status: 'partial', limitations: ['Ideal spring-return COM/NC/NO contact with break-before-make transition.', 'No bounce, overtravel, force, current rating or wear model.'] },
});

export const MECHANICAL_INPUT_DEFINITIONS = freeze({
  [SLIDE_SWITCH_TYPE]: SLIDE_SWITCH_DEFINITION,
  [NC_BUTTON_TYPE]: NC_BUTTON_DEFINITION,
  [LIMIT_SWITCH_TYPE]: LIMIT_SWITCH_DEFINITION,
});

export function createMechanicalInputComponent(type, id) {
  if (type === SLIDE_SWITCH_TYPE) return { id, type, label: 'SPDT slide switch', properties: { transitionPolicy: 'break-before-make' }, controls: { selectedThrow: 'A' } };
  if (type === NC_BUTTON_TYPE) return { id, type, label: 'Normally-closed pushbutton', properties: { normallyClosed: true }, controls: { pressed: false } };
  if (type === LIMIT_SWITCH_TYPE) return { id, type, label: 'SPDT limit switch', properties: { transitionPolicy: 'break-before-make', restingThrow: 'NC' }, controls: { actuated: false } };
  throw new TypeError('MECHANICAL_INPUT_TYPE');
}

export function validateMechanicalInputComponent(component) {
  if (!component || typeof component.id !== 'string' || typeof component.label !== 'string') return false;
  if (component.type === SLIDE_SWITCH_TYPE) return component.properties?.transitionPolicy === 'break-before-make' && ['A', 'B'].includes(component.controls?.selectedThrow);
  if (component.type === NC_BUTTON_TYPE) return component.properties?.normallyClosed === true && typeof component.controls?.pressed === 'boolean';
  if (component.type === LIMIT_SWITCH_TYPE) return component.properties?.transitionPolicy === 'break-before-make' && component.properties?.restingThrow === 'NC' && typeof component.controls?.actuated === 'boolean';
  return false;
}

export function mechanicalRuntimeState(component) {
  if (!validateMechanicalInputComponent(component)) throw new TypeError('MECHANICAL_INPUT_STATE');
  if (component.type === SLIDE_SWITCH_TYPE) return { kind: 'spdt', selectedThrow: component.controls.selectedThrow };
  if (component.type === NC_BUTTON_TYPE) return { kind: 'spst', closed: !component.controls.pressed };
  return { kind: 'spdt', selectedThrow: component.controls.actuated ? 'NO' : 'NC' };
}
