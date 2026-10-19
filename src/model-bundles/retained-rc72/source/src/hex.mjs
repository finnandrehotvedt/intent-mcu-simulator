// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const HEX_BYTE = /^[0-9A-Fa-f]{2}$/;

function readByte(text, offset) {
  const pair = text.slice(offset, offset + 2);
  if (!HEX_BYTE.test(pair)) throw new Error(`Invalid HEX byte at column ${offset + 1}`);
  return Number.parseInt(pair, 16);
}

export function parseIntelHex(text, flashBytes = 32 * 1024) {
  const flash = new Uint8Array(flashBytes);
  flash.fill(0xff);
  let upperAddress = 0;
  let eof = false;

  for (const [lineIndex, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    if (eof) throw new Error(`HEX data follows EOF at line ${lineIndex + 1}`);
    if (line[0] !== ':' || line.length < 11 || line.length % 2 !== 1) {
      throw new Error(`Malformed Intel HEX record at line ${lineIndex + 1}`);
    }
    const count = readByte(line, 1);
    const address = (readByte(line, 3) << 8) | readByte(line, 5);
    const type = readByte(line, 7);
    if (line.length !== 11 + count * 2) {
      throw new Error(`Intel HEX length mismatch at line ${lineIndex + 1}`);
    }
    let checksum = count + (address >> 8) + (address & 0xff) + type;
    const data = [];
    for (let i = 0; i < count; i++) {
      const value = readByte(line, 9 + i * 2);
      data.push(value);
      checksum += value;
    }
    checksum += readByte(line, 9 + count * 2);
    if ((checksum & 0xff) !== 0) throw new Error(`Intel HEX checksum mismatch at line ${lineIndex + 1}`);

    if (type === 0x00) {
      const start = upperAddress + address;
      if (start < 0 || start + count > flash.length) throw new Error('HEX record exceeds ATmega328P flash');
      flash.set(data, start);
    } else if (type === 0x01) {
      if (count !== 0) throw new Error('Invalid Intel HEX EOF record');
      eof = true;
    } else if (type === 0x04) {
      if (count !== 2 || address !== 0) throw new Error('Invalid extended-linear-address record');
      upperAddress = ((data[0] << 8) | data[1]) << 16;
    } else if (type !== 0x03 && type !== 0x05) {
      throw new Error(`Unsupported Intel HEX record type ${type}`);
    }
  }
  if (!eof) throw new Error('Intel HEX EOF record is missing');

  const words = new Uint16Array(flash.length / 2);
  for (let i = 0; i < words.length; i++) words[i] = flash[i * 2] | (flash[i * 2 + 1] << 8);
  return words;
}
