# Dependency inventory

The package lock is authoritative for exact npm integrity values and all
platform-conditional packages. The source release has three selected direct
dependencies:

| Package | Exact version | Scope | Purpose | Source | Licence | Distribution |
| --- | --- | --- | --- | --- | --- | --- |
| `avr8js` | `0.21.1` | runtime | Tested AVR CPU/peripheral emulation behind a project-owned adapter | <https://github.com/wokwi/avr8js/tree/v0.21.1> | MIT | Included by `npm ci`; notice retained |
| `rp2040js` | `1.4.0` | runtime | Bounded RP2040 CPU/GPIO/UART browser-worker execution behind project-owned validation | <https://github.com/wokwi/rp2040js/tree/v1.4.0> | MIT | Included by `npm ci`; notice retained |
| `esbuild` | `0.28.2` | development | Deterministic browser/worker bundling | <https://github.com/evanw/esbuild/tree/v0.28.2> | MIT | Build-only; notice retained |

The pinned build base is
`node:20.19.4-alpine3.22@sha256:df02558528d3d3d0d621f112e232611aecfee7cbc654f6b375765f72bb262799`.
It is infrastructure for local source verification, not product artwork or a
distributed release image.

The bounded Pico compiler recipe downloads Arm GNU Toolchain 14.3.Rel1 for
x86_64 Arm-none-eabi from the project owner's HTTPS release URL and requires
archive SHA-256
`8f6903f8ceb084d9227b9ef991490413014d991874a1e34074443c2a72b14dbd`
before extraction. The upstream GPL, runtime-library and other bundled terms
are retained in the archive's `license.txt`; the archive and built compiler
image are not distributed in this source repository.

The repository includes the project-owned compiler gateway and a source recipe
for a locally built AVR toolchain. The recipe pins Arduino CLI 1.5.1, Arduino
AVR Boards 1.8.8, AVR GCC 7.3.0-atmel3.6.1-arduino7, ctags 5.8-arduino11 and
the two Arduino discovery tools by source URL and SHA-256. Their GPL/LGPL,
runtime-exception and permissive terms remain separate. The project does not
distribute a prebuilt toolchain image; see `toolchain/manifest.json` and
`toolchain/SOURCE-AND-RELINKING.md`.
