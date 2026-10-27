# Changelog

All notable public source changes are recorded here.

## 1.1.0-rc.144 — 2026-10-27

- Makes the already executable DHT11 sensor visible in the ordinary Simple
  view with a direct action, first-page example placement and the featured
  card in the shared Parts drawer.
- Adds an AVR-only DS18B20 component with original VCC/DQ/GND probe artwork
  and a signed temperature control in exact 1/16 °C steps.
- Executes OneWire reset/presence, Skip ROM, Convert T, Read Scratchpad and
  Dallas CRC-8 through compiled AVR firmware on D3.
- Adds a working DS18B20 starter with positive and negative temperature
  output, canonical Save/Open persistence and explicit model limitations.
- Keeps DS18B20 unavailable on Pico, ESP32-C3 and STM32 until those profiles
  own tested runtimes, while preserving their shared AVR-style Parts drawer.
- Leaves actual public deployment state and rollback evidence in the separate
  deployment checkpoint.

## 1.1.0-rc.143 — 2026-10-27

- Adds an AVR-only DHT11 component with original VCC/DATA/GND artwork and
  independent integer temperature and relative-humidity controls.
- Executes the sensor's timed single-wire start, acknowledgement, five-byte
  payload and checksum through compiled AVR firmware on D4.
- Adds a working DHT11 starter with visible checksum-validated Serial output,
  canonical Save/Open persistence and explicit physical-model limitations.
- Keeps DHT11 unavailable on Pico, ESP32-C3 and STM32 until those profiles own
  a tested runtime, while preserving their shared AVR-style Parts drawer.
- Leaves actual public deployment state and rollback evidence in the separate
  deployment checkpoint.

## 1.1.0-rc.142 — 2026-10-27

- Replaces the three reduced Pico, ESP32-C3 and STM32 part lists with the same
  catalogue structure used by AVR: identical card geometry, search, advanced
  filters, favourites, pagination, compatibility link and keyboard/drag use.
- Keeps each controller's exact component policy and runtime limits; picker
  parity does not imply that an unavailable component became executable.
- Makes the sliding drawer body independently scrollable so the full chooser
  remains usable at both 1366×768 and 1440×900.
- Strengthens browser acceptance to compare the live DOM contract and computed
  card styling across all four controller profiles.
- Leaves actual public deployment state and rollback evidence in the separate
  deployment checkpoint.

## 1.1.0-rc.141 — 2026-10-27

- Replaces the permanent component column with one left-side Parts drawer that
  opens and closes like Serial Monitor and remains the same shell across AVR,
  Pico, ESP32-C3 and STM32.
- Gives the three bounded 3.3 V profiles the same searchable card treatment as
  AVR while retaining their exact supported, partial and authoring-only limits.
- Features the traffic-light module and direct example action at the top of the
  AVR drawer, and moves the traffic-light lesson directly behind Blink in the
  example chooser.
- Preserves authored project data, runtime authority, controller boundaries and
  the rc.140 model catalogue; this release changes presentation and discovery.

## 1.1.0-rc.140 — 2026-10-27

- Expands the AVR chooser to 20 visible choices: one empty circuit and 19
  ready-made examples with concise Learn, Try, Observe, Limits and Next
  guidance.
- Adds guided trimmer-calibration, ground-and-5-V-reference, traffic-light and
  four-digit multiplex examples, each backed by canonical project artifacts
  and bounded AVR runtime evidence.
- Publishes an 84-model four-profile component matrix with 71 executable, 72
  additional authoring-only and 193 unavailable profile cells, keeping model
  limitations and unsupported cross-controller combinations explicit.
- Adds original component artwork and named-terminal authoring packages for
  the expanded input, sensor, passive, semiconductor, protection, connection
  and indicator catalogue without claiming a runtime model where none exists.
- Synchronizes release identity, machine-readable X72 changes, documentation
  and sitemap while preserving prior project-file migration anchors and
  requiring a fresh Build after Open.

## 1.1.0-rc.139 — 2026-10-25

- Adds a visible New empty circuit action for Pico, ESP32-C3 and STM32 that
  starts with the fixed controller only and never inherits template cables.
- Allows multiple supported resistor and LED instances with deterministic IDs,
  independent movement and properties, named-pin cable creation/deletion, and
  exact graph/layout Undo and Redo.
- Extends canonical API batches to the same stable multi-instance model while
  rejecting type/ID mismatches, unknown or occupied pins and malformed graphs
  atomically.
- Preserves local Save/Open/reload, browser recovery identities, source/name
  data and the existing bounded runtime rule: only the exact validated
  controller-to-resistor-to-LED-to-ground path can Build or Run.
- Adds no new controller pins, component models, compiler/runtime authority,
  general circuit solver, deployment or public-service change.

## 1.1.0-rc.138 — 2026-10-25

- Discovers valid historical browser drafts for AVR, RP2040 Pico, ESP32-C3 and
  STM32F429ZI even when an older non-AVR draft was never added to the registry.
- Shows profile, authored name, saved time when known, and exact part/net counts
  in one shared recovery panel available from every controller profile.
- Opens recovery as a new per-tab draft, preserving source bytes, authored
  source, name, circuit and layout while leaving the original storage key
  unchanged; malformed entries remain visible but cannot replace the project.
- Recognizes the exact published rc.136 and rc.137 model locks only as
  data-only recovery anchors; unknown locks remain rejected and every migrated
  copy requires a fresh Build with no inherited executable authority.
- Treats revision 0 and empty Undo history after reconstruction honestly and
  performs no native Build or Run. This source candidate is not a deployment.

## 1.1.0-rc.137 — 2026-10-25

- Enables explicit canonical circuit editing for AVR, Pico, ESP32-C3 and STM32
  while preserving the fixed three-part non-AVR scope and profile validators.
- Keeps request sequence unchanged after explicit rate-limit or queue-full
  rejection and resumes safely after cooldown on the same pairing.
- Reconciles ambiguous transport only with the identical request ID and payload
  and fails closed when a bounded reconciliation cannot establish the outcome.
- Keeps API resistor/LED properties, model-derived labels, accessible labels,
  persistence and exact transaction Undo coherent with manual editing.
- Records independent Windows/Chrome acceptance across more than 71 requests,
  more than 15 minutes and all four profiles; adds no deployment or runtime
  authority and preserves public rc.136 with rc.134 as rollback basis.

## 1.1.0-rc.136 — 2026-10-24

- Adds a short-lived one-use `.intentpair` download so the pairing secret need
  not enter AI chat, a URL or a command argument.
- Strictly pins production tickets to the canonical HTTPS Lab origin, rejects
  redirects and secret-bearing malformed input safely, and deletes tickets
  before use.
- Adds optional same-process JSONL inspect, bounded plan, explicit Undo and
  close actions under unchanged scopes, revisions, rates and expiry limits.
- Persists no client capability and requires fresh pairing after process exit,
  owner lifecycle change, revoke or expiry.
- Adds no Build, Run, compiler, native runtime, worker, image or deployment
  authority; actual public rc.134 remains the rollback basis.

## 1.1.0-rc.135 — 2026-10-24

- Adds copyable task-driven Codex instructions, a versioned public protocol and
  a downloadable dependency-free browser-session client.
- Makes reference-client use read-only by default across all four profiles and
  requires a separate AVR edit pairing plus an explicit nonsecret plan.
- Preserves unrelated project content, rejects component removal by default
  and performs transaction Undo only after a separate human `UNDO` action.
- Keeps pairing secrets and client capabilities out of copied prompts,
  arguments, URLs, files, logs and source control.
- Adds no Build, Run, compiler, native runtime, worker, image or deployment
  authority and retains rc.134 as the prior app-only rollback basis.

## 1.1.0-rc.134 — 2026-10-24

- Adds an opt-in, disabled-by-default, per-tab private browser-session API.
- Allows bounded canonical circuit edits only on AVR; Pico, ESP32-C3 and STM32
  remain discover/read-only.
- Commits validated edit batches atomically through existing editor owners and
  preserves exact transaction-bound Undo/Redo.
- Bounds pairing, scopes, leases, queues, request IDs, rates, payloads and
  reconciliation while revoking authority on lifecycle replacement.
- Adds no Build, Run, compile, upload, device, worker or native authority and
  records exact rc.133 as the prior app-only rollback basis; live deployment
  state remains in the owning deployment checkpoint.

## 1.1.0-rc.133 — 2026-10-24

- Simplifies ordinary parts, pin, example and project-file actions while
  retaining advanced tools under their existing disclosures.
- Keeps valid passive pin targets visible and preserves source-editor focus,
  caret, drafts and profile recovery through ordinary workbench updates.
