# Changelog

All notable public source changes are recorded here.

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
