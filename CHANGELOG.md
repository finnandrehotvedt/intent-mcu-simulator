# Changelog

All notable public source changes are recorded here.

## 1.1.0-rc.44 — 2026-10-18

- Completed X18 for the existing AVR thermostat paths with one shared academic
  outcome contract: passed, failed, indeterminate and unsupported.
- Reserved failed for complete producer evidence that contradicts a supported
  assertion. Missing inputs/pins/Serial, dropped evidence and out-of-window
  captures are indeterminate and can never pass.
- Exposed job status separately as completed, not-started, cancelled, timeout
  or infrastructure-error across browser, external-client and headless results,
  while preserving raw evidence and source/artifact identity.
- Reused X11 and X17 contracts; no generic assertion language or X19 reporting
  was added.

## 1.1.0-rc.43 — 2026-10-18

- Added X17's bounded AVR thermostat scenario timeline editor with ordered
  ideal-temperature/button inputs and one explicit D13 observation window.
- Advanced the common data-only envelope to version 6; results, actual capture
  times, runtime state and executable authority remain excluded.
- Reused the same validated timeline and evaluator in browser and headless
  execution, including an intentionally wrong expectation caught by both.
- Preserved correct and known-bad M1 regression behaviour; no X18 general
  assertion language or X19 reporting was added.

## 1.1.0-rc.42 — 2026-10-18

- Completed X12 by treating each existing bounded stdio action request as an
  ephemeral in-memory job whose request ID and existing expiry timestamp are
  its handle and deletion deadline.
- Added strict read/export controls outside the seven-action set. Evidence is
  data only, carries request/profile/generation/source/result association and
  cannot restore runtime, verdict, project or Apply authority.
- Proved actual active test cancellation, no late success, a fresh successful
  rerun, pre-expiry export and real short-TTL cleanup. Deterministic fixture
  clock evidence and separately retained compiler cache are labelled exactly.

## 1.1.0-rc.41 — 2026-10-18

- Completed X11 with one stable stdio result envelope that distinguishes
  validation failure, unsupported capability, temporary busy, timeout,
  cancellation, producer-backed test failure and other execution failure.
- Preserved the unchanged authoritative router result and bound each outcome
  to request, action, profile, generation and public source identity. Only
  temporary busy recommends a bounded delayed retry with a fresh request ID.
- Split timeout from cancellation in the existing bounded router and proved
  every category in a separate deterministic fixture process. The known-bad
  thermostat result uses the existing observation evaluator. An integrated
  external-client acceptance compiles and runs both the correct and known-bad
  equality firmware through the actual three-scenario AVR path, associates
  each verdict with its source/artifact identity, and observes only the known-
  bad equality scenario fail with D13 HIGH. Controlled busy/timeout output is
  explicitly labelled fixture evidence, not production runtime observation.

## 1.1.0-rc.40 — 2026-10-18

- Completed X10 with a strict read-only capability-discovery request on the
  existing optional local stdio adapter. It exposes all four exact profiles,
  named pins, API/runtime boundaries, 19 part models, support cells, quotas,
  schemas, release version and source identity from canonical authorities.
- Discovery adds no eighth action and no Apply, generic command, listener,
  public endpoint, account, credential, persistence or topology authority.
  Unsupported discovery versions and added fields reject before execution.
- A separate client acceptance proves discovery followed by one discovered
  supported action, while unavailable Pico ADC, an unsupported discovery
  version and an invented action all fail closed.

## 1.1.0-rc.39 — 2026-10-18

- Added an optional local stdio external-client adapter as a separate process
  over exactly the seven existing bounded action contracts and X07 shared
  engine. The production origin is fixed; test override is loopback-only.
- The client has no Apply, shell, eval, generic-command, account, credential,
  listener, public API, server-project or infrastructure authority. Data-only
  patch proposals still require separate visible browser review and Apply.
- Added a genuinely separate stdio client example, strict transport/cancel
  parser tests and integrated actual compiler/runtime acceptance. Deterministic
  prompt/validation/export bytes compare exactly with the UI path; runtime
  cycles remain observations and are not normalized into false equality.
- The AVR Run action now waits for a source-bound positive worker-cycle
  observation instead of accepting the worker's initial cycle-zero state.

## 1.1.0-rc.38 — 2026-10-18

- Completed X08 with seven separate generation-bound local action contracts:
  create, propose, validate, Build, Run, read and export.
- Each action delegates to the existing UI implementation and exact X07
  project/electrical engine, compiler/runtime lifecycle and source-bound
  evidence rules; there is no generic command or external agent endpoint.
- Strict payloads, profile/generation matching, 30-second maximum TTL, replay
  rejection, one active request, cancellation and bounded results prevent a
  content-controlled or weaker agent shortcut.
- The integrated action journey creates the thermostat starter, generates a
  local patch prompt, validates, compiles, runs, reads current evidence and
  exports the exact common envelope without an account or durable server data.

