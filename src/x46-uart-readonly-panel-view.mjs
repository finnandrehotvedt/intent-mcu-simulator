// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const DISPLAY_LIMIT = 256;

function node(document, name, text = '', className = '') {
  const value = document.createElement(name);
  value.textContent = text;
  if (className) value.className = className;
  return value;
}

function displayByte(value) {
  if (value === 10) return '\\n';
  if (value === 13) return '\\r';
  if (value === 9) return '\\t';
  if (value === 32) return 'SPACE';
  if (value === 92) return '\\\\';
  if (value >= 33 && value <= 126) return String.fromCharCode(value);
  return `\\x${value.toString(16).padStart(2, '0')}`;
}

function stateText(assessment, evidenceKind) {
  if (assessment.state === 'current' && evidenceKind === 'historical-replay-fixture') {
    return 'Accepted historical replay';
  }
  if (assessment.state === 'current' && evidenceKind !== 'current-worker') {
    return 'Accepted synthetic fixture';
  }
  return ({
    current: 'Current paused worker',
    empty: 'Current · no TX bytes',
    partial: 'Incomplete retention',
    stale: 'Stale identity',
    invalid: 'Rejected evidence',
    unavailable: 'Unavailable',
  })[assessment.state] ?? 'Unavailable';
}

function detailText(assessment) {
  if (assessment.state === 'current') {
    return `${assessment.retention.retainedTx.toLocaleString('en-US')} complete TX byte events · ${assessment.retention.dropped} dropped`;
  }
  if (assessment.state === 'empty') return 'The current paused worker recorded no USART0 TX byte events.';
  if (assessment.state === 'partial') return 'Retention loss makes the byte sequence incomplete. Missing bytes are not inferred.';
  if (assessment.state === 'stale') return 'Worker, runtime, model or artifact identity changed. Prior rows were removed.';
  if (assessment.state === 'invalid') return 'Malformed current evidence was rejected before any byte row was shown.';
  return assessment.reason === 'explicit-pause-required'
    ? 'Pause the current worker explicitly to inspect one frozen byte-event snapshot.'
    : 'No current validated AVR worker snapshot is available.';
}

function frameBits(frame) {
  return frame.symbols.filter((symbol) => symbol.kind === 'data')
    .map((symbol) => symbol.value).join(' ');
}

