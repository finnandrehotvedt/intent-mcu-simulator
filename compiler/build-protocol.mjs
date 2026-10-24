// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import {
  CANDIDATE_BUILD_REQUEST_SCHEMA,
  candidateCompilerTarget,
  validateCandidateTarget,
  validateUnavailableCandidateTarget,
} from './candidate-target-contract.mjs';
import { BUILD_LIMITS } from '../src/build-limits.mjs';

export { BUILD_LIMITS } from '../src/build-limits.mjs';

export const BUILD_REQUEST_SCHEMA = 'teach-lab-build-request@1';
export const RP2040_BUILD_REQUEST_SCHEMA = 'intent-mcu-rp2040-source-build-request@1';
export const WORKER_JOB_SCHEMA = 'teach-lab-worker-job@1';
export const BOARD_PROFILE = 'board.atmega328p-16mhz-v1';
export const RP2040_BOARD_PROFILE = 'board.rp2040-pico-v1';
export const FIXED_BUILD_FLAGS = Object.freeze([
  '--fqbn=arduino:avr:uno',
  '--warnings=all',
  '--no-color',
]);
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const FILE_NAME = /^(?:main\.ino|[A-Za-z][A-Za-z0-9_-]{0,47}\.(?:h|hpp|c|cpp))$/;
const RP2040_CONSTANT_SOURCE_PATTERN = /^\/\* Intent MCU Simulator public RP2040 source v1 \*\/\nint main\(void\)\n\{\n  intent_gpio0_output\(([01])u\);\n  intent_uart0_text\("([A-Z0-9 _-]{1,24})"\);\n  intent_halt\(\);\n\}\n$/u;
const RP2040_X37_REFLECT_SOURCE = `/* Intent MCU Simulator private X37 RP2040 reflect source v1 */
int main(void)
{
  intent_gpio0_reflect_gpio1_4096();
  intent_uart0_text("X37 REFLECT");
  intent_halt();
}
`;
const RP2040_X37_TURNAROUND_SOURCE = `/* Intent MCU Simulator private X37 RP2040 turnaround source v1 */
int main(void)
{
  intent_x37_turnaround_8192();
  intent_uart0_text("X37 TURNAROUND");
  intent_halt();
}
`;
const validRp2040Source = (source) => RP2040_CONSTANT_SOURCE_PATTERN.test(source)
  || source === RP2040_X37_REFLECT_SOURCE || source === RP2040_X37_TURNAROUND_SOURCE;
const INCLUDE_DIRECTIVE = /^\s*#\s*(include|include_next)\s+(.+?)\s*$/gm;
const COMMON_SYSTEM_HEADERS = new Set([
  'Arduino.h', 'stdint.h', 'stddef.h', 'stdbool.h', 'stdint.h', 'limits.h',
  'math.h', 'string.h', 'stdlib.h',
]);
const AVR_SYSTEM_HEADERS = new Set([
  ...COMMON_SYSTEM_HEADERS, 'avr/io.h', 'avr/interrupt.h', 'avr/pgmspace.h',
  'util/atomic.h', 'util/delay.h',
]);

