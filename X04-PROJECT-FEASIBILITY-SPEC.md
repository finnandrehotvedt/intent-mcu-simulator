# X04 project feasibility preflight contract

Receipt: `desktop-etvt6l5-ct109-lab-x04-project-feasibility-20261018-001`

## Bounded outcome

Before Build, every public profile can compare explicit project-required
peripherals and components with the existing controller-capability and
component-support authorities. The UI and a read-only browser API expose each
need as exactly `available`, `unsupported`, `unknown` or `unresolved`, with a
stable reason and without inferring firmware support or a verdict.

## Data and authority

- The common envelope advances to `intent-mcu-project-envelope@5` and brief to
  `intent-mcu-project-brief@4`; rc.33 and older supported files migrate with an
  empty `requiredCapabilities` list while preserving X01–X03 fields.
- Each bounded need has a stable uppercase ID, kind `peripheral` or
  `component`, a target (`?` means explicitly unresolved), and optional links
  to existing requirement IDs.
- Peripheral targets resolve only through `CONTROLLER_CAPABILITIES`.
  Component targets resolve only through `COMPONENT_SUPPORT_CELLS`. A known
  unavailable target is unsupported; an absent target is unknown; `?` is
  unresolved; only an authority-listed available target is available.
- Preflight is deterministic read-only project metadata. It cannot select a
  compiler, alter a circuit, block or authorize Build, execute code, create a
  test result, claim a verdict, or upgrade project-model support to tested.

## Acceptance

1. Unit tests cover all four states, exact authority provenance, strict shape,
   migration and no inferred support.
2. One browser acceptance authors and visibly evaluates an available,
   unsupported, unknown and unresolved need before Build, exposes the same
   result through the read-only API, and proves edits preserve source,
   circuit, artifact and runtime.
3. Download/Open preserves only authored needs and recomputes feasibility from
   current project-owned authorities; no saved status or verdict is accepted.
4. Existing X01–X03 file semantics, controller limits and targeted regressions
   pass. Publication keeps exact rc.33 rollback, matched GitHub SHA, HTTPS
   security, current-release readback and at least 500 MB VM reserve.

