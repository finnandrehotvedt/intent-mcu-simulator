# CMP-050 / CMP-051 LCD end-to-end contract

## Supported slice

- `CMP-050` is a direct, write-only HD44780-compatible 16×2 display. It uses
  explicit 5 V, ground, grounded RW, RS, E and D4–D7 connections to AVR pins.
- `CMP-051` is one fixed PCF8574 backpack at 7-bit I2C address `0x27`. Its only
  public pins are 5 V, GND, SDA→A4 and SCL→A5. The fixed internal map is
  P0=RS, P1=RW, P2=E, P3=backlight and P4..P7=D4..D7.
- Only the ATmega328P 16 MHz profile has an executable adapter. RP2040 Pico,
  ESP32-C3 and STM32F429ZI report the models unavailable.

The AVR adapter uses the locked `avr8js` 0.21.1 TWI peripheral. Address `0x27`
is acknowledged only when the validated runtime topology contains exactly one
CMP-051 device. NACKed writes, another address, reads, duplicate devices and
lost trace records cannot update the display.

## Display behavior

The shared deterministic decoder supports the write-only 4-bit initialization
sequence, display-on, entry mode, clear, home, explicit first-line DDRAM
addresses `0x00..0x0f`, second-line addresses `0x40..0x4f`, and printable ASCII.
It rejects invalid initialization, inadequate instruction timing, out-of-range
DDRAM access, unsupported commands and data before initialization. Automatic
line wrapping, busy reads, custom glyphs/CGRAM, visible cursor/blink, display
shifts, arbitrary PCF8574 mappings and generic Wire-library compatibility are
not supported.

## Compiled fixture

`fixtures/pcf8574_lcd_hello/pcf8574_lcd_hello.ino` is the bounded source
fixture. Source SHA-256 is
`4fdce12246f4eb202259a492795ac93f5b59ce56678c357dbb30120ca3e6c809`.
It initializes the fixed backpack and displays:

```text
I2C LCD ready
Address 0x27
```

The accepted isolated AVR build produced Intel HEX SHA-256
`4b265b4f414ffff598e96ff71394b6fc7c0ac76c89e6332c3fca52cd02dd2c96`
(2,857 bytes). Runtime evidence contains 792 TWI records and proves both the
connected ACK path and the disconnected NACK path.

## Openable examples

`examples/lcd/manifest.json` indexes committed, browser-openable project files
for CMP-050 and CMP-051. The manifest pins each project's SHA-256, stable
component requirement, expected behavior and limits. The backpack entry also
pins the four public named connections and the compiled fixture source hash.
