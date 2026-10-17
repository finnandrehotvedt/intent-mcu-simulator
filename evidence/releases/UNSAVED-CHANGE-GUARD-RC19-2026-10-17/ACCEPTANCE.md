# Unsaved-change guard rc.19 acceptance

Receipt: `desktop-etvt6l5-ct109-lab-unsaved-change-guard-20261017-001`  
Date: 2026-10-17

## Accepted behavior

- Dirty authored name, source, supported properties, topology, layout,
  rotation and wire styling are detected independently for AVR, Pico,
  ESP32-C3 and STM32F429ZI.
- AVR New and strictly valid same-profile Open require an explicit decision.
  Keep editing, Escape and backdrop cancellation preserve exact state and
  restore focus. Discard runs one bound action once.
- Download copy requests the existing canonical data-only file and leaves the
  guard open. It does not clear dirty state or claim durable write acceptance.
- Invalid, oversized and cancelled input remains atomic. Cross-family Open
  does not prompt and preserves the parked draft.
- One pending action is serialized. A changed draft or profile cancels an old
  pending action instead of allowing it to replace newer work.

## Verification

- `npm test`: 191/191 passing.
- Source-check container build: 191/191 passing,
  `local/intent-mcu-source-check:1.1.0-rc.19`.
- Unsaved-change browser acceptance: Chromium, Firefox and WebKit passing on
  desktop, including exact paused-runtime preservation. Earlier 390 px results
  are retained as historical evidence but are not a release gate after Finn's
  desktop-only product decision.
- Common envelope, all-profile local files, local file workflow, named-pin
  authoring and rotated-label acceptance: passing.
- Thermostat experiment, receipt-14 routing/terminal/serial, shared fullscreen
  and controller-switching acceptance: passing.
- No account, server project write, analytics, cookie, third-party browser
  request, native-handle promise, controller expansion or file-schema change.

The release commit, production image digest, VM103 readback, HTTPS headers and
public regression URLs are recorded in the station receipt result after live
acceptance.
