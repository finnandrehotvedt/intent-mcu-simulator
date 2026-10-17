# Native file parity rc.20 acceptance

Receipt: `desktop-etvt6l5-ct109-lab-native-file-parity-20261017-001`  
Date: 2026-10-17

## Accepted scope

- F01 only: reliable local Download/Open remains primary on AVR, Pico,
  ESP32-C3 and STM32; supported secure desktop browsers additionally expose
  explicit Open & connect, Save connected file and Save copy actions.
- Native handles are held only in memory for the exact profile session. They
  are not serialized into the project envelope, browser recovery, logs or a
  server request. Legacy originals are never connected for overwrite.
- New clears the AVR connection. Ordinary Open replaces and disconnects an
  old handle. Strict connected Open validates detached input and completes the
  existing unsaved-change decision before attaching the handle to the declared
  target profile.
- A completed native write is claimed only after write and close succeed.
  Cancellation, denial, create/write/close failure and stale picker return
  preserve authored state and the prior connection. A download request remains
  distinct from durable-write proof.
- Native operations are serialized without blocking Download copy, ordinary
  file-input Open, editing or the rc.19 guard. No timer can turn a still-open
  picker into a duplicate write.

## Verification

- Source tests: 191/191 passing.
- Native file browser acceptance: Chromium synthetic File System Access
  contract passes all four profiles, including canonical Save copy and repeat
  Save, cancellation, permission/write/close failures, stale intent, legacy
  protection, New/ordinary-Open disconnection, cross-profile handle routing,
  zero cookies, zero outside requests and zero server mutation requests.
- Reliable fallback acceptance: Chromium, Firefox and WebKit pass all four
  profiles with native actions hidden and deterministic Download copy active.
- Rc.19 unsaved-change acceptance: Chromium, Firefox and WebKit pass exact
  state, focus, paused runtime, invalid/cancelled Open and cross-profile
  parking after the new controls were added.
- Existing all-profile actual-download/fresh-page Open, common-envelope,
  local-file and strict documentation tests pass. Compiler/runtime code paths
  did not change, so this batch does not claim a new runtime acceptance run.
- Candidate screenshot SHA-256:
  `bcf1401ccd9831e1fffd30e0fa46c2b614a4aa3efc9fd870a63b6197c23d6dc6`.

Automated browser acceptance uses a synthetic File System Access contract for
native writes because the headless runner cannot operate a real OS chooser.
That evidence is reported separately and is not a blanket claim that every
browser supports native handles. The UI exposes native controls only when the
secure desktop browser reports the relevant APIs.

The immutable source commit, production image digest, rollback backup, live
HTTPS/browser readback and final requirement transition are recorded in the
station receipt result after public acceptance.
