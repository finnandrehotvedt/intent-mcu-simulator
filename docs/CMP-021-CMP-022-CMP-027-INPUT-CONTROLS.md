# CMP-021, CMP-022 and CMP-027 — input controls

This increment qualifies the existing momentary button, maintained SPST toggle
and quadrature rotary encoder as one AVR teaching slice. It does not introduce
new physical-hardware claims or broaden controller support.

The canonical downloadable files and their source/project hashes are recorded
in `examples/input-controls/manifest.json`. All terminals are named explicitly:
button and toggle use `A`/`B`; the encoder uses `A`/`B`/`COM`. The examples use
active-low pull-up wiring, and the encoder requires `A=D2`, `B=D3`, `COM=GND2`.

The AVR profile supports authoring, validation, isolated compilation and
executed firmware behavior. RP2040 Pico, ESP32-C3 and STM32 retain their
separate bounded 3.3 V authoring components; these exact AVR models remain
unavailable there. No compatibility across those model identities is implied.

The models are deliberately ideal: no contact bounce, resistance, wear,
current rating or mechanical timing is simulated. Encoder phases are fixed at
1 ms and the encoder push switch is outside this model.
