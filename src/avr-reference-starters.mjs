// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createActiveBuzzerComponent } from '../expansion-drafts/active-buzzer-module-v1.mjs';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { createDigitalLightThresholdComponent } from '../expansion-drafts/digital-light-threshold-module-v1.mjs';
import { createLightAnalogueSensorComponent } from '../expansion-drafts/light-analogue-sensor-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { createSevenSegmentComponent } from '../expansion-drafts/seven-segment-common-cathode-v1.mjs';
import { createFourDigitSevenSegmentComponent } from '../expansion-drafts/seven-segment-four-digit-common-cathode-v1.mjs';
import { createTrafficLightComponent } from '../expansion-drafts/traffic-light-module-v1.mjs';
import { createDht11Component } from '../expansion-drafts/dht11-temperature-humidity-v1.mjs';
import { createDht22Component } from '../expansion-drafts/dht22-temperature-humidity-v1.mjs';
import { createDs18b20Component } from '../expansion-drafts/ds18b20-temperature-v1.mjs';
import { createBme280Component } from '../expansion-drafts/bme280-environment-v1.mjs';
import {
  BME280_ENVIRONMENT_CARD,
  BME280_ENVIRONMENT_EXAMPLE_ID,
  BME280_ENVIRONMENT_SOURCE,
} from '../expansion-drafts/bme280-environment-example-v1.mjs';
import { createComponent } from './circuit-engine.mjs';
import { createCandidateUiComponent, openCandidateUiSession } from './candidate-existing-ui-adapter.mjs';

const SEGMENTS = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
const SEGMENT_PINS = Object.freeze(['D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9']);
const FOUR_DIGIT_SEGMENTS = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp']);
const FOUR_DIGIT_SEGMENT_PINS = Object.freeze(['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9']);
const FOUR_DIGIT_SELECT_PINS = Object.freeze(['D10', 'D11', 'D12', 'D13']);
const endpoint = (component, pin) => ({ component, pin });

