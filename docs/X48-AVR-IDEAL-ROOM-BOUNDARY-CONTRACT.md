# X48 AVR ideal-room instruction-boundary contract

Status: private candidate contract, version `intent-mcu-x48-ideal-room-plant@2`.

## Fixed scope

This contract applies only to the exact unedited `avr-thermostat-boundary-v1`
source and graph, a fresh current-model AVR artifact, and its one current
browser worker at cycle zero. It is a finite educational discrete stepper, not
a continuous-time room, heater, sensor, calibration or safety model.

The model has 32 nominal ticks. Tick N has nominal target
`N * 2,560,000` AVR cycles (160 ms at the declared 16 MHz clock). The producer
executes only whole AVR instructions and samples at the first completed
instruction boundary at or after that target. Every row keeps the nominal
target, actual sample cycle and `actual - nominal` lateness. The UI must say
“nominal 160 ms schedule” and must not call the actual boundary exact 160 ms.

## Bounded boundary semantics

For the pinned ATmega328P avr8js 0.21.1 path, one `step()` executes one whole
AVR instruction and then one `cpu.tick()`:

- the supported ATmega328P instruction path advances by at most 4 cycles;
- `cpu.tick()` handles at most one pending interrupt and its pinned
  `avrInterrupt` adds 2 cycles;
- therefore one step advances by at most 6 cycles and can overshoot a target by
  at most 5 cycles.

An actual cycle below the nominal target, lateness outside 0…5, an unsupported
access, a missing/unknown producer or any retention drop makes the result
indeterminate. Cycles are never split, rolled back, relabelled or rewritten.

## Causal order

At cycle zero, before firmware execution, the worker applies 20,000 m°C to
`temperature-sensor-1.temperatureC` and `pressed=true` to
`enable-button-1`. For each tick N from 1 through 32:

1. execute bounded asynchronous instruction slices until the first completed
   instruction boundary at or after the nominal target;
2. sample actual D13 mode and level at that producer cycle;
3. accept only proven `OUTPUT/HIGH` or `OUTPUT/LOW`; missing, input, high-Z or
   unsupported state is indeterminate and never invented as LOW;
4. calculate the next integer milli-degree state from the sampled level;
5. apply that next temperature through the existing validated control/input
   queue at the same actual boundary, after sampling, without advancing CPU
   cycles; this value is input for interval N→N+1.

Each row binds nominal target, sample cycle, lateness, D13, input temperature,
next temperature, queue target/applied cycle and exact runtime identity. Cycles
must be monotonic and all relevant retention-drop counters must remain zero.

## Fixed plant equation

- initial and ambient: 20,000 m°C;
- heater-on equilibrium offset: +20,000 m°C;
- divisor: 16;
- range: -50,000…150,000 m°C;
- `next = current + truncTowardZero((ambient + heaterOffset - current) / 16)`;
- `heaterOffset = 20,000` only for observed `OUTPUT/HIGH`;
- observed `OUTPUT/LOW` uses zero offset; every other state is indeterminate.

The firmware expectation is separately derived from the exact ideal sensor and
10-bit ADC integer contract. A complete 32-row trace with any contradictory
D13 level is `failed`; a complete matching trace is `passed`; incomplete,
stale, cancelled, unsupported, over-late or dropped evidence is
`indeterminate`. A known-bad equality vector must be rejected independently of
the open-loop plant vectors.

## Identity, lifecycle and exclusions

The request and every result bind profile, project/runtime generation, source
input, artifact, model implementation/execution context, worker nonce, exact
thermostat graph and plant-contract identity. Source, graph, artifact, model,
worker or generation drift retires the result. Reset, Stop, Open, New, profile
change and fresh Build cancel the active epoch. Work proceeds in bounded worker
slices so cancellation can be observed between slices.

Results are transient and are never saved or restored. No automatic Build or
ordinary Run occurs. No arbitrary parameters, general solver, physical claim,
multi-MCU scheduler, debugger, RTOS, DMA, multicore or other profile is added.