- Shows one contextual Pause or Resume action for the active AVR runtime and
  retains exact authored bytes through Pause, Resume, Reset and reload.
- Reuses the accepted single compiler-job and same-worker native UX evidence;
  this metadata increment performs no new firmware Build or native Run.
- Retains exact public rc.132 and its persistent aggregate counter volume as
  the app-only rollback basis.

## 1.1.0-rc.132 — 2026-10-24

- Keeps Parts visible beside the active canvas in Simple view across all four
  controller profiles.
- Adds real HTML5 drag/drop placement while preserving click and keyboard
  alternatives, bounded coordinates, one transaction and exact Undo.
- Places search and supported cards before technical filters and keeps expert
  route/geometry controls in Advanced view.
- Keeps contextual Undo and Save copy visible without adding API, compiler,
  runtime, worker or native execution authority.
- Retains exact public rc.131 and its persistent aggregate counter volume as
  the app-only rollback basis.

## 1.1.0-rc.131 — 2026-10-24

- Keeps the Firmware dialog open while a learner types, inserts spaces, adds
  new lines or pastes source text.
- Preserves focus, caret position and authored source across dialog reopen and
  browser reload.
- Treats repeated activation of the already-active controller canvas as an
  idempotent status refresh instead of closing its authoritative popup.
- Reuses the accepted compiler and runtime evidence; this release performs no
  new firmware Build, worker creation, Run or native claim.
- Retains exact public rc.130 and its private aggregate counter volume as the
  app-only rollback basis.

## 1.1.0-rc.130 — 2026-10-24

- Makes a new project begin with an empty workbench and one clear
  `Legg til kontroller` action instead of silently installing Blink.
- Gives the exact LED starter a direct `Kjør LED-eksempelet` action while
  retaining `Kjør prosjektet` for other authored projects.
- Moves canvas navigation under the compact `Visning` disclosure and keeps
  Examples and Scratch available without changing saved projects.
- Reuses the accepted compiler-to-worker-to-D13 evidence; this release adds no
  new firmware Build, worker, Run or native claim. X37 remains planned.
- Retains exact public rc.129 and its private aggregate counter volume as the
  app-only rollback basis.

## 1.1.0-rc.129 — 2026-10-24

- Restores strict data-only Open and migration for exact project files saved
  under the published rc.124 and rc.128 model-library locks.
- Preserves authored circuit, source and layout while clearing executable,
  runtime and verdict authority and requiring a fresh Build after migration.
- Keeps unknown, neighboring, forged and self-rehashed locks atomically
  rejected without replacing the current project.
- Retains exact public rc.128 and its private aggregate counter volume as the
  app-only rollback basis. Post-release independent actual-file acceptance
  closes X92 only within its reviewed twelve-criterion current-tab boundary;
  canonical status is 86 complete, 1 partial and 9 planned.

## 1.1.0-rc.128 — 2026-10-24

- Adds completed, in-flight and rejected model-derived AVR USART0 RX evidence
  to the existing collapsed read-only panel with bounded timing details.
- Keeps the lateness limit semantically unchanged at 4 while making its module
  explicit in the current-model and X49 private runtime closures.
- Carries the reviewed but never-deployed rc.126 configuration and rc.127
  framing increments; X46 remains partial and claims no physical UART proof.
- Adds only parser/restart boundary tests for X92; no new runtime authority or
  public X92 closure is claimed.
- Retains exact public rc.125 and its private aggregate counter volume as the
  rollback basis.

## 1.1.0-rc.127 — 2026-10-23

- Adds bounded model-derived AVR USART0 8-N-1 framing inside the existing
  read-only UART panel, with completed and in-flight counts.
- Fails closed on stale identity, retention loss, same-cycle configuration,
  overlap and timing conflict; lifecycle retirement clears all framing rows.
- Keeps framing explicitly non-physical and X46 partial. RX, parity modes,
  physical signal/noise, I2C and SPI remain unavailable.
- Records that rc.126 was never deployed and retains exact public rc.125 plus
  its persistent aggregate counter volume as rollback.

## 1.1.0-rc.126 — 2026-10-23

- Adds an identity-bound AVR USART configuration producer for the actual
  current worker and its existing read-only TX evidence.
- Keeps framing claims bounded to recorded data size, stop-bit mode, baud and
  frame timing. RX, parity analysis, physical signals, I2C, SPI and full X46
  closure remain unavailable.
- Adds no Build, Run, Apply or verdict authority and preserves Save/Open, PWM,
  routing and the aggregate page-view counter.
- Retains exact public rc.125 source and app image as the rollback basis while
  preserving its persistent counter volume.

## 1.1.0-rc.125 — 2026-10-23

- Adds a minimal first-party aggregate page-view counter with all-time and
  Europe/Oslo calendar-day totals. It stores no visitor identifiers, cookies,
  IP addresses, user agents, referrers or page URLs.
- Keeps reads non-counting and counts one empty same-origin POST per fresh
  browser load. Counter unavailability never blocks the workbench.
- Uses bounded validated storage, a cross-process lock and atomic rename on a
  private persistent volume outside the read-only application root.
- Starts production history at the real first deployment time with no
  retroactive or invented totals. Reloads and bots are views, not unique users.
- Retains exact public rc.124 and its app image as the app-only rollback basis;
  rollback preserves the aggregate counter volume.

## 1.1.0-rc.124 — 2026-10-23

- Uses measured AVR PWM duty from the current worker snapshot to scale the
  existing ideal LED current and relative-brightness observation. Digital
  outputs retain exact off/on behavior and no independent timer is added.
- Projects the same PWM observation into the visible LED, opacity and
  accessible label; Pause freezes the snapshot and Reset clears presentation.
- Extends bounded automatic routing with shorter valid interior endpoint and
  obstacle-edge channels while preserving manual route bytes, topology, IDs,
  Undo and Save/Open. The claim is bounded-candidate shortest, not global.
- Adds source, fake-browser and one-Build/one-worker native acceptance for the
  25%/75% PWM starter, formula identity, route body avoidance and lifecycle.
- Retains exact public rc.123 as the app-only rollback basis.

## 1.1.0-rc.123 — 2026-10-23

- Restores visible Serial access through the canonical Instruments popup and
  keeps its heading below the sticky popup header at supported desktop widths.
- Keeps Pause and Reset readable at their truthful runtime gates and moves the
  dense X26–X36 regression matrix behind a closed-by-default Advanced testing
  disclosure without removing any control.
- Adds integrated desktop browser acceptance at 1920×911 and 1440×900 with
  popup close/reopen, focus restoration, scrolling, zero workers and zero API
  requests.
- Changes presentation only: model, firmware, runtime, compiler and producer
  authority remain unchanged. Exact public rc.122 is retained as rollback.

## 1.1.0-rc.122 — 2026-10-23

- Contains the X46 UART grid item to the Instruments surface and keeps the
  760 px evidence table inside its own horizontal scroller. Populated rows no
  longer expand or displace the existing desktop workbench controls.
- Adds an integrated real-app-shell desktop regression at 1440 px and a
  constrained 780 px desktop viewport. Both render the 23 retained historical
  TX rows with zero workers or producer requests; the constrained table owns
  its overflow and the document remains contained.
- Supersedes unaccepted rc.121, which passed desktop evidence but was rolled
  back after its broader 390 px check found 681 px document width.
  Mobile/tablet product development is deferred; this is only the cheap,
  coherent grid-containment correction.
- Preserves rc.121's exact current model manifest and implementation hashes.
  This CSS-only correction changes no model, firmware or runtime semantics.
- X46 remains pending independent public acceptance and is partial only for
  the bounded USART0 TX slice when accepted; framing, RX, physical signals,
  I2C and SPI remain unavailable. Canonical status stays X **85 complete /
  1 partial / 10 planned**, P1 **59/0/0**.
- Performs no owner firmware Build, worker, Run, retry or scenario and creates
  at most one application image. Exact public rc.120 remains the rollback.

## 1.1.0-rc.121 — 2026-10-23

- Adds one read-only X46 Instruments panel for complete, identity-bound AVR
  USART0 TX byte events from the current paused worker. It shows byte order,
  cycle and cycle delta, byte value/text, model baud and exact frame cycles.
- Reconciles avr8js 0.21.1 integer baud through its exact documented floor
  quantization while preserving frame duration as separate evidence. Wrong
  baud/frame boundaries, retention loss and stale identity remain fail-closed.
- Keeps framing configuration, RX decoding, physical voltage/noise, I2C and
  SPI unavailable. The panel cannot Apply, Build, Run or decide a verdict.
- Retains the exact rc.120 model manifest as migration-only trusted data, so an
  rc.120 saved project remains openable and may create an explicit data-only
  current copy without restoring executable authority.
