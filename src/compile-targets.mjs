// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const CANDIDATE_BUILD_REQUEST_SCHEMA = 'teach-lab-build-request@2';
export const TARGET_AVAILABILITY_SCHEMA = 'intent-mcu-compile-target-availability@1';
export const TARGET_AVAILABILITY_REVISION = 'public-release-rc3-20261016';
export const AVR_PROFILE = 'board.atmega328p-16mhz-v1';
export const ESP32C3_PROFILE = 'board.esp32-c3-devmodule-v1';
export const RP2040_PROFILE = 'board.rp2040-pico-v1';
export const STM32F429ZI_PROFILE = 'board.stm32f429zi-nucleo144-v1';
export const ESP32C3_FQBN = 'esp32:esp32:esp32c3';
export const ESP32C3_TOOLCHAIN_IDENTITY = '03ff5d53c17c721d494aeec34d223e2c2e0f0d1212543932d716e61f67db7b27';
export const ESP32C3_RUNTIME_REJECT_CODE = 'ADAPTER_EXECUTION_BLOCKED';
export const UNAVAILABLE_TARGET_REJECT_CODE = 'COMPILER_TARGET_UNAVAILABLE';

const availableState = (status, code, detail) => Object.freeze({ status, code, detail });
const availability = (profile, states) => Object.freeze({
  schema: TARGET_AVAILABILITY_SCHEMA,
  revision: TARGET_AVAILABILITY_REVISION,
  profile,
  installedCompiler: states.installedCompiler,
  verifiedCompileTarget: states.verifiedCompileTarget,
  emulatorRuntime: states.emulatorRuntime,
  validatedPeripherals: states.validatedPeripherals,
});

const avrAvailability = availability(AVR_PROFILE, {
  installedCompiler: availableState('installed', 'AVR_COMPILER_IMAGE_VERIFIED', 'The pinned AVR compiler image is installed and verified.'),
  verifiedCompileTarget: availableState('verified', 'AVR_COMPILE_TARGET_VERIFIED', 'The ATmega328P compile target is verified.'),
  emulatorRuntime: availableState('verified', 'AVR_RUNTIME_VERIFIED', 'The browser-worker AVR runtime is verified.'),
  validatedPeripherals: availableState('validated', 'AVR_PERIPHERALS_VALIDATED', 'The documented AVR peripheral subset is validated.'),
});
const c3Availability = availability(ESP32C3_PROFILE, {
  installedCompiler: availableState('private-verified', 'ESP32C3_COMPILER_PRIVATE_VERIFIED', 'The fixed compiler is verified privately and is not exposed by this public release.'),
  verifiedCompileTarget: availableState('private-verified', 'ESP32C3_TARGET_PRIVATE_VERIFIED', 'The exact C3 target is verified privately and is not a public build target.'),
  emulatorRuntime: availableState('private-proof', 'ESP32C3_QEMU_UART_PRIVATE_VERIFIED', 'Actual QEMU UART is verified privately; no public runtime endpoint is mounted.'),
  validatedPeripherals: availableState('private-uart-only', 'ESP32C3_UART_PRIVATE_ONLY', 'Only private UART text/reset/watchdog evidence exists; GPIO and wired peripherals are not validated.'),
});
const rp2040Availability = availability(RP2040_PROFILE, {
  installedCompiler: availableState('private-verified', 'RP2040_ARM_COMPILER_PRIVATE_VERIFIED', 'The fixed Arm compiler is verified privately and is not exposed by this public release.'),
  verifiedCompileTarget: availableState('private-verified', 'RP2040_BOUNDED_SOURCE_PRIVATE_VERIFIED', 'The bounded C11 source target and strict ELF/UF2 artifacts are verified privately.'),
  emulatorRuntime: availableState('private-proof', 'RP2040JS_PRIVATE_SOURCE_AND_FIXTURE_VERIFIED', 'Compiler-generated and retained precompiled firmware pass the bounded private rp2040js subset; no public runtime is mounted.'),
  validatedPeripherals: availableState('private-subset', 'RP2040_PRIVATE_SUBSET_VERIFIED', 'Private GPIO0/UART0 source evidence and bounded PWM/ADC0 fixture evidence exist only.'),
});
const stm32Availability = availability(STM32F429ZI_PROFILE, {
  installedCompiler: availableState('private-verified', 'STM32_ARM_COMPILER_PRIVATE_VERIFIED', 'The fixed Arm compiler is verified privately and is not exposed by this public release.'),
  verifiedCompileTarget: availableState('private-verified', 'STM32_BOUNDED_SOURCE_PRIVATE_VERIFIED', 'The bounded C11 source target and strict STM32F429ZI ELF are verified privately.'),
  emulatorRuntime: availableState('private-proof', 'STM32_RENODE_PRIVATE_SOURCE_AND_FIXTURE_VERIFIED', 'Compiler-generated and retained hash-pinned ELF paths pass private Renode acceptance; no public runtime is mounted.'),
  validatedPeripherals: availableState('private-subset', 'STM32_PRIVATE_SUBSET_VERIFIED', 'Only private PB0, USART3 and reset replay evidence exists.'),
});

