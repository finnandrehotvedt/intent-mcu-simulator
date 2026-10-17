# Rollback basis for 1.1.0-rc.24

Rollback is limited to the Lab application container. DNS, Caddy routing, the
Teach apex, classroom, security lab, mail and unrelated containers remain
unchanged.

Retain the exact accepted rc.23 source commit
`c40312d60e5ce2c16e713ecbb0cc34491c5895e9`, VM103 image
`sha256:d7d4ee0d6166c73ac0d8d386f1ce5752652e7b2c9a1ad6314867710dd667ad9c`
and the pre-rc.24 Compose/environment backup recorded in the release receipt.
If release acceptance fails, restore that exact app image and files, recreate
only the Lab container, wait for health and verify Lab plus the existing
Teach-domain URLs.

Rc.17 through rc.24 use the same common envelope. An rc.22, rc.23 or rc.24 file that contains
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

Browser recovery and learner-owned files are never deleted by deployment or
rollback. Do not change DNS, shared Caddy configuration, compiler/runtime
images or unrelated services. After rollback verify `/`, `/healthz`,
`/readyz`, `/controllers.html`, all four bounded Build/Run paths and the apex,
www, agent and security domain suite.
