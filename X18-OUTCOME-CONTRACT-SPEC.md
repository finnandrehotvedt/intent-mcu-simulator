# X18 honest experiment outcome contract

Receipt: `desktop-etvt6l5-ct109-lab-x18-outcome-contract-20261018-001`

## Purpose

The existing supported thermostat experiment reports academic meaning separately
from job execution state. A missing observation must never look green, and a
cancelled, timed-out or broken job must never be presented as a learner's failed
assertion.

## Academic outcomes

- `passed`: all required producer evidence is complete and every supported
  assertion matches.
- `failed`: all required producer evidence is complete and at least one
  supported assertion is contradicted by the observed value.
- `indeterminate`: evidence is missing, incomplete, dropped or outside the
  saved observation window, or the job did not complete.
- `unsupported`: the requested experiment/profile has no approved evaluator.

Expected values are comparison input only. They cannot supply observed evidence.

## Job lifecycle

The bounded statuses are `completed`, `not-started`, `cancelled`, `timeout` and
`infrastructure-error`. Browser, external-client and headless projections retain
the academic outcome and job status as separate fields. Cancellation, timeout
and infrastructure error always have academic status `indeterminate`.

## Evidence and identity

Observation results retain the raw producer snapshot projection, actual virtual
time, input-event evidence and named checks. Completed browser/headless results
retain their existing project/source/compiler-input/artifact binding. The X11
external result envelope still retains the complete authoritative router result.

## Scope

This contract applies to the existing AVR thermostat M1 and X17 authored
timeline paths. It does not add a generic assertion language, X19 reporting,
another runtime, endpoint, account, persistence service or execution authority.
