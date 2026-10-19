// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { RETAINED_MODEL_LIBRARY_MANIFEST } from './model-library-snapshots.mjs';
import {
  CircuitRuntime as RetainedCircuitRuntime,
  validateCircuit as validateRetainedAvrCircuit,
} from './model-bundles/retained-rc72/source/src/circuit-engine.mjs';
import { RuntimeKernel as RetainedRuntimeKernel } from './model-bundles/retained-rc72/source/src/runtime-kernel.mjs';
import {
  candidateContactControl as retainedCandidateContactControl,
  candidateRuntimeInputs as retainedCandidateRuntimeInputs,
  openCandidateUiSession as openRetainedCandidateUiSession,
} from './model-bundles/retained-rc72/source/src/candidate-existing-ui-adapter.mjs';
import {
  validateContactPersistenceDraft as validateRetainedCandidateDraft,
} from './model-bundles/retained-rc72/source/expansion-drafts/project-v3-contact-persistence.mjs';
import {
  createCharacterLcd4BitDecoder as createRetainedLcdDecoder,
} from './model-bundles/retained-rc72/source/expansion-drafts/character-lcd-16x2-4bit-v1.mjs';
import {
  nextRotaryEncoderDetent as retainedNextEncoderDetent,
  rotaryEncoderDigitalSequence as retainedEncoderSequence,
} from './model-bundles/retained-rc72/source/expansion-drafts/rotary-encoder-quadrature-v1.mjs';
import {
  observeRp2040PicoCircuit as observeRetainedRp2040,
  validateRp2040PicoCircuit as validateRetainedRp2040,
} from './model-bundles/retained-rc72/source/src/rp2040-pico-circuit.mjs';
import {
  esp32C3RuntimeCircuit as retainedC3RuntimeCircuit,
  validateEsp32C3Circuit as validateRetainedC3,
} from './model-bundles/retained-rc72/source/src/esp32c3-public-circuit.mjs';
import { validateStm32Circuit as validateRetainedStm32 } from './model-bundles/retained-rc72/source/src/stm32-public-circuit.mjs';

const entries = new Map(RETAINED_MODEL_LIBRARY_MANIFEST.entries.map((entry) =>
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

// This finite pre-X56 implementation intentionally owns its behavior constants
// and methods. It imports no current resolver state.
export const RETAINED_MODEL_LIBRARY_IMPLEMENTATION = Object.freeze({
  id: 'intent-mcu-model-bundle-retained-rc72@2',
  manifestVersion: RETAINED_MODEL_LIBRARY_MANIFEST.version,
  definition(profile, componentType) {
    const entry = entries.get(`${profile}\u0000${componentType}`);
    return entry ? structuredClone(entry) : null;
  },
  validateAvrCircuit(value, options = {}) { return validateRetainedAvrCircuit(value, options); },
  createAvrCircuitRuntime(value, options = {}) { return new RetainedCircuitRuntime(value, options); },
  createAvrRuntimeKernel(hex, circuit, options = {}) {
    return new RetainedRuntimeKernel(hex, circuit, options);
  },
  validateCandidateDraft(value) { return validateRetainedCandidateDraft(value); },
  openCandidateUiSession(source) { return openRetainedCandidateUiSession(source); },
  candidateRuntimeInputs(session) { return retainedCandidateRuntimeInputs(session); },
  candidateContactControl(session, componentId, key, value) {
    return retainedCandidateContactControl(session, componentId, key, value);
  },
  createCharacterLcdDecoder(mapping) { return createRetainedLcdDecoder(mapping); },
  rotaryEncoderSequence(projection, direction) {
    return retainedEncoderSequence(projection, direction);
  },
  nextEncoderDetent(component, direction) { return retainedNextEncoderDetent(component, direction); },
  observeRgb(duties) {
    return Object.fromEntries(['R', 'G', 'B'].map((key) =>
      [key, Math.max(0, Math.min(1, duties[key]))]));
  },
  observeBuzzer(level) { return { enabled: Boolean(level) }; },
  observeSevenSegment(activeSegments) { return [...new Set(activeSegments)].sort(); },
  validateProfile(profile, value) {
    if (profile === 'board.rp2040-pico-v1') return validateRetainedRp2040(value);
    if (profile === 'board.esp32-c3-devmodule-v1') return validateRetainedC3(value);
    if (profile === 'board.stm32f429zi-nucleo144-v1') return validateRetainedStm32(value);
    return failure('MODEL_LIBRARY_PROFILE_UNAVAILABLE', [profile]);
  },
  profileRuntimeCircuit(profile, value) {
    if (profile === 'board.esp32-c3-devmodule-v1') return retainedC3RuntimeCircuit(value);
    return failure('MODEL_LIBRARY_PROFILE_RUNTIME_UNAVAILABLE', [profile]);
  },
  observeRp2040(value, runtime) { return observeRetainedRp2040(value, runtime); },
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
    if (componentType === 'reference.ground-v1') return exactInput(input, [])
      ? { ok: true, code: 'OK', result: { potentialVolts: 0 } }
      : failure('MODEL_LIBRARY_PRODUCTION_INPUT');
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
      if (!Number.isFinite(input?.lightLevel) || input.lightLevel < 0 || input.lightLevel > 1) return failure('MODEL_LIBRARY_PRODUCTION_INPUT');
      return { ok: true, code: 'OK', result: { outputVolts: input.lightLevel * 5 } };
    }
    if (componentType === 'sensor.temperature-analogue-v1') {
      if (!Number.isFinite(input?.temperatureC) || input.temperatureC < -50 || input.temperatureC > 150) return failure('MODEL_LIBRARY_PRODUCTION_INPUT');
      return { ok: true, code: 'OK', result: { outputVolts: (input.temperatureC + 50) / 40 } };
    }
    if (componentType === 'sensor.light-threshold-digital-v1') {
      const { lightLevelPercent, thresholdPercent, hysteresisPercentagePoints, currentActive } = input ?? {};
      if (![lightLevelPercent, thresholdPercent, hysteresisPercentagePoints].every(Number.isFinite)
          || lightLevelPercent < 0 || lightLevelPercent > 100 || thresholdPercent < 10
          || thresholdPercent > 100 || hysteresisPercentagePoints < 0
          || hysteresisPercentagePoints > 10 || typeof currentActive !== 'boolean') return failure('MODEL_LIBRARY_PRODUCTION_INPUT');
      const outputActive = lightLevelPercent >= thresholdPercent ? true
        : lightLevelPercent <= thresholdPercent - hysteresisPercentagePoints ? false : currentActive;
      return { ok: true, code: 'OK', result: { outputActive, digitalLevel: !outputActive } };
    }
    if (componentType === 'output.rgb-led-common-cathode-v1') {
      const duties = input?.duties;
      if (!duties || ['R', 'G', 'B'].some((key) => !Number.isFinite(duties[key]))) return failure('MODEL_LIBRARY_PRODUCTION_INPUT');
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
      if (!Number.isInteger(input?.digit) || input.digit < 0 || input.digit > 9) return failure('MODEL_LIBRARY_PRODUCTION_INPUT');
      return { ok: true, code: 'OK', result: { activeSegments: [...sevenDigits[input.digit]] } };
    }
    if (componentType === 'output.character-lcd-16x2-4bit-v1') {
      if (!Array.isArray(input?.lines) || input.lines.length !== 2
          || input.lines.some((line) => typeof line !== 'string' || line.length > 16)) return failure('MODEL_LIBRARY_PRODUCTION_INPUT');
      return { ok: true, code: 'OK', result: { lines: [...input.lines], busMode: 'write-only-4bit' } };
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
