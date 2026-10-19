# Rollback basis for 1.1.0-rc.75

Rollback is limited to the Lab application container. DNS, Caddy routing, the
Teach apex, classroom, security lab, mail and unrelated containers remain
unchanged.

Retain exact accepted rc.74 source commit
`7d417845d19fe88d344dd490d0983fd873d4c96c` and VM103 image
`sha256:d9da9190f6ba349982d6e6b56de28c604a038bbc505f14e745aee543842df2a1`
as the pre-rc.75 app-only recovery basis.
If release acceptance fails, restore that exact app image and files, recreate
only the Lab container, wait for health and verify Lab plus the existing
Teach-domain URLs.

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

Browser recovery and learner-owned files are never deleted by deployment or
rollback. Do not change DNS, shared Caddy configuration, compiler/runtime
images or unrelated services. After rollback verify `/`, `/healthz`,
`/readyz`, `/controllers.html`, all four bounded Build/Run paths and the apex,
www, agent and security domain suite.