- Prepared X46 for the bounded USART0 TX increment, but responsive acceptance
  failed and the candidate was rolled back. No canonical status changed; X
  remained **85 complete / 1 partial / 10 planned**, P1 **59/0/0**.
- Performs no owner firmware Build, worker, Run, retry or scenario and creates
  at most one application image. Public usability and the exact rc.120
  rollback remain release gates.

## 1.1.0-rc.120 — 2026-10-23

- Stops a recovered historical model project before compiler dispatch and
  shows `Model migration required` instead of allowing the worker to reject
  execution behind the stale reopened-project message.
- Opens the existing Model library control for an explicit data-only migrated
  download. The open original is never overwritten and no model semantics are
  changed automatically.
- Proves that opening the historical project retires an already-ready worker,
  disables both Run controls, creates no replacement worker and makes no
  compiler request. The downloaded migrated copy then opens, builds from the
  retained exact artifact and reaches Paused in the browser regression.
- Marks X81 complete against its bounded local assessment criterion after
  Desktop independently reopened the actual saved public envelope and obtained
  the same verified observation result with rebuild bytes still `not-checked`.
  An ordinary firmware Run is outside that data-only criterion. Status is now
  X **85 complete / 1 partial / 10 planned**, P1 **59/0/0**.
- Performs no native firmware Build, Run, retry or scenario and creates at most
  one application image. Desktop retains final public authority for the
  recovered-project guard, migrated-file open, one fresh Build and one short
  Run.

## 1.1.0-rc.119 — 2026-10-23

- Adds one finite five-second AVR worker-ready deadline and explicit
  `loading`, `ready` and `failed` startup states.
- Retires stale or failed worker authority, keeps Run disabled and shows one
  actionable error instead of leaving the interface indefinitely on
  `Loading verified artifact…`.
- Pins the exact project-owned 7,418-byte thermostat compiler artifact in the
  regression. Current and retained actual workers reach Paused with Run
  enabled under the exact production CSP; a silent worker fails visibly.
- Records one earlier isolated CT109 diagnostic compile separately. Rc.119
  itself performs no firmware Build, Run, retry or scenario and creates at
  most one application image.
- Keeps X81 planned pending Desktop's one fresh public Build, one short Run and
  saved-file reopen. Status remains X **84 complete / 1 partial / 11 planned**,
  P1 **59/0/0**.

## 1.1.0-rc.118 — 2026-10-23

- Supersedes rejected rc.117 after its fresh public Chromium check found one
  inline presentation rule in the X81 evidence context that the unchanged
  `style-src 'self'` policy correctly blocked.
- Moves the same `white-space` and `overflow-wrap` presentation into the
  self-hosted stylesheet without weakening CSP or changing X81 data,
  assessment, firmware or runtime authority.
- Adds a source gate that forbids inline style attributes and a browser
  roundtrip under the exact production CSP. The existing two-case AVR
  ready-state regression remains green with zero compiler requests and zero
  firmware Runs.
- Keeps X81 planned until independent public Build, short Run and saved-file
  reopen complete. Status remains X **84 complete / 1 partial / 11 planned**,
  P1 **59/0/0**.

## 1.1.0-rc.117 — 2026-10-23

- Supersedes withdrawn rc.116 after independent public browser acceptance found
  that a successful AVR Build could still leave Run disabled when the initial
  worker-ready message omitted an optional Trace collection.
- Normalizes every optional collection consumed by the initial AVR ready view,
  including Trace, Pins, Circuit LEDs, Instruments and candidate runtime
  support, without widening worker protocol or firmware authority.
- Labels empty Trace and Logic views as no observations instead of presenting a
  placeholder LOW value that was never measured.
- Adds a real built-page/native-worker browser regression for both the unchanged
  default current-model thermostat and the retained partial-ready project. Both
  reach Paused with Run enabled, zero browser errors, zero compiler producer
  requests and zero firmware Runs.
- Retains the rc.116 X81 assessment unchanged and keeps X81 planned until
  independent public Build/short Run and saved-assessment reopen complete.
  Status remains X **84 complete / 1 partial / 11 planned**, P1 **59/0/0**.

## 1.1.0-rc.116 — 2026-10-23

- Adds a public local, read-only X81 assessment disclosure for one reviewed
  retained AVR fixture. It strictly reopens release-owned evidence from two
  recorded workers and recomputes the first 512 paused instructions without a
  Build, Run, upload, project mutation or live service request.
- Reports the bounded result truthfully: the ideal CPU/GPIO/UART observations
  match, both UART streams are empty, independent rebuild-byte equality is not
  checked and physical-board equivalence is not claimed. Imported evidence has
  no Build, Run, project, runtime or verdict authority.
- Corrects AVR ready-state presentation so a partial instrument snapshot is
  shown as unavailable instead of blocking Run. The strict evidence parser and
  accessible export remain unchanged.
- Keeps X81 planned until independent public verification completes. Status
  therefore remains X **84 complete / 1 partial / 11 planned**, P1 **59/0/0**.
  Cumulative native evidence remains **44 Build / 41 Run / 0 scenarios**; this
  release performs zero firmware producer actions and creates at most one
  normal application image.

## 1.1.0-rc.115 — 2026-10-23

- Publishes the reviewed bounded STM32 X92 integration through the real parser, budget
  executor, action router, profile adapter and manual/Quick API owner gate.
- Binds exact request, source, graph, ELF, model, compiler and runtime identity.
  Only a signed one-use completion receipt proving natural child close and
  exact Docker-container absence permits successful accounting.
- Retained native proof runs the compiler-generated ELF in actual Renode 1.17.0,
  observes final PB0 and `STM32 PUBLIC\n` across reset replay, and records
  instruction ordinals rather than physical cycles or time. The external LED
  remains an ideal teaching rendering, not physical pin or board evidence.
- Disconnect, deadline, stale identity, overlap and unconfirmed cleanup fail
  closed with full charging where a reservation was dispatched. X92 remains
  partial. Status stays X **84 complete / 1 partial / 11 planned**, P1
  **59/0/0**. Cumulative native evidence is **44 Build / 41 Run / 0 scenarios**;
  the release performs no new firmware producer action.

## 1.1.0-rc.114 — 2026-10-23

- Publishes the reviewed bounded ESP32-C3 X92 owner-proof slice with exact
  source, flash, compiler, rc.7 runtime, request, model and generation joins.
- Records actual Espressif QEMU CPU/UART evidence with two `C3_PUBLIC` boot
  epochs and final LF while keeping GPIO2/LED explicitly separate as the
  project-owned executed-register-write model; no QEMU pin readback is claimed.
- Routes manual, Quick and bounded Agent API Build/Run through one owner gate;
  stale or mismatched bindings reject before Run, while only active-budget Run
  receives the private result and post-run quiescence contract.
- Keeps STM32 budgeted Run unsupported and X92 partial. Status remains X **84
  complete / 1 partial / 11 planned**, P1 **59/0/0**. Cumulative native
  evidence is **41 Build / 39 Run / 0 scenarios**; this release performs no new
  firmware producer action and creates one separately counted app release
  image.

## 1.1.0-rc.113 — 2026-10-22

- Publishes the reviewed bounded RP2040 Pico owner-proof slice from retained,
  checksum-pinned native evidence: one Build, one Run, one Worker and two fresh
  stable Pause acknowledgements 260.2 ms apart.
- Records stable CPU/GPIO/UART evidence, GPIO0 output/HIGH, exact source-derived
  `PICO PUBLIC\n` including byte 10, zero drops, and independent UF2/compiler,
  source/graph/model, request, dispatch and accounting joins.
- Corrects the budget help text: bounded AVR and Pico have reviewed owner-proof;
  ESP32-C3 and STM32 budgeted Run remain rejected before producer dispatch.
- Preserves the original failed receipt unchanged and publishes only the
  separate offline validation provenance. X92 remains partial. Status remains
  X **84 complete / 1 partial / 11 planned**, P1 **59/0/0**. Cumulative native
  evidence is **38 Build / 36 Run / 0 scenarios**; this release performs no new
  firmware producer action.

## 1.1.0-rc.112 — 2026-10-22

- Adds X48's bounded AVR ideal-room loop: one current thermostat source,
  authored graph, compiled artifact, exact model closure and one ready worker
  are joined before the explicitly selected 32-tick run can begin.
- Retains nominal and actual instruction-boundary cycles, cycle-zero inputs,
  all 32 independently recomputable rows, HIGH/LOW phase coverage and explicit
  retention counters. Ambiguous, stale, incomplete or dropped evidence cannot
  pass.
- This is one discrete educational process model, not physical thermal
  calibration, wall-clock timing, a continuous solver or safety evidence.
