# Intent MCU Simulator 1.1.0-rc.10

This app-only release makes the bounded STM32F429ZI PB0 teaching circuit
editable while preserving the accepted fixed Arm compiler, strict ELF32 and
actual Renode PB0/USART3/reset-replay contract.

## STM32F429ZI editable teaching circuit

- The original project-owned STM32F429ZI profile board exposes named PB0 CN11
  pin 34 and GND CN11 pin 35 terminals. The validated ideal route is PB0 →
  220 Ω → LED anode/cathode → GND.
- Parts and cables support selection, pointer or keyboard movement,
  quarter-turn rotation, Delete, bounded Undo/Redo, zoom and Fit. Responsive
  orthogonal routing keeps cables attached to the actual rendered terminals
  and outside every component body.
- Invalid topology fails closed. Every source, topology or layout edit and
  every local data-only Open retires stale ELF, runtime and LED authority and
  requires a fresh isolated Build.
- Default HIGH, edited LOW and Reset acceptance continue to use the exact
  compiler-generated ELF in actual Renode 1.17.0. PB0/USART3 execution truth
  stays visibly separate from the ideal external teaching circuit.
- STM32 project-v2 files contain only source and validated circuit data. The
  prior source-only project-v1 format remains readable and gains the safe
  default teaching circuit on Open; executable bytes are never imported.
- AVR, Pico, ESP32-C3, Caddy, DNS, compiler/runtime images and unrelated
  services remain unchanged.

---

## 1.1.0-rc.9

This app-only release makes the bounded ESP32-C3 GPIO2 teaching circuit
editable while preserving the accepted fixed compiler and actual QEMU CPU/UART
execution path.

## ESP32-C3 editable teaching circuit

- The original project-owned ESP32-C3 profile board exposes named GPIO2 J1
  physical pin 4 and GND J1 physical pin 6 terminals. Its validated route is
  GPIO2 → 220 Ω → LED anode/cathode → GND.
- Parts and cables support selection, pointer or keyboard movement,
  quarter-turn rotation, Delete, bounded Undo/Redo, zoom and Fit. The shared
  Pico routing behavior keeps every visible cable attached to the actual SVG
  terminal and outside component bodies on desktop and mobile.
- Invalid topology fails closed. Every source, topology or layout edit and
  every local data-only Open retires stale flash/runtime/LED authority and
  requires a fresh isolated Build.
- HIGH, LOW and INPUT acceptance still executes the compiler-generated DIO
  flash on actual Espressif QEMU CPU/UART. GPIO2 remains a separately labelled
  project-owned executed-register-write model; QEMU pin state is not observed.
- Save/Open contains only project source and validated circuit data. Executable
  bytes, capabilities, artifacts and runtime sessions are never stored.
- Pico LED component titles are separated from terminal chips. AVR, Pico,
  STM32F429ZI, Caddy, DNS and all unrelated services remain unchanged.

---

## 1.1.0-rc.8

This app-only correction makes rendered Pico wires follow the actual visible
terminal geometry through every supported quarter-turn and responsive size.

## Rotated-terminal rendering correction

- Named routes now derive each escape direction from the nearest rendered
  component edge. GPIO0/GND, resistor Lead A/B and LED terminals therefore
  leave the visible pin instead of using the card's unscaled centre axis.
- Pin-to-escape doglegs are preserved during route compaction. Every later
  segment must avoid every component body, including the two components that
  own the route endpoints.
- The public browser contract compares each interactive anchor with the actual
  SVG terminal and checks 0°, 90°, 180° and 270° after movement, Delete,
  Undo/Redo, Fit and viewport resize on desktop and mobile.
- Closely spaced LED and Pico pin labels use separate placement so their text
  remains readable. Mobile components receive a bounded responsive scale while
  pin labels retain readable size.
- AVR, compiler/runtime contracts, saved-project formats, C3, STM32, Caddy and
  DNS are unchanged.

---

## 1.1.0-rc.7

This incremental release makes the existing bounded public Pico circuit
directly editable while preserving all accepted compiler and runtime paths.

## Pico editable circuit

- The original project-owned board, resistor and LED graphics expose named
  GP0 physical pin 1 and GND physical pin 3 anchors. No third-party simulator
  artwork, branding or copied layout is introduced.
- Parts and cables are selectable. Parts support pointer drag, Arrow-key move
  and 90-degree rotation; selected parts or cables can be deleted and restored
  through bounded Undo/Redo.
- Zoom and Fit preserve named-pin attachment. Orthogonal routes are recomputed
  after movement, rotation and viewport resize and avoid unrelated component
  bodies.
- Save/Open remains a local data-only project flow. Executable bytes are never
  saved; source, topology or Open changes retire stale authority and require a
  fresh fixed-toolchain Build.
- Actual compiled GPIO0 HIGH/LOW continues to drive the external LED through
  the validated 3.3 V GP0 → 220 Ω → LED → GND path. Disconnected or invalid
  circuits fail closed.

## Preserved public paths

- AVR, the Pico compiler/runtime, ESP32-C3 QEMU and STM32F429ZI Renode retain
  their accepted bounded contracts and isolation controls.
- Desktop and mobile acceptance retain zero horizontal overflow, keyboard
  separation from source text editing, no cookies and no third-party browser
  requests.

---

## 1.1.0-rc.6

This incremental public release adds the previously private-verified bounded
STM32F429ZI source-to-Renode path while preserving the accepted AVR, Pico and
ESP32-C3 workbenches.

## STM32F429ZI public slice

- One exact project-owned C11 grammar may set PB0 HIGH/LOW, emit one 1–24
  character uppercase USART3 marker and halt.
- Arm GNU 14.3.1 compiles the source in a disposable network-disabled,
  read-only, non-root container using the fixed project startup, runtime and
  linker contract. A strict source-bound ELF32 validator runs before execution.
- Actual Renode 1.17.0 observes PB0 and USART3 over two matching boot epochs.
  Reset starts a fresh isolated Renode process with the same currently accepted
  ELF; instruction ordinals are not presented as physical cycles.
- The visible original controller drawing exposes named PB0 and GND anchors.
  Its PB0 → 220 Ω → LED → GND route stays outside the controller body and is
  explicitly an ideal teaching circuit driven by the actual PB0 observation.
- Save/Open contains project name, profile and source only. Source edit,
  invalid source, Open, profile change and Stop discard executable authority,
  clear prior PB0/USART3 provenance and require a fresh Build.
- Compiler and runtime jobs are single-concurrency, rate-bounded, disposable,
  network-disabled and zero-retention. No arbitrary C, ELF picker, SDK, broad
  peripheral, full STM32 family, hardware upload or physical-board claim is
  introduced.

## Preserved public paths

- The accepted AVR, RP2040 Pico and ESP32-C3 journeys and their exact truth
  labels remain unchanged.
- The page keeps one active controller canvas, zero tested desktop/mobile
  horizontal overflow, no cookies and no third-party browser requests.

---

## 1.1.0-rc.5

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
- The page contains no inline executable or metadata script, so the unchanged
  production ingress CSP does not need a release-specific inline hash.
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
