// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { ProjectEditorReducer } from './project-editor.mjs';
import { catalogType } from './component-catalog.mjs';
import {
  PROJECT_SCHEMA,
  canonicalProjectJson,
  defaultWireColor,
  validateProjectV2,
} from './project-v2.mjs';
import { parseStrictJson } from './strict-json.mjs';
import { withComponentAppearance, withComponentAppearanceBody } from './component-appearance.mjs';
import {
  CURRENT_MODEL_LIBRARY_LOCK, normalizeModelLibraryLock, resolveModelLibrary,
} from './model-library.mjs';
import {
  CONTACT_PERSISTENCE_LIMIT,
  CONTACT_PERSISTENCE_SCHEMA,
  canonicalContactPersistenceDraftJson,
  synchronizeContactPersistenceRuntime,
  validateContactPersistenceDraft,
} from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { GROUND_REFERENCE_TYPE } from '../expansion-drafts/ground-reference-integration-v1.mjs';
import { POWER_REFERENCE_TYPE } from '../expansion-drafts/power-reference-integration-v1.mjs';
import { SPDT_CONTACT_TYPE } from '../expansion-drafts/switch-contact-graph-v1.mjs';
import {
  createSpdtDigitalTransition,
  evaluateSpdtDigitalInput,
} from './candidate-spdt-runtime.mjs';
import { TOGGLE_SWITCH_TYPE } from '../expansion-drafts/toggle-switch-integration-v1.mjs';
import { LIMIT_SWITCH_TYPE, NC_BUTTON_TYPE, SLIDE_SWITCH_TYPE } from '../expansion-drafts/mechanical-inputs-v1.mjs';
import { DIP_SWITCH_4_TYPE, ROTARY_ENCODER_BUTTON_TYPE } from '../expansion-drafts/advanced-switch-inputs-v1.mjs';
import { EMERGENCY_STOP_TYPE, FOOT_PEDAL_TYPE, REED_SWITCH_TYPE } from '../expansion-drafts/safety-pedal-inputs-v1.mjs';
import { LED_BAR_GRAPH_TYPE, RGB_COMMON_ANODE_TYPE,
  ROTARY_SELECTOR_TYPE } from '../expansion-drafts/rotary-selector-indicators-v1.mjs';
import { LIGHT_ANALOGUE_SENSOR_TYPE } from '../expansion-drafts/light-analogue-sensor-v1.mjs';
import {
  TEMPERATURE_ANALOGUE_SENSOR_TYPE,
  TEMPERATURE_MAX_C,
  TEMPERATURE_MIN_C,
} from '../expansion-drafts/temperature-analogue-sensor-v1.mjs';
import {
  DIGITAL_LIGHT_THRESHOLD_TYPE,
  updateDigitalLightThresholdControl,
} from '../expansion-drafts/digital-light-threshold-module-v1.mjs';
import { COMMON_CATHODE_RGB_LED_TYPE } from '../expansion-drafts/common-cathode-rgb-led-v1.mjs';
import { ACTIVE_BUZZER_TYPE } from '../expansion-drafts/active-buzzer-module-v1.mjs';
import { SEVEN_SEGMENT_TYPE } from '../expansion-drafts/seven-segment-common-cathode-v1.mjs';
import { CHARACTER_LCD_TYPE } from '../expansion-drafts/character-lcd-16x2-4bit-v1.mjs';
import { CHARACTER_LCD_20X4_TYPE } from '../expansion-drafts/character-lcd-20x4-4bit-v1.mjs';
import { PCF8574_LCD_TYPE } from '../expansion-drafts/pcf8574-lcd-backpack-v1.mjs';
import {
  ROTARY_ENCODER_TYPE,
  ROTARY_ENCODER_DETENT_MAX,
  ROTARY_ENCODER_DETENT_MIN,
} from '../expansion-drafts/rotary-encoder-quadrature-v1.mjs';
import { ANALOG_JOYSTICK_TYPE, KEYPAD_3X4_TYPE, KEYPAD_4X4_TYPE } from '../expansion-drafts/joystick-keypads-v1.mjs';
import { CAPACITIVE_TOUCH_TYPE, DIGITAL_PRESENCE_SENSOR_DEFINITIONS,
  HALL_SWITCH_TYPE, PIR_MOTION_TYPE } from '../expansion-drafts/digital-presence-sensors-v1.mjs';
import { DIGITAL_PULSE_SENSOR_DEFINITIONS } from '../expansion-drafts/digital-pulse-sensors-v1.mjs';
import { DIGITAL_REFLECTIVE_SENSOR_DEFINITIONS, IR_OBSTACLE_SENSOR_TYPE,
  LINE_TRACKING_SENSOR_TYPE } from '../expansion-drafts/digital-reflective-sensors-v1.mjs';
import { ANALOGUE_MOISTURE_LEVEL_DEFINITIONS, ANALOGUE_WATER_LEVEL_TYPE,
  CAPACITIVE_SOIL_MOISTURE_TYPE, RESISTIVE_SOIL_MOISTURE_TYPE,
} from '../expansion-drafts/analogue-moisture-level-sensors-v1.mjs';
import { ANALOGUE_DETECTION_DEFINITIONS, CO2_ANALOGUE_TYPE, FLAME_ANALOGUE_TYPE,
  MQ_GAS_ANALOGUE_TYPE, RAIN_ANALOGUE_TYPE, SOUND_LEVEL_ANALOGUE_TYPE, UV_ANALOGUE_TYPE,
} from '../expansion-drafts/analogue-detection-sensors-v1.mjs';
import { ANALOGUE_DIRECTION_FIELD_DEFINITIONS, HALL_MAGNETIC_ANALOGUE_TYPE,
  WIND_DIRECTION_ANALOGUE_TYPE,
} from '../expansion-drafts/analogue-direction-field-sensors-v1.mjs';
import { ANALOGUE_TEMPERATURE_IC_DEFINITIONS, LM35_TEMPERATURE_TYPE,
  TMP36_TEMPERATURE_TYPE,
} from '../expansion-drafts/analogue-temperature-ic-sensors-v1.mjs';
import { CONTACT_SENSOR_DEFINITIONS } from '../expansion-drafts/contact-sensors-v1.mjs';

export const CANDIDATE_EDITOR_INTEGRATION_SCHEMA = 'intent-mcu-candidate-editor-session@1';
export const CANDIDATE_EDITOR_HISTORY_LIMIT = 64;

