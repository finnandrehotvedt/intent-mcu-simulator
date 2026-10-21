# Migration to 1.1.0-rc.96

There is no account, cloud project database or server-side project migration.
All project files remain learner-owned local files and browser recovery remains
local and separately labelled.

Rc.96 changes presentation, documentation and immutable model-library identity
only. Recognized rc.95 files migrate data-only after complete validation,
preserve all authored cells and clear executable/runtime authority. The
ordinary Open chooser and cancellation path do not rewrite a learner-owned
file. No project, package, compiler-artifact, cache or browser-storage schema
requires conversion.

Rc.95 adds one strictly bounded `appearance` field to current authored AVR
project data. The accepted value is one of two project-owned fixed-resistor
body presets and cannot change pins, nets, resistance, model, position,
rotation, source or runtime authority. Existing files without the field open
with the default appearance. Files carrying the prior recognized X55 model
identity migrate data-only to the current identity, preserve authored data and
clear executable/runtime authority; the original file is never overwritten.
Unknown or malformed appearance and model identities remain rejected.

Rc.94 changes no project, package, model-library, cache or browser-storage
schema. X49 authored offsets, compiler claims, worker observations and accepted
projections are transient current-tab state and are never saved or restored.
Existing learner-owned files require no conversion; Open grants no X49 build,
runtime, result, physical or verdict authority.

Rc.93 recognizes four earlier current-model identities: pre-X47, pre-validation,
pre-UI and pre-async-epoch. Each path completely validates the saved data,
preserves the same 25 authored cells, records migration provenance and clears
artifact, runtime and X47 authority. The original learner-owned file is never
overwritten. A fresh Build and Run are required before any current runtime
action. Unknown or malformed model identities remain rejected.

X47 previews and request/queue/execution/cancellation state are transient and
are not stored in project files or browser recovery. Retained in-tab facts are
historical non-current evidence after retirement and grant no Apply or Resume
authority.

Rc.92 changes no project, package, compiler-artifact, model-library, cache or
browser-storage schema. X43 interval observations are transient current-tab
views bound to a current AVR worker. They are never saved or restored, so
existing files require no conversion and Open grants no profiling authority.

Rc.91 changes no project, package, compiler-artifact, model-library, cache or
browser-storage schema. X42 capture is transient current-tab observation bound
to a current AVR worker lifecycle. It is never saved in a project or restored
by Open, so existing learner-owned files require no conversion and Open grants
no capture, executable or runtime authority.

Rc.90 changes no project, package, compiler-artifact, model-library, cache or
browser-storage schema. Simple/Advanced is session-only presentation state and
is not written to learner files or browser storage. Existing files require no
conversion; Open retains its strict data-only and fresh-Build boundary.

Rc.89 changes no project, package, compiler-artifact, model-library, cache or
browser-storage schema. It corrects the release-bound X86 acceptance navigation
for existing dialogs and records the original criterion closure without adding
offline execution or storage. Existing learner-owned files require no
conversion; Open remains data-only and requires a fresh online Build before
Run.

Rc.88 changes no project, package, compiler-artifact, model-library, cache or
browser-storage schema. Its historical demonstration validator is a separate
read-only data path for four exact rc.86 release/profile/model-lock identities;
it never rewrites an original, restores runtime authority or installs a
project. Existing learner-owned files require no conversion.

Rc.87 changes no project, package, compiler-artifact, cache or browser-storage
schema. Recognized older X56 model-library files still require the existing
explicit data-only migration; migration clears runtime and verdict authority
and never overwrites the original. Current Pico measurement SVG data is only
available after a genuine current Run, while no-current exports remain
explicit. Existing learner-owned files require no conversion.

Rc.86 changes no project, package, runtime, cache or browser-storage schema.
The X70 no-current slice reads the current validated authored graph and
downloads a separate standalone SVG without saving or installing authority.
Existing projects, browser recovery, history and learner-owned files require
no migration. The file contains no firmware or current-runtime evidence.

