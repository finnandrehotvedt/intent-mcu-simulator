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
    mode: 'c3-preview', status: 'preview-only', eyebrow: 'PRIVATE VERIFICATION · PUBLIC PREVIEW ONLY',
    label: 'ESP32-C3', title: 'ESP32-C3 Serial verification preview',
    summary: 'Bounded edited Serial source, fixed-toolchain compilation and actual QEMU UART have passed private verification. They are not exposed on the public service.',
    project: 'Private local project proof · public Open disabled',
    source: 'Private bounded Serial source proof · public Build disabled',
    runtime: 'Private actual QEMU UART proof · public Run disabled',
    circuit: 'No validated GPIO pin-level or wired-circuit support',
    action: 'Public execution not enabled', limitation: 'Public C3 execution waits for fair multi-user admission, rate limits and production isolation. No GPIO, wired LED, broad peripheral or physical-device claim.',
    publicExecution: false,
  }),
  [RP2040_PROFILE]: Object.freeze({
    mode: 'rp2040-preview', status: 'preview-only', eyebrow: 'PRIVATE VERIFICATION · PUBLIC PREVIEW ONLY',
    label: 'RP2040 Pico', title: 'RP2040 bounded-source preview',
    summary: 'Bounded C11 source, fixed ARM compilation, strict UF2/ELF and rp2040js GPIO0/UART0 have passed private verification. Public build, firmware selection and execution are not enabled.',
    project: 'No public project import for this profile',
    source: 'Private bounded source proof · public Build disabled',
    runtime: 'Private rp2040js source + fixture evidence · public Run disabled',
    circuit: 'Private GP0 pin 1 → resistor → LED → GND pin 3 proof · no public circuit mapping',
    action: 'Public execution not enabled', limitation: 'Private bounded evidence is not a public compiler, complete Pico, PIO/DMA/USB/multicore, or physical-device support claim.',
    publicExecution: false,
  }),
  [STM32F429ZI_PROFILE]: Object.freeze({
    mode: 'stm32-preview', status: 'preview-only', eyebrow: 'PRIVATE EVIDENCE · PUBLIC PREVIEW ONLY',
    label: 'STM32F429ZI', title: 'STM32F429ZI bounded-source preview',
    summary: 'Bounded C11 source, fixed ARM compilation, strict ELF and actual Renode PB0/USART3/reset replay have passed private verification. No public compiler, arbitrary ELF or runtime is enabled.',
    project: 'No public project import for this profile',
    source: 'Private bounded source proof · public Build disabled',
    runtime: 'Private Renode source + fixture evidence · public Run disabled',
    circuit: 'Private onboard PB0/LED1 only · no public external wire or broad peripheral mapping',
    action: 'Public execution not enabled', limitation: 'Private bounded evidence is not a general STM32, Renode, external-pin, or physical-device support claim.',
    publicExecution: false,
  }),
});

export function publicControllerView(profile) {
  const definition = definitions[profile];
  if (!definition) return null;
  return structuredClone({
    schema: PUBLIC_CONTROLLER_VIEW_SCHEMA,
    profile,
    publicSupport: profile === AVR_PROFILE,
    availability: targetAvailabilitySnapshot(profile),
    ...definition,
  });
}

export function publicControllerViews() {
  return [AVR_PROFILE, ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE]
    .map(publicControllerView);
}
