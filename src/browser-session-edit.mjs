// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createComponent } from './circuit-engine.mjs';
import { GROUND_REFERENCE_3V3_TYPE, MOMENTARY_BUTTON_3V3_TYPE, POTENTIOMETER_3V3_TYPE,
  TOGGLE_SWITCH_3V3_TYPE } from './bounded-3v3-authoring-contracts.mjs';
import { PCF8574_LCD_TYPE, createPcf8574LcdComponent } from '../expansion-drafts/pcf8574-lcd-backpack-v1.mjs';
import { CHARACTER_LCD_TYPE, createCharacterLcdComponent } from '../expansion-drafts/character-lcd-16x2-4bit-v1.mjs';
import { CHARACTER_LCD_20X4_TYPE, createCharacterLcd20x4Component } from '../expansion-drafts/character-lcd-20x4-4bit-v1.mjs';
import { POWER_REFERENCE_TYPE, createPowerReferenceComponent } from '../expansion-drafts/power-reference-integration-v1.mjs';
import { LIMIT_SWITCH_TYPE, NC_BUTTON_TYPE, SLIDE_SWITCH_TYPE,
  createMechanicalInputComponent } from '../expansion-drafts/mechanical-inputs-v1.mjs';
import { DIP_SWITCH_4_TYPE, ROTARY_ENCODER_BUTTON_TYPE,
  createAdvancedSwitchInput } from '../expansion-drafts/advanced-switch-inputs-v1.mjs';
import { EMERGENCY_STOP_TYPE, FOOT_PEDAL_TYPE, REED_SWITCH_TYPE,
  createSafetyPedalInput } from '../expansion-drafts/safety-pedal-inputs-v1.mjs';
import { ANALOG_JOYSTICK_TYPE, KEYPAD_3X4_TYPE, KEYPAD_4X4_TYPE,
  createJoystickKeypad } from '../expansion-drafts/joystick-keypads-v1.mjs';
import { LED_BAR_GRAPH_TYPE, RGB_COMMON_ANODE_TYPE, ROTARY_SELECTOR_TYPE,
  createRotarySelectorIndicator } from '../expansion-drafts/rotary-selector-indicators-v1.mjs';
import { CAPACITIVE_TOUCH_TYPE, HALL_SWITCH_TYPE, PIR_MOTION_TYPE,
  createDigitalPresenceSensor } from '../expansion-drafts/digital-presence-sensors-v1.mjs';
import { DIGITAL_PULSE_SENSOR_DEFINITIONS, createDigitalPulseSensor } from '../expansion-drafts/digital-pulse-sensors-v1.mjs';
import { IR_OBSTACLE_SENSOR_TYPE, LINE_TRACKING_SENSOR_TYPE,
  createDigitalReflectiveSensor } from '../expansion-drafts/digital-reflective-sensors-v1.mjs';
import { ANALOGUE_WATER_LEVEL_TYPE, CAPACITIVE_SOIL_MOISTURE_TYPE,
  RESISTIVE_SOIL_MOISTURE_TYPE, createAnalogueMoistureLevelSensor,
} from '../expansion-drafts/analogue-moisture-level-sensors-v1.mjs';
import { CO2_ANALOGUE_TYPE, FLAME_ANALOGUE_TYPE, MQ_GAS_ANALOGUE_TYPE,
  RAIN_ANALOGUE_TYPE, SOUND_LEVEL_ANALOGUE_TYPE, UV_ANALOGUE_TYPE,
  createAnalogueDetectionSensor,
} from '../expansion-drafts/analogue-detection-sensors-v1.mjs';
import { HALL_MAGNETIC_ANALOGUE_TYPE, WIND_DIRECTION_ANALOGUE_TYPE,
  createAnalogueDirectionFieldSensor,
} from '../expansion-drafts/analogue-direction-field-sensors-v1.mjs';
import { LM35_TEMPERATURE_TYPE, TMP36_TEMPERATURE_TYPE,
  createAnalogueTemperatureIcSensor,
} from '../expansion-drafts/analogue-temperature-ic-sensors-v1.mjs';
import { RESISTIVE_DIVIDER_SENSOR_DEFINITIONS,
  createResistiveDividerSensor } from '../expansion-drafts/resistive-divider-sensors-v1.mjs';
