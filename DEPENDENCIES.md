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

The hosted bounded ESP32-C3 path uses these exact server-side dependencies;
none is sent to the browser or included as a prebuilt image in this source
release:

| Dependency | Exact version / identity | Purpose | Source | Licence / boundary |
| --- | --- | --- | --- | --- |
| Arduino-ESP32 | `3.3.10`, archive SHA-256 `05cbb2cac185265b8b64f1dfa6982e4ae6d57db67f690a291f119a0b2b6aaab2` | Fixed ESP32-C3 framework and core | <https://github.com/espressif/arduino-esp32/tree/3.3.10> | Mixed per-file terms including LGPL-2.1-or-later, Apache-2.0 and permissive terms; no aggregate redistribution conclusion |
| Espressif RISC-V toolchain | `2601` / upstream `esp-14.2.0_20260121`, archive SHA-256 `1b79617f43cf0e25b92646359d1623d8bef135050aca44586df59b6a64496d82` | Fixed compiler/linker | <https://github.com/espressif/crosstool-NG/releases/tag/esp-14.2.0_20260121> | GCC, binutils, newlib and support-library terms; licence tree retained in the private image |
| esptool | `5.3.0`, archive SHA-256 `46ca7b52c309790bc4d140990680f6088e8cad40b230fda6999661efc24845b6` | Fixed DIO flash assembly | <https://github.com/espressif/esptool/tree/v5.3.0> | Upstream GPL/per-file terms; not distributed by this source release |
| Espressif QEMU | `esp-develop-9.2.2-20260417`, commit `40edccac415693c5130f91c01d84176ae6008566`, asset SHA-256 `547f03e04701a92cbb699f7f7d015adc1f5b5ef93cbb94c0dd9b7107e2d84e77` | Actual ESP32-C3 CPU/UART/reset execution | <https://github.com/espressif/qemu/releases/tag/esp-develop-9.2.2-20260417> | QEMU is GPL-2.0 as a whole with compatible per-file/firmware terms; server-side runtime only |

The public C3 lock files record the installed compiler, QEMU binary, ROM,
fixed flash-layout, container-image, and source identities. They do not claim
general ESP32 compatibility or licence clearance for redistributing a built
toolchain/runtime image.

The repository includes the project-owned compiler gateway and a source recipe
for a locally built AVR toolchain. The recipe pins Arduino CLI 1.5.1, Arduino
AVR Boards 1.8.8, AVR GCC 7.3.0-atmel3.6.1-arduino7, ctags 5.8-arduino11 and
the two Arduino discovery tools by source URL and SHA-256. Their GPL/LGPL,
runtime-exception and permissive terms remain separate. The project does not
distribute a prebuilt toolchain image; see `toolchain/manifest.json` and
`toolchain/SOURCE-AND-RELINKING.md`.
