// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { CIRCUIT_SCHEMA } from './circuit-engine.mjs';
import { newComponent, projectFromCircuit } from './project-editor.mjs';

const EXAMPLES = Object.freeze({
  blink: {
    name: 'Blink LED', description: 'Blink D13 and print readable ON/OFF lines.',
    parts: ['board.atmega328p-16mhz-v1', 'resistor.fixed-v1', 'led.basic-v1'],
    nets: [['board', 'D13', 1, 'A'], [1, 'B', 2, 'ANODE'], [2, 'CATHODE', 'board', 'GND1']],
    source: `void setup() { pinMode(13, OUTPUT); Serial.begin(9600); }\nvoid loop() {\n  digitalWrite(13, HIGH); Serial.write('1'); Serial.println(" ON"); delay(300);\n  digitalWrite(13, LOW); Serial.write('0'); Serial.println(" OFF"); delay(300);\n}`,
  },
  button: {
    name: 'Button input', description: 'Read a pull-up button on D2 and report PRESSED/RELEASED.',
    parts: ['board.atmega328p-16mhz-v1', 'button.momentary-v1'],
    nets: [['board', 'D2', 1, 'A'], [1, 'B', 'board', 'GND1']],
    source: `void setup() { pinMode(2, INPUT_PULLUP); Serial.begin(9600); }\nvoid loop() {\n  Serial.println(digitalRead(2) == LOW ? "PRESSED" : "RELEASED");\n  delay(120);\n}`,
  },
  adc: {
    name: 'ADC dial', description: 'Read the potentiometer on A0 and print its 10-bit value.',
    parts: ['board.atmega328p-16mhz-v1', 'potentiometer.linear-v1'],
    nets: [['board', '5V', 1, 'HIGH'], [1, 'WIPER', 'board', 'A0'], [1, 'LOW', 'board', 'GND1']],
    source: `void setup() { Serial.begin(9600); }\nvoid loop() {\n  Serial.println(analogRead(A0));\n  delay(150);\n}`,
  },
  pwm: {
    name: 'PWM fade', description: 'Drive an LED from PWM pin D3 and inspect its waveform.',
    parts: ['board.atmega328p-16mhz-v1', 'resistor.fixed-v1', 'led.basic-v1'],
    nets: [['board', 'D3', 1, 'A'], [1, 'B', 2, 'ANODE'], [2, 'CATHODE', 'board', 'GND1']],
    source: `void setup() { pinMode(3, OUTPUT); Serial.begin(9600); }\nvoid loop() {\n  for (int level = 0; level <= 255; level += 15) { analogWrite(3, level); delay(30); }\n  Serial.println("FADE");\n}`,
  },
});

export function exampleCatalog() {
  return Object.entries(EXAMPLES).map(([id, example]) => ({ id, name: example.name, description: example.description }));
}

export function createExampleProject(id) {
  const example = EXAMPLES[id];
  if (!example) throw new Error('EXAMPLE_UNKNOWN');
  const circuit = { schema: CIRCUIT_SCHEMA, components: [], nets: [], junctions: [] };
  for (const type of example.parts) circuit.components.push(newComponent(type, circuit));
  const board = circuit.components[0];
  const endpoint = (component, pin) => ({ component: component === 'board' ? board.id : circuit.components[component].id, pin });
  example.nets.forEach((definition, index) => {
    const [leftComponent, leftPin, rightComponent, rightPin] = definition;
    circuit.nets.push({ id: `net-example-${index + 1}`, endpoints: [endpoint(leftComponent, leftPin), endpoint(rightComponent, rightPin)] });
  });
  const project = projectFromCircuit(circuit, example.source);
  const placements = example.parts.length === 2
    ? [[0.29, 0.46], [0.74, 0.48]]
    : [[0.27, 0.52], [0.62, 0.3], [0.82, 0.48]];
  project.circuit.components.forEach((component, index) => {
    project.layout.positions[component.id] = { x: placements[index][0], y: placements[index][1], rotation: 0 };
  });
  if (id === 'pwm') project.instruments.logicChannels = ['D3'];
  if (id === 'button') project.instruments.logicChannels = ['D2'];
  if (id === 'adc') project.instruments.selectedPin = 'A0';
  return { name: example.name, description: example.description, project };
}
