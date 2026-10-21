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

## Public observed-stack slice in rc.98

The independently reviewed public slice adds a direct producer from avr8js 0.21.1
`CPU.SP`. The ATmega328P runtime uses 2,048 SRAM bytes at data addresses
`0x0100..0x08ff`; avr8js resets SP to `0x08ff`. The adapter samples SP after
each executed instruction and the following `cpu.tick()`. That boundary also
observes interrupt entry, including nested interrupt entry when firmware
explicitly re-enables interrupts.

The panel reports the current SP, the minimum SP observed during one explicit
worker-bound interval, and the minimum SP observed since reset. Depth is only
the bounded address distance `0x08ff - observed SP` (0..2,047 bytes). It is not
live-byte occupancy, a memory-content high-water scan, dynamic SRAM use, heap
use or free SRAM. A pointer outside the ATmega328P SRAM range makes the affected
minimum unavailable rather than producing an estimate. Reset and a new worker
clear all history. Dynamic SRAM and heap remain **Unavailable**, and no other
controller profile gains equivalent support.

This slice changes runtime telemetry and therefore uses a new current model
identity. The accepted rc.97 identity remains allowlisted only for explicit
data migration and cannot authorize execution under the rc.98 identity.

The accepted native fixture contained 9 CALL/RCALL, 17 PUSH and 5 RET/RETI
instructions. On one exact artifact/model/generation/worker binding, the worker
observed minimum SP `0x08e0`, 31 bytes maximum address depth and 400,001
captured interval samples. Pause froze the captured interval and same-worker
Reset restored SP/minimum SP to `0x08ff`, depth 0 and cleared interval authority.

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

This bounded proof supplies stack address-depth observation, not live stack
occupancy. It does not supply dynamic SRAM, heap, free SRAM or a true memory
high-water measurement,
does not profile the other three public controller profiles and is not a
physical-hardware benchmark. Those missing portions keep X43 partial.