const clone = (value) => structuredClone(value);
const failure = (code, revision, details = []) => ({ ok: false, code, revision, details });
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;
const MOMENTARY_BUTTON_TYPE = 'button.momentary-v1';
const CANDIDATE_COMPONENT_TYPES = new Set([
  GROUND_REFERENCE_TYPE, POWER_REFERENCE_TYPE, TOGGLE_SWITCH_TYPE, SPDT_CONTACT_TYPE,
  SLIDE_SWITCH_TYPE, NC_BUTTON_TYPE, LIMIT_SWITCH_TYPE,
  DIP_SWITCH_4_TYPE, ROTARY_ENCODER_BUTTON_TYPE,
  REED_SWITCH_TYPE, EMERGENCY_STOP_TYPE, FOOT_PEDAL_TYPE,
  ROTARY_SELECTOR_TYPE, RGB_COMMON_ANODE_TYPE, LED_BAR_GRAPH_TYPE,
  LIGHT_ANALOGUE_SENSOR_TYPE, TEMPERATURE_ANALOGUE_SENSOR_TYPE,
  DIGITAL_LIGHT_THRESHOLD_TYPE, COMMON_CATHODE_RGB_LED_TYPE,
  ACTIVE_BUZZER_TYPE, SEVEN_SEGMENT_TYPE,
  CHARACTER_LCD_TYPE,
  CHARACTER_LCD_20X4_TYPE,
  PCF8574_LCD_TYPE,
  ROTARY_ENCODER_TYPE,
  ANALOG_JOYSTICK_TYPE, KEYPAD_3X4_TYPE, KEYPAD_4X4_TYPE,
  CAPACITIVE_TOUCH_TYPE, PIR_MOTION_TYPE, HALL_SWITCH_TYPE,
  ...Object.keys(DIGITAL_PULSE_SENSOR_DEFINITIONS),
  IR_OBSTACLE_SENSOR_TYPE, LINE_TRACKING_SENSOR_TYPE,
  RESISTIVE_SOIL_MOISTURE_TYPE, CAPACITIVE_SOIL_MOISTURE_TYPE, ANALOGUE_WATER_LEVEL_TYPE,
  RAIN_ANALOGUE_TYPE, SOUND_LEVEL_ANALOGUE_TYPE, FLAME_ANALOGUE_TYPE,
  MQ_GAS_ANALOGUE_TYPE, CO2_ANALOGUE_TYPE, UV_ANALOGUE_TYPE,
  WIND_DIRECTION_ANALOGUE_TYPE, HALL_MAGNETIC_ANALOGUE_TYPE,
  TMP36_TEMPERATURE_TYPE, LM35_TEMPERATURE_TYPE,
  ...Object.keys(CONTACT_SENSOR_DEFINITIONS),
]);

function validPoint(value) {
  return value && Number.isFinite(value.x) && value.x >= 0 && value.x <= 1
    && Number.isFinite(value.y) && value.y >= 0 && value.y <= 1
    && (!Object.hasOwn(value, 'rotation') || [0, 90, 180, 270].includes(value.rotation));
}

function removeNetFromDraft(draft, netId) {
  draft.candidateCircuit.nets = draft.candidateCircuit.nets.filter((net) => net.id !== netId);
  draft.candidateCircuit.junctions = draft.candidateCircuit.junctions.filter(
    (junction) => junction.net !== netId,
  );
  delete draft.candidateLayout.wireRoutes[netId];
}

function normalizeChangedNet(draft, netId) {
  const net = draft.candidateCircuit.nets.find((item) => item.id === netId);
  delete draft.candidateLayout.wireRoutes[netId];
  if (!net || net.endpoints.length < 2) {
    removeNetFromDraft(draft, netId);
    return;
  }
  if (net.endpoints.length === 2) {
    draft.candidateCircuit.junctions = draft.candidateCircuit.junctions.filter(
      (junction) => junction.net !== netId,
    );
  }
}

function exactCommand(command, fields) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) return false;
  const actual = Object.keys(command).sort();
  const expected = ['type', 'revision', ...fields].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function runtimeProject(result) {
  const projectV3 = result.project.project;
  const projectV2 = {
    schema: PROJECT_SCHEMA,
    metadata: clone(projectV3.metadata),
    boardProfile: projectV3.controller.profile,
    source: clone(projectV3.source),
    circuit: clone(result.reconstruction.runtimeProjection),
    layout: clone(projectV3.layout),
    instruments: clone(projectV3.instruments),
    build: { status: 'dirty', inputIdentity: null, artifactIdentity: null },
  };
  const validated = validateProjectV2(projectV2);
  if (!validated.ok) throw Object.assign(new Error(validated.code), { code: validated.code, details: validated.details });
  return validated.project;
}

function visualProject(result) {
  const projectV3 = result.project.project;
  const graph = result.reconstruction.graph;
  const layout = result.reconstruction.layout;
  return {
    schema: CANDIDATE_EDITOR_INTEGRATION_SCHEMA,
    metadata: clone(projectV3.metadata),
    boardProfile: projectV3.controller.profile,
    source: clone(projectV3.source),
    circuit: clone(graph),
    layout: {
      positions: clone(layout.positions),
      wireRoutes: clone(layout.wireRoutes),
      wireStyles: Object.fromEntries(graph.nets.map((net) => [
        net.id, { color: defaultWireColor(net, graph) },
      ])),
      viewport: clone(layout.viewport),
      ...(layout.componentAppearance
        ? { componentAppearance: clone(layout.componentAppearance) } : {}),
    },
    instruments: clone(projectV3.instruments),
    build: { status: 'dirty', inputIdentity: null, artifactIdentity: null },
  };
}

