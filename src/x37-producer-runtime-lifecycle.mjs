// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export async function constructX37RuntimePair({ activity, createAvr, createRp, cleanupAvr, cleanupRp }) {
  if (!activity || !Number.isSafeInteger(activity.runtimeInstances)
      || ![createAvr, createRp, cleanupAvr, cleanupRp].every((value) => typeof value === 'function')) {
    fail('X37_RUNTIME_CONSTRUCTION_CONFIGURATION');
  }
  let avr = null; let rp = null;
  try {
    avr = await createAvr(); activity.runtimeInstances += 1;
    rp = await createRp(); activity.runtimeInstances += 1;
    return { avr, rp };
  } catch (error) {
    const cleanup = [];
    if (rp) {
      try { await cleanupRp(rp); cleanup.push({ participantId: 'rp', cleaned: true }); }
      catch (cleanupError) { cleanup.push({ participantId: 'rp', cleaned: false, code: cleanupError.code ?? cleanupError.message }); }
    }
    if (avr) {
      try { await cleanupAvr(avr); cleanup.push({ participantId: 'avr', cleaned: true }); }
      catch (cleanupError) { cleanup.push({ participantId: 'avr', cleaned: false, code: cleanupError.code ?? cleanupError.message }); }
    }
    error.runtimeConstruction = { avrConstructed: Boolean(avr), rpConstructed: Boolean(rp), cleanup };
    throw error;
  }
}
