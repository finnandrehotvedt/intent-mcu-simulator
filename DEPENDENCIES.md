# Dependency inventory

The package lock is authoritative for exact npm integrity values and all
platform-conditional packages. The source release has two selected direct
dependencies:

| Package | Exact version | Scope | Purpose | Source | Licence | Distribution |
| --- | --- | --- | --- | --- | --- | --- |
| `avr8js` | `0.21.1` | runtime | Tested AVR CPU/peripheral emulation behind a project-owned adapter | <https://github.com/wokwi/avr8js/tree/v0.21.1> | MIT | Included by `npm ci`; notice retained |
| `esbuild` | `0.28.2` | development | Deterministic browser/worker bundling | <https://github.com/evanw/esbuild/tree/v0.28.2> | MIT | Build-only; notice retained |

The pinned build base is
`node:20.19.4-alpine3.22@sha256:df02558528d3d3d0d621f112e232611aecfee7cbc654f6b375765f72bb262799`.
It is infrastructure for local source verification, not product artwork or a
distributed release image.

The isolated AVR compiler/toolchain is not part of this repository or public
distribution. Its GPL/LGPL and corresponding-source obligations remain a
separate distribution gate.