## 1.1.0-rc.37 — 2026-10-18

- Completed X07 with one strict domain engine shared by the visible UI and a
  bounded local programmatic agent adapter.
- Both paths use the same common-project parsing, profile electrical admission
  and existing thermostat observation evaluator; caller identity is provenance
  only and cannot weaken validation.
- The actual AVR thermostat journey now obtains all three scenario verdicts
  through that engine, while executed D13 remains primary evidence and Serial
  cannot pass alone.
- The adapter has no network, mutation, persistence, Build or Run authority;
  project content remains data and cannot supply instructions.

## 1.1.0-rc.36 — 2026-10-18

- Completed X06 with a side-by-side current/proposed design comparison across
  all four public profiles after strict X05 review.
- Requires byte-equivalent normalized project briefs so both alternatives are
  compared against the same acceptance criteria, questions and required
  capabilities; stale or requirement-drifted candidates reject.
- Shows source/component/wire counts and differences, the existing X04
  capability states and the active profile's documented controller-model limit.
- Produces no score, recommendation, winner, runtime evidence, verdict or Build
  authority and changes no project data during comparison.

## 1.1.0-rc.35 — 2026-10-18

- Completed X05 with a local description-to-prompt bridge and strict
  `intent-mcu-project-patch@1` proposals across all four public profiles.
- Shows every proposed source-file, component and wire addition, removal or
  change before an explicit Apply; review itself never mutates the project.
- Binds review and Apply to the exact canonical base hash, rejects stale,
  malformed, unsupported and authority-bearing input, and applies through the
  existing validated common-project boundary as one fresh-Build-required edit.
- Makes no live AI request and grants no support, Build, runtime or verdict
  authority from a description or pasted project patch.

## 1.1.0-rc.34 — 2026-10-18

- Completed X04 with project-specific preflight for explicitly required
  peripherals and components before Build.
- Distinguishes available, unsupported, unknown and unresolved using only the
  existing controller-capability and component-support authorities.
- Advanced common files to envelope v5 / brief v4; rc.33 files migrate with
  empty required capabilities while preserving all X01–X03 data.
- Preflight remains data-only and cannot infer firmware support, block or
  authorize Build, execute code or create a verdict.

## 1.1.0-rc.33 — 2026-10-18

- Completed X03 with explicit unresolved voltage, pin, timing and other
  clarification questions across all four public profiles.
- Advanced the strict common file to `intent-mcu-project-envelope@4` and the
  inert brief to `intent-mcu-project-brief@3`; rc.32 files migrate with an
  empty unresolved-question list.
- Added unresolved questions to the portable Prompt Bridge while explicitly
  prohibiting inferred support; no live AI or third-party request was added.
- Preserved X01/X02 data-only context, transient verdict-free result links,
  all bounded runtimes and exact controller/model limitations.

## 1.1.0-rc.32 — 2026-10-18

- Completed X02 with visible per-requirement code, test and current-result
  traceability across all four existing public profiles.
- Advanced the strict common local file to `intent-mcu-project-envelope@3`
  and the inert brief to `intent-mcu-project-brief@2`; rc.31 v2 files migrate
  with explicit empty code/test references.
- Kept current-result links transient, producer-backed and verdict-free. They
  are never serialized and become `Untested` on Open or runtime invalidation.
- Preserved X01 data-only project context, profile runtimes, electrical rules,
  compiler isolation and the X29/X40 timebase limitations.

## 1.1.0-rc.31 — 2026-10-18

- Completed X01 with a shared per-profile project brief for purpose, inputs,
  outputs, boundary cases and stable-ID acceptance criteria.
- Advanced the strict common local file to `intent-mcu-project-envelope@2` and
  retained deterministic v1/legacy migration with an explicit empty brief.
- Kept all brief text inert and every criterion visibly `Not evaluated`; no
  source, circuit, build, runtime or test-result authority was added.
- Preserved rc.30 runtime-trace truth boundaries and all four bounded profile
  compiler, electrical and Save/Open paths.

## 1.1.0-rc.30 — 2026-10-18

- Completed I03 with one shared source-bound runtime trace viewer, channel
  selection, explicit timebase, bounded retention, generation and artifact
  provenance.
- Published actual avr8js D0–D13 and rp2040js GPIO0 worker transitions.
- Kept ESP32-C3 GPIO2 as a separately labelled project-model epoch sequence,
  never QEMU CPU GPIO, and exposed only Renode's actual final PB0 observation
  without inventing a timed STM32 waveform.
- Preserved W06/W07/W08/W10 behavior, data-only files and four bounded profile
  limits.

## 1.1.0-rc.29 — 2026-10-18

- Completed W10 for every electrical fault representable by the four bounded
  public profiles, including named-rail shorts, known opposing outputs,
  declared supply-role mismatch, ground, polarity, resistance and ideal-model
  LED overcurrent.