Rc.85 changes no project, package, runtime, cache or browser-storage schema.
The section-bounded sticky workbench reuses the existing authoritative control
and dialog nodes and converts no learner data. Existing projects, recovery,
history and downloaded files require no migration.

Rc.84 changes no project, package, runtime, cache or browser-storage schema.
X75 reads the current validated authored graph and downloads a separate local
data-only build-list/netlist document. Existing project files and rc.83 browser
data require no conversion. The export grants no procurement, firmware,
runtime, result or physical-equivalence authority. An rc.83 release-bound
physical checklist remains historical and is not silently presented as an
rc.84 record; create a new current-release checklist if needed.

Rc.83 changes no project, package, runtime, cache or browser-storage schema.
The top-workbench and seven-popup layout moves the existing authoritative DOM
owners without cloning or converting their data. Existing project files,
browser-local history and learner-owned downloads require no conversion. An
rc.82 release-bound physical checklist remains historical and is not silently
presented as an rc.83 record; create a new current-release checklist if needed.

Rc.82 changes no project, package, runtime, cache or browser-storage schema.
The X86 matrix is static read-only documentation and grants no offline or
executable authority. Existing learner files require no conversion. As with
the prior release-bound manual checklist, an rc.81 checklist record is not
silently rewritten; create a new rc.82 record if a current-release checklist
is required.

Rc.81 changes no project, package, runtime or browser-storage schema. Physical
checklist files are deliberately release-bound manual records: an rc.80 private
candidate file rejects under rc.81 and is never silently rewritten. Re-enter
or explicitly download a new rc.81 checklist if needed. This changes no
learner project and grants no hardware, firmware, verdict or certification
authority.

Rc.80 changes no project, package, capability-discovery or stored-browser
schema. The static release-delta document is read-only reviewed metadata and
has every action/verdict authority flag fixed false. Existing learner files,
projects and retained experiment packages require no conversion.

Rc.79 changes no project, experiment-package or stored browser schema. The X41
Before/After comparison holds the two selected canonical package texts and its
accepted projection only in the current tab. It does not install either
project, rewrite a package, save comparison state or restore executable,
runtime, result or verdict authority. Existing learner files require no
conversion, and reload starts with empty comparison slots.

Rc.78 changes no project schema or stored project semantics. Optional local
version history is off by default and writes only after explicit opt-in plus an
explicit Save local version action. A retained version contains the same
strict canonical data-only project envelope as a downloaded file. Opening it
uses the normal Open validation and unsaved-change boundary, clears executable
authority and requires a fresh Build. Turning history off preserves retained
versions but stops database access; browser storage is local convenience, not
server storage, encrypted storage or backup.

Rc.77 changes no project schema or stored project semantics. The X64 summary
and literal source-file difference are transient projections of an already
accepted X05 current/candidate pair. They are never saved, grant no mutation or
runtime authority and require no file conversion. The existing X05 Apply action
still revalidates the exact base and installs authored data only, requiring a
fresh Build before Run.

Rc.76 changes no project schema or stored project semantics. Project search is
transient presentation rebuilt from the current strictly validated authored
project. Queries, result lists and navigation focus are not saved. Existing
files require no conversion; Open still restores no executable authority.

Rc.75 changes no project schema or stored project semantics. The Connections
disclosure is a second, keyboard-operable projection of the current named-pin
graph and uses the existing edit transactions. Selection, focus and reconnect
mode are presentation state and are not saved. Existing project files require
no conversion and Open still restores no executable authority.

Rc.74 changes no project schema or stored project semantics. A retained
experiment package may be opened through the separate checkable-evidence file
action for historical, read-only review. That action does not install a project
or restore firmware, runtime state, outcomes, executable authority or verdict
authority. Existing local project files require no conversion.

