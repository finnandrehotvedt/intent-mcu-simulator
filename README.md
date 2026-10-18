# Intent MCU Simulator

Intent MCU Simulator is an original, browser-based learning environment for
building small microcontroller circuits, editing firmware, inspecting signals,
and exchanging deterministic circuit plans through a provider-neutral prompt.

This repository is the source-only release of the browser application,
project-owned compiler gateway and deterministic circuit model. It includes no
copied simulator artwork, layout, schema, endpoints, or branding. The
interface, component graphics and service code are implemented from scratch.

## Why we are building this

This project began as one of many practical demonstrations of professional
AI-assisted coding: not just generating source, but making the result visible,
testable, and open to inspection. Firmware is hard to understand from text
alone. The simulator turns a supported program into observable virtual
hardware behaviour—pins, LEDs, inputs, serial bytes, and logic traces—so a
person can learn from it and an AI-assisted workflow can use the same evidence
when explaining or checking a change.

The project is open source so people can use it, enjoy it, study it, and
contribute improvements. Development is ongoing, with no fixed final date or
predetermined finish line. That direction is an invitation to participate, not
a promise of perpetual maintenance. The current product has no hosted AI API.
AI-assisted use happens through ordinary source work, the optional portable
Prompt Bridge, or an optional local stdio client. The local MCP adapter exposes
only the same bounded deterministic contracts; it is not a public endpoint and
does not gain Apply or generic-command authority.

## Optional local MCP client

`tools/mcp-adapter.mjs` is a thin MCP 2025-06-18 stdio wrapper around the
existing local external-client adapter. It implements the required
`initialize`/`notifications/initialized` lifecycle and `tools/list`/
`tools/call`, then forwards canonical discovery, bounded action and ephemeral
job envelopes without reimplementing the project, compiler or runtime engine.
MCP cancellation maps only the active tool request to the existing exact
request-ID cancellation contract.

Run the independent correct/known-bad thermostat reference client with:

```sh
npm run example:mcp
```

The adapter is fixed to `https://lab.teachthecompany.com`; only the existing
test-only loopback override remains available. It has no listener, account,
credential, cloud persistence, origin selector, shell/eval, autonomous Apply
or broader controller authority. See [docs/MCP-ADAPTER.md](docs/MCP-ADAPTER.md).

## Local headless saved-experiment runner

The AVR thermostat experiment can also run from the same downloaded
`.intent-mcu.json` file without launching a browser:

```sh
npm run experiment:headless -- ./Thermostat-boundary-test.intent-mcu.json
```

The runner strictly reopens and electrically validates the data-only file,
compiles its exact source afresh through the fixed existing compiler contract,
executes the returned Intel HEX directly in the shared Node/avr8js runtime,
and delegates fixed M1 or saved X17 scenario verdicts to the shared evaluator. It
never accepts executable bytes or a prior verdict from the file.

The thermostat workbench can also save an X17 data-only scenario timeline.
Its bounded editor supports ordered ideal-temperature/button inputs and one
explicit D13 observation window per case. The browser and headless runner use
the same validated timeline and shared evaluator; each reports the actual
capture time, and an expected value never becomes observed evidence.

This source release supports only the exact AVR thermostat experiment.
Headless Pico, ESP32-C3 and STM32 execution is explicitly unavailable; their
different runtime integrations are not silently substituted or claimed. See
[docs/HEADLESS-EXPERIMENT.md](docs/HEADLESS-EXPERIMENT.md).

## Public discovery and factual machine context

The live workbench publishes crawlable controller, component, example and
support pages, a canonical URL, social-preview metadata, `robots.txt`,
`sitemap.xml`, and a concise
`llms.txt`. These files describe only
the supported product and link back to this source, licence, contribution
guidance, and the two owner articles. They do not promise search rankings, AI
citations, physical equivalence, hosted AI, or capabilities outside the exact
tested AVR, Pico, ESP32-C3 and STM32F429ZI subsets.

The component panel opens an exact 19-model by 4-profile compatibility matrix.
It derives from the real catalogues and reports Simulated, Partial or
Unavailable status, project-mode scope and a concrete limitation for every
cell; `/components.html` publishes the same contract as crawlable content.

The controller selector exposes four bounded public execution profiles. Pico,
ESP32-C3 and STM32F429ZI each have a local data-only project, exact source grammar
and fixed compiler. C3 flash executes on actual
Espressif QEMU CPU/UART; its GPIO2 LED result is separately and visibly labelled
as a project-owned executed-register-write model because QEMU pin state is not
observed. The strict STM32F429ZI ELF executes on actual Renode 1.17.0, which
observes PB0 and USART3 across reset replay; its editable named-pin external
LED path is visibly labelled as an ideal teaching circuit rather than a
physical or analogue model.
Selecting a non-AVR profile parks the AVR project without remapping its circuit;
returning to AVR restores that workbench.

