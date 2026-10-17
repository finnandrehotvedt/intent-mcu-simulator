# Intent MCU Simulator 1.1.0-rc.24

This supported-example release completes the bounded U03 teaching catalogue
without adding a controller capability, component, pin, electrical topology,
source API or runtime.

## Supported-function example pack

- AVR now has two PWM lessons: the existing fade and a fixed 25%/75% pulse
  comparison. Existing button, ADC and Serial lessons already provide multiple
  distinct validated examples.
- Pico, ESP32-C3 and STM32 each show two visible authored-data cards for their
  already-supported UART/output subset: one HIGH/on result and one LOW/off
  result with distinct exact terminal text.
- Each narrow card states what to learn, what to try, the exact LED/terminal
  observation and the profile limitation. C3 keeps actual QEMU UART separate
  from its project-owned GPIO2 LED model.
- Loading another card uses the existing unsaved-change decision and always
  retires executable/runtime authority. Download/Open remains data-only and a
  fresh Build is required before Run.
- Button, ADC and PWM remain explicitly unavailable on the narrow profiles.
  The release does not claim broad SDK, physical hardware or family support.

---

## 1.1.0-rc.23

This visual-consistency and routing-correction release keeps all rc.22
electrical, compiler, runtime and local-file boundaries unchanged.

## Shared workbench canvas and route correction

- All four real circuit editors now use the same AVR dark navy canvas, subtle
  grid and grid spacing. This is a shared presentation token, not a screenshot
  or replacement canvas; every component, named pin and cable remains live.
- Automatic AVR routes reserve previously accepted interior lanes before
  routing the next net. The Blink example no longer contains a positive-length
  collinear overlap between distinct nets, while crossings and declared
  same-net trunks retain their existing meaning.
- The common Pico cable is browser-tested for direct pointer selection,
  colour/Undo and Add-bend. The review's earlier pointer and bend failures were
  reproduced as test-position/workflow issues rather than product defects.
- Before/after desktop evidence covers AVR, Pico, ESP32-C3 and STM32. Computed
  browser styles prove exact canvas parity and readable part-label contrast.
- No compiler, runtime, electrical graph, project schema, mobile scope, public
  route, DNS, Caddy configuration or private dependency changed.

---

## 1.1.0-rc.22

This route-authoring release adds bounded cable layout controls to the three
narrow controller canvases without changing their electrical graphs, compiler
profiles or runtime claims.

## Bounded cable route authoring

- Select a cable, then use **Add bend**, **Nudge −**, or **Nudge +** to edit an
  eligible orthogonal section on the snapped grid. A selected section can also
  be reached with the keyboard; Escape leaves the project and history intact.
- Choose one of six fixed cable colours. Colour is presentation only and never
  creates a connection, changes an electrical verdict or invalidates current
  source/executable authority.
- A cable crossing remains electrically separate. Only a declared junction
  dot means connected. Distinct nets cannot share a positive-length collinear
  lane under WIRE-LANE-01.
- Unsafe or ambiguous geometry rejects as one atomic operation: diagonal,
  malformed, duplicate-endpoint, body-intersecting and unresolved overlapping
  routes never replace the last accepted route.
- Download/Open and browser recovery preserve accepted route geometry and
  colour. Files from rc.21 and earlier open with deterministic automatic
  routes, and any topology reconnect retires the affected saved route before
  the established electrical invalidation path runs.

---

## 1.1.0-rc.21

This controller-truth release completes the public capability, language/API
and compiler-diagnostic reference without adding any compiler, runtime, SDK,
pin or peripheral behavior.

## Capability and compiler-diagnostic parity

- Controllers now lists GPIO, ADC, PWM, UART, timer and interrupt status for
  every public profile as tested, separate project model or unavailable.
- Each profile has an exact entry-file, source grammar, admitted-header and
  library boundary. Successful compilation is not presented as proof that an
  API, library or peripheral is simulated.
- AVR, Pico, ESP32-C3 and STM32 now show the same accessible Build diagnostics
  panel. A trustworthy current file/line result can focus the exact source
  position without changing source text.
