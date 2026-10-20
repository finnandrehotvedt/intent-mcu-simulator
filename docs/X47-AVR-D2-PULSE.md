# X47 partial AVR D2 pulse input

Status: public partial implementation in `1.1.0-rc.93`.

X47 accepts one finite deterministic input shape for the exact AVR teaching
graph: a momentary button connects D2 to one controller ground. The local
preview schema is `intent-mcu-x47-avr-d2-pulse@1` and the generator contract is
`x47-avr-d2-active-low-pulse-v1`. It contains one active-low pulse bounded to
1,600,000 AVR-native cycles, with no randomness or seed.

Apply is available only after a current AVR firmware Run is explicitly paused.
The request, worker binding, queue receipt and execution receipt must agree on
source revision, graph identity, artifact identity, model implementation,
model execution context, runtime generation and worker epoch. Any lifecycle or
identity change revokes authority. A late receipt cannot restore it.

Stop is two-phase: cancellation is acknowledged before worker disposal. A
timeout revokes authority and reports incomplete evidence rather than claiming
success. Reset cancels accepted X47 work before ordinary reset. Historical
request, queue and execution facts may remain visible after retirement, but
they are labelled `Historical · non-current` and cannot authorize Apply or
Resume.

Four earlier current-model identities are accepted only through explicit
data-only migration. Migration preserves authored cells, records provenance
and clears executable/runtime authority. Unknown identities fail closed.

The immutable native evidence covers the canonical D2 pulse and accepted Stop
sequence. The saved RESET attempt genuinely reached its documented runtime
criteria, but its original receipt remains failed-not-accepted. Pending-pulse
RESET cancellation is synthetic-browser evidence only. Wider waveforms,
noise/CSV workflows and non-AVR profiles remain outside this partial slice.
The rc.93 release itself performs no firmware Build, Run or scenario.
