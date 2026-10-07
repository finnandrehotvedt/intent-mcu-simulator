// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CATALOG_CATEGORIES,
  COMPONENT_CATALOG,
  CIRCUIT_LIMITS,
  SUPPORT_STATUS,
  catalogEntries,
  filterCatalog,
  validateCatalogDefinition,
  validateComponentCatalog,
} from '../src/component-catalog.mjs';
import { COMPONENT_ARTWORK_RENDERER_IDS } from '../staging/component-artwork.mjs';
import {
  CIRCUIT_SCHEMA,
  CircuitRuntime,
  CircuitStore,
  canonicalCircuitJson,
  createComponent,
  parseCircuitText,
  resolveDigitalDrivers,
  validateCircuit,
} from '../src/circuit-engine.mjs';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { CircuitEditorReducer } from '../src/editor-reducer.mjs';
import {
  LEGACY_STORAGE_KEY,
  PROJECT_SCHEMA,
  WIRE_COLORS,
  canonicalProjectJson,
  defaultWireColor,
  migrateProjectV1,
  parseProjectV2,
  validateProjectV2,
} from '../src/project-v2.mjs';
import {
  ProjectEditorReducer,
  createEmptyProject,
  endpointConnection,
  exportCanonicalProject,
  generatePromptBridgeV2,
  mergeCircuitProject,
  newComponent,
  parsePromptBridgeV2,
  projectFromCircuit,
} from '../src/project-editor.mjs';
import {
  ROUTE_SCHEMA,
  addRouteJog,
  materializeRouteFamily,
  moveRouteSegment,
  normalizeOrthogonalPath,
  normalizeStoredRoute,
  routeFamilyPaths,
  routeSegmentOrientation,
} from '../src/route-model.mjs';

const LEGACY_SELECTION = Object.freeze(['controller-1', 'resistor-1', 'led-1', 'button-1']);

function legacyPlan() {
  return {
    schema: 'teach-lab-netlist@1',
    components: [
      { id: 'controller-1', type: 'controller.generic-avr-v1', properties: {} },
      { id: 'resistor-1', type: 'resistor.v1', properties: { ohms: 220 } },
      { id: 'led-1', type: 'led.v1', properties: {} },
      { id: 'button-1', type: 'button.momentary.v1', properties: {} },
    ],
    wires: [
      { from: 'controller-1.D13', to: 'resistor-1.A' },
      { from: 'resistor-1.B', to: 'led-1.ANODE' },
      { from: 'led-1.CATHODE', to: 'controller-1.GND1' },
      { from: 'controller-1.D2', to: 'button-1.A' },
      { from: 'button-1.B', to: 'controller-1.GND2' },
    ],
    firmwarePins: { led: 'D13', button: 'D2', buttonMode: 'INPUT_PULLUP' },
  };
}

const clone = (value) => structuredClone(value);
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;
const expectCode = (graph, code, options) => assert.equal(validateCircuit(graph, options).code, code);

function project(circuit = DEFAULT_CIRCUIT) {
  return {
    schema: PROJECT_SCHEMA,
    boardProfile: 'board.atmega328p-16mhz-v1',
    source: { files: [{ name: 'main.ino', content: 'void setup() {}\nvoid loop() {}\n' }] },
    circuit: clone(circuit),
    layout: {
      positions: Object.fromEntries(circuit.components.map((component, index) => [
        component.id, { x: (index + 1) / (circuit.components.length + 1), y: 0.5 },
      ])),
    },
    instruments: {
      logicChannels: ['D13'], selectedPin: 'D13',
      serial: { baud: 9_600, encoding: 'utf-8', historyLimit: 512 },
    },
    build: { status: 'dirty', inputIdentity: null, artifactIdentity: null },
  };
}

function buildManualProject() {
  const editor = new ProjectEditorReducer(createEmptyProject());
  const apply = (command) => {
    const result = editor.apply({ ...command, revision: editor.revision });
    assert.equal(result.ok, true, `${command.type}: ${result.code}`);
    return result;
  };
  const types = [
    'board.atmega328p-16mhz-v1', 'resistor.fixed-v1', 'led.basic-v1',
    'button.momentary-v1', 'potentiometer.linear-v1',
  ];
  const positions = [
    { x: 0.12, y: 0.34 }, { x: 0.42, y: 0.2 }, { x: 0.7, y: 0.2 },
    { x: 0.7, y: 0.52 }, { x: 0.42, y: 0.72 },
  ];
  const components = types.map((type, index) => {
    const component = newComponent(type, editor.project.circuit);
    apply({ type: 'component.add', component, position: positions[index] });
    return component;
  });
  const [board, resistor, led, button, pot] = components;
  const wire = (id, from, to) => apply({ type: 'wire.create', net: { id, endpoints: [from, to] } });
  wire('net-d13', { component: board.id, pin: 'D13' }, { component: resistor.id, pin: 'A' });
  wire('net-led', { component: resistor.id, pin: 'B' }, { component: led.id, pin: 'ANODE' });
  wire('net-ground', { component: board.id, pin: 'GND1' }, { component: led.id, pin: 'CATHODE' });
  apply({ type: 'wire.branch', netId: 'net-ground', endpoint: { component: button.id, pin: 'B' }, junctionId: 'junction-ground' });
  apply({ type: 'wire.branch', netId: 'net-ground', endpoint: { component: pot.id, pin: 'LOW' }, junctionId: 'junction-ground' });
  wire('net-button', { component: board.id, pin: 'D2' }, { component: button.id, pin: 'A' });
  wire('net-5v', { component: board.id, pin: '5V' }, { component: pot.id, pin: 'HIGH' });
  wire('net-pot', { component: board.id, pin: 'A0' }, { component: pot.id, pin: 'WIPER' });
  apply({
    type: 'source.set', name: 'main.ino',
    content: 'void setup(){pinMode(13,OUTPUT);pinMode(2,INPUT_PULLUP);}\nvoid loop(){digitalWrite(13,!digitalRead(2));analogRead(A0);}\n',
  });
  return { editor, apply, ids: { board: board.id, resistor: resistor.id, led: led.id, button: button.id, pot: pot.id } };
}

