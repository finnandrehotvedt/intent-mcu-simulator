# X12 short-lived cancellable jobs without project accounts

The optional local stdio adapter treats each of the seven existing bounded
action requests as one ephemeral job. The request ID is the job handle and its
existing `expiresAtMs` is the exact deletion deadline. The adapter adds no
action, listener, public endpoint, account, credential or durable project.

The existing cancel control targets one active request ID. Cancellation aborts
the current producer path, records a cancelled external result, and prevents a
late producer success from restoring authority. A fresh request ID is required
for later work.

Before expiry, a client may use strict read-only job control schema
`intent-mcu-external-client-job-request@1` with operation `read` or `export`.
Export returns `intent-mcu-external-client-evidence@1`, including the exact
request/action/profile/generation/source association and authoritative external
result. The package is data only: reopening it grants no runtime or verdict
authority and it is not accepted as an action request.

At the declared deadline the job payload and evidence are removed from memory.
A bounded ID-only tombstone distinguishes `JOB_EXPIRED` from `JOB_NOT_FOUND`;
it contains no result or project data. Compiler artifact-cache retention is a
separate existing optimization and is explicitly not claimed to be cleared by
job expiry.

Acceptance uses an actual active thermostat test cancellation, proves no late
success, then completes a fresh actual test. A separate short real TTL exports
evidence before expiry and observes actual cleanup and refusal after expiry.
Unit tests additionally use a deterministic fixture clock to prove the exact
deadline without presenting fixture time as production time.
