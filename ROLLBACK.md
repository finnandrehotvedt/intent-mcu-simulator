# Rollback basis for 1.1.0-rc.16

Rollback is scoped to the Lab application container and the exact retained
pre-rc.16 Lab response-header configuration. DNS, Caddy routing, the Teach
apex, classroom, security lab, mail, and unrelated containers stay unchanged.

The deployment must retain the known-good `1.1.0-rc.15` app image from source
commit `a56f6689ac5978f005dedfb7e193ce5ea15f97dc` and the exact pre-rc.16
Compose, environment and Caddy files on VM103. If any mandatory
acceptance check fails, restore those files and that image, recreate only the
Lab and existing Caddy containers, wait for health, and verify Lab plus the
related Teach URLs.

Learner projects require no server restore. Local files remain owned by the
learner, and versioned browser recovery is not deleted by either deployment or
rollback.

The rc.16 release adds narrow-profile Fullscreen canvas parity to the accepted
shared controller shell and rendered wire-lane separation; it reuses the
accepted image-ID-locked compilers and runtimes. Roll back
by restoring the exact pre-release
app image, Compose, compiler-lock and Caddy files retained immediately before
deployment, then recreating only the Lab and existing Caddy containers. The
prior compiler and runtime images remain in place. Do not change DNS, the
shared Caddy route, or any private verification service. After rollback,
verify `/`, `/healthz`, `/readyz`, `/controllers.html`, the related Teach URLs,
confirm that the accepted Pico, C3 and STM32 paths still respond, and confirm
that no `/private-*` route is exposed.
