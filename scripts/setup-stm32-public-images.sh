#!/bin/sh
# Copyright 2026 IntentForce
# SPDX-License-Identifier: Apache-2.0
set -eu

project_root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
renode_root=${INTENT_MCU_RENODE_ROOT:-/srv/codex-workspaces/_tools/renode/1.17.0/portable}
builder_image=${INTENT_MCU_STM32_BUILDER_IMAGE:-local/intent-mcu-stm32-toolchain:1.1.0-rc.6}
runtime_image=${INTENT_MCU_STM32_RUNTIME_IMAGE:-local/intent-mcu-stm32-runtime:1.1.0-rc.6}

test -x "$renode_root/renode"
docker image inspect local/intent-mcu-rp2040-toolchain:1.1.0-rc.4 >/dev/null

docker build --pull=false --tag "$builder_image" --file "$project_root/Dockerfile.stm32-toolchain" "$project_root"

work_root=$(mktemp -d /var/tmp/intent-mcu-stm32-runtime.XXXXXX)
trap 'rm -rf "$work_root"' EXIT HUP INT TERM
mkdir -p "$work_root/stm32" "$work_root/renode-root"
cp "$project_root/Dockerfile.stm32-runtime" "$work_root/Dockerfile.stm32-runtime"
cp "$project_root/stm32/renode-runner.py" "$work_root/stm32/renode-runner.py"
cp -R "$renode_root/." "$work_root/renode-root/"
docker build --pull=false --tag "$runtime_image" --file "$work_root/Dockerfile.stm32-runtime" "$work_root"

builder_id=$(docker image inspect --format '{{.Id}}' "$builder_image")
runtime_id=$(docker image inspect --format '{{.Id}}' "$runtime_image")
printf '%s\n' "$builder_image $builder_id" "$runtime_image $runtime_id"
