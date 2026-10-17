# Local compiler operations

This workflow builds the browser plus the isolated AVR, bounded RP2040 and
bounded STM32F429ZI compilers from this checkout and checksum-pinned upstream
archives. It does not
use the hosted compiler and does not distribute the resulting toolchain images.
Docker access is required, but privileged containers and root access are not.

## Build and start

Use Node.js 20.19.4 and npm 10.8.2, then run:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run setup:toolchain
npm run setup:rp2040-toolchain
npm run setup:stm32-public-images
DOCKER_GID=$(stat -c %g /var/run/docker.sock) \
  docker compose --profile local-compiler up --build -d local-compiler
```

In another terminal, prove a real compiler-to-emulator-to-GPIO path:

```sh
docker compose --profile local-compiler exec -T local-compiler npm run test:local
```

The setup scripts build the toolchains from checksum-pinned upstream archives,
validate the tracked compiler-contract identities, and write local image-ID
locks. The generated locks and images are machine-local and are ignored by Git.

The equivalent host process command is
`COMPILER_IMAGE_LOCK="$PWD/compiler/local-image-lock.json" RP2040_COMPILER_IMAGE_LOCK="$PWD/compiler/local-rp2040-image-lock.json" npm run start:local`.
It is useful for development when the current user already has local Docker
socket access. The Compose profile is the documented clean-checkout path.

The public ESP32-C3 service is disabled by default in this clean-checkout
Compose profile because its separately licensed compiler and QEMU binary are
not source-release artifacts. A prepared deployment must provide exact
`ESP32C3_BUILDER_IMAGE_LOCK` and `ESP32C3_RUNTIME_IMAGE_LOCK` files, set
`ENABLE_ESP32C3_PUBLIC=1`, and pass the public-origin value. Startup and
`/readyz` fail closed if either installed image ID differs from its lock.

The public STM32F429ZI service is also disabled unless
`ENABLE_STM32_PUBLIC=1` is set with exact `STM32_BUILDER_IMAGE_LOCK` and
`STM32_RUNTIME_IMAGE_LOCK` paths. `npm run setup:stm32-public-images` reuses the
already pinned Arm GNU 14.3.1 image and the exact local Renode 1.17.0 portable
asset recorded in `stm32/toolchain-manifest.json`. It performs no network
download. Startup and `/readyz` fail closed on image-ID drift.

For production, build and test the source image first, tag it as
`local/intent-mcu-source-check:1.1.0-rc.22`, then assemble the public gateway
with `Dockerfile.production`. The final layer copies the checksum-pinned Docker
28.3.3 client from the established integration image. The gateway still sees
only the mounted local Docker socket, while each compiler/runtime child keeps
its own network, identity and resource restrictions.

Run the full compiler isolation and recovery checks with:

```sh
docker compose --profile local-compiler exec -T local-compiler npm run test:compiler-integration
docker compose --profile local-compiler exec -T local-compiler npm run test:operations
```

## Health and practical limits

- `GET /healthz` proves the gateway process can serve requests.
- `GET /readyz` proves every enabled exact locked compiler/runtime image is
  available.
- One build runs at a time; at most four wait in the shared queue.
- One origin may have one active build and six submissions per minute.
- Each disposable worker is limited to one CPU, 256 MiB memory, 64 PIDs, no
  network, a read-only root, no capabilities, and tmpfs-only writable paths.
- When C3 is enabled, its compiler and runtime are separate disposable
  containers, globally limited to one of each, network-disabled, read-only,
  capability-dropped and tmpfs-only. C3 source/flash authority is in memory
  for a bounded session and is wiped on edit, Stop, expiry, or restart.
- When STM32 is enabled, its compiler and Renode runtime are separate
  one-at-a-time disposable containers. Both are network-disabled, read-only,
  non-root and capability-dropped. ELF bytes cross one request only, remain in
  browser memory after Build, and are wiped on edit, Open, Stop or profile
  change; the server retains zero project or executable bytes. Renode receives
  a bounded 90-second server deadline so its first cold start can complete on
  the production VM; timeout and user cancellation still remove the exact
  disposable runtime container.

Logs contain lifecycle/error codes, not learner source, returned firmware, job
capabilities, or secrets. A failed build remains available only in memory for a
bounded job lifetime; restarting the service discards jobs and cache.

## Recovery and rollback

1. Stop the host process with `Ctrl-C`, or run
   `docker compose --profile local-compiler down` for the Compose profile.
2. Confirm no disposable job remains:
   `docker ps -aq --filter label=com.intentforce.teach-lab.role=disposable-build-job`.
   Also require no
   `disposable-stm32-public-build-job` or
   `disposable-stm32-public-runtime-job` container.
3. Restore the prior source commit and rerun `npm ci`, `npm run build`,
   `npm run setup:toolchain`, and `npm run setup:rp2040-toolchain`.
4. Start the restored checkout and require both health endpoints plus
   `npm run test:local` to pass.

There is no server database to back up. Browser projects should be exported as
JSON before replacing a checkout. Do not remove unrelated Docker images,
volumes, containers, networks, or the hosted service during local recovery.

## Distribution boundary

The Dockerfiles and setup recipes are Apache-2.0 project source. Downloaded
compiler archives, built images, and compiled learner firmware retain their
upstream terms and are not project release artifacts. See
`toolchain/SOURCE-AND-RELINKING.md`, `toolchain/NOTICE.md`, and
`toolchain/manifest.json` for AVR and
`compiler/RP2040-TOOLCHAIN-MANIFEST.md` for Pico before supplying a built image
to anyone else. The STM32 locks likewise do not authorize redistributing Arm
GNU or the Renode portable package; review the upstream licences and retained
notices before any external image distribution. The C3 lock/manifests do not authorize redistributing its
compiler or QEMU images; review `DEPENDENCIES.md` and `THIRD_PARTY_NOTICES.md`
first.
