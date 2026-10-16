# Rollback basis for 1.1.0-rc.3

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

The rc.3 release preserves rc.2's public-only server boundary and refreshes the
three non-executable preview descriptions from accepted private evidence. Roll
back by restoring the exact pre-release source/image retained immediately
before deployment and recreating only the Lab container. Do not change DNS,
the shared Caddy route, the compiler image, or any private verification
service. After rollback, verify `/`, `/healthz`, `/readyz`,
`/controllers.html`, the related Teach URLs, and confirm that no `/private-*`
route is exposed.
