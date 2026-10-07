# Intent MCU Simulator 1.0.0-rc.2

This is the tested application release candidate. It is not the currently
deployed public version. The public lab remains on `0.9.0` until a separate
receipt names the accepted source commit and immutable production image.

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
build/readback. A deployment receipt must repeat the exact source commit and
production image ID before public cutover. The immutable candidate image is
labelled non-public; the separately authorized runtime Compose receipt and
container labels are what mark an actual public deployment.