- Added stable corrective actions and explicit model-boundary text while
  retaining atomic unsafe-edit rejection and data-only Save/Open.
- Kept arbitrary rail mixing, cross-controller wiring, physical damage
  prediction and general circuit solving explicitly unavailable.
- Preserved W06/W07/W08 graph, history, placement and duplication behavior.

## 1.1.0-rc.28 — 2026-10-18

- Completed W08 for AVR projects with click and drag placement, pointer and
  keyboard movement, rotation, deletion and disconnected duplication with a
  fresh stable ID.
- Preserved every existing component, net, endpoint, junction and route while
  new and duplicated parts remain disconnected until the learner wires them.
- Added complete Undo/Redo and data-only Download/Open acceptance for all W08
  edits, including atomic rejection and stale-runtime invalidation.
- Added visible named endpoint buttons for automatic branch routes so an exact
  SVG branch can be selected reproducibly before reconnect or branch deletion.
- Kept Pico, ESP32-C3 and STM32 fixed-profile placement and duplication limits
  explicit and unchanged.

## 1.1.0-rc.27 — 2026-10-18

- Completed W06 with exact AVR branch selection, candidate-v3 branch endpoint
  reconnect, branch-only deletion and separately labelled whole-net deletion.
- Completed W07 by accepting each graph authoring operation as one complete-
  document Undo/Redo transaction. Invalid, unsafe, stale and conflicting
  reconnects leave project, revision and history unchanged.
- Added source and real Chromium acceptance for candidate reconnect, branch
  delete, whole-net delete, Undo/Redo and Download/Open while preserving named-
  pin attachment, explicit junctions, WIRE-LANE-01 and runtime invalidation.
- Kept Pico, ESP32-C3 and STM32 fixed two-endpoint profiles truthful: they keep
  their existing reconnect/delete/history paths and do not claim branches.

## 1.1.0-rc.26 — 2026-10-17

- Added exactly eight public AVR reference starters for the rc.25 available
  models that had tracked tests but no starter: explicit ground reference,
  SPST, SPDT, analogue light, digital light threshold, active buzzer,
  seven-segment display and quadrature encoder.
- Every new card states Learn, Try, Observe and Limits, enters through the
  existing candidate-v3 validator and loads authored data only. A fresh
  isolated AVR Build is required before the existing worker may Run.
- Bound all 25 available component/profile cells to public starters. The 51
  unavailable cells, all component status values and every narrow-profile
  limit remain unchanged.
- Added one integrated eight-starter browser acceptance with actual compiled
  GPIO, ADC, Serial, display and ordered encoder observations. Existing
  model-specific power, polarity, resistance, pin and topology negatives stay
  fail-closed.
- Kept SPDT and active buzzer Partial. The buzzer remains a silent logical
  indicator with no sound, current or acoustic-accuracy claim.

## 1.1.0-rc.25 — 2026-10-17

- Added one executable 19-model by 4-profile compatibility contract derived
  from the actual public catalogues: 76 exact cells, 25 available and 51
  unavailable, with project-mode and limitation truth retained per cell.
- Added an accessible in-workbench matrix and a crawlable documentation table.
  AVR distinguishes the 5 ordinary project-v2 parts from 16 candidate-v3
  parts; every narrow profile remains fixed to its controller, resistor and LED.
- Added targeted positive and fail-closed rotary-encoder coverage for exact
  D2/D3/ground wiring, ordered CW/CCW worker sequences, wrong phase pins and
  invalid common-pin topology including powered COM.
- Kept public reference coverage explicit: all available cells have tracked
  tests, while 8 AVR candidate models still lack public starter projects.
  No compiler, runtime, project schema or component capability was expanded.

## 1.1.0-rc.24 — 2026-10-17

- Added one second validated AVR PWM lesson and paired on/off UART lessons for
  each bounded Pico, ESP32-C3 and STM32 profile.
- Added an explicit machine-readable U03 coverage matrix. Every supported
  button, ADC, PWM or Serial cell has multiple example IDs; unavailable cells
  remain empty and explicit.
- Added visible profile-local example cards with Learn, Try, Observe and Limits
  copy. Every card loads through the existing strict project/source/circuit
  validators and requires a fresh Build before Run.
- Protected example switching with the existing Keep, Download copy and
  Discard unsaved-change decision. No example restores executable authority.
- Added unit and rendered browser acceptance, including actual fresh Build/Run
  proof for all seven new lessons and exact expected LED, PWM and UART results.

## 1.1.0-rc.23 — 2026-10-17

- Unified the AVR, Pico, ESP32-C3 and STM32 circuit canvases on the same dark
  navy workbench background and 22 px grid while retaining each profile's real
  component graphics, named pins, wire geometry and controls.
