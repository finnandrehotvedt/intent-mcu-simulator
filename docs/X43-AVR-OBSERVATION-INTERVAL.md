# X43 private AVR observation interval

Status: private implementation slice; not an X43 completion or public release.

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
presentation. Missing/mixed identity, unsafe counters, counter regression,
source or circuit change, Build, Reset, Stop, New, accepted Open/example load,
profile switch, worker/model/generation change or runtime retirement clears the
measurement fail-closed. A rejected or cancelled Open does not alter the
binding and therefore preserves the interval.

RP2040 remains unavailable pending a profile-specific profiling semantics and
retention contract. ESP32-C3 has no accepted CPU profile producer. STM32 event
instruction ordinals are explicitly not physical cycles. No zeros or inferred
values substitute for unavailable facts.

## Private acceptance boundary

The deterministic browser fixture is presentation/lifecycle replay only. It
does not compile or execute firmware and cannot serve as new native evidence.
After independent diff review, a separate receipt may authorize at most one
fresh AVR Build and one Run to prove Start-before-progress and Capture on one
unchanged worker binding. No public release is authorized by this slice.
