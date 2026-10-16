// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { CIRCUIT_LIMITS } from '../src/component-catalog.mjs';
import { CIRCUIT_SCHEMA, createComponent } from '../src/circuit-engine.mjs';
import { projectFromCircuit } from '../src/project-editor.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import {
  CHARACTER_LCD_TYPE,
  createCharacterLcdComponent,
} from './character-lcd-16x2-4bit-v1.mjs';
import {
  COMMON_CATHODE_RGB_LED_TYPE,
  createCommonCathodeRgbLedComponent,
} from './common-cathode-rgb-led-v1.mjs';
import { BUTTON_PULLUP_FIXTURE_REFERENCE } from './contact-persistence-fixture-v1.mjs';
import {
  CANDIDATE_LAYOUT_SCHEMA,
  canonicalContactPersistenceDraftJson,
  createContactPersistenceDraft,
  synchronizeContactPersistenceRuntime,
} from './project-v3-contact-persistence.mjs';
import { migrateProjectV2ToV3 } from './project-v3-envelope.mjs';
import {
  TEMPERATURE_ANALOGUE_SENSOR_TYPE,
  createTemperatureAnalogueSensorComponent,
} from './temperature-analogue-sensor-v1.mjs';

export const TEMPERATURE_LCD_THRESHOLD_EXAMPLE_ID = 'temperature-lcd-threshold';
export const TEMPERATURE_LCD_THRESHOLD_C = 30;
export const TEMPERATURE_LCD_QUANTIZATION_C = 200 / 1024;
export const TEMPERATURE_LCD_PIN_MAP = Object.freeze({
  temperature: 'A1',
  lcd: Object.freeze({ RS: 'D3', E: 'D4', D4: 'D7', D5: 'D8', D6: 'D10', D7: 'D12' }),
  rgb: Object.freeze({ R: 'D5', G: 'D6', B: 'D9' }),
});

export const TEMPERATURE_LCD_THRESHOLD_CARD = Object.freeze({
  id: TEMPERATURE_LCD_THRESHOLD_EXAMPLE_ID,
  name: 'Temperature display',
  description: 'Read an idealized temperature input, update a 16×2 LCD, and cross a 30 °C RGB threshold.',
  focus: 'Compiled sensor → LCD + RGB',
  partsLabel: 'Controller · temperature module · LCD · RGB LED · 3 resistors',
  outcome: 'Move the temperature control and watch compiled firmware update both outputs.',
  componentTypes: Object.freeze([
    'board.atmega328p-16mhz-v1', TEMPERATURE_ANALOGUE_SENSOR_TYPE,
    CHARACTER_LCD_TYPE, COMMON_CATHODE_RGB_LED_TYPE,
    'resistor.fixed-v1', 'resistor.fixed-v1', 'resistor.fixed-v1',
  ]),
});

