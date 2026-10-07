# Fixed AVR compiler image notices

This image is a locally built, non-browser-delivered worker for Intent MCU
Simulator. The project publishes the build recipe but does not publish or
supply the resulting compiler image.

The exact package versions, upstream archive hashes, source locations and
licence classifications are recorded in `/opt/arduino/toolchain-manifest.json`.
The exact installed compiler/toolchain file hashes are recorded in
`/usr/share/teach-lab/toolchain-files.sha256`.

Included licence texts and notices remain at their installed upstream paths,
including:

- `/usr/share/licenses/arduino-cli/LICENSE.txt`;
- `/usr/share/common-licenses/GPL-2` and `GPL-3`;
- `/usr/share/common-licenses/LGPL-2.1` and `LGPL-3`;
- Arduino AVR core source headers and per-file notices beneath
  `/opt/arduino/data/packages/arduino/hardware/avr/1.8.8`;
- discovery-tool licence files beneath
  `/opt/arduino/data/packages/builtin/tools`.

The base Debian/Node image contains separately licensed packages. This packet
does not collapse those terms into one licence. The project-owned gateway,
broker, validation and UI code is licensed under Apache-2.0. That licence does
not relicense any compiler or toolchain package.

See `SOURCE-AND-RELINKING.md` before supplying a locally built image to anyone
else. This inventory is engineering evidence, not legal advice.
