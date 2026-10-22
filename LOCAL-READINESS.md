# Local worker readiness assessment

X89 provides a local, read-only planning check. It parses the checked-in
Compose recipe, package scripts, disposable-child boundary and exact image
locks, then compares those locks with a small fixture describing only whether
Docker is available and which exact image IDs are installed.

Run the intentionally incomplete clean-checkout example:

```sh
node tools/local-readiness.mjs assess --checkout . \
  --fixture examples/local-readiness/incomplete.fixture.json \
  --out local-readiness-report.json
```

The report distinguishes configuration assessment from service health,
compiler/runtime readiness and real firmware execution. This command performs
only the first. It does not inspect environment variables or home directories,
connect remotely, start Docker, download assets, build images, install a
service, or run firmware.

Reopen a saved report against the same checkout and fixture:

```sh
node tools/local-readiness.mjs reopen --checkout . \
  --fixture examples/local-readiness/incomplete.fixture.json \
  --report local-readiness-report.json
```

Any one-byte configuration change produces `stale`. Missing licensed images
remain unavailable; copy or redistribution is not suggested or authorized.
The report's next commands are fixed checked-in recipes for a human to inspect
and run separately.