The Pico, ESP32-C3 and STM32 teaching circuits share a deliberately bounded
named-pin cable workflow for their existing controller/resistor/LED/ground
graphs. A learner can delete and recreate a cable from two compatible free
pins, or select a cable and reconnect one explicitly chosen endpoint. Pending
wire actions are visible and cancellable, invalid choices reject atomically,
stable net IDs survive Undo/Redo and Save/Open, and every topology change
requires a fresh Build. This does not activate general wiring across their
other pins or add broader controller support.

The same three teaching circuits expose a separate profile-filtered recovery
list containing only their fixed controller, existing resistor and existing
LED. If a resistor or LED is deleted and local Save/Open has discarded Undo
history, the learner can restore that one stable part and reconnect its named
pins manually. Recovery adds no wire implicitly. Resistance and LED colour are
bounded by the same 3.3 V / 12 mA ideal validator used before Build; colour
selects a tested forward-voltage constant and is not a brightness, wavelength
or physical-accuracy claim.

## Current source-release boundary

The interactive workbench currently requires a desktop browser. Desktop
keyboard, file and canvas workflows are the supported acceptance target.
Responsive styles remain in place and the public controller, component,
example and support pages remain useful on smaller screens, but phone/tablet
workbench navigation and editing are not release-supported.

The full circuit editor supports one ATmega328P learning profile and 16
selectable parts: core passives, momentary and latching contacts, analogue and
digital sensors, LEDs and displays, an active buzzer, and a quadrature encoder.
A separate bounded RP2040 Pico profile accepts one exact C11 source grammar,
compiles a source-bound UF2 and executes GPIO0/UART0 in a browser worker against
one validated GP0-to-resistor-to-LED-to-GND circuit. A separate bounded
ESP32-C3 sketch grammar compiles a fixed DIO flash image and executes two UART
boot epochs on actual Espressif QEMU. Its default GPIO2-to-220-Ω-to-LED-to-GND result
uses the separately labelled project-owned register model, not QEMU pin
readback. A bounded STM32F429ZI C11 grammar compiles with Arm GNU 14.3.1,
passes strict ELF32 admission, and executes PB0/USART3/reset replay in actual
Renode 1.17.0. Its default named PB0-to-220-Ω-to-LED-to-GND path is editable with the
same bounded selection, movement, rotation, deletion, history and responsive
routing rules as the Pico and C3 paths. It follows the observed PB0 level
without claiming broad peripherals or physical equivalence. The application also
supports user-owned local project files, Prompt Bridge circuit-plan validation,
serial display, logic traces, and pin inspection. Its manual-first workbench
uses a data-driven catalogue with nine
categories, exact support labels, practical metadata search, local favourites
and recent parts. Selectable parts render original project SVG artwork whose
visible terminals and invisible wiring hit targets share the same local
coordinates.

Connected wires remain visible from the exact named metal terminal even where
component artwork is opaque. Automatic routes still avoid component bodies;
if a user deliberately moves a route across artwork, that section stays
visible without changing connectivity or creating a junction.

## Manual builder walkthrough

The browser project starts empty; there is no concealed demonstration circuit.
The intended manual workflow is:

1. Add one controller and the desired components from the searchable catalog.
2. Select two visible pin anchors to create a net. Selecting another free pin
   and a pin on that net creates an explicit branch/junction.
3. Select a net to inspect all members, choose a wire colour, edit layout-only
   bends, or detach a named branch. A selected wire section clears component
   selection; Delete removes that connection or branch, while deleting a whole
   net uses its separately labelled action. Overlapping wire targets cycle in
   deterministic order. Horizontal sections move only vertically and vertical
   sections only horizontally. Visual crossings do not imply electrical
   connectivity, and route/colour changes never alter the electrical graph.
4. Move or rotate components. Layout changes preserve component and pin
   identity, and routed wire endpoints remain attached to their actual pins.
5. Edit one or more source files. Source, circuit, and board profile together
   determine build freshness; changing any of them invalidates an old artifact.
6. Save or open a project file on your computer. **Download copy** always
   requests the same deterministic local download and ordinary **Open
   project** always uses a reliable file input. A supported secure desktop
   browser also shows optional **Open & connect**, **Save connected file** and
   **Save copy** actions; their file handle exists only in that browser session
   and a save is claimed only after write and close both succeed. Browser
   recovery is separate from the durable user-owned file. A valid same-profile
   Open, or AVR New, asks before replacing authored changes; requesting a
   download copy does not claim that the browser completed a durable write.
   Imported projects and
   Prompt Bridge proposals pass the same strict schema and electrical rules as
   manual edits.

Placed parts intentionally have no permanent card/header background. Names,
properties, pin roles, provenance, simulation status and exact limitations are
available through the catalogue and inspector instead of being painted into
the hardware art. The four-terminal tactile button depicts A1/A2 and B1/B2 as
physical terminals while preserving the two internally common electrical
groups `A` and `B`.

Example circuit: connect controller `D13` to a resistor, the resistor to an
LED anode, and the LED cathode to controller ground. Connect a momentary button
between `D2` and ground and configure `D2` as `INPUT_PULLUP` in firmware. The
electrical model rejects a missing current-limiting resistor, reversed LED,
ambiguous ground, reused pin, direct supply short, or conflicting outputs.

