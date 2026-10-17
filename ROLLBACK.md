# Rollback basis for 1.1.0-rc.19

Rollback is limited to the Lab application container. DNS, Caddy routing, the
Teach apex, classroom, security lab, mail and unrelated containers remain
unchanged.

Retain the exact rc.18 source commit
`c9b80e2b99b73be64f8f397da269a99908857df1`, VM103 image
`sha256:2b1fa85bb862f513f66c2b6f2830309553e49d35c9cdf4befe6594e79424d849`
and pre-rc.19 Compose/environment backup. If release acceptance fails, restore
that exact app image and files, recreate only the Lab container, wait for
health and verify Lab plus the existing Teach-domain URLs.

Rc.17, rc.18 and rc.19 use the same common envelope, so learner-owned project files
open directly after rollback. The existing **Legacy copy** remains available
for a further rollback to rc.16 and contains no executable/runtime authority.

Browser recovery and learner-owned files are never deleted by deployment or
rollback. Do not change DNS, shared Caddy configuration, compiler/runtime
images or unrelated services. After rollback verify `/`, `/healthz`,
`/readyz`, `/controllers.html`, all four bounded Build/Run paths and the apex,
www, agent and security domain suite.
