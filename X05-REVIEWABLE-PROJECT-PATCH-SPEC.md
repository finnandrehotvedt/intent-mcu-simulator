# X05 reviewable project patch contract

Receipt: `desktop-etvt6l5-ct109-lab-x05-reviewable-project-patch-20261018-001`

## Exact outcome

A user can describe a desired project change, copy a deterministic prompt to
an external assistant of their choice, paste one strict data-only project patch,
and review every source-file, component and wire change before explicitly
applying it. The Lab makes no live AI request.

## Patch authority

- Schema: `intent-mcu-project-patch@1`.
- Exact fields: `schema`, `profile`, `baseProjectSha256`, `description`, and
  `proposedProject`.
- `baseProjectSha256` binds the patch to the exact current canonical common
  project envelope. Review and Apply each recompute it; a changed project is
  rejected as stale without mutation.
- `proposedProject` must be one complete current
  `intent-mcu-project-envelope@5` document for the same active profile. It is
  parsed by the strict duplicate/prototype-safe parser and every nested source,
  component, pin, net, property, layout and brief rule is revalidated by the
  existing profile adapter.
- Executable/runtime authority, artifacts, verdicts, secrets, external URLs,
  unknown schemas/profiles and malformed or unsupported circuits reject.
- A patch is a proposal only. Project text cannot authorize Apply, Build, Run,
  support or a test verdict.

## Review and application

- Review derives a deterministic read-only list of added, removed and changed
  source files, components and wires from the accepted current/candidate pair.
- No-op patches reject. The candidate is not installed during review.
- Apply repeats strict parsing, full project validation and base-hash checking
  against the then-current project before one existing profile install call.
  Any failure leaves project bytes, profile, artifact, runtime, history and UI
  proposal state unchanged.
- Accepted Apply uses the existing common-project installation boundary, clears
  executable/runtime authority and requires a fresh Build.

## Acceptance

- Unit tests cover exact schema, all three review classes, duplicate/prototype
  rejection, forbidden authority, no-op rejection, profile mismatch,
  unsupported candidate data, stale review/apply and byte-atomic failure.
- One integrated Chromium journey generates the prompt, reviews visible source,
  component and wire changes, proves no pre-Apply mutation, applies once,
  proves fresh-Build invalidation, and rejects a stale replay atomically.
- Existing X01–X04 project data and all public profile/runtime/controller limits
  remain unchanged.
