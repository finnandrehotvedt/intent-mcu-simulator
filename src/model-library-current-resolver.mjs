// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { CURRENT_MODEL_LIBRARY_MANIFEST } from './model-library-snapshots.mjs';
import { CircuitRuntime, validateCircuit } from './circuit-engine.mjs';
import { RuntimeKernel } from './runtime-kernel.mjs';
import {
  candidateContactControl, candidateRuntimeInputs, openCandidateUiSession,
} from './candidate-existing-ui-adapter.mjs';
import { validateContactPersistenceDraft } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { createCharacterLcd4BitDecoder } from '../expansion-drafts/character-lcd-16x2-4bit-v1.mjs';
import { createPcf8574LcdDecoder } from '../expansion-drafts/pcf8574-lcd-backpack-v1.mjs';
import {
  nextRotaryEncoderDetent, rotaryEncoderDigitalSequence,
} from '../expansion-drafts/rotary-encoder-quadrature-v1.mjs';
import { observeRp2040PicoCircuit, validateRp2040PicoCircuit } from './rp2040-pico-circuit.mjs';
import { esp32C3RuntimeCircuit, validateEsp32C3Circuit } from './esp32c3-public-circuit.mjs';
import { validateStm32Circuit } from './stm32-public-circuit.mjs';

const entries = new Map(CURRENT_MODEL_LIBRARY_MANIFEST.entries.map((entry) =>
  [`${entry.profile}\u0000${entry.componentType}`, entry]));
const ledForwardVolts = Object.freeze({ red: 2, yellow: 2.1, green: 2.2, blue: 3 });
const sevenDigits = Object.freeze({
  0: ['a', 'b', 'c', 'd', 'e', 'f'], 1: ['b', 'c'], 2: ['a', 'b', 'd', 'e', 'g'],
  3: ['a', 'b', 'c', 'd', 'g'], 4: ['b', 'c', 'f', 'g'], 5: ['a', 'c', 'd', 'f', 'g'],
  6: ['a', 'c', 'd', 'e', 'f', 'g'], 7: ['a', 'b', 'c'],
  8: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], 9: ['a', 'b', 'c', 'd', 'f', 'g'],
});
const failure = (code, details = []) => ({ ok: false, code, details: structuredClone(details) });
const exactInput = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

