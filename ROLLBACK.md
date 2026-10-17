# Rollback basis for 1.1.0-rc.18

Rollback is limited to the Lab application container. DNS, Caddy routing, the
Teach apex, classroom, security lab, mail and unrelated containers remain
unchanged.

Retain the exact rc.17 source commit
`85ec0459bfeec890021dff7dce3ef4a805209040`, VM103 image
`sha256:c8164849d578d3387e3e3a171ac4b44009d3d32cc04b3e11c9a4dedbad1ce523`
and pre-rc.18 Compose/environment backup. If release acceptance fails, restore
that exact app image and files, recreate only the Lab container, wait for
health and verify Lab plus the existing Teach-domain URLs.

Rc.17 and rc.18 use the same common envelope, so learner-owned project files
open directly after rollback. The existing **Legacy copy** remains available
for a further rollback to rc.16 and contains no executable/runtime authority.

Browser recovery and learner-owned files are never deleted by deployment or
rollback. Do not change DNS, shared Caddy configuration, compiler/runtime
images or unrelated services. After rollback verify `/`, `/healthz`,
`/readyz`, `/controllers.html`, all four bounded Build/Run paths and the apex,
www, agent and security domain suite.
