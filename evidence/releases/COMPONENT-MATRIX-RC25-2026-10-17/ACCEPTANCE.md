# Component matrix RC25 acceptance

## Locked inventory

- 19 unique public component models across 4 controller profiles.
- 76 exact profile/model cells.
- 25 available cells: 19 Simulated and 6 Partial.
- 51 unavailable cells with an explicit fail-closed reason.
- AVR: 16 available (13 Simulated, 3 Partial); ordinary project-v2 exposes 5 and candidate-v3 exposes 13 by default or all 16 with All statuses.
- RP2040 Pico, ESP32-C3 and STM32F429ZI: 3 available each (fixed Partial controller, Simulated resistor and LED) and 16 unavailable each.

The executable inventory is `src/component-support-matrix.mjs`. It derives model identity and support status from the real public catalogues instead of duplicating model declarations.

## Acceptance boundary

- L04 may move to complete only after the 19-by-4 matrix, user-visible dialogue, crawlable documentation and exact count tests pass.
- L05 may move to complete only after positive and negative validator coverage, including the rotary encoder, passes.
- L06 remains partial: 8 available AVR candidate models have tracked tests but no public starter/reference project. Existing references cover 8 of the 16 available AVR models; all narrow-profile available models have public references.
- No support cell is called draft or visual-only merely because its implementation source path is historical.
- Partial never means broad hardware support. Unavailable combinations are not remapped or approximated.

## Release evidence

- `npm test`: 17 pretests and 193 regression tests passed.
- `test/component-support-matrix.test.mjs`: 5 targeted matrix/encoder tests passed, including ordered CW/CCW events and fail-closed powered COM.
- `test/component-support-matrix-browser.cjs`: 19 rows, exact AVR/narrow counts, keyboard open/Escape/focus return, no project/history/runtime mutation, no third-party request and no page overflow.
- Browser evidence: `component-matrix-local.png`, SHA-256 `3c29b12b93b241edd55e84d07cfa1ca6279dc81f0970e6cfaa3468742ec4dce6`.
- Immutable source-check image `local/intent-mcu-source-check:1.1.0-rc.25` built as local image ID `sha256:282b1dff146e` after executing the complete test suite inside the image.
- VM103 pre-stop gates and live HTTPS verification remain pending until the exact committed production image is built and transported.