export class BuildProtocolError extends Error {
  constructor(code, message = code, httpStatus = 400, retryAfterSeconds = null) {
    super(message);
    this.name = 'BuildProtocolError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function ownObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, expected) {
  if (!ownObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

export function parseStrictJson(source) {
  if (typeof source !== 'string') throw new BuildProtocolError('MALFORMED_JSON');
  let index = 0;
  const fail = (code = 'MALFORMED_JSON') => { throw new BuildProtocolError(code); };
  const whitespace = () => { while (/\s/.test(source[index] || '')) index += 1; };
  const string = () => {
    if (source[index] !== '"') fail();
    const start = index++;
    while (index < source.length) {
      const character = source[index];
      if (character === '"') {
        index += 1;
        try { return JSON.parse(source.slice(start, index)); } catch { fail(); }
      }
      if (character === '\\') {
        index += 1;
        if (source[index] === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(source.slice(index + 1, index + 5))) fail();
          index += 5;
        } else {
          if (!/["\\/bfnrt]/.test(source[index] || '')) fail();
          index += 1;
        }
      } else {
        if (character.charCodeAt(0) < 0x20) fail();
        index += 1;
      }
    }
    fail();
  };
  const value = () => {
    whitespace();
    const character = source[index];
    if (character === '"') return string();
    if (character === '{') {
      index += 1;
      whitespace();
      const output = Object.create(null);
      const seen = new Set();
      if (source[index] === '}') { index += 1; return {}; }
      while (index < source.length) {
        whitespace();
        const key = string();
        if (FORBIDDEN_KEYS.has(key)) fail('FORBIDDEN_KEY');
        if (seen.has(key)) fail('DUPLICATE_KEY');
        seen.add(key);
        whitespace();
        if (source[index] !== ':') fail();
        index += 1;
        output[key] = value();
        whitespace();
        if (source[index] === '}') { index += 1; return Object.assign({}, output); }
        if (source[index] !== ',') fail();
        index += 1;
      }
      fail();
    }
    if (character === '[') {
      index += 1;
      whitespace();
      const output = [];
      if (source[index] === ']') { index += 1; return output; }
      while (index < source.length) {
        output.push(value());
        whitespace();
        if (source[index] === ']') { index += 1; return output; }
        if (source[index] !== ',') fail();
        index += 1;
      }
      fail();
    }
    const rest = source.slice(index);
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
    if (number) { index += number[0].length; return Number(number[0]); }
    for (const [token, output] of [['true', true], ['false', false], ['null', null]]) {
      if (rest.startsWith(token)) { index += token.length; return output; }
    }
    fail();
  };
  const output = value();
  whitespace();
  if (index !== source.length) fail();
  return output;
}

function validateIncludes(files, board) {
  const allowedSystemHeaders = board === BOARD_PROFILE ? AVR_SYSTEM_HEADERS : COMMON_SYSTEM_HEADERS;
  const localNames = new Set(files.map((file) => file.name));
  for (const file of files) {
    for (const match of file.content.matchAll(INCLUDE_DIRECTIVE)) {
      if (match[1] !== 'include') throw new BuildProtocolError('UNSUPPORTED_INCLUDE', `Unsupported include directive in ${file.name}`);
      const operand = match[2].replace(/\s*\/\/.*$/, '').trim();
      const local = /^"([^"]+)"$/.exec(operand);
      const system = /^<([^>]+)>$/.exec(operand);
      if (local) {
        const target = local[1];
        if (!FILE_NAME.test(target) || target === 'main.ino' || !localNames.has(target)) {
          throw new BuildProtocolError('UNSUPPORTED_INCLUDE', `Unsupported local include in ${file.name}`);
        }
      } else if (system) {
        if (!allowedSystemHeaders.has(system[1])) {
          throw new BuildProtocolError('UNSUPPORTED_INCLUDE', `Unsupported system include in ${file.name}`);
        }
      } else {
        throw new BuildProtocolError('UNSUPPORTED_INCLUDE', `Unsupported local include in ${file.name}`);
      }
    }
  }
}

function hasUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

export function normalizeBuildRequestValue(value) {
  let board;
  let target = null;
  if (value?.schema === BUILD_REQUEST_SCHEMA) {
    if (!exactKeys(value, ['schema', 'board', 'files'])) throw new BuildProtocolError('REQUEST_SHAPE');
    if (value.board !== BOARD_PROFILE) throw new BuildProtocolError('UNKNOWN_BOARD_PROFILE');
    board = value.board;
  } else if (value?.schema === RP2040_BUILD_REQUEST_SCHEMA) {
    if (!exactKeys(value, ['schema', 'board', 'files'])) throw new BuildProtocolError('REQUEST_SHAPE');
    if (value.board !== RP2040_BOARD_PROFILE) throw new BuildProtocolError('UNKNOWN_BOARD_PROFILE');
    board = value.board;
  } else if (value?.schema === CANDIDATE_BUILD_REQUEST_SCHEMA) {
    if (!exactKeys(value, ['schema', 'target', 'files'])) throw new BuildProtocolError('REQUEST_SHAPE');
    target = validateCandidateTarget(value.target);
    if (!target) {
      const unavailable = validateUnavailableCandidateTarget(value.target);
      if (unavailable) throw new BuildProtocolError(
        'COMPILER_TARGET_UNAVAILABLE',
        unavailable.availability.installedCompiler.detail,
      );
      throw new BuildProtocolError('UNKNOWN_COMPILER_TARGET');
    }
    board = target.profile;
  } else {
    throw new BuildProtocolError('UNKNOWN_BUILD_SCHEMA');
  }
  if (!Array.isArray(value.files) || value.files.length < 1 || value.files.length > BUILD_LIMITS.files) {
    throw new BuildProtocolError('FILE_LIMIT');
  }
  const seen = new Set();
  let sourceBytes = 0;
  const files = value.files.map((file) => {
    if (!exactKeys(file, ['name', 'content']) || typeof file.name !== 'string' || typeof file.content !== 'string') {
      throw new BuildProtocolError('FILE_SHAPE');
    }
    if (!FILE_NAME.test(file.name) || seen.has(file.name.toLowerCase())) throw new BuildProtocolError('INVALID_FILE_NAME');
    seen.add(file.name.toLowerCase());
    if (file.content.includes('\u0000') || hasUnpairedSurrogate(file.content)) throw new BuildProtocolError('INVALID_SOURCE_TEXT');
    const content = file.content.normalize('NFC').replace(/\r\n?/g, '\n');
    sourceBytes += Buffer.byteLength(content, 'utf8');
    return Object.freeze({ name: file.name, content });
  });
  if (board === RP2040_BOARD_PROFILE) {
    if (files.length !== 1 || files[0].name !== 'main.c') throw new BuildProtocolError('RP2040_MAIN_FILE_REQUIRED');
    if (sourceBytes > 4096) throw new BuildProtocolError('SOURCE_LIMIT');
    if (!validRp2040Source(files[0].content)) {
      throw new BuildProtocolError('SOURCE_POLICY_REJECTED', 'Use one exact bounded Pico source form.');
    }
  } else if (!seen.has('main.ino')) throw new BuildProtocolError('MAIN_FILE_REQUIRED');
  if (sourceBytes > BUILD_LIMITS.sourceBytes) throw new BuildProtocolError('SOURCE_LIMIT');
  files.sort((a, b) => a.name === 'main.ino' ? -1 : b.name === 'main.ino' ? 1 : a.name.localeCompare(b.name));
  validateIncludes(files, board);
  const normalized = {
    schema: value.schema,
    board,
    files: Object.freeze(files),
    sourceBytes,
  };
  if (target) {
    normalized.fqbn = target.fqbn;
    normalized.toolchainIdentitySha256 = target.toolchainIdentitySha256;
  }
  return Object.freeze(normalized);
}

export function parseAndNormalizeBuildRequest(raw) {
  if (Buffer.byteLength(raw, 'utf8') > BUILD_LIMITS.requestBytes) {
    throw new BuildProtocolError('REQUEST_LIMIT', 'Build request is too large', 413);
  }
  return normalizeBuildRequestValue(parseStrictJson(raw));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalSourceBytes(request) {
  const files = request.files.map(({ name, content }) => ({ name, content }));
  return Buffer.from(JSON.stringify(request.schema === CANDIDATE_BUILD_REQUEST_SCHEMA ? {
    schema: request.schema,
    target: {
      profile: request.board,
      fqbn: request.fqbn,
      toolchainIdentitySha256: request.toolchainIdentitySha256,
    },
    files,
  } : { schema: request.schema, board: request.board, files }));
}

export function sourceDigest(request) {
  return sha256(canonicalSourceBytes(request));
}

export function buildInputIdentity(request, imageLock) {
  const target = candidateCompilerTarget(request.board);
  return sha256(JSON.stringify({
    sourceDigest: sourceDigest(request),
    board: request.board,
    toolchainManifestSha256: imageLock.toolchainManifestSha256,
    toolchainImageId: imageLock.imageId,
    fixedBuildFlags: target?.fixedBuildFlags ?? FIXED_BUILD_FLAGS,
  }));
}
