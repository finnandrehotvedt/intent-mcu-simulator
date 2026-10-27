# CMP-010–CMP-012 raw transistor authoring package

This package adds three distinct three-terminal schematic parts:

- CMP-010 `transistor.bjt-npn-v1` with `BASE`, `COLLECTOR` and `EMITTER`;
- CMP-011 `transistor.bjt-pnp-v1` with `BASE`, `COLLECTOR` and `EMITTER`;
- CMP-012 `transistor.mosfet-n-channel-v1` with `GATE`, `DRAIN` and `SOURCE`.

The AVR, RP2040 Pico, ESP32-C3 and STM32 editors can add, inspect, edit, wire,
move, remove, undo/redo, save and reopen these components. All artwork is
original project-owned SVG geometry. Property values are bounded nameplate
metadata, not an electrical promise.

All three parts are authoring-only on every profile. Build/Run fails closed
with `TRANSISTOR_SWITCHING_MODEL_UNAVAILABLE` on AVR and model-library-
unavailable status on the narrow profiles. There is no bias network, nonlinear
gain/current behavior, switching threshold, body diode, saturation, leakage,
capacitance, thermal/breakdown behavior, safe-operating-area calculation or
physical-hardware equivalence.

Canonical examples live under `examples/transistor-components/`. Each one
records exact component IDs, terminal names, model lock, source/project hashes,
profile behavior and the same explicit runtime boundary.

