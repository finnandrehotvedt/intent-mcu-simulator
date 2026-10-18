# X21 exact boundary, reset and connection-break suite

Receipt: `desktop-etvt6l5-ct109-lab-x21-boundary-suite-20261018-001`

X21 is bounded to the existing ATmega328P thermostat, ideal linear temperature
module, active-low ideal button and current-limited D13 LED-command indicator.
The fixed suite executes four cases from independent cycle-zero runtime starts:

- module 30 °C quantizes to measured 29 °C, enabled: D13 HIGH;
- module 31 °C quantizes to measured 30 °C, enabled: D13 LOW;
- module 32 °C quantizes to measured 31 °C, enabled: D13 LOW;
- module 30 °C quantizes to measured 29 °C, disabled: D13 LOW.

The firmware conversion has an exact `200 / 1024 = 0.1953125 °C` ADC-count
step before integer truncation. The controlled module values above are chosen
to produce the stated executed integer readings; they are not claims of
physical sensor accuracy.

Every scenario uses a fresh runtime at cycle 0, starts with an empty input-event
log, applies exactly its own temperature and button controls at cycle 0, and is
observed only in the existing 160–350 ms window. Correct firmware must pass all
four cases. The deliberately bad `<=` variant must fail equality and pass the
other three, proving the test catches a real boundary defect.

All six declared thermostat nets are separately removed before project
admission. Each broken graph must fail closed with its existing stable
validation code. This is structural pre-execution connection-break evidence;
the runtime does not claim to model a physical wire being pulled during
execution.

The browser-owned and browser-free paths continue to use the same project,
compiler, RuntimeKernel and shared evaluator. This milestone adds no generic
assertion language, X22/X23 work, all-controller claim, endpoint or service.
