// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const FOUNDATION_DRAFT_SCHEMA = 'intent-mcu-component-draft@1';

const SIGNAL_CLASSES = new Set([
  'passive.two-terminal', 'power.5v-reference', 'ground.reference',
]);
const DEFINITION_KEYS = Object.freeze([
  'schema', 'type', 'version', 'displayName', 'selectable', 'runtimeStatus',
  'activation', 'pins', 'properties', 'electrical', 'artwork', 'diagnostics',
  'acceptanceFixtures',
]);
const PIN_KEYS = Object.freeze(['id', 'label', 'role', 'signals', 'anchor']);
const PROPERTY_KEYS = Object.freeze([
  'key', 'kind', 'unit', 'default', 'minimum', 'maximum', 'editable',
]);
const ELECTRICAL_KEYS = Object.freeze(['runPolicy', 'assumptions', 'unsupported']);
const ARTWORK_KEYS = Object.freeze(['rendererKey', 'provenance', 'license']);
const DIAGNOSTIC_KEYS = Object.freeze(['code', 'severity', 'when']);
const FIXTURE_KEYS = Object.freeze(['id', 'kind', 'expected']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function pin(id, label, role, signals, x, y) {
  return { id, label, role, signals, anchor: { x, y } };
}

function numberProperty(key, unit, defaultValue, minimum, maximum, editable = true) {
  return { key, kind: 'number', unit, default: defaultValue, minimum, maximum, editable };
}

function diagnostic(code, when) {
  return { code, severity: 'block', when };
}

function fixture(id, kind, expected) {
  return { id, kind, expected };
}

const commonArtwork = {
  provenance: 'Original IntentForce geometry plan assembled from basic shapes; no traced or third-party simulator artwork.',
  license: 'Apache-2.0',
};

export const FOUNDATION_PRIMITIVE_DRAFTS = deepFreeze([
  {
    schema: FOUNDATION_DRAFT_SCHEMA,
    type: 'capacitor.nonpolarized-v1',
    version: 1,
    displayName: 'Non-polarized capacitor',
    selectable: false,
    runtimeStatus: 'unsupported',
    activation: 'contract-only',
    pins: [
      pin('A', 'Terminal A', 'passive', ['passive.two-terminal'], 0.08, 0.5),
      pin('B', 'Terminal B', 'passive', ['passive.two-terminal'], 0.92, 0.5),
    ],
    properties: [numberProperty('capacitanceFarads', 'F', 100e-9, 1e-12, 1)],
    electrical: {
      runPolicy: 'block-when-connected',
      assumptions: ['Two-terminal, non-polarized identity only.', 'Capacitance is a nameplate value, not an active runtime equation.'],
      unsupported: ['Charge/discharge curves', 'ESR and leakage', 'Transient, frequency and tolerance behaviour'],
    },
    artwork: { ...commonArtwork, rendererKey: 'draft-capacitor-basic-geometry' },
    diagnostics: [
      diagnostic('CAPACITANCE_OUT_OF_RANGE', 'The capacitance is non-finite or outside 1 pF through 1 F.'),
      diagnostic('CAPACITOR_NETWORK_UNSUPPORTED', 'A connected capacitor would require a transient circuit model.'),
    ],
    acceptanceFixtures: [
      fixture('capacitor-default-contract', 'definition', 'ACCEPT'),
      fixture('capacitor-minimum-bound', 'property-boundary', 'ACCEPT'),
      fixture('capacitor-maximum-bound', 'property-boundary', 'ACCEPT'),
      fixture('capacitor-below-minimum', 'invalid-property', 'CAPACITANCE_OUT_OF_RANGE'),
      fixture('capacitor-above-maximum', 'invalid-property', 'CAPACITANCE_OUT_OF_RANGE'),
      fixture('capacitor-connected-network', 'unsupported-topology', 'CAPACITOR_NETWORK_UNSUPPORTED'),
    ],
  },
  {
    schema: FOUNDATION_DRAFT_SCHEMA,
    type: 'diode.rectifier-v1',
    version: 1,
    displayName: 'Rectifier diode',
    selectable: false,
    runtimeStatus: 'unsupported',
    activation: 'contract-only',
    pins: [
      pin('ANODE', 'Anode', 'passive-polarized', ['passive.two-terminal'], 0.08, 0.5),
      pin('CATHODE', 'Cathode', 'passive-polarized', ['passive.two-terminal'], 0.92, 0.5),
    ],
    properties: [
      numberProperty('nominalForwardVoltageVolts', 'V', 0.7, 0.2, 1.2),
      numberProperty('maxReverseVoltageVolts', 'V', 50, 1, 1_000),
    ],
    electrical: {
      runPolicy: 'block-when-connected',
      assumptions: ['ANODE and CATHODE identity is explicit.', 'Ratings are bounded nameplate metadata only.'],
      unsupported: ['Current-voltage curve', 'Reverse breakdown', 'Temperature, recovery time and power dissipation'],
    },
    artwork: { ...commonArtwork, rendererKey: 'draft-diode-basic-geometry' },
    diagnostics: [
      diagnostic('DIODE_FORWARD_VOLTAGE_OUT_OF_RANGE', 'Nominal forward voltage is non-finite or outside 0.2 V through 1.2 V.'),
      diagnostic('DIODE_REVERSE_RATING_OUT_OF_RANGE', 'Maximum reverse voltage is non-finite or outside 1 V through 1000 V.'),
      diagnostic('DIODE_NETWORK_UNSUPPORTED', 'A connected diode would require an unapproved nonlinear circuit model.'),
    ],
    acceptanceFixtures: [
      fixture('diode-default-contract', 'definition', 'ACCEPT'),
      fixture('diode-pin-identity', 'pin-identity', 'ACCEPT'),
      fixture('diode-forward-voltage-invalid', 'invalid-property', 'DIODE_FORWARD_VOLTAGE_OUT_OF_RANGE'),
      fixture('diode-reverse-rating-invalid', 'invalid-property', 'DIODE_REVERSE_RATING_OUT_OF_RANGE'),
      fixture('diode-forward-connected', 'unsupported-topology', 'DIODE_NETWORK_UNSUPPORTED'),
      fixture('diode-reverse-connected', 'unsupported-topology', 'DIODE_NETWORK_UNSUPPORTED'),
    ],
  },
  {
    schema: FOUNDATION_DRAFT_SCHEMA,
    type: 'reference.power-5v-v1',
    version: 1,
    displayName: '5 V reference',
    selectable: false,
    runtimeStatus: 'unsupported',
    activation: 'contract-only',
    pins: [pin('OUT', '5 V reference output', 'power-out', ['power.5v-reference'], 0.5, 0.92)],
    properties: [numberProperty('voltageVolts', 'V', 5, 5, 5, false)],
    electrical: {
      runPolicy: 'block-when-connected',
      assumptions: ['Exactly 5 V reference metadata.', 'No hidden source impedance or current capacity is invented.'],
      unsupported: ['Independent supply simulation', 'Current limiting', 'Parallel or opposing source resolution'],
    },
    artwork: { ...commonArtwork, rendererKey: 'draft-power-reference-basic-geometry' },
    diagnostics: [
      diagnostic('POWER_REFERENCE_FIXED_5V', 'Imported voltage is not exactly the immutable 5 V value.'),
      diagnostic('POWER_REFERENCE_CONFLICT', 'The reference shares a net with another source or ground.'),
      diagnostic('POWER_REFERENCE_SCOPE_UNSUPPORTED', 'A free-standing power reference is connected before a source contract is approved.'),
    ],
    acceptanceFixtures: [
      fixture('power-reference-default-contract', 'definition', 'ACCEPT'),
      fixture('power-reference-pin-identity', 'pin-identity', 'ACCEPT'),
      fixture('power-reference-mutated-value', 'invalid-property', 'POWER_REFERENCE_FIXED_5V'),
      fixture('power-reference-with-ground', 'invalid-topology', 'POWER_REFERENCE_CONFLICT'),
      fixture('power-reference-with-output', 'invalid-topology', 'POWER_REFERENCE_CONFLICT'),
      fixture('power-reference-connected-alone', 'unsupported-topology', 'POWER_REFERENCE_SCOPE_UNSUPPORTED'),
    ],
  },
  {
    schema: FOUNDATION_DRAFT_SCHEMA,
    type: 'reference.ground-v1',
    version: 1,
    displayName: 'Ground reference',
    selectable: false,
    runtimeStatus: 'unsupported',
    activation: 'contract-only',
    pins: [pin('REF', 'Ground reference', 'ground', ['ground.reference'], 0.5, 0.08)],
    properties: [numberProperty('potentialVolts', 'V', 0, 0, 0, false)],
    electrical: {
      runPolicy: 'block-when-connected',
      assumptions: ['Exactly 0 V reference metadata.', 'No earth, chassis or protective-ground claim is made.'],
      unsupported: ['Earth/chassis bonding', 'Ground loops', 'Independent reference-domain resolution'],
    },
    artwork: { ...commonArtwork, rendererKey: 'draft-ground-reference-basic-geometry' },
    diagnostics: [
      diagnostic('GROUND_REFERENCE_FIXED_0V', 'Imported potential is not exactly the immutable 0 V value.'),
      diagnostic('GROUND_REFERENCE_CONFLICT', 'The reference shares a net with an opposing source.'),
      diagnostic('GROUND_REFERENCE_SCOPE_UNSUPPORTED', 'A free-standing ground reference is connected before reference-domain rules are approved.'),
    ],
    acceptanceFixtures: [
      fixture('ground-reference-default-contract', 'definition', 'ACCEPT'),
      fixture('ground-reference-pin-identity', 'pin-identity', 'ACCEPT'),
      fixture('ground-reference-mutated-value', 'invalid-property', 'GROUND_REFERENCE_FIXED_0V'),
      fixture('ground-reference-with-source', 'invalid-topology', 'GROUND_REFERENCE_CONFLICT'),
      fixture('ground-reference-domain-merge', 'unsupported-topology', 'GROUND_REFERENCE_SCOPE_UNSUPPORTED'),
      fixture('ground-reference-serialization', 'canonical-serialization', 'ACCEPT'),
    ],
  },
]);

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function strings(value) {
  return Array.isArray(value) && value.length > 0
    && value.every((item) => typeof item === 'string' && item.trim().length > 0)
    && new Set(value).size === value.length;
}

export function validateFoundationPrimitiveDraft(definition) {
  try {
    if (!exactKeys(definition, DEFINITION_KEYS)
      || definition.schema !== FOUNDATION_DRAFT_SCHEMA
      || !/^[a-z][a-z0-9-]*\.[a-z0-9-]+-v[1-9][0-9]*$/u.test(definition.type)
      || !Number.isInteger(definition.version) || definition.version < 1
      || typeof definition.displayName !== 'string' || !definition.displayName.trim()
      || definition.selectable !== false || definition.runtimeStatus !== 'unsupported'
      || definition.activation !== 'contract-only') return false;

    if (!Array.isArray(definition.pins) || definition.pins.length < 1 || definition.pins.length > 2) return false;
    const pinIds = new Set();
    for (const item of definition.pins) {
      if (!exactKeys(item, PIN_KEYS) || !/^[A-Z][A-Z0-9_]{0,15}$/u.test(item.id) || pinIds.has(item.id)
        || typeof item.label !== 'string' || !item.label.trim()
        || !['passive', 'passive-polarized', 'power-out', 'ground'].includes(item.role)
        || !strings(item.signals) || !item.signals.every((signal) => SIGNAL_CLASSES.has(signal))
        || !exactKeys(item.anchor, ['x', 'y'])
        || !Number.isFinite(item.anchor.x) || item.anchor.x < 0 || item.anchor.x > 1
        || !Number.isFinite(item.anchor.y) || item.anchor.y < 0 || item.anchor.y > 1) return false;
      pinIds.add(item.id);
    }

    if (!Array.isArray(definition.properties) || definition.properties.length < 1) return false;
    const propertyKeys = new Set();
    for (const property of definition.properties) {
      if (!exactKeys(property, PROPERTY_KEYS) || !/^[a-z][A-Za-z0-9]{1,47}$/u.test(property.key)
        || propertyKeys.has(property.key) || property.kind !== 'number'
        || !['F', 'V'].includes(property.unit) || typeof property.editable !== 'boolean'
        || !Number.isFinite(property.minimum) || !Number.isFinite(property.maximum)
        || !Number.isFinite(property.default) || property.minimum > property.maximum
        || property.default < property.minimum || property.default > property.maximum) return false;
      if (!property.editable && (property.minimum !== property.default || property.maximum !== property.default)) return false;
      propertyKeys.add(property.key);
    }

    if (!exactKeys(definition.electrical, ELECTRICAL_KEYS)
      || definition.electrical.runPolicy !== 'block-when-connected'
      || !strings(definition.electrical.assumptions) || !strings(definition.electrical.unsupported)) return false;
    if (!exactKeys(definition.artwork, ARTWORK_KEYS)
      || !/^draft-[a-z0-9-]+-basic-geometry$/u.test(definition.artwork.rendererKey)
      || definition.artwork.license !== 'Apache-2.0'
      || !definition.artwork.provenance.includes('no traced or third-party simulator artwork')) return false;

    if (!Array.isArray(definition.diagnostics) || definition.diagnostics.length < 2) return false;
    const codes = new Set();
    for (const item of definition.diagnostics) {
      if (!exactKeys(item, DIAGNOSTIC_KEYS) || !/^[A-Z][A-Z0-9_]{4,63}$/u.test(item.code)
        || codes.has(item.code) || item.severity !== 'block'
        || typeof item.when !== 'string' || !item.when.trim()) return false;
      codes.add(item.code);
    }
    if (!Array.isArray(definition.acceptanceFixtures) || definition.acceptanceFixtures.length < 5) return false;
    const fixtureIds = new Set();
    for (const item of definition.acceptanceFixtures) {
      if (!exactKeys(item, FIXTURE_KEYS) || !/^[a-z][a-z0-9-]{4,79}$/u.test(item.id)
        || fixtureIds.has(item.id) || typeof item.kind !== 'string' || !item.kind.trim()
        || (item.expected !== 'ACCEPT' && !codes.has(item.expected))) return false;
      fixtureIds.add(item.id);
    }
    return definition.acceptanceFixtures.some((item) => item.expected === 'ACCEPT')
      && definition.acceptanceFixtures.some((item) => item.expected !== 'ACCEPT');
  } catch {
    return false;
  }
}

export function validateFoundationPrimitiveDraftSet(definitions = FOUNDATION_PRIMITIVE_DRAFTS) {
  if (!Array.isArray(definitions) || definitions.length !== 4
    || !definitions.every(validateFoundationPrimitiveDraft)) return false;
  return new Set(definitions.map((item) => item.type)).size === definitions.length;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function canonicalFoundationPrimitiveDraftJson(definitions = FOUNDATION_PRIMITIVE_DRAFTS) {
  if (!validateFoundationPrimitiveDraftSet(definitions)) throw new Error('FOUNDATION_PRIMITIVE_DRAFT_INVALID');
  return `${JSON.stringify(canonicalize([...definitions].sort((left, right) => left.type.localeCompare(right.type))), null, 2)}\n`;
}
