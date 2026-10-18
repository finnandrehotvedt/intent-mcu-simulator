// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { CIRCUIT_LIMITS } from './component-catalog.mjs';
import { CIRCUIT_SCHEMA, createComponent } from './circuit-engine.mjs';
import { openCandidateUiSession } from './candidate-existing-ui-adapter.mjs';
import { projectFromCircuit } from './project-editor.mjs';
import {
  BUTTON_PULLUP_FIXTURE_REFERENCE,
} from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import {
  CANDIDATE_LAYOUT_SCHEMA,
  CONTACT_PERSISTENCE_SCHEMA,
  canonicalContactPersistenceDraftJson,
  createContactPersistenceDraft,
  synchronizeContactPersistenceRuntime,
} from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { migrateProjectV2ToV3 } from '../expansion-drafts/project-v3-envelope.mjs';
import {
  createTemperatureAnalogueSensorComponent,
} from '../expansion-drafts/temperature-analogue-sensor-v1.mjs';
import {
  THERMOSTAT_EXPERIMENT_ID,
  THERMOSTAT_REQUIREMENTS,
} from './thermostat-experiment-contract.mjs';

export const THERMOSTAT_EXPERIMENT_CARD = Object.freeze({
  id: THERMOSTAT_EXPERIMENT_ID,
  name: 'Thermostat boundary test',
  description: 'Test an ideal temperature input and enable button at the exact 30 °C boundary.',
  focus: 'M1 · Executed requirements',
  partsLabel: 'ATmega328P · temperature module · button · 220 Ω · LED',
  outcome: 'Run four reset-isolated boundary scenarios, then prove that a known-bad equality rule is caught.',
  componentTypes: Object.freeze([
    'board.atmega328p-16mhz-v1',
    'sensor.temperature-analogue-v1',
    'button.momentary-v1',
    'resistor.fixed-v1',
    'led.basic-v1',
  ]),
});

const SOURCE_PREFIX = `// Intent MCU experiment: ${THERMOSTAT_EXPERIMENT_ID}\n`;

export const THERMOSTAT_EXPERIMENT_SOURCE = `${SOURCE_PREFIX}// The module control is quantized by the tested 10-bit AVR ADC model.
const byte TEMP_PIN = A1;
const byte ENABLE_BUTTON_PIN = 2;
const byte HEATER_LED_PIN = 13;
const int SETPOINT_C = 30;

void setup() {
  pinMode(ENABLE_BUTTON_PIN, INPUT_PULLUP);
  pinMode(HEATER_LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(TEMP_PIN);
  int temperatureC = (int)((raw * 200L) / 1024L) - 50;
  bool enabled = digitalRead(ENABLE_BUTTON_PIN) == LOW;
  bool heating = enabled && temperatureC < SETPOINT_C;
  digitalWrite(HEATER_LED_PIN, heating ? HIGH : LOW);

  Serial.print("TEMP_C="); Serial.print(temperatureC);
  Serial.print(" BUTTON="); Serial.print(enabled ? "PRESSED" : "RELEASED");
  Serial.print(" HEATER="); Serial.print(heating ? "ON" : "OFF");
  Serial.print(" STATE="); Serial.println(!enabled ? "OFF" : heating ? "HEAT" : "HOLD");
  delay(100);
}
`;

export const THERMOSTAT_EXPERIMENT_KNOWN_BAD_SOURCE = THERMOSTAT_EXPERIMENT_SOURCE.replace(
  'temperatureC < SETPOINT_C',
  'temperatureC <= SETPOINT_C',
).replace(
  '// The module control is quantized by the tested 10-bit AVR ADC model.',
  '// KNOWN-BAD TEACHING VARIANT: equality incorrectly keeps the heater on.',
);

export const THERMOSTAT_EXPERIMENT_COMPARISON_ONLY_BAD_SOURCE = THERMOSTAT_EXPERIMENT_SOURCE.replace(
  'temperatureC < SETPOINT_C',
  'temperatureC <= SETPOINT_C',
);

const clone = (value) => structuredClone(value);
const endpoint = (component, pin) => ({ component, pin });
const net = (id, ...endpoints) => ({ id, endpoints });