function target(value) {
  return Object.freeze({ ...value, fixedBuildFlags: Object.freeze(value.fixedBuildFlags) });
}

export const CANDIDATE_COMPILER_TARGETS = Object.freeze({
  [AVR_PROFILE]: target({
    profile: AVR_PROFILE,
    displayName: 'ATmega328P · simulated',
    requestSchema: 'teach-lab-build-request@1',
    fqbn: 'arduino:avr:uno',
    toolchainIdentitySha256: '098e57cc2da7f46f0abea657a33473ef7c2a3c2f556152640fb4862ad4de53d2',
    compilerStatus: 'supported',
    runtimeStatus: 'simulated',
    compileAvailable: true,
    compileOnly: false,
    fixedBuildFlags: ['--fqbn=arduino:avr:uno', '--warnings=all', '--no-color'],
    availability: avrAvailability,
  }),
  [ESP32C3_PROFILE]: target({
    profile: ESP32C3_PROFILE,
    displayName: 'ESP32-C3 · public preview only',
    requestSchema: CANDIDATE_BUILD_REQUEST_SCHEMA,
    fqbn: ESP32C3_FQBN,
    toolchainIdentitySha256: ESP32C3_TOOLCHAIN_IDENTITY,
    compilerStatus: 'private-verified-public-disabled',
    runtimeStatus: 'private-uart-proof-public-disabled',
    compileAvailable: false,
    compileOnly: false,
    fixedBuildFlags: [
      '--fqbn=esp32:esp32:esp32c3', '--clean', '--no-color',
      'SOURCE_DATE_EPOCH=1791244800',
    ],
    availability: c3Availability,
  }),
  [RP2040_PROFILE]: target({
    profile: RP2040_PROFILE,
    displayName: 'RP2040 Pico · public preview only',
    requestSchema: null,
    fqbn: 'rp2040:rp2040:rpipico',
    toolchainIdentitySha256: null,
    compilerStatus: 'unavailable',
    runtimeStatus: 'unavailable',
    compileAvailable: false,
    compileOnly: false,
    fixedBuildFlags: [],
    availability: rp2040Availability,
  }),
  [STM32F429ZI_PROFILE]: target({
    profile: STM32F429ZI_PROFILE,
    displayName: 'STM32F429ZI · public preview only',
    requestSchema: null,
    fqbn: 'STMicroelectronics:stm32:Nucleo_144:pnum=NUCLEO_F429ZI',
    toolchainIdentitySha256: null,
    compilerStatus: 'unavailable',
    runtimeStatus: 'unavailable',
    compileAvailable: false,
    compileOnly: false,
    fixedBuildFlags: [],
    availability: stm32Availability,
  }),
});

export function candidateCompilerTarget(profile) {
  return CANDIDATE_COMPILER_TARGETS[profile] ?? null;
}

export function targetAvailabilitySnapshot(profile) {
  const current = candidateCompilerTarget(profile)?.availability;
  return current ? JSON.parse(JSON.stringify(current)) : null;
}

export function validateTargetAvailabilitySnapshot(value) {
  const current = value && candidateCompilerTarget(value.profile)?.availability;
  return Boolean(current && JSON.stringify(value) === JSON.stringify(current));
}

export function firstMissingTargetPrerequisite(profile) {
  const state = candidateCompilerTarget(profile)?.availability;
  if (!state) return null;
  return [state.installedCompiler, state.verifiedCompileTarget, state.emulatorRuntime, state.validatedPeripherals]
    .find((item) => ['missing', 'unverified', 'unvalidated'].includes(item.status)) ?? null;
}
