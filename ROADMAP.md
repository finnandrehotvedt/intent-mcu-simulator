# Public roadmap

This roadmap describes possible source work, not a delivery promise. A feature
moves into a release only with a defined contract, deterministic tests,
licence review, and honest compatibility status.

## Direction, not a finish line

The simulator is an ongoing open-source demonstration of professional
AI-assisted coding and evidence-based firmware learning. It should keep making
the relationship between source code and observable simulated hardware easier
for people to inspect, explain, and improve. There is no fixed final date or
predetermined end state. Contributions are welcome, but this roadmap does not
promise that every proposal will be accepted or that maintenance will continue
forever.

## Near-term source quality

- Improve keyboard and screen-reader workflows for the manual circuit editor.
- Expand the catalogue registry only with independently created artwork,
  explicit support levels, electrical contracts, provenance and tests.
- Expand examples that start from an empty project and explain validation
  failures without hiding electrical assumptions.
- Add source-level tests for more project import, migration, and rendering
  boundaries.
- Document the tested AVR CPU/peripheral subset in a public compatibility
  table without overstating physical equivalence.

## Separate distribution gates

- Keep the published compiler service recipe, upstream checksums, notices,
  relinking directions and confinement tests current without distributing an
  unreviewed prebuilt toolchain image.
- Evaluate additional components one at a time; displays, sensors, motors, and
  buses require their own electrical and emulator contracts before activation.
- Keep physical-device access, upload, accounts, hosted AI, agent/tool
  interfaces, and hosted compiler/deployment operations outside this
  source-only roadmap until each is separately designed and approved.

## Not planned as shortcuts

- Copying another simulator's interface, artwork, schemas, or private APIs.
- Letting free-form model output bypass project validation.
- Claiming physical safety, timing accuracy, or hardware compatibility from a
  visual simulation alone.
