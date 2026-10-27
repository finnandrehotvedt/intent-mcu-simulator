# CMP-038, CMP-042 and CMP-064 — indicators and actuator

This batch qualifies the existing common-cathode RGB LED, single-digit
common-cathode seven-segment display and active buzzer models. Canonical
downloadable projects, stable IDs, named wiring, source/project hashes,
expected visible behavior and four-profile truth are recorded in
`examples/indicators-actuators/manifest.json`.

The RGB and seven-segment models require one validated series resistor per LED
channel. The active buzzer is deliberately a silent logical output indicator;
it does not claim browser audio or physical acoustic behavior. These exact
models are AVR-only until separately validated adapters exist on other
profiles.