export const TEMPERATURE_LCD_THRESHOLD_SOURCE = `// Original educational example: ideal temperature input, LCD text and RGB threshold.
// A1 is an ideal -50..150 C source. ADC quantization is 200/1024 C per count.
const byte TEMP_PIN = A1;
const byte LCD_RS = 3;
const byte LCD_E = 4;
const byte LCD_D4 = 7;
const byte LCD_D5 = 8;
const byte LCD_D6 = 10;
const byte LCD_D7 = 12;
const byte RGB_R = 5;
const byte RGB_G = 6;
const byte RGB_B = 9;
const int HOT_THRESHOLD_C = 30;
int previousTemperatureC = 32767;

void lcdPulse() {
  digitalWrite(LCD_E, HIGH);
  delayMicroseconds(2);
  digitalWrite(LCD_E, LOW);
  delayMicroseconds(60);
}

void lcdNibble(byte value) {
  digitalWrite(LCD_D4, value & 1);
  digitalWrite(LCD_D5, value & 2);
  digitalWrite(LCD_D6, value & 4);
  digitalWrite(LCD_D7, value & 8);
  lcdPulse();
}

void lcdSend(byte value, bool data) {
  digitalWrite(LCD_RS, data ? HIGH : LOW);
  lcdNibble(value >> 4);
  lcdNibble(value & 15);
}

void lcdCommand(byte value) {
  lcdSend(value, false);
  if (value == 1 || value == 2) delayMicroseconds(1600);
}

void lcdWrite(char value) { lcdSend((byte)value, true); }

void lcdInit() {
  pinMode(LCD_RS, OUTPUT); pinMode(LCD_E, OUTPUT);
  pinMode(LCD_D4, OUTPUT); pinMode(LCD_D5, OUTPUT);
  pinMode(LCD_D6, OUTPUT); pinMode(LCD_D7, OUTPUT);
  digitalWrite(LCD_RS, LOW); digitalWrite(LCD_E, LOW);
  delay(20);
  lcdNibble(3); delayMicroseconds(4200);
  lcdNibble(3); delayMicroseconds(150);
  lcdNibble(3); delayMicroseconds(150);
  lcdNibble(2);
  lcdCommand(0x28); lcdCommand(0x0C); lcdCommand(0x06); lcdCommand(0x01);
}

byte lcdText(const char *text) {
  byte count = 0;
  while (*text && count < 16) { lcdWrite(*text++); count++; }
  return count;
}

byte lcdInteger(int value) {
  char digits[7];
  byte count = 0;
  unsigned int magnitude;
  if (value < 0) { lcdWrite('-'); count++; magnitude = (unsigned int)(-value); }
  else magnitude = (unsigned int)value;
  byte length = 0;
  do { digits[length++] = char('0' + magnitude % 10); magnitude /= 10; } while (magnitude && length < 6);
  while (length) { lcdWrite(digits[--length]); count++; }
  return count;
}

void lcdPad(byte count) { while (count++ < 16) lcdWrite(' '); }

void showTemperature(int temperatureC) {
  lcdCommand(0x80);
  byte count = lcdText("Temp: ");
  count += lcdInteger(temperatureC);
  count += lcdText(" C");
  lcdPad(count);
  lcdCommand(0xC0);
  if (temperatureC >= HOT_THRESHOLD_C) lcdPad(lcdText("HOT >= 30 C"));
  else lcdPad(lcdText("COOL < 30 C"));
}

void showThresholdColour(bool hot) {
  analogWrite(RGB_R, hot ? 255 : 0);
  analogWrite(RGB_G, hot ? 0 : 96);
  analogWrite(RGB_B, hot ? 0 : 255);
}

void setup() {
  pinMode(RGB_R, OUTPUT); pinMode(RGB_G, OUTPUT); pinMode(RGB_B, OUTPUT);
  Serial.begin(9600);
  lcdInit();
}

void loop() {
  int raw = analogRead(TEMP_PIN);
  int temperatureC = (int)((raw * 200L) / 1024L) - 50;
  if (temperatureC != previousTemperatureC) {
    bool hot = temperatureC >= HOT_THRESHOLD_C;
    showTemperature(temperatureC);
    showThresholdColour(hot);
    Serial.print("TEMP_C="); Serial.print(temperatureC);
    Serial.println(hot ? " STATE=HOT" : " STATE=COOL");
    previousTemperatureC = temperatureC;
  }
  delay(100);
}
`;

const clone = (value) => structuredClone(value);
const endpoint = (component, pin) => ({ component, pin });
const net = (id, ...endpoints) => ({ id, endpoints });

function candidateCircuit() {
  const graph = {
    schema: CIRCUIT_SCHEMA,
    components: [
      createComponent('board-1', 'board.atmega328p-16mhz-v1', { label: 'ATmega328P learning controller' }),
      createTemperatureAnalogueSensorComponent('temperature-sensor-1', 'Ideal temperature input', { temperatureC: 25 }),
      createCharacterLcdComponent('character-lcd-1', 'Temperature 16×2 display'),
      createCommonCathodeRgbLedComponent('rgb-led-1', 'Threshold RGB indicator'),
      createComponent('resistor-red', 'resistor.fixed-v1', { label: 'Red channel 220 Ω', properties: { ohms: 220 } }),
      createComponent('resistor-green', 'resistor.fixed-v1', { label: 'Green channel 220 Ω', properties: { ohms: 220 } }),
      createComponent('resistor-blue', 'resistor.fixed-v1', { label: 'Blue channel 220 Ω', properties: { ohms: 220 } }),
    ],
    nets: [
      net('net-example-5v', endpoint('board-1', '5V'), endpoint('temperature-sensor-1', 'VCC'), endpoint('character-lcd-1', 'VCC')),
      net('net-example-ground', endpoint('board-1', 'GND1'), endpoint('temperature-sensor-1', 'GND'), endpoint('character-lcd-1', 'GND'), endpoint('character-lcd-1', 'RW'), endpoint('rgb-led-1', 'COM')),
      net('net-example-temperature', endpoint('temperature-sensor-1', 'AOUT'), endpoint('board-1', TEMPERATURE_LCD_PIN_MAP.temperature)),
      ...Object.entries(TEMPERATURE_LCD_PIN_MAP.lcd).map(([signal, pin]) => net(
        `net-example-lcd-${signal.toLowerCase()}`,
        endpoint('character-lcd-1', signal), endpoint('board-1', pin),
      )),
      net('net-example-rgb-red-led', endpoint('rgb-led-1', 'R'), endpoint('resistor-red', 'A')),
      net('net-example-rgb-red-drive', endpoint('resistor-red', 'B'), endpoint('board-1', TEMPERATURE_LCD_PIN_MAP.rgb.R)),
      net('net-example-rgb-green-led', endpoint('rgb-led-1', 'G'), endpoint('resistor-green', 'A')),
      net('net-example-rgb-green-drive', endpoint('resistor-green', 'B'), endpoint('board-1', TEMPERATURE_LCD_PIN_MAP.rgb.G)),
      net('net-example-rgb-blue-led', endpoint('rgb-led-1', 'B'), endpoint('resistor-blue', 'A')),
      net('net-example-rgb-blue-drive', endpoint('resistor-blue', 'B'), endpoint('board-1', TEMPERATURE_LCD_PIN_MAP.rgb.B)),
    ],
    junctions: [
      { id: 'junction-example-5v', net: 'net-example-5v' },
      { id: 'junction-example-ground-a', net: 'net-example-ground' },
      { id: 'junction-example-ground-b', net: 'net-example-ground' },
      { id: 'junction-example-ground-c', net: 'net-example-ground' },
    ],
  };
  const endpoints = graph.nets.reduce((sum, item) => sum + item.endpoints.length, 0);
  if (graph.components.length > CIRCUIT_LIMITS.components
      || graph.nets.length > CIRCUIT_LIMITS.nets || endpoints > CIRCUIT_LIMITS.endpoints) {
    throw new Error('TEMPERATURE_LCD_EXAMPLE_LIMIT');
  }
  return graph;
}

