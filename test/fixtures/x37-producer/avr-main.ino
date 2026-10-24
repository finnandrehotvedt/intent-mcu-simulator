// Copyright 2026 Finn Andre Hotvedt and IntentForce
// SPDX-License-Identifier: Apache-2.0
// X37 source-bound participant A: finite open-drain request/ack/confirm.
bool completed = false;

bool waitLevel(int level, unsigned long maximumSamples) {
  for (unsigned long sample = 0; sample < maximumSamples; sample++) {
    if (digitalRead(2) == level) return true;
  }
  return false;
}

void driveLow(unsigned long holdSamples) {
  digitalWrite(13, LOW);
  pinMode(13, OUTPUT);
  for (unsigned long sample = 0; sample < holdSamples; sample++) digitalRead(2);
  pinMode(13, INPUT);
}

void setup() {
  pinMode(2, INPUT);
  pinMode(13, INPUT);
}

void loop() {
  if (completed) return;
  completed = true;
  if (!waitLevel(HIGH, 8192)) return;
  driveLow(64);
  if (!waitLevel(LOW, 8192)) return;
  if (!waitLevel(HIGH, 8192)) return;
  driveLow(64);
}
