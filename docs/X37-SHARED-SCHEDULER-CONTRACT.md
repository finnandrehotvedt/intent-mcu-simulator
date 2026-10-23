# X37 shared scheduler contract

X37 is a pure, inert prerequisite for reasoning about two participants on one
shared digital net. It does not run firmware, create workers, call compilers or
services, use timers or storage, or add actual multi-MCU product support.

The contract accepts exactly two generation-bound participants and one named
net. Each participant declares an exact rational number of local cycles per
scheduler tick. Events are converted without rounding, sorted by scheduler
tick, participant ID, sequence and event ID, and limited to 32 cumulative
events. Trace retention is independently limited by the contract. Continuation
keeps the bounded event history, rejects reused event IDs or participant
sequences across calls, and derives trace rows and final wire ownership from
that history.

## Worked clock example

For participant A at `2/1` local cycles per scheduler tick, local cycle 6 maps
exactly to scheduler tick 3. For participant B at `3/1`, local cycle 9 also
maps to tick 3. The canonical ASCII/code-unit ordering rules decide their
stable order at that shared tick; input order and locale do not.

The shared net can resolve to `LOW`, `HIGH`, `HIGH_Z` or `CONFLICT` from the
accepted driver actions. Readers cannot drive or release. Retirement removes
that participant's retained events and ownership and records its generation;
continuation remains valid only for the participant still active. Reset retires
both generations and accepts no continuation events.

Canonical output provides deterministic data consistency only. It is not an
authenticity, authorization or security guarantee, and it does not establish
trusted state outside the validated value supplied to the pure API.

Run `npm run test:x37` for the focused contract suite. The same suite is also
part of `npm test` through the post-test chain.
