# Local headless saved-experiment runner

`tools/headless-experiment-runner.mjs` runs one downloaded AVR thermostat
experiment without starting a browser.

```sh
npm run experiment:headless -- ./Thermostat-boundary-test.intent-mcu.json
```

## Authority path

The runner does not implement a second simulator or verdict engine. It:

1. reads one regular file no larger than the existing project-envelope limit;
2. strictly parses the common project envelope and rejects executable or
   runtime authority embedded in the file;
3. reuses the thermostat project adapter and electrical admission;
4. submits the exact normalized source to the existing fixed AVR compiler
   route and accepts only its source-bound artifact identity;
5. creates a fresh shared `RuntimeKernel` for each fixed M1 or saved X17 case;
6. applies validated ordered controls at their authored virtual cycles; and
7. asks the shared domain engine and matching M1/X17 evaluator for each verdict.

The result associates the canonical project hash, normalized source digest,
compiler input identity, artifact identity, profile, firmware variant,
scenario IDs, virtual times and observed D13/UART/input evidence. No artifact,
generation, verdict or runtime session is restored from the saved file.

When envelope v6 contains an X17 timeline, the headless runner consumes that
same validated data. Each case has one explicit D13 observation window; the
result reports the actual capture time and never claims evidence from another
instant. Expected values remain comparison input only and cannot supply a pass.

The result exposes academic `passed`, `failed`, `indeterminate` or `unsupported`
separately from job `completed`, `not-started`, `cancelled`, `timeout` or
`infrastructure-error`. Failed requires complete contradictory producer
evidence; missing or out-of-window evidence is indeterminate.

## Supported subset

Only `board.atmega328p-16mhz-v1` with the exact
`avr-thermostat-boundary-v1` project and reviewed correct or known-bad equality
source is supported. Pico, ESP32-C3 and STM32 have distinct browser/server
runtime integrations and return `HEADLESS_PROFILE_UNSUPPORTED`; this runner
does not approximate them with AVR or source-level logic.

The compiler origin is fixed to `https://lab.teachthecompany.com`. A loopback
override exists only when `NODE_ENV=test`. There is no account, credential,
cloud project storage, public runner endpoint, arbitrary command, shell/eval,
package installation or Apply authority.
