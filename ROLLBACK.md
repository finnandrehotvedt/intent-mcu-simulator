# Rollback basis for 1.1.0-rc.4

Rollback is scoped only to the Lab application container. DNS, Caddy routing,
the Teach apex, classroom, security lab, mail, and unrelated containers stay
unchanged.

The deployment must retain the current known-good
`local/intent-mcu-simulator-production:1.0.0-rc.2` image and the exact
pre-release Compose file on VM103. If any mandatory acceptance check fails,
restore that image with the retained Compose file, recreate only the Lab
container, wait for health, and verify Lab plus the related Teach URLs.

Learner projects require no server restore. Local files remain owned by the
learner, and versioned browser recovery is not deleted by either deployment or
rollback.

The rc.4 release adds a second image-ID-locked compiler and one bounded public
Pico browser runtime. Roll back by restoring the exact pre-release app image,
Compose file and compiler-lock configuration retained immediately before
deployment, then recreating only the Lab container. The prior AVR compiler
image remains in place; the rc.4 Pico compiler image can remain unused until a
separate, verified cleanup. Do not change DNS, the shared Caddy route, or any
private verification service. After rollback, verify `/`, `/healthz`, `/readyz`,
`/controllers.html`, the related Teach URLs, and confirm that no `/private-*`
route is exposed.
