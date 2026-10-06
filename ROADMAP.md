# Public roadmap

This roadmap describes possible source work, not a delivery promise. A feature
moves into a release only with a defined contract, deterministic tests,
licence review, and honest compatibility status.

## Near-term source quality

- Improve keyboard and screen-reader workflows for the manual circuit editor.
- Expand examples that start from an empty project and explain validation
  failures without hiding electrical assumptions.
- Add source-level tests for more project import, migration, and rendering
  boundaries.
- Document the tested AVR CPU/peripheral subset in a public compatibility
  table without overstating physical equivalence.

## Separate distribution gates

- Evaluate whether an isolated compiler service can be published with complete
  corresponding-source, notice, relinking, and sandbox documentation.
- Evaluate additional components one at a time; displays, sensors, motors, and
  buses require their own electrical and emulator contracts before activation.
- Keep physical-device access, upload, accounts, hosted AI, and public
  deployment outside this source roadmap until separately designed and
  approved.

## Not planned as shortcuts

- Copying another simulator's interface, artwork, schemas, or private APIs.
- Letting free-form model output bypass project validation.
- Claiming physical safety, timing accuracy, or hardware compatibility from a
  visual simulation alone.
