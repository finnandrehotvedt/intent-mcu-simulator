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
  duplicate: supported('NamedSeriesLedCircuitEditor.duplicateComponent creates a disconnected stable-ID copy'),
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
  schema: 'intent-mcu-existing-graph-edit-safety@4',
  scope: 'The four public profile workflows, including ordinary AVR v2 and candidate-v3 graph editors.',
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
        unresolvedMultipleIo: 'MULTIPLE_DIGITAL_IO_NET_UNSUPPORTED',
        floatingInput: 'FLOATING_REQUIRED_INPUT', reversePolarity: 'LED_REVERSE_POLARITY',
        missingResistance: 'LED_SERIES_RESISTOR_REQUIRED', overcurrent: 'LED_OVERCURRENT',
        crossVoltage: unavailable('CROSS_CONTROLLER_TOPOLOGY_UNAVAILABLE', 'Only the named AVR 5 V profile is representable.'),
      }),
    }),
    avrCandidate: Object.freeze({
      graph: 'candidate-v3-explicit-junction-graph',
      operations: Object.freeze({
        add: supported('CandidateEditorSession component.add with explicit bounded placement'),
        duplicate: supported('CandidateEditorSession component.duplicate with fresh stable ID'),
        moveRotateKeyboard: supported('Candidate workbench pointer and keyboard layout commands'),
        delete: supported('CandidateEditorSession component.remove'),
        branchDelete: supported('CandidateEditorSession wire.branch.delete'),
        netDelete: supported('CandidateEditorSession wire.delete'),
        branchReconnect: supported('CandidateEditorSession wire.reconnect'),
        branchCreate: supported('CandidateEditorSession wire.branch'),
        undoRedo: supported('CandidateEditorSession complete-document bounded history'),
      }),
      safety: Object.freeze({
        atomicValidation: supported('validateContactPersistenceDraft before history commit'),
        powerShort: 'PROJECT_CONTACT_POWER_SHORT',
        outputContention: 'PROJECT_CONTACT_OUTPUT_CONTENTION',
        wrongSupply: 'PROJECT_CONTACT_*_VCC_REQUIRES_5V',
        reusedEndpoint: 'PROJECT_CONTACT_REUSED_ENDPOINT',
        unknownPin: 'PROJECT_CONTACT_UNKNOWN_PIN',
        crossVoltage: unavailable('CROSS_CONTROLLER_TOPOLOGY_UNAVAILABLE', 'Candidate AVR parts use the named 5 V profile only.'),
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
    w06: 'complete: exact branch reconnect/delete and separately labelled whole-net delete are public on explicit-junction AVR graphs; fixed two-endpoint profiles truthfully expose no branch',
    w07: 'complete: every supported authored graph operation is one atomic complete-document Undo/Redo transaction; rejection changes no project, revision or history',
    w08: 'complete: the general AVR editors support click-add, drag placement, duplicate, move, rotate, delete and keyboard history with fresh stable IDs; bounded narrow teaching profiles support multiple disconnected resistor/LED instances while preserving their explicit runtime projection limits',
    w10: 'complete: every fault representable by each public profile rejects fail-closed with a stable actionable diagnostic; arbitrary rail mixing, physical damage prediction and a general circuit solver remain explicitly unavailable',
  }),
});
