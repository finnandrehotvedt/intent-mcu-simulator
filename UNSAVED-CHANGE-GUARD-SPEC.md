# Unsaved-change guard contract

Status: approved implementation contract, 2026-10-17  
Receipt: `desktop-etvt6l5-ct109-lab-unsaved-change-guard-20261017-001`

## Trigger

The active profile is dirty when its current canonical authored project differs
from the clean baseline installed at page start, successful Open, or confirmed
New. Source, name, supported component properties, circuit topology, layout,
rotation and wire styling are authored data. Runtime output and browser
recovery are not file baselines.

Show one accessible in-app confirmation only when either action would replace
dirty authored data:

- AVR **New empty**;
- a strictly parsed and completely validated same-profile Open.

Malformed, oversized, unknown, mismatched or cancelled input never opens the
guard. Cross-family Open parks the current profile and follows the existing
detached validation/routing contract without an unsolicited prompt.

## Outcomes

- **Keep editing**, Escape and dialog close preserve the exact profile, draft,
  edit history, lifecycle and runtime. The pending action cannot run later.
- **Discard and continue** executes the already validated action once. Existing
  lifecycle code retires executable/runtime authority where required.
- **Download copy** requests the existing canonical data-only browser download
  but does not dismiss the guard or mark a durable file write as confirmed.
  The learner must explicitly choose Keep editing or Discard and continue.
- A failed or cancelled download can never authorize discard.

## Boundary

This increment adds no native file handle, location-choice, Save-copy,
account, server storage, collaboration, analytics, controller, component,
compiler/runtime, arbitrary graph, routing, paid API or M2-M5 capability.

The interactive workbench is desktop-only for this release. Desktop keyboard,
focus, Escape and pointer acceptance remains required. Existing responsive
styles and crawlable information pages are preserved, but mobile/tablet
navigation and workbench usability are not release acceptance gates.
