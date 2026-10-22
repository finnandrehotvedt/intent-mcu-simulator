# Controlled contribution review

The X57 checker is a local, data-only review aid. It hashes declared files and
binds a source-review decision and the fixed project-owned conformance suite to
the exact candidate digest. It never imports submitted modules, runs commands
from a manifest, fetches dependencies, or adds a registry entry.

Create a report from a clean checkout:

```sh
node tools/contribution-review.mjs check \
  --manifest examples/contribution-review/manifest.json \
  --checkout . --out contribution-report.json
```

A trusted maintainer must explicitly confirm review of every declared change
class. The project-owned conformance runner then verifies the checked-in
fixture and records one candidate-bound pass/fail outcome for every fixed
`requiredTests` ID. It refuses to issue a passing record if any outcome is
absent or failed; candidate modules and commands remain inert. Both records
are written only to the checkout's fixed, ignored
`.intent-mcu/trusted-contribution-evidence` directory and are bound to the
current candidate bytes, base commit, fixture, and runner:

```sh
node tools/contribution-review.mjs review \
  --report contribution-report.json --checkout . \
  --reviewer maintainer-name \
  --confirm-changedPaths --confirm-models --confirm-pins \
  --confirm-parameters --confirm-versions

node tools/contribution-review.mjs conform \
  --report contribution-report.json --checkout .
```

The fixed admission command rehashes the current checkout and revalidates the
trusted records. It does not accept caller-selected evidence paths:

```sh
node tools/contribution-review.mjs admit --report contribution-report.json \
  --checkout . --out admission.json
```

Admission is evidence for a later normal pull request. It grants no execution,
registry, release, runtime, or network authority. Unknown code remains inert;
only project-owned test commands may be run by maintainers or CI.
