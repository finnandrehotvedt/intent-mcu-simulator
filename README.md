# Intent MCU Simulator

Intent MCU Simulator is an original, browser-based learning environment for
building small microcontroller circuits, editing firmware, inspecting signals,
and exchanging deterministic circuit plans through a provider-neutral prompt.

This repository is the source-only release of the browser application and its
project-owned circuit model. It includes no copied simulator artwork, layout,
schema, endpoints, or branding. The interface and component graphics are
implemented from scratch with HTML, CSS, and JavaScript.

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

The isolated compiler service, compiler/toolchain image, compiler binaries,
toolchain archives, compiled learner firmware, generated browser bundle, and
deployment configuration are deliberately not distributed in this repository.
Building this checkout creates the static browser bundle locally, but does not
create or enable a firmware compiler endpoint. This boundary keeps third-party
compiler source, notice, and relinking obligations separate from the
Apache-2.0 project-owned source.

Additional current limits:

- the public source checkout is not the deployed application at
  `lab.teachthecompany.com`;
- no physical board connection, firmware upload, live AI call, account,
  analytics, or cloud project store is included;
- the CPU/peripheral profile is a tested educational subset, not a promise of
  complete hardware equivalence or physical/electrical safety;
- the prompt bridge creates portable text and accepts only validated circuit
  data; it never gives free-form AI output direct drawing or build authority;
- browser source tests are project-owned verification, not independent
  certification.

## Prerequisites

- Node.js `20.19.4`
- npm `10.8.2`

## Verify a fresh checkout

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
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
