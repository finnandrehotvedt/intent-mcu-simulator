# X03 open assumptions contract

Receipt: `desktop-etvt6l5-ct109-lab-x03-open-assumptions-20261018-001`

## Bounded outcome

Every public controller profile can save a bounded list of explicit unresolved
questions. Each item identifies a stable ID, one of `voltage`, `pin`, `timing`
or `other`, a question, and zero or more existing requirement IDs. The visible
project context marks every item `Unresolved`; no item can assert support,
resolution, a verdict, or runtime authority.

## Data and authority

- The common envelope advances to `intent-mcu-project-envelope@4` and the brief
  to `intent-mcu-project-brief@3`. Rc.32 envelope-v3/brief-v2 and older supported
  files migrate deterministically with an empty `openAssumptions` list.
- IDs are unique stable uppercase identifiers. Kinds are closed to voltage,
  pin, timing and other. Questions are bounded text and requirement references
  must name acceptance criteria in the same brief.
- Status is not authored or serialized: every accepted item is unresolved by
  definition. Saved metadata cannot grant component, compiler, runtime,
  electrical, timing, pin or AI authority.
- Prompt Bridge includes the current unresolved list and explicitly orders an
  external assistant to ask for clarification and never infer support. The
  local app still makes no AI or third-party request.

## Acceptance

1. Unit tests cover canonical v4/v3, rc.32 migration, strict malformed kinds,
   IDs, duplicate items, unknown requirement references and authority exclusion.
2. Browser tests author voltage, pin and timing questions in all four profiles,
   verify visible `Unresolved` rows, and prove Download/Open preservation.
3. Prompt generation includes the exact open questions and an explicit
   no-inference instruction; it never turns an assumption into support.
4. Assumption-only edits are inert project-data changes and do not change
   source, circuit, artifact identity, runtime or requirement results.
5. Existing four-profile Build/Run, files, trace, electrical and public
   regressions pass with no outside request or cookie.
6. Publication keeps exact rc.32 rollback and passes HTTPS/security,
   same-container restart and current-release readback.