- Empty, unknown, out-of-range, stale-source and cross-profile locations stay
  readable but cannot navigate. Internal paths and control characters are not
  exposed.
- Browser acceptance covers an actual failed source result, keyboard
  navigation, corrected source and fresh successful Build on all four public
  profiles. Existing file, wiring, Fullscreen and runtime contracts remain.

---

## 1.1.0-rc.20

This local-file parity release preserves the rc.19 guard, project envelope,
compiler and runtime boundaries while completing one optional desktop native
file workflow without weakening the reliable browser-download fallback.

## Desktop native file parity

- **Download copy** and ordinary file-input **Open project** remain the primary
  all-browser actions on AVR, Pico, ESP32-C3 and STM32.
- Secure desktop browsers that expose the File System Access API also show
  separately labelled **Open & connect**, **Save connected file** and **Save
  copy**. Unsupported browsers receive a truthful capability message.
- Handles remain in memory only and are never put in the common envelope,
  browser recovery, logs or a server request. Legacy input is never overwritten
  automatically.
- Native writes are serialized and bound to the exact profile and authored
  fingerprint. Cancellation, denial, stale picker return and write/close
  failure preserve the project and never establish a saved baseline.
- A native picker that never settles cannot block Download copy, ordinary Open,
  editing or the unsaved-change guard. No timeout creates a duplicate write.
- Chromium tests exercise a synthetic File System Access contract across all
  four profiles; Firefox and WebKit exercise the reliable fallback. This is not
  a claim that automation operated a real operating-system chooser.

---

## 1.1.0-rc.19

This file-safety release preserves the rc.18 controller, compiler, runtime,
project-envelope and visual contracts while preventing accidental replacement
of authored work.

## Unsaved-change guard

- AVR **New empty** and strictly validated same-profile **Open** now show one
  accessible in-app decision when name, source, parts, supported properties,
  topology, layout, rotation or wire styling differs from the clean baseline.
- Keep editing, Escape and backdrop cancellation preserve the exact draft,
  history, selected profile and runtime. Discard executes one validated action
  exactly once and uses the existing runtime-authority retirement path.
- Download copy requests the existing deterministic data-only download but
  stays in the dialog and does not claim that a browser or operating system
  completed a durable write.
- Invalid, oversized and cancelled input never prompts. Cross-family Open
  still validates before routing and parks the active draft without prompting.
  Repeated or stale pending actions cannot replace newer authored work.
- The interactive workbench is explicitly desktop-only for this release.
  Existing responsive styles remain, and controller/component/example/support
  information stays useful on smaller screens, but phone/tablet workbench
  navigation is not a supported release path.
- File guidance now matches the common envelope exactly: all four profiles
  request a `.intent-mcu.json` download, exact-profile routing is distinct from
  source portability, and older files have a preserve–inspect–save-copy–reopen
  recipe with Legacy copy reserved for rc.16 compatibility.

---

## 1.1.0-rc.18

This visual maintenance release keeps the rc.17 common project format and all
controller/runtime boundaries unchanged while making the rotated resistor's
part and terminal labels readable in every supported orientation.

## Rotated label clearance

- Pico, ESP32-C3 and STM32 resistor labels remain distinct at 0, 90, 180 and
  270 degrees on desktop, mobile and fullscreen canvases.
- Lead A and Lead B stay adjacent to their own named terminals. Save/Open,
  terminal attachment, body avoidance and WIRE-LANE-01 remain unchanged.

---

## 1.1.0-rc.17

This release gives all four accepted controller profiles one canonical local
project-file workflow without changing their compiler, runtime or circuit
capability boundaries.

## Common local project envelope

- AVR, RP2040 Pico, ESP32-C3 and STM32F429ZI now save
  `intent-mcu-project-envelope@1` files with an explicit exact profile and one
  strictly validated profile-owned authored project.
- Open validates detached data before switching profile, rejects profile/schema
  mismatch atomically and requires a fresh Build. Cross-profile Open parks the
  previous draft and never reinterprets it.