test('C-01 catalog and canonical graph support branching nets and independent instances', () => {
  assert.deepEqual(Object.keys(COMPONENT_CATALOG), [
    'board.atmega328p-16mhz-v1', 'led.basic-v1', 'resistor.fixed-v1',
    'button.momentary-v1', 'potentiometer.linear-v1', 'terminal.serial-uart-v1',
  ]);
  const result = validateCircuit(DEFAULT_CIRCUIT);
  assert.equal(result.ok, true);
  assert.equal(result.models.leds.length, 2);
  assert.equal(result.models.buttons.length, 1);
  assert.equal(result.models.potentiometers.length, 1);
  assert.equal(result.graph.nets.find((net) => net.id === 'net-d13-branch').endpoints.length, 3);
  const reordered = clone(DEFAULT_CIRCUIT);
  reordered.components.reverse();
  reordered.nets.reverse();
  for (const net of reordered.nets) net.endpoints.reverse();
  assert.equal(canonicalCircuitJson(reordered), canonicalCircuitJson(DEFAULT_CIRCUIT));
});

test('component contracts enforce exact pins, properties, controls and reset defaults', () => {
  assert.equal(validateComponentCatalog(), true);
  for (const [type, definition] of Object.entries(COMPONENT_CATALOG)) {
    assert.equal(definition.type, type);
    assert.ok(definition.displayName.length > 0);
    assert.equal(validateCatalogDefinition(definition), true);
    assert.ok(definition.family.length > 0 && definition.variant.length > 0);
    assert.ok(definition.manufacturer.length > 0 && definition.partNumber.length > 0);
    assert.ok(definition.modelRef.length > 0);
    assert.ok(definition.artwork.renderer.length > 0 && definition.artwork.thumbnail.length > 0);
    assert.equal(definition.artwork.license, 'Apache-2.0');
    assert.match(definition.artwork.provenance, /Original project SVG/u);
    assert.ok(CATALOG_CATEGORIES.some((category) => category.id === definition.catalog.category));
    assert.ok(Object.hasOwn(SUPPORT_STATUS, definition.support.status));
    assert.ok(definition.support.limitations.length > 0);
    for (const pin of definition.pins) {
      assert.ok(pin.id && pin.label && pin.role);
      assert.ok(pin.signals.length > 0);
      assert.deepEqual(pin.capabilities, pin.signals);
      assert.ok(pin.anchor.x >= 0 && pin.anchor.x <= 1);
      assert.ok(pin.anchor.y >= 0 && pin.anchor.y <= 1);
    }
  }
  assert.equal(CATALOG_CATEGORIES.length, 9);
  assert.equal(new Set(COMPONENT_ARTWORK_RENDERER_IDS).size, COMPONENT_ARTWORK_RENDERER_IDS.length);
  assert.deepEqual(
    COMPONENT_CATALOG['button.momentary-v1'].internalTerminalGroups,
    [{ pin: 'A', terminals: ['A1', 'A2'] }, { pin: 'B', terminals: ['B1', 'B2'] }],
  );
  const bad = clone(DEFAULT_CIRCUIT);
  bad.components.find((item) => item.id === 'resistor-1').properties.extra = true;
  expectCode(bad, 'INVALID_COMPONENT_PROPERTIES');
  bad.components.find((item) => item.id === 'resistor-1').properties = { ohms: 0 };
  expectCode(bad, 'INVALID_COMPONENT_PROPERTIES');
});

test('W-06 registry validation fails closed on incomplete or ambiguous definitions', () => {
  const base = clone(COMPONENT_CATALOG['resistor.fixed-v1']);
  for (const mutate of [
    (entry) => { delete entry.pins; },
    (entry) => { entry.pins = []; },
    (entry) => { entry.pins.push(clone(entry.pins[0])); },
    (entry) => { entry.pins[0].constraints = null; },
    (entry) => { entry.pins[0].constraints = { voltageMin: 'zero' }; },
    (entry) => { entry.pins[0].constraints = { unknownRule: true }; },
    (entry) => { entry.artwork.renderer = 'missing-renderer'; },
    (entry) => { entry.artwork.cssWidth = 0; },
    (entry) => { entry.artwork.viewBox[2] = 0; },
    (entry) => { entry.catalog.aliases = []; },
    (entry) => { entry.catalog.functions = []; },
    (entry) => { entry.catalog.supplyVolts.max = -1; },
    (entry) => { delete entry.propertySchema.ohms; },
    (entry) => { entry.propertySchema.ohms.default = 0; },
    (entry) => { entry.propertySchema.ohms.unit = ''; },
    (entry) => { entry.support.limitations = []; },
  ]) {
    const invalid = clone(base); mutate(invalid);
    assert.equal(validateCatalogDefinition(invalid), false);
  }
  assert.equal(validateCatalogDefinition({ family: 'incomplete' }), false);
  const duplicated = Object.values(COMPONENT_CATALOG).map(clone);
  duplicated[1].partNumber = duplicated[0].partNumber;
  assert.equal(validateComponentCatalog(duplicated), false);
});

test('W-07/W-08 catalogue filtering covers practical metadata and remains bounded at 1,000 records', () => {
  const base = COMPONENT_CATALOG['board.atmega328p-16mhz-v1'];
  const records = Array.from({ length: 1_000 }, (_, index) => ({
    ...base,
    type: `catalog.test-${index}-v1`,
    family: `catalog.test-family-${index % 25}`,
    variant: `variant-${index % 10}`,
    displayName: `Environmental controller ${index}`,
    manufacturer: `Maker ${index % 20}`,
    partNumber: `MCU-${String(index).padStart(4, '0')}`,
    catalog: {
      ...base.catalog,
      category: index % 2 ? 'controllers' : 'sensors',
      aliases: [`weather-node-${index}`, `alias-${index % 50}`],
      functions: index % 3 ? ['gpio controller'] : ['temperature sensing'],
      interfaces: index % 5 ? ['GPIO'] : ['I²C'],
      supplyVolts: { min: 3.3, max: 5 },
      package: index % 2 ? 'development board' : 'breakout module',
    },
    support: {
      status: index % 4 ? 'simulated' : 'partial',
      limitations: ['Synthetic performance fixture only.'],
    },
  }));
  const started = performance.now();
  assert.equal(filterCatalog(records, { query: 'Maker 7 MCU-0007 weather-node-7 GPIO' }).length, 1);
  assert.equal(filterCatalog(records, { query: 'temperature sensing I²C', category: 'sensors' }).length > 0, true);
  assert.equal(filterCatalog(records, { category: 'controllers', status: 'simulated', interface: 'GPIO' }).length > 0, true);
  assert.equal(filterCatalog(records, { query: 'breakout 3.3' }).length > 0, true);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 250, `1,000-record catalogue filtering took ${elapsed.toFixed(2)} ms`);
  assert.equal(catalogEntries({ selectableOnly: true }).length, 5);
});

