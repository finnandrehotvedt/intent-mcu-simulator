# X22 bounded seeded property suite

Receipt: `desktop-etvt6l5-ct109-lab-x22-seeded-properties-20261018-001`

X22 is limited to the existing ATmega328P thermostat experiment and its shared
X17 timeline, compiler, runtime and X18 evaluator. It is a deterministic set of
valid input variants, not a generic assertion language or an unbounded fuzzer.

The suite uses `lcg32-1664525-1013904223-v1`, algorithm version 1, with an
unsigned 32-bit seed. Each run has exactly eight scenarios, three events per
scenario and 24 events in total. Generation consumes exactly 15 PRNG steps.
Module temperature is an integer from -50 through 150 °C and button state is a
boolean. The observation window is 160 through 350 virtual milliseconds, so a
suite can consume at most 350 virtual milliseconds per independently reset
scenario.

The first PRNG value chooses the position of one reviewed boundary case:
module 31 °C and button pressed. The other seven cases consume two values each,
first for temperature and then for button state. An accidentally repeated
boundary case is changed to button released. Expectations are calculated from
the existing ideal module-to-ADC conversion and the required strict
`measuredTemperatureC < 30` rule. This guarantees one reproducible
counterexample for the deliberately bad `<=` firmware while correct freshly
compiled firmware must pass all eight cases.

The timeline schema records the exact algorithm, version, seed, ranges, case
count and resource budget. Opening or replaying it regenerates the sequence and
rejects any mismatch. The same seed must produce byte-equivalent scenario data;
a different reviewed seed must produce a different sequence. Manual timeline
editing removes the seeded-suite claim unless Undo restores the untouched
generated timeline.

Save/Open stores only canonical project and timeline data. It stores no build,
artifact, runtime, observation or verdict authority. Browser and headless
execution both compile fresh and execute the saved sequence through the actual
producer. Expected values and actual observations remain separate, each actual
timestamp must remain inside its declared observation window, missing producer
evidence is X18 indeterminate, and unsupported profiles are explicit.

This milestone adds no X23 work, service, endpoint, public deployment,
all-controller claim, account, credential, Apply path or physical-hardware
claim. The fixed four-case M1/X21 suite and X17 lifecycle remain independent
regression contracts.
