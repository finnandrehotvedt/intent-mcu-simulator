#include <Arduino.h>
#include <avr/io.h>

// Project-owned adapter qualification fixture. This is not a rewrite or
// substitute for the exact private-dependency Visuino water-tank sketch.
static const uint8_t LCD_ADDRESS = 0x27;
static const uint8_t BACKLIGHT = 0x08;

static void twi_wait() { while (!(TWCR & _BV(TWINT))) {} }
static void twi_start() {
  TWCR = _BV(TWINT) | _BV(TWSTA) | _BV(TWEN); twi_wait();
  TWDR = LCD_ADDRESS << 1; TWCR = _BV(TWINT) | _BV(TWEN); twi_wait();
}
static void twi_write(uint8_t value) {
  TWDR = value; TWCR = _BV(TWINT) | _BV(TWEN); twi_wait();
}
static void twi_stop() { TWCR = _BV(TWINT) | _BV(TWEN) | _BV(TWSTO); }
static void expander(uint8_t value) {
  twi_start(); twi_write(value | BACKLIGHT); twi_stop(); delayMicroseconds(2);
}
static void nibble(uint8_t value, bool data) {
  uint8_t base = (uint8_t)((value << 4) | (data ? 1 : 0));
  expander(base); expander(base | 0x04); expander(base);
}
static void lcd_byte(uint8_t value, bool data) {
  nibble(value >> 4, data); nibble(value & 0x0f, data); delayMicroseconds(50);
}
static void command(uint8_t value) {
  lcd_byte(value, false); if (value == 1 || value == 2) delay(2);
}
static void text20(const char* value) {
  uint8_t written = 0;
  while (*value && written < 20) { lcd_byte((uint8_t)*value++, true); written++; }
  while (written++ < 20) lcd_byte(' ', true);
}
static void row(uint8_t address, const char* value) { command(address); text20(value); }

void setup() {
  TWSR = 0; TWBR = 72; delay(20);
  nibble(3, false); delayMicroseconds(4100); nibble(3, false); delayMicroseconds(100);
  nibble(3, false); delayMicroseconds(100); nibble(2, false); delayMicroseconds(50);
  command(0x28); command(0x0c); command(0x06); command(0x01);
  row(0x80, "Level: 20.0%");
  row(0xc0, "Mode: AUTO");
  row(0x94, "Pump: ON");
  row(0xd4, "Alarm: OK");
}
void loop() {}