The thermostat boundary starter adds an ideal temperature module on `A1`, an
active-low enable button on `D2`, and a 220 Ω LED command indicator on `D13`.
Its three reset-isolated scenarios observe only between 160 and 350 virtual
milliseconds. A result passes only when the executed D13 pin, UART line, and
ordered input log agree. The supplied known-bad `<=` variant must fail the
30 °C equality scenario. This does not model a physical heater, room dynamics,
sensor accuracy, contact bounce, or a safety controller.

Open the named Serial tab to dock text/events beside the canvas on a wide
screen or above it as a bottom drawer on a narrow screen. Scrolling away from
the end pauses autoscroll and exposes an unread indicator; Jump to new output
resumes it. Clear affects retained view records, while Reset affects the MCU.
Use Interact mode to press and hold the tactile button directly on the canvas
with pointer, Space, or Enter. The dock and canvas control reuse the one
existing runtime worker and do not make a hosted AI or third-party request.
For a practical testing view, collapse Parts and Inspector with their named
toolbar buttons and resize Serial as needed. The circuit, input control,
Build/Run/Pause/Reset and readable live output then remain together without
scrolling between them at supported desktop widths; both side panels remain
keyboard-accessible from the same buttons. Route section moves are loop-safe:
they cannot accumulate repeated rectangular laps, while non-overlapping custom
jogs and unrelated branches remain intact.

On Pico, ESP32-C3 and STM32, select a cable to add an orthogonal bend, move an
eligible snapped section or choose one of six fixed colours. Crossings remain
electrically separate unless a declared junction dot says otherwise. These are
layout-only edits: named endpoints remain the topology authority, and accepted
route or colour changes do not invalidate source or executable authority.

The Apache-2.0 compiler gateway source, strict API contract, isolation tests,
checksum-pinned toolchain recipe, notices and local operations guide are
included. Prebuilt compiler/toolchain images, downloaded compiler archives,
compiled learner firmware, generated browser bundles and hosted deployment
configuration are deliberately not distributed. A local source build keeps
third-party compiler terms separate from the Apache-2.0 browser and service
source; it does not authorize redistributing the resulting image.

Additional current limits:

- source version `1.1.0-rc.32` is the public release for
  `https://lab.teachthecompany.com/`; hosted compiler/toolchain images and
  private deployment configuration remain outside this source repository;
- public execution supports the tested ATmega328P subset, one bounded RP2040
  Pico GPIO0/UART0 source profile, one bounded ESP32-C3 GPIO2/UART profile and
  one bounded STM32F429ZI PB0/USART3/reset-replay profile;
- no physical board connection, firmware upload, live AI call, account,
  analytics, or cloud project store is included;
- the CPU/peripheral profile is a tested educational subset, not a promise of
  complete hardware equivalence or physical/electrical safety;
- the prompt bridge creates portable text and accepts only validated circuit
  data; it never gives free-form AI output direct drawing or build authority;
- browser source tests are project-owned verification, not independent
  certification.

See [RELEASE-NOTES.md](RELEASE-NOTES.md), [MIGRATION.md](MIGRATION.md) and
[ROLLBACK.md](ROLLBACK.md) for the deployed scope, migration and recovery
boundary.

## Prerequisites

- Node.js `20.19.4`
- npm `10.8.2`
- Docker Engine with access to the local Docker socket for isolated firmware
  builds (not required for source-only unit tests)

## Verify a fresh checkout

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
```

The build writes `dist/`, which is intentionally ignored and not committed.
To perform the same source checks in a pinned container environment:

```bash
docker build --pull=false -t intent-mcu-simulator-source-check .
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --pids-limit 64 --memory 256m --cpus 1 \
  --tmpfs /tmp:size=32m,mode=1777 \
  intent-mcu-simulator-source-check
```

## Compile and run locally

The reproducible local path uses no hosted compiler:

```bash
npm run setup:toolchain
DOCKER_GID=$(stat -c %g /var/run/docker.sock) \
  docker compose --profile local-compiler up --build -d local-compiler
```

Then, in another terminal:

```bash
docker compose --profile local-compiler exec -T local-compiler npm run test:local
```

This compiles a 150 ms Blink sketch in a disposable offline worker, loads the
returned HEX into the emulator adapter and measures the expected GPIO edges.
The setup verifies every downloaded toolchain archive by SHA-256 and generates
a machine-local image lock. See [LOCAL-OPERATIONS.md](LOCAL-OPERATIONS.md) for
health, readiness, limits, restart, rollback, logging and distribution details,
and [COMPATIBILITY.md](COMPATIBILITY.md) for the exact supported subset.

## Security

Please do not disclose a suspected vulnerability in a public issue. Use the
repository's **Security → Report a vulnerability** route described in
[SECURITY.md](SECURITY.md).

## Licence

Original project source is licensed under the Apache License 2.0. Third-party
packages keep their own licences; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
and [DEPENDENCIES.md](DEPENDENCIES.md).

Release history and bounded next steps are recorded in [CHANGELOG.md](CHANGELOG.md)
and [ROADMAP.md](ROADMAP.md).
