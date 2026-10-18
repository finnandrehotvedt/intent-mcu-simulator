// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const supported = (evidence) => Object.freeze({ status: 'supported', evidence });
const unavailable = (code, reason) => Object.freeze({ status: 'unavailable', code, reason });

const narrowOperations = Object.freeze({
  branchDelete: unavailable('FIXED_TWO_ENDPOINT_GRAPH', 'This profile has no supported branch graph.'),
  netDelete: supported('NamedSeriesLedCircuitEditor.deleteSelected'),
  componentDelete: supported('NamedSeriesLedCircuitEditor.deleteSelected'),
  propertyEdit: supported('NamedSeriesLedCircuitEditor.setComponentProperty'),
  wireCreateReconnect: supported('NamedSeriesLedCircuitEditor named-endpoint methods'),
  undoRedo: supported('NamedSeriesLedCircuitEditor bounded history'),
  moveRotateKeyboard: supported('Existing workbench component controls and keyboard handlers'),
  duplicate: unavailable('FIXED_SINGLE_INSTANCE', 'Exactly one resistor and one LED are supported.'),
});

const narrowSafety = (prefix) => Object.freeze({
  missingGround: `${prefix}_GROUND_REQUIRED`,
  reversePolarity: `${prefix}_LED_REVERSE_POLARITY`,
  missingResistance: `${prefix}_SERIES_RESISTOR_REQUIRED`,
  overcurrent: `${prefix}_LED_OVERCURRENT`,
  outputContention: unavailable('NOT_REPRESENTABLE', 'The fixed graph exposes one output only.'),
  arbitraryVoltageShort: unavailable('NOT_REPRESENTABLE', 'The fixed graph has no arbitrary power topology.'),
});

export const EXISTING_GRAPH_EDIT_SAFETY_CONTRACT = Object.freeze({
  schema: 'intent-mcu-existing-graph-edit-safety@1',
  scope: 'The four existing public graph editors and their existing commands only.',
  requirements: Object.freeze(['W06', 'W07', 'W08', 'W10']),
  invariants: Object.freeze([
    'No new topology, component, controller, runtime model or narrow-profile branch capability.',
    'Rejected malformed or unsupported operations are byte-atomic.',
    'Invalid but editable drafts remain data; Run stays blocked and prior executable authority is retired.',
    'Movement, rotation and route styling are layout-only; electrical graph identity is unchanged.',
    'Electrical, source, component-property and wire edits require a fresh Build.',
    'Open restores data only, clears history/runtime authority and requires a fresh Build.',
  ]),
  profiles: Object.freeze({
    avr: Object.freeze({
      graph: 'existing-branched-avr',
      operations: Object.freeze({
        branchDelete: supported('ProjectEditorReducer wire.branch.delete'),
        netDelete: supported('ProjectEditorReducer wire.delete'),
        componentDelete: supported('ProjectEditorReducer component.remove'),
        propertyEdit: supported('ProjectEditorReducer component.property.set'),
        wireCreateReconnect: supported('ProjectEditorReducer wire.create/wire.reconnect'),
        undoRedo: supported('ProjectEditorReducer bounded history'),
        moveRotateKeyboard: supported('Project editor layout commands and keyboard handlers'),
        duplicate: supported('ProjectEditorReducer component.duplicate'),
      }),
      safety: Object.freeze({
        powerShort: 'POWER_SHORT', outputContention: 'OUTPUT_CONTENTION',
        floatingInput: 'FLOATING_REQUIRED_INPUT', reversePolarity: 'LED_REVERSE_POLARITY',
        missingResistance: 'LED_SERIES_RESISTOR_REQUIRED', overcurrent: 'LED_OVERCURRENT',
      }),
    }),
    rp2040: Object.freeze({ graph: 'fixed-two-endpoint-series-led', operations: narrowOperations,
      safety: narrowSafety('RP2040') }),
    esp32c3: Object.freeze({ graph: 'fixed-two-endpoint-series-led', operations: narrowOperations,
      safety: narrowSafety('C3') }),
    stm32: Object.freeze({ graph: 'fixed-two-endpoint-series-led', operations: narrowOperations,
      safety: narrowSafety('STM32') }),
  }),
  completion: Object.freeze({
    w06: 'partial: branch editing remains AVR-only',
    w07: 'partial: arbitrary/shared-graph transactions remain outside the bounded profiles',
    w08: 'partial: narrow duplication and arbitrary placement remain unavailable',
    w10: 'partial: broad contention and voltage-short coverage remains AVR-only',
  }),
});
