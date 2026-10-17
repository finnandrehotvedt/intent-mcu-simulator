# Migration to 1.1.0-rc.19

There is no account, cloud project database or server-side project migration.
All project files remain learner-owned local files and browser recovery remains
local and separately labelled.

Rc.17, rc.18 and rc.19 save one `intent-mcu-project-envelope@1` format for AVR, RP2040 Pico,
ESP32-C3 and STM32F429ZI. The envelope identifies one exact tested profile and
contains that profile's validated authored project. It contains no firmware,
runtime/session authority, verdict or secret.

Existing accepted files remain readable:

- AVR contact-persistence and `teach-lab-project@2` files;
- RP2040 Pico project-v1 files;
- ESP32-C3 project-v1 files;
- STM32 project-v2 and source-only project-v1 files.

Migration occurs in detached memory only after strict validation. It never
overwrites the source file. STM32 v1 receives the documented default teaching
circuit. Lossy AVR project-v1 conversion remains available only through the
explicit legacy migration action.

After Open, review the migration message and Build fresh. A successful Open
clears executable authority and transient history; malformed, oversized,
unknown, profile-mismatched or unsupported input leaves the active profile and
draft unchanged. A valid file for another installed profile routes to that
profile only after complete validation and leaves the previous profile parked.

Rc.19 adds no file conversion. When a valid same-profile Open or AVR New would
replace authored changes, choose Keep editing, request a data-only Download
copy, or explicitly Discard and continue. A download request does not clear the
warning because the browser or operating system owns final storage acceptance.

Use **Legacy copy** before rolling back to rc.16. The exported compatibility
file uses that profile's prior accepted schema and contains authored data only.
