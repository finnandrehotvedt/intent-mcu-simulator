// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';

export const BUILD_REQUEST_SCHEMA = 'teach-lab-build-request@1';
export const WORKER_JOB_SCHEMA = 'teach-lab-worker-job@1';
export const BOARD_PROFILE = 'board.atmega328p-16mhz-v1';
export const FIXED_BUILD_FLAGS = Object.freeze([
  '--fqbn=arduino:avr:uno',
  '--warnings=all',
  '--no-color',
]);
export const BUILD_LIMITS = Object.freeze({
  files: 8,
  sourceBytes: 128 * 1024,
  requestBytes: 160 * 1024,
  diagnosticsBytes: 1024 * 1024,
  outputBytes: 1024 * 1024,
});

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const FILE_NAME = /^(?:main\.ino|[A-Za-z][A-Za-z0-9_-]{0,47}\.(?:h|hpp|c|cpp))$/;
const INCLUDE_DIRECTIVE = /^\s*#\s*(include|include_next)\s+(.+?)\s*$/gm;
const ALLOWED_SYSTEM_HEADERS = new Set([
  'Arduino.h', 'stdint.h', 'stddef.h', 'stdbool.h', 'stdint.h', 'limits.h',
  'math.h', 'string.h', 'stdlib.h', 'avr/io.h', 'avr/interrupt.h',
  'avr/pgmspace.h', 'util/atomic.h', 'util/delay.h',
]);

export class BuildProtocolError extends Error {
  constructor(code, message = code, httpStatus = 400) {
    super(message);
    this.name = 'BuildProtocolError';
    this.code = code;
    this.httpStatus = httpStatus;
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

function validateIncludes(files) {
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
        if (!ALLOWED_SYSTEM_HEADERS.has(system[1])) {
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
  if (!exactKeys(value, ['schema', 'board', 'files'])) throw new BuildProtocolError('REQUEST_SHAPE');
  if (value.schema !== BUILD_REQUEST_SCHEMA) throw new BuildProtocolError('UNKNOWN_BUILD_SCHEMA');
  if (value.board !== BOARD_PROFILE) throw new BuildProtocolError('UNKNOWN_BOARD_PROFILE');
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
  if (!seen.has('main.ino')) throw new BuildProtocolError('MAIN_FILE_REQUIRED');
  if (sourceBytes > BUILD_LIMITS.sourceBytes) throw new BuildProtocolError('SOURCE_LIMIT');
  files.sort((a, b) => a.name === 'main.ino' ? -1 : b.name === 'main.ino' ? 1 : a.name.localeCompare(b.name));
  validateIncludes(files);
  return Object.freeze({
    schema: BUILD_REQUEST_SCHEMA,
    board: BOARD_PROFILE,
    files: Object.freeze(files),
    sourceBytes,
  });
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
  return Buffer.from(JSON.stringify({
    schema: request.schema,
    board: request.board,
    files: request.files.map(({ name, content }) => ({ name, content })),
  }));
}

export function sourceDigest(request) {
  return sha256(canonicalSourceBytes(request));
}

export function buildInputIdentity(request, imageLock) {
  return sha256(JSON.stringify({
    sourceDigest: sourceDigest(request),
    board: request.board,
    toolchainManifestSha256: imageLock.toolchainManifestSha256,
    toolchainImageId: imageLock.imageId,
    fixedBuildFlags: FIXED_BUILD_FLAGS,
  }));
}
