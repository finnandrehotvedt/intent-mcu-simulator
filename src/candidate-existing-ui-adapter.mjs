// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  openPortableEditorSession,
} from './candidate-project-session.mjs';
import {
  GROUND_REFERENCE_DEFINITION,
  GROUND_REFERENCE_TYPE,
  createGroundReferenceComponent,
} from '../expansion-drafts/ground-reference-integration-v1.mjs';
import { createGroundReferenceArtwork } from '../expansion-drafts/ground-reference-artwork-v1.mjs';
import {
  POWER_REFERENCE_DEFINITION,
  POWER_REFERENCE_TYPE,
  createPowerReferenceComponent,
} from '../expansion-drafts/power-reference-integration-v1.mjs';
import { createPowerReferenceArtwork } from '../expansion-drafts/power-reference-artwork-v1.mjs';
import {
  SPDT_CONTACT_DEFINITION,
  SPDT_CONTACT_TYPE,
  createSwitchContactComponent,
} from '../expansion-drafts/switch-contact-graph-v1.mjs';
import { createSwitchContactArtwork } from '../expansion-drafts/switch-contact-artwork-v1.mjs';
import {
  TOGGLE_SWITCH_DEFINITION,
  TOGGLE_SWITCH_TYPE,
  createToggleSwitchComponent,
} from '../expansion-drafts/toggle-switch-integration-v1.mjs';
import { createToggleSwitchArtwork } from '../expansion-drafts/toggle-switch-artwork-v1.mjs';
import {
  LIMIT_SWITCH_TYPE, MECHANICAL_INPUT_DEFINITIONS, NC_BUTTON_TYPE, SLIDE_SWITCH_TYPE,
  createMechanicalInputComponent,
} from '../expansion-drafts/mechanical-inputs-v1.mjs';
import { createMechanicalInputArtwork } from '../expansion-drafts/mechanical-inputs-artwork-v1.mjs';
import { ADVANCED_SWITCH_INPUT_DEFINITIONS, DIP_SWITCH_4_TYPE, ROTARY_ENCODER_BUTTON_TYPE,
  createAdvancedSwitchInput } from '../expansion-drafts/advanced-switch-inputs-v1.mjs';
import { createAdvancedSwitchInputArtwork } from '../expansion-drafts/advanced-switch-inputs-artwork-v1.mjs';
import { EMERGENCY_STOP_TYPE, FOOT_PEDAL_TYPE, REED_SWITCH_TYPE,
  SAFETY_PEDAL_INPUT_DEFINITIONS, createSafetyPedalInput } from '../expansion-drafts/safety-pedal-inputs-v1.mjs';
import { createSafetyPedalInputArtwork } from '../expansion-drafts/safety-pedal-inputs-artwork-v1.mjs';
import { ANALOG_JOYSTICK_TYPE, JOYSTICK_KEYPAD_DEFINITIONS,
  createJoystickKeypad } from '../expansion-drafts/joystick-keypads-v1.mjs';
import { createJoystickKeypadArtwork } from '../expansion-drafts/joystick-keypads-artwork-v1.mjs';
import { ROTARY_SELECTOR_INDICATOR_DEFINITIONS, ROTARY_SELECTOR_TYPE,
  createRotarySelectorIndicator } from '../expansion-drafts/rotary-selector-indicators-v1.mjs';
