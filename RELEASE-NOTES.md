# Intent MCU Simulator 1.1.0-rc.5

This incremental public release adds one bounded ESP32-C3 source-to-QEMU path
while preserving the tested AVR and Pico workbenches.

## User-visible changes

- ESP32-C3 now has a public bounded sketch editor, local data-only Save/Open,
  fixed isolated Arduino-ESP32 compilation and actual Espressif QEMU esp32c3
  CPU/UART execution with two verified boot epochs.
- Its original GPIO2 → 220 Ω → LED → GND view is explicitly a separate
  IntentForce register model driven by actual executed MMIO stores. The UI and
  results state that QEMU pin state is not observed.
- HIGH, LOW, INPUT and disconnected-wire journeys fail closed through strict
  source, flash, runtime, register and electrical validation.
- Compiler and runtime jobs are one-at-a-time, network-disabled, disposable,
  capability-scoped and memory-only. Source changes and Stop retire executable
  authority; no firmware or project is stored by the service.
- Switching back from the temperature/LCD candidate to an ordinary starter no
  longer calls a reducer method from the wrong project schema. All five cards
  and all five dropdown choices can be traversed repeatedly without a browser
  exception.
- Prompt Bridge generation now uses a candidate project's validated runnable
  AVR projection instead of passing the candidate wrapper to the project-v2
  normalizer. Candidate-specific circuit replacement is rejected with an
  explicit boundary instead of throwing.
- Selecting Pico, ESP32-C3, or the STM32 preview now hides the inactive AVR
  canvas instead of showing two competing circuit views. The controller
  selector remains at the top and Return to AVR restores the parked project.
- AVR and Pico disposable compiler deadlines are 30 seconds. This preserves
  fail-closed cancellation while avoiding the observed 12-second cold-worker
  intermittency; successful builds still return as soon as compilation ends.
- RP2040 Pico now has a public bounded `main.c` editor, local data-only
  Save/Open, isolated fixed Arm compilation, strict source-bound UF2 validation,
  and actual browser-worker GPIO0/UART0 execution.
- The Pico circuit labels GP0 physical pin 1 and GND physical pin 3, routes GP0
  through 220 Ω and an external LED, and labels GPIO25 separately as an onboard
  LED signal rather than a header anchor.
- The LED cathode lead now meets the GND route continuously at desktop and
  mobile widths, and the 220 Ω label is separated from the resistor bands.
- Rejected Pico source now explicitly says to preserve the complete template
  and its line breaks while changing only the two permitted values.
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
- ESP32-C3: public strict sketch grammar, fixed Arduino-ESP32/esp-rv32
  compilation, actual QEMU CPU/UART/reset replay, and separately labelled
  project-owned GPIO2/LED register model. No QEMU pin-readback or broad ESP32
  claim.
- STM32F429ZI: private bounded source, fixed ARM compiler, strict ELF, actual
  Renode PB0/USART3/reset, and retained fixture evidence; no public compiler,
  arbitrary-ELF input, or runtime.

The release makes no physical safety, complete hardware-equivalence, search
ranking, or AI-citation promise. Prompt Bridge remains portable text plus
strict project-owned validation, not a live AI service.
