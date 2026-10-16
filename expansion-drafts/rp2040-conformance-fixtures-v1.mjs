export const RP2040_FIXTURE_SCHEMA = 'intent-mcu-rp2040-conformance-fixture@1';
export const RP2040_FIXTURE_PROFILE = 'board.rp2040-pico-v1';
export const RP2040_FLASH_START = 0x10000000;

export const RP2040_GPIO_UART_SOURCE = `
.syntax unified
.thumb
.global _start
_start:
  ldr r0, =IO_BANK0_GPIO25_CTRL
  ldr r1, =FUNCTION_SIO
  str r1, [r0]
  ldr r0, =SIO_GPIO_OE_SET
  ldr r1, =GPIO25_MASK
  str r1, [r0]
  ldr r0, =SIO_GPIO_OUT_SET
  str r1, [r0]
  ldr r0, =UART0_CR
  ldr r1, =UART_ENABLE_TX_RX
  str r1, [r0]
  ldr r0, =UART0_DR
  ldr r1, =BOOT_BYTE_R
  str r1, [r0]
echo:
  ldr r0, =UART0_FR
  ldr r1, [r0]
  ldr r2, =UART_RX_EMPTY
  ands r1, r2
  bne echo
  ldr r0, =UART0_DR
  ldr r1, [r0]
  str r1, [r0]
  b echo
`;

export const RP2040_UNSUPPORTED_PIO_SOURCE = `
.syntax unified
.thumb
.global _start
_start:
  ldr r0, =PIO0_CTRL
  ldr r1, =ENABLE_STATE_MACHINE_ZERO
  str r1, [r0]
halt:
  b halt
`;

export const RP2040_PWM_ADC_UART_SOURCE = `
.syntax unified
.thumb
.global _start
_start:
  ldr r0, =IO_BANK0_GPIO0_CTRL
  movs r1, #FUNCTION_PWM
  str r1, [r0]
  ldr r0, =PWM_CH0_DIV
  movs r1, #DIV_1_0
  str r1, [r0]
  ldr r0, =PWM_CH0_CC
  ldr r1, =COMPARE_50
  str r1, [r0]
  ldr r0, =PWM_CH0_TOP
  movs r1, #TOP_99
  str r1, [r0]
  ldr r0, =PWM_CH0_CSR
  movs r1, #ENABLE
  str r1, [r0]
  ldr r0, =UART0_CR
  ldr r1, =UART_ENABLE_TX_RX
  str r1, [r0]
wait_trigger:
  ldr r0, =UART0_FR
  ldr r1, [r0]
  movs r2, #UART_RX_EMPTY
  ands r1, r2
  bne wait_trigger
  ldr r0, =UART0_DR
  ldr r1, [r0]
  ldr r0, =ADC_CS
  movs r1, #ADC_ENABLE_START_ONCE
  str r1, [r0]
wait_adc:
  ldr r1, [r0]
  lsrs r1, r1, #8
  beq wait_adc
  ldr r0, =ADC_RESULT
  ldr r1, [r0]
  ldr r0, =UART0_DR
  movs r2, #ADC_PREFIX_A
  str r2, [r0]
  str r1, [r0]
  lsrs r1, r1, #8
  str r1, [r0]
  b wait_trigger
`;

