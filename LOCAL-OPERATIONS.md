# Local compiler operations

This workflow builds the browser plus the isolated AVR and bounded RP2040
compilers from this checkout and checksum-pinned upstream archives. It does not
use the hosted compiler and does not distribute the resulting toolchain images.
Docker access is required, but privileged containers and root access are not.

## Build and start

Use Node.js 20.19.4 and npm 10.8.2, then run:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run setup:toolchain
npm run setup:rp2040-toolchain
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

Run the full compiler isolation and recovery checks with:

```sh
docker compose --profile local-compiler exec -T local-compiler npm run test:compiler-integration
docker compose --profile local-compiler exec -T local-compiler npm run test:operations
```

## Health and practical limits

- `GET /healthz` proves the gateway process can serve requests.
- `GET /readyz` proves both exact locked compiler images are available.
- One build runs at a time; at most four wait in the shared queue.
- One origin may have one active build and six submissions per minute.
- Each disposable worker is limited to one CPU, 256 MiB memory, 64 PIDs, no
  network, a read-only root, no capabilities, and tmpfs-only writable paths.

Logs contain lifecycle/error codes, not learner source, returned firmware, job
capabilities, or secrets. A failed build remains available only in memory for a
bounded job lifetime; restarting the service discards jobs and cache.

## Recovery and rollback

1. Stop the host process with `Ctrl-C`, or run
   `docker compose --profile local-compiler down` for the Compose profile.
2. Confirm no disposable job remains:
   `docker ps -aq --filter label=com.intentforce.teach-lab.role=disposable-build-job`.
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
to anyone else.
