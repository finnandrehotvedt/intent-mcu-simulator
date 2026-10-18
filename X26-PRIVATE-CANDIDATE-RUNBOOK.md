# X26 private candidate operations

This reusable workspace owns only the loopback X26 review candidate. It uses
the existing single Lab app and existing checksum-pinned compiler/runtime
images. It creates no second app architecture, public endpoint, database,
scheduler or persistent product store.

## Start

Build the accepted source and production image as documented in
`LOCAL-OPERATIONS.md`, tag the final image exactly
`local/intent-mcu-x26:1.1.0-rc.48-private`, then run:

```sh
docker compose -f compose.x26-private.yaml up -d candidate
```

The only published address is `127.0.0.1:18791`. The fixed environment in the
Compose file contains no secret. Docker image locks are project-owned identity
records; the one read-only AVR lock bind reuses the established local compiler
environment.

## Status and health

```sh
docker compose -f compose.x26-private.yaml ps
curl -fsS http://127.0.0.1:18791/readyz
docker inspect intent-mcu-x26-candidate --format '{{.State.Health.Status}} {{.RestartCount}} {{.HostConfig.ReadonlyRootfs}}'
```

Run the visible workflow with:

```sh
PLAYWRIGHT_NODE_MODULES=/runner/node_modules \
  node tools/regression-matrix-runner.mjs --url http://127.0.0.1:18791
```

## Stop

```sh
docker compose -f compose.x26-private.yaml stop candidate
```

The expected resting state after private review is stopped. Ordinary stop does
not remove images or unrelated containers.

## Update

Build a new explicit private tag from a committed source, update only the
`image:` line in this Compose file, run `docker compose ... up -d candidate`,
then repeat readiness, focused X26 and browser/runner acceptance. Never use a
floating image tag.

## Backup and restore

There is no server database or durable container state to backup. The exact Git
commit, image digest, exported matrix report, screenshot and receipt directory
are the backup basis. Browser projects remain user-controlled data-only files.

To restore the previous private candidate, stop this workspace and restart the
retained `intent-mcu-x25-candidate` container on `127.0.0.1:18790`. Public
rc.48 and its rc.47 rollback are outside this workspace and remain unchanged.

## Destructive reset

No reset is part of normal operation. If a later owner explicitly requests a
destructive reset, first record the exact image digest and receipt, stop only
`intent-mcu-x26-candidate`, then remove only that named container. There are no
named data volumes to delete; never use `down -v`, image prune, or a broad
container cleanup command.

## Network and volume rationale

The candidate uses a normal private Docker bridge and one loopback-published
port, not host networking. The Docker socket is required only by the existing
gateway to start its already bounded, network-disabled disposable compiler and
runtime workers. The top-level empty volume map is intentional: this candidate
is stateless, reports are exported to the receipt workspace, and adding a
persistent volume would violate the no-new-store boundary.