- Preserves the accepted rc.111 model manifest byte-for-byte as migration-only
  data. X92 remains partial. Status is X **84 complete / 1 partial / 11
  planned**, P1 **59/0/0**. This release performs zero new native producer
  actions; cumulative accepted evidence is **36 Build / 34 Run / 0 scenarios**.

## 1.1.0-rc.111 — 2026-10-22

- Adds X57 strict current-byte contribution review with explicit trusted
  maintainer confirmation and fixed project-owned conformance tests.
- Adds X89 read-only local configuration assessment over exact Compose,
  trusted broker policy and pinned image locks. It does not claim service,
  compiler runtime, firmware or physical readiness.
- Candidate modules and submitted commands remain inert. Admission grants no
  registry, release, runtime, network or execution authority.
- X57 and X89 are complete only against these bounded criteria; X92 remains
  partial. Status is X **83 complete / 1 partial / 12 planned**, P1
  **59/0/0**. Native evidence remains **34 Build / 33 Run / 0 scenarios**.

## 1.1.0-rc.110 — 2026-10-22

- Adds the reviewed X69 local historical recipient walkthrough over canonical
  strict-v3 AVR thermostat experiment packages. Authored scheduled inputs are
  shown separately from recorded D13 observations, outcomes and evidence.
- Adds the reviewed X74 explicit local-file handover and bounded response file.
  Exact parent digests bind the relationship; review-only, wrong-parent,
  duplicate, stale and unsaved-cancel paths preserve active work.
- Makes concurrent package and response selection latest-wins. Invalid newer
  choices, Close, Escape and parent replacement invalidate pending reads and
  hashes before accepted state, status or rendering can change.
- Adds no account, upload, server project storage, automatic Apply, native
  producer or runtime worker. X69 and X74 are complete only against their
  original bounded criteria; X92 remains partial. Status is X **81 complete /
  1 partial / 14 planned**, P1 **59/0/0**. Native evidence remains **34 Build /
  33 Run / 0 scenarios**.

## 1.1.0-rc.109 — 2026-10-22

- Corrects the independently reproduced default-thermostat X66 Create failure.
  Candidate-v3 graphs now use their exact locked candidate graph validator
  instead of falling through the narrower project-v2 component catalogue.
- Adds only the two strict existing subcircuit editor transactions to candidate
  sessions. Complete candidate-envelope validation still runs before commit,
  and arbitrary unknown component types remain rejected.
- Preserves the public rc.108 model identity as immutable migration-only data
  and introduces the separately pinned current correction identity. Blink,
  thermostat, all Save/recovery/history paths and published v1/v2 workspaces
  pass without adding producer or runtime-worker authority.
- With corrected public default-thermostat acceptance, X66 is complete only
  against its original bounded readability criterion. X92 remains partial;
  status is X **79 complete / 1 partial / 16 planned**, P1 **59/0/0**. Native
  evidence remains **34 Build / 33 Run / 0 scenarios**.

## 1.1.0-rc.108 — 2026-10-22

- Adds one strict finite AVR resistor-and-LED reusable subcircuit with explicit
  source and ground ports. Stable instance IDs namespace generated components
  and the private series net before the ordinary graph validator sees them.
- Preserves exact connectivity and canonical graph digest through
  collapse/expand and movement, with atomic create, delete and Undo/Redo.
  Download/Open, browser recovery and local history retain the owner and exact
  expanded graph; published v1 and v2 workspaces migrate with an empty owner.
- Rejects nesting, unresolved ports, stale model identities, renamed local
  identifiers, unsupported topology and hidden execution authority. Runtime
  receives only the expanded ordinary graph; no producer or worker was added.
- Publishes the bounded X66 increment, but independent public acceptance found
  that the default thermostat candidate rejected Create before installation.
  X66 therefore remains partial until the corrected default journey is
  independently reviewed and published. There is no blanket, nested,
  other-profile or physical-equivalence claim. X66 and X92 remain partial;
  status is X **78 complete / 2 partial / 16 planned**, P1 **59/0/0**. Native
  evidence remains **34 Build / 33 Run / 0 scenarios**.

## 1.1.0-rc.107 — 2026-10-22

- Adds strict X66 labels bound only to existing canonical net IDs. The bound
  ID is visible in the canvas; equal text on separate nets never creates,
  joins, splits or retargets connectivity.
- Preserves labels through Download/Open, native Save/Save copy, browser
  recovery, local history, dirty fingerprints and exact Undo/Redo. Dangling or
  malformed data fails atomically, and net deletion cleans up its labels
  deterministically.
- Restores published annotated-workspace v1 compatibility through normal Open,
  recovery and local history while preserving notes/groups and adding an empty
  strict label owner. Every historical non-retained model lock remains
  migration-only; retained execution semantics are unchanged.
- Keeps X66 partial until deterministic reusable subcircuits exist. X92 also
  remains partial; status is X **78 complete / 2 partial / 16 planned**, P1
  **59/0/0**. This release performs zero new firmware Build, Run, Scenario or
  worker action and retains cumulative native evidence at **34/33/0**.

## 1.1.0-rc.106 — 2026-10-22

- Publishes three reviewed local teaching surfaces: X66 non-electrical notes and
  groups with annotation-safe Save/Open, recovery and atomic visual history;
  X68 an AVR presentation over one frozen, provenance-labelled instrument
  capture; and X71 one strict local AVR exercise with exactly the correct and
  known-bad equality variants.
- Retains X92's bounded AVR session quota and publishes only the corrected
  parser/UI-bound synthetic fixed-default exhaustion proof. This is not a new
  native producer, generic AI agent or full X92 closure.
- Keeps each increment partial and explicit: X66 is not subcircuits or net
  labels; X68 is captured, not live; X71 is the fixed AVR pair; X92 remains
  bounded AVR plus synthetic proof. Canonical status is X **76 complete / 4
  partial / 16 planned**, P1 **59/0/0**.
- Performs zero new firmware Build, Run, Scenario or worker action and retains
  cumulative accepted native evidence at **34/33/0**. DNS, Caddy, robots, CSP,
  token/workflow and compiler/runtime locks are unchanged.

## 1.1.0-rc.105 — 2026-10-22

- Publishes the reviewed partial X92 bounded experiment budget for one trusted,
  current project session. It enforces fixed aggregate Build, Run, scenario and
  wall-clock limits with atomic pre-dispatch ownership, exact-once terminal
  accounting and deterministic unresolved work when a request cannot fit.
- Review downloads remain strict inert data. Open cannot restore a session,
  reservation, executable, runtime, permission or verdict, and source, graph or
  profile changes never replenish consumed budget.
- Budgeted AVR Run returns only after an owner-bound pause acknowledgement for
  the exact request, dispatch token, identity and worker. Accepted native proof
  retained identical cycles, instructions, GPIO and Serial across two
  post-terminal observations 305.3 ms apart.
- Budgeted Run for Pico, ESP32-C3 and STM32 rejects before producer dispatch
  because profile-specific remote quiescence is not proven. Existing manual
  Build/Run controls remain unchanged on all four profiles.
- X55's independently accepted bounded completion is retained. Status is X
  **76 complete / 1 partial / 19 planned**, P1 **59/0/0**. This release performs
  0 new firmware Build, Run or Scenario; cumulative native evidence remains
  **34/33/0**. X92 is partial, not a generic AI agent or full closure.

## Post-rc.104 contract reconciliation — 2026-10-22

- Desktop independently accepted X55 as complete against its exact original
  bounded title and criterion after reviewing the actual public rc.104 Model
  property and Drawing workspaces for the existing resistor and LED across all
  four profiles.
- The accepted 66/66 focused, 28/28 top-layout and four-profile public-browser
  evidence proves appearance changes preserve electrical anchors and execution
  semantics. Arbitrary SVG/code, unrestricted component families, pin/net
  editing and a general-purpose editor were not original X55 requirements and
  are not inferred.
- Canonical status is now X **76 complete / 0 partial / 20 planned**. This is a
  documentation-only taxonomy reconciliation over unchanged public rc.104; it
  is not a new product release or producer run.
- Adds the corrected bounded private X92 implementation contract. X92 remains
  planned and no X92 implementation or producer proof is claimed.

## 1.1.0-rc.104 — 2026-10-22

- Separates the existing resistor and LED Inspector into explicit `Model
  property` and `Drawing` workspaces on AVR, Pico, ESP32-C3 and STM32.
- Keeps Preview non-mutating, Cancel atomic, unchanged-value Apply disabled,
  stale previews rejected and each accepted Apply as one mode-scoped Undo/Redo
  transaction. Closing the Inspector, Escape and profile switching discard
  uncommitted previews.