function thermostatCircuit() {
  const graph = {
    schema: CIRCUIT_SCHEMA,
    components: [
      createComponent('board-1', 'board.atmega328p-16mhz-v1', {
        label: 'ATmega328P thermostat controller',
      }),
      createTemperatureAnalogueSensorComponent(
        'temperature-sensor-1',
        'Ideal room-temperature input',
        { temperatureC: 30 },
      ),
      createComponent('enable-button-1', 'button.momentary-v1', {
        label: 'Enable heating button',
      }),
      createComponent('heater-resistor-1', 'resistor.fixed-v1', {
        label: 'Heater indicator 220 Ω',
        properties: { ohms: 220 },
      }),
      createComponent('heater-led-1', 'led.basic-v1', {
        label: 'Heater command indicator',
        properties: { color: 'red' },
      }),
    ],
    nets: [
      net('net-thermostat-5v', endpoint('board-1', '5V'), endpoint('temperature-sensor-1', 'VCC')),
      net(
        'net-thermostat-ground',
        endpoint('board-1', 'GND1'),
        endpoint('temperature-sensor-1', 'GND'),
        endpoint('enable-button-1', 'B'),
        endpoint('heater-led-1', 'CATHODE'),
      ),
      net('net-thermostat-temperature', endpoint('temperature-sensor-1', 'AOUT'), endpoint('board-1', 'A1')),
      net('net-thermostat-enable', endpoint('enable-button-1', 'A'), endpoint('board-1', 'D2')),
      net('net-thermostat-heater-drive', endpoint('board-1', 'D13'), endpoint('heater-resistor-1', 'A')),
      net('net-thermostat-heater-led', endpoint('heater-resistor-1', 'B'), endpoint('heater-led-1', 'ANODE')),
    ],
    junctions: [
      { id: 'junction-thermostat-ground-sensor', net: 'net-thermostat-ground' },
      { id: 'junction-thermostat-ground-button', net: 'net-thermostat-ground' },
    ],
  };
  const endpointCount = graph.nets.reduce((count, item) => count + item.endpoints.length, 0);
  if (graph.components.length > CIRCUIT_LIMITS.components
      || graph.nets.length > CIRCUIT_LIMITS.nets
      || endpointCount > CIRCUIT_LIMITS.endpoints) {
    throw new Error('THERMOSTAT_EXPERIMENT_LIMIT');
  }
  return graph;
}

function thermostatLayout(graph) {
  const positions = {
    'board-1': { x: 0.30, y: 0.46, rotation: 0 },
    'temperature-sensor-1': { x: 0.14, y: 0.80, rotation: 0 },
    'enable-button-1': { x: 0.58, y: 0.78, rotation: 0 },
    'heater-resistor-1': { x: 0.62, y: 0.27, rotation: 0 },
    'heater-led-1': { x: 0.83, y: 0.28, rotation: 0 },
  };
  if (Object.keys(positions).sort().join('|')
      !== graph.components.map((component) => component.id).sort().join('|')) {
    throw new Error('THERMOSTAT_EXPERIMENT_LAYOUT');
  }
  return {
    schema: CANDIDATE_LAYOUT_SCHEMA,
    positions,
    wireRoutes: {},
    viewport: { zoom: 0.95, panX: 0, panY: 0 },
  };
}

export function createThermostatExperiment(firmwareVariant = 'correct') {
  const graph = thermostatCircuit();
  const boardOnly = {
    schema: CIRCUIT_SCHEMA,
    components: [clone(graph.components.find((component) => component.id === 'board-1'))],
    nets: [],
    junctions: [],
  };
  const baseV2 = projectFromCircuit(boardOnly, thermostatFirmwareSource(firmwareVariant));
  baseV2.metadata.name = THERMOSTAT_EXPERIMENT_CARD.name;
  baseV2.instruments.logicChannels = ['D2', 'D13'];
  baseV2.instruments.selectedPin = 'D13';
  const migrated = migrateProjectV2ToV3(baseV2);
  if (!migrated.ok) throw new Error(migrated.code);
  const draft = createContactPersistenceDraft(
    migrated.project,
    graph,
    thermostatLayout(graph),
    BUTTON_PULLUP_FIXTURE_REFERENCE,
  );
  if (!draft.ok) throw new Error(draft.code);
  const synchronized = synchronizeContactPersistenceRuntime(draft.project);
  if (!synchronized.ok || !synchronized.reconstruction.runnable.ok) {
    throw new Error(synchronized.code ?? synchronized.reconstruction.runnable.code);
  }
  return {
    id: THERMOSTAT_EXPERIMENT_ID,
    name: THERMOSTAT_EXPERIMENT_CARD.name,
    description: THERMOSTAT_EXPERIMENT_CARD.description,
    project: clone(synchronized.project),
    text: canonicalContactPersistenceDraftJson(synchronized.project),
    limits: {
      components: graph.components.length,
      nets: graph.nets.length,
      endpoints: graph.nets.reduce((count, item) => count + item.endpoints.length, 0),
    },
  };
}