function candidateLayout(graph) {
  const positions = {
    'board-1': { x: 0.27, y: 0.45, rotation: 0 },
    'temperature-sensor-1': { x: 0.14, y: 0.79, rotation: 0 },
    'character-lcd-1': { x: 0.73, y: 0.20, rotation: 0 },
    'rgb-led-1': { x: 0.79, y: 0.75, rotation: 0 },
    'resistor-red': { x: 0.53, y: 0.60, rotation: 0 },
    'resistor-green': { x: 0.53, y: 0.72, rotation: 0 },
    'resistor-blue': { x: 0.53, y: 0.84, rotation: 0 },
  };
  if (Object.keys(positions).sort().join('|') !== graph.components.map((component) => component.id).sort().join('|')) {
    throw new Error('TEMPERATURE_LCD_EXAMPLE_LAYOUT');
  }
  return {
    schema: CANDIDATE_LAYOUT_SCHEMA,
    positions,
    wireRoutes: {},
    viewport: { zoom: 0.85, panX: 0, panY: 0 },
  };
}

export function createTemperatureLcdThresholdExample() {
  const graph = candidateCircuit();
  const boardOnly = {
    schema: CIRCUIT_SCHEMA,
    components: [clone(graph.components.find((component) => component.id === 'board-1'))],
    nets: [],
    junctions: [],
  };
  const baseV2 = projectFromCircuit(boardOnly, TEMPERATURE_LCD_THRESHOLD_SOURCE);
  baseV2.metadata.name = TEMPERATURE_LCD_THRESHOLD_CARD.name;
  baseV2.instruments.logicChannels = ['D3', 'D4', 'D5', 'D6', 'D9'];
  baseV2.instruments.selectedPin = 'A1';
  const migrated = migrateProjectV2ToV3(baseV2);
  if (!migrated.ok) throw new Error(migrated.code);
  const draft = createContactPersistenceDraft(
    migrated.project, graph, candidateLayout(graph), BUTTON_PULLUP_FIXTURE_REFERENCE,
  );
  if (!draft.ok) throw new Error(draft.code);
  const synchronized = synchronizeContactPersistenceRuntime(draft.project);
  if (!synchronized.ok || !synchronized.reconstruction.runnable.ok) {
    throw new Error(synchronized.code ?? synchronized.reconstruction.runnable.code);
  }
  return {
    id: TEMPERATURE_LCD_THRESHOLD_EXAMPLE_ID,
    name: TEMPERATURE_LCD_THRESHOLD_CARD.name,
    description: TEMPERATURE_LCD_THRESHOLD_CARD.description,
    project: clone(synchronized.project),
    text: canonicalContactPersistenceDraftJson(synchronized.project),
    limits: {
      components: graph.components.length,
      nets: graph.nets.length,
      endpoints: graph.nets.reduce((sum, item) => sum + item.endpoints.length, 0),
    },
  };
}

export function openTemperatureLcdThresholdExample(source) {
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
