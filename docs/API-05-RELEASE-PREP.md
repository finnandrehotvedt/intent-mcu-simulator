# API-05 release preparation

API-05 prepares the private browser-session API for independent release review.
It does not publish or enable the API. The public release remains rc.133 until
Desktop separately approves CI, review, merge and deployment. The planned
release identity is rc.134; this preparation branch deliberately does not
change product version metadata.

## Exact release scope

The endpoint is same-origin `POST /api/session/v1`. It is disabled by default
and exists only while a user explicitly enables one temporary pairing in one
browser tab. The relay is ephemeral memory, not a project authority or store.
Secrets enter the reference clients on standard input and are never placed in
arguments, URLs, files or output.

The protocol has ten transport operations: `owner.register`,
`owner.heartbeat`, `pairing.create`, `pairing.claim`, `request.submit`,
`owner.pull`, `owner.authorize`, `owner.complete`, `result.read`, and
`owner.revoke`. Client requests expose seven read-only commands—
`capabilities.list`, `components.catalog`, `project.inspect`,
`components.list`, `component.pins`, `nets.list`, and `circuit.validate`—plus
three edit commands: `edit.batch`, `edit.undo`, and `edit.redo`.

Only the ATmega328P 16 MHz profile may claim `edit_circuit`. RP2040 Pico,
ESP32-C3 and STM32F429ZI remain discover/read-only. No operation can Build,
Run, compile, upload, open a device, create a runtime worker, invoke native
execution, or grant file authority.

## Canonical edits and atomic batches

`edit.batch` accepts no more than 16 operations. The six operation shapes are
component add, component remove, validated component-property set, named-pin
wire connect, whole-net disconnect, and named-branch disconnect. Stable IDs,
known component types, supported properties, named pins, topology and the final
electrical graph are validated by existing canonical owners. The entire staged
batch commits as one history transaction or changes nothing. The server-owned
transaction ID is required for exact-head Undo/Redo; another transaction or a
manual edit produces a conflict rather than touching unrelated work.

Every mutating request binds schema, session, project generation, monotonically
increasing sequence and exact expected editor revision. The owner performs a
fresh canonical snapshot and a final live authorization/deadline check
immediately before synchronous execution. Reload, Open, New, profile change,
revoke, expiry or project replacement removes the old authority.

## Limits and result semantics

- request body: 48 KiB; owner result: 40 KiB;
- pairing: 120 seconds; owner lease: 130 seconds;
- client idle: 120 seconds; client absolute life: 15 minutes;
- queued request: 30 seconds; transient full result: 5 seconds;
- queue depth: 16; request-ID/sequence capacity: 64;
- rate: 5 requests/second and 20 requests/10 seconds;
- active relay sessions: 32.

Malformed, unsupported, wrong-scope, stale, expired, revoked, replayed,
conflicting-ID, out-of-sequence, rate-limited, queue-full and oversized inputs
fail with stable `API_*` codes and do not mutate. Accepted and rejected owner
results are consumed once. A lost or oversized full response retains a compact
reconciliation record containing truthful terminal status, code, resulting
revision and transaction ID when present. An oversized response is initially
`indeterminate`; it is never mislabeled rejected after a mutation committed.
An identical retry may read reconciliation but never executes twice.

## File and browser boundary

API editing uses the same canonical project, rendering, persistence and history
owners as manual editing. The integrated journey proves API edit → browser
Download copy → actual Open project restores exact source, project name,
layout, parts, properties and wires. Open revokes the prior session. Storage
denial keeps the accepted in-memory edit visible and reports that local save
failed. Corrupt and quota recovery remain covered by the canonical persistence
suites. Two separate browser processes receive separate sessions and cannot
cross-use capabilities.

## Release gate and rollback

Publication is eligible only after PR 42's exact head and hosted CI are green,
Desktop independently opens the attached portable project and screenshot, and
Desktop explicitly approves review, merge and deployment. The release must
keep API access opt-in, disabled by default and paired per tab, with no new
listener or infrastructure. Rollback is the release commit revert; rc.133 and
the existing public runtime stay unchanged until that separate decision.
