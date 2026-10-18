# W10 fault-validation acceptance contract

Receipt: `desktop-etvt6l5-ct109-lab-w10-fault-validation-20261018-001`

## Scope and truth boundary

W10 completes only for faults representable by the four approved public
profiles. It does not claim a general circuit solver, arbitrary rail mixing,
physical damage prediction, thermal behavior, component tolerances, breadboard
parasitics, current sourcing accuracy or real-world safety certification.

- Ordinary and candidate AVR validate their existing 5 V reference, ground,
  named digital/analogue pins and already supported component paths.
- RP2040 Pico, ESP32-C3 and STM32 keep one fixed 3.3 V output → resistor → LED
  → ground graph. They validate only that graph's missing ground/path,
  polarity, current limiting and bounded ideal peak current.
- Cross-controller wiring and arbitrary 5 V/3.3 V rail interconnection remain
  unavailable, not silently accepted or described as simulated.

## Required fault coverage

1. A supported AVR 5 V-to-ground net rejects as `POWER_SHORT` or
   `PROJECT_CONTACT_POWER_SHORT` before execution.
2. Multiple supported digital outputs with opposing known drive levels reject
   as `OUTPUT_CONTENTION`; same-level or high-impedance combinations do not
   fabricate contention. A shared AVR net with multiple unresolved digital I/O
   pins rejects separately as `MULTIPLE_DIGITAL_IO_NET_UNSUPPORTED` because
   firmware can later change pin direction or drive.
3. A component terminal connected outside its declared voltage/supply role
   rejects with the existing component-specific wrong-supply/ground/path code.
   Unsupported cross-controller voltage topology remains explicitly
   unavailable.
4. Missing ground, reversed LED polarity, missing series resistance and
   bounded ideal-model overcurrent reject on every profile where representable.
5. Each accepted validator result carries a stable code, bounded references and
   a concrete corrective action. Copy must say ideal/modelled where applicable
   and must not imply physical safety.

## Transaction and runtime invariants

- An unsafe topology edit is byte-atomic: project, revision and Undo/Redo
  history remain unchanged.
- A structurally editable but electrically unrunnable draft may be saved, but
  Build/Run remain blocked and prior executable/runtime evidence is retired.
- Layout-only move, rotate and route styling retain their existing generation
  behavior. Electrical/source/property changes keep the existing fresh-Build
  rule.
- Download/Open remains authored data only and restores no runtime authority.
- W06 branch actions, W07 history, W08 placement/duplication, stable IDs,
  named pins, junctions and routes remain unchanged.

## Acceptance

- Unit tests cover short, opposing-output contention, same-level/high-Z
  non-contention, wrong supply/cross-voltage boundary, missing ground,
  polarity, resistance and overcurrent across all representable profiles.
- Editor tests prove unsafe mutation rejection is atomic and runnable drafts
  remain blocked with actionable diagnostics.
- Chromium proves the public fault journey, exact visible corrective action,
  disabled Run, no outside request/error and no horizontal overflow.
- Full source regression, W06/W07/W08 browser regression, dense geometry,
  HTTPS/security/regression URLs, restart, exact GitHub SHA and app-only
  rollback all pass before public completion.
- Completion changes P1 from 57 complete / 2 partial to 58 complete / 1
  partial. Remaining P1 ID is I03. X status changes only if independently
  reconciled; otherwise it remains 11 complete / 35 partial / 50 planned.