- Clarifies that model Preview changes no project/runtime state, while accepted
  model Apply revalidates the property and circuit, retires current executable
  and runtime evidence, and requires a fresh Build before Run. Drawing remains
  layout-only and cannot change pins, anchors, named nets, source or runtime
  semantics.
- Reuses accepted 66/66 X55, 28/28 top-layout and four-profile browser evidence
  with 0 firmware Build, Run, Scenario, producer request or runtime worker.
  X55 remains partial at **75/1/20**; no general model/drawing editor or blanket
  X55 closure is claimed.

## 1.1.0-rc.103 — 2026-10-21

- Adds one coherent, bounded body editor for the existing resistor and LED
  across AVR, Pico, ESP32-C3 and STM32: width and height are limited to
  80–100%, and corner softness to 0–100%.
- Keeps electrical anchors, world bounds, named nets, wire routes, electrical
  properties, source, artifact and runtime authority unchanged. Preview is
  non-mutating; Cancel is atomic; Apply is one visual-only Undo/Redo step; and
  strict data-only Save/Open retains accepted values.
- Connects rendered leads to every admitted body extreme while preserving the
  historical default LED geometry. No arbitrary SVG/code upload, new part,
  general model/drawing editor or X55 closure is claimed.
- Reuses accepted 60/60 targeted, 58/58 focused, 28/28 top-layout, 55/55
  pretest, 423/423 full, 40/40 posttest, browser-extreme and exact-SHA CI
  evidence with 0 firmware Build, Run, Scenario or worker.

## 1.1.0-rc.102 — 2026-10-21

- Adds two finite, original LED outline presets—Round 5 mm and Soft square—to
  the existing shared LED across AVR, Pico, ESP32-C3 and STM32.
- Keeps Preview non-mutating and Apply layout-only/undoable. Electrical colour,
  forward voltage, ANODE/CATHODE anchors, named nets, source, artifact and
  runtime identity remain unchanged; Save/Open retains the selected outline.
- Adds no uploaded or arbitrary geometry, new component/model, topology or
  runtime behavior. X55 remains partial and status stays X **75/1/20**.
- Reuses accepted 51/51 focused, 55/55 pretest, 421/421 full, 40/40 posttest,
  four-profile browser and exact-SHA CI evidence with 0 firmware Build, Run,
  Scenario or worker.

## 1.1.0-rc.101 — 2026-10-21

- Extends the two existing original fixed-resistor body presets from AVR to
  the existing Pico, ESP32-C3 and STM32 workbenches.
- Keeps Preview non-mutating and Apply layout-only. Pins, named nets,
  resistance, component position/rotation, source, model and runtime authority
  remain unchanged, and Save/Open retains the selected preset.
- Adds no arbitrary drawing, custom geometry/colour, imported artwork, new
  component, topology or runtime behavior. X55 remains partial and status stays
  X **75 complete / 1 partial / 20 planned**, P1 **59/0/0**.
- Reuses the accepted 55/55 pretest, 419/419 full, 40/40 posttest and
  four-profile browser evidence. This release performs 0 firmware Build,
  0 Run and 0 Scenario; cumulative accounting remains **32/31/0**.

## 1.1.0-rc.100 — 2026-10-21

- Corrects the canonical X43 status to complete against its original bounded
  precision criterion, using the already accepted public/native instruction,
  cycle, runtime and stack-pointer/address-depth evidence.
- Preserves explicit limits: heap, free SRAM, stack contents, live occupancy,
  non-AVR profiling and physical benchmarking remain unavailable. Generic heap
  was not an original X43 completion dependency.
- Changes release/status metadata and public explanatory copy only. Runtime,
  compiler, worker and model semantics are unchanged; no Build, Run or Scenario
  was performed.
- Status is X **75 complete / 1 partial / 20 planned**, with only X55 partial;
  P1 remains **59/0/0**, M2–M4 partial and M5 planned. Cumulative producer
  accounting remains **32/31/0**.

## 1.1.0-rc.99 — 2026-10-21

- Completes the original bounded AVR X47 criterion with finite A1 ramp,
  seeded-noise and recorded schedules plus the existing D2 active-low pulse.
- Preserves exact source, graph, artifact, model, generation and worker binding;
  input Apply never resumes execution, D2 Resume is explicit, a later explicit
  Pause rebinds only the same fresh-cycle worker, and Reset clears pending work.
- Retains the accepted native ramp/noise/recorded ADC and D13 evidence, lossless
  pressed-LOW D2 evidence and same-worker pending-Reset proof. This release adds
  no Build, Run or Scenario.
- Rc.99 shipped the stale X43/X55 partial count below; rc.100 corrects that
  metadata against the already accepted X43 original-criterion closure. The
  accepted post-X47 truth is X **75/1/20**, with only X55 partial.
- The rc.99 release boundary still keeps M2–M4 partial and M5 planned. Non-AVR input,
  arbitrary signals, saved/replayed schedules, physical equivalence and verdict
  authority remain unavailable. Its published stale status was X **74 complete
  / 2 partial / 20 planned**, P1 **59/0/0**; cumulative producer accounting was
  **32/31/0**.

## 1.1.0-rc.98 — 2026-10-21

- Publishes the reviewed AVR-only X43 observed-stack address-depth slice with
  current SP, interval minimum and since-reset minimum from avr8js `CPU.SP`.
- Preserves exact source/artifact/model/generation/worker binding, Pause freeze
  and same-worker Reset clear; accepted native evidence observed minimum SP
  `0x08e0`, 31 bytes maximum depth and 400,001 interval samples.
- Explicitly does not claim live-byte occupancy, dynamic SRAM, heap, free SRAM,
  true memory high-water, other-profile equivalence or physical hardware.
- X43 remains partial. Status remains X **73 complete / 3 partial / 20
  planned**, P1 **59/0/0**; the release adds no Build, Run or scenario and
  cumulative accepted producer accounting is **23/26/0**.

## 1.1.0-rc.97 — 2026-10-21

- Corrects stale Support wording so X49 is complete only against its original
  criterion: one specified AVR thermostat baseline 0 versus +1 °C ideal
  sensor-deviation comparison.
- Explicitly denies physical calibration, a durable device offset, drift,
  generic component tolerance, accuracy class, probability distribution and
  factory guarantee; all other offsets remain calculated-only.
- Preserves rc.96 runtime, compiler, worker and model behavior byte-for-byte.
  X43, X47, X55 and M2 remain partial; this release performs no Build, Run or
  scenario.
- Status remains X **73 complete / 3 partial / 20 planned**, P1 **59/0/0**;
  cumulative accepted producer accounting remains **22/25/0**.

## 1.1.0-rc.96 — 2026-10-21

- Refines the reviewed four-profile workbench with compact project-owned pin
  labels while retaining full endpoint identity in accessible names and
  tooltips.
- Clarifies Project & files, keeps ordinary Download/Open primary, and adds
  task-led Help, first-project guide, Examples and Support entry points without
  replacing canonical project or runtime owners.
- Preserves all compiler/runtime behavior and private X48/M2 work outside the
  public tree. This release performs no Build, Run or scenario.
- Status remains X **73 complete / 3 partial / 20 planned**, P1 **59/0/0**;
  cumulative accepted producer accounting remains **21/24/0**.

## 1.1.0-rc.95 — 2026-10-21

- Publishes the reviewed partial X55 AVR fixed-resistor appearance editor with
  two original finite body presets and a non-mutating preview before Apply.
- Preserves exact A/B pins, named nets, resistance, model, position, rotation,
  firmware source and runtime authority through Apply, Undo, Redo and
  Save/Open; other parts and profiles remain unavailable.
- Restores AVR quick-control labels and disabled state after returning from
  Pico, ESP32-C3 or STM32 without adding runtime authority.
- Advances X status to **72 complete / 4 partial / 20 planned**, P1
  **59/0/0**. The release packet adds no Build, Run or scenario; cumulative
  accepted private producer accounting remains **20/23/0**.

## 1.1.0-rc.94 — 2026-10-21

- Publishes the reviewed partial X49 AVR thermostat comparison for the exact
  baseline 0 versus candidate +1 °C pair.
- Uses one explicit same-origin build and two fresh dedicated browser workers,
  bound to exact source, graph, revision, artifact, model, worker, input and
  virtual-time authority; later drift retires the transient projection.
- Keeps all other offsets calculated-only and labels physical evidence absent.
  Other sensors, profiles, persistence, automatic replay and general experiment
  authoring remain planned.
- Advances X status to **72 complete / 3 partial / 21 planned**, P1 **59/0/0**.
  The release packet adds no Build, Run or scenario; cumulative accepted
  private producer accounting remains **19/22/0**.

## 1.1.0-rc.93 — 2026-10-20

