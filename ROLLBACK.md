# Rollback basis for 1.1.0-rc.22

Rollback is limited to the Lab application container. DNS, Caddy routing, the
Teach apex, classroom, security lab, mail and unrelated containers remain
unchanged.

Retain the exact accepted rc.21 source commit
`0b67cb15346b465eca4f4a8b516b56427e3ea593`, VM103 image
`sha256:611c45aab1553603e89613129ed50b7db132578e39af324a4477d1f2970de56b`
and the pre-rc.22 Compose/environment backup recorded in the release receipt.
If release acceptance fails, restore that exact app image and files, recreate
only the Lab container, wait for health and verify Lab plus the existing
Teach-domain URLs.

Rc.17 through rc.22 use the same common envelope. An rc.22 file that contains
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

Browser recovery and learner-owned files are never deleted by deployment or
rollback. Do not change DNS, shared Caddy configuration, compiler/runtime
images or unrelated services. After rollback verify `/`, `/healthz`,
`/readyz`, `/controllers.html`, all four bounded Build/Run paths and the apex,
www, agent and security domain suite.
