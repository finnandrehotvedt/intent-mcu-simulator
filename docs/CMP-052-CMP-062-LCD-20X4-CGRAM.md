# CMP-052 / CMP-062 LCD 20×4 and CGRAM contract

The original `output.character-lcd-20x4-4bit-v1` model is available only on
the ATmega328P 16 MHz candidate-v3 path. It requires explicit 5 V, shared GND,
grounded RW, and six unique direct GPIO connections for RS, E and D4–D7.

Its deterministic write-only decoder uses the exact visible row starts
`0x00`, `0x40`, `0x14` and `0x54`, with 20-column wrapping. CGRAM addresses
`0x00..0x3f` define eight bounded slots of eight five-bit rows. Character codes
0–7 display those exact 5×8 pixels; printable DDRAM bytes remain text cells.

The supported command slice includes initialization, clear, home, increment
entry mode, display on/off, cursor and blink. Reads, busy flag, shifts, 8-bit
mode, I2C, contrast, backlight, current and physical timing tolerances are not
modelled. RP2040 Pico, ESP32-C3 and STM32F429ZI report this model unavailable.

`examples/lcd/parallel-hd44780-20x4-cgram.intent-mcu.json` is the canonical
browser-openable AVR example. It writes four rows and programs slot 1 with a
5×8 heart. `examples/lcd/manifest.json` pins its project/source hashes, named
wiring, expected visible behavior and exact profile/firmware limits.
