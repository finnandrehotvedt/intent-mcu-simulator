# X42 armed digital-edge trigger capture

The private X42 increment adds one transient, read-only observer. It does not
compile, run, reset or command firmware. A user chooses one named AVR trace
channel and Rising or Falling, then explicitly arms before a future edge.
Historical rows cannot trigger.

The fixed window is 16 same-channel transitions before the trigger, the
trigger transition and 16 after it. The frozen result is therefore at most 33
rows. While armed, at most 4,096 future same-channel transitions are tested as
candidate trigger edges. Each source snapshot is capped at 100,000 rows, each
accepted update at 8,192 new authoritative rows, and the read-only observer
runs every 50 ms only while Armed or Triggered.

Continuity is established against the complete authoritative ordered AVR
transition array before channel filtering. With zero dropped rows, retained
array ordinals are stable. The prior tail must match at those exact ordinals;
same-cycle or identical-value rows therefore remain distinct by source
ordinal. Identical snapshots are idempotent. Any drop, regression, malformed
row, excessive update, stale identity or project/runtime generation change
fails closed and stops observation.

The frozen window remains bound to that authority after capture. Before any
snapshot, refresh or render exposes it, the owner revalidates the current
artifact, project/runtime generations, graph revision, producer provenance,
complete channel contract and every captured source ordinal. Accepted project
Open or graph edits therefore clear old rows before presentation; rejected or
cancelled Open preserves a capture whose binding is still exact. The same
authoritative signals close the armed observer's 50 ms interval window without
adding a terminal-state timer.

The four-profile boundary is explicit:

- ATmega328P: supported using actual avr8js worker transitions and native
  16 MHz virtual cycles.
- RP2040 Pico: deferred because the current upstream trace retention limit is
  unknown.
- ESP32-C3: unavailable because GPIO2 epochs are a separate project model,
  not QEMU pin timing.
- STM32F429ZI: unavailable because one final PB0 observation is not a waveform.

The capture is tab-transient. Simple/Advanced and Save do not alter it.
Profile, accepted project replacement, source/graph generation, Build, Reset,
Stop or identity/continuity change invalidates it. Nothing is stored in the
project, browser storage, a service worker or a server. A captured window is an
observation, not a failure diagnosis, test verdict or causal claim.

Private tests may replay successive prefixes of the checksum-pinned preserved
AVR runtime fixture. That fixture's owning X70 recovery journey was not
accepted, and fixture replay is not a live X42 arm-before-edge observation.
X42 remains planned until separately authorized live acceptance.
