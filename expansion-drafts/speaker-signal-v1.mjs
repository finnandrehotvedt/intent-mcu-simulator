// SPDX-License-Identifier: Apache-2.0
import { exactKeys } from '../src/strict-json.mjs';
import { createPassivePiezoComponent, projectPassivePiezos } from './passive-piezo-v1.mjs';

export const SPEAKER_SIGNAL_TYPE = 'output.speaker-signal-v1';
export const SPEAKER_SIGNAL_MODEL = 'model.speaker-signal-transition-observer-v1';
export const SPEAKER_SIGNAL_RENDERER = 'output-speaker-signal';
export const SPEAKER_SIGNAL_RUNTIME_ADAPTER = 'avr-gpio-transition-observer-v1';
export const AVR_SPEAKER_SIGNAL_PINS = Object.freeze(['D3', 'D5', 'D6', 'D9', 'D10', 'D11']);
const deepFreeze = (value) => { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const child of Object.values(value)) deepFreeze(child); return Object.freeze(value); };
const pin = (id, label, role, signals, x, constraints) => ({ id, label, role, signals: [...signals], capabilities: [...signals], constraints: { ...constraints }, anchor: { x, y: 0.92 } });

export const SPEAKER_SIGNAL_DEFINITION = deepFreeze({
  family: 'output.speaker-signal', variant: 'two-terminal-visual-transition-observer', type: SPEAKER_SIGNAL_TYPE,
  version: 1, displayName: 'Speaker signal model', manufacturer: 'Intent Learning', partNumber: 'IL-SPEAKER-SIGNAL',
  pins: [pin('SIGNAL', 'PWM / digital signal', 'digital-in', ['digital.output-observer', 'pwm.output-observer'], 0.34, { voltageMin: 0, voltageMax: 5 }), pin('GND', 'Ground', 'ground', ['ground.reference'], 0.68, { voltage: 0 })],
  propertyKeys: [], propertySchema: {}, controlKeys: [], modelRef: SPEAKER_SIGNAL_MODEL,
  internalTerminalGroups: [], selectable: true,
  artwork: { renderer: SPEAKER_SIGNAL_RENDERER, thumbnail: SPEAKER_SIGNAL_RENDERER, viewBox: [0, 0, 120, 100], cssWidth: 120, cssHeight: 100,
    provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced package, photograph or third-party simulator artwork.', license: 'Apache-2.0' },
  catalog: { category: 'drivers', aliases: ['speaker', 'speaker signal', 'audio signal observer'], functions: ['visual output transition observation'], interfaces: ['GPIO', 'PWM'], supplyVolts: { min: 0, max: 5 }, package: 'original virtual two-terminal speaker signal observer' },
  support: { status: 'partial', limitations: [
    'AVR-only direct SIGNAL connection to D3, D5, D6, D9, D10 or D11 and direct GND connection.',
    'Visual rest, driven level and observed transition activity only; no browser audio is produced.',
    'No impedance, coil, cone, power, current, loading, calibrated frequency, loudness, resonance or physical speaker accuracy is modelled.',
  ] },
});
export function validateSpeakerSignalDefinition(value = SPEAKER_SIGNAL_DEFINITION) { return exactKeys(value, ['family','variant','type','version','displayName','manufacturer','partNumber','pins','propertyKeys','propertySchema','controlKeys','modelRef','internalTerminalGroups','selectable','artwork','catalog','support']) && JSON.stringify(value) === JSON.stringify(SPEAKER_SIGNAL_DEFINITION); }
export function createSpeakerSignalComponent(id, label = SPEAKER_SIGNAL_DEFINITION.displayName) { return { id, type: SPEAKER_SIGNAL_TYPE, label, properties: {}, controls: {} }; }
export function validateSpeakerSignalComponent(component) { return exactKeys(component, ['id','type','label','properties','controls']) && component.type === SPEAKER_SIGNAL_TYPE && exactKeys(component.properties, []) && exactKeys(component.controls, []); }
export function projectSpeakerSignals(value) {
  const graph = structuredClone(value); const ids = new Set();
  graph.components = graph.components.map((component) => { if (component.type !== SPEAKER_SIGNAL_TYPE) return component; if (!validateSpeakerSignalComponent(component)) return component; ids.add(component.id); return createPassivePiezoComponent(component.id, component.label); });
  const projected = projectPassivePiezos(graph);
  if (!projected.ok) return { ...projected, code: projected.code.replace('PASSIVE_PIEZO', 'SPEAKER_SIGNAL') };
  return { ok: true, runtimeGraph: projected.runtimeGraph, speakers: projected.piezos.filter(({ componentId }) => ids.has(componentId)).map((item) => ({ ...item, observerId: `${item.componentId}-speaker-transition-observer-v1`, displayModel: 'visual-speaker-driven-rest-and-transition-activity-only' })) };
}
