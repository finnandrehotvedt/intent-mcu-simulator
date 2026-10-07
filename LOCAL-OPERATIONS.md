# Local compiler operations

This workflow builds the browser and isolated AVR compiler entirely from this
checkout. It does not use the hosted compiler and does not distribute the
resulting toolchain image. Docker access is required, but privileged containers
and root access are not.

## Build and start

Use Node.js 20.19.4 and npm 10.8.2, then run:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run setup:toolchain
DOCKER_GID=$(stat -c %g /var/run/docker.sock) \
  docker compose --profile local-compiler up --build -d local-compiler
```

In another terminal, prove a real compiler-to-emulator-to-GPIO path:

```sh
docker compose --profile local-compiler exec -T local-compiler npm run test:local
```

The setup script builds the toolchain from checksum-pinned upstream archives,
compares the embedded and tracked manifest hashes, and writes a local image-ID
lock. The generated lock and image are machine-local and are ignored by Git.

The equivalent host process command is
`COMPILER_IMAGE_LOCK="$PWD/compiler/local-image-lock.json" npm run start:local`.
It is useful for development when the current user already has local Docker
socket access. The Compose profile is the documented clean-checkout path.

Run the full compiler isolation and recovery checks with:

```sh
docker compose --profile local-compiler exec -T local-compiler npm run test:compiler-integration
docker compose --profile local-compiler exec -T local-compiler npm run test:operations
```

## Health and practical limits

- `GET /healthz` proves the gateway process can serve requests.
- `GET /readyz` proves the exact locked compiler image is available.
- One build runs at a time; at most three wait in the queue.
- One origin may have one active build and twelve submissions per minute.
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
3. Restore the prior source commit and rerun `npm ci`, `npm run build`, and
   `npm run setup:toolchain`.
4. Start the restored checkout and require both health endpoints plus
   `npm run test:local` to pass.

There is no server database to back up. Browser projects should be exported as
JSON before replacing a checkout. Do not remove unrelated Docker images,
volumes, containers, networks, or the hosted service during local recovery.

## Distribution boundary

The Dockerfile and setup recipe are Apache-2.0 project source. Downloaded
compiler archives, the built image, and compiled learner firmware retain their
upstream terms and are not project release artifacts. See
`toolchain/SOURCE-AND-RELINKING.md`, `toolchain/NOTICE.md`, and
`toolchain/manifest.json` before supplying a built image to anyone else.
