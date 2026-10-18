# Migration to 1.1.0-rc.32

There is no account, cloud project database or server-side project migration.
All project files remain learner-owned local files and browser recovery remains
local and separately labelled.

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