- Publishes the reviewed partial X47 AVR-only D2 active-low pulse preview and
  exact current-paused-worker Apply/Resume journey.
- Binds source, graph, artifact, model implementation/execution context,
  runtime generation and worker epoch through strict queue, execution and
  cancellation receipts.
- Uses two-phase Stop cancellation/disposal, fail-closed timeout behavior and
  explicit `Historical · non-current` retained evidence after authority is
  revoked.
- Recognizes four earlier current-model identities through data-only migration
  that preserves authored cells and clears executable/runtime authority.
- Advances X status to **72 complete / 2 partial / 22 planned**, P1 **59/0/0**.
  No new firmware Build, Run or scenario was performed for this release.

## 1.1.0-rc.92 — 2026-10-20

- Publishes the reviewed partial X43 AVR-only Runtime profile interval: an
  explicit Start/Capture journey reports native emulator cycle and executed-
  instruction deltas on one unchanged current-worker binding.
- Derives exact 16 MHz virtual time from the cycle delta and keeps browser wall
  throughput visibly diagnostic rather than a semantic time or hardware
  benchmark.
- Keeps dynamic SRAM, heap, current stack and peak stack explicitly unavailable;
  RP2040, ESP32-C3 and STM32 profiling remain unavailable for this contract.
- Preserves native evidence as the sole producer proof and browser replay as
  presentation/lifecycle proof. This release adds no Build, Run or scenario.
- X43 is partial, not complete. Counts are X **72/1/23**, P1 **59/0/0**.

## 1.1.0-rc.91 — 2026-10-20

- Completes X42 for AVR with an explicit armed future rising/falling edge over
  authoritative current-worker transitions and a fixed 16 + 1 + 16-row window.
- Binds capture to exact project, artifact, model, runtime, graph and source
  lifecycle identity; discontinuity, dropped rows and authority changes fail
  closed and terminate observation.
- Keeps RP2040, ESP32-C3 and STM32 unavailable for X42 under their documented
  retention/source boundaries instead of inferring waveform support.
- Advances counts to X **72/0/24**, P1 **59/0/0**, with no new Build, Run,
  scenario, worker, persistence, replay, verdict or infrastructure authority.

## 1.1.0-rc.90 — 2026-10-20

- Completes X59 with one accessible session-only Simple/Advanced presentation
  switch shared by AVR, RP2040 Pico, ESP32-C3 and STM32F429ZI.
- Keeps Advanced as the initial mode. Simple retains the real controller,
  named-pin circuit, source, files, runtime controls/status, instruments,
  diagnostics and exact Help/limits while hiding dense review/export surfaces.
- Preserves canonical project, runtime and storage data across view/profile
  changes; it creates no alternate editor, persistence or new authority.
- Advances counts to X **71/0/25**, P1 **59/0/0**, with no firmware Build, Run,
  scenario, service worker, account, storage, mobile or infrastructure change.

## 1.1.0-rc.89 — 2026-10-20

- Completes X86 against its original requirement: one exact four-profile matrix
  shows cold navigation/reload, loaded-tab file use, compiler ownership,
  runtime ownership and offline-Run limits without inferring capabilities.
- Repairs the X86 browser harness for the current Project & files and Firmware
  dialogs while retaining real Download → visible edit → actual-file Open
  restoration across AVR, Pico, ESP32-C3 and STM32 after disconnect.
- Keeps fresh offline navigation/reload unavailable, all compilation online,
  AVR/Pico offline Run unsupported/unverified and C3/STM32 server runtimes
  unavailable offline.
- Advances counts to X **70/0/26**, P1 **59/0/0**, with no firmware Build, Run,
  scenario, service worker, cache, storage, account, endpoint or infrastructure
  change.

## 1.1.0-rc.88 — 2026-10-20

- Completes X70 against its original criterion using four preserved genuine
  original-identity demonstrations and a separate strict finite historical
  SVG/report validation path.
- Keeps every rc.86 release, profile, model-lock, artifact and report identity
  unchanged; historical validation is data-only and grants no executable,
  current-runtime, physical-truth or verdict authority.
- Retains the current rc.88 parser's exact release binding, explicit no-current
  exports, Pico pacing and all existing lifecycle authority clearing.
- Advances counts to X **69/1/26**, P1 **59/0/0**, with no firmware Build, Run,
  scenario, endpoint, storage, service worker, DNS, Caddy or infrastructure
  change.

## 1.1.0-rc.87 — 2026-10-20

- Publishes the independently reviewed Pico current-runtime measurement path
  in the existing deterministic accessible SVG export.
- Uses bounded Pico presentation pacing, exact acknowledgement backpressure
  and a final-Pause bypass so the visible workbench remains responsive.
- Keeps AVR, ESP32-C3 and STM32 no-current SVG exports explicit and unchanged;
  the three prior genuine runtime files remain historical original identities.
- Keeps X70 partial at X **68/2/26** and adds no firmware Build, Run, scenario,
  endpoint, storage, service worker, DNS, Caddy or infrastructure change.

## 1.1.0-rc.86 — 2026-10-20

- Adds X70's reviewed deterministic local accessible SVG export for AVR,
  RP2040 Pico, ESP32-C3 and STM32F429ZI authored graphs.
- Includes every connected named pin/net, authored component geometry and
  values, exact release/model identity and visible model support limits.
- Labels measurement state explicitly as `No current measurements`; X70 is
  partial and no runtime evidence, result or verdict is inferred.
- Keeps the corrected nine-tool desktop workbench geometry and adds no Build,
  Run, scenario, worker, storage, endpoint, third-party or infrastructure.

## 1.1.0-rc.85 — 2026-10-20

- Keeps the existing controller selectors, Build/Run controls and named tool
  buttons visible while the active circuit workbench is being scrolled.
- Bounds the sticky group to the top workbench so it releases before unrelated
  lower content, with the original authoritative controls and dialog owners.
- Falls back to ordinary document flow for low-height, narrow and 200%-zoom
  layouts to preserve reachability and avoid large canvas occlusion.
- Adds no functional-longlist completion, firmware action, storage, runtime,
  service, endpoint, mobile behavior or infrastructure.

## 1.1.0-rc.84 — 2026-10-20

- Published X75 as one strict deterministic local build-list/named-net export
  for AVR, RP2040 Pico, ESP32-C3 and STM32F429ZI.
- Includes authored electrical values, exact named endpoints, retained
  junction identity, version-locked model identity and only owner-declared
  physical connector/pin metadata.
- Keeps procurement fixed `not-provided` and excludes layout, source,
  firmware, runtime, results and physical-equivalence claims.
- Commits Inspector property edits on change or blur before export and cancels
  stale async exports before download; no producer, storage or service added.

## 1.1.0-rc.83 — 2026-10-20

- Moved the selected profile's real circuit canvas to the first useful desktop
  workbench surface and retained one authoritative canvas owner.
- Moved seven existing secondary owners into named accessible popup dialogs
  with focus trap, Escape handling, exact opener return and nested decisions.
- Preserved project/source state, named-pin wiring, file guards, local history,
  Inspector/Undo and pending drafts across popup and profile transitions.
- Added no firmware action, project schema, storage, model, compiler, runtime,
  service worker, endpoint or new functional-longlist completion.

## 1.1.0-rc.82 — 2026-10-20

- Published X86 as one strict static four-profile offline-support matrix on
  Support and at `/offline-support-matrix.json`, generated from one owner.
- Separates fresh offline navigation, loaded-document behavior, offline reload,
  local Download/Open, compiler ownership, runtime ownership and offline Run.
- Documents the verified loaded-tab local-file boundary while keeping fresh
  offline navigation/reload, compilation and execution explicitly unavailable.
- Adds no service worker, cache/offline engine, toolchain, executable
  persistence, account, storage, firmware action or runtime authority.

## 1.1.0-rc.81 — 2026-10-20

- Published X76 as a strict local physical-verification checklist for the four
  exact controller profiles and 23 finite profile-owned checks.
- Keeps physical evidence absent until manual entry and labels every entry
  unverified and non-certifying, with no pass, safety or compliance verdict.
- Adds bounded local Download/Open and complete current-state print projection;
  Ctrl+P regenerates from current data and incomplete drafts cannot reuse stale
  accepted content.
- Adds no hardware access, USB/device permission, firmware action, account,
  upload, analytics or server/browser persistence.

## 1.1.0-rc.80 — 2026-10-20

- Added X88 as one deterministic static `/release-changes.json` document with
  strict `intent-mcu-release-changes@1` parsing and canonical projection.
- Bound rc.79→rc.80 to exactly additive X88, the checked-in X01–X96 longlist,
  explicit migration/breaking flags and the exact implementation-source hash.
