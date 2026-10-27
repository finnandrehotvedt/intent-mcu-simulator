// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { CIRCUIT_SCHEMA } from './circuit-engine.mjs';
import { newComponent, projectFromCircuit } from './project-editor.mjs';

const EXAMPLES = Object.freeze({
  blink: {
    name: 'Blink LED', description: 'Blink D13 and print readable ON/OFF lines.',
    focus: 'Digital output + timing', partsLabel: 'Controller · resistor · LED',
    outcome: 'See the LED and logic trace change together.',
    learn: 'How firmware timing changes one digital output.',
    try: 'Build, Run, then change one delay value and rebuild.',
    observe: 'D13, the LED, logic trace and Serial ON/OFF records.',
    limits: 'Ideal D13 output and timing; no physical LED or clock tolerance.',
    next: 'Load Button input to add a user-controlled digital input.',
    parts: ['board.atmega328p-16mhz-v1', 'resistor.fixed-v1', 'led.basic-v1'],
    nets: [['board', 'D13', 1, 'A'], [1, 'B', 2, 'ANODE'], [2, 'CATHODE', 'board', 'GND1']],
    source: `void setup() { pinMode(13, OUTPUT); Serial.begin(9600); }\nvoid loop() {\n  digitalWrite(13, HIGH); Serial.write('1'); Serial.println(" ON"); delay(300);\n  digitalWrite(13, LOW); Serial.write('0'); Serial.println(" OFF"); delay(300);\n}`,
  },
  button: {
    name: 'Button input', description: 'Read a pull-up button on D2 and report PRESSED/RELEASED.',
    focus: 'Digital input + pull-up', partsLabel: 'Controller · pushbutton',
    outcome: 'Press the virtual button and inspect D2.',
    learn: 'How INPUT_PULLUP makes a pressed button active-low.',
    try: 'Build, Run, then press and release the button.',
    observe: 'D2 and Serial alternate between PRESSED and RELEASED.',
    limits: 'Ideal contact only; no switch bounce or physical resistance.',
    next: 'Load ADC dial to compare a digital input with a measured analogue value.',
    parts: ['board.atmega328p-16mhz-v1', 'button.momentary-v1'],
    nets: [['board', 'D2', 1, 'A'], [1, 'B', 'board', 'GND1']],
    source: `void setup() { pinMode(2, INPUT_PULLUP); Serial.begin(9600); }\nvoid loop() {\n  Serial.println(digitalRead(2) == LOW ? "PRESSED" : "RELEASED");\n  delay(120);\n}`,
  },
  adc: {
    name: 'ADC dial', description: 'Read the potentiometer on A0 and print its 10-bit value.',
    focus: 'Analogue input', partsLabel: 'Controller · potentiometer',
    outcome: 'Turn the dial and compare voltage with ADC counts.',
    learn: 'How an analogue voltage maps to a 10-bit ADC value.',
    try: 'Build, Run, then turn the dial through its range.',
    observe: 'A0 voltage and Serial counts move together.',
    limits: 'Ideal 0–5 V input; no noise, tolerance or loading.',
    next: 'Load Trimmer calibration to compare a set-and-retain adjustment with a rotary control.',
    parts: ['board.atmega328p-16mhz-v1', 'potentiometer.linear-v1'],
    nets: [['board', '5V', 1, 'HIGH'], [1, 'WIPER', 'board', 'A0'], [1, 'LOW', 'board', 'GND1']],
    source: `void setup() { Serial.begin(9600); }\nvoid loop() {\n  Serial.println(analogRead(A0));\n  delay(150);\n}`,
  },
  trimmer: {
    name: 'Trimmer calibration', description: 'Read the top-adjust trimmer on A1 and print its retained calibration value.',
    focus: 'Analogue calibration input', partsLabel: 'Controller · trimmer potentiometer',
    outcome: 'Adjust the trimmer and compare voltage with ADC counts.',
    learn: 'How a three-terminal trimmer provides a retained calibration voltage.',
    try: 'Build, Run, then move the trimmer through its range.',
    observe: 'A1 voltage and Serial TRIM counts move together.',
    limits: 'Ideal unloaded linear 0–5 V divider; no screw mechanics, tolerance, noise or loading.',
    next: 'Load PWM fade to turn a measured range into a variable output.',
    parts: ['board.atmega328p-16mhz-v1', 'potentiometer.trimmer-v1'],
    nets: [['board', '5V', 1, 'HIGH'], [1, 'WIPER', 'board', 'A1'], [1, 'LOW', 'board', 'GND1']],
    source: `void setup() { Serial.begin(9600); }\nvoid loop() {\n  Serial.print("TRIM "); Serial.println(analogRead(A1));\n  delay(150);\n}`,
  },
  pwm: {
    name: 'PWM fade', description: 'Drive an LED from PWM pin D3 and inspect its waveform.',
    focus: 'PWM output + waveform', partsLabel: 'Controller · resistor · LED',
    outcome: 'Relate duty cycle to LED brightness.',
    learn: 'How PWM duty cycle represents a variable output.',
    try: 'Build, Run, then change the fade step and rebuild.',
    observe: 'D3 waveform, relative LED brightness and Serial FADE records.',
    limits: 'Ideal PWM and relative brightness; no physical LED response.',
    next: 'Load PWM pulse to compare exact duty-cycle boundaries.',
    parts: ['board.atmega328p-16mhz-v1', 'resistor.fixed-v1', 'led.basic-v1'],
    nets: [['board', 'D3', 1, 'A'], [1, 'B', 2, 'ANODE'], [2, 'CATHODE', 'board', 'GND1']],
    source: `void setup() { pinMode(3, OUTPUT); Serial.begin(9600); }\nvoid loop() {\n  for (int level = 0; level <= 255; level += 15) { analogWrite(3, level); delay(30); }\n  Serial.println("FADE");\n}`,
  },
  'pwm-pulse': {
    name: 'PWM pulse', description: 'Compare two fixed PWM levels on D3 and print each phase.',
    focus: 'PWM output + duty-cycle boundary', partsLabel: 'Controller · resistor · LED',
    outcome: 'See 25% and 75% duty cycles in the LED and waveform.',
    learn: 'How fixed PWM values define exact duty-cycle boundaries.',
    try: 'Build, Run, then edit 64 or 191 and rebuild.',
    observe: 'D3 alternates between 25% and 75% with matching Serial phases.',
    limits: 'Ideal PWM and relative brightness; no physical output timing.',
    next: 'Load Temperature display to combine analogue input with several outputs.',
    parts: ['board.atmega328p-16mhz-v1', 'resistor.fixed-v1', 'led.basic-v1'],
    nets: [['board', 'D3', 1, 'A'], [1, 'B', 2, 'ANODE'], [2, 'CATHODE', 'board', 'GND1']],
    source: `void setup() { pinMode(3, OUTPUT); Serial.begin(9600); }\nvoid loop() {\n  analogWrite(3, 64); Serial.println("PWM 25"); delay(300);\n  analogWrite(3, 191); Serial.println("PWM 75"); delay(300);\n}`,
  },
});

export function exampleCatalog() {
  return Object.entries(EXAMPLES).map(([id, example]) => ({
    id,
    name: example.name,
    description: example.description,
    focus: example.focus,
    partsLabel: example.partsLabel,
    outcome: example.outcome,
    learn: example.learn,
    try: example.try,
    observe: example.observe,
    limits: example.limits,
    next: example.next,
    componentTypes: [...example.parts],
  }));
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
  if (id === 'pwm' || id === 'pwm-pulse') project.instruments.logicChannels = ['D3'];
  if (id === 'button') project.instruments.logicChannels = ['D2'];
  if (id === 'adc') project.instruments.selectedPin = 'A0';
  if (id === 'trimmer') project.instruments.selectedPin = 'A1';
  return { name: example.name, description: example.description, project };
}
