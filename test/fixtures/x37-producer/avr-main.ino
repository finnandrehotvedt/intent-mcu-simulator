// Copyright 2026 Finn Andre Hotvedt and IntentForce
// SPDX-License-Identifier: Apache-2.0
// X37 source-bound participant A: D2 input is reflected on D13.
void setup() {
  pinMode(2, INPUT);
  pinMode(13, OUTPUT);
  digitalWrite(13, HIGH);
}

void loop() {
  digitalWrite(13, digitalRead(2) == HIGH ? LOW : HIGH);
}
