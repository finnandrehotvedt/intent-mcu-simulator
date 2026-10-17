# Common local project format contract

Status: approved implementation contract, 2026-10-17  
Receipt: `desktop-etvt6l5-ct109-lab-common-project-format-20261017-001`

## Outcome

All four existing public controller workbenches save one canonical local-file
envelope, `intent-mcu-project-envelope@1`, and open that envelope through one
strict profile-routing contract. The envelope contains exactly `schema`,
`profile` and `project`. `profile` is one exact installed tested profile;
`project` is that profile's current strictly validated authored document.

The envelope is data-only. It preserves stable component and pin identities,
source, circuit topology, supported controls/properties, layout, rotation,
wire routes/styles and other accepted authored state. It never carries
firmware bytes, executable artifacts, runtime/session authority, verdicts,
credentials, secrets, network instructions or toolchain capabilities.

## Open and migration

- Strict JSON parsing rejects duplicate keys, malformed input and files above
  1 MiB before any project or profile changes.
- Envelope and nested profile identities must agree. Unknown versions,
  profiles, fields and unsupported authored values reject atomically.
- Current AVR contact/v2, Pico v1, C3 v1, STM32 v2 and STM32 source-only v1
  files migrate deterministically in memory. The lossy AVR v1 path remains an
  explicit legacy action and is never silently opened.
- A legacy source file is never overwritten. Its migrated result is saved as a
  new envelope file. Repeated migration is canonical and creates no duplicate
  components or nets.
- A valid envelope may route to another installed profile only after detached
  validation succeeds. There is no cross-controller reinterpretation.
- Successful Open retires executable/runtime authority, clears transient edit
  history and requires a fresh Build. Failed/cancelled Open preserves the
  current profile, draft, recovery, history and runtime exactly.

## Release boundary

The existing profile validators, source grammars, component sets, electrical
rules, compilers and runtimes remain authoritative. Browser recovery remains
local and separately labelled. This increment adds no account, cloud/server
project storage, collaboration, live AI, controller, peripheral, arbitrary
graph conversion, paid infrastructure or M2-M5 capability.

Public release requires actual downloaded envelope files to reopen in fresh
pages for AVR, Pico, C3 and STM32, preserve authored data, require and pass a
fresh Build/Run, and pass malformed/oversized/unknown/mismatched/unsupported
negative cases, cancellation, repeated Open, desktop/mobile layout,
WIRE-LANE-01, Fullscreen, six AVR starters, thermostat M1, security and Teach
domain regression checks. The rc16 image and source remain exact rollback;
new envelope files must also have a tested per-profile legacy export recovery
path before public switch.
