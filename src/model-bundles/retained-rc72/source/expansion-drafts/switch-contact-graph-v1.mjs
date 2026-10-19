// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys, parseStrictJson } from '../src/strict-json.mjs';

export const SWITCH_CONTACT_GRAPH_SCHEMA = 'intent-mcu-switch-contact-graph@1';
export const SWITCH_CONTACT_STATE_SCHEMA = 'intent-mcu-switch-contact-state@1';
export const SPDT_CONTACT_TYPE = 'switch.changeover-spdt-v1';
export const SPDT_CONTACT_RENDERER = 'switch-changeover-spdt';
export const SPDT_STABLE_STATES = Object.freeze(['A', 'B']);
export const SPDT_TRANSITION_STATE = 'BREAK';

const TERMINALS = Object.freeze(['COM', 'A', 'B']);
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const SPDT_CONTACT_DEFINITION = deepFreeze({
  schema: SWITCH_CONTACT_GRAPH_SCHEMA,
  type: SPDT_CONTACT_TYPE,
  version: 1,
  displayName: 'SPDT changeover contact',
  status: 'blocked-adapter-foundation',
  terminals: [
    { id: 'COM', label: 'Common', role: 'passive', anchor: { x: 0.08, y: 0.5 } },
    { id: 'A', label: 'Throw A', role: 'passive', anchor: { x: 0.92, y: 0.23 } },
    { id: 'B', label: 'Throw B', role: 'passive', anchor: { x: 0.92, y: 0.77 } },
  ],
  stableStates: SPDT_STABLE_STATES,
  transitionState: SPDT_TRANSITION_STATE,
  transitionPolicy: 'break-before-make',
  artwork: {
    renderer: SPDT_CONTACT_RENDERER,
    viewBox: [0, 0, 150, 100], cssWidth: 180, cssHeight: 120,
    provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
    license: 'Apache-2.0',
  },
  limitations: [
    'Ideal mutually exclusive contact connectivity only.',
    'No bounce, contact resistance, current rating, arcing, switching time or analogue behavior.',
    'Blocked from production activation until a versioned dynamic-contact circuit and project schema exists.',
  ],
});

function sameJson(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function stableState(value) { return SPDT_STABLE_STATES.includes(value); }
function graphState(value) { return stableState(value) || value === SPDT_TRANSITION_STATE; }
function error(code, details = []) { return { ok: false, code, details }; }

export function validateSwitchContactDefinition(definition = SPDT_CONTACT_DEFINITION) {
  return exactKeys(definition, [
    'schema', 'type', 'version', 'displayName', 'status', 'terminals', 'stableStates',
    'transitionState', 'transitionPolicy', 'artwork', 'limitations',
  ]) && sameJson(definition, SPDT_CONTACT_DEFINITION);
}

export function resolveSwitchContactGraph(state) {
  if (!graphState(state)) throw new TypeError('SWITCH_CONTACT_STATE');
  const activeContacts = state === SPDT_TRANSITION_STATE ? [] : [['COM', state]];
  return deepFreeze({
    schema: SWITCH_CONTACT_GRAPH_SCHEMA,
    state,
    terminals: [...TERMINALS],
    activeContacts,
    isolatedTerminals: state === 'A' ? ['B'] : state === 'B' ? ['A'] : [...TERMINALS],
    mutuallyExclusive: activeContacts.length <= 1,
  });
}

export function transitionSwitchContact(from, to) {
  if (!stableState(from) || !stableState(to)) throw new TypeError('SWITCH_CONTACT_STATE');
  const states = from === to ? [from] : [from, SPDT_TRANSITION_STATE, to];
  const frames = states.map(resolveSwitchContactGraph);
  if (frames.some((frame) => frame.activeContacts.length > 1)) throw new Error('SWITCH_CONTACT_BRIDGE');
  return deepFreeze({
    policy: 'break-before-make', from, to, frames,
    breakObserved: from === to || frames.some((frame) => frame.state === SPDT_TRANSITION_STATE
      && frame.activeContacts.length === 0),
  });
}

function validNetMap(value) {
  return exactKeys(value, TERMINALS)
    && Object.values(value).every((item) => item === null || (typeof item === 'string' && item.length > 0));
}

function validAnnotationMap(value, allowed) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.entries(value).every(([netId, annotations]) => netId.length > 0
      && Array.isArray(annotations) && annotations.every((item) => allowed.has(item)));
}