export function openThermostatExperiment(source) {
  const opened = openCandidateUiSession(source);
  if (!opened.ok) return opened;
  if (!opened.session.runnable.ok) {
    return {
      ok: false,
      code: opened.session.runnable.code,
      details: clone(opened.session.runnable.details),
    };
  }
  return opened;
}

export const THERMOSTAT_PROJECT_ADAPTER = Object.freeze({
  schemas: Object.freeze([CONTACT_PERSISTENCE_SCHEMA]),
  prepare(value) {
    const opened = openThermostatExperiment(JSON.stringify(value));
    if (!opened.ok) {
      throw Object.assign(new Error(opened.code), {
        code: opened.code, details: opened.details ?? [],
      });
    }
    return {
      project: JSON.parse(opened.session.saveText()),
      prepared: opened.session,
      preserved: ['source', 'circuit', 'layout', 'wire routes/styles', 'instruments', 'supported controls'],
      fieldsDropped: ['build.inputIdentity', 'build.artifactIdentity', 'runtime results'],
    };
  },
  electrical: (result) => result.prepared?.runnable,
});

function sourceFromProject(value) {
  const project = value?.schema === CONTACT_PERSISTENCE_SCHEMA ? value.project : value;
  return project?.source?.files?.find((file) => file.name === 'main.ino')?.content ?? null;
}

export function thermostatFirmwareVariant(value) {
  const source = typeof value === 'string' ? value : sourceFromProject(value);
  if (source === THERMOSTAT_EXPERIMENT_SOURCE) return 'correct';
  if (source === THERMOSTAT_EXPERIMENT_KNOWN_BAD_SOURCE
      || source === THERMOSTAT_EXPERIMENT_COMPARISON_ONLY_BAD_SOURCE) return 'known-bad-equality';
  return 'modified';
}

export function thermostatFirmwareSource(variant) {
  if (variant === 'correct') return THERMOSTAT_EXPERIMENT_SOURCE;
  if (variant === 'known-bad-equality') return THERMOSTAT_EXPERIMENT_KNOWN_BAD_SOURCE;
  throw new TypeError('THERMOSTAT_FIRMWARE_VARIANT');
}

export function isThermostatExperimentProject(value) {
  if (!value) return false;
  const envelope = value.schema === CONTACT_PERSISTENCE_SCHEMA;
  const profile = envelope ? value.project?.controller?.profile : value.boardProfile;
  const graph = envelope ? value.candidateCircuit : value.circuit;
  if (profile !== THERMOSTAT_REQUIREMENTS.controller.profile
      || !['intent-mcu-candidate-editor-session@1', CONTACT_PERSISTENCE_SCHEMA].includes(value.schema)) {
    return false;
  }
  const components = new Map((graph?.components ?? []).map(
    (component) => [component.id, component.type],
  ));
  const expectedNets = [
    ['board-1.5V', 'temperature-sensor-1.VCC'],
    ['board-1.GND1', 'enable-button-1.B', 'heater-led-1.CATHODE', 'temperature-sensor-1.GND'],
    ['board-1.A1', 'temperature-sensor-1.AOUT'],
    ['board-1.D2', 'enable-button-1.A'],
    ['board-1.D13', 'heater-resistor-1.A'],
    ['heater-led-1.ANODE', 'heater-resistor-1.B'],
  ].map((members) => members.sort().join('|')).sort();
  const observedNets = (graph?.nets ?? []).map((item) => item.endpoints.map(
    (member) => `${member.component}.${member.pin}`,
  ).sort().join('|')).sort();
  const resistor = graph?.components?.find((component) => component.id === 'heater-resistor-1');
  return THERMOSTAT_EXPERIMENT_CARD.componentTypes.length === components.size
    && components.get('board-1') === 'board.atmega328p-16mhz-v1'
    && components.get('temperature-sensor-1') === 'sensor.temperature-analogue-v1'
    && components.get('enable-button-1') === 'button.momentary-v1'
    && components.get('heater-resistor-1') === 'resistor.fixed-v1'
    && components.get('heater-led-1') === 'led.basic-v1'
    && resistor?.properties?.ohms === 220
    && JSON.stringify(observedNets) === JSON.stringify(expectedNets);
}