test('C-05 direct five volt to ground short blocks with stable net reference', () => {
  const bad = clone(DEFAULT_CIRCUIT);
  bad.nets.find((net) => net.id === 'net-5v').endpoints[1] = { component: 'board-1', pin: 'GND2' };
  const result = validateCircuit(bad);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.find((item) => item.code === 'POWER_SHORT').netId, 'net-5v');
});

test('C-06 digital resolver distinguishes pull-up/input from opposing push-pull contention', () => {
  assert.equal(resolveDigitalDrivers(['HIGH_Z', 'PULLED_HIGH']), 'PULLED_HIGH');
  assert.equal(resolveDigitalDrivers(['HIGH_Z', 'LOW']), 'LOW');
  assert.equal(resolveDigitalDrivers(['HIGH', 'LOW']), 'CONFLICT');
  const bad = clone(DEFAULT_CIRCUIT);
  bad.nets.push({ id: 'net-output-conflict', endpoints: [
    { component: 'board-1', pin: 'D3' }, { component: 'board-1', pin: 'D4' },
  ] });
  expectCode(bad, 'OUTPUT_CONTENTION', {
    drivers: { 'board-1.D3': 'HIGH', 'board-1.D4': 'LOW' },
  });
  assert.equal(validateCircuit(bad, { drivers: { 'board-1.D3': 'HIGH_Z', 'board-1.D4': 'PULLED_HIGH' } }).ok, true);
});

test('C-07 LED paths require polarity and formula-derived current limiting', () => {
  const accepted = validateCircuit(DEFAULT_CIRCUIT);
  assert.ok(Math.abs(accepted.models.leds.find((item) => item.componentId === 'led-1').currentAmps - (3 / 220)) < 1e-12);
  const direct = clone(DEFAULT_CIRCUIT);
  direct.nets = direct.nets.filter((net) => net.id !== 'net-led-1-anode');
  direct.nets.find((net) => net.id === 'net-d13-branch').endpoints = direct.nets
    .find((net) => net.id === 'net-d13-branch').endpoints
    .filter((endpoint) => endpoint.component !== 'resistor-1');
  direct.nets.find((net) => net.id === 'net-d13-branch').endpoints.push({ component: 'led-1', pin: 'ANODE' });
  expectCode(direct, 'LED_SERIES_RESISTOR_REQUIRED');
  const reverse = clone(DEFAULT_CIRCUIT);
  reverse.nets.find((net) => net.id === 'net-led-1-anode').endpoints
    .find((endpoint) => endpoint.component === 'led-1').pin = 'CATHODE';
  reverse.nets.find((net) => net.id === 'net-ground-branch').endpoints
    .find((endpoint) => endpoint.component === 'led-1').pin = 'ANODE';
  expectCode(reverse, 'LED_REVERSE_POLARITY');
  const overcurrent = clone(DEFAULT_CIRCUIT);
  overcurrent.components.find((item) => item.id === 'resistor-1').properties.ohms = 100;
  expectCode(overcurrent, 'LED_OVERCURRENT');
});

test('C-08 required floating digital input blocks while a pull-up resolves', () => {
  expectCode(DEFAULT_CIRCUIT, 'FLOATING_REQUIRED_INPUT', { requiredInputs: ['board-1.D2'] });
  assert.equal(validateCircuit(DEFAULT_CIRCUIT, {
    requiredInputs: ['board-1.D2'], drivers: { 'board-1.D2': 'PULLED_HIGH' },
  }).ok, true);
});

test('C-09 arbitrary resistor and branched scalar wiper remain unsupported', () => {
  const mesh = clone(DEFAULT_CIRCUIT);
  mesh.components.push(createComponent('resistor-extra', 'resistor.fixed-v1'));
  mesh.nets.push(
    { id: 'net-extra-a', endpoints: [{ component: 'board-1', pin: 'D5' }, { component: 'resistor-extra', pin: 'A' }] },
    { id: 'net-extra-b', endpoints: [{ component: 'board-1', pin: 'D6' }, { component: 'resistor-extra', pin: 'B' }] },
  );
  expectCode(mesh, 'UNSUPPORTED_ANALOG_TOPOLOGY');
  const branched = clone(DEFAULT_CIRCUIT);
  branched.nets.find((net) => net.id === 'net-pot-a0').endpoints.push({ component: 'board-1', pin: 'A1' });
  expectCode(branched, 'UNSUPPORTED_ANALOG_TOPOLOGY');
});

test('C-10 every graph resource limit rejects before partial interpretation', () => {
  const components = clone(DEFAULT_CIRCUIT);
  while (components.components.length <= CIRCUIT_LIMITS.components) components.components.push(clone(components.components[1]));
  expectCode(components, 'COMPONENT_LIMIT');
  const nets = clone(DEFAULT_CIRCUIT);
  while (nets.nets.length <= CIRCUIT_LIMITS.nets) nets.nets.push(clone(nets.nets[0]));
  expectCode(nets, 'NET_LIMIT');
  const endpoints = clone(DEFAULT_CIRCUIT);
  endpoints.nets[0].endpoints = Array.from({ length: CIRCUIT_LIMITS.endpoints + 1 }, () => ({ component: 'board-1', pin: 'D13' }));
  expectCode(endpoints, 'ENDPOINT_LIMIT');
});

test('C-11 transactional topology edits stop running state; controls do not rebuild topology', () => {
  const store = new CircuitStore(DEFAULT_CIRCUIT);
  const before = canonicalCircuitJson(store.graph);
  const invalid = clone(DEFAULT_CIRCUIT);
  invalid.components.find((item) => item.id === 'resistor-1').properties.ohms = 0;
  assert.equal(store.replace(invalid, { running: true }).ok, false);
  assert.equal(canonicalCircuitJson(store.graph), before);
  assert.equal(store.topologyRevision, 0);
  assert.equal(store.setControl('button-1', 'pressed', true).ok, true);
  assert.equal(store.topologyRevision, 0);
  assert.equal(store.controlRevision, 1);
  const changed = clone(store.graph);
  changed.components.find((item) => item.id === 'led-1').properties.color = 'yellow';
  const replacement = store.replace(changed, { running: true });
  assert.equal(replacement.ok, true);
  assert.equal(replacement.stopped, true);
  assert.equal(store.runtimeDirty, true);
});

