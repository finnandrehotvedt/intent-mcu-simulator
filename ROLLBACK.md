# Rollback basis for 1.1.0-rc.5

Rollback is scoped only to the Lab application container. DNS, Caddy routing,
the Teach apex, classroom, security lab, mail, and unrelated containers stay
unchanged.

The deployment must retain the current known-good
`local/intent-mcu-simulator-production:1.1.0-rc.4-visual.1` image and the exact
pre-release Compose file on VM103. If any mandatory acceptance check fails,
restore that image with the retained Compose file, recreate only the Lab
container, wait for health, and verify Lab plus the related Teach URLs.

Learner projects require no server restore. Local files remain owned by the
learner, and versioned browser recovery is not deleted by either deployment or
rollback.

The rc.5 release adds exact image-ID-locked ESP32-C3 compiler and QEMU runtime
images plus a bounded public C3 API. Roll back by restoring the exact
pre-release app image, Compose file and compiler-lock configuration retained
immediately before deployment, then recreating only the Lab container. The
prior AVR and Pico compiler images remain in place; the rc.5 C3 images can
remain unused until a separate, verified cleanup. Do not change DNS, the
shared Caddy route, or any private verification service. After rollback,
verify `/`, `/healthz`, `/readyz`, `/controllers.html`, the related Teach URLs,
confirm that `/api/c3/*` is no longer enabled, and confirm that no `/private-*`
route is exposed.
