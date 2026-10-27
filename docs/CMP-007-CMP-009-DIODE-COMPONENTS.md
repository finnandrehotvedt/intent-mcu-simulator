# CMP-007–CMP-009 raw diode authoring contract

CMP-007 uses the existing `diode.rectifier-v1` foundation identity and promotes
it into the editor. CMP-008 adds `diode.schottky-v1`; CMP-009 adds
`diode.zener-v1`. No duplicate silicon-diode type is introduced.

All three parts expose exactly `ANODE` and `CATHODE`, original IntentForce SVG
artwork and bounded nameplate metadata. They are available for authoring,
property editing, canonical API operations and Save/Open on AVR, RP2040 Pico,
ESP32-C3 and STM32.

They are not executable electrical models. Build and Run fail closed with
`DIODE_NONLINEAR_MODEL_UNAVAILABLE` on AVR and model-library-unavailable status
on the narrow profiles. Forward voltage, reverse rating, Zener voltage and
power are documentation values only. No current, nonlinear I-V curve, reverse
leakage or breakdown event, Zener clamp/regulator action, recovery time,
temperature, power dissipation, tolerance or physical-hardware equivalence is
claimed.

Canonical examples live under `examples/diode-components/`. Each example
contains the same explicitly polarized three-diode authored chain and records
its exact profile, component IDs, named connections, source hash, project hash,
expected visible behavior and runtime limitation.
