# X06 same-requirements design comparison contract

Receipt: `desktop-etvt6l5-ct109-lab-x06-design-comparison-20261018-001`

## Exact outcome

A user with one strictly reviewed X05 proposal can compare the current design
and proposed design side by side against the same saved project requirements
and the active controller profile's documented model limits before deciding
whether to Apply. The comparison is informative and grants no Apply, Build,
Run, support or test-verdict authority.

## Comparison authority

- Schema: `intent-mcu-design-comparison@1`.
- Both alternatives are complete current `intent-mcu-project-envelope@5`
  documents revalidated by the existing duplicate/prototype-safe parser and
  active-profile adapter.
- The current canonical project SHA-256 and reviewed X05 candidate SHA-256 are
  rechecked when comparison is created. Stale review state rejects.
- Both alternatives must have byte-equivalent normalized project briefs,
  including purpose, inputs, outputs, boundary cases, acceptance criteria,
  open questions and required capabilities. Requirement drift rejects instead
  of comparing unlike goals.
- Required-capability rows are projected through the existing X04 feasibility
  authority. Controller limitation text comes from the existing public
  controller workbench owner. Project content cannot author either source.

## Visible comparison

- Two labelled cards show exact project identity, source/component/wire
  counts and the same requirement IDs.
- Each card shows the same documented active-profile model limitation and one
  row per required capability with the existing `available`, `unsupported`,
  `unknown` or `unresolved` state and reason.
- A deterministic difference list shows source, component and wire changes.
  No score, recommendation, winner, pass/fail result or synthetic runtime
  evidence is produced.
- Comparison is transient, local to the tab and never saved with the project.
  Editing the patch, changing profile, applying a patch or changing the
  current project clears it.

## Acceptance

- Unit tests cover same-requirements success, exact metrics/differences/model
  limits, profile mismatch, requirement drift, stale identities, unsupported
  project data and absence of verdict/Build authority.
- One integrated Chromium journey reviews a Pico patch, compares exactly two
  visible alternatives, proves current project/runtime remain unchanged,
  checks same requirements and model-limit provenance, then applies through
  the unchanged X05 boundary and proves comparison invalidation.
- A data-only browser journey exercises comparison for ATmega328P, RP2040,
  ESP32-C3 and STM32 without rerunning unchanged costly runtime paths.
- Existing X01–X05 data, patch atomicity and every public controller/runtime
  limit remain unchanged.
