# Intent MCU Simulator 1.1.0-rc.3

This incremental public release promotes the tested local-file and component
work without changing the product's safety boundary. The public compiler and
runtime still support one ATmega328P 16 MHz, 5 V educational profile.

## User-visible changes

- Save and Open use a learner-owned local project file. Browser recovery stays
  separately labelled and no account or server project database is added.
- The catalogue expands from five to 16 selectable original components,
  including contacts, analogue and digital sensors, RGB and seven-segment
  outputs, a 16×2 LCD, an active buzzer, and a quadrature encoder.
- Five validated starter projects are visible in a keyboard-accessible gallery.
- Component movement and route editing preserve exact visible named-pin wire
  attachment; invalid electrical plans continue to fail closed.
- The sticky Workbench toolbar reflows into mobile rows so Build, Run, Pause,
  and Reset stay visible at 320 px and 390 px without horizontal scrolling.
- Controller, component, example, and support pages provide crawlable factual
  documentation, unique canonical URLs, and current sitemap entries.
- The controller selector now presents one supported public profile and three
  clearly labelled, non-executable status previews. Preview mode parks the AVR
  project and disables project Open, Build, Run, firmware, Prompt Bridge, and
  runtime surfaces without calling a private service.

## Controller truth

- ATmega328P: public compile and tested virtual execution subset.
- ESP32-C3: private fixed-toolchain and actual QEMU UART/reset/watchdog
  evidence; public project upload, Build, Run, GPIO, wired circuits, and
  runtime endpoints are disabled.
- RP2040 Pico: private bounded source, fixed ARM compiler, strict UF2/ELF,
  rp2040js GPIO0/UART0, and retained local/precompiled route evidence; no
  public compiler, firmware picker, or runtime.
- STM32F429ZI: private bounded source, fixed ARM compiler, strict ELF, actual
  Renode PB0/USART3/reset, and retained fixture evidence; no public compiler,
  arbitrary-ELF input, or runtime.

The release makes no physical safety, complete hardware-equivalence, search
ranking, or AI-citation promise. Prompt Bridge remains portable text plus
strict project-owned validation, not a live AI service.
