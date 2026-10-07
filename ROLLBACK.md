# Rollback basis

Public rollback remains scoped to the authorized deployment. No command in
this directory is authorization to alter another route or service.

The retained public `0.9.0` release directory, container image, Caddy file,
public body readback and backup checksums remain present after cutover. The
deployment procedure arms rollback before changing the release symlink or
container and restores all of the following on any mandatory failure:

- the retained `0.9.0` image and release directory;
- the prior `current` release symlink;
- the prior Caddy file and healthy Caddy container;
- the prior public body identity and service regression checks.

Browser projects require no server restore. The prior project-v2 and v1 keys
remain untouched, so a user can return to `0.9.0` and reimport an exported JSON
project if needed.

Before requesting deployment, the private candidate must be stopped, the prior
private staging image restarted and health-checked, then the candidate restored
and reaccepted. The final evidence records those immutable identities and the
read-only public rollback check.
