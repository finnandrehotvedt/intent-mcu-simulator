# Shared controller workbench acceptance contract

Status: approved implementation contract, 2026-10-17  
Receipt: `desktop-etvt6l5-ct109-lab-shared-avr-workflow-20261017-001`

## Outcome

ATmega328P, RP2040 Pico, ESP32-C3 and STM32F429ZI use one recognisable,
full-width workbench workflow. Switching the active controller changes a real
profile adapter inside that common workflow; it must not reveal a separate
product page or a decorative controller card layered over the old workbench.

The common visual language contains:

1. a profile-filtered Parts panel;
2. an editable circuit Canvas with named physical pin anchors and wire tools;
3. an Inspector for the selected component or cable;
4. a Source panel;
5. truthful Build/Run controls and runtime state;
6. a named Serial/output panel; and
7. one project toolbar with Save and Open.

Controls may differ only where the accepted profile capability differs. An
unsupported operation is disabled and has a visible reason; it is never
silently simulated.

## Preserved capability boundaries

This release does not add a controller, compiler, source grammar, peripheral,
pin, component, voltage model or runtime:

- ATmega328P keeps the current circuit-v2 editor, fixed AVR compiler,
  deterministic browser worker, instruments, Prompt Bridge, six ordinary
  starters and accepted thermostat M1 behavior.
- RP2040 Pico keeps its strict GPIO0/UART0 C11 grammar, fixed compiler,
  source-bound UF2, rp2040js worker and validated GP0/220-ohm/LED/GND model.
- ESP32-C3 keeps its strict GPIO2/UART sketch grammar, fixed flash layout,
  actual QEMU CPU/UART evidence and separately labelled project-owned GPIO2
  register/LED model. QEMU pin readback is not claimed.
- STM32F429ZI keeps its strict PB0/USART3 C11 grammar, fixed ELF admission,
  actual Renode CPU/PB0/USART3/reset evidence and ideal external LED teaching
  circuit.

M2-M5 remain planned. There is no physical-device connection, upload, broad
SDK, cloud project store, live AI call or second app server.

## Adapter contract

Each profile adapter supplies stable identity and capability data plus the
existing project/editor/runtime implementation. The shell, not the adapter,
owns common panel placement and navigation. An adapter must expose:

- stable profile ID, label and truthful limitation;
- Parts, Canvas, Inspector, Source, Runtime, Serial and Project surfaces;
- supported action labels and unsupported-action reasons;
- activation/deactivation hooks that preserve the draft but retire stale
  artifacts and runtime authority;
- current build freshness and runtime state; and
- profile-safe Save/Open behavior using the already accepted file schema.

Only one adapter is active. DOM content, status text, enabled controls,
artifact identity and runtime observations must all belong to that same active
profile.

## Required acceptance

Acceptance is release-blocking and must be exercised at supported desktop and
mobile widths.

### Shared presentation

- All four profiles show the same named Parts, Canvas, Inspector, Source,
  Runtime, Serial and Project regions in the same shell.
- Switching profiles does not leave stale source, pins, capability labels,
  Build/Run state, serial output or inspector authority visible.
- Profile drafts and their existing project identities survive a switch away
  and back. An old artifact never survives as runnable authority.
- Parts and pins are filtered to the selected profile and its accepted voltage
  model. Unsupported controls are disabled with a discoverable reason.

### Wiring and execution

- `WIRE-LANE-01`: distinct electrical nets never share a collinear visible
  segment of positive length and maintain a useful visible lane clearance.
  Perpendicular crossings are allowed and remain visually different from an
  explicit same-net junction. Same-net branches may share only their rendered
  trunk/junction; endpoint contact is not overlap. This is checked from the
  rendered SVG after move, rotate, resize, zoom/Fit, Undo/Redo and Save/Open.
- On every profile, accepted movement and named-pin wire operations keep cable
  endpoints attached to the intended anchors and require a fresh Build.
- Pico, C3 and STM32 support their accepted delete/recreate, reconnect,
  cancel, Undo/Redo, rotate, zoom/Fit and bounded-part recovery paths.
- AVR retains its richer circuit-v2 wire and component workflow.
- Each profile performs a real compile through its existing fixed toolchain and
  a real accepted Run observation through its existing runtime boundary.
- Runtime and Serial/output labels state exactly what is observed; C3 keeps the
  QEMU-versus-project-model separation and STM32 keeps the Renode-versus-ideal-
  circuit separation.

### Project files and failure paths

- Save produces an actual downloaded local file for each profile.
- Open is tested from a fresh page using that downloaded file.
- Cancel leaves the active project unchanged.
- Malformed JSON and a valid file for the wrong profile reject atomically and
  preserve the current project.
- Opened projects require a fresh Build before Run.
- Existing file schemas and migrations remain accepted; this increment does
  not introduce a common envelope migration.

### Regression and release

- The complete source suite, original-work checks and production container
  checks pass.
- AVR six starters, thermostat correct/known-bad M1, interaction, persistence,
  source/runtime and responsive-browser regressions pass.
- Public HTTPS, security headers, no unexpected third-party request, no
  cookies and no horizontal overflow pass.
- Existing Teach-domain regression URLs remain healthy.
- Every product commit is pushed to the established `origin/main` before the
  next product increment. Public release records exact source commit, image,
  body hash, rollback and browser evidence.

## Recovery

Source recovery is an exact Git revert on the existing `main`. Public recovery
redeploys the accepted rc.14 image
`sha256:7c64930f95ba10a8bf0859f3fdd2cb70b3a90aa89bc6c656a292076b60850c00`.
The pre-change VM103 recovery basis remains at
`/var/backups/teach-company-lab-preview/ct109-rustvm103-lab-public-thermostat-20261017-001-pre-thermostat`.
No rollback step changes DNS, Caddy, another container or unrelated state.