- Current legacy AVR, Pico, C3 and STM32 files migrate deterministically in
  memory and are never overwritten. Each workbench exposes a data-only
  **Legacy copy** for rc.16 rollback recovery.
- The envelope preserves source, stable parts and pins, supported controls and
  properties, topology, layout, rotation and wire styling. Executable bytes,
  runtime/session authority, verdicts and secrets are rejected before adapter
  normalization.
- Save requests the same deterministic download on every controller, including
  AVR browsers that expose an unusable native save picker. Actual downloads
  reopen in fresh pages on desktop and mobile; repeated Open remains canonical,
  creates no duplicates and leaves stale authority absent.

---

## 1.1.0-rc.16

This release gives all four accepted controller profiles one coherent AVR-style
workbench without expanding any compiler, runtime, pin or component claim.

## Fullscreen canvas parity

- Pico, ESP32-C3 and STM32 now expose the same discoverable Fullscreen canvas
  action as AVR, with an explicit Exit action and Escape support.
- Browsers with the Fullscreen API use it directly. If the API is unavailable
  or denied, the control truthfully falls back to a reversible full-viewport
  canvas focus mode rather than claiming native fullscreen.
- Fit, zoom, exact terminal attachment, body avoidance, label association and
  distinct wire lanes are revalidated after enter, resize and exit on desktop
  and mobile. Parts and Inspector return exactly as they were.
- Fullscreen is presentation-only: authored projects do not change and no
  stale build or runtime authority can reappear.

## Shared controller workflow and clear wire lanes

- ATmega328P, RP2040 Pico, ESP32-C3 and STM32F429ZI now use the same local
  project toolbar, Parts–Canvas–Inspector row, Firmware and Runtime drawers,
  persistent Build/Run controls and named Serial access.
- The bounded profiles retain their real existing editors and runtimes behind
  explicit adapters. Switching preserves authored drafts while retiring stale
  build/runtime authority.
- Unsupported Pause/Reset operations remain disabled with profile-specific
  QEMU or Renode reasons. No capability is inferred from the common layout.
- `WIRE-LANE-01` prevents distinct electrical nets from sharing a collinear
  visible path and reserves useful parallel clearance. Perpendicular crossings
  and explicit same-net junction trunks remain valid.
- Rendered desktop/mobile acceptance covers the dense AVR examples and all
  three bounded profiles, including movement, rotation, responsive rerouting,
  project files and fresh-build boundaries.

---

## 1.1.0-rc.14

This release adds one bounded, visible requirements-to-execution experiment
without expanding the AVR controller, compiler or peripheral claim.

## Thermostat boundary experiment

- The sixth AVR starter has exact A1 temperature-module, D2 active-low button
  and D13 → 220 Ω → LED indicator wiring.
- Three scenarios reset independently at virtual cycle 0 and observe only in
  the 160–350 ms virtual-time window. Executed D13 is primary evidence; UART
  and the ordered input log must also agree. Missing or late evidence fails.
- The correct `<` firmware passes below/enabled, equality/enabled and
  below/disabled. The visible known-bad `<=` variant produces a D13 HIGH / HEAT
  failure at equality while the other two scenarios pass.
- Save/Open contains authored data and compatibility-reference metadata, not
  executable bytes or verdicts. Open and every source change retire runtime
  authority until the visible source is built again.
- The temperature, button and LED remain ideal teaching models. No room,
  heater, thermal dynamics, sensor accuracy, contact bounce, physical hardware
  or safety-controller certification is claimed.

---

## 1.1.0-rc.13

This documentation and local-file verification release makes the three bounded
non-AVR profiles easier to learn and recover without changing their simulator,
compiler, runtime or electrical contracts.

## Controller guides and local files

- Pico, ESP32-C3 and STM32F429ZI each have a complete first-project guide with
  their exact named pins, one allowed source edit, the expected result and the
  requirement to Build again after Open.
- The supported-components and support pages now explain the fixed three-part
  profile catalog, stable IDs, supported file extensions and the history-free
  missing-part repair flow. Adding a part still creates no cable implicitly.
