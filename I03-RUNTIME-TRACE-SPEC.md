# I03 source-bound runtime trace acceptance contract

Receipt: `desktop-etvt6l5-ct109-lab-i03-runtime-traces-20261018-001`

## Product boundary

I03 provides one shared readable trace viewer with channel selection, an exact
declared time axis, bounded transition retention and generation/artifact
provenance. A channel exists only when the selected profile's current accepted
runtime already supplies the stated records. Missing producers remain visibly
unavailable; the viewer never synthesizes edges, interpolates timing or revives
stale runtime authority.

Every trace projection has schema `intent-mcu-runtime-trace@1` and states:

- profile, current project generation and exact artifact identity;
- classification (`recorded-runtime`, `project-model`, or `unavailable`);
- producer/source and a plain-language provenance statement;
- timebase unit and scale, or an explicit sequence-only/unavailable basis;
- selectable channel IDs and the currently selected channel;
- retained, dropped and limit counts;
- ordered samples with only producer-supplied positions and levels/events.

## Per-profile producer matrix

| Profile | Public trace channel | Source and timebase | Classification |
| --- | --- | --- | --- |
| ATmega328P | current worker-selected D0–D13 transitions | avr8js worker cycles at 16 MHz; cycle and derived milliseconds | recorded-runtime |
| RP2040 Pico | GPIO0 | rp2040js worker GPIO records; worker cycle and supplied virtual nanoseconds | recorded-runtime |
| ESP32-C3 | GPIO2 model epochs | project-owned executed-register-write adapter epoch order; never QEMU CPU GPIO or pin timing | project-model |
| ESP32-C3 | QEMU pin-level trace | no verified producer | unavailable |
| STM32F429ZI | PB0 observation | actual Renode final observation with instruction-order-only basis; no fabricated transition or duration | recorded-runtime single sample |
| STM32F429ZI | timed PB0/USART3 transition trace | no verified producer | unavailable |

QEMU UART boot output, Renode USART3 text and their reset-epoch sequence remain
Serial evidence. They are not converted into digital pin edges. C3's GPIO2
model stays separately labelled from actual QEMU CPU/UART evidence.

## Generation, invalidation and retention

- The viewer binds to the same exact current artifact identity and project
  generation as the accepted runtime summary.
- Source, electrical topology, project Open/replacement, profile switch and
  runtime retirement clear prior trace authority. Layout-only edits retain it.
- AVR retains at most 100,000 actual worker transitions and preserves the
  worker's dropped count. RP2040 exposes the bounded current worker snapshot
  and its producer drop count. C3 and STM32 disclose their exact small
  epoch/sample counts and do not invent a capacity.
- Channel selection is view-local and cannot change runtime evidence.

## Visible acceptance

- The shared instrument area shows classification, channel selector, readable
  ordered rows, axis/timebase, retention and provenance for all four profiles.
- AVR and Pico prove changing the selected actual channel where available and
  display exact producer positions. C3 visibly says project model / not QEMU
  pin state. STM32 visibly says final Renode observation / instruction order,
  not a timed waveform.
- Unavailable channels show the exact missing-producer reason and no graph.
- Local and public Chromium acceptance prove Build/Run-to-trace, stale evidence
  invalidation, no third-party requests/errors and no horizontal overflow.
- Existing W06/W07/W08/W10 behavior, four profile limits, security, data-only
  files and rollback remain unchanged.

## Completion rule

I03 completes only after focused source tests, all source regressions, all four
actual integrated profile journeys, public HTTPS acceptance, security and
regression URL checks, same-container restart and exact app-only rollback pass.
No physical-equivalence, broad controller-support or general trace claim is
created by this bounded instrument.
