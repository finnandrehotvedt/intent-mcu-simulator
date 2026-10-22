# X92 aggregate AI experiment budget — bounded private contract

Status: approved private implementation contract; bounded browser-session slice implemented for review. X92 remains open and is not public-release authority.

## Original requirement

`Maks antall bygg, kjøringer og samlet ressursbruk; agenten returnerer uløste problemer når budsjettet er brukt.`

The first private increment adds one fail-closed, project-session-local budget
around the existing bounded external/headless experiment action path. It is an
accounting and dispatch guard, not a new agent, producer, scheduler, service,
account system or verdict owner.

## Authority model

One active experiment session owns the only authoritative budget ledger. The
ledger is created explicitly with fixed implementation defaults and is held in
the current application session. It binds the current project generation,
source identity, graph identity and selected controller profile. It grants no
Apply, Build, Run, retry, scenario, executable, runtime or verdict authority;
every action still needs its existing authorization and identity checks.

Save/Open and exported reports may contain a data-only review projection of
limits, consumed units, terminal reservations and unresolved items. Imported
data is untrusted and inert: it cannot restore an active ledger, runtime
identity, reservation, permission, worker, executable result or verdict; it
cannot reset consumption or raise the active limits. Opening a file therefore
requires an explicit new experiment session before any budgeted action.

There is no durable server budget storage, user account or cross-session
authority. Browser reload, process restart, project Open and explicit New
session retire the active ledger. A new session starts from the same fixed
defaults only through an explicit user action and has a new session identity.
This is lifecycle behavior, not recovery of an imported ledger.

Source, graph or profile changes immediately retire current runtime binding,
reservations and executable/result authority. They never replenish consumed
units in the still-active budget session. A following action needs the normal
fresh Build/runtime path and must still fit the remaining budget.

## Fixed private defaults

- Build dispatches: `2`
- Run dispatches: `4`
- Scenario attempts: `8`
- Authoritative worker wall-clock budget: `120000 ms`

These are implementation constants for the first private slice, not user
configuration and not restored from project data.

Resource accounting uses only actual measurements already emitted by the
existing action/worker path, with the measurement source and unit recorded.
CPU virtual time, emulated cycles and controller-specific virtual milliseconds
must not be relabelled as wall time or normalized across controllers. No
cross-controller execution-unit total is claimed until a separate source and
conversion contract exists.

## Reservation, deadline and terminal accounting

Before producer dispatch, the guard atomically reserves one action count, the
declared scenario count and a caller-independent upper wall-clock bound that
fits the remaining budget. The existing producer is then invoked with an
enforced deadline no later than that reservation. A request that cannot reserve
every applicable dimension is rejected before producer contact.

One idempotency key binds session, request and reservation. Success, failure,
timeout and acknowledged cancellation finalize the reservation exactly once.
Duplicate or late completion cannot consume twice or restore capacity. Actual
available measured wall time is consumed up to the reservation; any unused
remainder is released only after an authenticated terminal completion.

If the worker crashes, disappears, cannot confirm cancellation or omits its
required final wall-time measurement, the reservation remains fully consumed
and the outcome is `indeterminate`. Missing measurement is never counted as
zero. Recovery after application restart cannot resurrect or release an old
reservation because the old active session is retired.

## Exhaustion result

When a requested action cannot fit, the guard performs no producer dispatch
and returns a deterministic data-only terminal result containing:

- code `budget_exhausted`;
- session and project/source/graph/profile identities;
- fixed limits, finalized consumption, active reservations and remaining
  capacity for every dimension;
- unresolved problems not attempted, in stable input order;
- the exact dimension or dimensions that prevented reservation;
- `authority` false for Apply, Build, Run, retry, replay and verdict.

## Acceptance criteria

1. A strict versioned parser rejects unknown fields, duplicate keys, negative,
   fractional or non-finite values, arithmetic overflow, impossible totals and
   stale identity.
2. Imported Save/Open/review data is demonstrably inert and cannot create or
   restore active budget, runtime, reservation, executable, permission or
   verdict authority; it cannot raise limits or replenish consumption.
3. Explicit New session creates a new identity with fixed defaults. Reload,
   restart and Open retire the old active ledger and reservations rather than
   restoring them.
4. Source, graph and profile edits clear runtime binding and pending action
   authority without increasing any consumed or remaining budget value in the
   active session.
5. Pre-dispatch reservation is atomic under two concurrent requests; only the
   request that fits receives producer dispatch.
6. Build, Run and scenario counts are charged exactly once for success,
   producer failure, timeout, cancellation and worker crash according to the
   documented dispatch boundary.
7. Deadline enforcement is no later than the reserved upper bound. Missing
   final measurement, unconfirmed cancellation or worker loss consumes the
   full reservation and produces an indeterminate result.
8. Duplicate, replayed and late terminal callbacks are idempotent and cannot
   double-charge, release another request's reservation or change a terminal
   outcome.
9. Resource rows identify their actual measurement source and unit. Tests
   reject relabelled virtual CPU/emulator time and any undefined cross-profile
   normalization.
10. Exhaustion blocks producer contact and returns all unattempted unresolved
    problems in deterministic order with no action or verdict authority.
11. The budget surface is keyboard-accessible and readable at wide and narrow
    widths with no horizontal overflow. It distinguishes limits, consumption,
    reservations, remaining capacity and indeterminate accounting.
12. Existing manual Build/Run behavior is unchanged when no active experiment
    budget session exists; the budget never bypasses existing bounded-action,
    identity, concurrency, cancellation or worker controls.

## Test and producer budget

Implementation and deterministic acceptance use fake clocks and producer
adapters: `0 Build / 0 Run / 0 scenario / 0 worker`.

One later, separately authorized private integration proof may use at most
`1 Build / 1 Run / 1 scenario / 1 existing worker`, with no retry. It may prove
only the already existing actual path and measurements. Failure or ambiguity
stops with the unresolved condition; it cannot be converted into full X92
closure or inferred producer proof.

## Exclusions

No paid AI API, new producer, worker type, service, scheduler, public endpoint,
account, durable server storage, billing/token accounting, user-configurable
quota, cross-user quota, cross-controller normalization, physical-device
authority or public deployment belongs to this increment.
