# Rollback basis for 1.1.0-rc.90

Rollback is limited to the Lab application container. DNS, Caddy routing, the
Teach apex, classroom, security lab, mail and unrelated containers remain
unchanged.

Retain exact accepted rc.89 source commit
`b951a752c378579c79e48ca86a1aaae931869118` and VM103 image
`sha256:aafa74a1cd80008f5024c5a9d4903034f13f93ac6efe938eade0262c011d8e42`
as the pre-rc.90 app-only recovery basis.
If release acceptance fails, restore that exact app image and files, recreate
only the Lab container, wait for health and verify Lab plus the existing
Teach-domain URLs.

Rc.90 adds only the shared session-only Simple/Advanced presentation switch.
Rolling back restores rc.89 without converting, rewriting or deleting any
learner project, browser history, runtime evidence or downloaded file.

Rc.89 corrects the X86 acceptance path for the current dialogs and records the
original offline-matrix criterion closure. Rolling back restores rc.88
application bytes and partial status. It does not add, migrate or delete a
service worker, cache, learner project, browser history or downloaded file.

Rc.88 adds the finite historical demonstration validator and records the
reviewed X70 criterion closure. Rolling back restores rc.87 application bytes
and partial status. It does not rewrite, migrate or delete any preserved
historical SVG, learner project, browser history or downloaded file.

Rc.87 publishes only the reviewed Pico presentation pacing and current-runtime
measurement path in the existing X70 export. Rolling back restores rc.86's
explicit no-current-only public behavior. It does not migrate, rewrite or
delete learner-owned project, history, package or downloaded SVG files.

Rc.86 adds only the local X70 no-current accessible SVG export and compact
nine-tool/status layout correction. Rolling back removes that export and
restores rc.85 without migrating, rewriting or deleting learner-owned data.

Rc.85 changes only the section-bounded sticky presentation of existing
workbench controls. Rolling back restores the rc.84 non-following top controls
without migrating, rewriting or deleting learner-owned data.

Rc.84 adds only the local X75 build-list/netlist export and its Inspector blur
commit correction. Rolling back removes that export action and restores the
rc.83 Inspector event behavior without migrating, rewriting or deleting any
learner-owned project or downloaded export.

Rc.83 changes only presentation and accessible popup ownership. Rolling back
restores the long document layout while preserving learner-owned project files,
named-pin topology, source, local-history records and compiler/runtime images.

Rc.32 writes common envelope v3. Before an app rollback, retain the learner's
v3 file unchanged; rc.31 cannot open its added criterion reference fields.
Preserve an rc.31-compatible version-2 copy only through a separately verified
conversion that intentionally omits code/test references. Rc.31 writes common
envelope v2; rc.30 cannot open its added brief field. Export or preserve an
rc.30-compatible version-1 copy only through a separately verified conversion
that intentionally omits the brief. An rc.22 through rc.30 file that contains
narrow-profile `wireRoutes` should be retained as the learner's original, then
opened in rc.21 only through an rc.21-compatible copy if strict older nested
validation rejects the added layout field. The existing **Legacy copy** remains
available for a further rollback to rc.16 and contains no executable/runtime
authority.

Native file handles are session-only browser objects and do not survive an app
container rollback or page reload. Learner-owned files remain unchanged; use
ordinary Open after rollback and Build fresh.

Rc.21 diagnostics are transient and contain no project or runtime authority.
Rc.22 route geometry and cable colour are authored layout only. Rollback removes
the new route controls and crossing key; it does not change source, firmware or
the physical/electrical topology recorded by named endpoints.

Rc.23 changes only shared canvas presentation, deterministic automatic AVR
lane placement, acceptance coverage and routing guidance. Rolling back restores
the rc.22 cream narrow-profile canvases and earlier automatic AVR lane choice;
it does not migrate or discard learner-owned data.

Rc.24 adds only validated authored-data examples and their visible cards.
Rolling back removes those cards and the second AVR PWM lesson; it does not
alter learner-owned files, controller runtimes or electrical topology.

Rc.25 adds only the derived compatibility matrix, documentation and acceptance
tests. Rolling back removes that presentation without changing learner files,
catalogue definitions, compiler/runtime behavior or electrical topology.

Rc.27 adds strict candidate-v3 branch reconnect and completes the existing
branch-versus-whole-net transaction controls. Rolling back removes reconnect
authority but does not migrate learner files or alter their named-pin graph;
open the retained file in the older release and Build fresh.

Rc.28 adds AVR placement, disconnected duplication and visible automatic-route
branch selectors. Rolling back removes those controls without converting or
discarding learner-owned files; open the retained file in rc.27 and Build
fresh. Narrow-profile graphs are unchanged.

Rc.29 adds actionable fault classification and documentation without changing
the project envelope. Rolling back restores rc.28 diagnostic copy; learner
files and named-pin topology need no conversion. Open the retained file and
Build fresh.

Rc.30 adds only source-bound runtime trace projection and visible viewer state.
Rolling back removes the shared viewer without converting learner files. Trace
records and selection are transient and are not restored after rollback.

Rc.74 adds a separate local evidence-package review action and visible
measurement identity/coordinate metadata without changing project files,
compiler/runtime producers or stored authority. Rolling back removes that
report surface only. Learner-owned project and evidence files remain unchanged.

Rc.75 adds the Connections text projection and keyboard operations without
changing project files or graph authority. Rolling back removes that alternate
editing surface only; the authored named-pin topology remains unchanged.

Rc.76 adds transient current-project search without changing project files,
graph authority, Build or runtime state. Rolling back removes the search
disclosure only; learner-owned files and authored topology remain unchanged.

Rc.77 adds a typed authored-fact summary and complete literal source-file
difference to the existing X05 proposal review. Rolling back removes only that
additional transient detail. It does not migrate learner files, change the X05
parser or Apply lifecycle, or alter compiler/runtime authority.

Rc.78 adds only opt-in first-party browser-local version history. Rolling back
removes its controls and access but does not delete or migrate learner-owned
downloaded files. Browser-managed IndexedDB records may remain inaccessible to
the older app; preserve needed work as a downloaded canonical project before a
manual rollback. No server-side project store exists.

Rc.80 adds only a strict static machine-readable release-delta document and
its discovery links. Rolling back removes that metadata file and copy. It does
not migrate, rewrite or delete learner projects, packages, browser history,
firmware or runtime evidence, and no new server state exists.

Rc.81 adds only the strict current-tab manual physical-verification checklist,
its local file/print workflow and discovery links. Rolling back removes that
surface without deleting projects or files. Rc.81 checklist files are
release-bound and rc.80 does not accept them; retain the learner-owned file
unchanged rather than rewriting or presenting it as physical proof.

Rc.79 adds only transient local comparison of two retained strict-v3 experiment
packages. Rolling back removes the comparison disclosure and its in-tab state;
it does not delete, rewrite or migrate either learner-owned package or project
file. No package bytes or comparison authority are stored by the server.

Browser recovery and learner-owned files are never deleted by deployment or
rollback. Do not change DNS, shared Caddy configuration, compiler/runtime
images or unrelated services. After rollback verify `/`, `/healthz`,
`/readyz`, `/controllers.html`, all four bounded Build/Run paths and the apex,
www, agent and security domain suite.
