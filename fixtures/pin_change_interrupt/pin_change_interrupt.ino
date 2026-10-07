#include <avr/interrupt.h>

// Original project fixture: PCINT0 bank accepts only D8/PB0.
volatile uint8_t pinChangeCount = 0;

ISR(PCINT0_vect) {
  pinChangeCount++;
  digitalWrite(13, pinChangeCount & 1);
}

void setup() {
  pinMode(8, INPUT_PULLUP);
  pinMode(9, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  PCICR |= _BV(PCIE0);
  PCMSK0 = _BV(PCINT0);
}

void loop() {}