export function analyzeSwitchContactSafety(value, state) {
  if (!graphState(state)) return error('SWITCH_CONTACT_STATE');
  if (!exactKeys(value, ['terminalNets', 'netClasses', 'drivers'])) return error('SWITCH_CONTACT_SHAPE');
  const { terminalNets, netClasses, drivers } = value;
  if (!validNetMap(terminalNets)) return error('SWITCH_CONTACT_TERMINALS');
  const knownClasses = new Set(['power.5v-reference', 'ground.reference']);
  const knownDrivers = new Set(['HIGH', 'LOW', 'HIGH_Z', 'PULLED_HIGH']);
  if (!validAnnotationMap(netClasses, knownClasses) || !validAnnotationMap(drivers, knownDrivers)) {
    return error('SWITCH_CONTACT_ANNOTATIONS');
  }
  const graph = resolveSwitchContactGraph(state);
  const active = graph.activeContacts[0] ?? null;
  const mergedNets = active
    ? [...new Set(active.map((terminal) => terminalNets[terminal]).filter(Boolean))].sort()
    : [];
  const classes = new Set(mergedNets.flatMap((netId) => netClasses[netId] ?? []));
  const activeDrivers = new Set(mergedNets.flatMap((netId) => drivers[netId] ?? [])
    .filter((driver) => driver === 'HIGH' || driver === 'LOW'));
  let code = 'OK';
  if (classes.has('power.5v-reference') && classes.has('ground.reference')) code = 'POWER_SHORT';
  else if (activeDrivers.has('HIGH') && activeDrivers.has('LOW')) code = 'OUTPUT_CONTENTION';
  const diagnostic = code === 'OK' ? [] : [{
    code, severity: 'block', terminals: active ? [...active] : [], nets: [...mergedNets],
  }];
  return {
    ok: code === 'OK', code, state, activeContact: active ? [...active] : null,
    mergedNets, diagnostics: diagnostic,
  };
}

export function createSwitchContactState(id, selectedThrow = 'B') {
  if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/u.test(id)) throw new TypeError('SWITCH_CONTACT_ID');
  if (!stableState(selectedThrow)) throw new TypeError('SWITCH_CONTACT_STATE');
  return {
    schema: SWITCH_CONTACT_STATE_SCHEMA,
    id,
    type: SPDT_CONTACT_TYPE,
    selectedThrow,
  };
}

export function createSwitchContactComponent(id, label = 'SPDT changeover contact', { selectedThrow = 'B' } = {}) {
  const state = createSwitchContactState(id, selectedThrow);
  return {
    id: state.id,
    type: SPDT_CONTACT_TYPE,
    label,
    properties: { transitionPolicy: 'break-before-make' },
    controls: { selectedThrow: state.selectedThrow },
  };
}

export function validateSwitchContactState(value) {
  if (!exactKeys(value, ['schema', 'id', 'type', 'selectedThrow'])) return error('SWITCH_CONTACT_SHAPE');
  if (value.schema !== SWITCH_CONTACT_STATE_SCHEMA || value.type !== SPDT_CONTACT_TYPE) {
    return error('SWITCH_CONTACT_VERSION');
  }
  if (typeof value.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/u.test(value.id)) {
    return error('SWITCH_CONTACT_ID');
  }
  if (!stableState(value.selectedThrow)) return error('SWITCH_CONTACT_STATE');
  return { ok: true, code: 'OK', state: createSwitchContactState(value.id, value.selectedThrow) };
}

export function parseSwitchContactState(source) {
  try { return validateSwitchContactState(parseStrictJson(source, 16 * 1024)); }
  catch (exception) { return error(exception.code ?? 'MALFORMED_JSON'); }
}

export function canonicalSwitchContactStateJson(value) {
  const result = validateSwitchContactState(value);
  if (!result.ok) throw new Error(result.code);
  return JSON.stringify(result.state);
}

export function projectV2SwitchContactCompatibility() {
  return deepFreeze({
    ok: false,
    code: 'PROJECT_V2_DYNAMIC_CONTACT_UNSUPPORTED',
    currentProjectSchema: 'teach-lab-project@2',
    requiredCapability: 'versioned three-terminal dynamic-contact graph and persisted stable control state',
    fallback: 'isolated contact-state envelope only',
  });
}

export function switchContactCandidateCounts() {
  return Object.freeze({
    activeDefinitions: 6,
    activeSelectable: 5,
    isolatedFunctionalCandidates: 2,
    isolatedBlockedAdapterFoundations: 1,
  });
}
