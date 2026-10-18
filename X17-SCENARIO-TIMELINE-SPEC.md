# X17 bounded scenario timeline editor

## Scope

X17 adds one reusable data-only timeline to the existing AVR thermostat
experiment. A learner may add, rename and delete cases; add, edit and delete
ordered ideal-temperature and active-low-button inputs; and define one expected
D13 level over one explicit bounded observation window. It does not add a
general assertion language or support another experiment/profile.

## Authority and timing

- Timeline data never contains firmware, artifacts, runtime snapshots, results
  or verdicts.
- The expectation is only comparison input. A pass requires the actual compiled
  runtime pin, complete ordered control evidence and an actual capture time
  inside the saved observation window.
- Input events at the same virtual millisecond have one canonical ordering:
  temperature, then button. Duplicate same-kind/component/time slots reject.
- Every input must precede the observation-window start by at least 1 ms.
- Browser worker cadence may capture after the window starts; the actual time is
  displayed. It is never described as evidence from the start instant.

## Persistence and invalidation

The common wrapper is `intent-mcu-project-envelope@6`. Version 5 migrates with
an empty timeline. Save/Open preserves only validated authored timeline data,
clears results and executable authority, and requires a fresh Build. A timeline
edit clears prior authored results immediately while preserving unchanged
firmware source and the currently matching artifact identity.

## Limits

The fixed profile allows at most 8 scenarios and 24 events per scenario.
Inputs are limited to 0–300 ms, ideal temperature to −50–150 °C, and the
observation window to 160–350 ms. Unknown pins, components, event kinds, fields,
profiles, duplicate IDs, ambiguous slots, reversed windows and unordered input
reject atomically.