const CARDS = Object.freeze([
  {
    id: 'avr-ground-reference-input', name: 'Ground reference input', model: 'reference.ground-v1',
    focus: '0 V reference · compiled input', partsLabel: 'Controller · 0 V reference · button · LED',
    description: 'Use the explicit 0 V symbol in a real active-low input circuit.',
    learn: 'Why one declared reference makes digital levels meaningful.',
    try: 'Build, Run, then press the input button.',
    observe: 'D2 and D13 change while Serial reports GROUNDED or OPEN.',
    limits: 'The symbol is topology authority, not an executable peripheral.',
    next: 'Load SPST toggle input to keep an input state without holding a button.',
  },
  {
    id: 'avr-ground-power-references', name: 'Ground and 5 V references', model: 'reference.power-5v-v1',
    focus: 'Explicit 0 V and fixed 5 V', partsLabel: 'Controller · 0 V reference · 5 V source · button · LED',
    description: 'Use separate reference symbols for circuit common and the AVR board 5 V output.',
    learn: 'Why 0 V reference and a fixed voltage source have different electrical roles.',
    try: 'Build and Run, then press the D2 button while D3 remains tied to the fixed source.',
    observe: 'Serial reports the D2 ground path and compiled D3 HIGH state independently.',
    limits: 'AVR-only topology projection; not a bench supply, regulator, current or fault model.',
    next: 'Load SPST toggle input to replace a momentary ground path with a maintained contact.',
  },
  {
    id: 'avr-toggle-input', name: 'SPST toggle input', model: 'switch.toggle-spst-v1',
    focus: 'Maintained contact · D3', partsLabel: 'Controller · SPST toggle · LED',
    description: 'Read a maintained switch through the existing pull-up input path.',
    learn: 'How Open and Closed persist without holding a button.',
    try: 'Build, Run, then toggle Open and Closed.',
    observe: 'Compiled D3 input changes D13 and prints TOGGLE OPEN/CLOSED.',
    limits: 'Ideal contact only; no bounce or physical resistance model.',
    next: 'Load SPDT input selector to choose between two explicit sources.',
  },
  {
    id: 'avr-spdt-selector', name: 'SPDT input selector', model: 'switch.changeover-spdt-v1',
    focus: 'Changeover contact · D8', partsLabel: 'Controller · SPDT selector · LED',
    description: 'Select a deterministic GND or 5 V digital input through BREAK.',
    learn: 'How COM selects one throw while the other stays isolated.',
    try: 'Build, Run, then switch between Throw A and Throw B.',
    observe: 'Compiled D8 changes after the explicit BREAK transition.',
    limits: 'Partial: direct GND/5 V digital input only; no analogue or load switching.',
    next: 'Load Quadrature encoder to observe ordered changes across two inputs.',
  },
  {
    id: 'avr-light-analogue', name: 'Analogue light level', model: 'sensor.light-analogue-v1',
    focus: 'Ideal analogue module · A1', partsLabel: 'Controller · analogue light module · LED',
    description: 'Read an idealized light signal with the existing AVR ADC path.',
    learn: 'How 0–100% maps linearly to 0–5 V and 10-bit ADC counts.',
    try: 'Build, Run, then move the Light level control.',
    observe: 'A1 voltage, Serial ADC counts and D13 threshold state change.',
    limits: 'Idealized signal only; no lux calibration or physical sensor response.',
    next: 'Load Digital light threshold to compare continuous and thresholded sensing.',
  },
  {
    id: 'avr-light-threshold', name: 'Digital light threshold', model: 'sensor.light-threshold-digital-v1',
    focus: 'Active-low threshold · D7', partsLabel: 'Controller · threshold module · LED',
    description: 'Exercise an active-low light threshold with bounded hysteresis.',
    learn: 'Why hysteresis prevents rapid output changes around one threshold.',
    try: 'Build, Run, then cross the threshold in both directions.',
    observe: 'Compiled D7 drives D13 and reports LIGHT/DARK on Serial.',
    limits: 'Ideal percentage input only; no lux calibration or comparator noise.',
    next: 'Load Thermostat boundary test to express a threshold as an executable requirement.',
  },
  BME280_ENVIRONMENT_CARD,
  {
    id: 'avr-dht11-temperature-humidity', name: 'DHT11 temperature and humidity',
    model: 'sensor.dht11-temperature-humidity-v1',
    focus: 'Timed digital protocol · D4', partsLabel: 'Controller · DHT11 digital sensor',
    description: 'Read temperature and relative humidity from a timed five-byte DHT11 response.',
    learn: 'How one bidirectional DATA line carries an acknowledged payload and checksum.',
    try: 'Build and Run, then move Temperature and Humidity independently.',
    observe: 'Serial reports TEMP_C and HUMIDITY_RH only after firmware validates the checksum.',
    limits: 'Integer AVR-only protocol model; no physical accuracy, latency, noise or cable effects.',
    next: 'Load Digital light threshold to compare a timed protocol sensor with a simple digital level.',
  },
  {
    id: 'avr-dht22-temperature-humidity', name: 'DHT22 decimal temperature and humidity',
    model: 'sensor.dht22-temperature-humidity-v1',
    focus: 'Signed decimal digital protocol · D5', partsLabel: 'Controller · DHT22 digital sensor',
    description: 'Read signed decimal temperature and relative humidity from a checksum-protected DHT22 response.',
    learn: 'How two-byte tenths values and a sign bit extend the timed five-byte sensor payload.',
    try: 'Build and Run, then move Temperature and Humidity independently in 0.1-unit steps.',
    observe: 'Serial reports signed TEMP_C and decimal HUMIDITY_RH only after checksum validation.',
    limits: 'Decimal AVR-only protocol model; no physical accuracy, minimum sampling interval, noise or cable effects.',
    next: 'Load DHT11 to compare integer and signed decimal payload encodings.',
  },
  {
    id: 'avr-ds18b20-temperature', name: 'DS18B20 OneWire temperature',
    model: 'sensor.ds18b20-temperature-v1',
    focus: 'OneWire scratchpad · D3', partsLabel: 'Controller · DS18B20 digital probe',
    description: 'Convert and read signed temperature from a CRC-protected DS18B20 scratchpad.',
    learn: 'How reset/presence, Skip ROM, commands and LSB-first read slots share one bidirectional line.',
    try: 'Build and Run, then move Temperature through positive and negative values.',
    observe: 'Serial reports TEMP_C only after firmware validates the scratchpad CRC-8.',
    limits: 'One externally powered AVR-only device; no parasite power, multidrop addressing or physical thermal accuracy.',
    next: 'Load DHT11 to compare OneWire command slots with a fixed timed sensor payload.',
  },
  {
    id: 'avr-active-buzzer', name: 'Logical active buzzer', model: 'output.active-buzzer-module-v1',
    focus: 'Digital output · D8', partsLabel: 'Controller · active buzzer module',
    description: 'Drive the bounded active-buzzer indicator from compiled firmware.',
    learn: 'How a logic enable signal differs from an acoustic model.',
    try: 'Build and Run the alternating enabled/disabled sequence.',
    observe: 'D8 and the silent visual indicator change with Serial BUZZER ON/OFF.',
    limits: 'Partial: silent logical indicator; no sound, current or acoustic accuracy.',
    next: 'Load Traffic light sequence to coordinate three current-limited outputs.',
  },
  {
    id: 'avr-passive-piezo', name: 'Passive piezo transitions', model: 'output.passive-piezo-v1',
    focus: 'PWM output · D9', partsLabel: 'Controller · passive piezo',
    description: 'Observe compiled firmware transitions on a bounded two-terminal passive-piezo model.',
    learn: 'How a passive piezo needs a changing output rather than a steady enable input.',
    try: 'Build and Run the D9 transition sequence.',
    observe: 'The visual disc shows driven/rest state and transition activity without producing audio.',
    limits: 'AVR-only visual observer; no sound, frequency calibration, loudness or physical piezo accuracy.',
    next: 'Load Logical active buzzer to compare a three-terminal self-oscillating module.',
  },
  { id: 'avr-speaker-signal', name: 'Speaker signal transitions', model: 'output.speaker-signal-v1', focus: 'PWM output · D10', partsLabel: 'Controller · speaker signal model', description: 'Observe compiled output transitions without claiming acoustic simulation.', learn: 'How firmware output activity differs from physical speaker sound.', try: 'Build and Run the D10 transition sequence.', observe: 'The visual cone shows driven/rest and transition activity.', limits: 'AVR-only visual observer; no audio, impedance, power, frequency calibration or physical speaker accuracy.', next: 'Load Passive piezo transitions to compare transducer boundaries.' },
  { id: 'avr-hobby-servo', name: 'Hobby servo position intent', model: 'output.hobby-servo-v1', focus: 'Servo pulse · D9', partsLabel: 'Controller · hobby servo', description: 'Map bounded 1–2 ms pulses to a visible 0–180 degree command.', learn: 'How pulse width encodes servo position intent.', try: 'Build and Run the 0, 90 and 180 degree sequence.', observe: 'The visual horn follows command intent when a valid frame is observed.', limits: 'AVR-only ideal command observer; each 1–2 ms high pulse blocks interrupt work; no motion, torque, current, load or physical accuracy.', next: 'Load Continuous rotation servo to compare direction intent.' },
  { id: 'avr-continuous-servo', name: 'Continuous servo command intent', model: 'output.continuous-servo-v1', focus: 'Servo pulse · D10', partsLabel: 'Controller · continuous servo', description: 'Map bounded pulses to reverse, stopped and forward command intent.', learn: 'Why the same pulse widths mean direction rather than angle on a continuous servo.', try: 'Build and Run the reverse, stop and forward sequence.', observe: 'The visual arrow changes direction and stops around neutral.', limits: 'AVR-only ideal command observer; each 1–2 ms high pulse blocks interrupt work; no RPM, torque, current, inertia or physical accuracy.', next: 'Load Hobby servo to compare position intent.' },
  { id: 'avr-dc-motor-l298n', name: 'DC motor through L298N', model: 'output.dc-motor-v1', focus: 'Direction D7/D8 · PWM D9', partsLabel: 'Controller · L298N command model · DC motor', description: 'Drive a bounded visual motor command through a required H-bridge model.', learn: 'Why a motor needs a driver rather than direct MCU wiring.', try: 'Build and Run forward, brake, reverse and coast commands.', observe: 'The motor and driver show the same direction and relative enable intent.', limits: 'AVR-only command observer; no motor supply, RPM, torque, current, heat, load or physical accuracy.', next: 'Load Hobby servo to compare pulse-position intent with bridge direction control.' },
  { id: 'avr-dc-motor-tb6612fng', name: 'DC motor through TB6612FNG', model: 'driver.tb6612fng-single-channel-v1', focus: 'AIN1 D7 · AIN2 D8 · PWMA D9 · STBY D6', partsLabel: 'Controller · TB6612FNG command model · DC motor', description: 'Drive bounded direction, PWM and standby intent through the exact TB6612FNG contract.', learn: 'How a separate active-high standby input gates an H-bridge command.', try: 'Build and Run standby, forward, brake and reverse commands.', observe: 'The driver and paired motor expose the same bounded command intent.', limits: 'No motor supply, RPM, torque, current, heat, protection, load or physical accuracy.', next: 'Load DC motor through DRV8833 to compare two-input PWM control.' },
  { id: 'avr-dc-motor-drv8833', name: 'DC motor through DRV8833', model: 'driver.drv8833-single-channel-v1', focus: 'AIN1 D9 · AIN2 D8', partsLabel: 'Controller · DRV8833 command model · DC motor', description: 'Drive bounded two-input direction and PWM intent through the exact DRV8833 contract.', learn: 'How PWM can share a direction input without a separate enable terminal.', try: 'Build and Run forward, coast, reverse and brake commands.', observe: 'The driver and paired motor expose the same bounded command intent.', limits: 'No motor supply, RPM, torque, current, heat, protection, load or physical accuracy.', next: 'Load DC motor through TB6612FNG to compare standby and dedicated PWM.' },
  { id: 'avr-bipolar-stepper-a4988', name: 'Bipolar stepper through A4988', model: 'output.bipolar-stepper-v1', focus: 'STEP D2 · DIR D3 · ENABLE D4', partsLabel: 'Controller · A4988 command model · bipolar stepper', description: 'Count explicit STEP rising edges through a bounded A4988 command model.', learn: 'How STEP, DIR and active-low ENABLE describe command intent.', try: 'Build and Run the clockwise and counter-clockwise edge sequence.', observe: 'The motor and driver report the same signed explicit edge count.', limits: 'No position, torque, current, chopper, load, missed-step or physical motion claim.', next: 'Load Bipolar stepper through DRV8825 to compare microstep capability.' },
  { id: 'avr-bipolar-stepper-drv8825', name: 'Bipolar stepper through DRV8825', model: 'output.bipolar-stepper-v1', focus: 'STEP D2 · DIR D3 · ENABLE D4', partsLabel: 'Controller · DRV8825 command model · bipolar stepper', description: 'Count explicit STEP rising edges through a bounded DRV8825 command model.', learn: 'Why the DRV8825 identity exposes a distinct thirty-second microstep option.', try: 'Build and Run the same explicit direction and edge sequence.', observe: 'Only actual STEP rising edges change the signed command count.', limits: 'No position, torque, current, chopper, load, missed-step or physical motion claim.', next: 'Load Bipolar stepper through A4988 to compare supported microstep names.' },
  { id: 'avr-unipolar-stepper-uln2003', name: '28BYJ-48 through ULN2003', model: 'output.28byj48-unipolar-stepper-v1', focus: 'Four phases · D2–D5', partsLabel: 'Controller · ULN2003 command model · 28BYJ-48', description: 'Observe an explicit eight-state half-step sequence through the required four-channel driver.', learn: 'How four ordered phase commands advance or reverse a unipolar stepper intent.', try: 'Build and Run one clockwise and one counter-clockwise half-step cycle.', observe: 'The motor and driver report the same signed adjacent phase transitions.', limits: 'AVR-only command observer; no position, gearing, torque, current, heat, load, missed-step or physical-motion claim.', next: 'Load Bipolar stepper through A4988 to compare STEP/DIR control.' },
  {
    id: 'avr-traffic-light', name: 'Traffic light sequence', model: 'output.traffic-light-module-v1',
    focus: 'Three current-limited outputs', partsLabel: 'Controller · traffic light · three resistors',
    description: 'Drive a distinct common-cathode red/amber/green module from compiled firmware.',
    learn: 'How a safe traffic-light sequence coordinates three independent digital outputs.',
    try: 'Build and Run the red, red+amber, green and amber sequence.',
    observe: 'The three visible lamps and Serial phase labels follow D3, D5 and D6.',
    limits: 'Ideal AVR-only indicator; no physical optics, load, fault or road-signal timing compliance.',
    next: 'Load Seven-segment digits to coordinate a larger group of outputs.',
  },
  {
    id: 'avr-seven-segment', name: 'Seven-segment digits', model: 'output.seven-segment-common-cathode-v1',
    focus: 'Seven current-limited outputs', partsLabel: 'Controller · display · seven resistors',
    description: 'Drive one common-cathode digit through seven independent resistors.',
    learn: 'How segment patterns form decimal digits.',
    try: 'Build and Run the 0, 1, 2, 8 sequence.',
    observe: 'Compiled D3–D9 patterns and Serial digit labels agree.',
    limits: 'One ideal digit only; no decimal point, multiplexing or physical brightness.',
    next: 'Load Four-digit multiplex to coordinate shared segments and digit selection.',
  },
  {
    id: 'avr-four-digit-seven-segment', name: 'Four-digit multiplex',
    model: 'output.seven-segment-four-digit-common-cathode-v1',
    focus: 'Eight shared segments · four digit selects',
    partsLabel: 'Controller · four-digit display · eight resistors',
    description: 'Drive a distinct common-cathode four-digit display through twelve GPIO lines.',
    learn: 'How shared segment lines and active-low digit selection form a multiplexed display.',
    try: 'Build and Run the deliberately slowed 1-2-3-4 scan.',
    observe: 'The latched visible digits and Serial DISPLAY 1234 label agree.',
    limits: 'Ideal sampled AVR multiplex observer; no driver transistor, package-current or refresh-rate fidelity.',
    next: 'Load PWM pulse to compare switched outputs with duty-cycle output.',
  },
  {
    id: 'avr-rotary-encoder', name: 'Quadrature encoder', model: 'input.rotary-encoder-quadrature-v1',
    focus: 'Ordered phases · D2/D3', partsLabel: 'Controller · quadrature encoder · LED',
    description: 'Read deterministic rotary Gray-code phases on the two interrupt pins.',
    learn: 'How phase order distinguishes clockwise from counter-clockwise motion.',
    try: 'Build, Run, then turn one detent CW and one detent CCW.',
    observe: 'Serial receives the ordered 01→00→10→11 sequence and its reverse.',
    limits: 'Ideal 1 ms phases only; no bounce, acceleration or physical detents.',
    next: 'Load Thermostat boundary test, then open Scenario timeline to author inputs within the supported thermostat subset.',
  },
]);

