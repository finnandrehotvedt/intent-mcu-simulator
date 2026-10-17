# Compatibility

Intent MCU Simulator 1.1.0-rc.12 publicly executes one `ATmega328P`, 16 MHz,
5 V learning profile, one bounded `RP2040 Pico` GPIO0/UART0 source profile and
one bounded `ESP32-C3` GPIO2/UART source profile, plus one bounded
`STM32F429ZI` PB0/USART3/reset-replay profile. They are educational subsets,
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
rp2040js 1.4.0 browser worker. The only validated external topology is GP0
physical pin 1 through one bounded resistor and LED to GND physical pin 3; the
default is a 220 Ω red-LED pair. GPIO25 is
identified separately as an onboard-LED signal and is not a header anchor.

The bounded Pico, ESP32-C3 and STM32 teaching graphs support the same direct
named-pin cable workflow: choose a free source and compatible free target, or
select a cable and reconnect one explicitly chosen endpoint. This is limited
to each controller's existing controller/resistor/LED/ground graph and stable
net IDs. It is not general cross-controller wiring support. Invalid or pending
wire actions block Build and retire stale executable, runtime and LED
authority; Escape cancels a pending choice without changing topology.

Those three graphs also expose one profile-filtered recovery catalogue
containing only the fixed controller, existing resistor and existing LED. A
missing resistor or LED can be restored after data-only Save/Open, but no wire
is inferred. The restored stable part must be connected through the same named
pins before Build. Resistance and LED colour are limited to combinations that
pass the exact 3.3 V / 12 mA ideal-model validator. The colour setting chooses
a tested forward-voltage constant; it is not a physical colour, wavelength or
brightness simulation.

The ESP32-C3 editor accepts one exact Arduino sketch grammar. It can set GPIO2
to `OUTPUT` or `INPUT`, select `HIGH` or `LOW`, and print one bounded uppercase
UART marker. Arduino CLI 1.5.1, Arduino-ESP32 3.3.10, ESP-IDF 5.5.4 and esp-rv32
2601 produce a strict 4 MiB DIO flash image. Actual Espressif QEMU esp32c3
executes the CPU/UART path and reset replay. Executed GPIO MMIO stores feed a
separate IntentForce GPIO2 register/LED model. QEMU pin state is not observed.
The validated GPIO2 J1 pin 4 → bounded resistor → LED → GND J1 pin 6 circuit is editable:
parts and cables can be selected, moved, quarter-turned, deleted and restored
with bounded Undo/Redo. Every circuit edit or local data-only Open retires
executable and LED authority until a fresh successful Build.

The STM32F429ZI editor accepts one exact project-owned C11 grammar. It can set
PB0 HIGH or LOW, emit 1–24 uppercase USART3 characters and halt. The fixed Arm
GNU 14.3.1 toolchain produces a strict source-bound ELF32. Actual Renode 1.17.0
observes PB0 and USART3 across two matching boot epochs. The named external
PB0 → bounded resistor → LED → GND path is an ideal teaching rendering driven by the
observed PB0 level; it is not analogue or physical-board equivalence. Parts and
cables can be selected, moved, quarter-turned, deleted and restored through
bounded Undo/Redo. Every circuit edit or local data-only Open retires ELF and
LED authority until a fresh successful Build.

## Explicitly unsupported

For AVR, SPI, I²C/TWI, EEPROM writes, watchdog activation, analogue comparator use,
ADC free-running/auto-trigger/differential modes, self-programming and physical
board upload stop or remain unavailable. General analogue or mixed-signal
simulation, physical-device access, hosted AI, accounts and cloud project
storage are outside this release. The
Pico profile does not support a general SDK, headers, pointers, arbitrary MMIO,
PIO, DMA, USB, multicore, broad timing or additional peripherals.

The C3 subset does not support arbitrary source, a general SDK, Wi-Fi,
Bluetooth, broad peripherals, exact timing, general ESP32 family compatibility,
QEMU pin readback, or physical-device equivalence. GPIO2 is a real-board
strapping pin and the virtual example is not hardware wiring advice.

The STM32 subset does not support arbitrary C or ELF, an SDK, timer/PWM,
interrupts, broad peripherals, physical timing, general STM32-family
compatibility, device programming or physical-hardware equivalence. Executable
bytes remain transient and are never stored in a saved project.

Visual catalogue entries are not capability claims. A part becomes selectable
only after it has an electrical model, emulator contract and reference tests.
Physical-hardware comparison remains outstanding; do not use the simulator as
electrical-safety or timing certification.
