# Intent MCU Simulator 1.1.0-rc.4

This incremental public release adds one bounded RP2040 Pico source-to-runtime
path while preserving the tested AVR workbench. It also makes the desktop
application use the available width with small gutters.

## User-visible changes

- RP2040 Pico now has a public bounded `main.c` editor, local data-only
  Save/Open, isolated fixed Arm compilation, strict source-bound UF2 validation,
  and actual browser-worker GPIO0/UART0 execution.
- The Pico circuit labels GP0 physical pin 1 and GND physical pin 3, routes GP0
  through 220 Ω and an external LED, and labels GPIO25 separately as an onboard
  LED signal rather than a header anchor.
- Two distinct source variants produce distinct source/UF2 identities and
  observable LED/UART results. Editing, profile changes, disconnect, Stop and
  Open invalidate executable authority and require a fresh Build.
- The app uses the viewport width with 16 px desktop gutters and retains zero
  horizontal overflow on tested desktop and mobile widths. All Parts and
  Inspector visibility combinations keep the circuit canvas in the remaining
  grid, including when the Serial dock is open.
- The existing AVR compiler, runtime, 16-part library, five examples, circuit
  editor, Prompt Bridge and local project behavior remain supported.

## Controller truth

- ATmega328P: public compile and tested virtual execution subset.
- RP2040 Pico: public exact bounded source grammar, fixed Arm GNU 14.3.1
  compilation, strict UF2 and rp2040js 1.4.0 GPIO0/UART0 execution subset.
- ESP32-C3: private fixed-toolchain and actual QEMU UART/reset/watchdog
  evidence; public project upload, Build, Run, GPIO, wired circuits, and
  runtime endpoints are disabled.
- STM32F429ZI: private bounded source, fixed ARM compiler, strict ELF, actual
  Renode PB0/USART3/reset, and retained fixture evidence; no public compiler,
  arbitrary-ELF input, or runtime.

The release makes no physical safety, complete hardware-equivalence, search
ranking, or AI-citation promise. Prompt Bridge remains portable text plus
strict project-owned validation, not a live AI service.
