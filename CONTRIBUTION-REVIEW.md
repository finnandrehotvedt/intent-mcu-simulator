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

A trusted maintainer separately records an `intent-mcu-source-review@1`
decision and a CI owner records an `intent-mcu-conformance-result@1` result for
the exact report digest, fixture identity, and suite `project-owned-x57-v1`.
The fixed admission command then combines those local files:

```sh
node tools/contribution-review.mjs admit --report contribution-report.json \
  --review source-review.json --conformance conformance-result.json \
  --out admission.json
```

Admission is evidence for a later normal pull request. It grants no execution,
registry, release, runtime, or network authority. Unknown code remains inert;
only project-owned test commands may be run by maintainers or CI.
