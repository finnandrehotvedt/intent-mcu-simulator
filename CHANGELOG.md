# Changelog

All notable public source changes are recorded here.

## Unreleased expansion candidate — 2026-10-13

- Added account-free Save/Open project files. Supporting browsers use a native
  user-selected file handle; other browsers use deterministic download and
  file-input fallback. Browser recovery remains a separately labelled crash-
  recovery aid, and no project/source is stored by the server.
- Added three-engine coverage for native save/open, fallback round-trip,
  cancellation, invalid-file atomicity, 1440/768/390/320 layouts and zero
  server-side project mutation requests.

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
- This entry describes a local tested candidate. The deployed public rc.2 is
  unchanged until a separate deployment receipt approves an exact candidate.

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