- Removed a proven positive-length shared lane between two distinct automatic
  AVR Blink nets. Later automatic routes now treat already accepted interior
  lanes as narrow obstacles; user-authored routes remain untouched.
- Added browser acceptance for exact four-profile canvas-theme parity, readable
  narrow-profile labels, pointer selection and Add-bend on the common Pico
  cable, and zero distinct-net collinear overlap in the AVR Blink example.
- Clarified public cable-routing help: crossings remain separate, distinct nets
  cannot share a positive-length lane, and this release does not add branch or
  junction authoring.

## 1.1.0-rc.22 — 2026-10-17

- Added bounded orthogonal bend and interior-segment editing to the Pico,
  ESP32-C3 and STM32 cable canvases, with snapped movement, keyboard-selectable
  sections and Escape cancellation.
- Added six fixed cable colours. Colour and route geometry are layout-only:
  they do not alter topology, electrical acceptance, source or executable
  authority, and each accepted edit has one exact Undo/Redo transaction.
- Made crossings visibly separate from declared junctions and enforced
  WIRE-LANE-01 after every accepted route edit. Diagonal, body-intersecting,
  duplicate, malformed and unresolved overlapping routes reject atomically.
- Extended the existing common project envelope so narrow-profile route
  geometry and colour survive Download/Open. Older files migrate
  deterministically to automatic routing without gaining executable authority.
- Added all-three narrow-profile rendered acceptance for bend, movement,
  colour, rejection, Escape, Undo/Redo and repeated file round trips while
  preserving the established AVR route-authoring workflow.

## 1.1.0-rc.21 — 2026-10-17

- Added one exact GPIO, ADC, PWM, UART, timer and interrupt capability matrix
  for all four public profiles, with tested, project-model and unavailable
  boundaries kept distinct.
- Documented each profile's actual language grammar, entry file, admitted
  headers and library boundary without expanding its compiler, runtime or SDK.
- Added shared accessible Build diagnostics panels. Current trustworthy
  file/line results navigate to the correct editor position; missing,
  out-of-range, stale and cross-profile locations remain readable but inert.
- Bound diagnostic navigation to the exact profile, source revision and file.
  Editing, Open, profile changes and newer builds retire stale navigation.
- Added all-profile bad-source → navigate → correct → fresh-Build browser
  acceptance while preserving local files, wiring and runtime boundaries.

## 1.1.0-rc.20 — 2026-10-17

- Kept deterministic **Download copy** and file-input **Open project** as the
  primary all-browser local-file path on all four accepted profiles.
- Added separately labelled optional **Open & connect**, **Save connected
  file** and **Save copy** actions when a secure desktop browser exposes the
  native File System Access API.
- Kept file handles in memory only and bound writes to the exact profile and
  authored fingerprint. New, profile changes, stale pickers, cancellation,
  permission denial and incomplete write/close never claim a successful save.
- Preserved the rc.17 regression lock: even a present native picker whose
  promise never settles cannot consume or delay the primary Download action.
- Added four-profile synthetic native-contract acceptance in Chromium and
  all-profile fallback acceptance in Chromium, Firefox and WebKit. Automated
  tests do not claim that they operated a real OS chooser.

## 1.1.0-rc.19 — 2026-10-17

- Added one accessible unsaved-change guard for destructive AVR New and valid
  same-profile Open across AVR, Pico, ESP32-C3 and STM32F429ZI.
- Added Keep, Escape/backdrop, data-only Download copy and explicit Discard
  outcomes without treating a requested download as a confirmed durable save.
- Serialized pending actions and bound them to the exact authored draft so a
  repeated or stale Open cannot discard newer work or execute twice.
- Added all-profile desktop browser acceptance for name, source,
  properties, layout, rotation and wire styling, exact paused-runtime
  preservation, focus restoration, invalid/cancelled input and cross-family
  parking.
- Declared the interactive workbench desktop-only while retaining existing
  responsive styles and useful crawlable information pages for smaller screens;
  phone/tablet workbench navigation is no longer a release acceptance gate.

## 1.1.0-rc.18 — 2026-10-17

- Prevented rotated resistor part labels from colliding with Lead A or Lead B
  at 0/90/180/270 degrees on desktop, mobile and fullscreen canvases.
- Added saved/reopened all-rotation browser acceptance across Pico, ESP32-C3
  and STM32 while preserving terminal attachment and WIRE-LANE-01.

## 1.1.0-rc.17 — 2026-10-17

- Added one strict `intent-mcu-project-envelope@1` Save/Open format for AVR,
  Pico, ESP32-C3 and STM32F429ZI with exact profile identity and existing
  profile validators behind a common coordinator.
- Added detached cross-profile validation and atomic routing. Malformed,
  oversized, unknown, profile-mismatched, unsupported and executable-bearing
  files leave the active profile and draft unchanged.