- Rejects unknown, duplicate, reordered, stale, oversized or authority-bearing
  input and keeps Apply, Build, Run, replay and verdict authority fixed false.
- Added an HTML alternate link plus concise `llms.txt` and Support discovery;
  no API, storage, producer, action or project/package schema was added.

## 1.1.0-rc.79 — 2026-10-20

- Published the independently reviewed X41 local comparison for two compatible
  canonical strict-v3 experiment packages.
- Added four deterministic Identity, Source, Circuit and Results groups using
  existing strict package, evidence, literal-diff and authored-change owners.
- Rejects model/tool/expectation/scenario/evidence drift, tampering, stale
  slots, incomplete evidence, no-op pairs and bounded-input overflow.
- Keeps original package bytes in the current tab only and adds no Apply,
  Build, Run, replay, upload, persistence, causal inference, score or verdict.

## 1.1.0-rc.78 — 2026-10-20

- Published the independently reviewed X63 optional browser-local version
  history for all four exact controller profiles.
- Kept history off by default with no database open or automatic capture;
  saving requires explicit opt-in and an explicit Save local version action.
- Added strict canonical identity validation, 3/10 shared retention, confirmed
  replacement/deletion, inert raw recovery for eligible corrupt records and
  atomic rollback on storage failures.
- Preserved ordinary Open validation and unsaved-change handling while never
  restoring file, Build, runtime, result or verdict authority. Versions stay
  in first-party browser storage and are not server storage or backup.

## 1.1.0-rc.77 — 2026-10-20

- Published the independently reviewed X64 detail inside the existing X05
  current/candidate proposal review for all four public profiles.
- Added deterministic typed authored facts for source files, catalogue-owned
  component properties/units, positions, exact net endpoints and saved tests.
- Added complete literal source-file differences with bounded line comparison,
  explicit complete non-minimal fallback and safe text-only rendering.
- Preserved X05 as the sole parser, stale-base lifecycle and Apply boundary;
  X64 adds no code-meaning inference, Build, Run, verdict or mutation authority.

## 1.1.0-rc.76 — 2026-10-20

- Published the independently reviewed X61 search over the complete current
  authored project for AVR, Pico, ESP32-C3 and STM32.
- Added keyboard activation for exact components, named pins, nets, files,
  source lines and saved requirement/test owners, plus AVR scenario owners.
- Rejects stale results by profile, generation, revision and graph identity;
  navigation preserves canonical data, dirty/history and runtime authority.
- Keeps queries/results transient and unsaved, makes no network request, and
  bounds visible excerpts without dropping valid authoritative search text.

## 1.1.0-rc.75 — 2026-10-20

- Published the independently reviewed X60 Connections disclosure in the
  existing Inspector for AVR, Pico, ESP32-C3 and STM32.
- Exposed every current net, endpoint and named pin as text, with keyboard-only
  select, delete, explicit reconnect, From/To creation and cancellation.
- Reused the existing strict graph transactions, revision checks and electrical
  validation, including atomic stale/rejected behavior and focus retention.
- Preserved project schemas, compiler/runtime producers, public services and
  local-file authority; accessibility UI state is never serialized.

## 1.1.0-rc.74 — 2026-10-20

- Published the independently reviewed X82 checkable-evidence report on the
  existing compact disclosure, covering every registered report and surface
  owner through finite source-specific adapters.
- Added a visible local file action for strict retained-package review. Imported
  evidence is labelled historical and read-only, grants no project, runtime,
  outcome or executable authority, and never starts firmware.
- Each visible native measurement now exposes its stable scenario/row ID,
  source observation coordinate, measurement unit and native time basis.
- Hashes bind identity and integrity rather than truth. Missing accepted source
  values remain typed unavailable, and source-contract-only retention gaps stay
  explicit rather than being promoted as retained canonical evidence.

## 1.1.0-rc.73 — 2026-10-19

- Published the independently reviewed X56 version-locked model-library
  boundary with exactly two immutable project-owned bundles: the retained
  pre-X56 library and the current library.
- Recognized older files bind to the retained bundle only after strict
  validation. An explicit preview-and-download migration creates a new
  envelope-v8 copy bound to the current bundle and never overwrites the open
  original.
- Opening or migrating a file grants no executable authority. A fresh Build is
  required before Run, and migration cannot replay prior firmware, runtime,
  result or verdict evidence.
- Preserved the four existing compiler/runtime producers, local-only project
  ownership, current privacy boundaries and public infrastructure.

## 1.1.0-rc.72 — 2026-10-19

- Published the independently reviewed X91 current-measurement completeness
  contract across the existing report, UI, export, headless and local-client
  surfaces without adding a panel or producer action.
- Completeness now derives from native producer facts, owner-specific
  identities and separate worker, reset and scenario intervals. Verdict text,
  row counts, target cycles and recursive min/max scans cannot manufacture it.
- Recompute canonical completeness when validating an experiment envelope;
  self-consistent but forged derived projections reject while retained X29–X34
  and X80 evidence stays compatible.
- Preserved local-only evidence, existing Build/Run authority, public limits,
  compiler/runtime images and infrastructure boundaries.

## 1.1.0-rc.71 — 2026-10-19

- Published the independently reviewed X80 complete experiment manifest for
  the bounded AVR thermostat package: source, executed runtime circuit,
  scenario, test, artifact, component-model and tool identities plus aggregate.
- Kept the authored ideal-temperature circuit under the full project binding
  while circuit/model hashes bind the exact potentiometer-compatible executed
  projection; the adapter makes no physical-sensor fidelity claim.
- Kept package v1 as strict legacy review data and package v2 local-only with no
  firmware bytes, runtime/executable/verdict authority, upload, account, cookie,
  analytics, third-party request or new panel.
- Added fail-closed generation/producer identity checks without changing the
  established Build, Run, scenario or public infrastructure boundaries.

## 1.1.0-rc.70 — 2026-10-19

- Published the independently reviewed X83 fair-access contract for every
  existing public HTTP 429 response across AVR/Pico, ESP32-C3 and STM32.
- Added one positive bounded integer `Retry-After` that exactly matches strict
  JSON retry metadata; rate windows derive from the oldest retained event.
- Capacity guidance is advisory, reserves no capacity and requires a fresh
  request ID. Missing, malformed or mismatched guidance never invents a delay,
  and neither the browser nor local external client retries automatically.
- Reused the existing project-message/status and Support surfaces without a
  new panel, scheduler, numerical limit change or firmware/runtime expansion.

## 1.1.0-rc.69 — 2026-10-19

- Published the independently reviewed X85 boundary: successful user firmware
  artifacts are no longer retained in or reused from a process-wide cache.
- Repeating identical source now creates a distinct private job and compiles
  again. The compatibility field `cacheHit` remains present and always false.
- Preserved five-minute per-job delivery/expiry, origin/capability isolation,
  queue, rate, cancel and timeout controls, pinned compiler/runtime images and
  curated public examples.
- Updated the public privacy wording without adding a panel or changing the
  established Build, Run, wiring, file or controller workflows.

## 1.1.0-rc.68 — 2026-10-19

- Published the independently reviewed X67 local experiment package for the
  bounded AVR thermostat journey. One compact action downloads authored source,
  circuit, timeline, exact independent expectation and current measured report
  only after all identities and completeness checks match.
- Kept source as inert package text and excluded compiled bytes plus executable,
  runtime and verdict authority. Strict canonical member hashes reject stale,
  relabelled, oversized, incomplete, duplicate and added-field packages.
- Reset, source/project change, stale expectation, missing result and unsupported
  profiles disable export. The browser performs no package upload, account,
  analytics, cookie or third-party request.
- Clarified that exact automatic-field exclusion cannot discover every secret a
  person may type into source or descriptions; authored text must be reviewed
  before sharing.

## 1.1.0-rc.67 — 2026-10-19

- Published the independently reviewed X65 controller-migration explanation as
  one compact, closed-by-default disclosure in the existing controller panel.
- Covered all 12 directed pairs among the exact AVR, RP2040 Pico, ESP32-C3 and
  STM32F429ZI profiles using current project source, named connected pins,
  component support and saved requirement authorities.
- Kept arbitrary AVR semantics and unresolved needs explicitly unknown. D13,
  GP0, GPIO2 and PB0 are never treated as aliases; no source, wire, part,
  project, result, executable or runtime authority is migrated automatically.
- Preserved parked and unsaved drafts, Open/cancel guards, the 21 existing
  examples and all compiler/runtime boundaries. A target project still needs
  manual source/circuit work followed by a fresh Build.

## 1.1.0-rc.66 — 2026-10-19

- Published the independently reviewed X72 learning progression: all fifteen
  AVR cards and six narrow-profile cards retain concise Learn, Try, Observe,
  Limits and Next guidance without changing any of the 21 project payloads.
