// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const SOURCE_PREFIX = `// Intent MCU experiment: avr-thermostat-boundary-v1\n`;

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
