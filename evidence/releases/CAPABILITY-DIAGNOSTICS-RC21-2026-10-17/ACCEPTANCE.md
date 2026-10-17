# Controller capability and diagnostics parity rc.21 acceptance

Receipt: `desktop-etvt6l5-ct109-lab-capability-diagnostics-20261017-001`
Date: 2026-10-17

## Accepted scope

- C02/C03 expose one exact GPIO, ADC, PWM, UART, timer and interrupt matrix
  for ATmega328P, RP2040 Pico, ESP32-C3 and STM32F429ZI. Tested runtime paths,
  separate project-owned models and unavailable categories remain distinct.
- The reference lists the source file, admitted grammar, headers and library
  boundary actually enforced by each existing compiler path. It does not add
  a runtime, SDK, header, library, pin or peripheral.
- C04 gives all four profiles one accessible Build diagnostics pattern. A
  current exact file/line result can focus its source editor without changing
  text. Unknown files, missing or out-of-range locations, stale revisions and
  cross-profile results are readable but cannot navigate.
- Internal path prefixes and control characters are removed before a
  diagnostic reaches the browser. Navigation remains bound to the exact
  profile, source revision, file and source text.
- Existing unsaved-change, native/download/Open, legacy export, wiring,
  Fullscreen and fresh-Build authority boundaries remain unchanged.

## Verification

- Source build passed; capability/diagnostic unit tests: 5/5; existing source
  tests: 191/191.
- Chromium, Firefox and WebKit documentation acceptance passed with zero page
  errors and zero cookies.
- Integrated Chromium acceptance completed the real bad source → failed Build
  → keyboard source navigation → correction → fresh successful Build journey
  for AVR, Pico, ESP32-C3 and STM32. AVR used the isolated compiler; the other
  three exercised their existing bounded compiler paths. No paid AI API or
  physical hardware was used.
- The ESP32-C3 reference keeps actual QEMU CPU/UART evidence separate from the
  IntentForce GPIO2 model. STM32 keeps observed Renode PB0 separate from its
  ideal LED teaching rendering.
- Candidate capability-reference screenshot SHA-256:
  `4d0dac1d351009687404393b54418956df3136f5aac08169014434c1e7f70252`.

The immutable source commit, production image digest, rollback backup, disk
preflight, live HTTPS/browser readback and final C02/C03/C04 transition are
recorded in the station receipt result after public acceptance.
