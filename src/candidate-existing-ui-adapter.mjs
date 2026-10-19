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
  ROTARY_ENCODER_DEFINITION,
  ROTARY_ENCODER_TYPE,
  createRotaryEncoderComponent,
  rotaryEncoderDigitalSequence,
} from '../expansion-drafts/rotary-encoder-quadrature-v1.mjs';
import { createRotaryEncoderArtwork } from '../expansion-drafts/rotary-encoder-quadrature-artwork-v1.mjs';

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
  [TOGGLE_SWITCH_TYPE]: TOGGLE_SWITCH_DEFINITION,
  [SPDT_CONTACT_TYPE]: SPDT_UI_DEFINITION,
  [LIGHT_ANALOGUE_SENSOR_TYPE]: LIGHT_ANALOGUE_SENSOR_DEFINITION,
  [TEMPERATURE_ANALOGUE_SENSOR_TYPE]: TEMPERATURE_ANALOGUE_SENSOR_DEFINITION,
  [DIGITAL_LIGHT_THRESHOLD_TYPE]: DIGITAL_LIGHT_THRESHOLD_DEFINITION,
  [COMMON_CATHODE_RGB_LED_TYPE]: COMMON_CATHODE_RGB_LED_DEFINITION,
  [ACTIVE_BUZZER_TYPE]: ACTIVE_BUZZER_DEFINITION,
  [SEVEN_SEGMENT_TYPE]: SEVEN_SEGMENT_DEFINITION,
  [CHARACTER_LCD_TYPE]: CHARACTER_LCD_DEFINITION,
  [ROTARY_ENCODER_TYPE]: ROTARY_ENCODER_DEFINITION,
});

export function candidateUiDefinition(type) {
  return CANDIDATE_UI_COMPONENTS[type] ?? null;
}

export function createCandidateUiArtwork(documentObject, definition, component, options = {}) {
  if (component?.type === GROUND_REFERENCE_TYPE) {
    return createGroundReferenceArtwork(documentObject, definition, component, options);
  }
  if (component?.type === TOGGLE_SWITCH_TYPE) {
    return createToggleSwitchArtwork(documentObject, definition, component, options);
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
  if (component?.type === ROTARY_ENCODER_TYPE) {
    return createRotaryEncoderArtwork(documentObject, definition, component, options);
  }
  throw new TypeError('CANDIDATE_UI_COMPONENT');
}

export function createCandidateUiComponent(type, id) {
  if (type === GROUND_REFERENCE_TYPE) return createGroundReferenceComponent(id);
  if (type === TOGGLE_SWITCH_TYPE) return createToggleSwitchComponent(id);
  if (type === SPDT_CONTACT_TYPE) return createSwitchContactComponent(id, 'SPDT changeover contact', { selectedThrow: 'A' });
  if (type === LIGHT_ANALOGUE_SENSOR_TYPE) return createLightAnalogueSensorComponent(id);
  if (type === TEMPERATURE_ANALOGUE_SENSOR_TYPE) return createTemperatureAnalogueSensorComponent(id);
  if (type === DIGITAL_LIGHT_THRESHOLD_TYPE) return createDigitalLightThresholdComponent(id);
  if (type === COMMON_CATHODE_RGB_LED_TYPE) return createCommonCathodeRgbLedComponent(id);
  if (type === ACTIVE_BUZZER_TYPE) return createActiveBuzzerComponent(id);
  if (type === SEVEN_SEGMENT_TYPE) return createSevenSegmentComponent(id);
  if (type === CHARACTER_LCD_TYPE) return createCharacterLcdComponent(id);
  if (type === ROTARY_ENCODER_TYPE) return createRotaryEncoderComponent(id);
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
  const inputs = session.runtimeSupport
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
    });
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