function contactSupport(result) {
  return result.reconstruction.contacts.map((contact) => {
    if (!result.reconstruction.runnable.ok) {
      return {
        componentId: contact.componentId,
        type: contact.type,
        status: 'draft-unrunnable',
        runtimeAdapter: null,
        runtimeProjection: null,
        limitation: `Draft is structurally valid but not runnable: ${result.reconstruction.runnable.code}`,
      };
    }
    const selected = contact.type === SPDT_CONTACT_TYPE
      ? evaluateSpdtDigitalInput(result, contact.componentId)
      : null;
    const spdt = selected?.ok
      ? createSpdtDigitalTransition(
        result,
        contact.componentId,
        contact.state.selectedThrow === 'A' ? 'B' : 'A',
      )
      : selected;
    return {
      componentId: contact.componentId,
      type: contact.type,
      status: spdt && !spdt.ok ? 'runtime-unsupported' : 'projected-simulated',
      runtimeProjection: clone(contact.runtimeProjection ?? null),
      runtimeAdapter: contact.type === GROUND_REFERENCE_TYPE
        ? 'board-ground-projection'
        : contact.type === POWER_REFERENCE_TYPE
          ? 'board-5v-source-projection'
        : contact.type === TOGGLE_SWITCH_TYPE
          ? 'button.momentary-v1'
        : CONTACT_SENSOR_DEFINITIONS[contact.type]
          ? 'button.momentary-v1-passive-contact-adapter'
        : contact.type === NC_BUTTON_TYPE
          ? 'button.momentary-v1-inverted'
        : contact.type === SLIDE_SWITCH_TYPE
          ? 'spdt-digital-reference-v1'
        : contact.type === LIMIT_SWITCH_TYPE
          ? 'spdt-digital-reference-v1-spring-return'
          : contact.type === LIGHT_ANALOGUE_SENSOR_TYPE
            ? 'potentiometer.linear-v1'
          : contact.type === TEMPERATURE_ANALOGUE_SENSOR_TYPE
            ? 'potentiometer.linear-v1'
          : ANALOGUE_MOISTURE_LEVEL_DEFINITIONS[contact.type]
            ? 'potentiometer.linear-v1-ideal-analogue-sensor-adapter'
          : ANALOGUE_DETECTION_DEFINITIONS[contact.type]
            ? 'potentiometer.linear-v1-ideal-analogue-sensor-adapter'
          : ANALOGUE_DIRECTION_FIELD_DEFINITIONS[contact.type]
            ? 'potentiometer.linear-v1-ideal-analogue-sensor-adapter'
          : ANALOGUE_TEMPERATURE_IC_DEFINITIONS[contact.type]
            ? 'potentiometer.linear-v1-ideal-analogue-sensor-adapter'
          : contact.type === DIGITAL_LIGHT_THRESHOLD_TYPE
            ? 'button.momentary-v1'
        : contact.type === COMMON_CATHODE_RGB_LED_TYPE
          ? 'three-independent-led.basic-v1'
        : contact.type === ROTARY_SELECTOR_TYPE
          ? 'one-of-four-passive-contact-v1'
        : contact.type === RGB_COMMON_ANODE_TYPE
          ? 'three-independent-active-low-led-v1'
        : contact.type === LED_BAR_GRAPH_TYPE
          ? 'ten-independent-led.basic-v1'
          : contact.type === ACTIVE_BUZZER_TYPE
            ? 'avr-gpio-logical-output-observer-v1'
          : contact.type === SEVEN_SEGMENT_TYPE
            ? 'seven-independent-led.basic-v1'
          : contact.type === CHARACTER_LCD_TYPE
            ? 'avr-gpio-hd44780-write-only-decoder-v1'
          : contact.type === CHARACTER_LCD_20X4_TYPE
            ? 'avr-gpio-hd44780-write-only-decoder-v1-20x4-cgram'
          : contact.type === ROTARY_ENCODER_TYPE
            ? 'two-button.momentary-v1-with-timed-gray-sequence'
          : contact.type === ANALOG_JOYSTICK_TYPE
            ? 'two-potentiometer.linear-v1-plus-button.momentary-v1'
          : [KEYPAD_3X4_TYPE, KEYPAD_4X4_TYPE].includes(contact.type)
            ? 'selected-row-column-digital-bridge-v1'
          : DIGITAL_PRESENCE_SENSOR_DEFINITIONS[contact.type]
            ? 'button.momentary-v1-active-high-inverted-adapter'
          : DIGITAL_PULSE_SENSOR_DEFINITIONS[contact.type]
            ? 'button.momentary-v1-active-high-inverted-manual-pulse-level-adapter'
          : DIGITAL_REFLECTIVE_SENSOR_DEFINITIONS[contact.type]
            ? 'button.momentary-v1-active-low-adapter'
          : spdt?.ok
            ? 'spdt-digital-reference-v1'
            : null,
      limitation: contact.type === DIGITAL_LIGHT_THRESHOLD_TYPE
        ? 'Ideal active-low percentage threshold with retained hysteresis state only; no lux accuracy or physical detector behavior is modelled.'
        : DIGITAL_PRESENCE_SENSOR_DEFINITIONS[contact.type]
        ? 'Ideal active-high digital state only; physical sensitivity, range, field behavior, timing and electrical loading are not modelled.'
        : DIGITAL_PULSE_SENSOR_DEFINITIONS[contact.type]
        ? 'Manually authored instantaneous active-high pulse level only; no automatic frequency, pulse train, rate calibration or physical flow/wind behavior is modelled.'
        : DIGITAL_REFLECTIVE_SENSOR_DEFINITIONS[contact.type]
        ? 'Ideal active-low reflected-state only; distance, surface response, calibration, geometry, ambient light and electrical loading are not modelled.'
        : contact.type === COMMON_CATHODE_RGB_LED_TYPE
        ? 'Ideal relative PWM mix through three independently current-limited existing LED channels; no physical colour, wavelength, optical or current accuracy is modelled.'
        : contact.type === ROTARY_SELECTOR_TYPE
        ? 'Ideal maintained one-of-four passive contact; no overlap, bounce, resistance, current rating or shaft mechanics.'
        : contact.type === RGB_COMMON_ANODE_TYPE
        ? 'Ideal active-low relative PWM mix with one resistor per channel; no physical optical or thermal accuracy.'
        : contact.type === LED_BAR_GRAPH_TYPE
        ? 'Ten electrically independent LEDs with twenty explicit terminals and one resistor per segment; no invented common return.'
        : contact.type === ACTIVE_BUZZER_TYPE
        ? 'Ideal high-active GPIO enable observed as a silent logical on/off indicator; no waveform, frequency, sound pressure, supply/GPIO current, loading or physical acoustic accuracy is modelled.'
        : contact.type === SEVEN_SEGMENT_TYPE
        ? 'Ideal commanded on/off state through seven independently current-limited existing LED channels; no decimal point, multiplexing, driver IC, brightness, optical, package-current or physical display accuracy is modelled.'
        : contact.type === CHARACTER_LCD_TYPE
        ? 'Bounded AVR-only 16x2 write-only 4-bit GPIO character decoder with deterministic wrapping, display on/off, cursor and blink. Reads, busy flag, custom glyphs, shifts, 8-bit mode, I2C/backpacks and physical display behavior are unsupported.'
        : contact.type === CHARACTER_LCD_20X4_TYPE
        ? 'Bounded AVR-only 20x4 write-only 4-bit GPIO decoder with exact four-row DDRAM addressing and eight 5x8 CGRAM slots. Reads, busy flag, shifts, 8-bit mode, I2C and physical display behavior are unsupported.'
        : contact.type === ROTARY_ENCODER_TYPE
        ? 'Ideal no-bounce A/B contacts to COM only. Each detent schedules four one-bit Gray transitions at 16,000 cycles per phase; physical acceleration, missed edges and mechanical behavior are unsupported.'
        : contact.type === TEMPERATURE_ANALOGUE_SENSOR_TYPE
        ? 'Ideal linear -50 to 150 °C module signal only; no physical-sensor accuracy or thermal response is modelled.'
        : ANALOGUE_MOISTURE_LEVEL_DEFINITIONS[contact.type]
        ? 'Ideal linear 0–5 V environment-module signal only; no calibrated soil, liquid, geometry, material or response-time accuracy is modelled.'
        : ANALOGUE_DETECTION_DEFINITIONS[contact.type]
        ? 'Ideal linear 0–5 V detector response only; no calibrated concentration, rainfall, sound-pressure, UV index, physical geometry, spectral, timing, alarm or safety accuracy is modelled.'
        : ANALOGUE_DIRECTION_FIELD_DEFINITIONS[contact.type]
        ? 'Ideal linear 0–5 V direction or signed field response only; no physical vane, compass, tesla/gauss, geometry, calibration, saturation, timing or electrical accuracy is modelled.'
        : ANALOGUE_TEMPERATURE_IC_DEFINITIONS[contact.type]
        ? 'Ideal TMP36 or nonnegative single-supply LM35 transfer only; no physical tolerance, calibration, thermal response, loading, noise or package-pin guidance is modelled.'
        : contact.type === LIGHT_ANALOGUE_SENSOR_TYPE
        ? 'Ideal linear 0–5 V module signal only; no lux accuracy or physical LDR response is modelled.'
        : contact.type === SPDT_CONTACT_TYPE
        ? spdt?.ok
          ? 'Direct digital-input GND/5 V references are simulated; generic dynamic nets, analogue contacts and output-drive inference remain unsupported.'
          : `SPDT runtime projection rejected: ${spdt?.code ?? 'SPDT_RUNTIME_UNSUPPORTED'}`
        : null,
    };
  });
}

export class V2EditorSession {
  constructor(project) {
    this.kind = 'project-v2';
    this.editor = new ProjectEditorReducer(project);
  }

  get revision() { return this.editor.revision; }
  get project() { return clone(this.editor.project); }
  get visualProject() { return clone(this.editor.project); }
  get runtimeProject() { return clone(this.editor.project); }
  get runtimeSupport() { return []; }
  get compiledFixture() { return null; }
  saveText() { return canonicalProjectJson(this.editor.project); }
  apply(command, options = {}) { return this.editor.apply(command, options); }
}

