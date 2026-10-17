# Rollback basis for 1.1.0-rc.13

Rollback is scoped to the Lab application container and the exact retained
pre-rc.13 Lab response-header configuration. DNS, Caddy routing, the Teach
apex, classroom, security lab, mail, and unrelated containers stay unchanged.

The deployment must retain the known-good `1.1.0-rc.12` app image and the exact
pre-rc.13 Compose, environment and Caddy files on VM103. If any mandatory
acceptance check fails, restore those files and that image, recreate only the
Lab and existing Caddy containers, wait for health, and verify Lab plus the
related Teach URLs.

Learner projects require no server restore. Local files remain owned by the
learner, and versioned browser recovery is not deleted by either deployment or
rollback.

The rc.13 release changes the public app documentation and lets the Lab app
set route-specific crawler headers; it reuses the accepted image-ID-locked
compiler and runtime services. Roll back by restoring the exact pre-release
app image, Compose, compiler-lock and Caddy files retained immediately before
deployment, then recreating only the Lab and existing Caddy containers. The
prior compiler and runtime images remain in place. Do not change DNS, the
shared Caddy route, or any private verification service. After rollback,
verify `/`, `/healthz`, `/readyz`, `/controllers.html`, the related Teach URLs,
confirm that the accepted Pico, C3 and STM32 paths still respond, and confirm
that no `/private-*` route is exposed.