// Current behavior is separately owned so future current changes cannot mutate
// the retained pre-X56 implementation by alias or shared constant.
export const CURRENT_MODEL_LIBRARY_IMPLEMENTATION = Object.freeze({
  id: 'intent-mcu-model-bundle-current-lcd-end-to-end-1@47',
  manifestVersion: CURRENT_MODEL_LIBRARY_MANIFEST.version,
  definition(profile, componentType) {
    const entry = entries.get(`${profile}\u0000${componentType}`);
    return entry ? structuredClone(entry) : null;
  },
  validateAvrCircuit(value, options = {}) { return validateCircuit(value, options); },
  createAvrCircuitRuntime(value, options = {}) { return new CircuitRuntime(value, options); },
  createAvrRuntimeKernel(hex, circuit, options = {}) { return new RuntimeKernel(hex, circuit, options); },
  validateCandidateDraft(value, options = {}) { return validateContactPersistenceDraft(value, options); },
  openCandidateUiSession(source, options = {}) { return openCandidateUiSession(source, options); },
  candidateRuntimeInputs(session) { return candidateRuntimeInputs(session); },
  candidateContactControl(session, componentId, key, value) {
    return candidateContactControl(session, componentId, key, value);
  },
  createCharacterLcdDecoder(mapping) { return createCharacterLcd4BitDecoder(mapping); },
  createPcf8574LcdDecoder(address) { return createPcf8574LcdDecoder(address); },
  rotaryEncoderSequence(projection, direction) { return rotaryEncoderDigitalSequence(projection, direction); },
  nextEncoderDetent(component, direction) { return nextRotaryEncoderDetent(component, direction); },
  observeRgb(duties) {
    return Object.fromEntries(['R', 'G', 'B'].map((key) =>
      [key, Math.max(0, Math.min(1, duties[key]))]));
  },
  observeBuzzer(level) { return { enabled: Boolean(level) }; },
  observeSevenSegment(activeSegments) { return [...new Set(activeSegments)].sort(); },
  validateProfile(profile, value, options = {}) {
    if (profile === 'board.rp2040-pico-v1') return validateRp2040PicoCircuit(value, options);
    if (profile === 'board.esp32-c3-devmodule-v1') return validateEsp32C3Circuit(value, options);
    if (profile === 'board.stm32f429zi-nucleo144-v1') return validateStm32Circuit(value, options);
    return failure('MODEL_LIBRARY_PROFILE_UNAVAILABLE', [profile]);
  },
  profileRuntimeCircuit(profile, value, options = {}) {
    if (profile === 'board.esp32-c3-devmodule-v1') return esp32C3RuntimeCircuit(value, options);
    return failure('MODEL_LIBRARY_PROFILE_RUNTIME_UNAVAILABLE', [profile]);
  },
  observeRp2040(value, runtime, options = {}) {
    return observeRp2040PicoCircuit(value, runtime, options);
  },
  evaluateReference(componentType, input) {
    if (componentType === 'resistor.fixed-v1') {
      if (!Number.isFinite(input?.volts) || !Number.isFinite(input?.ohms) || input.ohms <= 0) {
        return failure('MODEL_LIBRARY_REFERENCE_INPUT');
      }
      return { ok: true, code: 'OK', result: { amps: input.volts / input.ohms } };
    }
    if (componentType === 'led.basic-v1') {
      const threshold = ledForwardVolts[input?.color];
      if (!Number.isFinite(threshold) || !Number.isFinite(input?.volts)) {
        return failure('MODEL_LIBRARY_REFERENCE_INPUT');
      }
      return { ok: true, code: 'OK', result: { forwardVolts: threshold, lit: input.volts >= threshold } };
    }
    if (componentType === 'button.momentary-v1') {
      if (typeof input?.pressed !== 'boolean') return failure('MODEL_LIBRARY_REFERENCE_INPUT');
      return { ok: true, code: 'OK', result: { connected: input.pressed } };
    }
    if (componentType === 'potentiometer.linear-v1') {
      if (!Number.isFinite(input?.supplyVolts) || !Number.isFinite(input?.position)
          || input.position < 0 || input.position > 1) return failure('MODEL_LIBRARY_REFERENCE_INPUT');
      return { ok: true, code: 'OK', result: { outputVolts: input.supplyVolts * input.position } };
    }
    return failure('MODEL_LIBRARY_REFERENCE_UNAVAILABLE', [componentType]);
  },
  evaluateProduction(componentType, input) {
    if (componentType === 'resistor.fixed-v1') return this.evaluateReference(componentType, input);
    if (componentType === 'led.basic-v1') return this.evaluateReference(componentType, input);
    if (componentType === 'button.momentary-v1') return this.evaluateReference(componentType, input);
    if (componentType === 'potentiometer.linear-v1') return this.evaluateReference(componentType, input);
    if (componentType === 'reference.ground-v1') {
      return exactInput(input, []) ? { ok: true, code: 'OK', result: { potentialVolts: 0 } }
        : failure('MODEL_LIBRARY_PRODUCTION_INPUT');
    }
    if (componentType === 'switch.toggle-spst-v1') {
      if (typeof input?.closed !== 'boolean') return failure('MODEL_LIBRARY_PRODUCTION_INPUT');
      return { ok: true, code: 'OK', result: { connected: input.closed } };
    }
    if (componentType === 'switch.changeover-spdt-v1') {
      if (!['A', 'B'].includes(input?.selectedThrow)) return failure('MODEL_LIBRARY_PRODUCTION_INPUT');
      return { ok: true, code: 'OK', result: { selectedThrow: input.selectedThrow,
        activeContact: ['COM', input.selectedThrow], breakBeforeMake: true } };
    }
    if (componentType === 'sensor.light-analogue-v1') {
      if (!Number.isFinite(input?.lightLevel) || input.lightLevel < 0 || input.lightLevel > 1) {
        return failure('MODEL_LIBRARY_PRODUCTION_INPUT');
      }
      return { ok: true, code: 'OK', result: { outputVolts: input.lightLevel * 5 } };
    }
    if (componentType === 'sensor.temperature-analogue-v1') {
      if (!Number.isFinite(input?.temperatureC) || input.temperatureC < -50 || input.temperatureC > 150) {
        return failure('MODEL_LIBRARY_PRODUCTION_INPUT');
      }
      return { ok: true, code: 'OK', result: { outputVolts: (input.temperatureC + 50) / 40 } };
    }
    if (componentType === 'sensor.light-threshold-digital-v1') {
      const { lightLevelPercent, thresholdPercent, hysteresisPercentagePoints, currentActive } = input ?? {};
      if (![lightLevelPercent, thresholdPercent, hysteresisPercentagePoints].every(Number.isFinite)
          || lightLevelPercent < 0 || lightLevelPercent > 100 || thresholdPercent < 10
          || thresholdPercent > 100 || hysteresisPercentagePoints < 0
          || hysteresisPercentagePoints > 10 || typeof currentActive !== 'boolean') {
        return failure('MODEL_LIBRARY_PRODUCTION_INPUT');
      }
      const outputActive = lightLevelPercent >= thresholdPercent ? true
        : lightLevelPercent <= thresholdPercent - hysteresisPercentagePoints ? false : currentActive;
      return { ok: true, code: 'OK', result: { outputActive, digitalLevel: !outputActive } };
    }
    if (componentType === 'output.rgb-led-common-cathode-v1') {
      const duties = input?.duties;
      if (!duties || ['R', 'G', 'B'].some((key) => !Number.isFinite(duties[key]))) {
        return failure('MODEL_LIBRARY_PRODUCTION_INPUT');
      }
      return { ok: true, code: 'OK', result: { duties: Object.fromEntries(
        ['R', 'G', 'B'].map((key) => [key, Math.max(0, Math.min(1, duties[key]))]),
      ) } };
    }
    if (componentType === 'output.active-buzzer-module-v1') {
      if (typeof input?.level !== 'boolean') return failure('MODEL_LIBRARY_PRODUCTION_INPUT');
      return { ok: true, code: 'OK', result: { enabled: input.level } };
    }
    if (componentType === 'output.seven-segment-common-cathode-v1') {
      if (Array.isArray(input?.activeSegments)
          && input.activeSegments.every((segment) => ['a', 'b', 'c', 'd', 'e', 'f', 'g'].includes(segment))) {
        return { ok: true, code: 'OK', result: { activeSegments: [...new Set(input.activeSegments)].sort() } };
      }
      if (!Number.isInteger(input?.digit) || input.digit < 0 || input.digit > 9) {
        return failure('MODEL_LIBRARY_PRODUCTION_INPUT');
      }
      return { ok: true, code: 'OK', result: { activeSegments: [...sevenDigits[input.digit]] } };
    }
    if (componentType === 'output.character-lcd-16x2-4bit-v1') {
      if (!Array.isArray(input?.lines) || input.lines.length !== 2
          || input.lines.some((line) => typeof line !== 'string' || line.length > 16)) {
        return failure('MODEL_LIBRARY_PRODUCTION_INPUT');
      }
      return { ok: true, code: 'OK', result: { lines: [...input.lines], busMode: 'write-only-4bit' } };
    }
    if (componentType === 'output.character-lcd-16x2-pcf8574-v1') {
      if (!Array.isArray(input?.lines) || input.lines.length !== 2
          || input.lines.some((line) => typeof line !== 'string' || line.length > 16)) {
        return failure('MODEL_LIBRARY_PRODUCTION_INPUT');
      }
      return { ok: true, code: 'OK', result: { lines: [...input.lines], busMode: 'i2c-pcf8574-fixed-0x27' } };
    }
    if (componentType === 'input.rotary-encoder-quadrature-v1') {
      if (!['cw', 'ccw'].includes(input?.direction)) return failure('MODEL_LIBRARY_PRODUCTION_INPUT');
      const states = input.direction === 'cw' ? ['11', '01', '00', '10', '11']
        : ['11', '10', '00', '01', '11'];
      return { ok: true, code: 'OK', result: { states, phaseCycles: 16000 } };
    }
    if (['board.atmega328p-16mhz-v1', 'board.rp2040-pico-v1',
      'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1'].includes(componentType)) {
      return exactInput(input, []) ? { ok: true, code: 'OK', result: { profile: componentType } }
        : failure('MODEL_LIBRARY_PRODUCTION_INPUT');
    }
    return failure('MODEL_LIBRARY_PRODUCTION_UNAVAILABLE', [componentType]);
  },
});