- Added deterministic in-memory migration for accepted legacy schemas, kept
  lossy AVR v1 migration explicit and added per-profile **Legacy copy** exports
  so rc.17-created work can be recovered after an rc.16 rollback.
- Added all-four actual-download/fresh-page Open, canonical byte stability,
  repeated Open, cross-family parking, raw-authority, legacy thermostat and
  desktop/mobile acceptance while preserving WIRE-LANE-01 and Fullscreen.
- Standardized AVR Save on the same immediate deterministic download as Pico,
  C3 and STM32 so a present-but-unusable native picker cannot swallow Save.

## 1.1.0-rc.16 — 2026-10-17

- Added explicit Fullscreen/Exit controls to the Pico, ESP32-C3 and STM32
  canvases, using native browser fullscreen where available and a labelled,
  reversible full-viewport focus fallback otherwise.
- Preserved Fit/zoom, terminal attachment, body avoidance, labels, wire lanes,
  parked data, Parts/Inspector visibility and stale-authority retirement
  through fullscreen enter, resize and exit on desktop and mobile.
- Mounted all four accepted controller implementations in one shared AVR-style
  project, Parts, Canvas, Inspector, Firmware, Runtime and Serial workflow.
- Preserved each profile's existing file schema, compiler/runtime boundary,
  parked draft and fresh-build rules through controller switching.
- Added truthful capability reasons for controls unavailable in QEMU or Renode.
- Added `WIRE-LANE-01`, deterministic lane separation and rendered checks so
  distinct nets cannot lie collinearly on top of one another; crossings and
  explicit same-net trunks remain distinct and valid.

## 1.1.0-rc.14 — 2026-10-17

- Added one bounded AVR thermostat experiment with exact A1 temperature,
  active-low D2 enable and current-limited D13 indicator wiring.
- Added three reset-isolated virtual-time scenarios. A pass requires executed
  D13, matching UART text and a complete ordered input log between 160 and
  350 virtual milliseconds; wall-clock speed has no verdict authority.
- Added a visible known-bad `<=` firmware variant that fails only the 30 °C
  equality scenario from observed executed output while both control scenarios
  remain green.
- Kept local Save/Open data-only and required a fresh source-bound Build.
  Correct and known-bad source produce distinct input and artifact identities;
  compatibility-fixture metadata cannot start or select a runtime.
- Added desktop/mobile browser acceptance for exact cable attachment, 3/3
  correct results, known-bad detection, local Save/Open, fresh Build, no
  third-party requests, no cookies and no horizontal overflow.

## 1.1.0-rc.13 — 2026-10-17

- Added complete first-project guides for the bounded Pico, ESP32-C3 and
  STM32F429ZI profiles, including exact named-pin wiring, allowed source edits,
  expected results and the local-file boundary.
- Documented the three-part narrow-profile catalog, stable part IDs and the
  history-free repair workflow after Open. Recovery still never infers a wire
  and a fresh Build remains mandatory.
- Added all-profile browser acceptance for real local Save/Open files,
  data-only deep comparison, repeated and cancelled Open, and atomic rejection
  of malformed, wrong-profile and unsupported-property files on desktop and
  mobile.
- Limited crawlable response headers to the six public HTML documents. Health,
  readiness, API, JSON and error responses now explicitly remain noindex.
- Preserved all accepted controller, compiler, runtime, project-schema,
  electrical and no-cloud-storage boundaries.

## 1.1.0-rc.12 — 2026-10-17

- Added one profile-filtered three-part recovery catalogue to the existing
  Pico, ESP32-C3 and STM32F429ZI workbenches: the fixed controller plus the
  already-supported resistor and LED only.
- A deleted resistor or LED can now be restored after local Save/Open has
  deliberately discarded Undo history. Recovery keeps the stable component
  ID, adds no cable implicitly, and requires explicit named-pin reconnection.
- Protected fixed controllers and rejected duplicate, unknown and
  cross-profile parts atomically.
- Added bounded resistance and LED-colour editing against the existing exact
  ideal electrical model. Unsafe combinations reject without changing the
  circuit; colour is not presented as a wavelength, brightness or physical
  accuracy claim.
- Kept every part/property/topology edit coupled to executable-authority
  retirement and a fresh Build. Actual Pico, QEMU and Renode Run journeys pass
  after component recovery.
- Added desktop/mobile browser coverage for history-free recovery, filters,
  property limits, Undo/Redo, all quarter turns, exact pin attachment and
  component-body avoidance. Shifted the default STM32 resistor slightly right
  so its recovered mobile route has a clear body-avoiding channel.
- Preserved all controller/source grammars, stable pins/nets, project formats,
  provenance labels and the accepted AVR path. No component family, runtime,
  account, cloud store or hosted AI capability was added.

## 1.1.0-rc.11 — 2026-10-17

