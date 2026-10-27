# Intent MCU public-release rules

## Public visibility gate

- A feature, component, sensor, example, or release is not "public" merely because its source or production image is deployed.
- Before reporting it as public, verify the actual public HTTPS URL in a clean browser context with ordinary first-visit defaults and no pre-existing local storage.
- A newly promoted example must be visibly discoverable from the default Simple view without requiring the user to open Advanced mode, guess a search term, or expand a hidden list. If the product intentionally chooses another primary path, that path must be equally obvious on the first screen.
- For a new component, verify both the direct example path and the shared Parts drawer. The drawer structure and component-selection behavior must remain consistent across AVR, RP2040, ESP32-C3, and STM32 profiles unless a documented capability difference requires otherwise.
- Public acceptance must exercise the user-visible result, not only inspect the DOM: open the example, Build/Run when supported, operate its simulator controls, and confirm the expected visible or Serial output.
- Read back the deployed release identity from the public site and retain browser evidence. If any public check fails, roll back or keep the previous release active and describe the candidate as unpublished.
- Release notes, checkpoints, and user updates must distinguish among "implemented in source", "built", "deployed", and "verified publicly".

## Product interface invariants

- AVR is the visual and interaction reference for the component picker. AVR,
  RP2040, ESP32-C3, and STM32 must use the same shared, slide-out Parts drawer,
  the same picker contract, structure, controls, card styling, and open/close
  behavior. A profile may change support labels and which parts can execute,
  but it must not replace the drawer with a long inline list or a different
  picker design.
- Every new component must appear in that shared drawer on every controller
  profile with an explicit support state. An executable teaching component
  must also have a directly discoverable working example; adding only a model,
  catalogue row, or hidden chooser entry is incomplete.
- Digital sensors must model their digital protocol through compiled firmware,
  not merely paint a final value. Their physical quantities must have visible
  simulator controls with documented ranges, precision/step, defaults, and
  limitations, and acceptance must operate those controls and verify the
  resulting Serial or visible output.
- The goal of frequent visible releases never bypasses the public visibility
  gate. A source candidate, image, or deployment is still unpublished until
  the clean-browser public-URL checks above pass.
- Any intentional exception to these invariants must be documented beside the
  release evidence and covered by a regression test before publication.
- Build, Run and Stop are primary actions. They must remain visible in both
  Simple and Advanced views and must never be moved behind More/Tools, View or
  another disclosure. Parts and Serial may remain persistent edge drawers.
- Run must enter a locked interaction mode automatically. While that runtime
  session is active or paused, component placement, wiring, deletion and other
  authoring controls must not mutate the project. Stop returns to authoring.
- The primary runtime flow must expose visible keyboard shortcuts. At minimum,
  Build, Run, Stop, Pause/resume, selected potentiometer adjustment and selected
  momentary-switch operation need tested keyboard paths that do not fire while
  the user is typing in an editor or value field.
- User-configurable shortcuts must remain local, exact-schema data only. Show
  each active binding beside its visible action, reject duplicate, browser and
  authoring conflicts before save, keep tested defaults recoverable, and never
  execute a global shortcut while focus is in source, search, Serial or any
  editable/value field.
- A shortcut sequence may invoke only named visible actions in its displayed
  order. It must wait for success before advancing, honor disabled state, and
  stop without later steps on failure, timeout, Stop or Esc. It cannot edit
  source or wiring, approve dialogs, bypass guards or run in the background.
