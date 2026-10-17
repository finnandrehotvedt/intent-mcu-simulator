// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  AVR_PROFILE, ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE,
} from './compile-targets.mjs';

export const CONTROLLER_CAPABILITY_SCHEMA = 'intent-mcu-controller-capabilities@1';
export const CAPABILITY_STATUS = Object.freeze(['tested', 'project-model', 'unavailable']);
export const PERIPHERAL_KEYS = Object.freeze(['gpio', 'adc', 'pwm', 'uart', 'timers', 'interrupts']);

const capability = (status, boundary) => Object.freeze({ status, boundary });
const language = (values) => Object.freeze({
  ...values,
  files: Object.freeze(values.files),
  headers: Object.freeze(values.headers),
  libraries: Object.freeze(values.libraries),
});
const profile = (values) => Object.freeze({
  ...values,
  peripherals: Object.freeze(values.peripherals),
  language: language(values.language),
});

export const CONTROLLER_CAPABILITIES = Object.freeze({
  schema: CONTROLLER_CAPABILITY_SCHEMA,
  profiles: Object.freeze({
    [AVR_PROFILE]: profile({
      label: 'ATmega328P · 16 MHz · 5 V',
      sourceFile: 'main.ino',
      peripherals: {
        gpio: capability('tested', 'Digital D0–D13 with input, output and pull-up modes in the documented AVR subset.'),
        adc: capability('tested', 'ADC A0–A5 against bounded ideal 0–5 V sources.'),
        pwm: capability('tested', 'PWM on D3, D5, D6, D9, D10 and D11.'),
        uart: capability('tested', 'USART0 transmit, bounded receive and limited local history.'),
        timers: capability('tested', 'Bounded deterministic timing and instruction stepping; not complete timer-register equivalence.'),
        interrupts: capability('tested', 'INT0, INT1 and the implemented pin-change masks only.'),
      },
      language: {
        dialect: 'Arduino AVR sketch / C++ in the fixed isolated toolchain',
        grammar: 'The compiler accepts the bounded project file contract; runtime support remains narrower than compiler acceptance.',
        files: ['main.ino', 'up to seven project-local .h, .hpp, .c or .cpp files'],
        headers: ['Arduino.h', 'stdint.h', 'stddef.h', 'stdbool.h', 'limits.h', 'math.h', 'string.h', 'stdlib.h', 'avr/io.h', 'avr/interrupt.h', 'avr/pgmspace.h', 'util/atomic.h', 'util/delay.h'],
        libraries: ['Arduino AVR core 1.8.8 only; no user-installed or network-fetched library'],
      },
    }),
    [RP2040_PROFILE]: profile({
      label: 'RP2040 Pico · bounded public profile',
      sourceFile: 'main.c',
      peripherals: {
        gpio: capability('tested', 'Compiled GPIO0 output only, exposed as GP0 physical pin 1.'),
        adc: capability('unavailable', 'No ADC source/API path is public in this profile.'),
        pwm: capability('unavailable', 'No PWM source/API path is public in this profile.'),
        uart: capability('tested', 'UART0 uppercase text from the compiler-generated UF2.'),
        timers: capability('unavailable', 'No public timer API or timer-peripheral model.'),
        interrupts: capability('unavailable', 'No public interrupt API or interrupt-peripheral model.'),
      },
      language: {
        dialect: 'Strict bounded C11 compiled by Arm GNU 14.3.1',
        grammar: 'Exactly intent_gpio0_output(0u/1u), one 1–24 character uppercase intent_uart0_text call and intent_halt in the fixed template.',
        files: ['main.c only'],
        headers: ['No user-selectable headers; one fixed internal contract header is injected by the build worker'],
        libraries: ['No user libraries and no Pico SDK'],
      },
    }),
    [ESP32C3_PROFILE]: profile({
      label: 'ESP32-C3 development module · bounded public profile',
      sourceFile: 'sketch.ino',
      peripherals: {
        gpio: capability('project-model', 'Executed GPIO2 register writes feed the separate IntentForce LED model; QEMU pin state is not observed.'),
        adc: capability('unavailable', 'No ADC source/API path is public in this profile.'),
        pwm: capability('unavailable', 'No PWM source/API path is public in this profile.'),
        uart: capability('tested', 'Uppercase Serial marker observed from two actual Espressif QEMU boot epochs.'),
        timers: capability('unavailable', 'The fixed delay call is part of the grammar, not a public timer model.'),
        interrupts: capability('unavailable', 'No public interrupt API or interrupt-peripheral model.'),
      },
      language: {
        dialect: 'Strict bounded Arduino sketch compiled by Arduino-ESP32 3.3.10 / esp-rv32 2601',
        grammar: 'Fixed setup/loop template; only GPIO2 mode, GPIO2 level and one uppercase Serial marker may change.',
        files: ['sketch.ino only'],
        headers: ['No user-selectable headers; Arduino core symbols are fixed by the template'],
        libraries: ['No user libraries, network install, Wi-Fi or Bluetooth SDK surface'],
      },
    }),
    [STM32F429ZI_PROFILE]: profile({
      label: 'STM32F429ZI · bounded public profile',
      sourceFile: 'main.c',
      peripherals: {
        gpio: capability('tested', 'PB0 output observed in actual Renode and projected onto one ideal teaching LED path.'),
        adc: capability('unavailable', 'No ADC source/API path is public in this profile.'),
        pwm: capability('unavailable', 'No PWM source/API path is public in this profile.'),
        uart: capability('tested', 'USART3 uppercase text observed across two actual Renode boot epochs.'),
        timers: capability('unavailable', 'No public timer API or timer-peripheral model.'),
        interrupts: capability('unavailable', 'No public interrupt API or interrupt-peripheral model.'),
      },
      language: {
        dialect: 'Strict bounded freestanding C11 compiled by Arm GNU 14.3.1',
        grammar: 'Exactly intent_pb0_output(0u/1u), one 1–24 character uppercase intent_usart3_text call and intent_halt in the fixed template.',
        files: ['main.c only'],
        headers: ['No user-selectable headers; fixed startup, linker and runtime contracts are internal'],
        libraries: ['No user libraries, HAL, CMSIS or broad STM32 SDK'],
      },
    }),
  }),
});

export function controllerCapability(profileId) {
  return CONTROLLER_CAPABILITIES.profiles[profileId] ?? null;
}
