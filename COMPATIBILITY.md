# Compatibility

Intent MCU Simulator 1.1.0-rc.31 publicly executes one `ATmega328P`, 16 MHz,
5 V learning profile, one bounded `RP2040 Pico` GPIO0/UART0 source profile and
one bounded `ESP32-C3` GPIO2/UART source profile, plus one bounded
`STM32F429ZI` PB0/USART3/reset-replay profile. They are educational subsets,
not complete electrical or cycle-perfect hardware replacements.

Pico, ESP32-C3 and STM32 expose bounded orthogonal cable layout editing with
six fixed colours. These controls modify only accepted local layout data.
Named endpoints and the existing net graph remain the sole electrical
authority; crossings do not connect nets, and distinct nets cannot share a
positive-length collinear lane.

Fault validation is bounded to each representable profile. AVR detects its
named 5 V-to-ground short, known opposing logical outputs and declared 5 V
supply-role mismatch. All profiles reject their representable missing-ground,
LED-polarity, required-resistance and ideal-model overcurrent faults with a
corrective action. This is not arbitrary rail mixing, a general circuit solver,
physical damage prediction or safety certification.

AVR projects allow every selectable catalogue part to be click-placed or
drag-placed, moved, rotated, deleted and duplicated. A duplicate receives a
fresh stable ID, copies authored properties and controls, and starts with no
net references. Existing IDs, nets, endpoints, junctions and routes are
preserved exactly. The narrow profiles retain fixed three-part graphs and do
not claim general placement or duplication.

AVR ordinary and candidate-v3 graphs support explicit junction branches.
Selecting one branch reconnects or deletes only that endpoint; deleting the
whole net remains a separate labelled action. Every accepted operation has one
complete-document Undo/Redo transaction, while rejected operations add no
history. Automatic-route endpoint buttons provide a visible keyboard- and
pointer-operable way to select an exact branch.

All four actual circuit editors use the same dark workbench canvas and grid.
This presentation parity does not alter any profile's component graphics,
named pins, topology, compiler or runtime capability.

The workbench provides multiple deterministic examples for each currently
supported U03 teaching function. AVR has multiple button, ADC, PWM and Serial
examples. Each bounded Pico, ESP32-C3 and STM32 profile has two UART/LED
examples using only its existing fixed source grammar and three-part circuit.
Button, ADC and PWM remain unavailable on those narrow profiles; examples do
not imply a new peripheral, API, pin or topology.

The component contract contains 19 unique public models across these four
profiles. AVR makes 16 available (13 Simulated and 3 Partial); each narrow
profile makes exactly 3 available (its fixed Partial controller, Simulated
resistor and Simulated LED). The remaining profile/model combinations are
explicitly unavailable. Ordinary AVR project-v2 exposes 5 models, while
candidate-v3 exposes 13 by default or all 16 with the All statuses filter.
`src/component-support-matrix.mjs` is the executable derived inventory and the
same matrix is published on `/components.html`.

Every one of the 25 available component/profile cells has at least one public
starter binding. Eight rc.26 AVR references cover the explicit ground symbol,
SPST, SPDT, analogue light, digital light threshold, active buzzer,
seven-segment display and quadrature encoder. They reuse only the existing
candidate-v3 projections, compiler and worker. SPDT and buzzer remain Partial;
the buzzer is a silent logical indicator rather than an acoustic model.

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

One bounded thermostat experiment uses that same AVR compiler/runtime path.
Its exact graph is an ideal analogue temperature module on A1, an active-low
button on D2 and a D13 → 220 Ω → LED → ground indicator. The 30 °C equality
rule is `measured < setpoint`; three scenarios reset independently and require
executed D13, matching UART and complete input-event evidence in the 160–350 ms
virtual-time window. The serialized candidate compatibility fixture contains
metadata only and cannot authorize execution: current source and projected
circuit are included in the fresh build identity after every Open or edit.

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
