# X01 durable project brief contract

Receipt: `desktop-etvt6l5-ct109-lab-next-x96-increment-20261018-001`

## Bounded outcome

Every existing public controller profile can author and save one data-only
project brief together with its circuit and source. The brief contains:

- purpose;
- named inputs;
- named outputs;
- boundary cases; and
- acceptance criteria with stable, author-supplied IDs.

The same brief must survive common Download/Open, connected-file Save/Open,
profile switching and an exact canonical round trip. A legacy envelope opens
with an explicit empty-brief migration and requires a fresh Build as before.

## Validation and authority

- The common envelope advances to `intent-mcu-project-envelope@2`; version 1
  and legacy inner project files remain accepted through deterministic
  migration.
- The brief has exact keys, bounded UTF-8 text, bounded list lengths and unique
  criterion IDs. Unknown fields, malformed entries, duplicate IDs and
  executable/runtime/result authority reject atomically.
- Brief text is inert user-authored data. It never changes circuit validation,
  compiler input, runtime behavior, model truth or a test verdict.
- A criterion is displayed as `Not evaluated` until a future evidence-bearing
  test contract evaluates it. This release does not claim X02 completion.
- I03 remains bounded: C3 GPIO2 is a project model, STM32 PB0 has only
  instruction ordering, and neither is promoted to a timed hardware waveform.

## Acceptance

1. Unit tests cover canonical v2, v1/legacy migration, strict rejection,
   authority exclusion, duplicate IDs and exact round-trip behavior.
2. Browser tests author all five brief categories, switch across all four
   profiles, Download/Open each profile and prove the brief is restored while
   executable authority is cleared.
3. Editing the brief marks the project dirty but does not invalidate a current
   build or change runtime/circuit bytes.
4. The visible desktop UI identifies the data as project context and every
   criterion as `Not evaluated`; it makes no pass/fail claim.
5. Existing source, electrical, file, trace and public regression suites pass.
6. Publication keeps the exact rc.30 rollback and passes HTTPS, security,
   same-container restart and Teach-domain regression checks.

