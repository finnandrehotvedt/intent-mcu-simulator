# Compatibility

Intent MCU Simulator 1.1.0-rc.5 publicly executes one `ATmega328P`, 16 MHz,
5 V learning profile, one bounded `RP2040 Pico` GPIO0/UART0 source profile and
one bounded `ESP32-C3` GPIO2/UART source profile. They are educational subsets,
not complete electrical or cycle-perfect hardware replacements.

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

The ESP32-C3 editor accepts one exact Arduino sketch grammar. It can set GPIO2
to `OUTPUT` or `INPUT`, select `HIGH` or `LOW`, and print one bounded uppercase
UART marker. Arduino CLI 1.5.1, Arduino-ESP32 3.3.10, ESP-IDF 5.5.4 and esp-rv32
2601 produce a strict 4 MiB DIO flash image. Actual Espressif QEMU esp32c3
executes the CPU/UART path and reset replay. Executed GPIO MMIO stores feed a
separate IntentForce GPIO2 register/LED model. QEMU pin state is not observed.

## Explicitly unsupported

For AVR, SPI, I²C/TWI, EEPROM writes, watchdog activation, analogue comparator use,
ADC free-running/auto-trigger/differential modes, self-programming and physical
board upload stop or remain unavailable. General analogue or mixed-signal
simulation, public STM32F429ZI execution, physical-device access,
hosted AI, accounts and cloud project storage are outside this release. The
Pico profile does not support a general SDK, headers, pointers, arbitrary MMIO,
PIO, DMA, USB, multicore, broad timing or additional peripherals.

The C3 subset does not support arbitrary source, a general SDK, Wi-Fi,
Bluetooth, broad peripherals, exact timing, general ESP32 family compatibility,
QEMU pin readback, or physical-device equivalence. GPIO2 is a real-board
strapping pin and the virtual example is not hardware wiring advice.

One additional controller profile is a status preview only:

- STM32F429ZI has private bounded C11 source-to-fixed-ARM-toolchain-to-strict
  ELF-to-Renode evidence for PB0, USART3, and reset replay, plus a retained
  hash-pinned fixture. It has no public compiler, arbitrary-ELF input, or
  runtime.

That evidence statement does not claim complete controller, peripheral, or
physical-device support. The private STM32 service remains disabled publicly
and does not inherit any public AVR, Pico or C3 authority.

Visual catalogue entries are not capability claims. A part becomes selectable
only after it has an electrical model, emulator contract and reference tests.
Physical-hardware comparison remains outstanding; do not use the simulator as
electrical-safety or timing certification.
