// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0

export const STM32_PROFILE = 'board.stm32f429zi-nucleo144-v1';
export const STM32_BUILD_SCHEMA = 'intent-mcu-stm32-public-build-request@1';
export const STM32_BUILD_RESPONSE_SCHEMA = 'intent-mcu-stm32-public-build-response@1';
export const STM32_RUN_SCHEMA = 'intent-mcu-stm32-public-run-request@1';
export const STM32_RUN_RESPONSE_SCHEMA = 'intent-mcu-stm32-public-run-response@1';
export const STM32_PROJECT_SCHEMA = 'intent-mcu-stm32-public-project@1';
export const STM32_SOURCE_LIMIT = 4096;
export const STM32_ELF_LIMIT = 48 * 1024;

const SOURCE_PATTERN = /^\/\* Intent MCU Simulator public STM32F429 source v1 \*\/\nint main\(void\)\n\{\n  intent_pb0_output\(([01])u\);\n  intent_usart3_text\("([A-Z0-9 _-]{1,24})"\);\n  intent_halt\(\);\n\}\n$/u;

export function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

export function fault(code, httpStatus = 400, detail = '', retryAfterSeconds = null) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  error.httpStatus = httpStatus;
  error.retryAfterSeconds = retryAfterSeconds;
  return error;
}

export function validateStm32Source(source) {
  if (typeof source !== 'string') throw fault('SOURCE_INPUT_INVALID');
  const bytes = new TextEncoder().encode(source).byteLength;
  if (bytes < 1 || bytes > STM32_SOURCE_LIMIT || !source.endsWith('\n')
    || /[^\x09\x0a\x20-\x7e]/u.test(source)) throw fault('SOURCE_INPUT_INVALID');
  const match = SOURCE_PATTERN.exec(source);
  if (!match) throw fault('SOURCE_POLICY_REJECTED', 422);
  return Object.freeze({
    source,
    bytes,
    pb0: match[1] === '1',
    marker: match[2],
    uartText: `${match[2]}\n`,
  });
}

export function sourceForStm32(marker = 'STM32 PUBLIC', pb0 = true) {
  if (typeof pb0 !== 'boolean' || typeof marker !== 'string'
    || !/^[A-Z0-9 _-]{1,24}$/u.test(marker)) throw fault('SOURCE_INPUT_INVALID');
  return `/* Intent MCU Simulator public STM32F429 source v1 */\nint main(void)\n{\n  intent_pb0_output(${pb0 ? 1 : 0}u);\n  intent_usart3_text("${marker}");\n  intent_halt();\n}\n`;
}