test('revision-checked editor reducer commits declarative commands atomically with bounded undo/redo', () => {
  const editor = new CircuitEditorReducer(DEFAULT_CIRCUIT, 4);
  const added = editor.apply({
    type: 'component.duplicate', revision: 0, sourceId: 'led-1', newId: 'led-draft',
  }, { running: true });
  assert.equal(added.ok, true);
  assert.equal(added.runnable, false);
  assert.equal(added.stopped, true);
  assert.equal(added.graph.components.some((component) => component.id === 'led-draft'), true);
  const stale = editor.apply({ type: 'component.remove', revision: 0, componentId: 'led-draft' });
  assert.equal(stale.code, 'EDITOR_STALE_REVISION');
  assert.equal(editor.graph.components.some((component) => component.id === 'led-draft'), true);
  const removed = editor.apply({ type: 'component.remove', revision: 1, componentId: 'led-draft' });
  assert.equal(removed.ok, true);
  assert.equal(removed.runnable, true);
  const undone = editor.apply({ type: 'undo', revision: 2 });
  assert.equal(undone.code, 'EDITOR_UNDONE');
  assert.equal(undone.graph.components.some((component) => component.id === 'led-draft'), true);
  const redone = editor.apply({ type: 'redo', revision: 3 });
  assert.equal(redone.code, 'EDITOR_REDONE');
  assert.equal(redone.graph.components.some((component) => component.id === 'led-draft'), false);
  const invalid = editor.apply({
    type: 'component.property.set', revision: 4, componentId: 'resistor-1', key: 'ohms', value: 0,
  });
  assert.equal(invalid.code, 'INVALID_COMPONENT_PROPERTIES');
  assert.equal(editor.revision, 4);
  assert.equal(editor.graph.components.find((component) => component.id === 'resistor-1').properties.ohms, 220);
});

test('button and potentiometer controls feed the runtime without changing topology', () => {
  const calls = { digital: [], analogue: [] };
  const adapter = {
    setDigitalPin(pin, level) { calls.digital.push([pin, level]); },
    setAnalogChannel(channel, voltage) { calls.analogue.push([channel, voltage]); },
  };
  const runtime = new CircuitRuntime(DEFAULT_CIRCUIT);
  runtime.applyControls(adapter);
  assert.deepEqual(calls.digital.at(-1), [2, true]);
  assert.deepEqual(calls.analogue.at(-1), [0, 2.5]);
  runtime.setControl('button-1', 'pressed', true, adapter);
  runtime.setControl('pot-1', 'position', 0.75, adapter);
  assert.deepEqual(calls.digital.at(-1), [2, false]);
  assert.deepEqual(calls.analogue.at(-1), [0, 3.75]);
  const observed = runtime.observe({ digitalPins: { D13: true } });
  assert.equal(observed.leds.length, 2);
  assert.equal(observed.leds.every((led) => led.on && led.currentAmps > 0), true);
});

test('strict circuit import rejects duplicate and prototype keys', () => {
  assert.equal(parseCircuitText('{"schema":"teach-lab-circuit@2","schema":"teach-lab-circuit@2"}').code, 'DUPLICATE_KEY');
  assert.equal(parseCircuitText('{"__proto__":{}}').code, 'FORBIDDEN_KEY');
});

test('project v2 canonical validation covers source, graph, layout, instruments and stale build state', () => {
  const value = project();
  const result = validateProjectV2(value);
  assert.equal(result.ok, true);
  assert.deepEqual(parseProjectV2(canonicalProjectJson(value)).project, result.project);
  const tampered = clone(value);
  tampered.build.status = 'failed';
  tampered.build.artifactIdentity = 'a'.repeat(64);
  assert.equal(validateProjectV2(tampered).code, 'PROJECT_BUILD');
});

test('project names are canonical, undoable and prior v2 saves gain a safe default', () => {
  const prior = createEmptyProject();
  delete prior.metadata;
  const normalized = validateProjectV2(prior);
  assert.equal(normalized.ok, true);
  assert.equal(normalized.project.metadata.name, 'Untitled project');
  const editor = new ProjectEditorReducer(normalized.project);
  const renamed = editor.apply({ type: 'project.rename', revision: 0, name: '  Factory   trainer  ' });
  assert.equal(renamed.ok, true);
  assert.equal(renamed.project.metadata.name, 'Factory trainer');
  assert.equal(renamed.buildRelevant, false);
  assert.equal(JSON.parse(canonicalProjectJson(renamed.project)).metadata.name, 'Factory trainer');
  assert.equal(editor.apply({ type: 'undo', revision: 1 }).project.metadata.name, 'Untitled project');
  assert.equal(editor.apply({ type: 'project.rename', revision: 2, name: '' }).ok, false);
});

test('v1 migration preserves components/positions, creates empty source and never creates an artifact', () => {
  const netlist = legacyPlan();
  const legacy = {
    schema: 'teach-lab-project@1',
    selected: [...LEGACY_SELECTION],
    positions: Object.fromEntries(LEGACY_SELECTION.map((id, index) => [id, { x: 0.1 + index * 0.15, y: 0.5 }])),
    netlist,
  };
  const raw = JSON.stringify(legacy);
  const storage = new Map([[LEGACY_STORAGE_KEY, raw]]);
  const result = migrateProjectV1(raw, storage);
  assert.equal(result.ok, true);
  assert.equal(result.report.code, 'V1_MIGRATED');
  assert.equal(result.report.originalKeyUntouched, true);
  assert.equal(result.project.source.files[0].content, '');
  assert.equal(result.project.build.status, 'dirty');
  assert.equal(result.project.build.artifactIdentity, null);
  assert.deepEqual(result.report.unsupportedFields, ['netlist.firmwarePins']);
  assert.equal(storage.get(LEGACY_STORAGE_KEY), raw);
  const browserStorage = { getItem: (key) => storage.get(key), removeItem: () => assert.fail('migration mutated storage') };
  assert.equal(migrateProjectV1(raw, browserStorage).report.originalKeyUntouched, true);
  assert.equal(result.project.circuit.components.length, LEGACY_SELECTION.length);
});

