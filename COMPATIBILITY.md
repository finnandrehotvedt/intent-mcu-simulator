# Compatibility

Intent MCU Simulator 1.1.0-rc.4 publicly executes one `ATmega328P`, 16 MHz,
5 V learning profile and one bounded `RP2040 Pico` GPIO0/UART0 source profile.
Both are deterministic educational subsets, not complete electrical or
cycle-perfect hardware replacements.

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

The Pico editor accepts one exact project-owned `main.c` grammar. It can set
GPIO0 HIGH or LOW, emit 1–24 uppercase UART0 characters and halt. The fixed
Arm GNU 14.3.1 toolchain produces a strict source-bound UF2 that runs in the
rp2040js 1.4.0 browser worker. The only validated external circuit is GP0
physical pin 1 through 220 Ω and an LED to GND physical pin 3. GPIO25 is
identified separately as an onboard-LED signal and is not a header anchor.

## Explicitly unsupported

For AVR, SPI, I²C/TWI, EEPROM writes, watchdog activation, analogue comparator use,
ADC free-running/auto-trigger/differential modes, self-programming and physical
board upload stop or remain unavailable. General analogue or mixed-signal
simulation, public ESP32-C3/STM32F429ZI execution, physical-device access,
hosted AI, accounts and cloud project storage are outside this release. The
Pico profile does not support a general SDK, headers, pointers, arbitrary MMIO,
PIO, DMA, USB, multicore, broad timing or additional peripherals.

Two additional controller profiles are status previews only:

- ESP32-C3 has private bounded edited-Serial compilation and actual QEMU UART,
  reset, and watchdog evidence. Public project upload, Build, Run, runtime
  sessions, GPIO, and wired-circuit support are disabled.
- STM32F429ZI has private bounded C11 source-to-fixed-ARM-toolchain-to-strict
  ELF-to-Renode evidence for PB0, USART3, and reset replay, plus a retained
  hash-pinned fixture. It has no public compiler, arbitrary-ELF input, or
  runtime.

Those evidence statements do not claim complete controller, peripheral, or
physical-device support. The two private services remain disabled publicly
until each exact profile passes its own multi-user admission, isolation,
lifecycle, peripheral and release acceptance. Private evidence does not inherit
the bounded public Pico authority.

Visual catalogue entries are not capability claims. A part becomes selectable
only after it has an electrical model, emulator contract and reference tests.
Physical-hardware comparison remains outstanding; do not use the simulator as
electrical-safety or timing certification.
