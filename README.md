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
inspection.

The isolated compiler service, compiler/toolchain image, compiler binaries,
toolchain archives, compiled learner firmware, generated browser bundle, and
deployment configuration are deliberately not distributed in this repository.
Building this checkout creates the static browser bundle locally, but does not
create or enable a firmware compiler endpoint. This boundary keeps third-party
compiler source, notice, and relinking obligations separate from the
Apache-2.0 project-owned source.

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
