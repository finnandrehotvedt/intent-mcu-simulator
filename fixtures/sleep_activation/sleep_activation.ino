#include <avr/sleep.h>

// Original project fixture: active sleep must fail closed until semantics exist.
void setup() {
  set_sleep_mode(SLEEP_MODE_IDLE);
  sleep_enable();
  sleep_cpu();
}

void loop() {}
