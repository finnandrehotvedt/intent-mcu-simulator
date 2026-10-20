# X43 partial AVR observation interval

Status: public AVR-only implementation slice in 1.1.0-rc.92; X43 remains
partial, not complete.

The Runtime profile interval panel observes an already-current AVR worker. An
explicit **Start observation** stores its exact source, artifact, editor
revision, project/build/runtime generations, model hashes, worker
initialization and worker nonce together with native emulator cycles and
executed-emulator instruction count. **Capture now** reads the same current
worker again and displays exact counter deltas.

The panel sends no Build, Run, Pause, Reset or worker message. It creates no
worker, report, verdict, project field, local storage entry or network request.
Save/Open never serializes or restores an interval.

## Time and precision

- CPU cycles are the AVR runtime's native `cpu.cycles` counter.
- Instructions count calls executed by avr8js, not source lines and not
  measurements from physical hardware.
- Virtual time is the exact rational `cycles × 125 / 2` nanoseconds for the
  accepted 16 MHz AVR clock. BigInt-backed string arithmetic avoids unsafe
  `deltaCycles × 1e9` Number multiplication.
- Browser wall milliseconds and cycles/instructions per wall second are
  diagnostics for this browser/host only. They are not semantic time, a test
  result or a hardware benchmark.

Dynamic SRAM use, heap use, current stack depth and peak/high-water stack are
shown as **Unavailable** because the runtime does not expose those producers.
The X34 four-byte firmware-owned mailbox is not a generic memory profiler and
is not consulted here.

## Lifecycle

Observing and captured intervals are revalidated before every API snapshot and
presentation. A fully shape- and binding-validated pause/run transition is
also a sampled projection: its two counters independently advance the internal
floor, and a fall in either counter invalidates immediately. During that short
transition every public API snapshot and the panel expose only a sanitized
`transitioning` state with null binding and interval; Start and Capture are
disabled. The prior interval may remain internal only on the exact unchanged
binding and reappears only after a coherent projection passes the same counter
floor. Each successfully validated coherent sample advances the internal floor
for cycles and instructions independently; duplicate samples are idempotent,
while either counter falling below the latest accepted sample clears the
interval. This authority covers only projections actually presented to the
owner by paint, snapshot or Capture; a regression and recovery wholly between
two sampled projections is not observed or claimed. Missing/mixed identity,
unsafe counters, counter regression,
source or circuit change, Build, Reset, Stop, New, accepted Open/example load,
profile switch, worker/model/generation change or runtime retirement clears the
measurement fail-closed. A rejected or cancelled Open does not alter the
binding and therefore preserves the interval.

RP2040 remains unavailable pending a profile-specific profiling semantics and
retention contract. ESP32-C3 has no accepted CPU profile producer. STM32 event
instruction ordinals are explicitly not physical cycles. No zeros or inferred
values substitute for unavailable facts.

## Reviewed acceptance boundary

The accepted native browser check is the sole producer proof: Start preceded
later worker progress and Capture read the same unchanged binding. The
deterministic browser fixture is presentation/lifecycle replay only; it does
not compile or execute firmware and is not represented as another native run.
The rc.92 release itself performs no Build, Run or scenario.

This bounded proof does not supply dynamic SRAM, heap or stack measurements,
does not profile the other three public controller profiles and is not a
physical-hardware benchmark. Those missing portions keep X43 partial.