- Added one shared, bounded named-pin wire-authoring state machine to the
  public Pico, ESP32-C3 and STM32F429ZI teaching circuits.
- Users can now delete and recreate a cable by selecting two compatible free
  named pins, or select a cable and explicitly reconnect one endpoint, without
  editing JSON or restoring the example.
- Added visible pending/cancel states, Escape cancellation, keyboard pin
  activation, stable net IDs, atomic rejection of unknown, self, occupied and
  unsupported endpoints, and exact Undo/Redo behavior.
- Made every in-progress wire action retire executable, runtime and LED
  authority and block Build until the action is finished or cancelled; a fresh
  Build remains required after topology changes and local Open.
- Preserved authored topology through data-only Save/Open and verified exact
  terminal attachment and component-body avoidance after movement, rotation,
  Fit, resize and mobile layout.
- Corrected the Pico GND terminal to the physical pin 3 row and separated its
  pointer target from GP0 without changing the bounded electrical contract.
- Preserved actual AVR, Pico, QEMU and Renode Build/Run paths and all existing
  controller, compiler/runtime, Caddy, DNS and unrelated-service boundaries.

## 1.1.0-rc.10 — 2026-10-17

- Replaced the fixed STM32F429ZI PB0 teaching illustration with an original
  editable named-pin canvas using PB0 CN11 pin 34 and GND CN11 pin 35.
- Added part and cable selection, pointer and keyboard movement, quarter-turn
  rotation, Delete, bounded Undo/Redo, zoom, Fit and responsive rerouting by
  reusing the accepted project-owned named-series-LED editor behavior.
- Made every source/circuit/Open change retire stale ELF, runtime and LED
  authority; invalid wiring blocks Build until restored and rebuilt.
- Added desktop/mobile terminal-attachment, body-avoidance, all-rotation,
  resize, local data-only Save/Open and actual Renode HIGH/LOW/Reset acceptance.
- Preserved source-only STM32 project-v1 import while saving new project-v2
  circuit data without executable authority.

## 1.1.0-rc.9 — 2026-10-17

- Replaced the fixed ESP32-C3 GPIO2 circuit illustration with an original
  editable named-pin canvas using J1 physical pin 4 and J1 physical pin 6.
- Added selection, drag and keyboard move, quarter-turn rotation, Delete,
  bounded Undo/Redo, zoom, Fit and responsive deterministic rerouting by
  reusing the accepted project-owned Pico editor behavior.
- Made every source/circuit/Open change retire stale flash, runtime and LED
  authority; invalid wiring blocks Build until restored and a fresh Build is
  completed.
- Added desktop/mobile terminal-attachment, body-avoidance, all-rotation,
  resize, local data-only Save/Open and actual QEMU HIGH/LOW/INPUT acceptance.
- Preserved the explicit boundary between actual QEMU CPU/UART execution and
  the separate project-owned executed-register-write GPIO2/LED model.

## 1.1.0-rc.8 — 2026-10-17

- Fixed rotated Pico resistor routing so Lead A/B wires terminate at the actual
  rendered SVG terminals and approach through preserved outward doglegs.
- Made route acceptance reject every non-terminal segment that crosses any
  component body, including endpoint-owner bodies.
- Added quarter-turn, Delete/Undo/Redo, Fit, resize, mobile and actual-terminal
  browser geometry coverage, plus non-overlapping readable pin-label checks.
- Kept the release app-only and preserved every accepted compiler/runtime,
  project format, Caddy, DNS and unrelated service boundary.

## 1.1.0-rc.7 — 2026-10-17

- Replaced the fixed Pico illustration with an original editable circuit
  canvas using named GP0 physical pin 1 and GND physical pin 3 anchors.
- Added part and cable selection, drag and keyboard movement, 90-degree
  rotation, Delete, bounded Undo/Redo, zoom and Fit with responsive rerouting.
- Added deterministic orthogonal wire attachment and foreign-component body
  avoidance after movement, rotation, zoom and viewport resize.
- Kept circuit and source Save/Open data-only, made topology edits retire stale
  executable authority, and required a fresh isolated build before Run.
- Preserved the accepted AVR, Pico compiler/runtime, ESP32-C3 and STM32F429ZI
  paths while correcting stale STM32 roadmap and Schema.org README wording.

## 1.1.0-rc.6 — 2026-10-16

- Added one bounded public STM32F429ZI C11 profile with fixed Arm GNU 14.3.1
  compilation, strict source-bound ELF32 admission and actual Renode 1.17.0
  PB0/USART3 execution across reset replay.
- Added an original named-pin controller drawing and body-avoiding PB0 → 220 Ω
  → LED → GND teaching circuit, explicitly separated from physical and analogue
  hardware claims.
- Added data-only Save/Open, fresh-build enforcement, stale authority
  invalidation, Stop/discard and fresh-process Reset semantics.
