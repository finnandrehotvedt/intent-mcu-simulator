# Intent MCU public-release rules

## Public visibility gate

- A feature, component, sensor, example, or release is not "public" merely because its source or production image is deployed.
- Before reporting it as public, verify the actual public HTTPS URL in a clean browser context with ordinary first-visit defaults and no pre-existing local storage.
- A newly promoted example must be visibly discoverable from the default Simple view without requiring the user to open Advanced mode, guess a search term, or expand a hidden list. If the product intentionally chooses another primary path, that path must be equally obvious on the first screen.
- For a new component, verify both the direct example path and the shared Parts drawer. The drawer structure and component-selection behavior must remain consistent across AVR, RP2040, ESP32-C3, and STM32 profiles unless a documented capability difference requires otherwise.
- Public acceptance must exercise the user-visible result, not only inspect the DOM: open the example, Build/Run when supported, operate its simulator controls, and confirm the expected visible or Serial output.
- Read back the deployed release identity from the public site and retain browser evidence. If any public check fails, roll back or keep the previous release active and describe the candidate as unpublished.
- Release notes, checkpoints, and user updates must distinguish among "implemented in source", "built", "deployed", and "verified publicly".