test('C-12/C-16 empty project supports complete click-or-drag equivalent manual construction', () => {
  const empty = createEmptyProject();
  assert.equal(empty.circuit.components.length, 0);
  assert.equal(empty.circuit.nets.length, 0);
  assert.equal(empty.source.files[0].content, '');
  assert.equal(validateProjectV2(empty).ok, true);
  const { editor, ids } = buildManualProject();
  const circuit = validateCircuit(editor.project.circuit);
  assert.equal(circuit.ok, true);
  assert.equal(circuit.models.leds[0].sourcePin, 'D13');
  assert.equal(circuit.models.buttons[0].boardPin, 'D2');
  assert.equal(circuit.models.potentiometers[0].boardPin, 'A0');
  assert.equal(new Set(Object.values(ids)).size, 5);
  assert.equal(editor.project.source.files[0].content.includes('INPUT_PULLUP'), true);
});

test('C-13 movement rotation duplicate and repeated undo preserve electrical identity', () => {
  const { editor, apply, ids } = buildManualProject();
  const endpointBefore = endpointConnection(editor.project.circuit, { component: ids.led, pin: 'ANODE' });
  apply({ type: 'component.move', componentId: ids.led, x: 0.76, y: 0.31 });
  apply({ type: 'component.rotate', componentId: ids.led, rotation: 90 });
  apply({ type: 'component.duplicate', sourceId: ids.led, newId: 'led-2' });
  assert.equal(editor.project.layout.positions[ids.led].rotation, 90);
  assert.equal(endpointConnection(editor.project.circuit, { component: ids.led, pin: 'ANODE' }), endpointBefore);
  assert.equal(endpointConnection(editor.project.circuit, { component: 'led-2', pin: 'ANODE' }), null);
  assert.equal(editor.apply({ type: 'undo', revision: editor.revision }).ok, true);
  assert.equal(editor.apply({ type: 'redo', revision: editor.revision }).ok, true);
  assert.equal(editor.project.circuit.components.filter((component) => component.id === 'led-2').length, 1);
  assert.equal(editor.apply({ type: 'undo', revision: editor.revision }).ok, true);
  apply({ type: 'component.move', componentId: ids.led, x: 0.77, y: 0.32 });
  assert.equal(editor.apply({ type: 'redo', revision: editor.revision }).code, 'EDITOR_REDO_EMPTY');
});

test('C-14 wire routes cross without connection and junction removal detaches the named branch', () => {
  const { editor, apply, ids } = buildManualProject();
  apply({ type: 'wire.route.set', netId: 'net-d13', points: [{ x: 0.5, y: 0.8 }] });
  apply({ type: 'wire.route.set', netId: 'net-button', points: [{ x: 0.5, y: 0.2 }] });
  assert.notEqual(
    endpointConnection(editor.project.circuit, { component: ids.board, pin: 'D13' }),
    endpointConnection(editor.project.circuit, { component: ids.board, pin: 'D2' }),
  );
  const removed = apply({
    type: 'junction.remove', junctionId: 'junction-ground',
    detachEndpoint: { component: ids.pot, pin: 'LOW' },
  });
  assert.equal(removed.runnable, false);
  assert.equal(endpointConnection(editor.project.circuit, { component: ids.pot, pin: 'LOW' }), null);
  assert.equal(editor.apply({ type: 'undo', revision: editor.revision }).ok, true);
  assert.equal(validateCircuit(editor.project.circuit).ok, true);
});

test('W-04/W-05/W-12 wire colour and editable bends persist without changing electrical identity', () => {
  const { editor, apply } = buildManualProject();
  const circuitBefore = canonicalCircuitJson(editor.project.circuit);
  apply({ type: 'wire.style.set', netId: 'net-d13', color: '#5f8cff' });
  apply({ type: 'wire.route.set', netId: 'net-d13', points: [{ x: 0.31, y: 0.27 }, { x: 0.62, y: 0.27 }] });
  assert.equal(canonicalCircuitJson(editor.project.circuit), circuitBefore);
  assert.equal(editor.project.layout.wireStyles['net-d13'].color, '#5f8cff');
  assert.deepEqual(editor.project.layout.wireRoutes['net-d13'], [{ x: 0.31, y: 0.27 }, { x: 0.62, y: 0.27 }]);
  const reopened = parseProjectV2(exportCanonicalProject(editor.project));
  assert.equal(reopened.ok, true);
  assert.deepEqual(reopened.project.layout.wireStyles, editor.project.layout.wireStyles);
  assert.deepEqual(reopened.project.layout.wireRoutes, editor.project.layout.wireRoutes);

  const priorV2 = JSON.parse(exportCanonicalProject(editor.project));
  delete priorV2.layout.wireStyles;
  const migrated = parseProjectV2(JSON.stringify(priorV2));
  assert.equal(migrated.ok, true);
  for (const net of migrated.project.circuit.nets) {
    assert.equal(migrated.project.layout.wireStyles[net.id].color, defaultWireColor(net));
  }
  assert.equal(WIRE_COLORS.includes(migrated.project.layout.wireStyles['net-ground'].color), true);

  const renamedBoard = JSON.parse(exportCanonicalProject(editor.project));
  delete renamedBoard.layout.wireStyles;
  const oldBoardId = renamedBoard.circuit.components.find((component) => component.type === 'board.atmega328p-16mhz-v1').id;
  renamedBoard.circuit.components.find((component) => component.id === oldBoardId).id = 'controller-main';
  renamedBoard.layout.positions['controller-main'] = renamedBoard.layout.positions[oldBoardId];
  delete renamedBoard.layout.positions[oldBoardId];
  for (const net of renamedBoard.circuit.nets) {
    for (const endpoint of net.endpoints) if (endpoint.component === oldBoardId) endpoint.component = 'controller-main';
  }
  const renamedMigration = parseProjectV2(JSON.stringify(renamedBoard));
  assert.equal(renamedMigration.ok, true);
  assert.equal(renamedMigration.project.layout.wireStyles['net-ground'].color, '#303943');
  assert.equal(renamedMigration.project.layout.wireStyles['net-5v'].color, '#f04f5f');
  const beforeRejected = exportCanonicalProject(editor.project);
  const rejected = editor.apply({ type: 'wire.style.set', revision: editor.revision, netId: 'net-d13', color: '#badbad' });
  assert.equal(rejected.code, 'EDITOR_WIRE_STYLE');
  assert.equal(exportCanonicalProject(editor.project), beforeRejected);
});

