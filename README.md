# Intent MCU Simulator

Intent MCU Simulator is an original, browser-based learning environment for
building small microcontroller circuits, editing firmware, inspecting signals,
and exchanging deterministic circuit plans through a provider-neutral prompt.

This repository is the source-only release of the browser application,
project-owned compiler gateway and deterministic circuit model. It includes no
copied simulator artwork, layout, schema, endpoints, or branding. The
interface, component graphics and service code are implemented from scratch.

## Why we are building this

This project began as one of many practical demonstrations of professional
AI-assisted coding: not just generating source, but making the result visible,
testable, and open to inspection. Firmware is hard to understand from text
alone. The simulator turns a supported program into observable virtual
hardware behaviour—pins, LEDs, inputs, serial bytes, and logic traces—so a
person can learn from it and an AI-assisted workflow can use the same evidence
when explaining or checking a change.

The project is open source so people can use it, enjoy it, study it, and
contribute improvements. Development is ongoing, with no fixed final date or
predetermined finish line. That direction is an invitation to participate, not
a promise of perpetual maintenance. The current product has no hosted AI API
or agent/tool interface: AI-assisted use happens through ordinary source work
and the optional portable Prompt Bridge, while deterministic project rules
remain the authority.

## Public discovery and factual machine context

The live workbench publishes crawlable product explanations, a canonical URL,
social-preview metadata, truthful Schema.org `WebApplication` and FAQ data,
`robots.txt`, `sitemap.xml`, and a concise `llms.txt`. These files describe only
the supported product and link back to this source, licence, contribution
guidance, and the two owner articles. They do not promise search rankings, AI
citations, physical equivalence, hosted AI, or capabilities outside the tested
ATmega328P subset.

## Current source-release boundary

The browser source supports an ATmega328P learning profile, LEDs, resistors,
momentary buttons, linear potentiometers, project import/export, local saves,
Prompt Bridge circuit-plan validation, serial display, logic traces, and pin
inspection. Its manual-first workbench uses a data-driven catalogue with nine
categories, exact support labels, practical metadata search, local favourites
and recent parts. Selectable parts render original project SVG artwork whose
visible terminals and invisible wiring hit targets share the same local
coordinates.

## Manual builder walkthrough

The browser project starts empty; there is no concealed demonstration circuit.
The intended manual workflow is:

1. Add one controller and the desired components from the searchable catalog.
2. Select two visible pin anchors to create a net. Selecting another free pin
   and a pin on that net creates an explicit branch/junction.
3. Select a net to inspect all members, choose a wire colour, edit layout-only
   bends, or detach a named branch. Visual crossings do not imply electrical
   connectivity, and route/colour changes never alter the electrical graph.
4. Move or rotate components. Layout changes preserve component and pin
   identity, and routed wire endpoints remain attached to their actual pins.
5. Edit one or more source files. Source, circuit, and board profile together
   determine build freshness; changing any of them invalidates an old artifact.
6. Save locally or export the canonical project JSON. Imported projects and
   Prompt Bridge proposals pass the same strict schema and electrical rules as
   manual edits.

Placed parts intentionally have no permanent card/header background. Names,
properties, pin roles, provenance, simulation status and exact limitations are
available through the catalogue and inspector instead of being painted into
the hardware art. The four-terminal tactile button depicts A1/A2 and B1/B2 as
physical terminals while preserving the two internally common electrical
groups `A` and `B`.

Example circuit: connect controller `D13` to a resistor, the resistor to an
LED anode, and the LED cathode to controller ground. Connect a momentary button
between `D2` and ground and configure `D2` as `INPUT_PULLUP` in firmware. The
electrical model rejects a missing current-limiting resistor, reversed LED,
ambiguous ground, reused pin, direct supply short, or conflicting outputs.

The Apache-2.0 compiler gateway source, strict API contract, isolation tests,
checksum-pinned toolchain recipe, notices and local operations guide are
included. Prebuilt compiler/toolchain images, downloaded compiler archives,
compiled learner firmware, generated browser bundles and hosted deployment
configuration are deliberately not distributed. A local source build keeps
third-party compiler terms separate from the Apache-2.0 browser and service
source; it does not authorize redistributing the resulting image.

Additional current limits:

- source version `1.0.0-rc.2` is the release currently deployed at
  `https://lab.teachthecompany.com/`; hosted compiler/toolchain images and
  private deployment configuration remain outside this source repository;
- no physical board connection, firmware upload, live AI call, account,
  analytics, or cloud project store is included;
- the CPU/peripheral profile is a tested educational subset, not a promise of
  complete hardware equivalence or physical/electrical safety;
- the prompt bridge creates portable text and accepts only validated circuit
  data; it never gives free-form AI output direct drawing or build authority;
- browser source tests are project-owned verification, not independent
  certification.

See [RELEASE-NOTES.md](RELEASE-NOTES.md), [MIGRATION.md](MIGRATION.md) and
[ROLLBACK.md](ROLLBACK.md) for the deployed scope, migration and recovery
boundary.

## Prerequisites

- Node.js `20.19.4`
- npm `10.8.2`
- Docker Engine with access to the local Docker socket for isolated firmware
  builds (not required for source-only unit tests)

## Verify a fresh checkout

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
```

The build writes `dist/`, which is intentionally ignored and not committed.
To perform the same source checks in a pinned container environment:

```bash
docker build --pull=false -t intent-mcu-simulator-source-check .
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --pids-limit 64 --memory 256m --cpus 1 \
  --tmpfs /tmp:size=32m,mode=1777 \
  intent-mcu-simulator-source-check
```

## Compile and run locally

The reproducible local path uses no hosted compiler:

```bash
npm run setup:toolchain
DOCKER_GID=$(stat -c %g /var/run/docker.sock) \
  docker compose --profile local-compiler up --build -d local-compiler
```

Then, in another terminal:

```bash
docker compose --profile local-compiler exec -T local-compiler npm run test:local
```

This compiles a 150 ms Blink sketch in a disposable offline worker, loads the
returned HEX into the emulator adapter and measures the expected GPIO edges.
The setup verifies every downloaded toolchain archive by SHA-256 and generates
a machine-local image lock. See [LOCAL-OPERATIONS.md](LOCAL-OPERATIONS.md) for
health, readiness, limits, restart, rollback, logging and distribution details,
and [COMPATIBILITY.md](COMPATIBILITY.md) for the exact supported subset.

## Security

Please do not disclose a suspected vulnerability in a public issue. Use the
repository's **Security → Report a vulnerability** route described in
[SECURITY.md](SECURITY.md).

## Licence

Original project source is licensed under the Apache License 2.0. Third-party
packages keep their own licences; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
and [DEPENDENCIES.md](DEPENDENCIES.md).

Release history and bounded next steps are recorded in [CHANGELOG.md](CHANGELOG.md)
and [ROADMAP.md](ROADMAP.md).
