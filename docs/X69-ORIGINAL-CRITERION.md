# X69 original-criterion implementation

Original criterion:

> En mottaker kan gå gjennom samme innganger og se hvorfor testen bestod eller feilet.

The private implementation provides a historical, read-only recipient view over
one canonical strict-v3 AVR thermostat experiment package. It:

- displays every recorded temperature and button input in scenario order with
  virtual-millisecond and degree-Celsius units;
- displays exact scenario IDs, recorded D13 expectation and observation,
  observation window, evidence status, outcome and deterministic explanation;
- supports manual selection and keyboard-operable previous/next navigation with
  explicit beginning and end;
- displays profile, experiment, project, source, circuit, artifact and model
  identities plus completeness;
- labels capture wall-clock time and requirement IDs as unavailable when the
  package did not record them;
- treats imported outcomes only as historical evidence and imports no Build,
  Run, runtime, mutation or current-verdict authority.

The view reuses the existing strict package parser and does not create a second
expectation evaluator. Missing, reordered, inconsistent, unknown, noncanonical
or oversized evidence is rejected atomically; it is never reconstructed from
expected values or UART text.

The two test fixtures are byte-identical retained producer exports. Their
lineage and hashes are documented in `test/fixtures/X69-PROVENANCE.md`.
Evidence is provided by `test/x69-guided-experiment-replay.test.mjs` and
`test/x69-guided-experiment-replay-browser.cjs`. Status remains
`implemented/tested_private` pending the later reviewed public release and
independent public verification required by the release packet.

