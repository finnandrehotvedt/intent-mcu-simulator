# Migration to 1.1.0-rc.3

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

The three additional controller selector entries are status previews and do
not migrate, reinterpret, or upload an AVR project. Selecting one parks the
current AVR data; return to AVR and rebuild before Run.
