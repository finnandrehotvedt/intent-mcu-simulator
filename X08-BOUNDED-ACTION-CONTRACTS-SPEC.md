# X08 bounded local action contracts

Receipt: `desktop-etvt6l5-ct109-lab-x08-bounded-action-contracts-20261018-001`

## Exact outcome

The local programmatic adapter exposes seven separate, versioned actions:
create project, propose patch, validate project, build firmware, run firmware,
read current result and export project data. Each action delegates to the
existing UI implementation and its current controller, electrical, lifecycle,
compiler/runtime and evidence authority. There is no generic command action,
external endpoint or weaker agent-only implementation.

## Request boundary

- Schema `intent-mcu-bounded-action-request@1`; router identity
  `intent-mcu-bounded-action-router@1`.
- Every request has exactly `schema`, `action`, `requestId`, `profile`,
  `expectedGeneration`, `issuedAtMs`, `expiresAtMs` and `payload`.
- Stable action IDs are `project.create`, `patch.propose`, `project.validate`,
  `firmware.build`, `runtime.run`, `result.read` and `project.export`.
- `project.create` accepts only one approved starter ID. `patch.propose`
  accepts one bounded inert description. All other payloads are exactly empty.
- Strict duplicate/prototype-safe parsing, profile/generation matching, a
  maximum 30-second TTL, one active request and bounded result size apply.
  Unknown fields/actions, stale generations, replayed IDs and expired requests
  reject before a handler runs.

## Authority and lifecycle

- The router grants only the effect named by the action. Content is data and
  cannot select another action, handler, profile, command, URL or tool.
- Create and export remain accountless local project operations. Export returns
  canonical data only; it does not claim a completed browser/OS write.
- Propose returns the existing local portable prompt and makes no live AI call.
- Validate delegates to the X07 shared project/electrical engine.
- Build and Run call the existing active-profile UI implementations. They do
  not bypass current circuit admission, fixed compiler profiles, source
  generations, lifecycle guards, queue/resource limits or source-bound
  artifact checks.
- Read result returns only current source-bound runtime evidence and never
  invents a verdict. Stale or absent evidence rejects.
- Each active request owns an AbortSignal. Explicit cancellation or expiry
  invalidates that request; Build additionally invokes the existing scoped job
  cancellation path. No result from a cancelled/stale action can be accepted.

## Acceptance

- Unit tests prove exact action/payload shapes, separate authority, TTL,
  generation, replay, single-active-request, cancellation and result limits.
- A Chromium journey uses only the local adapter to create the approved AVR
  thermostat project, propose a patch prompt, validate through X07, build in
  the isolated compiler, run actual firmware, read source-bound evidence and
  export the exact common project envelope.
- Existing visible controls remain usable and display the latest action and
  seven separate contracts. X07 remains a local adapter, not an externally
  connected endpoint. X09-X15 remain separate.