const SOURCES = Object.freeze({
  [BME280_ENVIRONMENT_EXAMPLE_ID]: BME280_ENVIRONMENT_SOURCE,
  'avr-ground-reference-input': `void setup() { pinMode(2, INPUT_PULLUP); pinMode(13, OUTPUT); Serial.begin(115200); }
void loop() { bool grounded = digitalRead(2) == LOW; digitalWrite(13, grounded); Serial.println(grounded ? "GROUNDED" : "OPEN"); delay(120); }
`,
  'avr-ground-power-references': `void setup() { pinMode(2, INPUT_PULLUP); pinMode(3, INPUT); pinMode(13, OUTPUT); Serial.begin(115200); }
void loop() { bool grounded = digitalRead(2) == LOW; bool powered = digitalRead(3) == HIGH; digitalWrite(13, grounded && powered); Serial.print(grounded ? "GROUND CLOSED" : "GROUND OPEN"); Serial.println(powered ? " POWER HIGH" : " POWER LOW"); delay(120); }
`,
  'avr-toggle-input': `void setup() { pinMode(3, INPUT_PULLUP); pinMode(13, OUTPUT); Serial.begin(115200); }
void loop() { bool closed = digitalRead(3) == LOW; digitalWrite(13, closed); Serial.println(closed ? "TOGGLE CLOSED" : "TOGGLE OPEN"); delay(120); }
`,
  'avr-spdt-selector': `void setup() { pinMode(8, INPUT); pinMode(13, OUTPUT); Serial.begin(115200); }
void loop() { bool high = digitalRead(8) == HIGH; digitalWrite(13, high); Serial.println(high ? "THROW B HIGH" : "THROW A LOW"); delay(120); }
`,
  'avr-light-analogue': `void setup() { pinMode(13, OUTPUT); Serial.begin(115200); }
void loop() { int level = analogRead(A1); digitalWrite(13, level >= 512); Serial.println(level); delay(120); }
`,
  'avr-light-threshold': `void setup() { pinMode(7, INPUT_PULLUP); pinMode(13, OUTPUT); Serial.begin(115200); }
void loop() { bool active = digitalRead(7) == LOW; digitalWrite(13, active); Serial.println(active ? "DARK" : "LIGHT"); delay(120); }
`,
  'avr-dht11-temperature-humidity': `const byte DHT_DATA = 4;

bool waitForDhtLevel(byte level, unsigned long timeoutMicros) {
  unsigned long waitStart = micros();
  while (digitalRead(DHT_DATA) != level) {
    if (micros() - waitStart > timeoutMicros) return false;
  }
  return true;
}

bool readDht11(byte &temperatureC, byte &humidityPercent) {
  byte data[5] = {0, 0, 0, 0, 0};
  pinMode(DHT_DATA, OUTPUT);
  digitalWrite(DHT_DATA, LOW);
  delay(20);
  pinMode(DHT_DATA, INPUT_PULLUP);
  if (!waitForDhtLevel(LOW, 250)) return false;
  if (!waitForDhtLevel(HIGH, 150)) return false;
  if (!waitForDhtLevel(LOW, 150)) return false;
  for (byte bit = 0; bit < 40; bit++) {
    if (!waitForDhtLevel(HIGH, 120)) return false;
    delayMicroseconds(40);
    data[bit / 8] = (data[bit / 8] << 1) | (digitalRead(DHT_DATA) == HIGH ? 1 : 0);
    if (!waitForDhtLevel(LOW, 120)) return false;
  }
  byte checksum = byte(data[0] + data[1] + data[2] + data[3]);
  if (data[1] != 0 || data[3] != 0 || checksum != data[4]) return false;
  humidityPercent = data[0];
  temperatureC = data[2];
  return true;
}

void setup() {
  pinMode(DHT_DATA, INPUT_PULLUP);
  Serial.begin(115200);
}

void loop() {
  byte temperatureC = 0;
  byte humidityPercent = 0;
  if (readDht11(temperatureC, humidityPercent)) {
    Serial.print("TEMP_C=");
    Serial.print(temperatureC);
    Serial.print(" HUMIDITY_RH=");
    Serial.print(humidityPercent);
    Serial.println(" CHECKSUM=OK");
  } else {
    Serial.println("DHT11 READ ERROR");
  }
  delay(1500);
}
`,
  'avr-dht22-temperature-humidity': `const byte DHT_DATA = 5;

bool waitForDhtLevel(byte level, unsigned long timeoutMicros) {
  unsigned long waitStart = micros();
  while (digitalRead(DHT_DATA) != level) {
    if (micros() - waitStart > timeoutMicros) return false;
  }
  return true;
}

bool readDht22(int16_t &temperatureTenths, uint16_t &humidityTenths) {
  byte data[5] = {0, 0, 0, 0, 0};
  pinMode(DHT_DATA, OUTPUT);
  digitalWrite(DHT_DATA, LOW);
  delay(2);
  pinMode(DHT_DATA, INPUT_PULLUP);
  if (!waitForDhtLevel(LOW, 250)) return false;
  if (!waitForDhtLevel(HIGH, 150)) return false;
  if (!waitForDhtLevel(LOW, 150)) return false;
  for (byte bit = 0; bit < 40; bit++) {
    if (!waitForDhtLevel(HIGH, 120)) return false;
    delayMicroseconds(40);
    data[bit / 8] = (data[bit / 8] << 1) | (digitalRead(DHT_DATA) == HIGH ? 1 : 0);
    if (!waitForDhtLevel(LOW, 120)) return false;
  }
  byte checksum = byte(data[0] + data[1] + data[2] + data[3]);
  if (checksum != data[4]) return false;
  humidityTenths = (uint16_t(data[0]) << 8) | data[1];
  int16_t magnitude = (int16_t(data[2] & 0x7f) << 8) | data[3];
  temperatureTenths = (data[2] & 0x80) ? -magnitude : magnitude;
  return humidityTenths <= 1000 && temperatureTenths >= -400 && temperatureTenths <= 800;
}

void setup() {
  pinMode(DHT_DATA, INPUT_PULLUP);
  Serial.begin(115200);
}

void loop() {
  int16_t temperatureTenths = 0;
  uint16_t humidityTenths = 0;
  if (readDht22(temperatureTenths, humidityTenths)) {
    Serial.print("TEMP_C=");
    Serial.print(temperatureTenths / 10.0, 1);
    Serial.print(" HUMIDITY_RH=");
    Serial.print(humidityTenths / 10.0, 1);
    Serial.println(" CHECKSUM=OK");
  } else {
    Serial.println("DHT22 READ ERROR");
  }
  delay(2000);
}
`,
  'avr-ds18b20-temperature': `const byte ONE_WIRE_PIN = 3;

void oneWireLow() {
  pinMode(ONE_WIRE_PIN, OUTPUT);
  digitalWrite(ONE_WIRE_PIN, LOW);
}

void oneWireRelease() {
  pinMode(ONE_WIRE_PIN, INPUT_PULLUP);
}

bool oneWireReset() {
  oneWireLow();
  delayMicroseconds(500);
  oneWireRelease();
  delayMicroseconds(70);
  bool present = digitalRead(ONE_WIRE_PIN) == LOW;
  delayMicroseconds(410);
  return present;
}

void oneWireWriteBit(byte value) {
  oneWireLow();
  if (value) {
    delayMicroseconds(6);
    oneWireRelease();
    delayMicroseconds(64);
  } else {
    delayMicroseconds(60);
    oneWireRelease();
    delayMicroseconds(10);
  }
}

byte oneWireReadBit() {
  oneWireLow();
  delayMicroseconds(3);
  oneWireRelease();
  delayMicroseconds(12);
  byte value = digitalRead(ONE_WIRE_PIN) == HIGH;
  delayMicroseconds(55);
  return value;
}

void oneWireWriteByte(byte value) {
  for (byte bit = 0; bit < 8; bit++) {
    oneWireWriteBit((value >> bit) & 1);
  }
}

byte oneWireReadByte() {
  byte value = 0;
  for (byte bit = 0; bit < 8; bit++) {
    value |= oneWireReadBit() << bit;
  }
  return value;
}

byte oneWireCrc8(const byte *data, byte length) {
  byte crc = 0;
  for (byte index = 0; index < length; index++) {
    byte incoming = data[index];
    for (byte bit = 0; bit < 8; bit++) {
      byte mix = (crc ^ incoming) & 1;
      crc >>= 1;
      if (mix) crc ^= 0x8C;
      incoming >>= 1;
    }
  }
  return crc;
}

bool readTemperature(int16_t &rawTemperature) {
  if (!oneWireReset()) return false;
  oneWireWriteByte(0xCC);
  oneWireWriteByte(0x44);
  delay(800);
  if (!oneWireReset()) return false;
  oneWireWriteByte(0xCC);
  oneWireWriteByte(0xBE);
  byte scratchpad[9];
  for (byte index = 0; index < 9; index++) scratchpad[index] = oneWireReadByte();
  if (oneWireCrc8(scratchpad, 8) != scratchpad[8]) return false;
  rawTemperature = (int16_t)((uint16_t)scratchpad[1] << 8 | scratchpad[0]);
  return true;
}

void setup() {
  oneWireRelease();
  Serial.begin(115200);
}

void loop() {
  int16_t rawTemperature = 0;
  if (readTemperature(rawTemperature)) {
    Serial.print("TEMP_C=");
    Serial.print(rawTemperature / 16.0, 4);
    Serial.println(" CRC=OK");
  } else {
    Serial.println("DS18B20 READ ERROR");
  }
  delay(800);
}
`,
  'avr-active-buzzer': `void setup() { pinMode(8, OUTPUT); Serial.begin(115200); }
void loop() { digitalWrite(8, HIGH); Serial.println("BUZZER ON"); delay(240); digitalWrite(8, LOW); Serial.println("BUZZER OFF"); delay(240); }
`,
  'avr-passive-piezo': `const byte PIEZO_SIGNAL=9;
void setup() { pinMode(PIEZO_SIGNAL, OUTPUT); Serial.begin(115200); }
void loop() { for (byte i=0;i<8;i++) { digitalWrite(PIEZO_SIGNAL, !digitalRead(PIEZO_SIGNAL)); delay(25); } Serial.println("PIEZO TRANSITIONS=8"); digitalWrite(PIEZO_SIGNAL, LOW); Serial.println("PIEZO REST"); delay(240); }
`,
  'avr-speaker-signal': `const byte SPEAKER_SIGNAL=10;
void setup(){pinMode(SPEAKER_SIGNAL,OUTPUT);Serial.begin(115200);} void loop(){for(byte i=0;i<6;i++){digitalWrite(SPEAKER_SIGNAL,!digitalRead(SPEAKER_SIGNAL));delay(30);}Serial.println("SPEAKER TRANSITIONS=6");digitalWrite(SPEAKER_SIGNAL,LOW);delay(240);}
`,
  'avr-hobby-servo': `const byte SIGNAL=9; const byte commands[3]={0,90,180};
void pulseAngle(byte angle){unsigned int highUs=1000U+((unsigned long)angle*1000U/180U);noInterrupts();PORTB|=_BV(PB1);delayMicroseconds(highUs);__asm__ __volatile__("nop\\n\\tnop\\n\\tnop\\n\\tnop\\n\\tnop\\n\\tnop\\n\\tnop\\n\\tnop\\n\\tnop\\n\\tnop\\n\\tnop\\n\\tnop");PORTB&=~_BV(PB1);interrupts();delay(18);if(highUs<2000U)delayMicroseconds(2000U-highUs);}
void setup(){pinMode(SIGNAL,OUTPUT);Serial.begin(115200);} void loop(){for(byte i=0;i<3;i++){for(byte frame=0;frame<20;frame++)pulseAngle(commands[i]);Serial.print("ANGLE=");Serial.println(commands[i]);}}
`,
  'avr-continuous-servo': `const byte SIGNAL=10; const unsigned int pulses[3]={1000,1500,2000}; const char* labels[3]={"REVERSE","STOPPED","FORWARD"};
void pulseWidth(unsigned int highUs){noInterrupts();PORTB|=_BV(PB2);delayMicroseconds(highUs);__asm__ __volatile__("nop\\n\\tnop\\n\\tnop\\n\\tnop\\n\\tnop\\n\\tnop\\n\\tnop\\n\\tnop\\n\\tnop");PORTB&=~_BV(PB2);interrupts();delay(18);if(highUs<2000U)delayMicroseconds(2000U-highUs);}
void setup(){pinMode(SIGNAL,OUTPUT);Serial.begin(115200);} void loop(){for(byte i=0;i<3;i++){for(byte frame=0;frame<20;frame++)pulseWidth(pulses[i]);Serial.println(labels[i]);}}
`,
  'avr-dc-motor-l298n': `const byte IN1=7,IN2=8,ENA=9;
void command(bool a,bool b,byte enable,const char* label){digitalWrite(IN1,a);digitalWrite(IN2,b);analogWrite(ENA,enable);Serial.println(label);delay(400);}
void setup(){pinMode(IN1,OUTPUT);pinMode(IN2,OUTPUT);pinMode(ENA,OUTPUT);Serial.begin(115200);} void loop(){command(HIGH,LOW,128,"FORWARD 50");command(HIGH,HIGH,255,"BRAKE");command(LOW,HIGH,191,"REVERSE 75");command(LOW,LOW,0,"COAST");}
`,
  'avr-dc-motor-tb6612fng': `const byte IN1=7,IN2=8,PWM=9,STBY=6;
void command(bool a,bool b,byte enable,bool standby,const char* label){digitalWrite(STBY,standby);digitalWrite(IN1,a);digitalWrite(IN2,b);analogWrite(PWM,enable);Serial.println(label);delay(400);} void setup(){pinMode(IN1,OUTPUT);pinMode(IN2,OUTPUT);pinMode(PWM,OUTPUT);pinMode(STBY,OUTPUT);Serial.begin(115200);} void loop(){command(LOW,LOW,0,LOW,"STANDBY");command(HIGH,LOW,128,HIGH,"FORWARD 50");command(HIGH,HIGH,255,HIGH,"BRAKE");command(LOW,HIGH,191,HIGH,"REVERSE 75");}
`,
  'avr-dc-motor-drv8833': `const byte IN1=9,IN2=8;
void command(byte a,byte b,const char* label){analogWrite(IN1,a);digitalWrite(IN2,b);Serial.println(label);delay(400);} void setup(){pinMode(IN1,OUTPUT);pinMode(IN2,OUTPUT);Serial.begin(115200);} void loop(){command(128,LOW,"FORWARD 50");command(LOW,LOW,"COAST");command(64,HIGH,"REVERSE 75");command(HIGH,HIGH,"BRAKE");}
`,
  'avr-bipolar-stepper-a4988': `const byte STEP=2,DIR=3,ENABLE=4;
void pulse(byte count){for(byte i=0;i<count;i++){digitalWrite(STEP,HIGH);delay(10);digitalWrite(STEP,LOW);delay(10);}} void setup(){pinMode(STEP,OUTPUT);pinMode(DIR,OUTPUT);pinMode(ENABLE,OUTPUT);digitalWrite(ENABLE,LOW);Serial.begin(115200);} void loop(){digitalWrite(DIR,HIGH);pulse(8);Serial.println("CW 8");digitalWrite(DIR,LOW);pulse(4);Serial.println("CCW 4");delay(400);}
`,
  'avr-bipolar-stepper-drv8825': `const byte STEP=2,DIR=3,ENABLE=4;
void pulse(byte count){for(byte i=0;i<count;i++){digitalWrite(STEP,HIGH);delay(10);digitalWrite(STEP,LOW);delay(10);}} void setup(){pinMode(STEP,OUTPUT);pinMode(DIR,OUTPUT);pinMode(ENABLE,OUTPUT);digitalWrite(ENABLE,LOW);Serial.begin(115200);} void loop(){digitalWrite(DIR,HIGH);pulse(16);Serial.println("CW 16");digitalWrite(DIR,LOW);pulse(8);Serial.println("CCW 8");delay(400);}
`,
  'avr-unipolar-stepper-uln2003': `const byte PHASES[4]={2,3,4,5};
const byte HALF[8][4]={{1,0,0,0},{1,1,0,0},{0,1,0,0},{0,1,1,0},{0,0,1,0},{0,0,1,1},{0,0,0,1},{1,0,0,1}};
void phase(byte index){for(byte i=0;i<4;i++)digitalWrite(PHASES[i],HALF[index][i]);delay(20);} void setup(){for(byte i=0;i<4;i++)pinMode(PHASES[i],OUTPUT);Serial.begin(115200);} void loop(){for(byte i=0;i<8;i++)phase(i);Serial.println("CW HALF-STEPS=7");for(byte i=7;i>0;i--)phase(i-1);Serial.println("CCW HALF-STEPS=7");delay(400);}
`,
  'avr-traffic-light': `const byte RED=3, AMBER=5, GREEN=6;
void phase(bool red, bool amber, bool green, const char* label) { digitalWrite(RED, red); digitalWrite(AMBER, amber); digitalWrite(GREEN, green); Serial.println(label); delay(240); }
void setup() { pinMode(RED, OUTPUT); pinMode(AMBER, OUTPUT); pinMode(GREEN, OUTPUT); Serial.begin(115200); }
void loop() { phase(HIGH,LOW,LOW,"RED"); phase(HIGH,HIGH,LOW,"RED AMBER"); phase(LOW,LOW,HIGH,"GREEN"); phase(LOW,HIGH,LOW,"AMBER"); }
`,
  'avr-seven-segment': `const byte pins[7] = {3,4,5,6,7,8,9};
const byte digits[4][7] = {{1,1,1,1,1,1,0},{0,1,1,0,0,0,0},{1,1,0,1,1,0,1},{1,1,1,1,1,1,1}};
const char labels[4] = {'0','1','2','8'};
void setup() { for (byte i=0;i<7;i++) pinMode(pins[i], OUTPUT); Serial.begin(115200); }
void loop() { for (byte d=0;d<4;d++) { for (byte i=0;i<7;i++) digitalWrite(pins[i], digits[d][i]); Serial.println(labels[d]); delay(240); } }
`,
  'avr-four-digit-seven-segment': `const byte segments[8]={2,3,4,5,6,7,8,9};
const byte selects[4]={10,11,12,13};
const byte patterns[4][8]={{0,1,1,0,0,0,0,0},{1,1,0,1,1,0,1,0},{1,1,1,1,0,0,1,0},{0,1,1,0,0,1,1,0}};
void blank(){for(byte d=0;d<4;d++)digitalWrite(selects[d],HIGH);}
void show(byte digit){blank();for(byte s=0;s<8;s++)digitalWrite(segments[s],patterns[digit][s]);digitalWrite(selects[digit],LOW);delay(60);}
void setup(){for(byte s=0;s<8;s++)pinMode(segments[s],OUTPUT);for(byte d=0;d<4;d++){pinMode(selects[d],OUTPUT);digitalWrite(selects[d],HIGH);}Serial.begin(115200);}
void loop(){for(byte d=0;d<4;d++)show(d);Serial.println("DISPLAY 1234");}
`,
  'avr-rotary-encoder': `int lastA = HIGH; int lastB = HIGH;
void setup() { pinMode(2, INPUT_PULLUP); pinMode(3, INPUT_PULLUP); pinMode(13, OUTPUT); Serial.begin(115200); }
void loop() { int a=digitalRead(2), b=digitalRead(3); if (a!=lastA || b!=lastB) { Serial.print(a); Serial.println(b); digitalWrite(13,a!=b); lastA=a; lastB=b; } delayMicroseconds(100); }
`,
});