export const PRE_LCD_END_TO_END_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-thumbnail-artwork-1@46',
  manifestVersion: '2.0.0-thumbnail-artwork.1-current',
  migrationOnly: true,
});

export const PRE_X46_USART_RX_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x46-usart-config-producer-2@44',
  migrationOnly: true,
});

export const PRE_THUMBNAIL_ARTWORK_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x46-usart-rx-producer-1@45',
  manifestVersion: '2.0.0-x46-usart-rx-producer.1-current',
  migrationOnly: true,
});

export const RC124_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-pwm-led-short-routing-1@43',
  manifestVersion: '2.0.0-pwm-led-short-routing.1-current',
  migrationOnly: true,
});

export const RC128_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x46-usart-rx-producer-1@45',
  manifestVersion: '2.0.0-x46-usart-rx-producer.1-current',
  migrationOnly: true,
});

export const RC120_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-retained-build-guard-1@41',
  manifestVersion: '2.0.0-retained-build-guard.1-current',
  migrationOnly: true,
});

export const PRE_RETAINED_BUILD_GUARD_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-runtime-ready-deadline-1@40',
  manifestVersion: '2.0.0-runtime-ready-deadline.1-current',
  migrationOnly: true,
});

export const PRE_X92_STM32_SOURCE_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x92-c3-retirement-proof-1@38',
  manifestVersion: '2.0.0-x92-c3-retirement-proof.1-current',
  migrationOnly: true,
});

