// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const CANDIDATE_BUILD_REQUEST_SCHEMA = 'teach-lab-build-request@2';
export const TARGET_AVAILABILITY_SCHEMA = 'intent-mcu-compile-target-availability@1';
export const TARGET_AVAILABILITY_REVISION = 'public-release-rc6-20261016';
export const AVR_PROFILE = 'board.atmega328p-16mhz-v1';
export const ESP32C3_PROFILE = 'board.esp32-c3-devmodule-v1';
export const RP2040_PROFILE = 'board.rp2040-pico-v1';
export const STM32F429ZI_PROFILE = 'board.stm32f429zi-nucleo144-v1';
export const ESP32C3_FQBN = 'esp32:esp32:esp32c3:FlashMode=dio';
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
  installedCompiler: availableState('installed', 'ESP32C3_FIXED_COMPILER_IMAGE_VERIFIED', 'The Arduino-ESP32 3.3.10 and esp-rv32 2601 compiler image is installed and identity-pinned.'),
  verifiedCompileTarget: availableState('verified-bounded', 'ESP32C3_BOUNDED_SOURCE_PUBLIC_VERIFIED', 'One strict GPIO2 and UART marker source grammar builds a source-bound DIO flash image.'),
  emulatorRuntime: availableState('verified', 'ESP32C3_QEMU_CPU_UART_PUBLIC_VERIFIED', 'The compiled flash executes on actual Espressif QEMU esp32c3 CPU/UART with reset replay.'),
  validatedPeripherals: availableState('project-model', 'ESP32C3_GPIO2_PROJECT_MODEL_VERIFIED', 'Executed GPIO2 MMIO writes feed a separate IntentForce register and LED model; QEMU pin state is not observed.'),
});
const rp2040Availability = availability(RP2040_PROFILE, {
  installedCompiler: availableState('installed', 'RP2040_ARM_COMPILER_IMAGE_VERIFIED', 'The fixed Arm GNU 14.3.1 compiler image is installed and identity-pinned.'),
  verifiedCompileTarget: availableState('verified', 'RP2040_BOUNDED_SOURCE_PUBLIC_VERIFIED', 'The exact bounded C11 source grammar produces strict source-bound UF2 artifacts.'),
  emulatorRuntime: availableState('verified', 'RP2040JS_PUBLIC_WORKER_VERIFIED', 'Compiler-generated UF2 executes in the pinned browser-worker RP2040 subset.'),
  validatedPeripherals: availableState('validated-subset', 'RP2040_PUBLIC_GPIO0_UART0_SUBSET', 'GPIO0 output, UART0 text, reset and the GP0-to-LED circuit path are validated.'),
});
const stm32Availability = availability(STM32F429ZI_PROFILE, {
  installedCompiler: availableState('installed', 'STM32_ARM_COMPILER_IMAGE_VERIFIED', 'The fixed Arm GNU 14.3.1 compiler image is installed and identity-pinned.'),
  verifiedCompileTarget: availableState('verified-bounded', 'STM32_BOUNDED_SOURCE_PUBLIC_VERIFIED', 'One strict PB0 and USART3 source grammar produces a source-bound strict ELF32 artifact.'),
  emulatorRuntime: availableState('verified', 'STM32_RENODE_PUBLIC_VERIFIED', 'The compiler-generated ELF executes in actual Renode 1.17.0 with reset replay.'),
  validatedPeripherals: availableState('validated-subset', 'STM32_PB0_USART3_PUBLIC_SUBSET', 'PB0 output and USART3 text are observed in Renode; the external LED is an ideal teaching rendering.'),
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
    displayName: 'ESP32-C3 · bounded public source + QEMU',
    requestSchema: null,
    fqbn: ESP32C3_FQBN,
    toolchainIdentitySha256: ESP32C3_TOOLCHAIN_IDENTITY,
    compilerStatus: 'supported-bounded-source',
    runtimeStatus: 'actual-espressif-qemu-cpu-uart-plus-project-gpio2-model',
    compileAvailable: true,
    compileOnly: false,
    fixedBuildFlags: [
      '--fqbn=esp32:esp32:esp32c3:FlashMode=dio', '--clean', '--no-color',
      'SOURCE_DATE_EPOCH=1791244800',
    ],
    availability: c3Availability,
  }),
  [RP2040_PROFILE]: target({
    profile: RP2040_PROFILE,
    displayName: 'RP2040 Pico · bounded public source + run',
    requestSchema: 'intent-mcu-rp2040-source-build-request@1',
    fqbn: 'intent:rp2040:pico-bounded-c11',
    toolchainIdentitySha256: '8f6903f8ceb084d9227b9ef991490413014d991874a1e34074443c2a72b14dbd',
    compilerStatus: 'supported-bounded-source',
    runtimeStatus: 'simulated-browser-worker-subset',
    compileAvailable: true,
    compileOnly: false,
    fixedBuildFlags: ['-mcpu=cortex-m0plus', '-mthumb', '-ffreestanding', '-Os', '-nostdlib', 'fixed-project-contract'],
    availability: rp2040Availability,
  }),
  [STM32F429ZI_PROFILE]: target({
    profile: STM32F429ZI_PROFILE,
    displayName: 'STM32F429ZI · bounded public source + actual Renode',
    requestSchema: 'intent-mcu-stm32-public-build-request@1',
    fqbn: 'intent:stm32f429zi:bounded-c11',
    toolchainIdentitySha256: '8f6903f8ceb084d9227b9ef991490413014d991874a1e34074443c2a72b14dbd',
    compilerStatus: 'supported-bounded-source',
    runtimeStatus: 'actual-renode-pb0-usart3-reset-replay',
    compileAvailable: true,
    compileOnly: false,
    fixedBuildFlags: ['-mcpu=cortex-m4', '-mthumb', '-mfloat-abi=soft', '-ffreestanding', '-Os', '-nostdlib', 'fixed-project-contract'],
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
