# X46 AVR UART protocol-analyser source prep

Status: private source prep; no UI, native firmware action, image or release.

## Why X46 is next

Of the ten criteria still planned after rc.120, X46 is the smallest useful
learner-facing increment that can start from an existing authoritative signal
owner. The AVR worker already records bounded USART0 TX byte events with cycle,
baud and modelled frame duration. The first increment can therefore remain a
read-only decoder over retained evidence instead of adding a producer.

The remaining order is X77, X78, X44, X37, X52, X38, X50, X51 and X79. X77
can follow as a data-only physical-trace import; X78 depends on that source.
The others require debugger integration, a shared scheduler, isolated virtual
network architecture, advanced runtime support, calibrated physical data, an
analogue solver or explicit local-hardware consent and are not source-prep
shortcuts.

## Bounded first increment

`analyzeAvrUsart0` accepts only complete, identity-bound AVR USART0 TX records
already emitted by the current worker. It validates exact shape, chronology,
byte values, model-recorded baud/frame-duration consistency and zero loss before
returning read-only byte frames and cycle deltas.

It has no Apply, Build, Run or verdict authority. It does not claim a physical
voltage waveform, line-noise measurement, framing configuration, general baud
recovery, RX analysis, I²C or SPI support. Those states remain explicitly
unavailable.

## Required next implementation receipt

The next receipt may wire this pure decoder to a private read-only Instruments
panel and synthetic retained fixtures only. It starts with zero Build, zero Run,
zero scenario, zero worker creation and zero image. A later independently
approved native acceptance may use one existing supported AVR project solely
to compare the panel with the same current-worker records. X46 remains planned
until the full original UART/I²C/SPI criterion is either proved or separately
reconciled without broadening this increment.
