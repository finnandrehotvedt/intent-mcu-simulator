# RC138 preserved-draft recovery

The shared **Recover a preserved browser draft** panel is available from the
Project and files dialog for all four controller profiles. It scans only the
project-owned browser-storage keys and validates each candidate with the
profile owner before offering recovery.

Valid entries disclose profile, authored name, saved time when available, and
validated part/net counts. A short nonsecret draft-ID prefix distinguishes
otherwise identical historical choices without exposing full storage keys.
Selecting **Open as separate copy** creates a fresh
per-tab draft ID. It preserves authored source, name, circuit and layout, and
checks that the original key still contains the exact source bytes after the
copy is installed. No firmware Build or Run is started.

Malformed entries remain listed as invalid and cannot replace the current
project. An in-progress source draft may be recovered even when that source is
not yet build-valid; build validation remains a later explicit action.
Reconstructed copies start at revision 0 with empty Undo history because prior
editor command history was never stored. This is recovery of saved authored
state, not proof of the cause of any earlier drawing-loss incident.

The exact model-library locks published in rc.136 and rc.137 are recognized
only in this recovery path as data-only migration anchors. Their saved source,
graph and layout are validated into a new copy under the current data model;
the historical bytes remain unchanged, executable authority is cleared and a
fresh Build is required. Neighboring or otherwise unknown lock hashes remain
untrusted and cannot replace the active project.