function apply(session, command) {
  const result = session.apply({ ...command, revision: session.revision });
  if (!result.ok) throw new Error(`${command.type}:${result.code}:${JSON.stringify(result.details)}`);
}

function freshSession(card) {
  const draft = createEditableContactDraft(SOURCES[card.id]);
  if (!draft.ok) throw new Error(draft.code);
  draft.project.project.metadata.name = card.name;
  const opened = openCandidateUiSession(canonicalContactPersistenceDraftJson(draft.project));
  if (!opened.ok) throw new Error(opened.code);
  return opened.session;
}

function branch(session, netId, component, pin, junctionId) {
  apply(session, { type: 'wire.branch', netId, endpoint: endpoint(component, pin), junctionId });
}

function wire(session, id, leftComponent, leftPin, rightComponent, rightPin) {
  apply(session, { type: 'wire.create', net: { id, endpoints: [
    endpoint(leftComponent, leftPin), endpoint(rightComponent, rightPin),
  ] } });
}

function add(session, component, position) {
  apply(session, { type: 'component.add', component, position });
}

function construct(card) {
  const session = freshSession(card);
  if (card.id === 'avr-ground-reference-input') {
    add(session, createCandidateUiComponent(card.model, 'ground-reference-1'), { x: 0.78, y: 0.78 });
    branch(session, 'net-ground-branch', 'ground-reference-1', 'REF', 'junction-starter-ground-reference');
  } else if (card.id === 'avr-ground-power-references') {
    add(session, createCandidateUiComponent('reference.ground-v1', 'ground-reference-1'), { x: 0.74, y: 0.78 });
    branch(session, 'net-ground-branch', 'ground-reference-1', 'REF', 'junction-starter-ground-power-ground');
    add(session, createCandidateUiComponent(card.model, 'power-reference-1'), { x: 0.86, y: 0.58 });
    wire(session, 'net-starter-power-reference-d3', 'power-reference-1', 'OUT', 'board-1', 'D3');
  } else if (card.id === 'avr-toggle-input') {
    add(session, createCandidateUiComponent(card.model, 'toggle-switch-1'), { x: 0.72, y: 0.7 });
    branch(session, 'net-ground-branch', 'toggle-switch-1', 'B', 'junction-starter-toggle-ground');
    wire(session, 'net-starter-toggle-d3', 'toggle-switch-1', 'A', 'board-1', 'D3');
  } else if (card.id === 'avr-spdt-selector') {
    add(session, createCandidateUiComponent(card.model, 'selector-1'), { x: 0.72, y: 0.7 });
    branch(session, 'net-ground-branch', 'selector-1', 'A', 'junction-starter-selector-ground');
    branch(session, 'net-5v', 'selector-1', 'B', 'junction-starter-selector-power');
    wire(session, 'net-starter-selector-d8', 'selector-1', 'COM', 'board-1', 'D8');
  } else if (card.id === 'avr-light-analogue') {
    add(session, createLightAnalogueSensorComponent('light-sensor-1', 'Desk light signal', { lightLevel: 0.25 }), { x: 0.75, y: 0.72 });
    branch(session, 'net-5v', 'light-sensor-1', 'VCC', 'junction-starter-light-vcc');
    branch(session, 'net-ground-branch', 'light-sensor-1', 'GND', 'junction-starter-light-ground');
    wire(session, 'net-starter-light-a1', 'light-sensor-1', 'AOUT', 'board-1', 'A1');
  } else if (card.id === 'avr-light-threshold') {
    add(session, createDigitalLightThresholdComponent('light-threshold-1', 'Workshop light threshold'), { x: 0.75, y: 0.72 });
    branch(session, 'net-5v', 'light-threshold-1', 'VCC', 'junction-starter-threshold-vcc');
    branch(session, 'net-ground-branch', 'light-threshold-1', 'GND', 'junction-starter-threshold-ground');
    wire(session, 'net-starter-threshold-d7', 'light-threshold-1', 'DOUT', 'board-1', 'D7');
  } else if (card.id === BME280_ENVIRONMENT_EXAMPLE_ID) {
    add(session, createBme280Component('bme280-1', 'Room BME280', {
      temperatureC: 23.5, humidityPercent: 50, pressureHpa: 1013.2,
    }), { x: 0.75, y: 0.68 });
    branch(session, 'net-5v', 'bme280-1', 'VCC', 'junction-starter-bme280-vcc');
    branch(session, 'net-ground-branch', 'bme280-1', 'GND', 'junction-starter-bme280-ground');
    wire(session, 'net-starter-bme280-sda', 'bme280-1', 'SDA', 'board-1', 'A4');
    wire(session, 'net-starter-bme280-scl', 'bme280-1', 'SCL', 'board-1', 'A5');
  } else if (card.id === 'avr-dht11-temperature-humidity') {
    add(session, createDht11Component('dht11-1', 'Room DHT11', {
      temperatureC: 25, humidityPercent: 50,
    }), { x: 0.76, y: 0.72 });
    branch(session, 'net-5v', 'dht11-1', 'VCC', 'junction-starter-dht11-vcc');
    branch(session, 'net-ground-branch', 'dht11-1', 'GND', 'junction-starter-dht11-ground');
    wire(session, 'net-starter-dht11-d4', 'dht11-1', 'DATA', 'board-1', 'D4');
  } else if (card.id === 'avr-dht22-temperature-humidity') {
    add(session, createDht22Component('dht22-1', 'Room DHT22', {
      temperatureC: 23.5, humidityPercent: 50,
    }), { x: 0.76, y: 0.72 });
    branch(session, 'net-5v', 'dht22-1', 'VCC', 'junction-starter-dht22-vcc');
    branch(session, 'net-ground-branch', 'dht22-1', 'GND', 'junction-starter-dht22-ground');
    wire(session, 'net-starter-dht22-d5', 'dht22-1', 'DATA', 'board-1', 'D5');
  } else if (card.id === 'avr-ds18b20-temperature') {
    add(session, createDs18b20Component('ds18b20-1', 'Waterproof temperature probe', {
      temperatureC: 23.5,
    }), { x: 0.76, y: 0.72 });
    branch(session, 'net-5v', 'ds18b20-1', 'VCC', 'junction-starter-ds18b20-vcc');
    branch(session, 'net-ground-branch', 'ds18b20-1', 'GND', 'junction-starter-ds18b20-ground');
    wire(session, 'net-starter-ds18b20-d3', 'ds18b20-1', 'DQ', 'board-1', 'D3');
  } else if (card.id === 'avr-active-buzzer') {
    add(session, createActiveBuzzerComponent('active-buzzer-1', 'Silent logical buzzer'), { x: 0.76, y: 0.7 });
    branch(session, 'net-5v', 'active-buzzer-1', 'VCC', 'junction-starter-buzzer-vcc');
    branch(session, 'net-ground-branch', 'active-buzzer-1', 'GND', 'junction-starter-buzzer-ground');
    wire(session, 'net-starter-buzzer-d8', 'active-buzzer-1', 'EN', 'board-1', 'D8');
  } else if (card.id === 'avr-passive-piezo') {
    add(session, createCandidateUiComponent(card.model, 'passive-piezo-1'), { x: 0.76, y: 0.7 });
    branch(session, 'net-ground-branch', 'passive-piezo-1', 'GND', 'junction-starter-passive-piezo-ground');
    wire(session, 'net-starter-passive-piezo-d9', 'passive-piezo-1', 'SIGNAL', 'board-1', 'D9');
  } else if (card.id === 'avr-speaker-signal') {
    add(session, createCandidateUiComponent(card.model, 'speaker-signal-1'), { x: 0.76, y: 0.7 });
    branch(session, 'net-ground-branch', 'speaker-signal-1', 'GND', 'junction-starter-speaker-ground');
    wire(session, 'net-starter-speaker-d10', 'speaker-signal-1', 'SIGNAL', 'board-1', 'D10');
  } else if (card.id === 'avr-hobby-servo' || card.id === 'avr-continuous-servo') {
    const continuous = card.id === 'avr-continuous-servo'; const id = continuous ? 'continuous-servo-1' : 'hobby-servo-1';
    add(session, createCandidateUiComponent(card.model, id), { x: 0.76, y: 0.7 });
    branch(session, 'net-5v', id, 'VCC', `junction-starter-${id}-vcc`);
    branch(session, 'net-ground-branch', id, 'GND', `junction-starter-${id}-ground`);
    wire(session, `net-starter-${id}-signal`, id, 'SIGNAL', 'board-1', continuous ? 'D10' : 'D9');
  } else if (card.id === 'avr-dc-motor-l298n') {
    const motor='dc-motor-1',driver='l298n-1';
    add(session, createCandidateUiComponent('output.dc-motor-v1', motor), { x: 0.83, y: 0.64 });
    add(session, createCandidateUiComponent('driver.l298n-single-channel-v1', driver), { x: 0.61, y: 0.68 });
    branch(session, 'net-5v', driver, 'VCC', 'junction-starter-l298n-vcc');
    branch(session, 'net-ground-branch', driver, 'GND', 'junction-starter-l298n-ground');
    wire(session, 'net-starter-l298n-in1', driver, 'IN1', 'board-1', 'D7');
    wire(session, 'net-starter-l298n-in2', driver, 'IN2', 'board-1', 'D8');
    wire(session, 'net-starter-l298n-ena', driver, 'ENA', 'board-1', 'D9');
    wire(session, 'net-starter-l298n-out1', driver, 'OUT1', motor, 'A');
    wire(session, 'net-starter-l298n-out2', driver, 'OUT2', motor, 'B');
  } else if (card.id === 'avr-dc-motor-tb6612fng' || card.id === 'avr-dc-motor-drv8833') {
    ['button-1', 'led-1', 'led-2', 'resistor-1', 'resistor-2'].forEach((componentId) => apply(session, { type: 'component.remove', componentId }));
    const tb=card.id.endsWith('tb6612fng'),motor='dc-motor-1',driver=tb?'tb6612fng-1':'drv8833-1';
    add(session, createCandidateUiComponent('output.dc-motor-v1', motor), { x: 0.83, y: 0.64 });
    add(session, createCandidateUiComponent(card.model, driver), { x: 0.61, y: 0.68 });
    branch(session, 'net-5v', driver, 'VCC', `junction-starter-${driver}-vcc`);
    branch(session, 'net-ground-branch', driver, 'GND', `junction-starter-${driver}-ground`);
    wire(session, `net-starter-${driver}-in1`, driver, 'AIN1', 'board-1', tb?'D7':'D9');
    wire(session, `net-starter-${driver}-in2`, driver, 'AIN2', 'board-1', 'D8');
    if(tb){wire(session,'net-starter-tb6612-pwm',driver,'PWMA','board-1','D9');wire(session,'net-starter-tb6612-standby',driver,'STBY','board-1','D6');}
    wire(session, `net-starter-${driver}-out1`, driver, tb?'AO1':'AOUT1', motor, 'A');
    wire(session, `net-starter-${driver}-out2`, driver, tb?'AO2':'AOUT2', motor, 'B');
  } else if (card.id === 'avr-bipolar-stepper-a4988' || card.id === 'avr-bipolar-stepper-drv8825') {
    ['button-1', 'led-1', 'led-2', 'resistor-1', 'resistor-2'].forEach((componentId) => {
      apply(session, { type: 'component.remove', componentId });
    });
    const motor='bipolar-stepper-1',driver=card.id.endsWith('a4988')?'a4988-1':'drv8825-1';
    const driverType=card.id.endsWith('a4988')?'driver.a4988-step-dir-v1':'driver.drv8825-step-dir-v1';
    add(session, createCandidateUiComponent('output.bipolar-stepper-v1', motor), { x: 0.83, y: 0.64 });
    add(session, createCandidateUiComponent(driverType, driver), { x: 0.61, y: 0.68 });
    branch(session, 'net-5v', driver, 'VCC', `junction-starter-${driver}-vcc`);
    branch(session, 'net-ground-branch', driver, 'GND', `junction-starter-${driver}-ground`);
    wire(session, `net-starter-${driver}-step`, driver, 'STEP', 'board-1', 'D2');
    wire(session, `net-starter-${driver}-dir`, driver, 'DIR', 'board-1', 'D3');
    wire(session, `net-starter-${driver}-enable`, driver, 'ENABLE', 'board-1', 'D4');
    for (const pin of ['A1','A2','B1','B2']) wire(session, `net-starter-${driver}-${pin.toLowerCase()}`, driver, pin, motor, pin);
  } else if (card.id === 'avr-unipolar-stepper-uln2003') {
    ['button-1', 'led-1', 'led-2', 'resistor-1', 'resistor-2'].forEach((componentId) => {
      apply(session, { type: 'component.remove', componentId });
    });
    const motor='unipolar-stepper-1',driver='uln2003-1';
    add(session, createCandidateUiComponent('output.28byj48-unipolar-stepper-v1', motor), { x: 0.83, y: 0.64 });
    add(session, createCandidateUiComponent('driver.uln2003-four-channel-v1', driver), { x: 0.61, y: 0.68 });
    branch(session, 'net-5v', driver, 'VCC', 'junction-starter-uln2003-vcc');
    branch(session, 'net-5v', motor, 'COM', 'junction-starter-unipolar-common');
    branch(session, 'net-ground-branch', driver, 'GND', 'junction-starter-uln2003-ground');
    ['1','2','3','4'].forEach((channel,index) => {
      wire(session, `net-starter-uln2003-in${channel}`, driver, `IN${channel}`, 'board-1', `D${index+2}`);
      wire(session, `net-starter-uln2003-out${channel}`, driver, `OUT${channel}`, motor, ['A','B','C','D'][index]);
    });
  } else if (card.id === 'avr-traffic-light') {
    add(session, createTrafficLightComponent('traffic-light-1', 'Workshop traffic light'), { x: 0.79, y: 0.68 });
    const channels = [['RED', 'D3'], ['AMBER', 'D5'], ['GREEN', 'D6']];
    channels.forEach(([channel, boardPin], index) => {
      add(session, createComponent(`traffic-resistor-${index + 1}`, 'resistor.fixed-v1', {
        label: `${channel} lamp resistor`, properties: { ohms: 220 },
      }), { x: 0.48, y: 0.48 + index * 0.12 });
      wire(session, `net-starter-traffic-${channel.toLowerCase()}-lamp`, 'traffic-light-1', channel,
        `traffic-resistor-${index + 1}`, 'B');
      wire(session, `net-starter-traffic-${channel.toLowerCase()}-drive`, `traffic-resistor-${index + 1}`, 'A',
        'board-1', boardPin);
    });
    branch(session, 'net-ground-branch', 'traffic-light-1', 'COM', 'junction-starter-traffic-common');
  } else if (card.id === 'avr-seven-segment') {
    add(session, createSevenSegmentComponent('seven-segment-1', 'Workshop digit'), { x: 0.78, y: 0.72 });
    SEGMENTS.forEach((segment, index) => add(session, createComponent(`resistor-${index + 3}`, 'resistor.fixed-v1', {
      label: `Segment ${segment} resistor`, properties: { ohms: 220 },
    }), { x: 0.4 + (index % 4) * 0.1, y: 0.48 + Math.floor(index / 4) * 0.1 }));
    branch(session, 'net-ground-branch', 'seven-segment-1', 'COM', 'junction-starter-seven-common');
    SEGMENTS.forEach((segment, index) => {
      wire(session, `net-starter-seven-${segment}-anode`, 'seven-segment-1', segment, `resistor-${index + 3}`, 'B');
      wire(session, `net-starter-seven-${segment}-output`, `resistor-${index + 3}`, 'A', 'board-1', SEGMENT_PINS[index]);
    });
  } else if (card.id === 'avr-four-digit-seven-segment') {
    ['button-1', 'led-1', 'led-2', 'resistor-1', 'resistor-2'].forEach((componentId) => {
      apply(session, { type: 'component.remove', componentId });
    });
    add(session, createFourDigitSevenSegmentComponent(
      'four-digit-seven-segment-1', 'Workshop four-digit display',
    ), { x: 0.73, y: 0.66 });
    FOUR_DIGIT_SEGMENTS.forEach((segment, index) => {
      const resistorId = `four-digit-resistor-${index + 1}`;
      add(session, createComponent(resistorId, 'resistor.fixed-v1', {
        label: `${segment} shared segment resistor`, properties: { ohms: 220 },
      }), { x: 0.39 + (index % 4) * 0.1, y: 0.43 + Math.floor(index / 4) * 0.12 });
      wire(session, `net-starter-four-digit-${segment}-anode`,
        'four-digit-seven-segment-1', segment, resistorId, 'B');
      wire(session, `net-starter-four-digit-${segment}-drive`,
        resistorId, 'A', 'board-1', FOUR_DIGIT_SEGMENT_PINS[index]);
    });
    FOUR_DIGIT_SELECT_PINS.forEach((boardPin, index) => {
      wire(session, `net-starter-four-digit-select-${index + 1}`,
        'four-digit-seven-segment-1', `DIG${index + 1}`, 'board-1', boardPin);
    });
  } else if (card.id === 'avr-rotary-encoder') {
    apply(session, { type: 'component.remove', componentId: 'button-1' });
    add(session, createCandidateUiComponent(card.model, 'encoder-1'), { x: 0.74, y: 0.7 });
    wire(session, 'net-starter-encoder-a', 'encoder-1', 'A', 'board-1', 'D2');
    wire(session, 'net-starter-encoder-b', 'encoder-1', 'B', 'board-1', 'D3');
    wire(session, 'net-starter-encoder-com', 'encoder-1', 'COM', 'board-1', 'GND2');
  }
  if (!session.runnable.ok) throw new Error(`${card.id}:${session.runnable.code}`);
  return session;
}

export function avrReferenceStarterCatalog() {
  return CARDS.map((card) => ({ ...card }));
}

export function createAvrReferenceStarter(id) {
  const card = CARDS.find((entry) => entry.id === id);
  if (!card) throw new Error('AVR_REFERENCE_STARTER_UNKNOWN');
  const session = construct(card);
  return { ...card, text: session.saveText(), project: JSON.parse(session.saveText()) };
}
