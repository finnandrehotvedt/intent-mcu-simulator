#include <avr/interrupt.h>
#include <avr/pgmspace.h>

// Original project fixture: deterministic compiler-emitted CPU operation corpus.
const uint8_t flashData[] PROGMEM = {3, 5, 8, 13};
volatile uint16_t result;
volatile uint8_t done;

__attribute__((noinline)) static uint16_t mix(uint8_t a, uint8_t b) {
  uint16_t product = (uint16_t)a * b;
  if (product > 200) {
    product ^= 0x55aa;
  }
  return product + pgm_read_byte(&flashData[(a + b) & 3]);
}

void setup() {
  uint8_t scratch[4] = {11, 17, 71, 29};
  uint16_t total = 0;
  for (uint8_t i = 0; i < 4; i++) {
    total += mix(scratch[i], i + 2);
  }
  result = total;
  done = 0xa5;
}

void loop() {}
