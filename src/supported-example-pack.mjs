// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { sourceForGpio2 } from '../c3/protocol.mjs';
import { sourceForStm32 } from '../stm32/protocol.mjs';
import {
  AVR_PROFILE, ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE,
} from './compile-targets.mjs';
import { createEsp32C3CircuitDraft } from './esp32c3-public-circuit.mjs';
import { C3_PUBLIC_PROJECT_SCHEMA, normalizeEsp32C3PublicProject } from './esp32c3-public-workbench.mjs';
import { createRp2040PicoCircuitDraft } from './rp2040-pico-circuit.mjs';
import { RP2040_PUBLIC_PROJECT_SCHEMA, normalizeRp2040PublicProject } from './rp2040-public-workbench.mjs';
import { createStm32CircuitDraft } from './stm32-public-circuit.mjs';
import { STM32_EDITABLE_PROJECT_SCHEMA, normalizeStm32PublicProject } from './stm32-public-workbench.mjs';

export const SUPPORTED_EXAMPLE_PACK_SCHEMA = 'intent-mcu-supported-example-pack@1';
export const SUPPORTED_EXAMPLE_FUNCTIONS = Object.freeze(['button', 'adc', 'pwm', 'serial']);

const picoSource = (level, marker) => `/* Intent MCU Simulator public RP2040 source v1 */
int main(void)
{
  intent_gpio0_output(${level ? 1 : 0}u);
  intent_uart0_text("${marker}");
  intent_halt();
}
`;

const profiles = Object.freeze({
  [RP2040_PROFILE]: Object.freeze([
    Object.freeze({ id: 'pico-led-on', name: 'GPIO0 on + UART', learn: 'Connect source level with two observed outputs.', try: 'Build, Run, then compare LED and UART0.', outcome: 'LED on · UART0: PICO LED ON', limits: 'Fixed GP0/UART0 grammar; no button, ADC or PWM.', level: true, marker: 'PICO LED ON' }),
    Object.freeze({ id: 'pico-led-off', name: 'GPIO0 off + UART', learn: 'Test the opposite output boundary.', try: 'Build, Run, then compare LED and UART0.', outcome: 'LED off · UART0: PICO LED OFF', limits: 'Fixed GP0/UART0 grammar; no button, ADC or PWM.', level: false, marker: 'PICO LED OFF' }),
  ]),
  [ESP32C3_PROFILE]: Object.freeze([
    Object.freeze({ id: 'c3-led-on', name: 'GPIO2 on + Serial', learn: 'Compare actual QEMU UART with the separate GPIO model.', try: 'Build flash, Run QEMU, then compare both panels.', outcome: 'Model LED on · QEMU UART: C3_LED_ON', limits: 'GPIO2 LED is a project model; QEMU pin state is not claimed.', level: true, marker: 'C3_LED_ON' }),
    Object.freeze({ id: 'c3-led-off', name: 'GPIO2 off + Serial', learn: 'Test the opposite model-output boundary.', try: 'Build flash, Run QEMU, then compare both panels.', outcome: 'Model LED off · QEMU UART: C3_LED_OFF', limits: 'No button, ADC or PWM; QEMU supplies CPU/UART evidence.', level: false, marker: 'C3_LED_OFF' }),
  ]),
  [STM32F429ZI_PROFILE]: Object.freeze([
    Object.freeze({ id: 'stm32-led-on', name: 'PB0 on + USART3', learn: 'Relate Renode-observed PB0 to USART3 output.', try: 'Build ELF, Run, then compare LED and terminal.', outcome: 'LED on · USART3: STM32 LED ON', limits: 'Fixed PB0/USART3 grammar; ideal teaching LED path.', level: true, marker: 'STM32 LED ON' }),
    Object.freeze({ id: 'stm32-led-off', name: 'PB0 off + USART3', learn: 'Test the opposite observed PB0 boundary.', try: 'Build ELF, Run, then compare LED and terminal.', outcome: 'LED off · USART3: STM32 LED OFF', limits: 'No button, ADC or PWM; no broad STM32 SDK.', level: false, marker: 'STM32 LED OFF' }),
  ]),
});

