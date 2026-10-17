# Rollback basis for 1.1.0-rc.17

Rollback is limited to the Lab application container. DNS, Caddy routing, the
Teach apex, classroom, security lab, mail and unrelated containers remain
unchanged.

Retain the exact rc.16 source commit
`e0b377087084d58764a4246aaa33a9457638e4cc`, VM103 image
`sha256:f87b3d6c70c177171dd4377fc8da214a93d97ecd51908e0253d759de17dc3271`
and pre-rc.17 Compose/environment backup. If release acceptance fails, restore
that exact app image and files, recreate only the Lab container, wait for
health and verify Lab plus the existing Teach-domain URLs.

Rc.16 does not read the new outer envelope. Before rollback, open each important
rc.17 project and choose **Legacy copy**. The resulting profile-specific
data-only file is accepted by rc.16. This compatibility export is tested for
all four profiles and does not contain executable or runtime authority.

Browser recovery and learner-owned files are never deleted by deployment or
rollback. Do not change DNS, shared Caddy configuration, compiler/runtime
images or unrelated services. After rollback verify `/`, `/healthz`,
`/readyz`, `/controllers.html`, all four bounded Build/Run paths and the apex,
www, agent and security domain suite.
