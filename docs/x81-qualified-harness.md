# X81 qualification harness (review-only)

This private source harness proves the qualification boundary with a fake producer. It does not contact a compiler, worker, container, image builder, scenario runner, or public service.

Run the focused checks:

```sh
node --test --test-concurrency=1 test/x81-reproducibility-assessor.test.mjs test/x81-assessor-ui.test.mjs test/x81-qualified-harness.test.mjs
PLAYWRIGHT_NODE_MODULES=/srv/codex-workspaces/_tools/playwright-node/1.55.0/node_modules node test/x81-assessor-browser.cjs
```

The fixed budget is one fake Build, two fresh fake worker executions, zero scenarios, zero retries, and zero images. The harness stops before assessment if any counter exceeds that contract. One build deliberately leaves the independent-byte axis `not-checked`.

The returned artifact is an in-memory source-evidence envelope plus an opaque, frozen owner registry. Each owner record binds role, evidence schema, profile, complete context hash, request hash, operation ID, worker nonce for runs, artifact payload hash for builds, and observation/window hashes for runs. Imported evidence, caller booleans, and receipt-hash membership alone cannot create trust.

Stop and cleanup require no runtime action: the fake producer creates no process, worker, image, network request, or persistent artifact. End the Node process; there is no external state to remove.
