# Rollback basis for 1.1.0-rc.10

Rollback is scoped only to the Lab application container. DNS, Caddy routing,
the Teach apex, classroom, security lab, mail, and unrelated containers stay
unchanged.

The deployment must retain the known-good `1.1.0-rc.9` app image and the exact
pre-rc.10 Compose/environment files on VM103. If any mandatory acceptance check fails,
restore that image with the retained Compose file, recreate only the Lab
container, wait for health, and verify Lab plus the related Teach URLs.

Learner projects require no server restore. Local files remain owned by the
learner, and versioned browser recovery is not deleted by either deployment or
rollback.

The rc.10 release changes only the public app/editor layer and reuses the
accepted image-ID-locked compiler and runtime services. Roll back by restoring the exact
pre-release app image, Compose file and compiler-lock configuration retained
immediately before deployment, then recreating only the Lab container. The
prior compiler and runtime images remain in place. Do not change DNS, the
shared Caddy route, or any private verification service. After rollback,
verify `/`, `/healthz`, `/readyz`, `/controllers.html`, the related Teach URLs,
confirm that the accepted Pico, C3 and STM32 paths still respond, and confirm
that no `/private-*` route is exposed.
