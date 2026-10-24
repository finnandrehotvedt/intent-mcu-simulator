# API-02 private browser-session candidate

This candidate exposes one explicitly enabled browser tab to one temporary,
read-only client. It is off by default and is not part of the public release.
The only scopes are `discover` and `read_project`; edit, build, run, firmware,
and device operations are unsupported.

## Security and lifetime contract

- Owner, client, and one-time pairing capabilities are separate 256-bit random
  values. The relay retains only SHA-256 digests. A pairing claim consumes its
  secret atomically, including an invalid or expired claim.
- The owner renews a 130-second lease. Closing, reloading, losing connectivity,
  revoking, or missing that lease stops processing and clears queued work. A
  browser cannot prove immediate delivery on close, so the UI states the honest
  bounded lease instead of claiming instant revocation.
- Client idle life is 120 seconds and absolute life is 15 minutes. Authentication,
  scope, and expiry are checked before duplicate handling. There is no replay
  queue after owner or client loss. Queued requests expire after 30 seconds;
  the relay also enforces five requests per second and 20 per ten seconds.
- The request-ID set and monotonic sequence are bounded to 64 operations. The
  client must pair a new session after that limit. Completed IDs become
  tombstones and can never execute again; mismatched reuse is rejected.
- HTTP bodies are capped at 48 KiB. Relay-owned input chunks and the explicit
  aggregate parse buffer are overwritten after parsing; JavaScript strings and
  runtime/network-internal copies cannot be promised zeroized. Responses are
  capped at 384 KiB. Inspect payloads exist only in
  process memory while queued/pending and for at most five seconds after
  completion, and are removed immediately from both result and duplicate caches
  on first read. The payload reference is then removed while
  its request tombstone remains. Garbage-collection timing is runtime-owned and
  is not presented as cryptographic erasure.
- Retired sessions are removed from the active map, expired clients clear all
  queued/pending work, and only one outstanding pairing may exist per session.
- The relay creates no files, database rows, cookies, URL secrets, analytics,
  or authoritative project copy. It emits no request, capability, or project
  logs. The browser remains the sole project authority and rechecks the exact
  revision immediately before every command.

## Candidate CLI

After the browser user chooses **API access → Enable and create pairing**, run:

```sh
printf '%s\\n' 'PAIRING_SECRET' | node tools/browser-session-readonly-client.mjs ORIGIN COMPONENT_ID
```

The client reads the one-time secret from standard input so it is not exposed
in process arguments, claims it, discovers capabilities, then reads canonical
model pins and actual net connections for the placed component. It never
prints either capability.
