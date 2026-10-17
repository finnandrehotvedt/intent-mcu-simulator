# Rc.22 review follow-up / rc.23 acceptance

Date: 2026-10-17

Receipt: `desktop-etvt6l5-ct109-lab-rc22-review-followup-20261017-001`

## Review findings

- Direct pointer selection works on the common Pico `net-gpio0` cable when the
  cable body is clicked. The earlier failed click landed on an overlapping
  terminal target rather than the cable hit path.
- Add bend works after the exact Select → colour → Undo → reselect journey.
  This path now has explicit browser regression coverage.
- AVR Blink did contain two positive-length collinear overlaps between distinct
  automatic nets. This was a real acceptance defect. Automatic routes now
  reserve earlier interior lanes as narrow obstacles, and rendered geometry
  contains no distinct-net positive-length overlap.
- Pico, ESP32-C3 and STM32 used a cream canvas while AVR used the agreed dark
  workbench. All four live editors now share one dark canvas/grid token without
  changing their real component, pin, wire or control implementations.

## Candidate evidence

- `test/canvas-theme-evidence.cjs` follows the visible family/profile selector
  workflow, captures all four workbenches, compares computed background colour,
  grid image and grid size, and checks narrow-profile label contrast.
- Public-before evidence records AVR as `rgb(8, 20, 31)` with a 22 px grid and
  all three narrow profiles as `rgb(243, 239, 228)` with a 20 px grid.
- Candidate-after evidence records all four profiles as `rgb(8, 20, 31)` with
  the same 22 px grid. The evidence script made no third-party request and saw
  no browser error.
- `test/bounded-route-authoring-browser.cjs` verifies rendered AVR lane
  geometry plus pointer selection, colour/Undo, Add-bend, movement, rejection,
  Escape and Download/Open across all three bounded profiles.
- Screenshots in `screenshots/` are visual evidence only; DOM geometry and
  computed browser styles remain the acceptance authority.

## Unchanged boundaries

No compiler, runtime, worker image, electrical graph, project schema, public
route, DNS, Caddy configuration, mobile scope, analytics, account, paid AI API
or physical-device capability was added or changed.
