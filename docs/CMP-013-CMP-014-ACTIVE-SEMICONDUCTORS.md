# CMP-013–CMP-014 active-semiconductor authoring package

This package adds two distinct schematic parts:

- CMP-013 `transistor.mosfet-p-channel-v1` with `GATE`, `DRAIN` and `SOURCE`;
- CMP-014 `semiconductor.optocoupler-phototransistor-v1` with input LED
  `ANODE/CATHODE` and phototransistor `COLLECTOR/EMITTER`.

The AVR, RP2040 Pico, ESP32-C3 and STM32 editors can add, inspect, edit, wire,
move, remove, undo/redo, save and reopen these components. Their artwork is
original project-owned SVG geometry. Property values are bounded nameplate
metadata only.

Both parts are authoring-only on every profile. Build/Run fails closed with
`SEMICONDUCTOR_ACTIVE_MODEL_UNAVAILABLE` on AVR and model-library-unavailable
status on the narrow profiles. There is no bias/current network, nonlinear
transfer, switching threshold, body diode, optical coupling, isolation proof,
leakage, capacitance, thermal/breakdown or safe-operating-area model. The
optocoupler makes no safety-rated or certification claim.

Canonical examples live under `examples/semiconductor-active-components/`.
Each records exact terminal names, model lock, source/project hashes, profile
behavior and the same explicit runtime boundary.

