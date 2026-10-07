# Migration from public 0.9.0

No server database or account migration exists. Projects are browser-local.

Before a future authorized cutover, users should export important projects as
canonical project JSON. The candidate keeps the versioned project-v2 storage
model and validates every reopened project before use. Older project-v1 files
use the documented one-way migration; the original v1 browser key is left
untouched for rollback.

After upgrade:

1. reopen or import the project;
2. review any explicit dropped-field or compatibility report;
3. rebuild firmware because stored artifacts are intentionally stale;
4. confirm wiring and supported component limits before Run.

Rejected imports and Prompt Bridge responses are atomic: they do not partially
replace the current project. No compiler job, firmware artifact, trace or
runtime state is migrated between releases.
