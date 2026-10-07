# Intent MCU Simulator 1.0.0-rc.2

This tested application release candidate is deployed at
`https://lab.teachthecompany.com/` under receipt
`desktop-ct109-intent-mcu-rc2-public-deployment-20261007-13`. The deployed
application remains exact source commit
`64951b3fb039d77ec52713b2ad5fda3679d73ace` and production image config digest
`sha256:8f5f7abb95067e2c34ac3ed3b84d9115de7ca727ac4815881eeaef38eff52650`.

## User-visible changes from 0.9.0

- Project, build and runtime generations prevent stale build or worker output
  from returning after project changes.
- Orthogonal wire sections support direct dragging, branch selection,
  reconnect, bend insertion and branch-versus-whole-net deletion.
- Components move live while keeping pin endpoints attached; canvas zoom and
  pan are pointer-safe, and compact/focus/fullscreen workspaces improve small
  and dense layouts.
- The source editor adds line numbers, active-line highlighting and clickable
  compiler diagnostics. Serial output and graphical waveforms are readable
  instruments rather than raw diagnostic dumps.
- Projects have editable names, examples remain ordinary editable projects,
  and interrupted or quota-failed local saves have an explicit recovery path.
- The catalogue preserves search, category, interface, support, favourites and
  recent-part behaviour while separating operating-supply filters from declared
  pin-voltage limits and explaining empty results.

## Verified scope

The candidate supports the documented ATmega328P 16 MHz, 5 V subset and the
five selectable foundation parts: controller, resistor, LED, button and
potentiometer. PWM, pin-change interrupts, Timer0/1/2 bounded modes, ADC,
USART0, GPIO and circuit-driven controls remain covered by reference fixtures.

It does not claim a general analogue solver, another MCU engine, physical
hardware equivalence, or activation of a larger component list. Prompt Bridge
remains provider-neutral and imports only a validated circuit graph; it cannot
replace firmware or bypass electrical checks.

## Identity policy

The package, browser metadata, source archive, candidate containers and release
documents use `1.0.0-rc.2`. Exact source, public-source, image and evidence
hashes are recorded in the repository acceptance evidence after immutable
build/readback. The distinct deployment receipt repeated the exact source
commit and production image before public cutover. The immutable candidate
image remains receipt-neutral; the authorized runtime Compose receipt and
container labels mark the actual public deployment.
