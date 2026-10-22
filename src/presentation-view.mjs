// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys, parseStrictJson } from './strict-json.mjs';

export const PRESENTATION_DRAFT_SCHEMA = 'intent-mcu-presentation-draft@1';
export const PRESENTATION_PROFILE = 'board.atmega328p-16mhz-v1';
export const PRESENTATION_INSTRUMENTS = Object.freeze([
  Object.freeze({ id: 'recorded-evidence', label: 'Recorded evidence' }),
  Object.freeze({ id: 'serial-output', label: 'Serial output' }),
  Object.freeze({ id: 'pin-inspector', label: 'Pin inspector' }),
  Object.freeze({ id: 'logic-analyser', label: 'Logic analyser' }),
]);
export const PRESENTATION_LIMITS = Object.freeze({ instruments: 4, steps: 12, title: 80, text: 1200,
  jsonBytes: 24 * 1024 });

const ID = /^[a-z][a-z0-9-]{0,63}$/u;
const FORBIDDEN = /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const clone = (value) => structuredClone(value);

function reject(code, details = []) {
  throw Object.assign(new Error(code), { code, details });
}

function plainText(value, maximum, code) {
  if (typeof value !== 'string') reject(code);
  const normalized = value.normalize('NFC').trim();
  if (!normalized || [...normalized].length > maximum || FORBIDDEN.test(normalized)) reject(code);
  return normalized;
}

export function normalizePresentationDraft(value, {
  availableInstrumentIds = PRESENTATION_INSTRUMENTS.map(({ id }) => id),
} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, ['schema', 'profileId', 'selectedInstrumentIds', 'steps'])
      || value.schema !== PRESENTATION_DRAFT_SCHEMA || value.profileId !== PRESENTATION_PROFILE) {
    reject('PRESENTATION_DRAFT_SHAPE');
  }
  if (!Array.isArray(availableInstrumentIds) || new Set(availableInstrumentIds).size !== availableInstrumentIds.length
      || availableInstrumentIds.some((id) => !ID.test(id))) reject('PRESENTATION_INSTRUMENT_REGISTRY');
  const available = new Set(availableInstrumentIds);
  if (!Array.isArray(value.selectedInstrumentIds) || value.selectedInstrumentIds.length < 1
      || value.selectedInstrumentIds.length > PRESENTATION_LIMITS.instruments) {
    reject('PRESENTATION_INSTRUMENT_LIMIT');
  }
  const selectedInstrumentIds = value.selectedInstrumentIds.map((id) => {
    if (typeof id !== 'string' || !available.has(id)) reject('PRESENTATION_INSTRUMENT_UNKNOWN', [id]);
    return id;
  });
  if (new Set(selectedInstrumentIds).size !== selectedInstrumentIds.length) {
    reject('PRESENTATION_INSTRUMENT_DUPLICATE');
  }
  if (!Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > PRESENTATION_LIMITS.steps) {
    reject('PRESENTATION_STEP_LIMIT');
  }
  const seen = new Set();
  const steps = value.steps.map((step) => {
    if (!step || typeof step !== 'object' || Array.isArray(step) || !exactKeys(step, ['id', 'title', 'text'])
        || typeof step.id !== 'string' || !ID.test(step.id) || seen.has(step.id)) {
      reject('PRESENTATION_STEP_SHAPE');
    }
    seen.add(step.id);
    return { id: step.id, title: plainText(step.title, PRESENTATION_LIMITS.title, 'PRESENTATION_STEP_TITLE'),
      text: plainText(step.text, PRESENTATION_LIMITS.text, 'PRESENTATION_STEP_TEXT') };
  });
  return Object.freeze({ schema: PRESENTATION_DRAFT_SCHEMA, profileId: PRESENTATION_PROFILE,
    selectedInstrumentIds: Object.freeze([...selectedInstrumentIds]),
    steps: Object.freeze(steps.map((step) => Object.freeze(step))) });
}

export function parsePresentationDraft(source, options = {}) {
  const text = typeof source === 'string' ? source : JSON.stringify(source);
  return normalizePresentationDraft(parseStrictJson(text, PRESENTATION_LIMITS.jsonBytes), options);
}

export function createPresentationViewOwner(options = {}) {
  let active = null;
  let selectedStep = 0;
  let binding = null;
  const snapshot = () => active ? Object.freeze({ active: true, draft: clone(active), selectedStep,
    step: clone(active.steps[selectedStep]), binding: clone(binding), authority: Object.freeze({
      apply: false, build: false, run: false, scenario: false, runtime: false, verdict: false,
    }) }) : Object.freeze({ active: false, draft: null, selectedStep: null, step: null, binding: null,
    authority: Object.freeze({ apply: false, build: false, run: false, scenario: false, runtime: false,
      verdict: false }) });
  return Object.freeze({
    open(value, contextBinding) {
      if (typeof contextBinding !== 'string' || !contextBinding) reject('PRESENTATION_BINDING');
      active = normalizePresentationDraft(value, options); selectedStep = 0; binding = contextBinding;
      return snapshot();
    },
    next() { if (!active) reject('PRESENTATION_INACTIVE'); selectedStep = Math.min(active.steps.length - 1, selectedStep + 1); return snapshot(); },
    previous() { if (!active) reject('PRESENTATION_INACTIVE'); selectedStep = Math.max(0, selectedStep - 1); return snapshot(); },
    invalidate(currentBinding) {
      if (!active || currentBinding === binding) return false;
      active = null; selectedStep = 0; binding = null; return true;
    },
    close() { active = null; selectedStep = 0; binding = null; return snapshot(); },
    snapshot,
  });
}
