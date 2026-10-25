# RC139 three-profile circuit authoring

RC139 adds genuine data-only circuit authoring to the existing Pico, ESP32-C3
and STM32 workbenches. A user can start with the fixed controller only, place
multiple supported resistors and LEDs, move and rotate each instance, edit its
bounded property, connect and delete named-pin cables, and use exact Undo/Redo.
Stable instance IDs, project name, source and graph/layout data survive the
existing local Save/Open and browser recovery paths.

This is intentionally not a general electrical solver. The version-2
authoring maps expose several officially documented 3.3 V GPIO and ground
anchors while preserving the original runtime pin subset. Incomplete and
multi-GPIO authored drafts are valid project data but are not runnable.
Build/Run remains available only when the existing profile validator accepts
the exact original single-series LED path. See
`RC139-MULTIPIN-AUTHORING-MAPS.md` for pin provenance and limits.

Canonical browser-session API edits use the same graph owner. Batches remain
atomic and reject malformed IDs, type/ID mismatches, unknown or occupied pins,
duplicate endpoints, unsupported connections and schema-invalid graphs without
changing the accepted project.
