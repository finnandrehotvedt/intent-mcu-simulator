// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;
const SAFE_CODE = /^[A-Z0-9_.-]{1,64}$/u;

function cleanText(value, fallback) {
  const text = String(value ?? '').replace(CONTROL, '').trim().slice(0, 500);
  return text || fallback;
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function normalizeSourceDiagnostics(values, {
  profile, revision, source, files,
} = {}) {
  const allowed = new Map((files ?? []).map((file) => [file.name, file.content]));
  return (Array.isArray(values) ? values : []).slice(0, 200).map((value) => {
    const rawFile = typeof value?.file === 'string' ? value.file.replaceAll('\\', '/').split('/').at(-1) : null;
    const file = rawFile && allowed.has(rawFile) ? rawFile : null;
    const fileSource = file ? allowed.get(file) : null;
    const lines = typeof fileSource === 'string' && fileSource.length ? fileSource.split('\n') : [];
    const requestedLine = safeInteger(value?.line);
    const line = requestedLine && requestedLine <= lines.length ? requestedLine : null;
    const requestedColumn = safeInteger(value?.column);
    const column = line && requestedColumn && requestedColumn <= lines[line - 1].length + 1
      ? requestedColumn : null;
    return Object.freeze({
      profile,
      revision,
      source,
      file,
      line,
      column,
      severity: ['error', 'warning', 'note'].includes(value?.severity) ? value.severity : 'error',
      code: SAFE_CODE.test(value?.code ?? '') ? value.code : null,
      message: cleanText(value?.message, 'Build failed without a safe diagnostic message.'),
      navigable: Boolean(file && line),
    });
  });
}

export function boundedPolicyDiagnostic({ profile, revision, source, file, linePatterns, code = 'SOURCE_POLICY_REJECTED' }) {
  const sourceLines = typeof source === 'string' && source.length ? source.replace(/\r\n?/gu, '\n').split('\n') : [];
  let line = null;
  if (sourceLines.length) {
    const count = Math.max(sourceLines.length, linePatterns.length);
    for (let index = 0; index < count; index += 1) {
      const pattern = linePatterns[index];
      if (!pattern || index >= sourceLines.length || !pattern.test(sourceLines[index])) {
        line = Math.min(index + 1, sourceLines.length);
        break;
      }
    }
  }
  return normalizeSourceDiagnostics([{
    file: line ? file : null,
    line,
    severity: 'error',
    code,
    message: 'Source differs from the documented bounded template. Restore this line, then build again.',
  }], { profile, revision, source, files: [{ name: file, content: source }] })[0];
}

export function diagnosticLabel(diagnostic) {
  const location = diagnostic.navigable
    ? `${diagnostic.file}:${diagnostic.line}${diagnostic.column ? `:${diagnostic.column}` : ''}`
    : 'No safe source location';
  return `${location} · ${diagnostic.severity}${diagnostic.code ? ` · ${diagnostic.code}` : ''}`;
}

export function sourceSelection(source, line, column = null) {
  if (typeof source !== 'string' || !Number.isSafeInteger(line) || line < 1) return null;
  const lines = source.split('\n');
  if (line > lines.length) return null;
  const lineStart = lines.slice(0, line - 1).reduce((count, value) => count + value.length + 1, 0);
  if (column !== null) {
    if (!Number.isSafeInteger(column) || column < 1 || column > lines[line - 1].length + 1) return null;
    const point = lineStart + column - 1;
    return Object.freeze({ start: point, end: Math.min(point + 1, lineStart + lines[line - 1].length) });
  }
  return Object.freeze({ start: lineStart, end: lineStart + lines[line - 1].length });
}
