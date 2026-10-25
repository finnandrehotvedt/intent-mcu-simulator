# API-03 canonical circuit editing

API-03 extends the private browser-session transport with owner-approved,
canonical circuit editing. It does not expose firmware Build, Run, native
execution, file Open, project duplication, or deployment.

## Authority and profile matrix

Editing is disabled by default. The Lab owner must explicitly select
`edit_circuit` when creating a pairing. A read-only pairing cannot claim or
infer that scope.

| Profile | Discover/read | Canonical edit |
| --- | --- | --- |
| ATmega328P 16 MHz | Yes | Yes |
| RP2040 Pico | Yes | Yes, bounded series-LED model |
| ESP32-C3 Dev Module | Yes | Yes, bounded series-LED model |
| STM32F429ZI Nucleo-144 | Yes | Yes, bounded series-LED model |

The AVR owner rejects editing while bounded subcircuits are present. Each
non-AVR owner accepts only its fixed controller plus its existing resistor/LED
teaching model, exact named pins and profile validator. Unsupported component
types, arbitrary IDs, branch disconnects, cross-profile pins and invalid final
graphs reject the entire batch without mutation. API-04,
including real Open and duplicate-project operations, remains pending.

## Identity and concurrency

The owner supplies the canonical project generation as the stable project ID
and the editor's monotonic revision as the revision. Content hashes are not
used as edit revisions, so changing a project and later recreating identical
bytes cannot create an ABA match.

Every mutation carries the paired project ID and exact expected revision.
Stale revisions, replaced projects, expired sessions, revoked capabilities,
and unsupported profiles reject before mutation. Manual browser edits win a
race: a queued API edit with the old revision is rejected and the browser's
canonical bytes remain unchanged.

After every awaited heartbeat or pull, the owner rechecks its captured session,
capability, loop epoch and project ID. It obtains a fresh canonical snapshot
after pull and before synchronous execution. The canonical mutation owner then
checks both expected project ID and revision immediately before applying the
editor command. A delayed response from a revoked or replaced session cannot
mutate a successor project or cross into a re-enabled session.

## Commands

`edit.batch` accepts at most 16 named operations and commits them as one
canonical history transaction:

- add, duplicate, or remove a named component;
- set a validated component property;
- connect named component pins with a named wire or branch;
- disconnect a named wire or one named branch.

The adapter translates these operations into the existing project-editor
commands. The canonical electrical validator runs on the complete staged
result before one commit. A failed operation or invalid final graph leaves
project bytes, revision, persistence, history, and artifact state unchanged.

The owner creates the authoritative transaction ID from the bound session and
unique request ID, then returns it with the accepted result. A client cannot
choose or reuse the canonical transaction identity. Undo and Redo accept only
that returned ID.

`edit.undo` and `edit.redo` require the exact transaction ID at the canonical
history head. A manual edit or another transaction at the head causes a
conflict instead of undoing unrelated work.

## Lifecycle

Successful edits use the existing browser owner, persistence, rendering, and
lifecycle path. Electrical edits mark the project dirty and retire stale build
artifacts. No API-03 path starts a compiler, firmware worker, native runtime,
or Run operation.

## Independent CLI acceptance

`tools/browser-session-edit-client.mjs` reads and deletes one strict one-use
`.intentpair` ticket, with hidden standard input retained as a fallback. In
acceptance it independently creates a board, resistor, and
LED connected by three named nets, reads the resulting canonical graph, and
undoes the exact transaction. The real-browser test verifies the three visible
components and routed wires before Undo, exact byte restoration afterward,
atomic invalid-batch rejection, stale manual/API race handling, explicit scope,
delayed-pull containment across same-revision replacement/revoke/re-enable, and
zero Build requests or runtime-worker creation. Its optional JSONL mode keeps
the claimed capability only in one live process for successive bounded plans;
process exit, revoke, owner replacement or expiry requires fresh pairing.