- Updated Controllers, Components, Examples, Support and llms.txt to the
  current release identity, fifteen AVR cards and four reset-isolated M1
  scenarios. Added a focused test that validates these facts against the
  versioned release, canonical card catalogs, scenario contract and controller
  capability owners.
- Clarified that saved projects remain local while Build submits only bounded
  active-profile source to the Lab's same-origin isolated compiler for one
  temporary job. No account, durable cloud project, arbitrary command,
  package, hook or network-download authority was added.
- Preserved the exact AVR, RP2040, ESP32-C3 and STM32 runtime/model boundaries,
  data-only files, named wiring, stale-authority guards and desktop-only
  concise chooser layout.

## 1.1.0-rc.58 — 2026-10-19

- Published the independently accepted bounded X35 causal-chain report for one
  unmodified ATmega328P thermostat artifact. One selected instruction records
  the complete PORTB transition and raw D13 callback before joining the exact
  validated net/resistor path and project-owned ideal heater-LED projection at
  the same instruction boundary.
- Added strict event identity, artifact/source/graph binding and two-fresh-
  worker semantic equality. Opcode-caused output is kept distinct from later
  tick/peripheral changes; full PORTB values are retained while only bit 5 is
  selected.
- Added a concise five-stage presentation and transient JSON export. Build,
  Reset, source or circuit change, Open, worker retirement and reload clear
  report authority; saved projects contain no X35 runtime authority.
- The page explicitly separates emulator evidence and synchronous project-
  owned model consequence from physical causality. It does not claim source-
  line mapping, compiler correctness, silicon-bus proof, physical timing,
  generic register/debug access or other-profile equivalence; X35 therefore
  remains partial.

## 1.1.0-rc.57 — 2026-10-19

- Published the independently accepted bounded X34 units/precision report for
  one explicitly instrumented private ATmega328P thermostat fixture. Two fresh
  bound workers join cycle-zero controls, exact 81/40 V ideal input, ADC1 414,
  firmware-owned SRAM integer 30 and actual D13 OUTPUT LOW.
- Added strict exact-symbol ELF/SRAM validation, one four-byte read-only
  observer and worker generation/nonces so stale or mixed evidence cannot pass.
  Missing/incomplete transactions, Serial-only claims and host recomputation
  remain insufficient.
- Added concise quantity/unit/producer/comparison rows and transient JSON
  export. Build, Reset, source edit, Open and reload clear report authority;
  project files retain no probe, ELF, address or worker-nonce authority.
- The page prominently states that this is an instrumented fixture, not the
  unmodified public artifact. It does not claim physical SRAM/hardware,
  compiler correctness, sensor/ADC accuracy, generic memory/debug access or
  other-profile equivalence; X34 therefore remains partial.

## 1.1.0-rc.56 — 2026-10-19

- Published the independently accepted bounded X33 static synthetic AVR
  digital-state report. Known LOW, HIGH_Z, opposing-drive conflict and missing
  evidence remain visibly and semantically distinct across two repeats.
- Added strict pre-resolution annotation validation: unknown values and
  duplicate producer identity reject, while equal levels from distinct
  producers remain valid. Missing evidence never invents an UNKNOWN driver.
- Added the separate PULLED_HIGH companion, keyboard-accessible full records
  and transient JSON export. Reset, Open, reload and every new Build clear
  report authority.
- The presentation is explicitly a static synthetic circuit-model check. It
  does not claim compiled firmware, runtime execution, physical voltage,
  general dynamic/analogue net solving or cross-profile equivalence; X33
  therefore remains partial.

## 1.1.0-rc.55 — 2026-10-19

- Published the independently accepted bounded X32 unsupported-access report
  for one compiler-generated AVR SPI activation fixture. The report joins the
  exact producer access, fail-closed worker stop and affected requirement.
- Kept outcomes honest: the affected requirement is `unsupported`, never
  passed or evidence-backed firmware failure. Missing evidence remains
  `indeterminate`, and compiler, validation, runtime capability and
  infrastructure classifications stay separate.
- Added two-repeat semantic evidence, a supported companion, concise visible
  cause/outcome wording, keyboard-accessible full evidence and transient JSON
  export. Reset, new Build, Open and reload clear report authority.
- This remains one closed AVR SPI-write detector. It does not claim exhaustive
  register/peripheral coverage, read detection, other-profile normalization or
  physical-hardware equivalence; X32 therefore remains partial.

## 1.1.0-rc.54 — 2026-10-19

- Published the independently accepted bounded X31 reset-class report for one
  fixed AVR fixture. CPU reset, experiment restart and power-on now have a
  closed, visible retention table instead of being treated as equivalent fresh
  runs.
- Kept producer observations explicit: the fixed SRAM diagnostic changes from
  `0xA5` to zero; CPU reset retains the changed `.75`/`true` component controls,
  experiment restart applies declared `.25`/`false` cycle-zero inputs, and
  power-on restores `.5`/`false` with empty queue, log, trace, Serial and faults.
- Kept validation rejection, infrastructure failure and evidence-backed
  academic failure distinct. Missing or stale evidence cannot pass.
- Added concise class rows, keyboard-accessible full evidence and transient
  JSON export. Open and reload clear the report and export authority.
- This remains a fixture-only AVR simulator contract. It does not claim
  physical reset behavior, EEPROM retention, watchdog/brownout semantics or
  equivalence for other processor profiles; X31 therefore remains partial.

## 1.1.0-rc.53 — 2026-10-19

- Published the independently accepted bounded X30 AVR event-order report.
  Each fresh epoch crosses one reset barrier, applies the fixed cycle-zero
  inputs in ordinal order, takes a read-only sample, executes CPU work and
  finishes with a second read-only sample.
- Kept producer evidence explicit: the first sample remains at zero cycles and
  zero instructions without draining input, while the final sample records
  1,652,710 cycles and 1,100,000 instructions for the accepted fixture.
- Kept invalid ordinal plans separate from evidence-backed academic failure.
  Validation rejects before execution and creates no academic outcome; a
  completed producer run can independently fail its declared evidence rule.
- Added concise phase rows, keyboard-accessible full-evidence disclosures and
  transient JSON export. Open and reload clear report and export authority.
- This remains one bounded ATmega328P event-order fixture. It does not claim
  arbitrary scheduling, interrupt ordering, concurrency, physical timing or
  cross-profile equivalence.

## 1.1.0-rc.52 — 2026-10-19

- Published the independently accepted bounded X29 AVR time-invariance report.
  One compiled artifact runs the same immutable D2 target and D13/UART virtual
  requirement in fresh cycle-zero workers at 1x, maximum and Pause/resume.
- Kept CPU cycles, instruction count and derived 16 MHz virtual nanoseconds as
  separately typed producer observations. Host wall duration and measured
  throughput remain diagnostics excluded from requirement semantics.
- Proved that Pause freezes producer cycles, instructions, virtual time and the
  pending target while host wall time advances. A wall-based requirement is
  rejected before execution as a separate validation result and creates no
  academic outcome.
- Added concise human-readable comparison rows, keyboard-accessible native raw
  details and transient JSON export. Open, reload, source/circuit/profile
  changes and every new build clear the report and export authority.
- This remains one ATmega328P/avr8js 16 MHz contract. It does not claim
  physical time, real-time throughput, C3/STM32 producer time, cross-profile
  equivalence or X30 event-ordering support.

## 1.1.0-rc.51 — 2026-10-19

- Published the independently accepted bounded X28 AVR long-duration report:
  unsigned `millis()` wrap, five fresh reset epochs, 128 ordered D2 controls
  over actual virtual time, and a deliberately bad direct-deadline variant
  that fails academically while its runtime job completes.
- Replaced giant inline evidence JSON with concise labels and readable expected
  and observed facts. Academic and job outcomes remain separate, unbroken
  badges; complete expected, actual, outcome and raw-time records remain
  available in native keyboard-accessible disclosures.
- Kept canonical report/export/runtime behavior and authority clearing
  unchanged. The fixture-only timer seam does not claim physical time,
  arbitrary timers or MCUs, watchdog/brownout/EEPROM behavior, exhaustive
  state space or durability.

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
- Closed X19 by retaining a fresh compiled evidence test showing that matching
  `LED ON`/heater Serial text cannot override an observed D13 mismatch. This is
  acceptance evidence for the existing evaluator, not a new product variant.
- Closed X21 for the declared AVR thermostat subset with a visible fourth
  above-threshold case, fresh cycle-zero isolation for every compiled case and
  fail-closed removal tests for all six declared circuit nets. Connection-break
  evidence is structural validation, not a physical hot-unplug simulation.

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
