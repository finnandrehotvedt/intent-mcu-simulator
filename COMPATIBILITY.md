# Compatibility

Intent MCU Simulator 1.0.0-rc.1 targets one `ATmega328P`, 16 MHz, 5 V learning
profile. It is a deterministic educational subset, not a complete electrical
or cycle-perfect hardware replacement.

## Supported and tested

- digital GPIO D0–D13, including input, output and pull-up modes;
- external interrupt INT0/INT1 and the implemented pin-change masks;
- single ADC conversions on A0–A5 against the 0–5 V scalar source;
- PWM output on D3, D5, D6, D9, D10 and D11;
- UART 8N1 at the documented 9,600–115,200 baud fixtures;
- `millis`, `micros`, `delay`, `delayMicroseconds`, deterministic reset and
  bounded instruction stepping;
- project models for LEDs, fixed resistors, momentary buttons and linear
  potentiometers.

The source editor accepts `main.ino` plus bounded project-local `.h`, `.hpp`,
`.c` and `.cpp` files. The fixed compile profile is Arduino AVR Boards 1.8.8,
Arduino CLI 1.5.1 and AVR GCC 7.3.0-atmel3.6.1-arduino7. No arbitrary library
installation is supported.

## Explicitly unsupported

SPI, I²C/TWI, EEPROM writes, watchdog activation, analogue comparator use,
ADC free-running/auto-trigger/differential modes, self-programming and physical
board upload stop or remain unavailable. General analogue or mixed-signal
simulation, ESP32 and other MCU engines, physical-device access, hosted AI,
accounts and cloud project storage are outside this release.

Visual catalogue entries are not capability claims. A part becomes selectable
only after it has an electrical model, emulator contract and reference tests.
Physical-hardware comparison remains outstanding; do not use the simulator as
electrical-safety or timing certification.
