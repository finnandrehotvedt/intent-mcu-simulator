# X66 bounded reusable subcircuit contract

Status: corrected for public release in `1.1.0-rc.109`. Independent review and
the actual default-thermostat journey close the original bounded readability
criterion without claiming general-purpose, nested or non-AVR subcircuits.

## Finite slice

The first reusable definition is an AVR-only two-part series LED stage. It has one fixed resistor, one basic LED, one private series net, and exactly two external ports: `source` and `ground`. A project may carry at most four definitions and eight instances. Definitions may contain at most eight components, twelve internal nets and four ports; this slice admits only the exact resistor-plus-LED topology. Definitions and instances are strict plain data and have no executable fields.

The owner schemas are `intent-mcu-subcircuits@1`, `intent-mcu-subcircuit-definition@1` and `intent-mcu-subcircuit-instance@1`. Each definition records an exact AVR profile, exact current model-library identity, stable local component/net IDs, and explicit port-to-internal-net mappings. This finite version admits only canonical local component IDs `resistor` and `led` and canonical local net IDs `source`, `series` and `ground`; renamed aliases fail closed so every renderer and presentation path addresses the same accepted grammar. Each instance records a stable ID, definition ID, one external existing canonical net ID per port, normalized position and collapsed presentation state.

Expansion prefixes every private identity with the instance ID. The resistor and LED become ordinary supported components. The private series net becomes one ordinary canonical net. Port nets are not duplicated: their internal endpoints are appended to the already validated external nets named by the instance bindings. The expanded graph is processed only by the exact validator owned by the open project kind and its locked model bundle. Candidate projects do not fall back to the narrower v2 catalogue, and neither path admits arbitrary unknown component types. Runtime still receives only the validated expanded graph.

Portable files retain the expanded canonical graph plus the strict owner document. Open strips only identities proven to belong to the declared instances, re-expands from the retained base graph, and requires exact canonical equality. It never repairs, retargets or guesses a mismatch. Earlier annotated-workspace versions migrate to an empty subcircuit owner.

## Seven required invariants

1. Every external port maps to exactly one definition-local net and every instance binds that port to exactly one existing canonical external net. Duplicate, missing or unresolved ports fail closed.
2. Instance IDs deterministically namespace every generated component and private net. Expansion rejects collisions before changing the graph; text and labels never select connectivity.
3. Expansion is pure and deterministic. Equal base graph, owner document, profile and model-library identity produce byte-identical validated graph and digest before and after Save/Open, recovery and local history.
4. Moving an instance and changing collapsed/expanded presentation update only owner/layout data. They cannot add, remove, merge, split or retarget an endpoint, component or net.
5. Creating or deleting an instance is one atomic electrical editor command using the existing validation, dirty-state, unsaved-change and Undo/Redo path. Delete removes exactly the namespaced components/private nets and their endpoints from bound external nets; failed validation leaves both graph and owner unchanged.
6. Nested or cyclic definitions, boards inside definitions, unresolved ports, duplicate identities, limits, profile mismatch, stale/unknown model-library identity, unsupported components/topology, markup and hidden Apply/Build/Run/scenario/runtime/verdict authority fail closed before installation. Parked non-AVR drafts never receive an AVR instance.
7. Runtime, compiler and instrumentation receive only the ordinary expanded validated graph. No subcircuit runtime, producer, scheduler, worker or alternate electrical solver exists.

## Acceptance

Unit evidence must cover strict schema parsing, every rejection above, two instances without collisions, exact expansion digest, atomic create/delete/Undo/Redo, presentation-only move/collapse, and migration of every trusted historical model lock as data-only or retained according to its existing role. Browser evidence must create an instance, show its explicit port bindings and generated members, collapse/expand, move, Save/Open, recovery and local history, then delete/undo while proving all external and internal connections and the canonical graph digest are preserved where the action is presentation-only. The browser must observe zero Build, Run, Scenario, producer or worker activity.
