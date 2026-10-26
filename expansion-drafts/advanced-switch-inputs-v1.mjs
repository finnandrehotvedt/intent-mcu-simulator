// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const DIP_SWITCH_4_TYPE = 'switch.dip-4-v1';
export const ROTARY_ENCODER_BUTTON_TYPE = 'input.rotary-encoder-button-v1';

const freeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
const pin = (id, label, x, y) => ({ id, label, role: 'passive', signals: ['passive.contact'],
  capabilities: ['passive.contact'], constraints: {}, anchor: { x, y } });
const artwork = (renderer, width, height) => ({ renderer, thumbnail: renderer,
  viewBox: [0, 0, width, height], cssWidth: width, cssHeight: height,
  provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
  license: 'Apache-2.0' });

export const DIP_SWITCH_4_DEFINITION = freeze({
  family: 'input.dip-switch', variant: 'four-independent-spst-maintained', type: DIP_SWITCH_4_TYPE,
  version: 1, displayName: '4-position DIP switch', manufacturer: 'Generic', partNumber: 'SW-DIP-04',
  pins: [1, 2, 3, 4].flatMap((channel, index) => [
    pin(`${channel}A`, `Switch ${channel} A`, 0.08, 0.25 + index * 0.17),
    pin(`${channel}B`, `Switch ${channel} B`, 0.92, 0.25 + index * 0.17),
  ]),
  propertyKeys: ['positions'], propertySchema: { positions: { kind: 'integer', minimum: 4, maximum: 4, default: 4 } },
  controlKeys: ['switch1', 'switch2', 'switch3', 'switch4'], modelRef: 'model.switch-dip-4-v1',
  internalTerminalGroups: [], selectable: true, artwork: artwork('switch-dip-4', 132, 112),
  catalog: { category: 'inputs', aliases: ['dip switch', 'four way switch bank'],
    functions: ['four maintained digital inputs', 'binary configuration'], interfaces: ['GPIO'],
    supplyVolts: { min: 0, max: 5 }, package: 'eight-terminal four-position DIP switch' },
  support: { status: 'partial', limitations: ['Four independent ideal maintained SPST contacts.',
    'No bounce, resistance, current rating, package pitch, arcing or wear model.'] },
});

export const ROTARY_ENCODER_BUTTON_DEFINITION = freeze({
  family: 'input.rotary-encoder', variant: 'quadrature-with-momentary-shaft-button',
  type: ROTARY_ENCODER_BUTTON_TYPE, version: 1, displayName: 'Rotary encoder with button',
  manufacturer: 'Generic', partNumber: 'ENC-AB-SW',
  pins: [pin('A', 'Phase A', 0.12, 0.9), pin('COM', 'Encoder common', 0.3, 0.9),
    pin('B', 'Phase B', 0.48, 0.9), pin('SW', 'Button signal', 0.7, 0.9),
    pin('SWCOM', 'Button common', 0.88, 0.9)],
  propertyKeys: ['encoding', 'pullMode'], propertySchema: {
    encoding: { kind: 'enum', values: ['gray-2bit'], default: 'gray-2bit' },
    pullMode: { kind: 'enum', values: ['input-pullup'], default: 'input-pullup' },
  },
  controlKeys: ['detent', 'pressed'], modelRef: 'model.rotary-encoder-button-v1',
  internalTerminalGroups: [], selectable: true, artwork: artwork('input-rotary-encoder-button', 140, 118),
  catalog: { category: 'inputs', aliases: ['rotary encoder with button', 'shaft encoder switch'],
    functions: ['direction input', 'incremental position input', 'momentary push input'], interfaces: ['GPIO'],
    supplyVolts: { min: 0, max: 5 }, package: 'five-terminal ideal encoder and shaft switch' },
  support: { status: 'partial', limitations: ['Ideal Gray-code quadrature contact plus independent normally-open shaft button.',
    'No bounce, acceleration, resistance, missed edges, force, travel or physical detent model.'] },
});

export const ADVANCED_SWITCH_INPUT_DEFINITIONS = freeze({
  [DIP_SWITCH_4_TYPE]: DIP_SWITCH_4_DEFINITION,
  [ROTARY_ENCODER_BUTTON_TYPE]: ROTARY_ENCODER_BUTTON_DEFINITION,
});

export function createAdvancedSwitchInput(type, id) {
  if (type === DIP_SWITCH_4_TYPE) return { id, type, label: '4-position DIP switch',
    properties: { positions: 4 }, controls: { switch1: false, switch2: false, switch3: false, switch4: false } };
  if (type === ROTARY_ENCODER_BUTTON_TYPE) return { id, type, label: 'Rotary encoder with button',
    properties: { encoding: 'gray-2bit', pullMode: 'input-pullup' }, controls: { detent: 0, pressed: false } };
  throw new TypeError('ADVANCED_SWITCH_INPUT_TYPE');
}

export function validateAdvancedSwitchInput(component) {
  if (!component || typeof component.id !== 'string' || typeof component.label !== 'string') return false;
  if (component.type === DIP_SWITCH_4_TYPE) return component.properties?.positions === 4
    && [1, 2, 3, 4].every((index) => typeof component.controls?.[`switch${index}`] === 'boolean')
    && Object.keys(component.controls ?? {}).length === 4;
  return component.type === ROTARY_ENCODER_BUTTON_TYPE
    && component.properties?.encoding === 'gray-2bit' && component.properties?.pullMode === 'input-pullup'
    && Number.isInteger(component.controls?.detent) && component.controls.detent >= -999
    && component.controls.detent <= 999 && typeof component.controls?.pressed === 'boolean';
}

export function advancedSwitchRuntimeState(component) {
  if (!validateAdvancedSwitchInput(component)) throw new TypeError('ADVANCED_SWITCH_INPUT_STATE');
  if (component.type === DIP_SWITCH_4_TYPE) return { contacts: [1, 2, 3, 4]
    .map((index) => ({ channel: index, closed: component.controls[`switch${index}`] })) };
  return { detent: component.controls.detent, buttonClosed: component.controls.pressed };
}
