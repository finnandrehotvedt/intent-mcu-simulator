# CMP-017/018 connection hardware

CMP-017 is a bounded four-row solderless breadboard section. It has no power
rails. Each row has two isolated five-contact groups: A–E on the left and F–J
on the right. The centre gap is open. The editor exposes one named logical
endpoint for each of those eight groups and records the five physical contact
names as immutable terminal-group metadata.

CMP-018 is a two-position feed-through terminal block. P1-WIRE and P1-PCB
belong only to logical pole P1; P2-WIRE and P2-PCB belong only to P2.
The two poles are isolated. A branch on an authored net documents the two sides
of one pole without inventing a connection to the other pole.

Both parts are authoring-only on AVR candidate-v3, RP2040 Pico, ESP32-C3 and
STM32. Save/Open preserves their exact logical pins, physical terminal groups,
layout and nets. The original SVG artwork distinguishes decorative physical
contacts from the green logical wire handles.

The package does not simulate or certify contact resistance, current capacity,
voltage rating, heating, parasitics, insertion mechanics, wear, creepage,
clearance, breadboard power rails, Build/Run execution, safety protection or
physical-hardware equivalence. It also does not silently join contact groups:
every logical group must appear on one explicit authored net, and runtime
execution remains unavailable.
