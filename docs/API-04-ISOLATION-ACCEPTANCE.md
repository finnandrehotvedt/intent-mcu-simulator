# API-04 private isolation and lifecycle acceptance

API-04 remains a private review candidate. It adds no public profile, component,
compiler, runtime, service, or deployment.

| Acceptance area | State | Evidence |
| --- | --- | --- |
| Independent tabs/users and same-profile isolation | PASS integrated | API-02 multi-context journey plus two independent Chromium processes; distinct sessions and cross-capability rejection |
| Explicit AVR edit and truthful non-AVR read-only matrix | PASS | API-03 real browser and relay tests |
| Named pins, electrical validation, atomic invalid plans | PASS | canonical editor/electrical suites plus API-03 invalid batch browser case |
| Manual edit versus API race and exact-head Undo/Redo | PASS | reducer and actual Chromium stale-race cases |
| Delayed pull across same-revision replacement/revoke/re-enable | PASS | deterministic actual Chromium held-response case |
| Expiry after pull and before delivery | PASS integrated | held `owner.authorize` response released after request/client deadline; immediate pre-execute deadline guard leaves zero edits |
| Lost result response and identical retry | PASS | compact terminal reconciliation proves revision/transaction without replay |
| Malformed, wrong, expired, revoked, replayed and conflicting authority | PASS | relay suite, including bounded tombstones, scopes, rate, TTL and queue limits |
| 48 KiB request and bounded result handling | PASS | actual HTTP 413 request test and reachable 40 KiB result rejection/reconciliation |
| Tab close/refresh/revoke and server restart | PASS | actual refresh/revoke plus HTTP relay replacement proving old queue/tokens disappear |
| Source/name/parts/properties/wires through canonical Save/Open | PASS integrated | API-created circuit is downloaded through actual Save, undone, reopened through actual file input, and compared as one exact canonical project; Open revokes prior scope |
| Corrupt/quota/denied browser storage | PASS integrated for denial; reuse for corrupt/quota | API edit under forced `QuotaExceededError` preserves accepted in-memory project and reports local-save failure; existing recovery suites own corrupt/quota startup cases |
| Routed named pins and body avoidance | PASS (existing owner) | route-authoring, wire-lane and actual visible API edit canvas checks |
| Build, Run and worker isolation | PASS | actual API browser counters remain zero |

The relay response bound is intentionally lower than the HTTP body bound. This
keeps an oversized owner result representable as `API_RESPONSE_LIMIT`; it can no
longer fail at transport first and leave the client indefinitely pending.

After a terminal result has been read or its transient payload retired, an
identical retry returns `API_REQUEST_RECONCILE` with only the truthful terminal
status, code, resulting revision and canonical transaction ID when present.
It never executes again and never invents the retired payload.
