# X46 AVR USART0 RX model boundary

This source increment records paired USART0 receive requests and completions
from the pinned AVR peripheral model. Each accepted non-immediate request owns
a reset-scoped transfer ID, requested cycle, actual instruction-boundary start,
byte, baud, frame duration and scheduled completion. Its completion must match
that transfer and records the bounded instruction-boundary observation delay.

The strict read-only projection requires a complete, zero-drop paused snapshot,
shared worker identity, a receiver-enabled asynchronous 8-N-1 configuration
strictly established before the actual start, and internally consistent timing.
Disabled and busy requests remain rejected and cannot acquire completion
authority. Reset, identity drift, ambiguous configuration, overlap, truncation
and malformed pairing fail closed.

Runtime compatibility is intentionally broader than evidence eligibility.
Immediate RX remains valid for the existing manual/X23 workflow but cannot
produce X46 evidence. A completion whose request was evicted from the bounded
4096-record history may pass structural runtime validation only when positive
serial drops are truthfully reported; strict derivation still rejects it.

This is peripheral-model byte evidence, not a physical UART line capture. It
does not prove D0 voltage edges, noise, parity symbols or errors, I2C, or SPI,
and grants no Apply, Build, Run or verdict authority. X46 therefore remains a
partial criterion at public count `86/1/9` until separately reviewed evidence
covers the remaining scope.

The next proposed evidence step is one fixture against the exact current model
manifest and artifact identity, budgeted for at most one firmware Build and one
worker Run with zero automatic retries. That fixture is a plan only and is not
executed by this source-publication packet.
