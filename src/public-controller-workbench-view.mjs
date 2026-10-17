// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  AVR_PROFILE,
  ESP32C3_PROFILE,
  RP2040_PROFILE,
  STM32F429ZI_PROFILE,
  targetAvailabilitySnapshot,
} from './compile-targets.mjs';

export const PUBLIC_CONTROLLER_VIEW_SCHEMA = 'intent-mcu-public-controller-view@1';

const definitions = Object.freeze({
  [AVR_PROFILE]: Object.freeze({
    mode: 'avr-circuit', status: 'supported', eyebrow: 'PUBLICLY SUPPORTED',
    label: 'ATmega328P', title: 'ATmega328P circuit workbench',
    summary: 'Build a circuit, edit source, compile in the fixed AVR toolchain and run the tested deterministic browser-worker subset.',
    project: 'teach-lab-project@2 · local Save/Open and browser recovery',
    source: 'Edited source · fixed isolated AVR compiler',
    runtime: 'Deterministic browser worker · documented AVR subset',
    circuit: 'Active circuit-v2 canvas, instruments and Prompt Bridge',
    action: 'Build AVR project', limitation: 'Only the documented AVR CPU, peripheral and electrical-model subset is supported.',
    publicExecution: true,
  }),
  [ESP32C3_PROFILE]: Object.freeze({
    mode: 'c3-source', status: 'supported-bounded', eyebrow: 'PUBLICLY RUNNABLE · BOUNDED ESP32-C3 SUBSET',
    label: 'ESP32-C3', title: 'ESP32-C3 source, QEMU and GPIO2 model',
    summary: 'Edit the bounded sketch, compile with the fixed Arduino-ESP32 toolchain, then execute the flash on actual Espressif QEMU CPU/UART.',
    project: 'Local data-only Save/Open · fresh Build after Open',
    source: 'Strict GPIO2 mode/level and UART marker grammar · fixed DIO flash layout',
    runtime: 'Actual Espressif QEMU esp32c3 CPU/UART · two verified boot epochs',
    circuit: 'Project-owned GPIO2 register model · editable named-pin circuit · J1 pin 4 → 220 Ω → LED → J1 pin 6',
    action: 'Build ESP32-C3 project', limitation: 'QEMU pin state is not observed. GPIO2/LED comes from the separately labelled project-owned executed-register-write model; no SDK, broad ESP32 family, arbitrary source, timing, Wi-Fi, Bluetooth or physical-device claim.',
    publicExecution: true,
  }),
  [RP2040_PROFILE]: Object.freeze({
    mode: 'rp2040-source', status: 'supported-bounded', eyebrow: 'PUBLICLY RUNNABLE · BOUNDED PICO SUBSET',
    label: 'RP2040 Pico', title: 'RP2040 Pico source and GPIO0 workbench',
    summary: 'Edit the bounded C11 example, compile it in the fixed isolated Arm toolchain, then run the source-bound UF2 in a browser worker.',
    project: 'Local data-only Save/Open · fresh Build after Open',
    source: 'One fixed main.c grammar · GPIO0, UART0 and halt only',
    runtime: 'rp2040js 1.4.0 browser worker · hash-bound UF2',
    circuit: 'GP0 physical pin 1 → 220 Ω → external LED → GND physical pin 3',
    action: 'Build Pico project', limitation: 'This is a tested educational GPIO0/UART0 subset, not a complete Pico, SDK, PIO, DMA, USB, multicore, timing, or physical-device claim.',
    publicExecution: true,
  }),
  [STM32F429ZI_PROFILE]: Object.freeze({
    mode: 'stm32-source', status: 'supported-bounded', eyebrow: 'PUBLICLY RUNNABLE · BOUNDED STM32F429ZI SUBSET',
    label: 'STM32F429ZI', title: 'STM32F429ZI source, Renode and PB0 workbench',
    summary: 'Edit the bounded C11 source, compile with the fixed ARM toolchain, then execute its strict ELF on actual Renode CPU/PB0/USART3.',
    project: 'Local data-only Save/Open · fresh Build after Open',
    source: 'Strict PB0 level and USART3 marker grammar · fixed startup/linker/runtime',
    runtime: 'Actual Renode 1.17.0 CPU, PB0 and USART3 · two verified boot epochs',
    circuit: 'Renode-observed PB0 → ideal 220 Ω → LED → named GND path',
    action: 'Build STM32F429ZI project', limitation: 'This is a strict PB0/USART3/reset-replay subset, not arbitrary C or ELF, a complete STM32/SDK/peripheral/timing model, analogue equivalence, hardware programming or physical-device support.',
    publicExecution: true,
  }),
});

export function publicControllerView(profile) {
  const definition = definitions[profile];
  if (!definition) return null;
  return structuredClone({
    schema: PUBLIC_CONTROLLER_VIEW_SCHEMA,
    profile,
    publicSupport: [AVR_PROFILE, ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE].includes(profile),
    availability: targetAvailabilitySnapshot(profile),
    ...definition,
  });
}

export function publicControllerViews() {
  return [AVR_PROFILE, ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE]
    .map(publicControllerView);
}
