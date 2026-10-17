# Supported-function example pack / rc.24 acceptance

Date: 2026-10-17

Receipt: `desktop-etvt6l5-ct109-lab-supported-example-pack-20261017-001`

## Locked U03 coverage

- AVR button has `button` and `avr-thermostat-boundary-v1`; ADC has `adc`,
  `temperature-lcd-threshold` and `avr-thermostat-boundary-v1`; PWM has `pwm`
  and new `pwm-pulse`; Serial has multiple existing/new starters.
- RP2040 Pico, ESP32-C3 and STM32F429ZI each expose two visible distinct
  UART/output examples: HIGH/on and LOW/off with exact profile-specific text.
- Button, ADC and PWM remain explicitly unavailable on those three narrow
  profiles. No unsupported cell receives an example or capability claim.
- `src/supported-example-pack.mjs` is the machine-readable coverage owner.

## Candidate acceptance

- Source tests pass 193/193 plus 12/12 pretests. The U03 unit suite proves
  every supported matrix cell has at least two example IDs and every
  unavailable cell has none.
- `test/supported-example-pack-browser.cjs` passes the seven new lessons in one
  integrated Chromium run: fresh Build and actual Run for AVR PWM pulse,
  Pico on/off, C3 on/off and STM32 on/off; exact PWM/LED/UART outcomes match.
- The same rendered suite passes all six narrow example cards, Learn/Try/
  Observe/Limits copy, zero horizontal overflow, no browser errors, no outside
  requests, stale-authority retirement and the unsaved-change Discard path.
- `test/starter-examples.cjs` passes all seven AVR card journeys and eight
  compact-selector journeys with zero server project writes.
- `test/all-profile-local-files.cjs` passes actual Download/Open on all four
  profiles, deep authored-data comparison, data-only exclusion, fresh-page
  file chooser, malformed/cross-profile atomic rejection and no server writes.
- The screenshot `screenshots/example-pack-stm32.png` is visual evidence only;
  DOM state, strict validators and executed output remain acceptance authority.

## Preserved boundaries

The release adds no component, pin, electrical topology, source API, compiler,
runtime, SDK, branch/junction, arbitrary graph, account, durable server project,
paid AI call, physical-device capability, DNS, Caddy or unrelated service.
C3 UART remains actual QEMU evidence while its LED remains the separately
labelled project-owned GPIO2 model.

## Publication gate

U03 may move from partial to complete only after GitHub `main`, the VM103
container and the public HTTPS body agree on one exact rc.24 commit/image and
the targeted live cards, Build/Run, file, security and Teach-domain checks pass.