import { createRotarySelectorIndicatorArtwork } from '../expansion-drafts/rotary-selector-indicators-artwork-v1.mjs';
import {
  LIGHT_ANALOGUE_SENSOR_DEFINITION,
  LIGHT_ANALOGUE_SENSOR_TYPE,
  createLightAnalogueSensorComponent,
} from '../expansion-drafts/light-analogue-sensor-v1.mjs';
import { createLightAnalogueSensorArtwork } from '../expansion-drafts/light-analogue-sensor-artwork-v1.mjs';
import {
  TEMPERATURE_ANALOGUE_SENSOR_DEFINITION,
  TEMPERATURE_ANALOGUE_SENSOR_TYPE,
  TEMPERATURE_MAX_C,
  TEMPERATURE_MIN_C,
  createTemperatureAnalogueSensorComponent,
  temperatureCToVoltage,
} from '../expansion-drafts/temperature-analogue-sensor-v1.mjs';
import { createTemperatureAnalogueSensorArtwork } from '../expansion-drafts/temperature-analogue-sensor-artwork-v1.mjs';
import {
  DIGITAL_LIGHT_THRESHOLD_DEFINITION,
  DIGITAL_LIGHT_THRESHOLD_TYPE,
  createDigitalLightThresholdComponent,
  updateDigitalLightThresholdControl,
} from '../expansion-drafts/digital-light-threshold-module-v1.mjs';
import { createDigitalLightThresholdArtwork } from '../expansion-drafts/digital-light-threshold-artwork-v1.mjs';
import {
  COMMON_CATHODE_RGB_LED_DEFINITION,
  COMMON_CATHODE_RGB_LED_TYPE,
  createCommonCathodeRgbLedComponent,
} from '../expansion-drafts/common-cathode-rgb-led-v1.mjs';
import { createCommonCathodeRgbLedArtwork } from '../expansion-drafts/common-cathode-rgb-led-artwork-v1.mjs';
import {
  ACTIVE_BUZZER_DEFINITION,
  ACTIVE_BUZZER_TYPE,
  createActiveBuzzerComponent,
} from '../expansion-drafts/active-buzzer-module-v1.mjs';
import { createActiveBuzzerArtwork } from '../expansion-drafts/active-buzzer-artwork-v1.mjs';
import {
  SEVEN_SEGMENT_DEFINITION,
  SEVEN_SEGMENT_TYPE,
  createSevenSegmentComponent,
} from '../expansion-drafts/seven-segment-common-cathode-v1.mjs';
import { createSevenSegmentArtwork } from '../expansion-drafts/seven-segment-common-cathode-artwork-v1.mjs';
import {
  CHARACTER_LCD_DEFINITION,
  CHARACTER_LCD_TYPE,
  createCharacterLcdComponent,
} from '../expansion-drafts/character-lcd-16x2-4bit-v1.mjs';
import { createCharacterLcdArtwork } from '../expansion-drafts/character-lcd-16x2-4bit-artwork-v1.mjs';
import {
  CHARACTER_LCD_20X4_DEFINITION,
  CHARACTER_LCD_20X4_TYPE,
  createCharacterLcd20x4Component,
} from '../expansion-drafts/character-lcd-20x4-4bit-v1.mjs';
import { createCharacterLcd20x4Artwork } from '../expansion-drafts/character-lcd-20x4-4bit-artwork-v1.mjs';
import {
  PCF8574_LCD_DEFINITION,
  PCF8574_LCD_TYPE,
  createPcf8574LcdComponent,
} from '../expansion-drafts/pcf8574-lcd-backpack-v1.mjs';
import { createPcf8574LcdArtwork } from '../expansion-drafts/pcf8574-lcd-backpack-artwork-v1.mjs';
import {
  ROTARY_ENCODER_DEFINITION,
  ROTARY_ENCODER_TYPE,
  createRotaryEncoderComponent,
  rotaryEncoderDigitalSequence,
} from '../expansion-drafts/rotary-encoder-quadrature-v1.mjs';
import { createRotaryEncoderArtwork } from '../expansion-drafts/rotary-encoder-quadrature-artwork-v1.mjs';
import {
  CAPACITIVE_TOUCH_TYPE,
  DIGITAL_PRESENCE_SENSOR_DEFINITIONS,
  HALL_SWITCH_TYPE,
  PIR_MOTION_TYPE,
  createDigitalPresenceSensor,
} from '../expansion-drafts/digital-presence-sensors-v1.mjs';
import { createDigitalPresenceSensorArtwork } from '../expansion-drafts/digital-presence-sensors-artwork-v1.mjs';
import { DIGITAL_PULSE_SENSOR_DEFINITIONS, createDigitalPulseSensor } from '../expansion-drafts/digital-pulse-sensors-v1.mjs';
import { createDigitalPulseSensorArtwork } from '../expansion-drafts/digital-pulse-sensors-artwork-v1.mjs';
import {
  DIGITAL_REFLECTIVE_SENSOR_DEFINITIONS,
  IR_OBSTACLE_SENSOR_TYPE,
  LINE_TRACKING_SENSOR_TYPE,
  createDigitalReflectiveSensor,
} from '../expansion-drafts/digital-reflective-sensors-v1.mjs';
import { createDigitalReflectiveSensorArtwork } from '../expansion-drafts/digital-reflective-sensors-artwork-v1.mjs';
import {
  ANALOGUE_MOISTURE_LEVEL_DEFINITIONS,
  ANALOGUE_WATER_LEVEL_TYPE,
  CAPACITIVE_SOIL_MOISTURE_TYPE,
  RESISTIVE_SOIL_MOISTURE_TYPE,
  createAnalogueMoistureLevelSensor,
} from '../expansion-drafts/analogue-moisture-level-sensors-v1.mjs';
import { createAnalogueMoistureLevelArtwork } from '../expansion-drafts/analogue-moisture-level-sensors-artwork-v1.mjs';
import {
  ANALOGUE_DETECTION_DEFINITIONS,
  createAnalogueDetectionSensor,
} from '../expansion-drafts/analogue-detection-sensors-v1.mjs';
import { createAnalogueDetectionArtwork } from '../expansion-drafts/analogue-detection-sensors-artwork-v1.mjs';
import {
  ANALOGUE_DIRECTION_FIELD_DEFINITIONS,
  HALL_MAGNETIC_ANALOGUE_TYPE,
  WIND_DIRECTION_ANALOGUE_TYPE,
  analogueDirectionFieldVoltage,
  createAnalogueDirectionFieldSensor,
} from '../expansion-drafts/analogue-direction-field-sensors-v1.mjs';
import { createAnalogueDirectionFieldArtwork } from '../expansion-drafts/analogue-direction-field-sensors-artwork-v1.mjs';
import {
  ANALOGUE_TEMPERATURE_IC_DEFINITIONS,
  analogueTemperatureIcVoltage,
  createAnalogueTemperatureIcSensor,
} from '../expansion-drafts/analogue-temperature-ic-sensors-v1.mjs';
import { createAnalogueTemperatureIcArtwork } from '../expansion-drafts/analogue-temperature-ic-sensors-artwork-v1.mjs';
import { RESISTIVE_DIVIDER_SENSOR_DEFINITIONS, createResistiveDividerSensor,
  resistiveDividerSensorVoltage } from '../expansion-drafts/resistive-divider-sensors-v1.mjs';
import { createResistiveDividerSensorArtwork } from '../expansion-drafts/resistive-divider-sensors-artwork-v1.mjs';
import { PASSIVE_ENERGY_STORAGE_DEFINITIONS,
  createPassiveEnergyStorageComponent } from '../expansion-drafts/passive-energy-storage-components-v1.mjs';
