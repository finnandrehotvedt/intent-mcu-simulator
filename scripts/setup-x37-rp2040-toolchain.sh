#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
image=${INTENT_MCU_X37_RP2040_IMAGE:-local/intent-mcu-rp2040-toolchain:x37-private-1}
lock_file=${INTENT_MCU_X37_RP2040_LOCK:-$project_root/compiler/x37-rp2040-image-lock.json}
cache_root=${INTENT_MCU_TOOLCHAIN_CACHE:-/var/tmp/intent-mcu-toolchains}
archive_name=arm-gnu-toolchain-14.3.rel1-x86_64-arm-none-eabi.tar.xz
archive_path=$cache_root/$archive_name
archive_sha256=8f6903f8ceb084d9227b9ef991490413014d991874a1e34074443c2a72b14dbd
manifest=$project_root/compiler/rp2040-x37-toolchain-manifest.json

test -f "$archive_path"
printf '%s  %s\n' "$archive_sha256" "$archive_path" | sha256sum -c -
docker image inspect local/intent-mcu-avr-toolchain:1.0.0-rc.2 >/dev/null

work_root=$(mktemp -d /var/tmp/intent-mcu-x37-rp2040-build.XXXXXX)
trap 'rm -rf "$work_root"' EXIT HUP INT TERM
context=$work_root/context
mkdir -p "$context/arm-toolchain" "$context/compiler/rp2040-contract"
tar -xJf "$archive_path" -C "$context/arm-toolchain" --strip-components=1
cp "$project_root/Dockerfile.rp2040-toolchain" "$context/Dockerfile.rp2040-toolchain"
cp "$project_root/compiler/rp2040-build-worker.mjs" "$context/compiler/rp2040-build-worker.mjs"
cp "$project_root/compiler/rp2040-contract/"* "$context/compiler/rp2040-contract/"
cp "$manifest" "$context/compiler/rp2040-toolchain-manifest.json"

sed -n 's/.*"path": "\([^"]*\)", "sha256": "\([0-9a-f]*\)".*/\2  \1/p' "$manifest" |
while read -r expected relative; do
  printf '%s  %s\n' "$expected" "$context/$relative" | sha256sum -c -
done

docker build --pull=false --tag "$image" --file "$context/Dockerfile.rp2040-toolchain" "$context"
image_id=$(docker image inspect --format '{{.Id}}' "$image")
manifest_sha256=$(sha256sum "$manifest" | awk '{print $1}')
temporary_lock=$lock_file.tmp
printf '%s\n' '{' \
  '  "schema": "teach-lab-compiler-image-lock@1",' \
  "  \"image\": \"$image\"," \
  "  \"imageId\": \"$image_id\"," \
  '  "runtimeImageIds": [],' \
  "  \"toolchainManifestSha256\": \"$manifest_sha256\"," \
  "  \"toolchainFilesSha256\": \"$manifest_sha256\"," \
  '  "architecture": "linux/amd64",' \
  '  "distribution": "private X37 GPIO1 input candidate; not public"' \
  '}' > "$temporary_lock"
mv "$temporary_lock" "$lock_file"
printf 'X37 RP2040 candidate image ready: %s (%s)\nLock: %s\n' "$image" "$image_id" "$lock_file"
