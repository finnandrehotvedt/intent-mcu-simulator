# Corresponding source and relinking boundary

The project publishes this source recipe, but not a prebuilt worker image,
toolchain archive or compiled learner firmware. A local user may build the
worker from the pinned upstream inputs. Hosted browser clients receive only
their own bounded ELF/HEX outputs and sanitised diagnostics.

Exact upstream source coordinates and checksums are in
`/opt/arduino/toolchain-manifest.json`. In particular:

- Arduino CLI 1.5.1 source: `https://github.com/arduino/arduino-cli/tree/v1.5.1`;
- Arduino AVR Boards 1.8.8 source is present in the image under
  `/opt/arduino/data/packages/arduino/hardware/avr/1.8.8` and is pinned to the
  archived core checksum in the manifest;
- the AVR GCC 7.3.0-atmel3.6.1-arduino7 bundle is pinned to its exact archive
  checksum and contains GCC/binutils/avr-libc/runtime material under separate
  terms.

Each build uses a fresh workspace and the fixed Arduino CLI command in the
manifest. A modified LGPL-covered core can be substituted in a separately
built copy of the image and the same fixed compile command rerun to produce a
new `core.a`, ELF and HEX. No signature, encryption, upload protocol or locked
bootloader prevents relinking. The project keeps the compiler-produced ELF in
the build response specifically so object-level inspection/relinking is not
artificially obstructed.

Before a locally built image is supplied to anyone else, its distributor must
assemble and verify the exact corresponding source archives for every
GPL/LGPL-covered binary, preserve all notices, provide the applicable
source-delivery mechanism, and re-run the distribution licence review. The
project's source release and local image lock deliberately do not authorize
distribution of that image.