import { createPassiveEnergyStorageArtwork } from '../expansion-drafts/passive-energy-storage-components-artwork-v1.mjs';
import { DIODE_COMPONENT_DEFINITIONS,
  createDiodeComponent } from '../expansion-drafts/diode-components-v1.mjs';
import { createDiodeArtwork } from '../expansion-drafts/diode-components-artwork-v1.mjs';
import { TRANSISTOR_COMPONENT_DEFINITIONS,
  createTransistorComponent } from '../expansion-drafts/transistor-components-v1.mjs';
import { createTransistorArtwork } from '../expansion-drafts/transistor-components-artwork-v1.mjs';
import { CIRCUIT_PROTECTION_DEFINITIONS,
  createCircuitProtectionComponent } from '../expansion-drafts/circuit-protection-components-v1.mjs';
import { createCircuitProtectionArtwork } from '../expansion-drafts/circuit-protection-components-artwork-v1.mjs';
import { CONNECTION_HARDWARE_DEFINITIONS,
  createConnectionHardwareComponent } from '../expansion-drafts/connection-hardware-components-v1.mjs';
import { createConnectionHardwareArtwork } from '../expansion-drafts/connection-hardware-components-artwork-v1.mjs';
import { SEMICONDUCTOR_ACTIVE_DEFINITIONS,
  createSemiconductorActiveComponent } from '../expansion-drafts/semiconductor-active-components-v1.mjs';
import { createSemiconductorActiveArtwork } from '../expansion-drafts/semiconductor-active-components-artwork-v1.mjs';
import { CONTACT_SENSOR_DEFINITIONS, createContactSensor } from '../expansion-drafts/contact-sensors-v1.mjs';
import { createContactSensorArtwork } from '../expansion-drafts/contact-sensors-artwork-v1.mjs';

export const CANDIDATE_EXISTING_UI_ADAPTER_SCHEMA = 'intent-mcu-candidate-existing-ui@1';

const clone = (value) => structuredClone(value);
const failure = (code, details = []) => ({ ok: false, code, details });

const SPDT_UI_DEFINITION = Object.freeze({
  family: 'input.changeover-contact',
  variant: 'spdt-latching-break-before-make',
  type: SPDT_CONTACT_TYPE,
  version: 1,
  displayName: SPDT_CONTACT_DEFINITION.displayName,
  manufacturer: 'Generic',
  partNumber: 'SW-CHANGEOVER-SPDT-BBM',
  pins: SPDT_CONTACT_DEFINITION.terminals,
  propertyKeys: Object.freeze(['transitionPolicy']),
  propertySchema: Object.freeze({
    transitionPolicy: Object.freeze({ kind: 'enum', values: Object.freeze(['break-before-make']), default: 'break-before-make' }),
  }),
  controlKeys: Object.freeze(['selectedThrow']),
  modelRef: 'model.switch-changeover-spdt-v1',
  internalTerminalGroups: Object.freeze([]),
  selectable: true,
  artwork: Object.freeze({ ...SPDT_CONTACT_DEFINITION.artwork, thumbnail: SPDT_CONTACT_DEFINITION.artwork.renderer }),
  catalog: Object.freeze({
    category: 'inputs',
    aliases: Object.freeze(['changeover switch', 'selector switch', 'spdt contact']),
    functions: Object.freeze(['digital input selection', 'maintained contact']),
    interfaces: Object.freeze(['GPIO']),
    supplyVolts: Object.freeze({ min: 0, max: 5 }),
    package: 'virtual SPDT changeover',
  }),
  support: Object.freeze({
    status: 'partial',
    limitations: Object.freeze([
      'Only one AVR digital-input COM selecting a direct GND or 5 V throw is simulated.',
      'BREAK uses the INPUT_PULLUP release level; generic high-impedance and analogue contact networks are rejected.',
      'No bounce, resistance, delay, arcing, current rating or output-drive inference is modelled.',
    ]),
  }),
});

