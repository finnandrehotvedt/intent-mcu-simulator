# CMP-063 passive piezo bounded contract

CMP-063 is a separate two-terminal passive transducer model, not an alias of
CMP-064's three-terminal active-buzzer module. `SIGNAL` connects directly to a
supported AVR PWM-capable output and `GND` connects to controller ground.

The runtime may expose only visual driven/rest state and observed transition
activity. It must not play audio or claim calibrated tone frequency, loudness,
sound pressure, resonance, capacitance, current draw, acoustic coupling or
physical piezo accuracy. Unsupported pins and topologies fail closed.

This contract is the first implementation slice. Catalogue integration,
original SVG artwork, candidate graph projection, example and browser runtime
acceptance remain required before CMP-063 is source-complete.

