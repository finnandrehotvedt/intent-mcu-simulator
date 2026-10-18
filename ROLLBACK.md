# Rollback basis for 1.1.0-rc.28

Rollback is limited to the Lab application container. DNS, Caddy routing, the
Teach apex, classroom, security lab, mail and unrelated containers remain
unchanged.

Retain exact accepted source commit
`517f25c04d67e30ac66d91ceda5f7c039e44ef6c` and VM103 image
`sha256:432895919e1c883f995583db8e6f1b1e348d35716a53763a4ecd7b2a82e5c56a`
as the pre-rc.28 app-only recovery basis.
If release acceptance fails, restore that exact app image and files, recreate
only the Lab container, wait for health and verify Lab plus the existing
Teach-domain URLs.

Rc.17 through rc.28 use the same common envelope. An rc.22 through rc.28 file that contains
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

Browser recovery and learner-owned files are never deleted by deployment or
rollback. Do not change DNS, shared Caddy configuration, compiler/runtime
images or unrelated services. After rollback verify `/`, `/healthz`,
`/readyz`, `/controllers.html`, all four bounded Build/Run paths and the apex,
www, agent and security domain suite.
