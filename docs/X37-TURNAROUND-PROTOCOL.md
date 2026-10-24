# Private X37 one-net turnaround protocol

Status: private, default-disarmed, unbuilt candidate. This is not public capability or MCU evidence.

## Electrical topology

One validated digital net joins AVR `D13` (open-drain output), AVR `D2` (input), RP2040 `GPIO0` (open-drain output), and RP2040 `GPIO1` (input). A project-owned 10 kΩ pull-up to 3.3 V is explicit topology, not an inferred logic level. Neither participant may drive HIGH. Released outputs are input/high-impedance. This is an ideal Boolean simulator model; it does not validate analogue voltage, current, thresholds, or physical compatibility.

The existing one-net push-pull reflection fixture cannot provide safe bidirectional proof. The turnaround candidate replaces only the X37 fixture protocol; legacy public constant-output and private finite-reflection source files remain strictly accepted for compatibility and gain no turnaround authority.

## Finite sequence

1. Both outputs release. The validated 10 kΩ pull-up resolves HIGH and is delivered to both inputs as passive-circuit evidence.
2. AVR observes HIGH, drives LOW request for at most 4,096 samples, then releases.
3. RP observes request LOW and subsequent pull-up HIGH, drives LOW acknowledgement for at most 4,096 samples, then releases.
4. AVR observes acknowledgement LOW and subsequent pull-up HIGH, drives LOW confirmation for at most 4,096 samples, then releases.
5. RP observes confirmation LOW and subsequent pull-up HIGH, then terminates with no driver retained.

Every wait is capped at 8,192 samples. Missing input, missing release, conflict, HIGH_Z despite the explicit pull-up, high drive, decreasing mapped tick, stale generation, dropped FIFO history, or a response not occurring after measured input application fails closed.

## Time and lifecycle boundaries

- AVR clock ratio: `1/125` local cycles per scheduler tick.
- RP2040 clock ratio: `1/8` local cycles per scheduler tick.
- Target conversion uses ceil only as a not-before boundary and never claims exact observation timing.
- Maximum 1,000,000 instructions and 32 advance calls per participant, 32 net events, one coordinated Run, 75 seconds external watchdog, and zero retries.
- Both live generation owners must remain current. Reset or replacement advances the generation; retirement and verified disposal precede terminal success.

## One coherent future compiler image

One later reviewed private image must contain the complete set together: exact turnaround source grammar, `GPIO_OE_CLR` release helper, low-only drive helper, no-pull GPIO1 input setup, bounded wait helper, finite turnaround routine, unchanged startup/linker closure, worker source, manifest, and source/toolchain provenance. No incremental image is justified before independent review of this complete candidate.

The existing private image `sha256:b028459a14cff97f181e709c0024077e5fd7549a5b1522c62a3b78cc0ebfd5dd` and all public image locks remain immutable.
