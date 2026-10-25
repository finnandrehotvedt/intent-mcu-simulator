# RC139 multi-pin authoring maps

These version-2 maps extend data-only circuit authoring. They do not widen the
existing firmware grammars, compiler targets or runtime observations. Pico
runtime remains GP0-only, ESP32-C3 runtime remains GPIO2-only, and STM32
runtime remains PB0-only.

Official sources inspected on 2026-10-25:

- Raspberry Pi Pico: official pinout SVG,
  <https://www.raspberrypi.com/documentation/microcontrollers/images/pico-pinout.svg>.
  Authoring anchors: GP0/physical 1, GP1/2, GND/3, GP2/4, GP3/5 and GND/8.
- ESP32-C3-DevKitM-1: Espressif Header Block and linked schematic
  `SCH_ESP32-C3-DEVKITM-1_V1_20200915A.pdf`,
  <https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32c3/esp32-c3-devkitm-1/user_guide.html#header-block>.
  Authoring anchors: J1 GPIO2/4, GPIO3/5, GND/6, GND/8, GPIO0/9 and GPIO1/10.
- NUCLEO-F429ZI: ST UM1974 Rev 11 (August 2025), Table 21, page 70,
  <https://www.st.com/resource/en/user_manual/dm00244518-stm32-nucleo-144-boards-mb1137-stmicroelectronics.pdf>.
  Authoring anchors: PB0 CN11/34, PB1 CN12/24, PB7 CN11/21 and GND CN11/19,
  CN11/20 and CN11/8.

The logical STM32 pin ID `GND` is retained for existing files, but its physical
metadata is corrected from the earlier erroneous `CN11-35` claim to documented
`CN11-19`. UM1974 identifies CN11-35 as PC2. This metadata correction does not
rewrite saved endpoint IDs or grant new runtime authority.
