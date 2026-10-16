// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import net from 'node:net';

function checksum(payload) {
  let value = 0;
  for (const byte of Buffer.from(payload, 'ascii')) value = (value + byte) & 0xff;
  return value.toString(16).padStart(2, '0');
}

function littleEndianU32(hex) {
  if (!/^[0-9a-f]{8}$/iu.test(hex)) throw new Error('RSP_REGISTER_INVALID');
  return Buffer.from(hex, 'hex').readUInt32LE(0);
}

function signExtend12(value) {
  return (value & 0x800) ? value - 0x1000 : value;
}

export function decodeRiscvStore(instruction) {
  const compressed = instruction & 0xffff;
  if ((compressed & 0x3) === 0 && ((compressed >>> 13) & 0x7) === 0x6) {
    return Object.freeze({
      width: 4,
      baseRegister: 8 + ((compressed >>> 7) & 0x7),
      valueRegister: 8 + ((compressed >>> 2) & 0x7),
      immediate: (((compressed >>> 10) & 0x7) << 3)
        | (((compressed >>> 6) & 0x1) << 2)
        | (((compressed >>> 5) & 0x1) << 6),
    });
  }
  if ((instruction & 0x7f) !== 0x23) return null;
  const width = [1, 2, 4][(instruction >>> 12) & 0x7];
  if (!width) return null;
  const immediate = signExtend12(((instruction >>> 25) << 5) | ((instruction >>> 7) & 0x1f));
  return Object.freeze({
    width,
    baseRegister: (instruction >>> 15) & 0x1f,
    valueRegister: (instruction >>> 20) & 0x1f,
    immediate,
  });
}

export class RspClient {
  #socket;
  #buffer = Buffer.alloc(0);
  #packets = [];
  #waiters = [];
  #timeoutMs;

  constructor(socket, timeoutMs) {
    this.#socket = socket;
    this.#timeoutMs = timeoutMs;
    socket.on('data', (chunk) => this.#ingest(chunk));
  }

  static async connect({ host = '127.0.0.1', port, timeoutMs = 5000 }) {
    const deadline = Date.now() + timeoutMs;
    let socket;
    while (!socket && Date.now() < deadline) {
      try {
        socket = await new Promise((resolve, reject) => {
          const candidate = net.createConnection({ host, port });
          candidate.once('connect', () => resolve(candidate));
          candidate.once('error', reject);
        });
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    if (!socket) throw new Error('RSP_UNAVAILABLE');
    socket.setNoDelay(true);
    return new RspClient(socket, timeoutMs);
  }

  #ingest(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    for (;;) {
      while (this.#buffer.length && [0x2b, 0x2d].includes(this.#buffer[0])) {
        this.#buffer = this.#buffer.subarray(1);
      }
      const start = this.#buffer.indexOf(0x24);
      if (start < 0) {
        if (this.#buffer.length > 4096) this.#buffer = Buffer.alloc(0);
        return;
      }
      if (start > 0) this.#buffer = this.#buffer.subarray(start);
      const hash = this.#buffer.indexOf(0x23, 1);
      if (hash < 0 || this.#buffer.length < hash + 3) return;
      const payload = this.#buffer.subarray(1, hash).toString('ascii');
      const observed = this.#buffer.subarray(hash + 1, hash + 3).toString('ascii');
      this.#buffer = this.#buffer.subarray(hash + 3);
      if (checksum(payload) !== observed.toLowerCase()) {
        this.#socket.write('-');
        continue;
      }
      this.#socket.write('+');
      const waiter = this.#waiters.shift();
      if (waiter) waiter.resolve(payload); else this.#packets.push(payload);
    }
  }

  #packet() {
    if (this.#packets.length) return Promise.resolve(this.#packets.shift());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.#waiters.findIndex((entry) => entry.resolve === resolve);
        if (index >= 0) this.#waiters.splice(index, 1);
        reject(new Error('RSP_TIMEOUT'));
      }, this.#timeoutMs);
      this.#waiters.push({
        resolve: (value) => { clearTimeout(timer); resolve(value); },
      });
    });
  }

  async command(payload) {
    this.#socket.write(`$${payload}#${checksum(payload)}`);
    const response = await this.#packet();
    if (response.startsWith('E')) throw new Error(`RSP_COMMAND_${response}`);
    return response;
  }

  interrupt() { this.#socket.write(Buffer.from([0x03])); }
  close() { this.#socket.end(); }

  async addWriteWatchpoint(address, bytes = 4) {
    const response = await this.command(`Z2,${address.toString(16)},${bytes.toString(16)}`);
    if (response !== 'OK') throw new Error('RSP_WATCHPOINT_REJECTED');
  }

  async removeWriteWatchpoint(address, bytes = 4) {
    const response = await this.command(`z2,${address.toString(16)},${bytes.toString(16)}`);
    if (response !== 'OK') throw new Error('RSP_WATCHPOINT_REMOVE_REJECTED');
  }

  async continue() {
    this.#socket.write('$c#63');
    return this.#packet();
  }

  async step() {
    this.#socket.write('$s#73');
    return this.#packet();
  }

  async register(index) {
    return littleEndianU32(await this.command(`p${index.toString(16)}`));
  }

  async memory(address, bytes) {
    const response = await this.command(`m${address.toString(16)},${bytes.toString(16)}`);
    if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'iu').test(response)) {
      throw new Error('RSP_MEMORY_INVALID');
    }
    return Buffer.from(response, 'hex');
  }

  async executedStore(stop) {
    const watch = /(?:^|;)(?:watch|awatch):([0-9a-f]+);/iu.exec(stop);
    if (!watch) return null;
    const watchedAddress = Number.parseInt(watch[1], 16) >>> 0;
    const pc = await this.register(32);
    for (const instructionPc of [pc, (pc - 4) >>> 0, (pc - 2) >>> 0]) {
      let bytes;
      try { bytes = await this.memory(instructionPc, 4); } catch { continue; }
      const decoded = decodeRiscvStore(bytes.readUInt32LE(0));
      if (!decoded) continue;
      const [base, value] = await Promise.all([
        this.register(decoded.baseRegister), this.register(decoded.valueRegister),
      ]);
      const address = (base + decoded.immediate) >>> 0;
      if (address > watchedAddress || address + decoded.width <= watchedAddress) continue;
      const mask = decoded.width === 4 ? 0xffffffff : (1 << (decoded.width * 8)) - 1;
      return Object.freeze({
        pc: instructionPc,
        address,
        width: decoded.width,
        value: (value & mask) >>> 0,
        stopPc: pc,
        watchAddress: watchedAddress,
        storePending: instructionPc === pc,
      });
    }
    throw new Error('RSP_STORE_DECODE_FAILED');
  }
}
