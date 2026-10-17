# Bounded route authoring rc.22 acceptance

Date: 2026-10-17

Scope: `p1-bounded-route-authoring-clarity-parity-v1` for the accepted W02,
W03 and W04 narrow-controller graphs, while preserving the existing W01 AVR
route-authoring implementation.

## Candidate evidence

- Source base: `0b67cb15346b465eca4f4a8b516b56427e3ea593` (accepted rc.21).
- `npm test`: 192/192 passed after the route changes.
- `npm run pretest`: capability and bounded route-model tests passed.
- `test/named-pin-wire-authoring-browser.cjs`: Pico, ESP32-C3 and STM32 passed
  named-pin selection, endpoint reconnect, Escape, Undo/Redo, attachment,
  body avoidance, rotation, Fit, responsive rendering and file Open.
- `test/bounded-route-authoring-browser.cjs`: all three narrow profiles passed
  Add bend, safe segment movement, six-colour selection, authority preservation,
  WIRE-LANE-01 rendered checks, malformed diagonal atomic rejection, Escape,
  actual Download/Open and repeated Open.
- Browser requests remained first-party and browser consoles remained clean.

The final production image, VM103 image ID, live HTTPS checks, four-profile
Build/Run acceptance and rollback backup are recorded below only after public
deployment acceptance.

## Visual candidate

- `screenshots/bounded-route-authoring-desktop.png`
- SHA-256:
  `22d8106fc2c36aac3484f00a5f3a65a51377ffac315c1c2a7e869e7750d049de`

## Electrical and execution boundary

Stored route families and cable colours are validated layout only. Existing
named-pin nets remain the sole topology/electrical authority. Crossings do not
create junctions. Layout-only history does not revise source, firmware,
artifact or electrical acceptance; endpoint reconnection keeps the established
electrical invalidation path and retires stale route geometry.
