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

## Keep the working path usable while expanding

The complete approved roadmap remains active, but every increment must protect
the last verified public version. The shared four-controller shell, Build and
Run, named-pin wiring, Save/Open, explicit migration and clear failures are the
stable learner path. Complex extensions stay private or isolated until their
contract, tests and one coherent integrated journey pass; incomplete features
remain visibly partial or unavailable. This is prioritization, not permanent
removal, a completion percentage or a delivery deadline. Physical-hardware
actions still require separate exact local consent.

## Near-term source quality

- Improve keyboard and screen-reader workflows for the manual circuit editor.
- Continue expanding the 16-part catalogue only with independently created
  artwork, explicit support levels, electrical contracts, provenance and tests.
- Expand examples that start from an empty project and explain validation
  failures without hiding electrical assumptions.
- Add source-level tests for more project import, migration, and rendering
  boundaries.
- Design a release-stable model identity policy so presentation-only releases
  do not repeatedly force data-only project migration; preserve explicit
  migration whenever executable model semantics actually change.
- Document the tested AVR CPU/peripheral subset in a public compatibility
  table without overstating physical equivalence.

## Separate distribution gates

- Keep the published compiler service recipe, upstream checksums, notices,
  relinking directions and confinement tests current without distributing an
  unreviewed prebuilt toolchain image.
- Evaluate additional controllers and components one at a time. The public
  selector may show exact private evidence as a non-executable preview, but it
  must not imply public availability. AVR, the bounded Pico GPIO0/UART0 path,
  the bounded ESP32-C3 GPIO2/UART path, and the bounded STM32F429ZI
  PB0/USART3 path are public; expansion beyond those exact contracts requires
  new evidence. Motors and buses require their own electrical and emulator
  contracts before activation.
- Keep physical-device access, upload, accounts, hosted AI, agent/tool
  interfaces, and hosted compiler/deployment operations outside this
  source-only roadmap until each is separately designed and approved.

## Not planned as shortcuts

- Copying another simulator's interface, artwork, schemas, or private APIs.
- Letting free-form model output bypass project validation.
- Claiming physical safety, timing accuracy, or hardware compatibility from a
  visual simulation alone.