export const RC112_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x48-current-source-integration-1@36',
  manifestVersion: '2.0.0-x48-current-source-integration.1-current',
  migrationOnly: true,
});

export const RC113_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x92-pico-owner-proof-1@37',
  manifestVersion: '2.0.0-x92-pico-owner-proof.1-current',
  migrationOnly: true,
});

export const PRE_X66_SUBCIRCUIT_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x66-bounded-subcircuits-1@33',
  manifestVersion: '2.0.0-x66-bounded-subcircuits.1-current',
  migrationOnly: true,
});

export const PRE_X66_PUBLIC_THERMOSTAT_CREATE_FIX_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x66-subcircuit-review-fix-1@34',
  manifestVersion: '2.0.0-x66-subcircuit-review-fix.1-current',
  migrationOnly: true,
});

export const PRE_X66_BOUNDED_SUBCIRCUITS_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x66-legacy-open-review-fix-1@32',
  manifestVersion: '2.0.0-x66-legacy-open-review-fix.1-current',
  migrationOnly: true,
});

export const PRE_X66_LEGACY_OPEN_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x66-existing-net-labels-1@31',
  manifestVersion: '2.0.0-x66-existing-net-labels.1-current',
  migrationOnly: true,
});

export const PRE_X66_NET_LABELS_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-teaching-review-fix-1@30',
  manifestVersion: '2.0.0-teaching-review-fix.1-current',
  migrationOnly: true,
});

export const PRE_TEACHING_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-teaching-batch-1@29',
  manifestVersion: '2.0.0-teaching-batch.1-current',
  migrationOnly: true,
});

export const PRE_TEACHING_BATCH_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x92-dispatch-gate-fix-1@28',
  manifestVersion: '2.0.0-x92-dispatch-gate-fix.1-current',
  migrationOnly: true,
});

export const PRE_X92_DISPATCH_GATE_FIX_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x92-runtime-lifetime-fix-1@27',
  manifestVersion: '2.0.0-x92-runtime-lifetime-fix.1-current',
  migrationOnly: true,
});

export const PRE_X92_RUNTIME_LIFETIME_FIX_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x92-review-fix-1@26',
  manifestVersion: '2.0.0-x92-review-fix.1-current',
  migrationOnly: true,
});

export const PRE_X92_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x92-private-budget-1@25',
  manifestVersion: '2.0.0-x92-private-budget.1-current',
  migrationOnly: true,
});

export const PRE_X92_BUDGET_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x55-model-copy-fix-1@24',
  manifestVersion: '2.0.0-x55-model-copy-fix.1-current',
  migrationOnly: true,
});

export const PRE_X55_MODEL_COPY_FIX_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x55-split-editor-1@23',
  manifestVersion: '2.0.0-x55-split-editor.1-current',
  migrationOnly: true,
});

export const PRE_X55_SPLIT_EDITOR_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x55-noop-apply-fix-1@22',
  manifestVersion: '2.0.0-x55-noop-apply-fix.1-current',
  migrationOnly: true,
});

