# X69 retained package fixtures

These files are byte-identical, project-owned retained experiment-package
exports. They are not synthetic firmware-execution evidence and this milestone
does not rerun their producer.

- `x69-correct.intent-mcu-experiment.json`
  - SHA-256: `4b7d85dd0d0fce4d5b521c16c798730af6547d554f32c5f8895668f887530fc5`
  - retained source receipt:
    `desktop-etvt6l5-ct109-lab-x41-genuine-pair-producer-20261020-001`
  - recorded aggregate: passed
- `x69-known-bad.intent-mcu-experiment.json`
  - SHA-256: `a0f6d2d40e8ade683e860a7d9767cd8ebd2109b6acdd0df7fd38081e2278b521`
  - retained source receipt:
    `desktop-etvt6l5-ct109-lab-x41-after-ready-acquisition-20261020-001`
  - recorded aggregate: failed; equality scenario records D13 HIGH against
    expected LOW with `EXPECTED_PIN_LEVEL_MISMATCH`

The package digests establish exact bytes and integrity only. They do not
establish sender identity or the truth of a recorded claim.

