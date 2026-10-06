// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export class StrictJsonError extends Error {
  constructor(code) {
    super(code);
    this.name = 'StrictJsonError';
    this.code = code;
  }
}

export function parseStrictJson(source, maximumBytes = 256 * 1024) {
  if (typeof source !== 'string' || new TextEncoder().encode(source).length > maximumBytes) {
    throw new StrictJsonError('INPUT_LIMIT');
  }
  let index = 0;
  const fail = (code = 'MALFORMED_JSON') => { throw new StrictJsonError(code); };
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
    if (number) {
      index += number[0].length;
      const parsed = Number(number[0]);
      if (!Number.isFinite(parsed)) fail('NON_FINITE_NUMBER');
      return parsed;
    }
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

export function exactKeys(value, expected) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, position) => key === wanted[position]);
}
