import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createObservedDigitalNetResolver } from '../src/x37-existing-runtime-seams.mjs';
import {
  X37_TURNAROUND_BUDGET, X37_TURNAROUND_PHASES, X37_TURNAROUND_TOPOLOGY,
  validateX37TurnaroundTrace,
} from '../src/x37-turnaround-protocol.mjs';

const event = (participantId, watermark, mappedTick, mode) => ({
  origin: 'executed-firmware-observation', participantId, netId: 'shared.digital.0',
  runtimeEpoch: 0, watermark, localCycle: mappedTick, mappedTick, mode,
  ...(mode === 'DRIVE' ? { level: false } : {}),
});

test('explicit 3.3 V pull-up and open-drain participants produce the exact finite handshake', () => {
  assert.deepEqual(X37_TURNAROUND_TOPOLOGY.pullup,
    { voltage: 3.3, resistanceOhms: 10_000, explicit: true });
  assert.equal(X37_TURNAROUND_BUDGET.maximumInstructionsPerParticipant, 1_000_000);
  const net = createObservedDigitalNetResolver({ netId: 'shared.digital.0',
    driverParticipantIds: ['avr', 'rp'], idleLevel: true });
  const rows = [{ phase: 'idle', actor: null, action: 'RELEASE', mappedTick: 1,
    ...net.snapshot(), level: true }];
  for (const [phase, participantId, mode] of [
    ['request', 'avr', 'DRIVE'], ['request-release', 'avr', 'RELEASE'],
    ['ack', 'rp', 'DRIVE'], ['ack-release', 'rp', 'RELEASE'],
    ['confirm', 'avr', 'DRIVE'], ['confirm-release', 'avr', 'RELEASE'],
  ]) {
    const watermark = rows.filter((row) => row.actor === participantId).length + 1;
    const resolved = net.apply([event(participantId, watermark, rows.length + 1, mode)]);
    rows.push({ phase, actor: participantId, action: mode === 'DRIVE' ? 'DRIVE_LOW' : 'RELEASE',
      mappedTick: rows.length + 1, state: resolved.state, level: resolved.level });
  }
  assert.equal(validateX37TurnaroundTrace(rows).accepted, true);
  assert.equal(rows.some(({ state }) => state === 'CONFLICT' || state === 'HIGH_Z'), false);
  assert.equal(X37_TURNAROUND_PHASES.length, 7);
});

test('high drive conflict high-Z disconnection reordering and missing dependent phase reject', () => {
  const valid = X37_TURNAROUND_PHASES.map((value, index) => ({ ...value,
    mappedTick: index + 1, state: value.expectedLevel ? 'HIGH' : 'LOW', level: value.expectedLevel }));
  for (const mutate of [
    (rows) => { rows[2].state = 'HIGH_Z'; },
    (rows) => { rows[3].state = 'CONFLICT'; },
    (rows) => { rows[4].mappedTick = rows[3].mappedTick; },
    (rows) => { rows.splice(5, 1); },
  ]) {
    const rows = structuredClone(valid); mutate(rows);
    assert.throws(() => validateX37TurnaroundTrace(rows), { code: 'X37_TURNAROUND_TRACE_INVALID' });
  }
});

test('RP model and bridge expose actual OE clear to input-mode GPIO observations', async () => {
  const [sio, pin, bridge, header] = await Promise.all([
    readFile(new URL('../node_modules/rp2040js/dist/esm/sio.js', import.meta.url), 'utf8'),
    readFile(new URL('../node_modules/rp2040js/dist/esm/gpio-pin.js', import.meta.url), 'utf8'),
    readFile(new URL('../expansion-drafts/rp2040-runtime-bridge-adapter-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../compiler/rp2040-contract/intent_rp2040_runtime.h', import.meta.url), 'utf8'),
  ]);
  assert.match(sio, /GPIO_OE_CLR = 0x028/u);
  assert.match(sio, /this\.gpioOutputEnable &= ~value/u);
  assert.match(pin, /if \(this\.outputEnable\)[\s\S]*return this\.outputValue/u);
  assert.match(bridge, /function pinEvent\(pin, state\)[\s\S]*mode: 'input'/u);
  assert.match(header, /INTENT_SIO_GPIO_OE_CLR\s+0xd0000028u/u);
  assert.match(header, /intent_gpio0_release/u);
});
