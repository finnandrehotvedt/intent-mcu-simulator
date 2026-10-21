# Thin local MCP adapter

The optional adapter in `tools/mcp-adapter.mjs` is a local stdio bridge. It
does not implement another project, compiler or runtime engine. It starts the
existing `external-client-adapter.mjs` and forwards its canonical envelopes.

## Protocol

The adapter supports MCP protocol version `2025-06-18` over newline-delimited
JSON-RPC 2.0 stdio. It follows the primary MCP specification for:

- lifecycle negotiation: <https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle>
- stdio framing: <https://modelcontextprotocol.io/specification/2025-06-18/basic/transports>
- `tools/list` and `tools/call`: <https://modelcontextprotocol.io/specification/2025-06-18/server/tools>
- cancellation: <https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/cancellation>

The client must send `initialize`, accept the returned protocol version, send
`notifications/initialized`, and only then list or call tools. The server emits
only JSON-RPC messages on stdout.

## Tools and authority

- `intent_mcu_context` sends a fresh strict read-only request to the same
  adapter-owned page and returns its fixed origin, active profile, current
  generation, source identity and bounded review-state snapshot. It does not
  reuse startup context. A read is rejected if any page operation overlaps it,
  even when that operation finishes before the browser read returns.
- `intent_mcu_discover` forwards the canonical read-only discovery envelope.
- `intent_mcu_action` forwards one exact bounded request for one of the seven
  existing actions.
- `intent_mcu_job` forwards an ephemeral job read/export request.

`notifications/cancelled` maps the active MCP request ID to that call's
canonical request ID and invokes the existing cancellation control. Profile,
generation, TTL, request-ID deduplication, result size, job expiry and refusal
codes remain owned by the existing contracts.

The child adapter binds all reads, actions, discovery and cancellation to the
initial browser document. Reload, same-URL replacement, navigation away/Back
or closure permanently retires that session; MCP cannot reacquire authority
from a later document that happens to report matching identity or generation.

There is no tool for patch Apply, shell/eval, arbitrary command, origin
selection, account access, credentials, public listening, durable server
projects or topology changes. Tool output contains the complete canonical
result both as JSON text and `structuredContent`; the wrapper does not convert
a refusal into execution evidence.

For an operator-visible human Review/Apply gate, start MCP with
`INTENT_MCU_ADAPTER_REVIEW_MODE=visible` in an existing graphical session. The
child adapter uses the same page for context and actions. On Linux a missing
`DISPLAY` is a terminal configuration error; no headless fallback occurs.
The MCP client still has no selector, DOM, eval, click, paste or Apply surface.

## Reference client

Run:

```sh
npm run example:mcp
```

The example is an independent MCP client process. It negotiates the protocol,
lists tools, reads the real generation, discovers the canonical seven actions,
and uses separate clean sessions to build and run the correct and known-bad
AVR thermostat variants. Correct firmware must pass; the known-bad variant
must report `THERM-SCENARIO-EQUALITY-ENABLED` as the actual failed scenario.
