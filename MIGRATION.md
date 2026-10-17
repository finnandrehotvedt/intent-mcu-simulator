# Migration to 1.1.0-rc.16

There is no account, cloud project database, or server-side project migration.
Existing browser recovery remains readable. Before changing versions, save an
important project to a local `.intent-mcu.json` file.

This release adds reversible canvas fullscreen presentation but does not
change a project schema. Files saved by rc.15 remain readable with the same
profile-specific rules and require a fresh Build after Open.

After the update:

1. open the local project file;
2. review any explicit migration or unsupported-field report;
3. rebuild firmware because artifacts are deliberately not persisted;
4. verify named-pin wiring and component limitations before Run.

If a bounded Pico, ESP32-C3 or STM32 project was saved with its resistor or LED
deleted, Open still preserves that missing-part state and intentionally starts
with empty Undo history. Use the profile's **Add missing part** action, reconnect
the named pins explicitly, validate the circuit and Build fresh. The action
reuses the established stable ID and does not migrate or infer a cable.

Rejected files and Prompt Bridge proposals remain atomic and do not partially
replace the current project. The new components extend project-v3 data while
the established v2 import path remains available.

Selecting any non-AVR profile parks the current AVR data without migrating,
reinterpreting or uploading it, and the inactive AVR canvas is hidden to avoid
presenting two circuits as active. RP2040 Pico, ESP32-C3 and STM32F429ZI each have a
separate local data-only project format; Pico, ESP32-C3 and STM32F429ZI files
retain their validated editable circuit layouts and authored bounded cable
endpoint pairs. Existing source-only STM32
project-v1 files open with the default validated teaching circuit and save as
project-v2. Open never restores executable bytes
and a fresh Build is required before Run. The existing Return to AVR action
restores the parked AVR editor. No prior private or public executable authority
is imported.

The six AVR starter projects can replace one another across both project
schema generations without retaining a stale reducer. Firmware artifacts are
still never migrated or reused; build again after choosing a starter.
