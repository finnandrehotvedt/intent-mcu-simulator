#include <avr/io.h>

// Original project fixture: activates out-of-scope peripherals for fail-closed detection.
void setup() {
  SPCR = _BV(SPE);
  TWCR = _BV(TWEN);
  ACSR = _BV(ACIE);
}

void loop() {}
