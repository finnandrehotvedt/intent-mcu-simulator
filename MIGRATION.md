# Migration to 1.1.0-rc.10

There is no account, cloud project database, or server-side project migration.
Existing browser recovery remains readable. Before changing versions, save an
important project to a local `.intent-mcu.json` file.

After the update:

1. open the local project file;
2. review any explicit migration or unsupported-field report;
3. rebuild firmware because artifacts are deliberately not persisted;
4. verify named-pin wiring and component limitations before Run.

Rejected files and Prompt Bridge proposals remain atomic and do not partially
replace the current project. The new components extend project-v3 data while
the established v2 import path remains available.

Selecting any non-AVR profile parks the current AVR data without migrating,
reinterpreting or uploading it, and the inactive AVR canvas is hidden to avoid
presenting two circuits as active. RP2040 Pico, ESP32-C3 and STM32F429ZI each have a
separate local data-only project format; Pico, ESP32-C3 and STM32F429ZI files
retain their validated editable circuit layouts. Existing source-only STM32
project-v1 files open with the default validated teaching circuit and save as
project-v2. Open never restores executable bytes
and a fresh Build is required before Run. The existing Return to AVR action
restores the parked AVR editor. No prior private or public executable authority
is imported.

The five AVR starter projects can now replace one another across both project
schema generations without retaining a stale reducer. Firmware artifacts are
still never migrated or reused; build again after choosing a starter.
