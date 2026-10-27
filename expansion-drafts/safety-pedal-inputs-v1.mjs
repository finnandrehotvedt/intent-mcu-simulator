// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const REED_SWITCH_TYPE = 'switch.reed-no-v1';
export const EMERGENCY_STOP_TYPE = 'switch.emergency-stop-nc-v1';
export const FOOT_PEDAL_TYPE = 'switch.foot-pedal-no-v1';
const freeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
const pin = (id, label, x) => ({ id, label, role: 'passive', signals: ['passive.contact'],
  capabilities: ['passive.contact'], constraints: {}, anchor: { x, y: 0.82 } });
const artwork = (renderer, width = 118) => ({ renderer, thumbnail: renderer,
  viewBox: [0, 0, width, 86], cssWidth: width, cssHeight: 86,
  provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
  license: 'Apache-2.0' });
const catalog = (aliases, functions, packageName) => ({ category: 'inputs', aliases, functions,
  interfaces: ['GPIO'], supplyVolts: { min: 0, max: 5 }, package: packageName });

export const REED_SWITCH_DEFINITION = freeze({
  family: 'input.reed-switch', variant: 'normally-open-magnetic-contact', type: REED_SWITCH_TYPE,
  version: 1, displayName: 'Normally-open reed switch', manufacturer: 'Generic', partNumber: 'SW-REED-NO',
  pins: [pin('A', 'Contact A', 0.08), pin('B', 'Contact B', 0.92)],
  propertyKeys: ['normallyOpen'], propertySchema: { normallyOpen: { kind: 'boolean', default: true } },
  controlKeys: ['magnetPresent'], modelRef: 'model.switch-reed-no-v1', internalTerminalGroups: [],
  selectable: true, artwork: artwork('switch-reed-no'),
  catalog: catalog(['reed switch', 'magnetic contact'], ['magnetic presence input', 'normally-open contact'], 'sealed two-terminal reed contact'),
  support: { status: 'partial', limitations: ['Ideal normally-open contact closes while Magnet present is enabled.', 'No magnetic field, hysteresis, bounce, resistance, glass package or current rating model.'] },
});
export const EMERGENCY_STOP_DEFINITION = freeze({
  family: 'input.emergency-stop', variant: 'maintained-normally-closed-latching', type: EMERGENCY_STOP_TYPE,
  version: 1, displayName: 'Emergency stop model', manufacturer: 'Generic', partNumber: 'ESTOP-NC',
  pins: [pin('A', 'NC contact A', 0.08), pin('B', 'NC contact B', 0.92)],
  propertyKeys: ['normallyClosed', 'latching'], propertySchema: { normallyClosed: { kind: 'boolean', default: true }, latching: { kind: 'boolean', default: true } },
  controlKeys: ['latched'], modelRef: 'model.switch-emergency-stop-nc-v1', internalTerminalGroups: [],
  selectable: true, artwork: artwork('switch-emergency-stop-nc', 126),
  catalog: catalog(['emergency stop', 'e stop', 'mushroom switch'], ['maintained safety input', 'normally-closed contact'], 'two-terminal instructional emergency-stop contact'),
  support: { status: 'partial', limitations: ['Instructional ideal NC contact opens while latched and closes only after reset.', 'Not a safety-rated device or safety-function validation; no dual channel, force-guided contact, diagnostics or certification model.'] },
});
export const FOOT_PEDAL_DEFINITION = freeze({
  family: 'input.foot-pedal', variant: 'momentary-normally-open', type: FOOT_PEDAL_TYPE,
  version: 1, displayName: 'Momentary foot pedal', manufacturer: 'Generic', partNumber: 'PEDAL-NO',
  pins: [pin('A', 'Contact A', 0.08), pin('B', 'Contact B', 0.92)],
  propertyKeys: ['normallyOpen'], propertySchema: { normallyOpen: { kind: 'boolean', default: true } },
  controlKeys: ['pressed'], modelRef: 'model.switch-foot-pedal-no-v1', internalTerminalGroups: [],
  selectable: true, artwork: artwork('switch-foot-pedal-no', 130),
  catalog: catalog(['foot pedal', 'footswitch'], ['momentary digital input', 'normally-open contact'], 'two-terminal momentary pedal contact'),
  support: { status: 'partial', limitations: ['Ideal normally-open contact closes only while pressed.', 'No travel, force, bounce, resistance, cable, current rating or wear model.'] },
});
export const SAFETY_PEDAL_INPUT_DEFINITIONS = freeze({ [REED_SWITCH_TYPE]: REED_SWITCH_DEFINITION,
  [EMERGENCY_STOP_TYPE]: EMERGENCY_STOP_DEFINITION, [FOOT_PEDAL_TYPE]: FOOT_PEDAL_DEFINITION });

export function createSafetyPedalInput(type, id) {
  if (type === REED_SWITCH_TYPE) return { id, type, label: 'Normally-open reed switch', properties: { normallyOpen: true }, controls: { magnetPresent: false } };
  if (type === EMERGENCY_STOP_TYPE) return { id, type, label: 'Emergency stop model', properties: { normallyClosed: true, latching: true }, controls: { latched: false } };
  if (type === FOOT_PEDAL_TYPE) return { id, type, label: 'Momentary foot pedal', properties: { normallyOpen: true }, controls: { pressed: false } };
  throw new TypeError('SAFETY_PEDAL_INPUT_TYPE');
}
export function validateSafetyPedalInput(component) {
  if (!component || typeof component.id !== 'string' || typeof component.label !== 'string') return false;
  if (component.type === REED_SWITCH_TYPE) return component.properties?.normallyOpen === true && typeof component.controls?.magnetPresent === 'boolean';
  if (component.type === EMERGENCY_STOP_TYPE) return component.properties?.normallyClosed === true && component.properties?.latching === true && typeof component.controls?.latched === 'boolean';
  return component.type === FOOT_PEDAL_TYPE && component.properties?.normallyOpen === true && typeof component.controls?.pressed === 'boolean';
}
export function safetyPedalRuntimeState(component) {
  if (!validateSafetyPedalInput(component)) throw new TypeError('SAFETY_PEDAL_INPUT_STATE');
  return { closed: component.type === REED_SWITCH_TYPE ? component.controls.magnetPresent
    : component.type === EMERGENCY_STOP_TYPE ? !component.controls.latched : component.controls.pressed };
}