export const CANDIDATE_UI_COMPONENTS = Object.freeze({
  [GROUND_REFERENCE_TYPE]: GROUND_REFERENCE_DEFINITION,
  [POWER_REFERENCE_TYPE]: POWER_REFERENCE_DEFINITION,
  [TOGGLE_SWITCH_TYPE]: TOGGLE_SWITCH_DEFINITION,
  ...MECHANICAL_INPUT_DEFINITIONS,
  ...ADVANCED_SWITCH_INPUT_DEFINITIONS,
  ...SAFETY_PEDAL_INPUT_DEFINITIONS,
  ...JOYSTICK_KEYPAD_DEFINITIONS,
  ...ROTARY_SELECTOR_INDICATOR_DEFINITIONS,
  [SPDT_CONTACT_TYPE]: SPDT_UI_DEFINITION,
  [LIGHT_ANALOGUE_SENSOR_TYPE]: LIGHT_ANALOGUE_SENSOR_DEFINITION,
  [TEMPERATURE_ANALOGUE_SENSOR_TYPE]: TEMPERATURE_ANALOGUE_SENSOR_DEFINITION,
  [DIGITAL_LIGHT_THRESHOLD_TYPE]: DIGITAL_LIGHT_THRESHOLD_DEFINITION,
  [COMMON_CATHODE_RGB_LED_TYPE]: COMMON_CATHODE_RGB_LED_DEFINITION,
  [ACTIVE_BUZZER_TYPE]: ACTIVE_BUZZER_DEFINITION,
  [SEVEN_SEGMENT_TYPE]: SEVEN_SEGMENT_DEFINITION,
  [CHARACTER_LCD_TYPE]: CHARACTER_LCD_DEFINITION,
  [CHARACTER_LCD_20X4_TYPE]: CHARACTER_LCD_20X4_DEFINITION,
  [PCF8574_LCD_TYPE]: PCF8574_LCD_DEFINITION,
  [ROTARY_ENCODER_TYPE]: ROTARY_ENCODER_DEFINITION,
  ...DIGITAL_PRESENCE_SENSOR_DEFINITIONS,
  ...DIGITAL_PULSE_SENSOR_DEFINITIONS,
  ...DIGITAL_REFLECTIVE_SENSOR_DEFINITIONS,
  ...ANALOGUE_MOISTURE_LEVEL_DEFINITIONS,
  ...ANALOGUE_DETECTION_DEFINITIONS,
  ...ANALOGUE_DIRECTION_FIELD_DEFINITIONS,
  ...ANALOGUE_TEMPERATURE_IC_DEFINITIONS,
  ...RESISTIVE_DIVIDER_SENSOR_DEFINITIONS,
  ...PASSIVE_ENERGY_STORAGE_DEFINITIONS,
  ...DIODE_COMPONENT_DEFINITIONS,
  ...TRANSISTOR_COMPONENT_DEFINITIONS,
  ...CIRCUIT_PROTECTION_DEFINITIONS,
  ...CONNECTION_HARDWARE_DEFINITIONS,
  ...SEMICONDUCTOR_ACTIVE_DEFINITIONS,
  ...CONTACT_SENSOR_DEFINITIONS,
});

export function candidateUiDefinition(type) {
  return CANDIDATE_UI_COMPONENTS[type] ?? null;
}

export function createCandidateUiArtwork(documentObject, definition, component, options = {}) {
  if (component?.type === GROUND_REFERENCE_TYPE) {
    return createGroundReferenceArtwork(documentObject, definition, component, options);
  }
  if (component?.type === POWER_REFERENCE_TYPE) {
    return createPowerReferenceArtwork(documentObject, definition, component, options);
  }
  if (component?.type === TOGGLE_SWITCH_TYPE) {
    return createToggleSwitchArtwork(documentObject, definition, component, options);
  }
  if ([SLIDE_SWITCH_TYPE, NC_BUTTON_TYPE, LIMIT_SWITCH_TYPE].includes(component?.type)) {
    return createMechanicalInputArtwork(documentObject, definition, component, options);
  }
  if ([DIP_SWITCH_4_TYPE, ROTARY_ENCODER_BUTTON_TYPE].includes(component?.type)) {
    return createAdvancedSwitchInputArtwork(documentObject, definition, component, options);
  }
  if ([REED_SWITCH_TYPE, EMERGENCY_STOP_TYPE, FOOT_PEDAL_TYPE].includes(component?.type)) {
    return createSafetyPedalInputArtwork(documentObject, definition, component, options);
  }
  if (JOYSTICK_KEYPAD_DEFINITIONS[component?.type]) return createJoystickKeypadArtwork(documentObject, definition, component, options);
  if (ROTARY_SELECTOR_INDICATOR_DEFINITIONS[component?.type]) {
    return createRotarySelectorIndicatorArtwork(documentObject, definition, component, options);
  }
  if (component?.type === SPDT_CONTACT_TYPE) {
    return createSwitchContactArtwork(documentObject, definition, component.controls.selectedThrow, options);
  }
  if (component?.type === LIGHT_ANALOGUE_SENSOR_TYPE) {
    return createLightAnalogueSensorArtwork(documentObject, definition, component, options);
  }
  if (component?.type === TEMPERATURE_ANALOGUE_SENSOR_TYPE) {
    return createTemperatureAnalogueSensorArtwork(documentObject, definition, component, options);
  }
  if (component?.type === DIGITAL_LIGHT_THRESHOLD_TYPE) {
    return createDigitalLightThresholdArtwork(documentObject, definition, component, options);
  }
  if (component?.type === COMMON_CATHODE_RGB_LED_TYPE) {
    return createCommonCathodeRgbLedArtwork(documentObject, definition, component, options);
  }
  if (component?.type === ACTIVE_BUZZER_TYPE) {
    return createActiveBuzzerArtwork(documentObject, definition, component, options);
  }
  if (component?.type === SEVEN_SEGMENT_TYPE) {
    return createSevenSegmentArtwork(documentObject, definition, component, options);
  }
  if (component?.type === CHARACTER_LCD_TYPE) {
    return createCharacterLcdArtwork(documentObject, definition, component, options);
  }
  if (component?.type === CHARACTER_LCD_20X4_TYPE) {
    return createCharacterLcd20x4Artwork(documentObject, definition, component, options);
  }
  if (component?.type === PCF8574_LCD_TYPE) {
    return createPcf8574LcdArtwork(documentObject, definition, component, options);
  }
  if (component?.type === ROTARY_ENCODER_TYPE) {
    return createRotaryEncoderArtwork(documentObject, definition, component, options);
  }
  if (DIGITAL_PRESENCE_SENSOR_DEFINITIONS[component?.type]) {
    return createDigitalPresenceSensorArtwork(documentObject, definition, component, options);
  }
  if (DIGITAL_PULSE_SENSOR_DEFINITIONS[component?.type]) {
    return createDigitalPulseSensorArtwork(documentObject, definition, component, options);
  }
  if (DIGITAL_REFLECTIVE_SENSOR_DEFINITIONS[component?.type]) {
    return createDigitalReflectiveSensorArtwork(documentObject, definition, component, options);
  }
  if (ANALOGUE_MOISTURE_LEVEL_DEFINITIONS[component?.type]) {
    return createAnalogueMoistureLevelArtwork(documentObject, definition, component, options);
  }
  if (ANALOGUE_DETECTION_DEFINITIONS[component?.type]) {
    return createAnalogueDetectionArtwork(documentObject, definition, component, options);
  }
  if (ANALOGUE_DIRECTION_FIELD_DEFINITIONS[component?.type]) {
    return createAnalogueDirectionFieldArtwork(documentObject, definition, component, options);
  }
  if (ANALOGUE_TEMPERATURE_IC_DEFINITIONS[component?.type]) {
    return createAnalogueTemperatureIcArtwork(documentObject, definition, component, options);
  }
  if (RESISTIVE_DIVIDER_SENSOR_DEFINITIONS[component?.type]) {
    return createResistiveDividerSensorArtwork(documentObject, definition, component, options);
  }
  if (PASSIVE_ENERGY_STORAGE_DEFINITIONS[component?.type]) {
    return createPassiveEnergyStorageArtwork(documentObject, definition, component, options);
  }
  if (DIODE_COMPONENT_DEFINITIONS[component?.type]) {
    return createDiodeArtwork(documentObject, definition, component, options);
  }
  if (TRANSISTOR_COMPONENT_DEFINITIONS[component?.type]) {
    return createTransistorArtwork(documentObject, definition, component, options);
  }
  if (CIRCUIT_PROTECTION_DEFINITIONS[component?.type]) {
    return createCircuitProtectionArtwork(documentObject, definition, component, options);
  }
  if (CONNECTION_HARDWARE_DEFINITIONS[component?.type]) {
    return createConnectionHardwareArtwork(documentObject, definition, component, options);
  }
  if (SEMICONDUCTOR_ACTIVE_DEFINITIONS[component?.type]) {
    return createSemiconductorActiveArtwork(documentObject, definition, component, options);
  }
  if (CONTACT_SENSOR_DEFINITIONS[component?.type]) {
    return createContactSensorArtwork(documentObject, definition, component, options);
  }
  throw new TypeError('CANDIDATE_UI_COMPONENT');
}

