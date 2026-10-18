# X02 requirement traceability contract

Receipt: `desktop-etvt6l5-ct109-lab-x02-requirement-traceability-20261018-001`

## Bounded outcome

Every stable acceptance-criterion ID in the existing four public controller
profiles can carry explicit project-local code references and stable test IDs.
The visible project-context panel renders one trace row per requirement and
shows separately whether code, tests and a current runtime result are linked.
Requirements without a current result remain visibly `Untested`.

## Data and authority

- The common envelope advances to `intent-mcu-project-envelope@3` and the brief
  to `intent-mcu-project-brief@2`. Rc.31 envelope-v2/brief-v1, envelope-v1 and
  supported inner project files migrate deterministically; old criteria gain
  explicit empty code/test reference arrays.
- Code references are bounded project-local identifiers, optionally with a
  line or line-range suffix. Test references are bounded uppercase stable IDs.
  Unknown fields, malformed references, duplicate requirement IDs and
  duplicate per-requirement references reject atomically.
- Code and test references are inert authored metadata. They cannot select a
  compiler input, execute a test, alter a circuit, create a verdict or grant
  any runtime/external authority.
- A result link can be attached only to the current in-memory runtime summary
  for the same active profile and records its real artifact identity,
  generation, channel classifications and producer provenance. It is an
  evidence pointer, never an evaluated pass/fail verdict.
- Result links are never serialized. Open, profile/runtime invalidation or a
  changed requirement/test identity leaves the requirement visibly `Untested`
  and cannot restore executable, runtime or result authority from a file.

## Acceptance

1. Unit tests cover canonical v3/v2, rc.31 migration, strict malformed and
   duplicate references, authority exclusion and exact canonical round trips.
2. Browser tests author code and test links in all four profiles, verify the
   visible per-requirement trace rows, and prove Download/Open restores only
   inert authored links with every result `Untested`.
3. Actual Build/Run browser journeys for all four profiles attach only their
   current real runtime result, expose exact producer/classification evidence,
   never emit a verdict, and return to `Untested` after invalidation/Open.
4. Traceability-only edits mark project data dirty but do not change source,
   circuit, artifact identity or a current runtime.
5. Existing electrical, file, instrument, trace and public regressions pass;
   public HTTPS keeps its security boundary, no outside request and no cookie.
6. Publication keeps exact rc.31 rollback and passes same-container restart,
   current-release readback and the existing Teach-domain URL suite.

## Register boundary

P1 and X are separate acceptance registers. P1 `I03` remains complete against
its bounded immediate requirement: each supported profile visibly exposes the
runtime trace evidence it can truthfully produce. That does not complete the
broader X29/X40 contracts. C3 GPIO2 still has project-model epochs rather than
QEMU CPU-pin time; STM32 PB0 still has instruction ordering rather than a
producer-backed timed waveform; and no common Serial/input/GPIO/reset/test
marker axis exists across all four profiles. X29 and X40 therefore remain
partial without contradiction.
