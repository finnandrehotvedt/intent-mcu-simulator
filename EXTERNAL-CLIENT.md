# Local external client adapter

The optional adapter is a separate local Node 20 process that connects an AI
client to the seven existing bounded Lab actions over stdio. It opens the fixed
`https://lab.teachthecompany.com/` origin in an ephemeral Playwright browser
context. It does not open a listener or add a public API.

Run `node examples/external-client-example.mjs` in the existing pinned browser
acceptance environment. The example starts the adapter as a child process and
consumes JSON Lines over stdin/stdout.

Before choosing an action, a client may send the strict read-only discovery
request below. The result reports the same four profiles, named pins, API and
runtime limits, part support, quotas, schemas and version/source identity used
by the UI. It is metadata only and does not count as an eighth action.

```json
{"schema":"intent-mcu-capability-discovery-request@1","requestId":"client-discovery-01","acceptSchema":"intent-mcu-capability-discovery@1"}
```

Run `node examples/external-capability-discovery-example.mjs` in the pinned
browser acceptance environment for a complete discovery-to-supported-action
journey and fail-closed unsupported examples.

The client can request only `project.create`, `patch.propose`,
`project.validate`, `firmware.build`, `runtime.run`, `result.read` and
`project.export`. Existing profile, project-generation, TTL, replay,
cancellation and size limits remain authoritative. The URL is not client
selectable. There is no shell, eval, generic command, account, credential,
server project or durable remote state.

Discovery accepts exactly its current request schema and response version.
Unknown fields, unsupported versions and invented capabilities or actions are
rejected; a status of `unavailable` is never promoted by the adapter.

Patch proposals are data only. The adapter cannot apply them. Review remains
non-mutating and Apply requires a separate explicit browser-user action against
the exact current base hash. The test harness may drive that visible button to
verify the boundary; this is test authority, not client authority.

Runtime evidence retains its producer limitations. AVR cycles are actual
worker observations; other controller profiles retain their documented
runtime/model boundaries. Deterministic prompt, validation and project-export
bytes may be compared exactly. Runtime cycles are observations and are never
normalized or presented as byte-identical runs.