import { CONTACT_SENSOR_DEFINITIONS, createContactSensor } from '../expansion-drafts/contact-sensors-v1.mjs';

const ID = /^[a-z][a-z0-9-]{0,47}$/u;
const TYPES = new Set(['board.atmega328p-16mhz-v1', 'resistor.fixed-v1', 'led.basic-v1',
  'button.momentary-v1', 'potentiometer.linear-v1', 'terminal.serial-uart-v1',
  CHARACTER_LCD_TYPE, CHARACTER_LCD_20X4_TYPE, PCF8574_LCD_TYPE,
  POWER_REFERENCE_TYPE,
  SLIDE_SWITCH_TYPE, NC_BUTTON_TYPE, LIMIT_SWITCH_TYPE,
  DIP_SWITCH_4_TYPE, ROTARY_ENCODER_BUTTON_TYPE,
  REED_SWITCH_TYPE, EMERGENCY_STOP_TYPE, FOOT_PEDAL_TYPE,
  ANALOG_JOYSTICK_TYPE, KEYPAD_3X4_TYPE, KEYPAD_4X4_TYPE,
  ROTARY_SELECTOR_TYPE, RGB_COMMON_ANODE_TYPE, LED_BAR_GRAPH_TYPE,
  CAPACITIVE_TOUCH_TYPE, PIR_MOTION_TYPE, HALL_SWITCH_TYPE,
  ...Object.keys(DIGITAL_PULSE_SENSOR_DEFINITIONS),
  IR_OBSTACLE_SENSOR_TYPE, LINE_TRACKING_SENSOR_TYPE,
  RESISTIVE_SOIL_MOISTURE_TYPE, CAPACITIVE_SOIL_MOISTURE_TYPE, ANALOGUE_WATER_LEVEL_TYPE,
  RAIN_ANALOGUE_TYPE, SOUND_LEVEL_ANALOGUE_TYPE, FLAME_ANALOGUE_TYPE,
  MQ_GAS_ANALOGUE_TYPE, CO2_ANALOGUE_TYPE, UV_ANALOGUE_TYPE,
  WIND_DIRECTION_ANALOGUE_TYPE, HALL_MAGNETIC_ANALOGUE_TYPE,
  TMP36_TEMPERATURE_TYPE, LM35_TEMPERATURE_TYPE,
  ...Object.keys(RESISTIVE_DIVIDER_SENSOR_DEFINITIONS),
  ...Object.keys(CONTACT_SENSOR_DEFINITIONS),
  GROUND_REFERENCE_3V3_TYPE, MOMENTARY_BUTTON_3V3_TYPE, POTENTIOMETER_3V3_TYPE, TOGGLE_SWITCH_3V3_TYPE]);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const endpoint = (value) => exact(value, ['component', 'pin']) && ID.test(value.component)
  && /^[A-Z0-9]{1,12}$/u.test(value.pin) ? structuredClone(value) : null;
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
function boundedJunctionId(netId, point) {
  const source = `${netId}-${point.component}-${point.pin}`.toLowerCase();
  let hash = 0x811c9dc5;
  for (const character of source) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 0x01000193); }
  return `junction-${source}`.slice(0, 39).replace(/-+$/u, '')
    + `-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export const API03_PROFILE_MATRIX = Object.freeze({
  'board.atmega328p-16mhz-v1': Object.freeze({ discover: true, read_project: true, edit_circuit: true,
    commands: Object.freeze(['edit.batch', 'edit.undo', 'edit.redo']),
    batchOperations: Object.freeze(['component.add', 'component.duplicate', 'component.remove',
      'component.property.set', 'wire.connect', 'wire.branch.connect', 'wire.disconnect']) }),
  ...Object.fromEntries(['board.rp2040-pico-v1', 'board.esp32-c3-devmodule-v1',
    'board.stm32f429zi-nucleo144-v1'].map((profile) => [profile, Object.freeze({
    discover: true, read_project: true, edit_circuit: true,
    commands: Object.freeze(['edit.batch', 'edit.undo', 'edit.redo']),
    batchOperations: Object.freeze(['component.add', 'component.duplicate', 'component.remove',
      'component.property.set', 'wire.connect', 'wire.branch.connect', 'wire.disconnect']),
  })])),
});

export function summarizeApiChanges(operations) {
  return operations.map((operation) => Object.freeze(operation.command.startsWith('component.')
    ? { operation: operation.command, component_id: operation.id ?? operation.component_id }
    : { operation: operation.command, net_id: operation.net_id,
      ...(operation.endpoint ? { endpoint: structuredClone(operation.endpoint) } : {}) }));
}

export function prepareApiBatch(project, operations) {
  if (!project?.circuit || !Array.isArray(operations) || !operations.length || operations.length > 16) {
    fail('API_BATCH_SHAPE');
  }
  return operations.map((operation) => {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) fail('API_BATCH_COMMAND_SHAPE');
    if (operation.command === 'component.add') {
      if (!exact(operation, ['command', 'id', 'type', 'position']) || !ID.test(operation.id)
          || !TYPES.has(operation.type) || !exact(operation.position, ['x', 'y', 'rotation'])) fail('API_COMPONENT_ADD_SHAPE');
      const avr = (project.profile ?? project.boardProfile ?? project.controller?.profile ?? project.circuit?.boardProfile)
        === 'board.atmega328p-16mhz-v1';
      const component = avr && operation.type === PCF8574_LCD_TYPE
        ? createPcf8574LcdComponent(operation.id)
        : avr && operation.type === CHARACTER_LCD_20X4_TYPE ? createCharacterLcd20x4Component(operation.id)
        : avr && operation.type === CHARACTER_LCD_TYPE ? createCharacterLcdComponent(operation.id)
        : avr && operation.type === POWER_REFERENCE_TYPE ? createPowerReferenceComponent(operation.id)
        : avr && [SLIDE_SWITCH_TYPE, NC_BUTTON_TYPE, LIMIT_SWITCH_TYPE].includes(operation.type)
          ? createMechanicalInputComponent(operation.type, operation.id)
        : avr && [DIP_SWITCH_4_TYPE, ROTARY_ENCODER_BUTTON_TYPE].includes(operation.type)
          ? createAdvancedSwitchInput(operation.type, operation.id)
        : avr && [REED_SWITCH_TYPE, EMERGENCY_STOP_TYPE, FOOT_PEDAL_TYPE].includes(operation.type)
          ? createSafetyPedalInput(operation.type, operation.id)
        : avr && [ANALOG_JOYSTICK_TYPE, KEYPAD_3X4_TYPE, KEYPAD_4X4_TYPE].includes(operation.type)
          ? createJoystickKeypad(operation.type, operation.id)
        : avr && [ROTARY_SELECTOR_TYPE, RGB_COMMON_ANODE_TYPE, LED_BAR_GRAPH_TYPE].includes(operation.type)
          ? createRotarySelectorIndicator(operation.type, operation.id)
        : avr && [CAPACITIVE_TOUCH_TYPE, PIR_MOTION_TYPE, HALL_SWITCH_TYPE].includes(operation.type)
          ? createDigitalPresenceSensor(operation.type, operation.id)
        : avr && DIGITAL_PULSE_SENSOR_DEFINITIONS[operation.type]
          ? createDigitalPulseSensor(operation.type, operation.id)
        : avr && [IR_OBSTACLE_SENSOR_TYPE, LINE_TRACKING_SENSOR_TYPE].includes(operation.type)
          ? createDigitalReflectiveSensor(operation.type, operation.id)
        : avr && [RESISTIVE_SOIL_MOISTURE_TYPE, CAPACITIVE_SOIL_MOISTURE_TYPE,
          ANALOGUE_WATER_LEVEL_TYPE].includes(operation.type)
          ? createAnalogueMoistureLevelSensor(operation.type, operation.id)
        : avr && [RAIN_ANALOGUE_TYPE, SOUND_LEVEL_ANALOGUE_TYPE, FLAME_ANALOGUE_TYPE,
          MQ_GAS_ANALOGUE_TYPE, CO2_ANALOGUE_TYPE, UV_ANALOGUE_TYPE]
          .includes(operation.type)
          ? createAnalogueDetectionSensor(operation.type, operation.id)
        : avr && [WIND_DIRECTION_ANALOGUE_TYPE, HALL_MAGNETIC_ANALOGUE_TYPE]
          .includes(operation.type)
          ? createAnalogueDirectionFieldSensor(operation.type, operation.id)
        : avr && [TMP36_TEMPERATURE_TYPE, LM35_TEMPERATURE_TYPE].includes(operation.type)
          ? createAnalogueTemperatureIcSensor(operation.type, operation.id)
        : avr && RESISTIVE_DIVIDER_SENSOR_DEFINITIONS[operation.type]
          ? createResistiveDividerSensor(operation.type, operation.id)
        : avr && CONTACT_SENSOR_DEFINITIONS[operation.type]
          ? createContactSensor(operation.type, operation.id)
        : avr ? createComponent(operation.id, operation.type) : { id: operation.id, type: operation.type };
      return { type: 'component.add', component,
        position: structuredClone(operation.position) };
    }
    if (operation.command === 'component.duplicate') {
      if (!exact(operation, ['command', 'component_id', 'id', 'position'])
          || !ID.test(operation.component_id) || !ID.test(operation.id)
          || operation.component_id === operation.id
          || !exact(operation.position, ['x', 'y', 'rotation'])) fail('API_COMPONENT_DUPLICATE_SHAPE');
      return { type: 'component.duplicate', sourceId: operation.component_id, newId: operation.id,
        position: structuredClone(operation.position) };
    }
    if (operation.command === 'component.remove') {
      if (!exact(operation, ['command', 'component_id']) || !ID.test(operation.component_id)) fail('API_COMPONENT_REMOVE_SHAPE');
      return { type: 'component.remove', componentId: operation.component_id };
    }
    if (operation.command === 'component.property.set') {
      if (!exact(operation, ['command', 'component_id', 'key', 'value']) || !ID.test(operation.component_id)
          || !/^[a-z][A-Za-z0-9]{0,31}$/u.test(operation.key)) fail('API_PROPERTY_SHAPE');
      return { type: 'component.property.set', componentId: operation.component_id,
        key: operation.key, value: structuredClone(operation.value) };
    }
    if (operation.command === 'wire.connect') {
      const from = endpoint(operation.from); const to = endpoint(operation.to);
      if (!exact(operation, ['command', 'net_id', 'from', 'to']) || !ID.test(operation.net_id)
          || !from || !to || `${from.component}.${from.pin}` === `${to.component}.${to.pin}`) fail('API_WIRE_CONNECT_SHAPE');
      return { type: 'wire.create', net: { id: operation.net_id, endpoints: [from, to] } };
    }
    if (operation.command === 'wire.branch.connect') {
      const point = endpoint(operation.endpoint);
      if (!exact(operation, ['command', 'net_id', 'endpoint']) || !ID.test(operation.net_id) || !point) {
        fail('API_WIRE_BRANCH_CONNECT_SHAPE');
      }
      return { type: 'wire.branch', netId: operation.net_id, endpoint: point,
        junctionId: boundedJunctionId(operation.net_id, point) };
    }
    if (operation.command === 'wire.disconnect') {
      if (exact(operation, ['command', 'net_id']) && ID.test(operation.net_id)) {
        return { type: 'wire.delete', netId: operation.net_id };
      }
      const point = endpoint(operation.endpoint);
      if (!exact(operation, ['command', 'net_id', 'endpoint']) || !ID.test(operation.net_id) || !point) {
        fail('API_WIRE_DISCONNECT_SHAPE');
      }
      return { type: 'wire.branch.delete', netId: operation.net_id, endpoint: point };
    }
    fail('API_COMMAND_UNSUPPORTED');
  });
}
