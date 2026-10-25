# RC139 three-profile circuit authoring

RC139 adds genuine data-only circuit authoring to the existing Pico, ESP32-C3
and STM32 workbenches. A user can start with the fixed controller only, place
multiple supported resistors and LEDs, move and rotate each instance, edit its
bounded property, connect and delete named-pin cables, and use exact Undo/Redo.
Stable instance IDs, project name, source and graph/layout data survive the
existing local Save/Open and browser recovery paths.

This is intentionally not a general electrical solver. Each profile still
exposes only its previously declared source and ground pins, resistor A/B and
LED ANODE/CATHODE. Incomplete authored drafts are valid project data but are
not runnable. Build/Run remains available only when the existing profile
validator accepts the exact single series LED path. Branch wiring, extra GPIO,
new component models and inferred connections are not claimed.

Canonical browser-session API edits use the same graph owner. Batches remain
atomic and reject malformed IDs, type/ID mismatches, unknown or occupied pins,
duplicate endpoints, unsupported connections and schema-invalid graphs without
changing the accepted project.