export const SUPPORTED_EXAMPLE_COVERAGE = Object.freeze({
  schema: SUPPORTED_EXAMPLE_PACK_SCHEMA,
  profiles: Object.freeze({
    [AVR_PROFILE]: Object.freeze({
      button: Object.freeze({ status: 'supported', examples: Object.freeze(['button', 'avr-thermostat-boundary-v1']) }),
      adc: Object.freeze({ status: 'supported', examples: Object.freeze(['adc', 'temperature-lcd-threshold', 'avr-thermostat-boundary-v1']) }),
      pwm: Object.freeze({ status: 'supported', examples: Object.freeze(['pwm', 'pwm-pulse']) }),
      serial: Object.freeze({ status: 'supported', examples: Object.freeze(['blink', 'button', 'adc', 'pwm', 'pwm-pulse']) }),
    }),
    [RP2040_PROFILE]: Object.freeze({
      button: Object.freeze({ status: 'unavailable', examples: Object.freeze([]) }),
      adc: Object.freeze({ status: 'unavailable', examples: Object.freeze([]) }),
      pwm: Object.freeze({ status: 'unavailable', examples: Object.freeze([]) }),
      serial: Object.freeze({ status: 'supported', examples: Object.freeze(['pico-led-on', 'pico-led-off']) }),
    }),
    [ESP32C3_PROFILE]: Object.freeze({
      button: Object.freeze({ status: 'unavailable', examples: Object.freeze([]) }),
      adc: Object.freeze({ status: 'unavailable', examples: Object.freeze([]) }),
      pwm: Object.freeze({ status: 'unavailable', examples: Object.freeze([]) }),
      serial: Object.freeze({ status: 'supported', examples: Object.freeze(['c3-led-on', 'c3-led-off']) }),
    }),
    [STM32F429ZI_PROFILE]: Object.freeze({
      button: Object.freeze({ status: 'unavailable', examples: Object.freeze([]) }),
      adc: Object.freeze({ status: 'unavailable', examples: Object.freeze([]) }),
      pwm: Object.freeze({ status: 'unavailable', examples: Object.freeze([]) }),
      serial: Object.freeze({ status: 'supported', examples: Object.freeze(['stm32-led-on', 'stm32-led-off']) }),
    }),
  }),
});

export function supportedProfileExamples(profile) {
  return (profiles[profile] ?? []).map((entry) => ({ ...entry }));
}

export function createSupportedProfileExample(profile, id) {
  const entry = profiles[profile]?.find((candidate) => candidate.id === id);
  if (!entry) throw new Error('SUPPORTED_EXAMPLE_UNKNOWN');
  if (profile === RP2040_PROFILE) return normalizeRp2040PublicProject({
    schema: RP2040_PUBLIC_PROJECT_SCHEMA, name: entry.name, profile,
    source: picoSource(entry.level, entry.marker), circuit: createRp2040PicoCircuitDraft(),
  });
  if (profile === ESP32C3_PROFILE) return normalizeEsp32C3PublicProject({
    schema: C3_PUBLIC_PROJECT_SCHEMA, name: entry.name, profile,
    source: sourceForGpio2(entry.marker, 'OUTPUT', entry.level ? 'HIGH' : 'LOW'),
    circuit: createEsp32C3CircuitDraft(),
  });
  if (profile === STM32F429ZI_PROFILE) return normalizeStm32PublicProject({
    schema: STM32_EDITABLE_PROJECT_SCHEMA, name: entry.name, profile,
    source: sourceForStm32(entry.marker, entry.level), circuit: createStm32CircuitDraft(),
  });
  throw new Error('SUPPORTED_EXAMPLE_PROFILE_UNAVAILABLE');
}
