# X28 private long-duration candidate

This reusable workspace owns only the loopback X28 review candidate. Public
rc.50, DNS, Caddy, API routes, profiles and persistent project storage remain
unchanged.

Build and start:

```sh
docker compose -f compose.x28-private.yaml build
docker compose -f compose.x28-private.yaml up -d --no-build
```

Review at `http://127.0.0.1:18794/`. The integrated UI run performs exactly
two fresh AVR builds (the immutable correct fixture and its known-bad direct
deadline control), then runs the three X28 cells. Do not run an unchanged
duplicate four-controller X26 matrix.

Focused checks:

```sh
docker run --rm --network none --read-only --tmpfs /tmp:size=32m,mode=1777 \
  local/intent-mcu-x28-private:1.1.0-rc.50 npm run test:x28
PLAYWRIGHT_NODE_MODULES=/runner/node_modules X28_LONG_DURATION_URL=http://127.0.0.1:18794 \
  node test/x28-long-duration-browser.cjs
```

Stop and remove only the private candidate:

```sh
docker compose -f compose.x28-private.yaml down
```

No X28 result is saved in a project. Reload, Open, source/circuit/profile
change and a new build clear report/export state. The timer shortcut exists
only in the checksum-locked fixture source and never authorizes generic CPU,
cycle or emulator-state mutation.