- Added exact image locks, networkless disposable compiler/runtime jobs,
  zero server retention, strict origin/request bounds, desktop/mobile browser
  acceptance and preserved AVR/Pico/C3 regression checks.

## 1.1.0-rc.5 — 2026-10-16

- Added one bounded public ESP32-C3 sketch profile with fixed Arduino-ESP32
  3.3.10 / esp-rv32 2601 compilation and actual Espressif QEMU esp32c3
  CPU/UART execution.
- Added a separately labelled project-owned GPIO2 register and LED model fed
  by actual executed MMIO stores; the API and UI explicitly report that QEMU
  pin state is not observed.
- Added strict flash reconstruction, source/artifact identity, two-boot UART,
  circuit, admission, capability, timeout and disposable-container checks.
- Added local data-only C3 Save/Open and responsive desktop/mobile source,
  circuit and evidence panels without changing the accepted AVR/Pico paths.
- Fixed cross-schema starter replacement after the temperature/LCD candidate,
  hid the parked AVR canvas while another controller is active, and raised the
  bounded AVR/Pico compiler deadline to 30 seconds after observed cold-worker
  intermittency.
- Fixed portable Prompt Bridge generation for the validated temperature/LCD
  runtime projection and made unsupported candidate-specific apply fail
  explicitly instead of raising a browser exception.
- Removed optional inline JSON-LD after live verification showed the unchanged
  ingress CSP still authorized only the prior release's metadata hash. The
  application now needs no inline-script exception.

## 1.1.0-rc.4 — 2026-10-16

- Added one bounded public RP2040 Pico source profile with fixed isolated Arm
  compilation, strict source-bound UF2 validation, and rp2040js GPIO0/UART0
  browser-worker execution.
- Added an original Pico circuit view with named GP0 pin 1 and GND pin 3
  anchors, 220 Ω current limiting, external LED state and separate GPIO25
  onboard-LED semantics.
- Closed the visual LED-cathode/GND gap across desktop and mobile geometry,
  moved the 220 Ω text clear of the resistor bands, and clarified exact-template
  source-policy errors.
- Added local data-only Pico Save/Open and fail-closed artifact invalidation
  across editing, disconnect, Stop, project Open and profile changes.
- Expanded the desktop workbench to small viewport gutters while preserving
  responsive controls and zero horizontal overflow. Parts/Inspector collapse
  states and the Serial dock now preserve the full remaining canvas width.
- Kept ESP32-C3 and STM32F429ZI as non-executable public previews.

## 1.1.0-rc.3 — 2026-10-16

- Refresh the three non-executable controller previews with the accepted,
  bounded private evidence while keeping AVR as the only public Build/Run
  profile.
- Preserve the tested 16-part AVR catalogue, mobile controls, local Save/Open,
  named-wire editor, examples, Prompt Bridge validation and crawlable support
  pages from rc.2.
- Keep all private compiler/runtime routes, firmware inputs and executable
  artifacts out of the public source and public server.

## 1.1.0-rc.2 — 2026-10-16

- Added one public controller capability surface with a supported AVR profile
  and clearly labelled, non-executable ESP32-C3, RP2040 Pico, and STM32F429ZI
  evidence previews.
- Parked the AVR project and disabled project Open, Build, Run, firmware,
  Prompt Bridge, and runtime surfaces whenever a preview profile is selected.
- Removed the optional ESP32-C3 broker mount from the public server entry point
  and made attempts to enable it fail closed.
- Updated public metadata, controller documentation, compatibility truth, and
  machine-readable discovery copy to distinguish private evidence from public
  availability.
- Added desktop/mobile browser acceptance for all four selector states, zero
  private/third-party requests, no runtime-worker creation, and no horizontal
  overflow.

## 1.1.0-rc.1 — 2026-10-15

- Added account-free Save/Open project files. Supporting browsers use a native
  user-selected file handle; other browsers use deterministic download and
  file-input fallback. Browser recovery remains a separately labelled crash-
  recovery aid, and no project/source is stored by the server.
- Added three-engine coverage for native save/open, fallback round-trip,
  cancellation, invalid-file atomicity, 1440/768/390/320 layouts and zero
  server-side project mutation requests.

- Added 11 original tested component modules to the five-part foundation for
  16 selectable components, including contacts, sensors, RGB and seven-segment
  outputs, a 16×2 LCD, an active buzzer, and a quadrature encoder.
- Added a fifth validated Temperature display starter and made all starter
  cards keyboard reachable at desktop and 320/390 px mobile widths.
- Added crawlable controller, component, example and support pages with exact
  public capability boundaries, canonical links, robots, sitemap and factual
  machine-readable context.
- Reflowed the sticky mobile Workbench controls so Build, Run, Pause and Reset
  remain visible without horizontal toolbar scrolling or Serial-dock overlap.

