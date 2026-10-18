# X11 comprehensible machine-result codes

The optional local stdio adapter returns every bounded action outcome in
`intent-mcu-external-client-result@1`. The envelope adds a stable category
without replacing the authoritative router response:

- `success`
- `validation-failure`
- `unsupported`
- `temporarily-busy`
- `timeout`
- `cancelled`
- `test-failure`
- `execution-failure`

`authoritativeResult` is the unchanged bounded-action result. `source` keeps
its schema, router, code and executed flag, while `request` and `generation`
bind the outcome to the request ID, action, profile and expected/before/after
generation. The source identity is the same public product/version/repository
identity exposed by read-only capability discovery.

A failed test is reported only when an executed authoritative producer returns
the exact supported observation schema and `status: "failed"`. A string,
diagnostic, unsupported result, environment failure, cancellation or timeout
can never be promoted to `test-failure`. The producer result and its verdict
remain intact under `authoritativeResult`; the outer category is not a newly
invented runtime observation.

The integrated proof uses the existing action set and the exact bounded AVR
thermostat starter. It compiles and runs both the approved correct source and
the approved known-bad equality source through all three existing scenarios.
The correct artifact returns `success`; the known-bad artifact returns
`test-failure` only for `THERM-SCENARIO-EQUALITY-ENABLED`, retaining the actual
D13 observation, compiler input identity, artifact identity and lifecycle
generations. These are producer observations. Busy and timeout proofs use a
separate deterministic external-process fixture and are labelled as fixtures.

Only `temporarily-busy` recommends a bounded retry, after 250 ms and with a new
request ID. Timeout says that a new request ID would be required but does not
recommend automatic retry. No category adds Apply, command, listener, public
endpoint, account, credential, persistence or topology authority.
