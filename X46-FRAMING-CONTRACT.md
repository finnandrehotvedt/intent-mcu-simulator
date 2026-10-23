# X46 bounded AVR USART0 framing contract

## Scope

This private source dependency derives semantic AVR USART0 TX frames from one
complete, paused, identity-bound worker snapshot. It combines the current
snapshot's retained TX starts with its retained USART configuration history.
It grants no Apply, Build, Run or verdict authority.

The only accepted frame shape is asynchronous 8-N-1 from the current pinned
AVR model. Each completed frame contains one start symbol, eight LSB-first data
symbols and one stop symbol. The output is model-derived teaching evidence,
not a measured voltage waveform or physical serial-line proof.

## Pinned model semantics

In `avr8js` 0.21.1, the UDR write hook invokes `onByteTransmit(value)`
synchronously and then schedules TXC/UDRE by `cyclesPerChar`. The retained TX
event cycle is therefore the model's frame start. A frame is reported as
completed only when `startCycle + frameCycles <= pausedSnapshotCycle`; at most
one final in-flight TX record is counted separately and receives no framing.

The owning configuration must have a cycle strictly before the TX start.
Configuration on the same cycle is rejected because the retained records do
not establish intra-cycle ordering. Later mid-frame configuration does not
rewrite the start-latched frame. Overlapping TX starts and configuration dated
after the paused snapshot fail closed.

## Identity, reset and completeness

The consumer accepts one paused snapshot rather than independently supplied
serial and configuration objects. Runtime identity, artifact identity, model
execution identity and configuration retention are validated together. Reset
reconstructs the adapter machine, clearing serial state and starting a new
configuration reset epoch; framing never joins records across snapshots or
reset epochs.

Any serial/configuration retention loss, stale identity, negative or future TX
cycle, missing prior configuration, unsupported mode/data/parity/stop shape,
disabled transmitter, baud mismatch or frame-cycle conflict rejects the
result. Imported project data cannot supply this live snapshot authority.

## Explicit exclusions

RX framing, parity modes, physical voltage and noise, wall-clock timing, I2C,
SPI, UI presentation and full X46 completion are unavailable. X46 remains
partial until separately authorized producer and public-acceptance work proves
additional original criteria.