export function createCandidateUiComponent(type, id) {
  if (type === GROUND_REFERENCE_TYPE) return createGroundReferenceComponent(id);
  if (type === POWER_REFERENCE_TYPE) return createPowerReferenceComponent(id);
  if (type === TOGGLE_SWITCH_TYPE) return createToggleSwitchComponent(id);
  if ([SLIDE_SWITCH_TYPE, NC_BUTTON_TYPE, LIMIT_SWITCH_TYPE].includes(type)) {
    return createMechanicalInputComponent(type, id);
  }
  if ([DIP_SWITCH_4_TYPE, ROTARY_ENCODER_BUTTON_TYPE].includes(type)) {
    return createAdvancedSwitchInput(type, id);
  }
  if ([REED_SWITCH_TYPE, EMERGENCY_STOP_TYPE, FOOT_PEDAL_TYPE].includes(type)) {
    return createSafetyPedalInput(type, id);
  }
  if (JOYSTICK_KEYPAD_DEFINITIONS[type]) return createJoystickKeypad(type, id);
  if (ROTARY_SELECTOR_INDICATOR_DEFINITIONS[type]) return createRotarySelectorIndicator(type, id);
  if (type === SPDT_CONTACT_TYPE) return createSwitchContactComponent(id, 'SPDT changeover contact', { selectedThrow: 'A' });
  if (type === LIGHT_ANALOGUE_SENSOR_TYPE) return createLightAnalogueSensorComponent(id);
  if (type === TEMPERATURE_ANALOGUE_SENSOR_TYPE) return createTemperatureAnalogueSensorComponent(id);
  if (type === DIGITAL_LIGHT_THRESHOLD_TYPE) return createDigitalLightThresholdComponent(id);
  if (type === COMMON_CATHODE_RGB_LED_TYPE) return createCommonCathodeRgbLedComponent(id);
  if (type === ACTIVE_BUZZER_TYPE) return createActiveBuzzerComponent(id);
  if (type === SEVEN_SEGMENT_TYPE) return createSevenSegmentComponent(id);
  if (type === CHARACTER_LCD_TYPE) return createCharacterLcdComponent(id);
  if (type === CHARACTER_LCD_20X4_TYPE) return createCharacterLcd20x4Component(id);
  if (type === PCF8574_LCD_TYPE) return createPcf8574LcdComponent(id);
  if (type === ROTARY_ENCODER_TYPE) return createRotaryEncoderComponent(id);
  if (DIGITAL_PRESENCE_SENSOR_DEFINITIONS[type]) return createDigitalPresenceSensor(type, id);
  if (DIGITAL_PULSE_SENSOR_DEFINITIONS[type]) return createDigitalPulseSensor(type, id);
  if (DIGITAL_REFLECTIVE_SENSOR_DEFINITIONS[type]) return createDigitalReflectiveSensor(type, id);
  if (ANALOGUE_MOISTURE_LEVEL_DEFINITIONS[type]) return createAnalogueMoistureLevelSensor(type, id);
  if (ANALOGUE_DETECTION_DEFINITIONS[type]) return createAnalogueDetectionSensor(type, id);
  if (ANALOGUE_DIRECTION_FIELD_DEFINITIONS[type]) return createAnalogueDirectionFieldSensor(type, id);
  if (ANALOGUE_TEMPERATURE_IC_DEFINITIONS[type]) return createAnalogueTemperatureIcSensor(type, id);
  if (RESISTIVE_DIVIDER_SENSOR_DEFINITIONS[type]) return createResistiveDividerSensor(type, id);
  if (PASSIVE_ENERGY_STORAGE_DEFINITIONS[type]) return createPassiveEnergyStorageComponent(type, id);
  if (DIODE_COMPONENT_DEFINITIONS[type]) return createDiodeComponent(type, id);
  if (TRANSISTOR_COMPONENT_DEFINITIONS[type]) return createTransistorComponent(type, id);
  if (CIRCUIT_PROTECTION_DEFINITIONS[type]) return createCircuitProtectionComponent(type, id);
  if (CONNECTION_HARDWARE_DEFINITIONS[type]) return createConnectionHardwareComponent(type, id);
  if (SEMICONDUCTOR_ACTIVE_DEFINITIONS[type]) return createSemiconductorActiveComponent(type, id);
  if (CONTACT_SENSOR_DEFINITIONS[type]) return createContactSensor(type, id);
  throw new TypeError('CANDIDATE_UI_COMPONENT_TYPE');
}