export class CandidateEditorSession {
  constructor(value, { historyLimit = CANDIDATE_EDITOR_HISTORY_LIMIT,
    modelLibraryLock = CURRENT_MODEL_LIBRARY_LOCK } = {}) {
    if (!Number.isInteger(historyLimit) || historyLimit < 1 || historyLimit > CANDIDATE_EDITOR_HISTORY_LIMIT) {
      throw new TypeError('CANDIDATE_EDITOR_HISTORY_LIMIT');
    }
    const normalizedLock = normalizeModelLibraryLock(modelLibraryLock);
    if (!normalizedLock.ok) throw Object.assign(new Error(normalizedLock.code), normalizedLock);
    this.modelLibraryLock = normalizedLock.lock;
    const resolvedLibrary = resolveModelLibrary(this.modelLibraryLock);
    if (!resolvedLibrary.ok) throw Object.assign(new Error(resolvedLibrary.code), resolvedLibrary);
    this.modelLibraryImplementation = resolvedLibrary.implementation;
    const accepted = validateContactPersistenceDraft(value, { modelLibraryLock: this.modelLibraryLock });
    if (!accepted.ok) throw Object.assign(new Error(accepted.code), { code: accepted.code, details: accepted.details });
    const normalized = accepted.reconstruction.projectionReady && !accepted.reconstruction.baseMatches
      ? synchronizeContactPersistenceRuntime(accepted.project, { modelLibraryLock: this.modelLibraryLock })
      : accepted;
    if (!normalized.ok) throw Object.assign(new Error(normalized.code), { code: normalized.code, details: normalized.details });
    this.kind = 'candidate-project-v3';
    this.accepted = normalized;
    this.revision = 0;
    this.historyLimit = historyLimit;
    this.undoStack = [];
    this.redoStack = [];
    this.apiTransaction = null;
  }

  get project() { return visualProject(this.accepted); }
  get visualProject() { return visualProject(this.accepted); }
  get runtimeProject() {
    const runnable = this.runnable;
    if (!runnable.ok) throw Object.assign(new Error(runnable.code), { code: runnable.code, details: runnable.details });
    return runtimeProject(this.accepted);
  }
  get runnable() {
    const candidateCount = this.accepted.project.candidateCircuit.components.filter(
      (component) => CANDIDATE_COMPONENT_TYPES.has(component.type),
    ).length;
    if (candidateCount === 0) {
      return { ok: false, code: 'PROJECT_CONTACT_CANDIDATE_REQUIRED', details: [] };
    }
    const structural = this.accepted.reconstruction.runnable;
    if (!structural.ok) return clone(structural);
    const unsupported = contactSupport(this.accepted).find((item) => item.status !== 'projected-simulated');
    return unsupported
      ? { ok: false, code: 'CANDIDATE_UI_RUNTIME_UNSUPPORTED', details: [unsupported.componentId, unsupported.limitation] }
      : { ok: true, code: 'OK', details: [] };
  }
  get runtimeSupport() { return clone(contactSupport(this.accepted)); }
  get compiledFixture() { return clone(this.accepted.reconstruction.compiledFixture); }
  get pinAnchors() { return clone(this.accepted.reconstruction.pinAnchors); }
  get modelExecutionIdentity() {
    return { lock: clone(this.modelLibraryLock), implementationId: this.modelLibraryImplementation.id };
  }
  evaluateModel(componentType, input) {
    return clone(this.modelLibraryImplementation.evaluateProduction(componentType, input));
  }
  saveText() { return canonicalContactPersistenceDraftJson(this.accepted.project,
    { modelLibraryLock: this.modelLibraryLock }); }
  evaluateSpdtRuntime(componentId, options = {}) {
    const result = evaluateSpdtDigitalInput(this.accepted, componentId, options);
    if (!result.ok) return clone(result);
    const expected = this.evaluateModel(SPDT_CONTACT_TYPE,
      { selectedThrow: result.projection.selectedThrow });
    if (!expected.ok || JSON.stringify(expected.result.activeContact)
        !== JSON.stringify(result.projection.activeContact)) {
      return failure('MODEL_LIBRARY_PRODUCTION_MISMATCH', this.revision, [componentId]);
    }
    return clone(result);
  }
  createSpdtRuntimeTransition(componentId, to, options = {}) {
    return clone(createSpdtDigitalTransition(this.accepted, componentId, to, options));
  }

