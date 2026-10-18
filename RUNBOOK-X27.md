# X27 private coverage candidate

X27 is a deterministic review projection over the immutable X26 matrix and its
current execution evidence. It does not execute firmware independently and it
does not grant verdict authority.

## Lifecycle

Build and start the loopback-only candidate:

```sh
docker-compose -f compose.x27-private.yaml build
docker-compose -f compose.x27-private.yaml up -d --no-build
curl -fsS http://127.0.0.1:18793/readyz
```

Run the targeted contract suite:

```sh
npm run test:x27
```

Run one integrated browser projection from the pinned browser-acceptance image:

```sh
docker run --rm --network host \
  -v "$PWD:/workspace:ro" -w /workspace \
  -e PLAYWRIGHT_NODE_MODULES=/runner/node_modules \
  local/intent-mcu-browser-acceptance:playwright-1.55.0 \
  node tools/coverage-report-runner.mjs --url http://127.0.0.1:18793
```

Stop and remove only this private candidate:

```sh
docker-compose -f compose.x27-private.yaml down
```

The service binds only `127.0.0.1:18793`. It does not alter public DNS, Caddy,
the public container, or any compiler/runtime authority. Coverage reports are
transient browser state and are cleared by reload, Open, source/circuit edits,
profile changes, or explicit clear. Save/Open never restores them.

## Evidence boundary

The denominator is always seven declared bounded partitions across four
profiles and one requirement family. AVR requires four individual producer
records; its aggregate 4/4 summary is insufficient. C3 QEMU CPU/UART evidence
and the project-owned GPIO2 model remain separately labelled. Instruction
coverage is unavailable and physical behaviour coverage is not claimed.