export function openCandidateUiSession(source, options = {}) {
  const opened = openPortableEditorSession(source, options);
  if (!opened.ok) return opened;
  if (opened.kind !== 'candidate-project-v3') return failure('CANDIDATE_UI_PROJECT_VERSION');
  return { ...opened, schema: CANDIDATE_EXISTING_UI_ADAPTER_SCHEMA };
}

export function candidateRuntimeInputs(session) {
  if (session?.kind !== 'candidate-project-v3') return [];
  const runnable = session.runnable;
  if (!runnable.ok) throw Object.assign(new Error(runnable.code), { code: runnable.code, details: runnable.details });
  const runtimeGraph = session.runtimeProject?.circuit;
  const board = runtimeGraph?.components?.find((component) => component.type === 'board.atmega328p-16mhz-v1');
  const fixedReferences = board ? runtimeGraph.nets.flatMap((net) => {
    const boardPins = net.endpoints.filter((endpoint) => endpoint.component === board.id).map((endpoint) => endpoint.pin);
    const sourcePin = boardPins.includes('5V') ? '5V'
      : boardPins.some((pin) => /^GND[1-3]$/u.test(pin)) ? 'GND' : null;
    if (!sourcePin) return [];
    return boardPins.filter((pin) => /^D(?:[0-9]|1[0-3])$/u.test(pin)).map((pinLabel) => ({
      componentId: board.id,
      pin: Number(pinLabel.slice(1)),
      pinLabel,
      level: sourcePin === '5V',
      fixedReference: sourcePin,
    }));
  }).sort((left, right) => left.pin - right.pin) : [];
  const inputs = [...fixedReferences, ...session.runtimeSupport
    .filter((item) => item.type === SPDT_CONTACT_TYPE)
    .map((item) => session.evaluateSpdtRuntime(item.componentId))
    .map((result) => {
      if (!result.ok) throw Object.assign(new Error(result.code), { code: result.code, details: result.details });
      return {
        componentId: result.projection.componentId,
        pin: result.projection.boardPinNumber,
        pinLabel: result.projection.boardPin,
        level: result.projection.level,
        selectedThrow: result.projection.selectedThrow,
      };
    })];
  for (const support of session.runtimeSupport.filter((item) => item.type === ROTARY_ENCODER_TYPE)) {
    const projection = support.runtimeProjection;
    for (const phase of ['A', 'B']) inputs.push({
      componentId: projection.phases[phase].runtimeComponentId,
      pin: projection.phases[phase].boardPinNumber,
      pinLabel: projection.phases[phase].boardPin,
      level: true,
      encoderPhase: phase,
    });
  }
  return clone(inputs);
}