test('C-17 GPIO reassignment changes the canonical graph and source without fixed-demo state', () => {
  const { editor, apply, ids } = buildManualProject();
  apply({
    type: 'wire.reconnect', netId: 'net-d13',
    from: { component: ids.board, pin: 'D13' }, to: { component: ids.board, pin: 'D12' },
  });
  apply({
    type: 'source.set', name: 'main.ino',
    content: editor.project.source.files[0].content.replaceAll('13', '12'),
  });
  assert.equal(endpointConnection(editor.project.circuit, { component: ids.board, pin: 'D13' }), null);
  assert.equal(endpointConnection(editor.project.circuit, { component: ids.board, pin: 'D12' }), 'net-d13');
  assert.equal(validateCircuit(editor.project.circuit).models.leds[0].sourcePin, 'D12');
  assert.equal(editor.project.source.files[0].content.includes('pinMode(12'), true);
});

test('D-07 merge remaps every collision/reference while preserving existing IDs and source', () => {
  const { editor } = buildManualProject();
  const beforeSource = editor.project.source.files[0].content;
  const incomingCircuit = {
    schema: CIRCUIT_SCHEMA,
    components: [
      createComponent('resistor-1', 'resistor.fixed-v1'),
      createComponent('led-1', 'led.basic-v1'),
    ],
    nets: [{ id: 'net-led', endpoints: [
      { component: 'resistor-1', pin: 'B' }, { component: 'led-1', pin: 'ANODE' },
    ] }],
    junctions: [],
  };
  const incoming = projectFromCircuit(incomingCircuit, 'incoming source must not replace existing');
  const result = editor.importProject(incoming, 'merge');
  assert.equal(result.ok, true);
  assert.equal(editor.project.source.files[0].content, beforeSource);
  assert.equal(editor.project.circuit.components.some((component) => component.id === 'resistor-1-import-1'), true);
  assert.equal(editor.project.circuit.components.some((component) => component.id === 'led-1-import-1'), true);
  const mergedNet = editor.project.circuit.nets.find((net) => net.id === 'net-led-import-1');
  assert.deepEqual(mergedNet.endpoints.map(endpointKey).sort(), ['led-1-import-1.ANODE', 'resistor-1-import-1.B']);
  assert.equal(result.report.existingSourcePreserved, true);
});

test('D-08 invalid import is byte-atomic and accepted replace/merge participates in history', () => {
  const { editor } = buildManualProject();
  const beforeProject = exportCanonicalProject(editor.project);
  const beforeUndo = structuredClone(editor.undoStack);
  const invalid = JSON.parse(beforeProject);
  invalid.circuit.components[0].id = '__bad';
  const rejected = editor.importProject(invalid, 'replace');
  assert.equal(rejected.ok, false);
  assert.equal(exportCanonicalProject(editor.project), beforeProject);
  assert.deepEqual(editor.undoStack, beforeUndo);
  const replacement = projectFromCircuit(DEFAULT_CIRCUIT, 'replacement');
  assert.equal(editor.importProject(replacement, 'replace').ok, true);
  assert.equal(editor.project.source.files[0].content, 'replacement');
  assert.equal(editor.apply({ type: 'undo', revision: editor.revision }).ok, true);
  assert.equal(exportCanonicalProject(editor.project), beforeProject);
});

test('D-09 circuit-only replacement preserves firmware and canonical reopen preserves rotation/routes', () => {
  const { editor, apply, ids } = buildManualProject();
  apply({ type: 'component.rotate', componentId: ids.pot, rotation: 270 });
  apply({ type: 'wire.route.set', netId: 'net-pot', points: [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }] });
  const source = editor.project.source.files[0].content;
  const other = projectFromCircuit(DEFAULT_CIRCUIT, 'must not replace');
  assert.equal(editor.importProject(other, 'replace', { circuitOnly: true }).ok, true);
  assert.equal(editor.project.source.files[0].content, source);
  const reopened = parseProjectV2(exportCanonicalProject(editor.project));
  assert.equal(reopened.ok, true);
  assert.equal(exportCanonicalProject(reopened.project), exportCanonicalProject(editor.project));
});

