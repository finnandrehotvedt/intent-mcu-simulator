# W08 placement and duplication release contract

Status: approved implementation contract, 2026-10-18

Authority: receipt
`desktop-etvt6l5-ct109-lab-w08-placement-20261018-001`, following public W06/W07
owner acceptance and the bounded independent Desktop review recorded by the
source thread.

## Complete requirement

W08 remains exactly: rotate, duplicate, delete and keyboard-navigate component
instances. The complete manual-construction promise in `SPEC.md` also requires
click-add and drag-add to create fresh stable project-local IDs, and requires
duplicate plus repeated Undo/Redo never to alter an existing ID or reference.

The main AVR editor is the general component-instance editor. Ordinary
project-v2 supports its five selectable models and candidate-v3 supports every
model selectable in its active AVR catalogue. The bounded Pico, ESP32-C3 and
STM32 teaching editors keep their explicit one-board/one-resistor/one-LED
single-instance contracts: their already accepted move, rotate, delete,
keyboard and stable-ID recovery behavior remains truthful, and they do not
gain or imply arbitrary component multiplicity.

## Invariants

1. Click-add and HTML drag/drop place one selectable non-controller component
   at a bounded snapped canvas position with one fresh stable ID. The sole
   compatible controller remains protected from addition or duplication.
2. Duplicate creates one disconnected copy with a fresh ID, cloned approved
   variant/properties/controls and the same rotation at a bounded visible
   offset. Existing component IDs, nets, endpoints, junctions and routes remain
   byte-identical.
3. Move and rotation change layout only. Delete changes topology and removes
   only references to the deleted component. Every accepted add, duplicate,
   move, rotate or delete is one complete-document Undo/Redo transaction.
4. Mouse/pointer and keyboard paths remain equivalent: catalogue Enter/Space
   adds, catalogue drag/drop places, canvas arrows move, `R` rotates, Delete
   removes, and Ctrl/Cmd-Z plus redo restore the canonical document.
5. Duplicate IDs, stale revisions, unknown sources/types, invalid positions,
   protected controllers, malformed commands, graph limits and electrically
   unsafe results reject atomically without project, revision or history
   mutation.
6. Add, duplicate and delete retire executable/runtime authority. Pure move and
   rotation preserve matching executable authority. Save/Open remains
   data-only, restores no history or runtime, preserves all accepted IDs and
   placements exactly and requires a fresh Build whenever topology changed.
7. W06/W07 branch-versus-net semantics, exact pin references, wire attachment,
   explicit junction/crossing truth and WIRE-LANE/body avoidance remain
   unchanged after every W08 operation and history transition.

## Acceptance

1. Unit tests cover ordinary project-v2 and candidate-v3 click/add command,
   duplicate, move, rotate, delete, exact Undo/Redo, fresh-ID allocation,
   reference preservation, lifecycle generation and atomic negative cases.
2. A real desktop Chromium journey uses click-add, actual catalogue drag/drop,
   duplicate, pointer move, keyboard move/rotate/delete, Undo/Redo and actual
   Download/Open. It verifies exact placement, IDs, controls/properties,
   disconnected copies, pin/wire attachment, explicit junction/crossing,
   zero horizontal overflow, zero outside requests and no browser errors.
3. The ordinary AVR project-v2 editor and the three narrow fixed profiles pass
   focused regressions; the 64-component/128-net/256-endpoint graph remains
   within its accepted behavior without stale geometry.
4. Public completion requires exact GitHub/source equality, immutable
   rollback to rc.27, healthy read-only/no-host-port VM103 deployment, live
   HTTPS browser acceptance, security and Teach-domain regressions, restart
   health, a visible branch-selection recipe and a fresh public evidence image
   that Desktop can reproduce.

On complete acceptance P1 moves from 56 complete / 3 partial to 57 complete /
2 partial. The remaining P1 IDs are W10 and I03. X status changes only if its
own exact completion clauses independently pass.
