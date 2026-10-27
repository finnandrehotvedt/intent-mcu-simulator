# CMP-004/005/006 raw capacitor and inductor authoring

Status: source-complete authoring-only implementation for the ATmega328P
candidate editor, RP2040 Pico, ESP32-C3 and STM32F429ZI profiles.

The public component library now includes three distinct original parts:

- `capacitor.nonpolarized-v1`, pins `A` and `B`, with a bounded
  `capacitanceFarads` nameplate value;
- `capacitor.electrolytic-v1`, pins `POSITIVE` and `NEGATIVE`, with polarity
  retained as documentation and a bounded `capacitanceFarads` nameplate value;
- `inductor.fixed-v1`, pins `A` and `B`, with a bounded
  `inductanceHenries` nameplate value.

All four profiles can add, wire, duplicate, edit, Save/Open and exchange these
parts through the canonical API. The examples under
`examples/passive-energy-storage/` retain the same four-wire series chain on
each exact profile. Original SVG artwork exposes the exact two terminal anchors.

These are raw two-terminal components, unlike the AVR-only CMP-085/088/116
LDR, NTC and flex components, which are integrated three-pin 5 V sensor-plus-
divider models. No arbitrary divider equivalence is inferred in either
direction.

The implementation deliberately grants no executable authority. A graph that
contains any of these parts remains structurally valid for authoring but reports
`PASSIVE_TRANSIENT_MODEL_UNAVAILABLE`. There is no transient/SPICE or frequency-
domain solver, capacitor charging/discharging model, inductor current model,
ESR, leakage, polarity-failure, saturation, parasitic, tolerance, temperature,
ageing or physical-hardware equivalence. A future solver and four-profile
runtime adapters remain an explicit roadmap gap.