Rc.73 publishes two immutable project-owned model-library bundles. Recognized
older files bind to the retained pre-X56 bundle only after strict validation.
Moving a retained project to the current bundle is an explicit
preview-and-download operation that creates a new
`intent-mcu-project-envelope@8` data-only copy and never overwrites the open
original. Opening or migrating clears executable authority and requires a fresh
Build; no firmware, runtime state, evidence, result or verdict is replayed.

Rc.25 adds only derived compatibility presentation and tests. It changes no
project schema, accepted source, circuit topology or local-file migration.

Rc.27 adds candidate-v3 branch reconnect without changing a project schema.
Existing explicit net, endpoint and junction IDs remain canonical. Reconnect
removes only stale stored route geometry for the changed net; Save/Open remains
data-only and requires a fresh Build.

Rc.28 adds no file conversion. Newly placed and duplicated AVR parts use the
existing project schemas and stable-ID rules. A duplicate begins disconnected;
Download/Open stores authored data only, clears history and requires a fresh
Build. Visible automatic-route branch selectors are presentation only.

Rc.29 adds no file conversion. Fault classification and corrective copy derive
from the existing validated topology and are not stored as project authority.
Open remains data-only and a fresh Build is required.

Rc.30 adds no file conversion. Runtime trace selection is local presentation
state; transition records, timebases, artifact identities and generations are
never project-file authority. Open clears prior trace evidence and requires a
fresh Build/Run.

Rc.31 advances the common wrapper to `intent-mcu-project-envelope@2`. Version
2 adds one strictly bounded data-only `brief` containing purpose, inputs,
outputs, boundary cases and acceptance criteria. An rc.30/version-1 envelope
or a supported legacy inner project opens with an explicit empty brief and is
saved only as a new version-2 copy. Brief prose and criteria never restore or
grant executable, runtime or verdict authority.

Rc.31 saves `intent-mcu-project-envelope@2` for AVR, RP2040 Pico,
ESP32-C3 and STM32F429ZI. The envelope identifies one exact tested profile and
contains that profile's validated authored project plus its inert brief. It contains no firmware,
runtime/session authority, verdict or secret.

Rc.32 advances the common wrapper to `intent-mcu-project-envelope@3` and the
brief to `intent-mcu-project-brief@2`. Each criterion gains bounded
project-local `codeRefs` and stable uppercase `testRefs`. Rc.31 envelope-v2
files migrate each criterion with explicit empty reference arrays. Current
runtime result links are never serialized, so Open always starts requirements
as `Untested` and requires a fresh Build/Run before a current result can be
linked.

Rc.33 advances the common wrapper to `intent-mcu-project-envelope@4` and the
brief to `intent-mcu-project-brief@3`. The brief may contain bounded voltage,
pin, timing and other clarification questions. Every item is unresolved by
definition: no status, support claim, verdict or runtime authority is stored.
Rc.32 files migrate with an explicit empty unresolved-question list.

Rc.34 advances the common wrapper to `intent-mcu-project-envelope@5` and the
brief to `intent-mcu-project-brief@4`. Explicit required peripheral/component
targets are saved without feasibility status. The current app recomputes each
as available, unsupported, unknown or unresolved from project-owned authority;
this cannot grant Build, runtime or verdict authority. Rc.33 files migrate with
an explicit empty required-capability list.

Rc.35 does not change the common project-file schema. A reviewable patch is
transient `intent-mcu-project-patch@1` input containing one complete current
envelope plus the exact base hash. It is never project authority or persisted
state. Review changes nothing; Apply revalidates the base and candidate, then
installs authored data only and requires a fresh Build.

Rc.36 does not change the common project-file schema. A design comparison is
transient presentation derived from the strictly revalidated current project
and one reviewed rc.35 candidate. Both must retain the exact same normalized
brief. Documented model limits and capability states are recomputed from the
existing project-owned authorities; no score, winner or verdict is stored.

