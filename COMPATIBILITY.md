# Compatibility

Intent MCU Simulator 1.1.0-rc.3 publicly executes one `ATmega328P`, 16 MHz, 5 V learning
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
- project models for a controller, fixed resistor, LED, 0 V reference,
  momentary button, potentiometer, SPST toggle, SPDT changeover, quadrature
  encoder, analogue light and temperature sensors, digital light threshold,
  common-cathode RGB LED, active buzzer, common-cathode seven-segment display,
  and 16×2 write-only 4-bit GPIO character LCD.

The source editor accepts `main.ino` plus bounded project-local `.h`, `.hpp`,
`.c` and `.cpp` files. The fixed compile profile is Arduino AVR Boards 1.8.8,
Arduino CLI 1.5.1 and AVR GCC 7.3.0-atmel3.6.1-arduino7. No arbitrary library
installation is supported.

## Explicitly unsupported

SPI, I²C/TWI, EEPROM writes, watchdog activation, analogue comparator use,
ADC free-running/auto-trigger/differential modes, self-programming and physical
board upload stop or remain unavailable. General analogue or mixed-signal
simulation, public ESP32/RP2040/STM32 execution, physical-device access, hosted
AI, accounts and cloud project storage are outside this release.

Three additional controller profiles are status previews only:

- ESP32-C3 has private bounded edited-Serial compilation and actual QEMU UART,
  reset, and watchdog evidence. Public project upload, Build, Run, runtime
  sessions, GPIO, and wired-circuit support are disabled.
- RP2040 Pico has private bounded C11 source-to-fixed-ARM-toolchain-to-UF2
  evidence plus strict local/precompiled UF2/ELF and rp2040js GPIO0/UART0
  subset evidence. It has no public compiler, firmware picker, or runtime.
- STM32F429ZI has private bounded C11 source-to-fixed-ARM-toolchain-to-strict
  ELF-to-Renode evidence for PB0, USART3, and reset replay, plus a retained
  hash-pinned fixture. It has no public compiler, arbitrary-ELF input, or
  runtime.

Those evidence statements do not claim complete controller, peripheral, or
physical-device support. All three private services remain disabled publicly
until fair multi-user admission, per-origin/session limits, abuse accounting,
transient-data erasure, production isolation, and an availability/operations
contract are defined and pass release acceptance. The C3 compiler worker must
also stop running as container root before public use.

Visual catalogue entries are not capability claims. A part becomes selectable
only after it has an electrical model, emulator contract and reference tests.
Physical-hardware comparison remains outstanding; do not use the simulator as
electrical-safety or timing certification.
