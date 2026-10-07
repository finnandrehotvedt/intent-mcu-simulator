// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const CPU_CYCLES_PER_MILLISECOND = 16_000;

function safeTransitions(transitions, channels) {
  const allowed = new Set(channels);
  return transitions
    .filter((entry) => allowed.has(entry.pin) && Number.isFinite(entry.cycle) && typeof entry.level === 'boolean')
    .map((entry) => ({ pin: entry.pin, cycle: entry.cycle, level: entry.level }))
    .sort((left, right) => left.cycle - right.cycle || left.pin.localeCompare(right.pin));
}

export function waveformWindow(transitions, channels, edgeLimit = 100) {
  const records = safeTransitions(transitions, channels).slice(-Math.max(2, edgeLimit));
  const endCycle = Math.max(1, records.at(-1)?.cycle ?? 1);
  const startCycle = records.length > 1 ? Math.max(0, records[0].cycle) : 0;
  return { records, startCycle, endCycle: Math.max(endCycle, startCycle + 1) };
}

export function waveformPaths(transitions, channels, { edgeLimit = 100, width = 900, height = 260 } = {}) {
  const window = waveformWindow(transitions, channels, edgeLimit);
  const left = 68; const right = 18; const top = 20; const bottom = 28;
  const plotWidth = width - left - right;
  const laneHeight = (height - top - bottom) / Math.max(1, channels.length);
  const x = (cycle) => left + ((cycle - window.startCycle) / (window.endCycle - window.startCycle)) * plotWidth;
  const paths = channels.map((channel, index) => {
    const records = window.records.filter((entry) => entry.pin === channel);
    const high = top + index * laneHeight + laneHeight * 0.25;
    const low = top + index * laneHeight + laneHeight * 0.72;
    let level = false;
    let cursor = window.startCycle;
    const parts = [`M ${left.toFixed(2)} ${low.toFixed(2)}`];
    for (const entry of records) {
      const at = Math.max(cursor, entry.cycle);
      parts.push(`H ${x(at).toFixed(2)}`);
      if (entry.level !== level) parts.push(`V ${(entry.level ? high : low).toFixed(2)}`);
      level = entry.level; cursor = at;
    }
    parts.push(`H ${(left + plotWidth).toFixed(2)}`);
    return { channel, d: parts.join(' '), labelY: top + index * laneHeight + laneHeight / 2, high, low };
  });
  return { ...window, paths, width, height, left, plotWidth };
}

export function cursorCycles(window, firstRatio, secondRatio) {
  const span = window.endCycle - window.startCycle;
  const clamp = (value) => Math.max(0, Math.min(1, Number(value)));
  const first = Math.round(window.startCycle + span * clamp(firstRatio));
  const second = Math.round(window.startCycle + span * clamp(secondRatio));
  return {
    first, second, deltaCycles: Math.abs(second - first),
    deltaMilliseconds: Math.abs(second - first) / CPU_CYCLES_PER_MILLISECOND,
  };
}
