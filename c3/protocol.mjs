// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0

export const EDITOR_SCHEMA = 'intent-mcu-esp32c3-public-editor@1';
export const BUILD_SCHEMA = 'intent-mcu-esp32c3-public-build@1';
export const COMMAND_SCHEMA = 'intent-mcu-esp32c3-public-command@1';
export const PROFILE = 'board.esp32-c3-devmodule-v1';
export const FQBN = 'esp32:esp32:esp32c3:FlashMode=dio';
export const TOOLCHAIN_IDENTITY =
  'arduino-cli-1.5.1+arduino-esp32-3.3.10+esp-idf-5.5.4+esp-rv32-2601+dio';
export const SOURCE_MAX_BYTES = 4096;
export const MARKER_PATTERN = /^[A-Z0-9][A-Z0-9:_-]{2,63}$/u;

const SOURCE_PATTERN = /^\/\/ Copyright 2026 IntentForce\n\/\/ SPDX-License-Identifier: Apache-2\.0\n\nvoid setup\(\) \{\n  Serial\.begin\(115200\);\n  pinMode\(2, (OUTPUT|INPUT)\);\n  digitalWrite\(2, (HIGH|LOW)\);\n  Serial\.println\("([A-Z0-9][A-Z0-9:_-]{2,63})"\);\n\}\n\nvoid loop\(\) \{\n  delay\(1000\);\n\}\n?$/u;

export function sourceForGpio2(marker, mode = 'OUTPUT', level = 'HIGH') {
  if (!MARKER_PATTERN.test(marker) || !['OUTPUT', 'INPUT'].includes(mode)
    || !['HIGH', 'LOW'].includes(level)) throw fault('SOURCE_POLICY_REJECTED');
  return `// Copyright 2026 IntentForce\n// SPDX-License-Identifier: Apache-2.0\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(2, ${mode});\n  digitalWrite(2, ${level});\n  Serial.println("${marker}");\n}\n\nvoid loop() {\n  delay(1000);\n}\n`;
}

export function validateBoundedSource(value) {
  if (typeof value !== 'string' || value.includes('\0')
    || new TextEncoder().encode(value).length > SOURCE_MAX_BYTES) {
    throw fault('SOURCE_POLICY_REJECTED');
  }
  const normalized = value.normalize('NFC').replace(/\r\n?/gu, '\n');
  const match = SOURCE_PATTERN.exec(normalized);
  if (!match) throw fault('SOURCE_POLICY_REJECTED');
  return Object.freeze({
    source: normalized.endsWith('\n') ? normalized : `${normalized}\n`,
    gpio: match[1] ? Object.freeze({ pin: 2, mode: match[1], level: match[2] }) : null,
    marker: match[3],
  });
}

export function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

export function fault(code, status = 400, retryAfterSeconds = null) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  error.retryAfterSeconds = retryAfterSeconds;
  return error;
}
