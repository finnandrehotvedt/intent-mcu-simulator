#!/bin/sh
set -eu

umask 022
rm -rf /build/*
mkdir -p /out /tmp/downloads /tmp/user /tmp/home /tmp/data
find /out -mindepth 1 -delete
ln -s /opt/arduino/data/packages /tmp/data/packages
printf '%s\n' '{"packages":[]}' > /tmp/data/package_index.json
printf '%s\n' '{"libraries":[]}' > /tmp/data/library_index.json

for sketch in /fixtures/*; do
  [ -d "$sketch" ] || continue
  name="$(basename "$sketch")"
  build_dir="/build/$name"
  output_dir="/out/$name"
  mkdir -p "$build_dir" "$output_dir"
  arduino-cli compile \
    --config-file /opt/arduino/arduino-cli.yaml \
    --fqbn arduino:avr:uno \
    --build-path "$build_dir" \
    --output-dir "$output_dir" \
    --warnings all \
    --no-color \
    "$sketch"
  /opt/arduino/data/packages/arduino/tools/avr-gcc/7.3.0-atmel3.6.1-arduino7/bin/avr-nm \
    -S -n "$output_dir/$name.ino.elf" > "$output_dir/$name.symbols"
  if [ "$name" = cpu_corpus ]; then
    /opt/arduino/data/packages/arduino/tools/avr-gcc/7.3.0-atmel3.6.1-arduino7/bin/avr-objdump \
      -d "$output_dir/$name.ino.elf" > "$output_dir/$name.disassembly"
  fi
done

find /out -type f \( -name '*.eep' -o -name '*.bin' -o -name '*.with_bootloader.hex' \) -delete
find /out -type f -exec chmod 0444 {} +