test('I-01/I-03/I-05 prompt bridge is deterministic, provider-neutral and circuit-only', () => {
  const { editor } = buildManualProject();
  const prompt = generatePromptBridgeV2(editor.project);
  assert.equal(prompt, generatePromptBridgeV2(editor.project));
  assert.match(prompt, /Return ONLY one JSON object/u);
  assert.doesNotMatch(prompt, /https?:\/\//u);
  const raw = JSON.stringify(editor.project.circuit);
  assert.equal(parsePromptBridgeV2(raw).ok, true);
  assert.equal(parsePromptBridgeV2(`\`\`\`json\n${raw}\n\`\`\``).ok, true);
  assert.equal(parsePromptBridgeV2(`${raw}\nextra`).ok, false);
  assert.equal(parsePromptBridgeV2('{"schema":"teach-lab-circuit@2","schema":"teach-lab-circuit@2"}').code, 'DUPLICATE_KEY');
  const styled = JSON.parse(raw);
  styled.components[0].style = 'url(https://example.invalid)';
  assert.equal(parsePromptBridgeV2(JSON.stringify(styled)).ok, false);
  const before = exportCanonicalProject(editor.project);
  const unsafeMerge = editor.importProject(projectFromCircuit(DEFAULT_CIRCUIT), 'merge', {
    circuitOnly: true, requireRunnable: true,
  });
  assert.equal(unsafeMerge.ok, false);
  assert.equal(exportCanonicalProject(editor.project), before);
});

test('C-18 manual, prompt and reopen origins normalize to the same circuit', () => {
  const { editor } = buildManualProject();
  const manual = canonicalCircuitJson(editor.project.circuit);
  const prompt = parsePromptBridgeV2(manual);
  const reopen = parseProjectV2(exportCanonicalProject(editor.project));
  assert.equal(prompt.ok, true);
  assert.equal(reopen.ok, true);
  assert.equal(canonicalCircuitJson(prompt.graph), manual);
  assert.equal(canonicalCircuitJson(reopen.project.circuit), manual);
  assert.deepEqual(mergeCircuitProject(createEmptyProject(), editor.project).project.circuit, editor.project.circuit);
});

function routeFixture(net) {
  const anchors = Object.fromEntries(net.endpoints.map((endpoint, index) => {
    const upper = index % 2 === 0;
    const left = index < Math.ceil(net.endpoints.length / 2);
    const pin = { x: left ? 0.1 : 0.9, y: upper ? 0.2 : 0.6 };
    const escape = { x: left ? 0.15 : 0.85, y: pin.y };
    return [endpointKey(endpoint), { pin, escape }];
  }));
  return { anchors, family: materializeRouteFamily(net, null, anchors) };
}

function assertOrthogonalFamily(family, anchors) {
  for (const branch of routeFamilyPaths(family, anchors)) {
    for (let index = 0; index < branch.points.length - 1; index += 1) {
      assert.notEqual(routeSegmentOrientation(branch.points[index], branch.points[index + 1]), null);
    }
  }
}

test('C-19/C-20 horizontal and vertical section moves shift both bounds on the snapped world grid', () => {
  const { editor } = buildManualProject();
  const net = editor.project.circuit.nets.find((item) => item.id === 'net-d13');
  const { anchors, family } = routeFixture(net);
  const endpoint = endpointKey(net.endpoints[0]);
  const horizontal = moveRouteSegment(family, anchors, endpoint, 0, 0.333, net);
  const horizontalPath = routeFamilyPaths(horizontal, anchors).find((item) => endpointKey(item.endpoint) === endpoint).points;
  assert.deepEqual(horizontalPath.slice(0, 4), [
    anchors[endpoint].pin,
    { x: anchors[endpoint].pin.x, y: 0.33 },
    { x: 0.5, y: 0.33 },
    { x: 0.5, y: 0.4 },
  ]);
  const vertical = moveRouteSegment(family, anchors, endpoint, 1, 0.617, net);
  const verticalPath = routeFamilyPaths(vertical, anchors).find((item) => endpointKey(item.endpoint) === endpoint).points;
  assert.deepEqual(verticalPath, [
    anchors[endpoint].pin,
    { x: 0.62, y: anchors[endpoint].pin.y },
    { x: 0.62, y: 0.4 },
    { x: 0.5, y: 0.4 },
  ]);
  assertOrthogonalFamily(horizontal, anchors);
  assertOrthogonalFamily(vertical, anchors);
});

test('C-21/C-22 fixed pins gain doglegs while unrelated branches and explicit junction identity remain fixed', () => {
  const { editor } = buildManualProject();
  const net = editor.project.circuit.nets.find((item) => item.id === 'net-ground');
  const { anchors, family } = routeFixture(net);
  const endpoint = endpointKey(net.endpoints[0]);
  const remoteBefore = family.branches
    .filter((branch) => endpointKey(branch.endpoint) !== endpoint)
    .map((branch) => clone(branch));
  const circuitBefore = canonicalCircuitJson(editor.project.circuit);
  const moved = moveRouteSegment(family, anchors, endpoint, 0, 0.37, net);
  const selectedPath = routeFamilyPaths(moved, anchors).find((branch) => endpointKey(branch.endpoint) === endpoint).points;
  assert.deepEqual(selectedPath[0], anchors[endpoint].pin);
  assert.deepEqual(
    moved.branches.filter((branch) => endpointKey(branch.endpoint) !== endpoint),
    remoteBefore,
  );
  assert.equal(editor.project.circuit.junctions.find((junction) => junction.net === net.id).id, 'junction-ground');
  assert.equal(canonicalCircuitJson(editor.project.circuit), circuitBefore);
});

test('C-23/C-24 release normalization removes zero and redundant points without joining crossing nets', () => {
  assert.deepEqual(normalizeOrthogonalPath([
    { x: 0.1, y: 0.1 }, { x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 },
    { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 },
  ]), [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }]);
  const { editor } = buildManualProject();
  const graphBefore = canonicalCircuitJson(editor.project.circuit);
  const d13 = editor.project.circuit.nets.find((net) => net.id === 'net-d13');
  const button = editor.project.circuit.nets.find((net) => net.id === 'net-button');
  const first = routeFixture(d13);
  const second = routeFixture(button);
  moveRouteSegment(first.family, first.anchors, endpointKey(d13.endpoints[0]), 0, 0.4, d13);
  moveRouteSegment(second.family, second.anchors, endpointKey(button.endpoints[0]), 0, 0.4, button);
  assert.equal(canonicalCircuitJson(editor.project.circuit), graphBefore);
  assert.notEqual(endpointConnection(editor.project.circuit, d13.endpoints[0]), endpointConnection(editor.project.circuit, button.endpoints[0]));
});

test('C-25/C-26 route family is one undo transaction and round-trips through canonical persistence', () => {
  const { editor } = buildManualProject();
  const net = editor.project.circuit.nets.find((item) => item.id === 'net-d13');
  const { anchors, family } = routeFixture(net);
  const moved = moveRouteSegment(family, anchors, endpointKey(net.endpoints[0]), 0, 0.33, net);
  const before = exportCanonicalProject(editor.project);
  const revision = editor.revision;
  const result = editor.apply({
    type: 'wire.route.family.set', revision, netId: net.id, family: moved,
  });
  assert.equal(result.ok, true);
  assert.equal(editor.revision, revision + 1);
  assert.equal(editor.project.layout.wireRoutes[net.id].schema, ROUTE_SCHEMA);
  const committed = exportCanonicalProject(editor.project);
  const reopened = parseProjectV2(committed);
  assert.equal(reopened.ok, true);
  assert.equal(exportCanonicalProject(reopened.project), committed);
  assert.equal(editor.apply({ type: 'undo', revision: editor.revision }).ok, true);
  assert.equal(exportCanonicalProject(editor.project), before);
  assert.equal(editor.apply({ type: 'redo', revision: editor.revision }).ok, true);
  assert.equal(exportCanonicalProject(editor.project), committed);
});

test('C-27/C-28 route validation rejects diagonal or incomplete families atomically', () => {
  const { editor } = buildManualProject();
  const net = editor.project.circuit.nets.find((item) => item.id === 'net-d13');
  const { family } = routeFixture(net);
  const invalid = clone(family);
  invalid.branches[0].points = [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.4 }];
  assert.equal(normalizeStoredRoute(invalid, net), null);
  const before = exportCanonicalProject(editor.project);
  const rejected = editor.apply({
    type: 'wire.route.family.set', revision: editor.revision, netId: net.id, family: invalid,
  });
  assert.equal(rejected.code, 'EDITOR_ROUTE');
  assert.equal(exportCanonicalProject(editor.project), before);
  const incomplete = clone(family); incomplete.branches.pop();
  assert.equal(normalizeStoredRoute(incomplete, net), null);
});