- Real Save/Open browser acceptance covers AVR, Pico, ESP32-C3 and STM32 on
  desktop and mobile. It deep-compares data-only source, layout, rotation,
  properties and wiring; repeated and cancelled Open stay stable; malformed,
  wrong-profile and unsupported-property files reject atomically.
- Public HTML documents remain crawlable, while health, readiness, API, JSON
  and error responses carry an explicit noindex response header.
- No project schema, account, cloud storage, hosted AI, controller, component,
  source grammar, compiler or runtime was added.

---

## 1.1.0-rc.12

This app-only release adds bounded recovery for the resistor and LED already
supported by the Pico, ESP32-C3 and STM32F429ZI teaching circuits. It does not
add a general parts library, controller, pin, source grammar or runtime.

## Shared bounded component recovery

- Each of the three non-AVR workbenches shows exactly its fixed controller,
  one axial resistor and one through-hole LED. The controller cannot be
  deleted, added or duplicated; unsupported and cross-profile types reject.
- After a resistor or LED is deleted and a local Save/Open removes Undo
  history, **Add missing part** restores the original stable component ID at a
  deterministic safe position. It never infers a cable: the learner reconnects
  the exact named pins and receives the existing electrical validation.
- Recovery itself participates in bounded Undo/Redo. A duplicate recovery is
  rejected, and every accepted part/property/topology edit retires stale
  executable and runtime authority until a fresh successful Build.
- Resistance and LED colour expose only the existing ideal model properties.
  The selected pair must remain within 3.3 V / 12 mA validation. Colour chooses
  one tested forward-voltage constant and makes no wavelength, brightness,
  package-tolerance or physical-accuracy claim.
- Desktop and 390 px browser acceptance verifies both recovery branches,
  Save/Open history loss, no inferred nets, exact terminal attachment, body
  avoidance and all four rotations. Fresh compiler-generated firmware then
  runs through rp2040js, actual ESP32-C3 QEMU CPU/UART, and actual STM32 Renode.
- The ESP32-C3 executed-register-write GPIO2 model now admits the same exact
  tested resistor/forward-voltage pairs as its public circuit validator; QEMU
  pin state remains explicitly unobserved and no provenance claim changed.
- AVR, project schemas, source grammars, fixed image identities, Caddy, DNS and
  unrelated services remain outside this app-only change.

---

## 1.1.0-rc.11

This app-only release adds direct named-pin cable creation and endpoint
reconnection to the three bounded non-AVR teaching circuits while preserving
their accepted compiler and runtime contracts.

## Shared bounded wire authoring

- Pico, ESP32-C3 and STM32F429ZI now share one transactional wire-authoring
  state machine for their existing controller → 220 Ω resistor → LED →
  ground graphs. It does not add components, pins, peripherals or source
  grammar.
- Select a free named pin and then a compatible free destination to create a
  cable. Select an existing cable, choose **Reconnect endpoint**, explicitly
  choose the endpoint to move, and then choose its compatible free target.
- Pending selections are visible and cancellable with the button or Escape.
  Unknown, self, occupied and unsupported endpoints reject atomically without
  changing topology or history.
- Created and reconnected cables retain the established stable net IDs.
  Delete, recreate, reconnect, Undo and Redo no longer require Restore Example
  or hand-edited JSON.
- Starting a wire operation retires any executable, runtime and LED authority
  and disables Build until the operation is finished or cancelled. Every
  accepted topology change and every local Open still requires a fresh Build.
- Data-only Save/Open retains the authored endpoint pairs. Desktop and mobile
  browser acceptance verifies exact rendered-terminal attachment and
  component-body avoidance after movement, all quarter turns, Fit and resize.
- The original Pico artwork now places GND on the correct physical pin 3 row;
  its GP0 and GND pointer targets no longer overlap.
- Actual AVR execution, Pico UF2/rp2040js, ESP32-C3 QEMU CPU/UART and STM32
  Renode PB0/USART3/reset replay remain unchanged and were regression-tested.

---

## 1.1.0-rc.10

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
