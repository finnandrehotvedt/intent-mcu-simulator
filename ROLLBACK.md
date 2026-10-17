# Rollback basis for 1.1.0-rc.21

Rollback is limited to the Lab application container. DNS, Caddy routing, the
Teach apex, classroom, security lab, mail and unrelated containers remain
unchanged.

Retain the exact accepted rc.20 source commit
`801ffc7db07e4d8783140028fc75300343e2ff37`, VM103 image
`sha256:09206785728ac22dd4a5341dbc39094dd23891b2b62622d813702f6efeff0937`
and the pre-rc.21 Compose/environment backup recorded in the release receipt.
If release acceptance fails, restore that exact app image and files, recreate
only the Lab container, wait for health and verify Lab plus the existing
Teach-domain URLs.

Rc.17 through rc.21 use the same common envelope, so learner-owned project files
open directly after rollback. The existing **Legacy copy** remains available
for a further rollback to rc.16 and contains no executable/runtime authority.

Native file handles are session-only browser objects and do not survive an app
container rollback or page reload. Learner-owned files remain unchanged; use
ordinary Open after rollback and Build fresh.

Rc.21 diagnostics are transient and contain no project or runtime authority.
Rollback removes the new capability reference and shared navigation panels but
does not require project-file conversion.

Browser recovery and learner-owned files are never deleted by deployment or
rollback. Do not change DNS, shared Caddy configuration, compiler/runtime
images or unrelated services. After rollback verify `/`, `/healthz`,
`/readyz`, `/controllers.html`, all four bounded Build/Run paths and the apex,
www, agent and security domain suite.
