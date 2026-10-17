# Rollback basis for 1.1.0-rc.20

Rollback is limited to the Lab application container. DNS, Caddy routing, the
Teach apex, classroom, security lab, mail and unrelated containers remain
unchanged.

Retain the exact accepted rc.19 source commit
`551038e9f5ca42df501232ed1a78d3c4860cf693`, VM103 image
`sha256:e24e755da1c888ae6a20c9f9f240a18d11564422241636277b53e0dc8bc588c4`
and the pre-rc.20 Compose/environment backup recorded in the release receipt.
If release acceptance fails, restore that exact app image and files, recreate
only the Lab container, wait for health and verify Lab plus the existing
Teach-domain URLs.

Rc.17 through rc.20 use the same common envelope, so learner-owned project files
open directly after rollback. The existing **Legacy copy** remains available
for a further rollback to rc.16 and contains no executable/runtime authority.

Native file handles are session-only browser objects and do not survive an app
container rollback or page reload. Learner-owned files remain unchanged; use
ordinary Open after rollback and Build fresh.

Browser recovery and learner-owned files are never deleted by deployment or
rollback. Do not change DNS, shared Caddy configuration, compiler/runtime
images or unrelated services. After rollback verify `/`, `/healthz`,
`/readyz`, `/controllers.html`, all four bounded Build/Run paths and the apex,
www, agent and security domain suite.
