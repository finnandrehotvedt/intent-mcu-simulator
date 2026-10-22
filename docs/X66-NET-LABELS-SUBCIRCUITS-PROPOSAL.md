# X66 net-label and subcircuit proposal

Original criterion:

> Grupper, notater, nettetiketter og underkretser gjør større oppsett lesbare uten å miste forbindelser.

## Current accepted slice

Rc.106 provides strict local non-electrical notes and visual component groups. They survive validated Save/Open, browser recovery and atomic Undo/Redo without changing the electrical graph. This proves the groups and notes clauses only. X66 remains partial because named electrical net labels and subcircuits are absent.

## Boundary: labels are not wires

A visual annotation that merely resembles a net label must never create, merge or authorize an electrical connection. The current annotation schema must therefore continue to reject any electrical-looking authority fields.

The next safe net-label increment should introduce a separate versioned schema whose label records bind to an existing canonical `netId`:

```json
{
  "schema": "intent-mcu-net-labels@1",
  "labels": [
    { "id": "label-heater", "netId": "heater-control", "text": "HEATER_CTRL", "x": 420, "y": 210 }
  ]
}
```

Required invariants:

1. `netId` must already exist in the accepted project graph; text can never select a net.
2. Equal text on different nets remains two labels and never merges those nets.
3. Different text on one net remains presentation metadata and never splits that net.
4. Create, edit, move, delete, Undo/Redo, Save/Open and recovery preserve the exact underlying project and canonical connectivity digest.
5. Project edits that remove a referenced net reject or atomically remove the dangling label under an explicit deterministic rule; no label may silently retarget.
6. Imported labels are strict plain data with exact keys, bounds, duplicate checks and no Apply, Build, Run, scenario, runtime or verdict authority.
7. The UI must say “Label existing net” and expose the bound canonical net name/ID; it must not say or imply “connect”.

Acceptance requires unit tests for all invariants and a browser journey that labels two distinct nets with identical text, moves components and wires, roundtrips the project, and proves the canonical connectivity digest is unchanged.

## Subcircuits are a separate later increment

A subcircuit is not a visual group. The minimum honest implementation needs a versioned project-owned subcircuit definition with explicit ports, stable internal component/net identities and deterministic instance expansion into the existing validator/runtime graph.

Required invariants:

1. Every external port maps to exactly one validated internal canonical net.
2. Instance IDs namespace every internal component and net without collisions.
3. Expansion is deterministic and produces the same electrical graph before and after Save/Open.
4. Moving, collapsing or expanding an instance is presentation-only and cannot drop or invent a connection.
5. Deleting an instance uses the existing electrical-change review and validation path.
6. Nested/cyclic definitions, unresolved ports, profile mismatches, hidden authority and stale catalogue identities fail closed.
7. Runtime execution receives only the expanded validated graph; no separate subcircuit runtime or worker is introduced.

Acceptance requires positive and adversarial schema tests, exact expansion-digest tests, roundtrip and Undo/Redo tests, and a browser journey where collapse/expand/move preserve all external and internal connections.

## Recommended sequence

1. Implement existing-net labels as the first private, no-producer increment.
2. Independently review and publish that increment while X66 remains partial.
3. Specify and implement one finite, non-nested subcircuit instance over existing supported components.
4. Close X66 only after both increments and the original connectivity-preservation journey are independently verified.

No visual-only net label is implemented by this proposal. That avoids a misleading intermediate control and preserves the distinction between annotation and electrical truth.
