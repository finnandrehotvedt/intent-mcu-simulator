#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
image=${INTENT_MCU_RP2040_TOOLCHAIN_IMAGE:-local/intent-mcu-rp2040-toolchain:1.1.0-rc.4}
lock_file=${INTENT_MCU_RP2040_IMAGE_LOCK:-$project_root/compiler/local-rp2040-image-lock.json}
cache_root=${INTENT_MCU_TOOLCHAIN_CACHE:-/var/tmp/intent-mcu-toolchains}
archive_name=arm-gnu-toolchain-14.3.rel1-x86_64-arm-none-eabi.tar.xz
archive_url=https://developer.arm.com/-/media/Files/downloads/gnu/14.3.rel1/binrel/$archive_name
archive_sha256=8f6903f8ceb084d9227b9ef991490413014d991874a1e34074443c2a72b14dbd
manifest_sha256=$(sha256sum "$project_root/compiler/rp2040-toolchain-manifest.json" | awk '{print $1}')

docker image inspect local/intent-mcu-avr-toolchain:1.0.0-rc.2 >/dev/null 2>&1 || {
  echo 'Build the pinned AVR base first with npm run setup:toolchain.' >&2
  exit 1
}

umask 022
mkdir -p "$cache_root"
archive_path=$cache_root/$archive_name
if [ ! -f "$archive_path" ] || ! printf '%s  %s\n' "$archive_sha256" "$archive_path" | sha256sum -c - >/dev/null 2>&1; then
  download_path=$archive_path.download
  curl --fail --location --proto '=https' --tlsv1.2 --output "$download_path" "$archive_url"
  printf '%s  %s\n' "$archive_sha256" "$download_path" | sha256sum -c -
  mv "$download_path" "$archive_path"
fi

work_root=$(mktemp -d /var/tmp/intent-mcu-rp2040-build.XXXXXX)
trap 'rm -rf "$work_root"' EXIT HUP INT TERM
context=$work_root/context
mkdir -p "$context/arm-toolchain" "$context/compiler/rp2040-contract"
tar -xJf "$archive_path" -C "$context/arm-toolchain" --strip-components=1
cp "$project_root/Dockerfile.rp2040-toolchain" "$context/Dockerfile.rp2040-toolchain"
cp "$project_root/compiler/rp2040-build-worker.mjs" "$context/compiler/rp2040-build-worker.mjs"
cp "$project_root/compiler/rp2040-contract/"* "$context/compiler/rp2040-contract/"
cp "$project_root/compiler/rp2040-toolchain-manifest.json" "$context/compiler/rp2040-toolchain-manifest.json"

printf '%s  %s\n' \
  '672a38f11ac031757d8634d53c429048cce506903bc5594470584f80013d4c14' "$context/compiler/rp2040-build-worker.mjs" \
  'a3d84e1c121e6a6365517c38993493b694f7ba85b9bc8db136ac00194ebe5897' "$context/compiler/rp2040-contract/startup.S" \
  '189e4add83c2ec9fd6d6eca275f55043a92b5b50b8ab68d082a47c91927710d7' "$context/compiler/rp2040-contract/rp2040.ld" \
  '0888bdeee8bb920ece126baa1085614c3bc0c099f6d8c1faddb7111fa508f6ba' "$context/compiler/rp2040-contract/intent_rp2040_runtime.h" \
  | sha256sum -c -

docker build --pull=false --tag "$image" --file "$context/Dockerfile.rp2040-toolchain" "$context"
image_id=$(docker image inspect --format '{{.Id}}' "$image")
case "$image_id" in sha256:[0-9a-f][0-9a-f]*) ;; *) echo 'Unexpected image identity' >&2; exit 1 ;; esac

temporary_lock=$lock_file.tmp
mkdir -p "$(dirname "$lock_file")"
printf '%s\n' '{' \
  '  "schema": "teach-lab-compiler-image-lock@1",' \
  "  \"image\": \"$image\"," \
  "  \"imageId\": \"$image_id\"," \
  '  "runtimeImageIds": [],' \
  "  \"toolchainManifestSha256\": \"$manifest_sha256\"," \
  "  \"toolchainFilesSha256\": \"$manifest_sha256\"," \
  '  "architecture": "linux/amd64",' \
  '  "distribution": "local-source-build-only"' \
  '}' > "$temporary_lock"
mv "$temporary_lock" "$lock_file"
printf 'Local RP2040 toolchain ready: %s (%s)\nLock: %s\n' "$image" "$image_id" "$lock_file"