const FIXTURES = Object.freeze({
  'gpio-uart-echo': {
    source: RP2040_GPIO_UART_SOURCE,
    capabilities: ['gpio-output', 'uart0-tx', 'uart0-rx-echo'],
    words: [
      0x480b, 0x490c, 0x6001, 0x480c, 0x490c, 0x6001, 0x480c, 0x6001,
      0x480c, 0x490d, 0x6001, 0x480d, 0x490d, 0x6001, 0x480d, 0x6801,
      0x4a0d, 0x4011, 0xd1fa, 0x480d, 0x6801, 0x6001, 0xe7f6, 0xbf00,
    ],
    literals: [
      0x400140cc, 0x00000005, 0xd0000024, 0x02000000,
      0xd0000014, 0x40034030, 0x00000301, 0x40034000,
      0x00000052, 0x40034018, 0x00000010, 0x40034000,
    ],
  },
  'unsupported-pio-write': {
    source: RP2040_UNSUPPORTED_PIO_SOURCE,
    capabilities: ['unsupported-pio-write'],
    words: [0x4801, 0x4902, 0x6001, 0xe7fe],
    literals: [0x50200000, 0x00000001],
  },
  'pwm-adc-uart': {
    source: RP2040_PWM_ADC_UART_SOURCE,
    capabilities: ['gpio0-pwm', 'adc0-12bit', 'uart0-adc-bytes'],
    words: [
      0x4813, 0x2104, 0x6001, 0x4813, 0x2110, 0x6001, 0x4812, 0x4913,
      0x6001, 0x4813, 0x2163, 0x6001, 0x4812, 0x2101, 0x6001, 0x4812,
      0x4912, 0x6001, 0x4812, 0x6801, 0x2210, 0x4011, 0xd1fa, 0x4811,
      0x6801, 0x4811, 0x2105, 0x6001, 0x6801, 0x0a09, 0xd0fc, 0x480f,
      0x6801, 0x480c, 0x2241, 0x6002, 0x6001, 0x0a09, 0x6001, 0xe7e9,
    ],
    literals: [
      0x40014004, 0x40050004, 0x4005000c, 0x00000032,
      0x40050010, 0x40050000, 0x40034030, 0x00000301,
      0x40034018, 0x40034000, 0x4004c000, 0x4004c004,
    ],
  },
});

function assemble(words, literals) {
  const codeBytes = words.length * 2;
  const literalOffset = Math.ceil(codeBytes / 4) * 4;
  const image = new Uint8Array(literalOffset + literals.length * 4);
  const view = new DataView(image.buffer);
  words.forEach((word, index) => view.setUint16(index * 2, word, true));
  literals.forEach((word, index) => view.setUint32(literalOffset + index * 4, word >>> 0, true));
  return image;
}

async function sha256(value) {
  if (!globalThis.crypto?.subtle) throw new Error('RUNTIME_ENGINE_UNAVAILABLE');
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

async function createDescriptor(id, image) {
  const fixture = FIXTURES[id];
  if (!fixture) throw new Error('RUNTIME_ARTIFACT_INVALID');
  const identity = {
    schema: RP2040_FIXTURE_SCHEMA,
    profile: RP2040_FIXTURE_PROFILE,
    architecture: 'armv6m',
    mcuVariant: 'RP2040',
    fixtureId: id,
    purpose: 'private-cpu-emulator-conformance-only',
    source: {
      language: 'armv6m-thumb-assembly-subset',
      origin: 'project-owned-original',
      license: 'Apache-2.0',
      sha256: await sha256(fixture.source),
    },
    assembler: {
      id: 'intent-mcu-thumb-fixture-assembler',
      version: '1.0.0',
      deterministic: true,
    },
    executable: {
      format: 'raw-flash-conformance-image',
      loadAddress: RP2040_FLASH_START,
      entryPoint: RP2040_FLASH_START,
      bytes: image.byteLength,
      sha256: await sha256(image),
    },
    fixtureCapabilities: fixture.capabilities,
  };
  return deepFreeze({
    ...identity,
    artifactIdentitySha256: await sha256(JSON.stringify(identity)),
  });
}

export async function createRp2040ConformanceFixture(id = 'gpio-uart-echo') {
  const fixture = FIXTURES[id];
  if (!fixture) throw new Error('RUNTIME_ARTIFACT_INVALID');
  const image = assemble(fixture.words, fixture.literals);
  return { descriptor: await createDescriptor(id, image), image };
}

export async function validateRp2040ConformanceFixture(descriptor, image) {
  if (!(image instanceof Uint8Array) || !FIXTURES[descriptor?.fixtureId]) return false;
  const expected = await createRp2040ConformanceFixture(descriptor.fixtureId);
  if (expected.image.byteLength !== image.byteLength
    || expected.image.some((byte, index) => byte !== image[index])) return false;
  return JSON.stringify(expected.descriptor) === JSON.stringify(descriptor);
}
