# X47 complete bounded AVR input sequences

Status: complete against the original bounded AVR criterion in `1.1.0-rc.99`.

X47 accepts finite deterministic input shapes for the exact AVR teaching
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

The immutable native evidence covers finite A1 ramp, same-seed noise and
recorded schedules through actual ADC and D13 firmware response, plus the
canonical pressed-LOW D2 pulse, fresh-cycle re-pause, future pending A1 events
and one Reset to cycle zero with empty queues. Reset retires active UI authority
while the worker Reset receipt retains its exact identity.

The complete status is bounded to the exact AVR A1 temperature and D2 button
models, declared units, finite event counts and deterministic seed. Arbitrary
signals, CSV or network import, saved/replayed schedules, non-AVR profiles,
physical equivalence and verdict authority remain unavailable. The rc.99
release itself performs no firmware Build, Run or Scenario.