export function renderX46UartReadonlyPanel(root, assessment, { evidenceKind = 'current-worker' } = {}) {
  if (!root || root.nodeType !== 1) throw new TypeError('X46_PANEL_ROOT_INVALID');
  const document = root.ownerDocument;
  root.dataset.state = assessment.state;
  root.dataset.evidenceKind = evidenceKind;
  root.replaceChildren();

  const heading = node(document, 'div', '', 'shared-instrument-tool-heading');
  heading.append(node(document, 'strong', 'UART TX byte events'),
    node(document, 'span', stateText(assessment, evidenceKind)));
  const boundaryText = evidenceKind === 'current-worker'
    ? 'Read-only current-worker projection · no Build, Run, input, Apply or verdict authority.'
    : evidenceKind === 'historical-replay-fixture'
      ? 'Historical raw-evidence replay · offline contract test only · not a fresh current worker or firmware run.'
      : 'Synthetic review fixture · presentation test only · not current-worker or firmware evidence.';
  const boundary = node(document, 'p',
    boundaryText,
    'x46-uart-boundary');
  const summary = node(document, 'p', detailText(assessment), 'x46-uart-summary');
  summary.dataset.x46Summary = '';

  const facts = node(document, 'dl', '', 'x46-uart-facts');
  const fact = (label, text) => {
    const row = node(document, 'div');
    row.append(node(document, 'dt', label), node(document, 'dd', text));
    facts.append(row);
  };
  fact('Binding', assessment.identity
    ? `${assessment.identity.artifactIdentity.slice(0, 12)}… · runtime ${assessment.identity.runtimeGeneration} · worker init ${assessment.identity.workerInitialization}`
    : 'No current identity accepted.');
  fact('Retention', `${assessment.retention.retainedTx} TX / ${assessment.retention.retainedAll} all records · ${assessment.retention.dropped} dropped${assessment.retention.truncated ? ' · truncated' : ''}`);
  fact('Authority', 'Apply false · Build false · Run false · verdict false');

  const tableWrap = node(document, 'div', '', 'x46-uart-table-wrap');
  const table = node(document, 'table');
  table.setAttribute('aria-label', 'Read-only UART transmit byte events');
  const head = node(document, 'thead');
  const headRow = node(document, 'tr');
  for (const label of ['#', 'Cycle', 'Δ cycles', 'Hex', 'Display byte', 'Model baud', 'Frame cycles']) {
    headRow.append(node(document, 'th', label));
  }
  head.append(headRow);
  const body = node(document, 'tbody');
  body.dataset.x46Rows = '';
  const displayed = assessment.frames.slice(-DISPLAY_LIMIT);
  if (!displayed.length) {
    const row = node(document, 'tr');
    const cell = node(document, 'td', 'No accepted TX byte-event rows.');
    cell.colSpan = 7; row.append(cell); body.append(row);
  } else for (const frame of displayed) {
    const row = node(document, 'tr');
    row.dataset.ordinal = String(frame.ordinal);
    const values = [
      String(frame.ordinal),
      frame.cycle.toLocaleString('en-US'),
      frame.cycleDelta === null ? '—' : frame.cycleDelta.toLocaleString('en-US'),
      `0x${frame.value.toString(16).padStart(2, '0').toUpperCase()}`,
      displayByte(frame.value),
      frame.baud.toLocaleString('en-US', { maximumFractionDigits: 2 }),
      frame.frameCycles.toLocaleString('en-US'),
    ];
    values.forEach((value) => row.append(node(document, 'td', value)));
    body.append(row);
  }
  table.append(head, body); tableWrap.append(table);

  const framing = assessment.framing ?? {
    state: 'unavailable', completed: 0, inFlight: 0, frames: [],
    reason: 'no-current-complete-framing', modelDerived: true, physicalSignal: false,
  };
  const framingDetails = node(document, 'details', '', 'x46-framing-details');
  framingDetails.dataset.x46FramingState = framing.state;
  const framingSummary = node(document, 'summary', framing.state === 'current'
    ? `Model-derived framing · ${framing.completed} completed · ${framing.inFlight} in flight`
    : 'Model-derived framing unavailable');
  const framingBoundary = node(document, 'p', framing.state === 'current'
    ? 'Pinned emulator semantics only—not a measured voltage waveform. Start 0 · eight LSB-first data bits · stop 1. RX, parity modes, I2C and SPI remain unavailable.'
    : `No accepted framing projection (${framing.reason}). Byte events remain read-only; missing framing is never inferred.`,
  'x46-framing-boundary');
  framingDetails.append(framingSummary, framingBoundary);
  if (framing.state === 'current') {
    const list = node(document, 'ol', '', 'x46-framing-list');
    for (const frame of framing.frames.slice(-DISPLAY_LIMIT)) {
      list.append(node(document, 'li',
        `#${frame.ordinal} · 0x${frame.value.toString(16).padStart(2, '0').toUpperCase()} · start 0 · data LSB ${frameBits(frame)} · stop 1 · ${frame.cyclesPerSymbol.toLocaleString('en-US')} cycles/symbol`));
    }
    framingDetails.append(list);
  }

  const rx = assessment.rx ?? {
    state: 'unavailable', completed: 0, inFlight: 0, rejected: 0,
    transfers: [], reason: 'no-current-complete-rx', modelDerived: true, physicalSignal: false,
  };
  const rxDetails = node(document, 'details', '', 'x46-rx-details');
  rxDetails.dataset.x46RxState = rx.state;
  const rxSummary = node(document, 'summary', rx.state === 'current'
    ? `Model-derived RX · ${rx.completed} completed · ${rx.inFlight} in flight · ${rx.rejected} rejected`
    : 'Model-derived RX unavailable');
  const rxBoundary = node(document, 'p', rx.state === 'current'
    ? 'Decoded byte/peripheral-model evidence only—not D0 voltage edges, parity symbols, noise or physical signal evidence. I2C and SPI remain unavailable.'
    : `No accepted RX projection (${rx.reason}). Missing transfers are never inferred.`,
  'x46-rx-boundary');
  rxDetails.append(rxSummary, rxBoundary);
  if (rx.state === 'current') {
    const list = node(document, 'ol', '', 'x46-rx-list');
    for (const transfer of rx.transfers.slice(-DISPLAY_LIMIT)) {
      list.append(node(document, 'li',
        `0x${transfer.value.toString(16).padStart(2, '0').toUpperCase()} (${displayByte(transfer.value)}) · start ${transfer.startCycle.toLocaleString('en-US')} · expected ${transfer.scheduledCompletionCycle.toLocaleString('en-US')} · observed ${transfer.observedCompletionCycle.toLocaleString('en-US')} · lateness ${transfer.observationLatenessCycles.toLocaleString('en-US')} cycles`));
    }
    rxDetails.append(list);
  }

  const shown = assessment.frames.length > DISPLAY_LIMIT
    ? `Showing the latest ${DISPLAY_LIMIT} of ${assessment.frames.length} complete TX rows. ` : '';
  const framingLimit = framing.state === 'current'
    ? 'Bounded model-derived 8-N-1 framing is shown above; it is not physical signal evidence.'
    : 'Framing configuration is unavailable and is not inferred.';
  const rxLimit = rx.state === 'current'
    ? 'Bounded model-derived RX byte transfers are shown above; D0 line signalling and parity/noise remain unavailable.'
    : 'RX transfer evidence is unavailable and is not inferred.';
  const limits = node(document, 'p', `${shown}Model-recorded byte events, baud and frame duration only. ${framingLimit} ${rxLimit} Physical voltage/noise, I2C and SPI are unavailable.`, 'x46-uart-limits');
  limits.dataset.x46Limits = '';
  root.append(heading, boundary, summary, facts, tableWrap, framingDetails, rxDetails, limits);
  return assessment;
}