Rc.37 does not change the common project-file schema. Shared domain requests
are transient, strict local inputs to the same project, electrical and test
engine used by the visible UI. The local agent adapter cannot mutate or persist
a project, call the network, Build, Run or restore executable authority.

Rc.38 does not change the common project-file schema. The seven local action
requests and their generation/TTL/cancellation state are transient browser
state. Export returns the same canonical data-only envelope and never stores
action authority, executable bytes or runtime evidence in a project file.

Rc.39 does not change the common project-file schema. Its optional local stdio
adapter carries only the same seven rc.38 action contracts to the same browser
engine at the fixed Lab origin. It adds no server project, account, credential,
public endpoint or Apply authority. Export remains the same canonical data-only
envelope, and Open still requires a fresh Build before Run.

Rc.40 does not change the common project-file schema or any of the seven action
contracts. Capability discovery is a transient read-only stdio response. It is
never stored in a project and cannot restore Build, runtime, Apply or topology
authority. Existing local projects and rc.39 clients remain compatible.

Rc.43 advances the common wrapper to `intent-mcu-project-envelope@6`. It adds
one optional, strictly validated data-only AVR thermostat scenario timeline.
Each authored case stores ordered bounded input events and one explicit D13
observation window. The actual executed pin and capture time are runtime
evidence and are never saved. Rc.42/version-5 files open with an empty timeline;
Open clears every prior result and still requires a fresh source-bound Build.

Existing accepted files remain readable:

- AVR contact-persistence and `teach-lab-project@2` files;
- RP2040 Pico project-v1 files;
- ESP32-C3 project-v1 files;
- STM32 project-v2 and source-only project-v1 files.

Migration occurs in detached memory only after strict validation. It never
overwrites the source file. STM32 v1 receives the documented default teaching
circuit. Lossy AVR project-v1 conversion remains available only through the
explicit legacy migration action.

After Open, review the migration message and Build fresh. A successful Open
clears executable authority and transient history; malformed, oversized,
unknown, profile-mismatched or unsupported input leaves the active profile and
draft unchanged. A valid file for another installed profile routes to that
profile only after complete validation and leaves the previous profile parked.

Rc.19 adds no file conversion. When a valid same-profile Open or AVR New would
replace authored changes, choose Keep editing, request a data-only Download
copy, or explicitly Discard and continue. A download request does not clear the
warning because the browser or operating system owns final storage acceptance.

Rc.20 adds no file conversion. Download copy and ordinary Open remain the
portable path. On a supported secure desktop browser, Open & connect may retain
an in-memory handle for the current session, and Save copy may choose a new
location without changing the original. A legacy file is never connected for
automatic overwrite; first save a new common-format copy. Cancellation or an
incomplete native write leaves the previous handle and dirty state unchanged.

Rc.21 adds no file conversion. Compiler diagnostics are transient presentation
data bound to the current profile and source revision; they are never stored in
the project envelope or treated as executable authority. Open still requires a
fresh Build.

Rc.22 keeps the same envelope and narrow-profile nested schema identities.
Pico, ESP32-C3 and STM32 layout objects may now contain strict project-owned
`wireRoutes` alongside existing positions and wire colours. Older accepted
files normalize missing route storage to an empty object and use deterministic
automatic routes. Route and colour data never supply topology, electrical or
executable authority; Open still validates named-pin nets and requires a fresh
Build. Reconnecting a cable endpoint removes that cable's stored route so the
new topology cannot inherit stale geometry.

Rc.23 adds no file conversion. The shared dark canvas and corrected automatic
AVR lane placement are deterministic presentation changes. Stored user routes,
named-pin topology, source and executable authority are unchanged.

Rc.24 adds no file conversion. Example cards construct the same validated
authored project documents already accepted by each profile. Loading or opening
an example excludes executable state and requires a fresh Build before Run.

Use **Legacy copy** before rolling back to rc.16. The exported compatibility
file uses that profile's prior accepted schema and contains authored data only.