test('C-29/C-30 manual and Prompt Bridge projects use the same route command without changing wire colour or net identity', () => {
  const manual = buildManualProject().editor;
  const parsed = parsePromptBridgeV2(canonicalCircuitJson(manual.project.circuit));
  assert.equal(parsed.ok, true);
  const promptEditor = new ProjectEditorReducer(projectFromCircuit(parsed.graph, manual.project.source.files[0].content));
  for (const candidate of [manual, promptEditor]) {
    const net = candidate.project.circuit.nets.find((item) => item.id === 'net-d13');
    const { anchors, family } = routeFixture(net);
    const moved = moveRouteSegment(family, anchors, endpointKey(net.endpoints[0]), 0, 0.33, net);
    const color = candidate.project.layout.wireStyles[net.id].color;
    const circuit = canonicalCircuitJson(candidate.project.circuit);
    const result = candidate.apply({
      type: 'wire.route.family.set', revision: candidate.revision, netId: net.id, family: moved,
    });
    assert.equal(result.ok, true);
    assert.equal(candidate.project.layout.wireStyles[net.id].color, color);
    assert.equal(canonicalCircuitJson(candidate.project.circuit), circuit);
    assert.equal(candidate.project.layout.wireRoutes[net.id].schema, ROUTE_SCHEMA);
  }
});

test('route families preserve unaffected geometry through explicit branch, reconnect and component removal commands', () => {
  const { editor, apply } = buildManualProject();
  const net = editor.project.circuit.nets.find((item) => item.id === 'net-d13');
  const { family } = routeFixture(net);
  apply({ type: 'wire.route.family.set', netId: net.id, family });
  const added = newComponent('button.momentary-v1', editor.project.circuit);
  apply({ type: 'component.add', component: added, position: { x: 0.84, y: 0.75 } });
  const originalBranches = clone(editor.project.layout.wireRoutes[net.id].branches);
  apply({
    type: 'wire.branch', netId: net.id,
    endpoint: { component: added.id, pin: 'B' }, junctionId: 'junction-d13',
  });
  assert.equal(editor.project.layout.wireRoutes[net.id].branches.length, 3);
  assert.deepEqual(editor.project.layout.wireRoutes[net.id].branches.filter((branch) => branch.endpoint.component !== added.id), originalBranches);
  apply({
    type: 'wire.reconnect', netId: net.id,
    from: { component: 'board-1', pin: 'D13' }, to: { component: 'board-1', pin: 'D12' },
  });
  assert.equal(editor.project.layout.wireRoutes[net.id].branches.some((branch) => branch.endpoint.pin === 'D12'), true);
  assert.equal(editor.project.layout.wireRoutes[net.id].branches.some((branch) => branch.endpoint.pin === 'D13'), false);
  apply({ type: 'component.remove', componentId: added.id });
  assert.equal(editor.project.layout.wireRoutes[net.id].branches.length, 2);
  assert.equal(parseProjectV2(exportCanonicalProject(editor.project)).ok, true);
});

test('C-31 Add bend inserts one orthogonal jog without changing connectivity', () => {
  const { editor } = buildManualProject();
  const net = editor.project.circuit.nets.find((item) => item.id === 'net-d13');
  const { anchors, family } = routeFixture(net);
  const before = canonicalCircuitJson(editor.project.circuit);
  const endpoint = endpointKey(net.endpoints[0]);
  const jogged = addRouteJog(family, anchors, endpoint, 0, net);
  assertOrthogonalFamily(jogged, anchors);
  const originalPath = routeFamilyPaths(family, anchors).find((branch) => endpointKey(branch.endpoint) === endpoint).points;
  const joggedPath = routeFamilyPaths(jogged, anchors).find((branch) => endpointKey(branch.endpoint) === endpoint).points;
  assert.ok(joggedPath.length > originalPath.length);
  assert.notEqual(joggedPath[1].y, originalPath[0].y);
  const revision = editor.revision;
  assert.equal(editor.apply({ type: 'wire.route.family.set', revision, netId: net.id, family: jogged }).ok, true);
  assert.equal(editor.revision, revision + 1);
  assert.equal(canonicalCircuitJson(editor.project.circuit), before);
  assert.equal(editor.apply({ type: 'undo', revision: editor.revision }).ok, true);
  assert.equal(editor.project.layout.wireRoutes[net.id], undefined);
});

test('C-32 branch delete preserves the rest of the net and whole-net delete stays distinct', () => {
  const { editor, apply, ids } = buildManualProject();
  const net = editor.project.circuit.nets.find((item) => item.id === 'net-ground');
  const { family } = routeFixture(net);
  apply({ type: 'wire.route.family.set', netId: net.id, family });
  const unaffected = net.endpoints.filter((endpoint) => endpoint.component !== ids.pot).map(endpointKey).sort();
  const deleted = apply({
    type: 'wire.branch.delete', netId: net.id, endpoint: { component: ids.pot, pin: 'LOW' },
  });
  assert.equal(deleted.buildRelevant, true);
  const remaining = editor.project.circuit.nets.find((item) => item.id === 'net-ground');
  assert.deepEqual(remaining.endpoints.map(endpointKey).sort(), unaffected);
  assert.equal(editor.project.circuit.nets.some((item) => item.id === 'net-ground'), true);
  assert.equal(editor.project.circuit.junctions.some((item) => item.net === 'net-ground'), true);
  assert.equal(editor.project.layout.wireRoutes['net-ground'].branches.length, 3);
  const rejected = editor.apply({
    type: 'wire.branch.delete', revision: editor.revision,
    netId: 'net-d13', endpoint: editor.project.circuit.nets.find((item) => item.id === 'net-d13').endpoints[0],
  });
  assert.equal(rejected.code, 'EDITOR_BRANCH_REQUIRED');
  assert.equal(editor.apply({ type: 'wire.delete', revision: editor.revision, netId: 'net-ground' }).ok, true);
  assert.equal(editor.project.circuit.nets.some((item) => item.id === 'net-ground'), false);
});
