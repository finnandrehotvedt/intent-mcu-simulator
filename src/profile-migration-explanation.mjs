// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { validateBoundedSource } from '../c3/protocol.mjs';
import { validateStm32Source } from '../stm32/protocol.mjs';
import { COMPONENT_CATALOG } from './component-catalog.mjs';
import {
  COMPONENT_SUPPORT_MODELS, COMPONENT_SUPPORT_PROFILES, componentSupportCell,
} from './component-support-matrix.mjs';
import {
  AVR_PROFILE, ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE,
} from './compile-targets.mjs';
import { controllerCapability } from './controller-capabilities.mjs';
import { ESP32C3_BOARD_DEFINITION } from './esp32c3-public-circuit.mjs';
import { evaluateProjectFeasibility } from './project-feasibility.mjs';
import { RP2040_PICO_BOARD_DEFINITION } from './rp2040-pico-circuit.mjs';
import { describeRp2040PublicSource } from './rp2040-public-workbench.mjs';
import { STM32_BOARD_DEFINITION } from './stm32-public-circuit.mjs';

export const PROFILE_MIGRATION_EXPLANATION_SCHEMA = 'intent-mcu-profile-migration-explanation@1';
export const MIGRATION_PROFILES = Object.freeze([
  AVR_PROFILE, RP2040_PROFILE, ESP32C3_PROFILE, STM32F429ZI_PROFILE,
]);

const profileLabels = new Map(COMPONENT_SUPPORT_PROFILES.map((profile) => [profile.id, profile.label]));
const modelLabels = new Map(COMPONENT_SUPPORT_MODELS.map((model) => [model.type, model.name]));
const boards = Object.freeze({
  [AVR_PROFILE]: COMPONENT_CATALOG[AVR_PROFILE],
  [RP2040_PROFILE]: RP2040_PICO_BOARD_DEFINITION,
  [ESP32C3_PROFILE]: ESP32C3_BOARD_DEFINITION,
  [STM32F429ZI_PROFILE]: STM32_BOARD_DEFINITION,
});

const clone = (value) => structuredClone(value);
const unique = (values) => [...new Set(values)];

function sourceText(project) {
  if (typeof project?.source === 'string') return project.source;
  if (Array.isArray(project?.source?.files)) return project.source.files.map((file) => file.content).join('\n');
  return '';
}

function sourceUsage(profile, project) {
  const source = sourceText(project);
  if (profile === AVR_PROFILE) return {
    state: 'unknown', pins: [], apis: [],
    reason: 'Arbitrary AVR sketch semantics are not inferred. Review the source and saved project requirements before choosing replacements.',
  };
  try {
    if (profile === RP2040_PROFILE) {
      const result = describeRp2040PublicSource(source);
      if (!result.recognized) throw new Error('SOURCE_NOT_RECOGNIZED');
      return { state: 'recognized', pins: [...result.pins], apis: [...result.apis],
        reason: 'The source matches the exact bounded Pico grammar.' };
    }
    if (profile === ESP32C3_PROFILE) {
      validateBoundedSource(source);
      return { state: 'recognized', pins: ['GPIO2'],
        apis: ['Serial.begin', 'pinMode', 'digitalWrite', 'Serial.println', 'delay'],
        reason: 'The source matches the exact bounded ESP32-C3 grammar.' };
    }
    if (profile === STM32F429ZI_PROFILE) {
      validateStm32Source(source);
      return { state: 'recognized', pins: ['PB0'],
        apis: ['intent_pb0_output', 'intent_usart3_text', 'intent_halt'],
        reason: 'The source matches the exact bounded STM32 grammar.' };
    }
  } catch {
    return { state: 'unknown', pins: [], apis: [],
      reason: 'The current source does not match this profile’s exact bounded grammar, so its pin/API semantics remain unknown.' };
  }
  return { state: 'unknown', pins: [], apis: [], reason: 'No project-owned source analyser exists for this profile.' };
}

function circuitFacts(profile, project) {
  const circuit = project?.circuit;
  const components = Array.isArray(circuit?.components) ? circuit.components : [];
  const boardIds = new Set(components.filter((component) => component.type === profile).map((component) => component.id));
  const pins = unique((Array.isArray(circuit?.nets) ? circuit.nets : [])
    .flatMap((net) => net.endpoints ?? [])
    .filter((endpoint) => boardIds.has(endpoint.component))
    .map((endpoint) => endpoint.pin));
  const parts = unique(components.filter((component) => !component.type.startsWith('board.'))
    .map((component) => component.type));
  return { pins, parts };
}

function targetPinSummary(targetProfile) {
  return boards[targetProfile].pins.map((pin) => ({ id: pin.id, label: pin.label, role: pin.role }));
}

export function explainProfileMigration({ fromProfile, toProfile, project, requiredCapabilities = [] }) {
  if (!MIGRATION_PROFILES.includes(fromProfile) || !MIGRATION_PROFILES.includes(toProfile)
      || fromProfile === toProfile) throw new Error('PROFILE_MIGRATION_PAIR');
  const before = JSON.stringify({ project, requiredCapabilities });
  const source = sourceUsage(fromProfile, project);
  const circuit = circuitFacts(fromProfile, project);
  const target = controllerCapability(toProfile);
  const targetPins = targetPinSummary(toProfile);
  const feasibility = evaluateProjectFeasibility(toProfile, requiredCapabilities);
  const parts = circuit.parts.map((model) => {
    const cell = componentSupportCell(toProfile, model);
    return {
      model,
      label: modelLabels.get(model) ?? model,
      state: cell?.available ? 'available' : 'unsupported',
      reason: cell?.available
        ? `Available in ${cell.projectMode}; properties and wiring still require review.`
        : cell?.limitations.join(' ') ?? 'No target-profile component authority exists.',
    };
  });
  const report = {
    schema: PROFILE_MIGRATION_EXPLANATION_SCHEMA,
    from: { profile: fromProfile, label: profileLabels.get(fromProfile), sourceFile: controllerCapability(fromProfile).sourceFile },
    to: { profile: toProfile, label: profileLabels.get(toProfile), sourceFile: target.sourceFile },
    automaticMigration: false,
    mutatesProject: false,
    source: {
      state: source.state,
      currentPins: source.pins,
      currentApis: source.apis,
      reason: source.reason,
      targetContract: target.language.grammar,
      action: `Create or rewrite ${target.sourceFile} for the target contract; the current source is not copied or translated.`,
    },
    pins: {
      used: circuit.pins,
      targetAvailable: targetPins,
      action: circuit.pins.length
        ? `Reconnect each named source pin manually. ${circuit.pins.join(', ')} are not aliases for ${targetPins.map((pin) => pin.id).join(', ')}.`
        : 'No connected controller pin was found in the saved circuit. Inspect incomplete wiring before redesigning it.',
      automaticMap: false,
    },
    parts,
    requirements: clone(feasibility),
    warnings: [
      'Controller boards are profile-specific and must be replaced, never retyped in place.',
      'No wire, source file, component, runtime result, test verdict or executable authority is changed by this explanation.',
      'Build the target project fresh only after manual source and circuit work is complete.',
    ],
  };
  if (JSON.stringify({ project, requiredCapabilities }) !== before) throw new Error('PROFILE_MIGRATION_MUTATION');
  return clone(report);
}