export const PRE_X55_NOOP_APPLY_FIX_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x55-bounded-body-editor-2@21',
  manifestVersion: '2.0.0-x55-bounded-body-editor.2-current',
  migrationOnly: true,
});

export const PRE_X55_BODY_LEAD_FIX_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x55-bounded-body-editor-1@20',
  manifestVersion: '2.0.0-x55-bounded-body-editor.1-current',
  migrationOnly: true,
});

export const PRE_X55_BODY_EDITOR_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x55-led-outline-appearance-1@19',
  manifestVersion: '2.0.0-x55-led-outline-appearance.1-current',
  migrationOnly: true,
});

export const PRE_X55_LED_OUTLINE_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x55-all-profile-resistor-appearance-1@18',
  manifestVersion: '2.0.0-x55-all-profile-resistor-appearance.1-current',
  migrationOnly: true,
});

export const PRE_X55_ALL_PROFILE_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x47-repause-state-fix-1@17',
  manifestVersion: '2.0.0-x47-repause-state-fix.1-current',
  migrationOnly: true,
});

export const PRE_X47_REPEATABLE_APPLY_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x47-momentary-control-fix-1@15',
  manifestVersion: '2.0.0-x47-momentary-control-fix.1-current',
  migrationOnly: true,
});

export const PRE_X47_MOMENTARY_CONTROL_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x47-repeatable-inputs-candidate-2@14',
  manifestVersion: '2.0.0-x47-repeatable-inputs-candidate.2-current',
  migrationOnly: true,
});

export const PRE_X47_REPEATABLE_REJECTION_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x47-repeatable-inputs-candidate-1@13',
  manifestVersion: '2.0.0-x47-repeatable-inputs-candidate.1-current',
  migrationOnly: true,
});

export const PRE_X47_REPEATABLE_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x43-stack-hotpath-candidate-1@12',
  manifestVersion: '2.0.0-x43-stack-hotpath-candidate.1-current',
  migrationOnly: true,
});

export const PRE_X43_STACK_HOTPATH_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x43-observed-stack-candidate-1@11',
  manifestVersion: '2.0.0-x43-observed-stack-candidate.1-current',
  migrationOnly: true,
});

export const PRE_X43_STACK_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-ux-public-isolation-1@10',
  manifestVersion: '2.0.0-ux-public-isolation.1-current',
  migrationOnly: true,
});

export const PRE_UX_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x55-control-label-fix-1@9',
  manifestVersion: '2.0.0-x55-control-label-fix.1-current',
  migrationOnly: true,
});

export const PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x55-resistor-appearance-1@8',
  manifestVersion: '2.0.0-x55-resistor-appearance.1-current',
  migrationOnly: true,
});

export const PRE_X55_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x47-ui-async-epoch-1@7',
  manifestVersion: '2.0.0-x47-ui-async-epoch.1-current',
  migrationOnly: true,
});

// The immediately prior X56 lock remains available only to parse and migrate
// data-only saved projects. It deliberately shares the unchanged current
// component semantics, but cannot authorize runtime or retained verdict state.
export const PRIOR_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x56@2',
  manifestVersion: '2.0.0-x56-current',
  migrationOnly: true,
});

export const PRE_X47_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-pico-presentation-1@3',
  manifestVersion: '2.0.0-pico-presentation.1-current',
  migrationOnly: true,
});

export const PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x47-runtime-contract-1@4',
  manifestVersion: '2.0.0-x47-runtime-contract.1-current',
  migrationOnly: true,
});

export const PRE_X47_UI_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x47-receipt-validation-1@5',
  manifestVersion: '2.0.0-x47-receipt-validation.1-current',
  migrationOnly: true,
});

export const PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x47-ui-integration-1@6',
  manifestVersion: '2.0.0-x47-ui-integration.1-current',
  migrationOnly: true,
});

export const RC111_CURRENT_MODEL_LIBRARY_MIGRATION_IMPLEMENTATION = Object.freeze({
  ...CURRENT_MODEL_LIBRARY_IMPLEMENTATION,
  id: 'intent-mcu-model-bundle-current-x66-public-thermostat-create-fix-1@35',
  manifestVersion: '2.0.0-x66-public-thermostat-create-fix.1-current',
  migrationOnly: true,
});