export function candidateContactControl(session, componentId, key, value) {
  if (session?.kind !== 'candidate-project-v3') return failure('CANDIDATE_UI_SESSION');
  const component = session.visualProject.circuit.components.find((item) => item.id === componentId);
  if (!component) return failure('EDITOR_COMPONENT_MISSING', [componentId]);
  if (component.type === TOGGLE_SWITCH_TYPE && key === 'closed' && typeof value === 'boolean') {
    return {
      ok: true,
      command: { type: 'component.control.set', componentId, key, value },
      worker: { command: 'control', componentId, key: 'pressed', value },
    };
  }
  if (component.type === SPDT_CONTACT_TYPE && key === 'selectedThrow' && ['A', 'B'].includes(value)) {
    const transition = session.runnable.ok ? session.createSpdtRuntimeTransition(componentId, value) : null;
    if (transition && !transition.ok) return transition;
    return {
      ok: true,
      command: { type: 'component.control.set', componentId, key, value },
      transition: transition ? clone(transition.transition) : null,
    };
  }
  if (component.type === SLIDE_SWITCH_TYPE && key === 'selectedThrow' && ['A', 'B'].includes(value)) {
    return { ok: true, command: { type: 'component.control.set', componentId, key, value } };
  }
  if (component.type === NC_BUTTON_TYPE && key === 'pressed' && typeof value === 'boolean') {
    return {
      ok: true, command: { type: 'component.control.set', componentId, key, value },
      worker: { command: 'control', componentId, key: 'pressed', value: !value },
    };
  }
  if (component.type === LIMIT_SWITCH_TYPE && key === 'actuated' && typeof value === 'boolean') {
    return { ok: true, command: { type: 'component.control.set', componentId, key, value } };
  }
  if (component.type === DIP_SWITCH_4_TYPE && /^switch[1-4]$/u.test(key)
      && typeof value === 'boolean') {
    return { ok: true, command: { type: 'component.control.set', componentId, key, value } };
  }
  if (component.type === ROTARY_ENCODER_BUTTON_TYPE && key === 'pressed'
      && typeof value === 'boolean') {
    return { ok: true, command: { type: 'component.control.set', componentId, key, value } };
  }
  if (component.type === ROTARY_ENCODER_BUTTON_TYPE && key === 'detent'
      && Number.isInteger(value) && Math.abs(value - component.controls.detent) === 1) {
    return { ok: true, command: { type: 'component.control.set', componentId, key, value },
      direction: value > component.controls.detent ? 'cw' : 'ccw' };
  }
  if (component.type === REED_SWITCH_TYPE && key === 'magnetPresent' && typeof value === 'boolean') {
    return { ok: true, command: { type: 'component.control.set', componentId, key, value } };
  }
  if (component.type === EMERGENCY_STOP_TYPE && key === 'latched' && typeof value === 'boolean') {
    return { ok: true, command: { type: 'component.control.set', componentId, key, value } };
  }
  if (component.type === FOOT_PEDAL_TYPE && key === 'pressed' && typeof value === 'boolean') {
    return { ok: true, command: { type: 'component.control.set', componentId, key, value } };
  }
  if (CONTACT_SENSOR_DEFINITIONS[component.type]
      && key === CONTACT_SENSOR_DEFINITIONS[component.type].controlKeys[0]
      && typeof value === 'boolean') {
    return { ok: true, command: { type: 'component.control.set', componentId, key, value } };
  }
  if ([CAPACITIVE_TOUCH_TYPE, PIR_MOTION_TYPE, HALL_SWITCH_TYPE].includes(component.type)
      && key === DIGITAL_PRESENCE_SENSOR_DEFINITIONS[component.type].controlKeys[0]
      && typeof value === 'boolean') {
    return {
      ok: true,
      command: { type: 'component.control.set', componentId, key, value },
      worker: { command: 'control', componentId, key: 'pressed', value: !value },
    };
  }
  if (DIGITAL_PULSE_SENSOR_DEFINITIONS[component.type] && key === 'pulseHigh'
      && typeof value === 'boolean') {
    return { ok: true, command: { type: 'component.control.set', componentId, key, value },
      worker: { command: 'control', componentId, key: 'pressed', value: !value } };
  }
  if ([IR_OBSTACLE_SENSOR_TYPE, LINE_TRACKING_SENSOR_TYPE].includes(component.type)
      && key === DIGITAL_REFLECTIVE_SENSOR_DEFINITIONS[component.type].controlKeys[0]
      && typeof value === 'boolean') {
    return {
      ok: true,
      command: { type: 'component.control.set', componentId, key, value },
      worker: { command: 'control', componentId, key: 'pressed', value },
    };
  }
  if (component.type === ANALOG_JOYSTICK_TYPE && ['x', 'y'].includes(key)
      && Number.isFinite(value) && value >= 0 && value <= 1) {
    return { ok: true, command: { type: 'component.control.set', componentId, key, value },
      worker: { command: 'control', componentId: `${componentId}-${key}`, key: 'position', value } };
  }
  if (component.type === ANALOG_JOYSTICK_TYPE && key === 'pressed' && typeof value === 'boolean') {
    return { ok: true, command: { type: 'component.control.set', componentId, key, value },
      worker: { command: 'control', componentId: `${componentId}-sw`, key: 'pressed', value } };
  }
  if (['input.matrix-keypad-3x4-v1', 'input.matrix-keypad-4x4-v1'].includes(component.type)
      && key === 'pressedKey' && typeof value === 'string') {
    return { ok: true, command: { type: 'component.control.set', componentId, key, value } };
  }
  if (component.type === ROTARY_SELECTOR_TYPE && key === 'position'
      && Number.isInteger(value) && value >= 1 && value <= 4) {
    return { ok: true, command: { type: 'component.control.set', componentId, key, value } };
  }
  if (component.type === LIGHT_ANALOGUE_SENSOR_TYPE && key === 'lightLevel'
      && Number.isFinite(value) && value >= 0 && value <= 1) {
    return {
      ok: true,
      command: { type: 'component.control.set', componentId, key, value },
      worker: { command: 'control', componentId, key: 'position', value },
    };
  }
  if (component.type === TEMPERATURE_ANALOGUE_SENSOR_TYPE && key === 'temperatureC'
      && Number.isFinite(value) && value >= TEMPERATURE_MIN_C && value <= TEMPERATURE_MAX_C) {
    return {
      ok: true,
      command: { type: 'component.control.set', componentId, key, value },
      worker: {
        command: 'control', componentId, key: 'position', value: temperatureCToVoltage(value) / 5,
      },
    };
  }
  if ([RESISTIVE_SOIL_MOISTURE_TYPE, CAPACITIVE_SOIL_MOISTURE_TYPE,
    ANALOGUE_WATER_LEVEL_TYPE].includes(component.type)
      && key === ANALOGUE_MOISTURE_LEVEL_DEFINITIONS[component.type].controlKeys[0]
      && Number.isFinite(value) && value >= 0 && value <= 1) {
    return {
      ok: true,
      command: { type: 'component.control.set', componentId, key, value },
      worker: { command: 'control', componentId, key: 'position', value },
    };
  }
  if (ANALOGUE_DETECTION_DEFINITIONS[component.type]
      && key === ANALOGUE_DETECTION_DEFINITIONS[component.type].controlKeys[0]
      && Number.isFinite(value) && value >= 0 && value <= 1) {
    return {
      ok: true,
      command: { type: 'component.control.set', componentId, key, value },
      worker: { command: 'control', componentId, key: 'position', value },
    };
  }
  if (ANALOGUE_DIRECTION_FIELD_DEFINITIONS[component.type]
      && key === ANALOGUE_DIRECTION_FIELD_DEFINITIONS[component.type].controlKeys[0]) {
    const control = ANALOGUE_DIRECTION_FIELD_DEFINITIONS[component.type].control;
    if (!Number.isFinite(value) || value < control.minimum || value > control.maximum) {
      return failure('PROJECT_CONTACT_ANALOGUE_DIRECTION_FIELD_SENSOR_STATE', [componentId]);
    }
    return {
      ok: true,
      command: { type: 'component.control.set', componentId, key, value },
      worker: { command: 'control', componentId, key: 'position',
        value: analogueDirectionFieldVoltage(component.type, value) / 5 },
    };
  }
  if (ANALOGUE_TEMPERATURE_IC_DEFINITIONS[component.type]
      && key === 'temperatureC') {
    const control = ANALOGUE_TEMPERATURE_IC_DEFINITIONS[component.type].control;
    if (!Number.isFinite(value) || value < control.minimum || value > control.maximum) {
      return failure('PROJECT_CONTACT_ANALOGUE_TEMPERATURE_IC_SENSOR_STATE', [componentId]);
    }
    return {
      ok: true,
      command: { type: 'component.control.set', componentId, key, value },
      worker: { command: 'control', componentId, key: 'position',
        value: analogueTemperatureIcVoltage(component.type, value) / 5 },
    };
  }
  if (RESISTIVE_DIVIDER_SENSOR_DEFINITIONS[component.type]) {
    const definition = RESISTIVE_DIVIDER_SENSOR_DEFINITIONS[component.type];
    const controlKey = definition.controlKeys[0];
    if (key !== controlKey || !Number.isFinite(value)
        || value < definition.control.minimum || value > definition.control.maximum) {
      return failure('PROJECT_CONTACT_RESISTIVE_DIVIDER_SENSOR_STATE', [componentId]);
    }
    return { ok: true,
      command: { type: 'component.control.set', componentId, key, value },
      worker: { command: 'control', componentId, key: 'position',
        value: resistiveDividerSensorVoltage(component.type, value) / 5 } };
  }
  if (component.type === DIGITAL_LIGHT_THRESHOLD_TYPE) {
    try {
      const updated = updateDigitalLightThresholdControl(component, key, value);
      const evaluated = session.evaluateModel(component.type, {
        lightLevelPercent: updated.controls.lightLevelPercent,
        thresholdPercent: updated.controls.thresholdPercent,
        hysteresisPercentagePoints: updated.controls.hysteresisPercentagePoints,
        currentActive: component.controls.outputActive,
      });
      if (!evaluated.ok || evaluated.result.outputActive !== updated.controls.outputActive) {
        return failure('MODEL_LIBRARY_PRODUCTION_MISMATCH', [componentId]);
      }
      return {
        ok: true,
        command: { type: 'component.control.set', componentId, key, value },
        worker: {
          command: 'control', componentId, key: 'pressed',
          value: updated.controls.outputActive,
        },
      };
    } catch { /* exact control rejection below */ }
  }
  if (component.type === ROTARY_ENCODER_TYPE && key === 'detent'
      && Number.isInteger(value) && Math.abs(value - component.controls.detent) === 1) {
    const direction = value > component.controls.detent ? 'cw' : 'ccw';
    const support = session.runtimeSupport.find((item) => item.componentId === componentId);
    const evaluated = session.evaluateModel(component.type, { direction });
    if (!evaluated.ok) return failure(evaluated.code, [componentId]);
    const events = support?.runtimeProjection
      ? rotaryEncoderDigitalSequence(support.runtimeProjection, direction) : null;
    if (events) {
      const states = ['11', ...events.reduce((rows, event, index) => {
        const prior = rows[index - 1] ?? '11';
        const next = prior.split('');
        next[event.pin === support.runtimeProjection.phases.A.boardPinNumber ? 0 : 1] = event.level ? '1' : '0';
        return [...rows, next.join('')];
      }, [])];
      if (JSON.stringify(states) !== JSON.stringify(evaluated.result.states)
          || events.some((event) => event.offsetCycles % evaluated.result.phaseCycles !== 0)) {
        return failure('MODEL_LIBRARY_PRODUCTION_MISMATCH', [componentId]);
      }
    }
    return {
      ok: true,
      command: { type: 'component.control.set', componentId, key, value },
      worker: events ? { command: 'digital-sequence', events } : null,
      direction,
    };
  }
  return failure('CANDIDATE_UI_CONTROL', [componentId, key]);
}
