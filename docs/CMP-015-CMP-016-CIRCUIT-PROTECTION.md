# CMP-015 and CMP-016 — circuit-protection authoring source

CMP-015 adds a one-shot fuse symbol and CMP-016 adds a resettable PTC-fuse symbol to all four exact controller profiles. Each component has non-directional `A` and `B` terminals, original project-owned SVG artwork, bounded editable nameplate values, canonical save/open persistence, and one hashed example per profile.

This package is source-complete only. It does not simulate overcurrent detection, time-current or I²t behavior, interruption, arcing, resistance, heating, cooling, trip, reset, thermal or breakdown behavior. It is not a certification, a safety guarantee, or evidence of physical protection. Every profile therefore remains authoring-only for these components, and Build/Run fails closed.

The AVR profile reports `CIRCUIT_PROTECTION_MODEL_UNAVAILABLE`. The Pico, ESP32-C3, and STM32 profiles retain their normal `MODEL_LIBRARY_COMPONENT_UNAVAILABLE` admission result. None of those results is a runtime defect: they are the intended boundary until a separately qualified executable model exists.

Run `npm run test:circuit-protection-components` for the source and canonical-artifact checks. Run `npm run test:circuit-protection-components:browser` for the isolated Chromium acceptance check after building the local staging bundle.
