# CMP-001, CMP-002 and CMP-037 — basic component qualification

This batch qualifies the existing fixed resistor, linear potentiometer and
single through-hole LED models with canonical beginner projects. The stable
example IDs, exact named wiring, values, source hashes, project hashes,
expected behavior and four-profile support truth are recorded in
`examples/basic-components/manifest.json`.

The resistor and LED share the validated AVR Blink circuit. The potentiometer
uses the validated ADC dial circuit. Reusing those circuits is intentional:
the manifest identifies the component-specific teaching purpose without
duplicating firmware or inventing a second electrical model.

All three models remain ideal teaching abstractions. They do not claim
physical tolerance, heating, optical calibration, contact noise or loading.
