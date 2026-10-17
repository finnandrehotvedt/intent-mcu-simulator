# Eight AVR reference starters rc.26 acceptance

## Locked scope

- L06 only: exactly eight public AVR reference starters for the existing
  ground reference, SPST, SPDT, analogue light, digital light threshold,
  active buzzer, seven-segment and quadrature encoder models.
- No component, pin, topology, controller, compiler feature, runtime adapter,
  source grammar or M2–M5 capability is added.
- SPDT and active buzzer remain Partial. The buzzer remains a silent logical
  indicator with no sound, current or acoustic-accuracy claim.
- The 19-model × 4-profile matrix remains 25 available and 51 unavailable.

## Candidate evidence

- `test/avr-reference-starters.test.mjs`: 4/4 pass for exact IDs, canonical
  runnable candidate-v3 projects, all-available-cell bindings and honest
  Partial limitations.
- Existing model and matrix suites: 34/34 pass for positive projections and
  exact fail-closed power, ground, polarity, resistor, pin and topology cases.
- `npm test`: 21/21 pretests and 193/193 regression tests pass.
- `test/starter-examples.cjs`: 15 card journeys and 16 dropdown journeys pass
  with no server-side project write or page overflow.
- `test/component-support-matrix-browser.cjs`: exact 19 rows, AVR 16, each
  narrow profile 3, keyboard/focus behavior and zero outside requests pass.
- `test/avr-reference-starters-browser.cjs`: all eight starters perform a fresh
  isolated AVR Build and worker Run. Observations cover grounded input, SPST,
  SPDT through BREAK, ADC light level, active-low threshold hysteresis, silent
  buzzer GPIO, seven-segment 0/1/2/8 and ordered CW/CCW encoder phases. Eight
  compiler requests, zero outside requests and zero horizontal overflow pass.
  Rendered seven-segment masks are exactly `abcdef`, `bc`, `abdeg` and
  `abcdefg`. Runtime input authority records CW as `01→00→10→11` on pins
  2/3/2/3 and CCW as `10→00→01→11` on pins 3/2/3/2. Every consecutive
  target-cycle delta is exactly 16000 cycles, or 1 ms at the locked 16 MHz
  profile.
- Browser image `avr-reference-starters-local.png` SHA-256:
  `175abbdf97d9921635645f64636efa438bb1468a5eb2c140e44c9c780beba3ba`.

## Release gates

- Source commit must equal pushed `origin/main` before publication.
- Immutable production image must be below 260000000 bytes.
- VM103 free bytes immediately before streamed import must be at least image
  logical bytes plus 500000000, with no archive written to VM103.
- UID 1000 must read every mounted lock/source JSON. Exact candidate Compose
  and rc.25 rollback environments must render, and rollback check mode must
  pass before live stop.
- Public completion requires all eight live starter Build/Run journeys, HTTPS
  and security headers, health/readiness, exact image/commit/container state,
  stop/start health and Teach-domain regressions. Final live evidence is stored
  in the station receipt RESULT so the deployed source commit remains exact.
