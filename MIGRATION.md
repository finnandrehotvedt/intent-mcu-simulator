# Migration to 1.1.0-rc.4

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
reinterpreting or uploading it. RP2040 Pico has a separate local data-only
project format; Open never restores executable bytes and a fresh Build is
required before Run. ESP32-C3 and STM32F429ZI remain status previews. Return to
AVR and rebuild before running that project again.
