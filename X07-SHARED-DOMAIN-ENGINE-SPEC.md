# X07 shared UI and local-agent domain-engine contract

Receipt: `desktop-etvt6l5-ct109-lab-x07-shared-domain-engine-20261018-001`

## Exact outcome

The browser UI and a bounded local programmatic agent adapter submit the same
versioned domain requests to one implementation. That implementation owns
strict common-project parsing/profile routing, profile electrical admission and
the existing thermostat observation evaluator. Neither path may call a weaker
validator, bypass the electrical model or create its own test verdict.

This is a local in-browser adapter, not an external service, autonomous agent,
MCP endpoint or authorization to build/run. X08–X15 remain separate.

## Request boundary

- Schema: `intent-mcu-domain-request@1`; engine identity:
  `intent-mcu-shared-domain-engine@1`.
- `validate-project` accepts exactly `schema`, `action` and `projectText`.
- `evaluate-thermostat-observation` accepts exactly `schema`, `action`,
  `projectText`, `scenarioId` and `snapshot`.
- Requests are strict duplicate/prototype-safe JSON below the established
  common project bound. Unknown actions/fields, oversized input, URLs and
  authority-bearing project content reject.
- Both actions first run `prepareProjectEnvelope` with the exact active-profile
  adapter. This is the same parser, project validator and electrical admission
  used by Open and X05/X06. Cross-profile data rejects.
- Observation evaluation additionally requires the exact validated thermostat
  project and delegates to the existing `evaluateThermostatObservation` test
  engine. Executed D13 remains primary evidence; Serial cannot pass alone.

## UI and agent paths

- UI exposes a visible read-only inspection of the current canonical project
  and uses the shared engine for actual thermostat scenario verdicts.
- The local programmatic adapter exposes only the same `execute` function and
  immutable engine contract through `window.__AGENT_DOMAIN_ENGINE__`.
- The adapter performs no network request, project mutation, Build, Run,
  external action or persistence. Project text is data, never instruction
  authority.
- Result objects name the same engine identity, validation stage and evaluator
  regardless of caller. Caller labels are provenance only and cannot change
  behavior.

## Acceptance

- Unit tests prove byte-equivalent UI/agent validation and thermostat results,
  strict request shapes, profile/authority/invalid-electrical rejection and
  Serial-only failure through the single evaluator.
- An integrated Chromium journey validates the same Pico project through the
  visible UI and local agent adapter and proves identical identities/stages
  without mutation. One actual AVR thermostat Build/Run test confirms the UI
  verdict path uses the shared engine; the same captured observation evaluated
  through the adapter must match.
- Existing X01–X06 data, patch/comparison atomicity, controller limits, source-
  bound runtime evidence and deployment boundaries remain unchanged.
