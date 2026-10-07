#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
image=${INTENT_MCU_TOOLCHAIN_IMAGE:-local/intent-mcu-avr-toolchain:1.0.0-rc.1}
lock_file=${INTENT_MCU_IMAGE_LOCK:-$project_root/compiler/local-image-lock.json}

docker build --pull=false --tag "$image" --file "$project_root/Dockerfile.toolchain" "$project_root"
image_id=$(docker image inspect --format '{{.Id}}' "$image")
case "$image_id" in sha256:[0-9a-f][0-9a-f]*) ;; *) echo "Unexpected image identity" >&2; exit 1 ;; esac

expected_manifest=$(sha256sum "$project_root/toolchain/manifest.json" | awk '{print $1}')
embedded_manifest=$(docker run --rm --network none --entrypoint sha256sum "$image" /opt/arduino/toolchain-manifest.json | awk '{print $1}')
if [ "$expected_manifest" != "$embedded_manifest" ]; then
  echo "Embedded toolchain manifest does not match the tracked manifest" >&2
  exit 1
fi
toolchain_files=$(docker run --rm --network none --entrypoint sha256sum "$image" /usr/share/teach-lab/toolchain-files.sha256 | awk '{print $1}')

temporary_lock="$lock_file.tmp"
umask 022
mkdir -p "$(dirname "$lock_file")"
printf '%s\n' '{' \
  '  "schema": "teach-lab-compiler-image-lock@1",' \
  "  \"image\": \"$image\"," \
  "  \"imageId\": \"$image_id\"," \
  '  "runtimeImageIds": [],' \
  "  \"toolchainManifestSha256\": \"$expected_manifest\"," \
  "  \"toolchainFilesSha256\": \"$toolchain_files\"," \
  '  "architecture": "linux/amd64",' \
  '  "distribution": "local-source-build-only"' \
  '}' > "$temporary_lock"
mv "$temporary_lock" "$lock_file"
printf 'Local toolchain ready: %s (%s)\nLock: %s\n' "$image" "$image_id" "$lock_file"
