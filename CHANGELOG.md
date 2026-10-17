# Changelog

All notable public source changes are recorded here.

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