- Replaced split/stale component and wire selection with one authoritative
  selection state, so Delete targets only the selected component, connection,
  or branch; whole-net deletion remains explicit and independently undoable.
- Added deterministic overlap cycling, direct generous wire hit targets,
  axis-locked route movement, and safer default signal/GND geometry that leaves
  each pin outward and avoids component-body re-entry.
- Added a responsive, resizable Serial side dock/bottom drawer with unread and
  autoscroll handling, plus Select/Interact modes and real canvas tactile-button
  press/hold/release through the existing worker.
- Prevented repeated route-section edits from accumulating self-overlapping
  rectangular laps. Existing custom routes are not silently reset on load;
  only provably redundant geometry on the edited branch is simplified.
- Kept every accepted and live-proposal wire visibly painted from its exact
  named terminal above opaque component artwork. Default branched routes still
  detour around component bodies independently; visibility does not create a
  junction or weaken electrical/body-avoidance validation.
- Verified a practical collapsed-panel testing view where the circuit, live
  input, persistent runtime controls and readable Serial output remain visible
  together at desktop and effective 125%-zoom widths.
- ESP32-C3 remains a private compile-only proof and is disabled on the public
  host. RP2040 and STM32 remain unavailable; no board artwork is treated as an
  execution claim.

## 1.0.0-rc.2 — 2026-10-07

- Completed the release-candidate acceptance surface and deployed the exact
  accepted `1.0.0-rc.2` source/image to the public lab under the distinct
  deployment receipt on 2026-10-07.
- Added distinct operating-supply and declared pin-voltage catalogue facets,
  combined-filter coverage over real and 1,000-record fixture catalogues, and
  actionable empty-result recovery.
- Added release, migration, rollback, candidate-identity and final acceptance
  documentation. The public deployment retains the exact `0.9.0` recovery
  snapshot and passed Chromium, Firefox and WebKit compile/run and wire-route
  acceptance.
- Added tested supervisor recovery for a transient completion-contract
  fail-closed gate without resetting completed milestone receipts.

## 1.0.0-rc.1 — 2026-10-07

- Published the project-owned compiler gateway, strict build protocol,
  isolated worker broker, checksum-pinned local toolchain recipe and a fresh
  checkout compiler-to-emulator acceptance command.
- Added compact/focus/fullscreen workspace modes, live component movement,
  pointer-centred zoom/pan, dense-pin labels, named editable projects and an
  interrupted-save recovery journal.
- Added four ordinary editable examples, source line numbers/highlighting,
  clickable diagnostics, readable serial text, measured waveform cursors and
  full D0–D13/A0–A5 pin inspection.
- Added direct orthogonal segment dragging, route-family persistence and
  explicit project/build/runtime generation guards.
- Reconciled package, source candidate, compatibility and image-label versions.
  The hosted workbench remains a separate deployed release until an explicit
  cutover is approved.

## 0.7.0 — 2026-10-06

- Reconstructed the editor as a manual-first physical-parts workbench with a
  left catalogue, large canvas, right inspector, and collapsible secondary
  firmware, instrument, and Prompt Bridge tools.
- Added original scalable board, resistor, LED, four-terminal tactile-button,
  and rotary-potentiometer artwork. Visible terminals and 30 CSS-pixel wiring
  targets derive from the same component-local anchors.
- Expanded the declarative component registry with stable family/variant/type
  identity, dimensions, provenance, capabilities, constraints, catalogue
  metadata, model references, and honest simulation limitations.
- Added nine catalogue categories, metadata search/filtering, progressive
  thumbnails, local favourites, bounded recent history, and a deterministic
  1,000-record performance fixture with an 80-row visible window.
- Added layout-only wire colours and editable route bends with deterministic
  migration for older project-v2 saves. Electrical graph identity remains
  independent of artwork and route state.
- Extended model and cross-browser acceptance for artwork/terminal alignment,
  transforms, route avoidance, persistence, quota failure, responsive layout,
  and the full compiler-to-runtime journey.

## 0.6.0 — 2026-10-06

- Published the original browser interface and deterministic circuit model.
- Added the empty-project manual builder, component movement and rotation,
  pin-to-pin nets, branches, explicit junctions, wire bends, undo/redo,
  canonical project v2 import/export, local save/reopen, and v1 migration.
- Added the bounded multi-file editor, worker-based AVR runtime adapter,
  circuit-driven LED/button/potentiometer behavior, serial display, logic
  traces, and pin inspection source.
- Added the provider-neutral Prompt Bridge with strict circuit-only import.
- Added Apache-2.0 licensing, exact npm lock data, MIT dependency notices,
  source tests, a pinned source-check image, contribution/security guidance,
  templates, and continuous source checks.
- Deliberately excluded compiler/toolchain images, binaries, archives,
  compiled firmware, generated browser bundles, deployment state, and private
  acceptance evidence.