  #accept(project, code, { runtimeDirty = false, changeRelevance = null } = {}) {
    let next = validateContactPersistenceDraft(project, { modelLibraryLock: this.modelLibraryLock });
    if (!next.ok) return failure(next.code, this.revision, next.details);
    if (next.reconstruction.projectionReady && !next.reconstruction.baseMatches) {
      next = synchronizeContactPersistenceRuntime(next.project, { modelLibraryLock: this.modelLibraryLock });
      if (!next.ok) return failure(next.code, this.revision, next.details);
    }
    this.undoStack.push(clone(this.accepted.project));
    if (this.undoStack.length > this.historyLimit) this.undoStack.shift();
    this.redoStack = [];
    this.accepted = next;
    this.revision += 1;
    return {
      ok: true,
      code,
      revision: this.revision,
      project: this.visualProject,
      runtimeProject: this.runnable.ok ? this.runtimeProject : null,
      runnable: this.runnable,
      runtimeDirty,
      changeRelevance: changeRelevance ?? (runtimeDirty ? 'build' : 'visual'),
    };
  }

  #travel(command) {
    if (!exactCommand(command, [])) return failure('EDITOR_COMMAND_SHAPE', this.revision);
    const undo = command.type === 'undo';
    const source = undo ? this.undoStack : this.redoStack;
    const target = undo ? this.redoStack : this.undoStack;
    if (!source.length) return failure(undo ? 'EDITOR_UNDO_EMPTY' : 'EDITOR_REDO_EMPTY', this.revision);
    const beforeProjection = JSON.stringify(this.accepted.reconstruction.runtimeProjection);
    const beforeContacts = JSON.stringify(
      this.accepted.reconstruction.contacts.map((contact) => contact.state),
    );
    const previous = clone(this.accepted.project);
    let next = validateContactPersistenceDraft(source.pop(), { modelLibraryLock: this.modelLibraryLock });
    if (!next.ok) throw new Error(`CANDIDATE_EDITOR_HISTORY:${next.code}`);
    if (next.reconstruction.projectionReady && !next.reconstruction.baseMatches) {
      next = synchronizeContactPersistenceRuntime(next.project, { modelLibraryLock: this.modelLibraryLock });
    }
    if (!next.ok) throw new Error(`CANDIDATE_EDITOR_HISTORY:${next.code}`);
    target.push(previous);
    if (target.length > this.historyLimit) target.shift();
    this.accepted = next;
    this.revision += 1;
    const topologyDirty = beforeProjection !== JSON.stringify(next.reconstruction.runtimeProjection);
    const runtimeDirty = topologyDirty || beforeContacts !== JSON.stringify(
      next.reconstruction.contacts.map((contact) => contact.state),
    );
    return {
      ok: true,
      code: undo ? 'EDITOR_UNDONE' : 'EDITOR_REDONE',
      revision: this.revision,
      project: this.visualProject,
      runtimeProject: this.runnable.ok ? this.runtimeProject : null,
      runnable: this.runnable,
      runtimeDirty,
      changeRelevance: topologyDirty ? 'build' : runtimeDirty ? 'runtime' : 'visual',
    };
  }

  apply(command) {
    if (!command || !Number.isInteger(command.revision) || command.revision !== this.revision) {
      return failure('EDITOR_STALE_REVISION', this.revision);
    }
    if (command.type === 'edit.undo' || command.type === 'edit.redo') {
      if (!exactCommand(command, ['transactionId']) || command.transactionId !== this.apiTransaction?.id) {
        return failure('API_UNDO_CONFLICT', this.revision);
      }
      const undo = command.type === 'edit.undo';
      const expectedRevision = undo ? this.apiTransaction.appliedRevision : this.apiTransaction.undoneRevision;
      if (this.revision !== expectedRevision) return failure('API_UNDO_CONFLICT', this.revision);
      const result = this.#travel({ type: undo ? 'undo' : 'redo', revision: this.revision });
      if (result.ok) this.apiTransaction[undo ? 'undoneRevision' : 'appliedRevision'] = result.revision;
      return result;
    }
    if (command.type === 'edit.batch') {
      if (!exactCommand(command, ['transactionId', 'commands']) || typeof command.transactionId !== 'string'
          || !Array.isArray(command.commands) || !command.commands.length || command.commands.length > 16) {
        return failure('EDITOR_COMMAND_SHAPE', this.revision);
      }
      const temporary = new CandidateEditorSession(this.accepted.project, {
        historyLimit: this.historyLimit, modelLibraryLock: this.modelLibraryLock,
      });
      for (const item of command.commands) {
        const result = temporary.apply({ ...item, revision: temporary.revision });
        if (!result.ok) return failure(result.code, this.revision, result.details);
      }
      const result = this.#accept(temporary.accepted.project, 'API_BATCH_APPLIED', { runtimeDirty: true });
      if (result.ok) this.apiTransaction = { id: command.transactionId, appliedRevision: result.revision,
        undoneRevision: null };
      return result;
    }
    if (command.type === 'undo' || command.type === 'redo') return this.#travel(command);
    const draft = clone(this.accepted.project);
    let runtimeDirty = false;
    try {
      switch (command.type) {
        case 'project.rename': {
          if (!exactCommand(command, ['name'])) return failure('EDITOR_COMMAND_SHAPE', this.revision);
          draft.project.metadata = { name: command.name };
          break;
        }
        case 'source.set': {
          if (!exactCommand(command, ['name', 'content']) || typeof command.name !== 'string'
              || typeof command.content !== 'string') {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          const file = draft.project.source.files.find((item) => item.name === command.name);
          if (!file) return failure('EDITOR_SOURCE_MISSING', this.revision, [command.name]);
          file.content = command.content;
          runtimeDirty = true;
          break;
        }
        case 'component.add': {
          if (!exactCommand(command, ['component', 'position']) || !validPoint(command.position)
              || (!CANDIDATE_COMPONENT_TYPES.has(command.component?.type)
                && !catalogType(command.component?.type))) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          if (draft.candidateCircuit.components.some((item) => item.id === command.component.id)) {
            return failure('PROJECT_CONTACT_COMPONENT_DUPLICATE', this.revision, [command.component.id]);
          }
          draft.candidateCircuit.components.push(clone(command.component));
          draft.candidateLayout.positions[command.component.id] = {
            x: command.position.x,
            y: command.position.y,
            rotation: command.position.rotation ?? 0,
          };
          runtimeDirty = true;
          break;
        }
        case 'component.duplicate': {
          const hasPosition = Object.hasOwn(command, 'position');
          if (!exactCommand(command, hasPosition ? ['sourceId', 'newId', 'position'] : ['sourceId', 'newId'])
              || (hasPosition && !validPoint(command.position))
              || typeof command.newId !== 'string' || command.newId.length === 0) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          const source = draft.candidateCircuit.components.find(
            (item) => item.id === command.sourceId,
          );
          if (!source) return failure('EDITOR_COMPONENT_MISSING', this.revision, [command.sourceId]);
          if (source.type.startsWith('board.')) {
            return failure('CANDIDATE_EDITOR_CONTROLLER_PROTECTED', this.revision, [command.sourceId]);
          }
          if (draft.candidateCircuit.components.some((item) => item.id === command.newId)) {
            return failure('PROJECT_CONTACT_COMPONENT_DUPLICATE', this.revision, [command.newId]);
          }
          const copy = clone(source);
          copy.id = command.newId;
          copy.label = `${source.label} copy`;
          draft.candidateCircuit.components.push(copy);
          const position = draft.candidateLayout.positions[source.id];
          draft.candidateLayout.positions[copy.id] = hasPosition ? clone(command.position) : {
            x: Math.min(0.93, Math.max(0.07, position.x + 0.04)),
            y: Math.min(0.92, Math.max(0.08, position.y + 0.04)),
            rotation: position.rotation,
          };
          if (draft.candidateLayout.componentAppearance?.components[source.id]) {
            draft.candidateLayout.componentAppearance.components[copy.id] = clone(
              draft.candidateLayout.componentAppearance.components[source.id],
            );
          }
          runtimeDirty = true;
          break;
        }
        case 'component.remove': {
          if (!exactCommand(command, ['componentId'])) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          const component = draft.candidateCircuit.components.find(
            (item) => item.id === command.componentId,
          );
          if (!component) return failure('EDITOR_COMPONENT_MISSING', this.revision, [command.componentId]);
          if (!CANDIDATE_COMPONENT_TYPES.has(component.type) && !catalogType(component.type)) {
            return failure('CANDIDATE_EDITOR_COMPONENT_REMOVE_UNSUPPORTED', this.revision, [command.componentId]);
          }
          draft.candidateCircuit.components = draft.candidateCircuit.components.filter(
            (item) => item.id !== command.componentId,
          );
          delete draft.candidateLayout.positions[command.componentId];
          if (draft.candidateLayout.componentAppearance) {
            delete draft.candidateLayout.componentAppearance.components[command.componentId];
          }
          const changedNets = [];
          for (const net of draft.candidateCircuit.nets) {
            const endpoints = net.endpoints.filter(
              (endpoint) => endpoint.component !== command.componentId,
            );
            if (endpoints.length !== net.endpoints.length) {
              net.endpoints = endpoints;
              changedNets.push(net.id);
            }
          }
          for (const netId of changedNets) normalizeChangedNet(draft, netId);
          runtimeDirty = true;
          break;
        }
        case 'component.property.set': {
          if (!exactCommand(command, ['componentId', 'key', 'value'])) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          const component = draft.candidateCircuit.components.find((item) => item.id === command.componentId);
          if (!component || !Object.hasOwn(component.properties, command.key)) {
            return failure('EDITOR_PROPERTY_UNSUPPORTED', this.revision, [command.componentId, command.key]);
          }
          component.properties[command.key] = clone(command.value);
          runtimeDirty = true;
          break;
        }
        case 'subcircuit.graph.replace': {
          if (!exactCommand(command, ['graph', 'positions']) || !command.graph
              || !command.positions || typeof command.positions !== 'object'
              || Array.isArray(command.positions)) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          const replacementIds = command.graph.components?.map(({ id }) => id).sort() ?? [];
          if (Object.keys(command.positions).sort().join('|') !== replacementIds.join('|')
              || replacementIds.some((componentId) => !validPoint(command.positions[componentId])
                || ![0, 90, 180, 270].includes(command.positions[componentId].rotation ?? 0))) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          draft.candidateCircuit = clone(command.graph);
          draft.candidateLayout.positions = clone(command.positions);
          const netIds = new Set(command.graph.nets?.map(({ id }) => id) ?? []);
          draft.candidateLayout.wireRoutes = Object.fromEntries(
            Object.entries(draft.candidateLayout.wireRoutes).filter(([netId]) => netIds.has(netId)),
          );
          const componentIds = new Set(replacementIds);
          if (draft.candidateLayout.componentAppearance) {
            draft.candidateLayout.componentAppearance.components = Object.fromEntries(
              Object.entries(draft.candidateLayout.componentAppearance.components)
                .filter(([componentId]) => componentIds.has(componentId)),
            );
          }
          runtimeDirty = true;
          break;
        }
        case 'subcircuit.presentation.set': {
          if (!exactCommand(command, ['positions']) || !Array.isArray(command.positions)
              || !command.positions.length) return failure('EDITOR_COMMAND_SHAPE', this.revision);
          for (const item of command.positions) {
            if (!item || typeof item !== 'object' || Array.isArray(item)
                || Object.keys(item).sort().join('|') !== 'componentId|x|y'
                || !draft.candidateLayout.positions[item.componentId] || !validPoint(item)) {
              return failure('EDITOR_COMMAND_SHAPE', this.revision);
            }
            draft.candidateLayout.positions[item.componentId].x = item.x;
            draft.candidateLayout.positions[item.componentId].y = item.y;
          }
          break;
        }
        case 'wire.create': {
          if (!exactCommand(command, ['net']) || !command.net
              || Object.keys(command.net).sort().join('|') !== 'endpoints|id'
              || !Array.isArray(command.net.endpoints) || command.net.endpoints.length !== 2) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          draft.candidateCircuit.nets.push(clone(command.net));
          runtimeDirty = true;
          break;
        }
        case 'wire.delete': {
          if (!exactCommand(command, ['netId'])) return failure('EDITOR_COMMAND_SHAPE', this.revision);
          if (!draft.candidateCircuit.nets.some((net) => net.id === command.netId)) {
            return failure('EDITOR_NET_MISSING', this.revision, [command.netId]);
          }
          removeNetFromDraft(draft, command.netId);
          runtimeDirty = true;
          break;
        }
        case 'wire.branch.delete': {
          if (!exactCommand(command, ['netId', 'endpoint'])) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          const net = draft.candidateCircuit.nets.find((item) => item.id === command.netId);
          if (!net) return failure('EDITOR_NET_MISSING', this.revision, [command.netId]);
          if (net.endpoints.length <= 2) {
            return failure('EDITOR_BRANCH_REQUIRES_MULTI_ENDPOINT', this.revision, [command.netId]);
          }
          const key = endpointKey(command.endpoint);
          if (!net.endpoints.some((endpoint) => endpointKey(endpoint) === key)) {
            return failure('EDITOR_ENDPOINT_MISSING', this.revision, [key]);
          }
          net.endpoints = net.endpoints.filter((endpoint) => endpointKey(endpoint) !== key);
          normalizeChangedNet(draft, command.netId);
          runtimeDirty = true;
          break;
        }
        case 'wire.branch': {
          if (!exactCommand(command, ['netId', 'endpoint', 'junctionId'])) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          const net = draft.candidateCircuit.nets.find((item) => item.id === command.netId);
          if (!net) return failure('EDITOR_NET_MISSING', this.revision, [command.netId]);
          const key = endpointKey(command.endpoint);
          if (draft.candidateCircuit.nets.some(
            (item) => item.endpoints.some((endpoint) => endpointKey(endpoint) === key),
          )) return failure('PROJECT_CONTACT_REUSED_ENDPOINT', this.revision, [key]);
          net.endpoints.push(clone(command.endpoint));
          if (!draft.candidateCircuit.junctions.some((junction) => junction.net === command.netId)) {
            draft.candidateCircuit.junctions.push({ id: command.junctionId, net: command.netId });
          }
          runtimeDirty = true;
          break;
        }
        case 'junction.remove': {
          if (!exactCommand(command, ['junctionId', 'detachEndpoint'])) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          const junction = draft.candidateCircuit.junctions.find(
            (item) => item.id === command.junctionId,
          );
          if (!junction) return failure('EDITOR_JUNCTION_MISSING', this.revision, [command.junctionId]);
          const net = draft.candidateCircuit.nets.find((item) => item.id === junction.net);
          if (!net) return failure('EDITOR_NET_MISSING', this.revision, [junction.net]);
          if (command.detachEndpoint !== null) {
            return failure('EDITOR_JUNCTION_BRANCH_REMOVAL_REQUIRES_EXPLICIT_BRANCH', this.revision,
              [junction.id, endpointKey(command.detachEndpoint)]);
          }
          if (net.endpoints.length > 2) {
            return failure('EDITOR_JUNCTION_REQUIRED_FOR_MULTI_ENDPOINT_NET', this.revision,
              [junction.id, net.id]);
          }
          draft.candidateCircuit.junctions = draft.candidateCircuit.junctions.filter(
            (item) => item.id !== junction.id,
          );
          runtimeDirty = true;
          break;
        }
        case 'wire.reconnect': {
          if (!exactCommand(command, ['netId', 'from', 'to'])) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          const net = draft.candidateCircuit.nets.find((item) => item.id === command.netId);
          if (!net) return failure('EDITOR_NET_MISSING', this.revision, [command.netId]);
          const fromKey = endpointKey(command.from);
          const toKey = endpointKey(command.to);
          if (fromKey === toKey) {
            return failure('EDITOR_RECONNECT_SAME_ENDPOINT', this.revision, [fromKey]);
          }
          const index = net.endpoints.findIndex((endpoint) => endpointKey(endpoint) === fromKey);
          if (index < 0) return failure('EDITOR_ENDPOINT_MISSING', this.revision, [fromKey]);
          if (draft.candidateCircuit.nets.some((item) => item.endpoints.some(
            (endpoint) => endpointKey(endpoint) === toKey,
          ))) return failure('PROJECT_CONTACT_REUSED_ENDPOINT', this.revision, [toKey]);
          net.endpoints[index] = clone(command.to);
          normalizeChangedNet(draft, command.netId);
          runtimeDirty = true;
          break;
        }
        case 'component.move': {
          if (!exactCommand(command, ['componentId', 'x', 'y'])
              || !draft.candidateLayout.positions[command.componentId]) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          draft.candidateLayout.positions[command.componentId].x = command.x;
          draft.candidateLayout.positions[command.componentId].y = command.y;
          break;
        }
        case 'component.rotate': {
          if (!exactCommand(command, ['componentId', 'rotation'])
              || !draft.candidateLayout.positions[command.componentId]) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          draft.candidateLayout.positions[command.componentId].rotation = command.rotation;
          break;
        }
        case 'component.appearance.set': {
          if (!exactCommand(command, ['componentId', 'preset'])) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          try {
            draft.candidateLayout.componentAppearance = withComponentAppearance(
              draft.candidateLayout.componentAppearance,
              draft.candidateCircuit,
              command.componentId,
              command.preset,
            );
          } catch (error) {
            return failure(error.code ?? 'COMPONENT_APPEARANCE_INVALID', this.revision,
              error.details ?? [command.componentId, command.preset]);
          }
          break;
        }
        case 'component.appearance.body.set': {
          if (!exactCommand(command, ['componentId', 'body'])) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          try {
            draft.candidateLayout.componentAppearance = withComponentAppearanceBody(
              draft.candidateLayout.componentAppearance,
              draft.candidateCircuit,
              command.componentId,
              command.body,
            );
          } catch (error) {
            return failure(error.code ?? 'COMPONENT_APPEARANCE_INVALID', this.revision,
              error.details ?? [command.componentId, command.body]);
          }
          break;
        }
        case 'component.appearance.edit': {
          if (!exactCommand(command, ['componentId', 'preset', 'body'])) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          try {
            const presetAppearance = withComponentAppearance(
              draft.candidateLayout.componentAppearance,
              draft.candidateCircuit,
              command.componentId,
              command.preset,
            );
            draft.candidateLayout.componentAppearance = withComponentAppearanceBody(
              presetAppearance,
              draft.candidateCircuit,
              command.componentId,
              command.body,
            );
          } catch (error) {
            return failure(error.code ?? 'COMPONENT_APPEARANCE_INVALID', this.revision,
              error.details ?? [command.componentId, command.preset, command.body]);
          }
          break;
        }
        case 'viewport.set': {
          if (!exactCommand(command, ['zoom', 'panX', 'panY'])) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          draft.candidateLayout.viewport = {
            zoom: command.zoom, panX: command.panX, panY: command.panY,
          };
          break;
        }
        case 'wire.route.family.set': {
          if (!exactCommand(command, ['netId', 'family'])) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          draft.candidateLayout.wireRoutes[command.netId] = clone(command.family);
          break;
        }
        case 'component.control.set': {
          if (!exactCommand(command, ['componentId', 'key', 'value'])) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          const component = draft.candidateCircuit.components.find((item) => item.id === command.componentId);
          if (!component) return failure('EDITOR_COMPONENT_MISSING', this.revision);
          if (component.type === GROUND_REFERENCE_TYPE || component.type === POWER_REFERENCE_TYPE) {
            return failure('CANDIDATE_EDITOR_REFERENCE_IMMUTABLE', this.revision);
          }
          if (component.type === MOMENTARY_BUTTON_TYPE) {
            if (command.key !== 'pressed' || typeof command.value !== 'boolean') {
              return failure('PROJECT_CONTACT_BUTTON_STATE', this.revision);
            }
            component.controls.pressed = command.value;
            const projected = draft.project.circuit.components.find(
              (item) => item.id === component.id,
            );
            if (!projected || projected.type !== MOMENTARY_BUTTON_TYPE) {
              return failure('PROJECT_CONTACT_BASE_GRAPH_MISMATCH', this.revision);
            }
            projected.controls.pressed = command.value;
            runtimeDirty = true;
            break;
          }
          if (component.type === TOGGLE_SWITCH_TYPE) {
            if (command.key !== 'closed' || typeof command.value !== 'boolean') {
              return failure('PROJECT_CONTACT_SPST_STATE', this.revision);
            }
            component.controls.closed = command.value;
            const projected = draft.project.circuit.components.find((item) => item.id === component.id);
            if (projected && projected.type !== 'button.momentary-v1') {
              return failure('PROJECT_CONTACT_BASE_GRAPH_MISMATCH', this.revision);
            }
            if (projected) projected.controls.pressed = command.value;
            runtimeDirty = true;
            break;
          }
          if (component.type === NC_BUTTON_TYPE) {
            if (command.key !== 'pressed' || typeof command.value !== 'boolean') {
              return failure('PROJECT_CONTACT_MECHANICAL_INPUT_STATE', this.revision);
            }
            component.controls.pressed = command.value; runtimeDirty = true; break;
          }
          if (component.type === SLIDE_SWITCH_TYPE) {
            if (command.key !== 'selectedThrow' || !['A', 'B'].includes(command.value)) {
              return failure('PROJECT_CONTACT_MECHANICAL_INPUT_STATE', this.revision);
            }
            component.controls.selectedThrow = command.value; runtimeDirty = true; break;
          }
          if (component.type === LIMIT_SWITCH_TYPE) {
            if (command.key !== 'actuated' || typeof command.value !== 'boolean') {
              return failure('PROJECT_CONTACT_MECHANICAL_INPUT_STATE', this.revision);
            }
            component.controls.actuated = command.value; runtimeDirty = true; break;
          }
          if (component.type === DIP_SWITCH_4_TYPE) {
            if (!/^switch[1-4]$/u.test(command.key) || typeof command.value !== 'boolean') {
              return failure('PROJECT_CONTACT_ADVANCED_SWITCH_STATE', this.revision);
            }
            component.controls[command.key] = command.value; runtimeDirty = true; break;
          }
          if (component.type === ROTARY_ENCODER_BUTTON_TYPE) {
            if (command.key === 'pressed' && typeof command.value === 'boolean') {
              component.controls.pressed = command.value; runtimeDirty = true; break;
            }
            if (command.key === 'detent' && Number.isInteger(command.value)
                && Math.abs(command.value - component.controls.detent) === 1
                && command.value >= ROTARY_ENCODER_DETENT_MIN && command.value <= ROTARY_ENCODER_DETENT_MAX) {
              component.controls.detent = command.value; runtimeDirty = true; break;
            }
            return failure('PROJECT_CONTACT_ADVANCED_SWITCH_STATE', this.revision);
          }
          if ([REED_SWITCH_TYPE, EMERGENCY_STOP_TYPE, FOOT_PEDAL_TYPE].includes(component.type)) {
            const expectedKey = component.type === REED_SWITCH_TYPE ? 'magnetPresent'
              : component.type === EMERGENCY_STOP_TYPE ? 'latched' : 'pressed';
            if (command.key !== expectedKey || typeof command.value !== 'boolean') {
              return failure('PROJECT_CONTACT_SAFETY_PEDAL_STATE', this.revision);
            }
            component.controls[expectedKey] = command.value; runtimeDirty = true; break;
          }
          if (CONTACT_SENSOR_DEFINITIONS[component.type]) {
            const expectedKey = CONTACT_SENSOR_DEFINITIONS[component.type].controlKeys[0];
            if (command.key !== expectedKey || typeof command.value !== 'boolean') {
              return failure('PROJECT_CONTACT_SENSOR_STATE', this.revision);
            }
            const evaluated = this.evaluateModel(component.type, { closed: command.value });
            if (!evaluated.ok || evaluated.result.connected !== command.value) {
              return failure('MODEL_LIBRARY_PRODUCTION_MISMATCH', this.revision, [component.id]);
            }
            component.controls[expectedKey] = command.value; runtimeDirty = true; break;
          }
          if (DIGITAL_PRESENCE_SENSOR_DEFINITIONS[component.type]) {
            const expectedKey = DIGITAL_PRESENCE_SENSOR_DEFINITIONS[component.type].controlKeys[0];
            if (command.key !== expectedKey || typeof command.value !== 'boolean') {
              return failure('PROJECT_CONTACT_DIGITAL_PRESENCE_SENSOR_STATE', this.revision);
            }
            const evaluated = this.evaluateModel(component.type, { active: command.value });
            if (!evaluated.ok || evaluated.result.digitalLevel !== command.value) {
              return failure('MODEL_LIBRARY_PRODUCTION_MISMATCH', this.revision, [component.id]);
            }
            component.controls[expectedKey] = command.value; runtimeDirty = true; break;
          }
          if (DIGITAL_PULSE_SENSOR_DEFINITIONS[component.type]) {
            if (command.key !== 'pulseHigh' || typeof command.value !== 'boolean') {
              return failure('PROJECT_CONTACT_DIGITAL_PULSE_SENSOR_STATE', this.revision);
            }
            const evaluated = this.evaluateModel(component.type, { pulseHigh: command.value });
            if (!evaluated.ok || evaluated.result.digitalLevel !== command.value) {
              return failure('MODEL_LIBRARY_PRODUCTION_MISMATCH', this.revision, [component.id]);
            }
            component.controls.pulseHigh = command.value; runtimeDirty = true; break;
          }
          if (DIGITAL_REFLECTIVE_SENSOR_DEFINITIONS[component.type]) {
            const expectedKey = DIGITAL_REFLECTIVE_SENSOR_DEFINITIONS[component.type].controlKeys[0];
            if (command.key !== expectedKey || typeof command.value !== 'boolean') {
              return failure('PROJECT_CONTACT_DIGITAL_REFLECTIVE_SENSOR_STATE', this.revision);
            }
            component.controls[expectedKey] = command.value; runtimeDirty = true; break;
          }
          if (component.type === SPDT_CONTACT_TYPE) {
            if (command.key !== 'selectedThrow' || !['A', 'B'].includes(command.value)) {
              return failure('PROJECT_CONTACT_SPDT_STATE', this.revision);
            }
            component.controls.selectedThrow = command.value;
            runtimeDirty = true;
            break;
          }
          if (component.type === LIGHT_ANALOGUE_SENSOR_TYPE) {
            if (command.key !== 'lightLevel' || !Number.isFinite(command.value)
                || command.value < 0 || command.value > 1) {
              return failure('PROJECT_CONTACT_LIGHT_SENSOR_STATE', this.revision);
            }
            const evaluated = this.evaluateModel(component.type, { lightLevel: command.value });
            if (!evaluated.ok) return failure(evaluated.code, this.revision, [component.id]);
            component.controls.lightLevel = command.value;
            runtimeDirty = true;
            break;
          }
          if (component.type === TEMPERATURE_ANALOGUE_SENSOR_TYPE) {
            if (command.key !== 'temperatureC' || !Number.isFinite(command.value)
                || command.value < TEMPERATURE_MIN_C || command.value > TEMPERATURE_MAX_C) {
              return failure('PROJECT_CONTACT_TEMPERATURE_SENSOR_STATE', this.revision);
            }
            const evaluated = this.evaluateModel(component.type, { temperatureC: command.value });
            if (!evaluated.ok) return failure(evaluated.code, this.revision, [component.id]);
            component.controls.temperatureC = command.value;
            runtimeDirty = true;
            break;
          }
          if (ANALOGUE_MOISTURE_LEVEL_DEFINITIONS[component.type]) {
            const expectedKey = ANALOGUE_MOISTURE_LEVEL_DEFINITIONS[component.type].controlKeys[0];
            if (command.key !== expectedKey || !Number.isFinite(command.value)
                || command.value < 0 || command.value > 1) {
              return failure('PROJECT_CONTACT_ANALOGUE_MOISTURE_LEVEL_SENSOR_STATE', this.revision);
            }
            const evaluated = this.evaluateModel(component.type, { ratio: command.value });
            if (!evaluated.ok) return failure(evaluated.code, this.revision, [component.id]);
            component.controls[expectedKey] = command.value;
            runtimeDirty = true;
            break;
          }
          if (ANALOGUE_DETECTION_DEFINITIONS[component.type]) {
            const expectedKey = ANALOGUE_DETECTION_DEFINITIONS[component.type].controlKeys[0];
            if (command.key !== expectedKey || !Number.isFinite(command.value)
                || command.value < 0 || command.value > 1) {
              return failure('PROJECT_CONTACT_ANALOGUE_DETECTION_SENSOR_STATE', this.revision);
            }
            const evaluated = this.evaluateModel(component.type, { ratio: command.value });
            if (!evaluated.ok) return failure(evaluated.code, this.revision, [component.id]);
            component.controls[expectedKey] = command.value;
            runtimeDirty = true;
            break;
          }
          if (ANALOGUE_DIRECTION_FIELD_DEFINITIONS[component.type]) {
            const definition = ANALOGUE_DIRECTION_FIELD_DEFINITIONS[component.type];
            const expectedKey = definition.controlKeys[0];
            if (command.key !== expectedKey || !Number.isFinite(command.value)
                || command.value < definition.control.minimum
                || command.value > definition.control.maximum) {
              return failure('PROJECT_CONTACT_ANALOGUE_DIRECTION_FIELD_SENSOR_STATE', this.revision);
            }
            const evaluated = this.evaluateModel(component.type, { [expectedKey]: command.value });
            if (!evaluated.ok) return failure(evaluated.code, this.revision, [component.id]);
            component.controls[expectedKey] = command.value;
            runtimeDirty = true;
            break;
          }
          if (ANALOGUE_TEMPERATURE_IC_DEFINITIONS[component.type]) {
            const definition = ANALOGUE_TEMPERATURE_IC_DEFINITIONS[component.type];
            if (command.key !== 'temperatureC' || !Number.isFinite(command.value)
                || command.value < definition.control.minimum
                || command.value > definition.control.maximum) {
              return failure('PROJECT_CONTACT_ANALOGUE_TEMPERATURE_IC_SENSOR_STATE', this.revision);
            }
            const evaluated = this.evaluateModel(component.type, { temperatureC: command.value });
            if (!evaluated.ok) return failure(evaluated.code, this.revision, [component.id]);
            component.controls.temperatureC = command.value;
            runtimeDirty = true;
            break;
          }
          if (component.type === DIGITAL_LIGHT_THRESHOLD_TYPE) {
            try {
              const updated = updateDigitalLightThresholdControl(component, command.key, command.value);
              const evaluated = this.evaluateModel(component.type, {
                lightLevelPercent: updated.controls.lightLevelPercent,
                thresholdPercent: updated.controls.thresholdPercent,
                hysteresisPercentagePoints: updated.controls.hysteresisPercentagePoints,
                currentActive: component.controls.outputActive,
              });
              if (!evaluated.ok || evaluated.result.outputActive !== updated.controls.outputActive) {
                return failure('MODEL_LIBRARY_PRODUCTION_MISMATCH', this.revision, [component.id]);
              }
              component.controls = updated.controls;
            } catch {
              return failure('PROJECT_CONTACT_DIGITAL_LIGHT_THRESHOLD_STATE', this.revision);
            }
            runtimeDirty = true;
            break;
          }
          if (component.type === ROTARY_ENCODER_TYPE) {
            if (command.key !== 'detent' || !Number.isInteger(command.value)
                || command.value < ROTARY_ENCODER_DETENT_MIN
                || command.value > ROTARY_ENCODER_DETENT_MAX) {
              return failure('PROJECT_CONTACT_ROTARY_ENCODER_STATE', this.revision);
            }
            const direction = command.value > component.controls.detent ? 'cw' : 'ccw';
            if (Math.abs(command.value - component.controls.detent) !== 1
                || !this.evaluateModel(component.type, { direction }).ok) {
              return failure('PROJECT_CONTACT_ROTARY_ENCODER_STATE', this.revision);
            }
            component.controls.detent = command.value;
            runtimeDirty = true;
            break;
          }
          return failure('CANDIDATE_EDITOR_CONTROL_UNSUPPORTED', this.revision);
        }
        default:
          return failure('CANDIDATE_EDITOR_COMMAND_UNSUPPORTED', this.revision);
      }
      return this.#accept(draft, 'EDITOR_COMMITTED', {
        runtimeDirty,
        changeRelevance: command.type === 'component.control.set' ? 'runtime' : null,
      });
    } catch (error) {
      return failure(error.code ?? error.message ?? 'CANDIDATE_EDITOR_INVALID', this.revision, error.details ?? []);
    }
  }
}

export function openPortableEditorSession(source, { modelLibraryLock = CURRENT_MODEL_LIBRARY_LOCK } = {}) {
  let value;
  try { value = parseStrictJson(source, CONTACT_PERSISTENCE_LIMIT); }
  catch (error) { return { ok: false, code: error.code ?? 'MALFORMED_JSON', details: [] }; }
  try {
    if (value?.schema === PROJECT_SCHEMA) {
      const validated = validateProjectV2(value);
      if (!validated.ok) return validated;
      return { ok: true, code: 'OK', kind: 'project-v2', session: new V2EditorSession(validated.project) };
    }
    if (value?.schema === CONTACT_PERSISTENCE_SCHEMA) {
      const validated = validateContactPersistenceDraft(value, { modelLibraryLock });
      if (!validated.ok) return validated;
      return {
        ok: true,
        code: 'OK',
        kind: 'candidate-project-v3',
        session: new CandidateEditorSession(validated.project, { modelLibraryLock }),
      };
    }
    return { ok: false, code: 'PROJECT_VERSION', details: [value?.schema ?? null] };
  } catch (error) {
    return { ok: false, code: error.code ?? error.message ?? 'PROJECT_INVALID', details: error.details ?? [] };
  }
}
