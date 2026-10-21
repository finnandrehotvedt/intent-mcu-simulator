# Local external client adapter

The optional adapter is a separate local Node 20 process that connects an AI
client to the seven existing bounded Lab actions over stdio. It opens the fixed
`https://lab.teachthecompany.com/` origin in an ephemeral Playwright browser
context. It does not open a listener or add a public API.

Run `node examples/external-client-example.mjs` in the existing pinned browser
acceptance environment. The example starts the adapter as a child process and
consumes JSON Lines over stdin/stdout.

The default browser remains headless. An operator who must perform the existing
human Review/Apply gate in the adapter-owned page can start the process with
`INTENT_MCU_ADAPTER_REVIEW_MODE=visible`. On Linux, visible mode requires an
existing `DISPLAY`; absence fails with
`EXTERNAL_CLIENT_VISIBLE_DISPLAY_REQUIRED` and never silently falls back to
headless. This process option grants the client no browser-driving authority.

The client may refresh the same page's bounded context with:

```json
{"schema":"intent-mcu-external-client-context-request@1","requestId":"client-context-0001"}
```

The strict read-only result contains only the current profile/generation,
seven-action list, source identity and fixed review status/pending/enabled
booleans. It accepts no selector, expression, function, click, paste or Apply
input. Context fails closed when another page operation starts or remains in
flight during the read, or when the page is closed, navigated/replaced, or its
source identity drifts. The adapter binds every page operation to the initial
document session. Any later main-frame navigation irreversibly retires that
session, including reload at the same URL and navigation away followed by Back;
matching URL, identity or generation never reacquires authority.

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
cancellation and size limits remain authoritative. Cancellation remains
available while an action is active, but it is bound to the same initial page
session and cannot address a replacement document. The URL is not client
selectable. There is no shell, eval, generic command, account, credential,
server project or durable remote state.

Discovery accepts exactly its current request schema and response version.
Unknown fields, unsupported versions and invented capabilities or actions are
rejected; a status of `unavailable` is never promoted by the adapter.

Patch proposals are data only. The adapter cannot apply them. Review remains
non-mutating and Apply requires an explicit human action in the visible
adapter-owned browser against the exact current base hash. A test harness may
invoke the existing page gate to verify lifecycle behavior; this synthetic test
authority must not be described as a human action or native acceptance.

Runtime evidence retains its producer limitations. AVR cycles are actual
worker observations; other controller profiles retain their documented
runtime/model boundaries. Deterministic prompt, validation and project-export
bytes may be compared exactly. Runtime cycles are observations and are never
normalized or presented as byte-identical runs.

Every action response uses `intent-mcu-external-client-result@1` and separates
`validation-failure`, `unsupported`, `temporarily-busy`, `timeout`,
`cancelled`, `test-failure` and other execution failures from success. The
unchanged router response remains in `authoritativeResult`, with stable
request/profile/generation and public source-identity association. Only busy
recommends one delayed retry with a fresh request ID. A test failure requires
an executed producer-backed supported verdict; error text or a failed job can
never manufacture one. See `X11-RESULT-CODES-SPEC.md` for the exact contract.

For experiment actions, `jobStatus` is separate from `testVerdict.status`.
The latter is passed, failed, indeterminate or unsupported; the former is
completed, not-started, cancelled, timeout or infrastructure-error. Missing or
out-of-window producer evidence is indeterminate, not a failed assertion. See
`X18-OUTCOME-CONTRACT-SPEC.md`.

The bounded thermostat acceptance uses the same seven actions. For the exact
`avr-thermostat-boundary-v1` starter, `project.create` may select the approved
`correct` or `known-bad-equality` firmware variant, and `runtime.run` may name
that experiment. The resulting actual four-scenario verdict is available in
`runtime.run` and `result.read`, associated with the compiler input hash,
artifact hash, project/runtime generations and reset-isolated scenario
observations. This is a
fixed test capability, not arbitrary source selection or a new action.

Each action request is also a short-lived in-memory job. Its request ID is the
job handle and its existing `expiresAtMs` is the deletion deadline. The
existing cancel line retires an active request. Before expiry, a client can
send `intent-mcu-external-client-job-request@1` with exact operation `read` or
`export`; export returns a data-only evidence package associated with the
request, profile, generation, source identity and authoritative result. After
expiry the payload is removed and access returns `JOB_EXPIRED`. The bounded
expired-ID marker stores no evidence. Compiler artifact-cache retention is
separate and is not cleared or implied cleared by job deletion. See
`X12-EPHEMERAL-JOBS-SPEC.md`.
