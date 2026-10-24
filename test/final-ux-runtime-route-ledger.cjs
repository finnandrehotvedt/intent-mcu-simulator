// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const crypto = require('node:crypto');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function requestLedgerRecord({ method, path, headers, body }) {
  return {
    method, path,
    mutationHeader: headers['x-teach-lab-build'] === '1',
    bearerCapability: /^Bearer [^ ]+$/u.test(headers.authorization || ''),
    ...(method === 'POST' && body ? { bodySha256: sha256(body), bodyBytes: body.length } : {}),
  };
}

function responseLedgerRecord({ path, status, body }) {
  return { path, status, body };
}

function failureLedgerRecord(error, { method, path, stage }) {
  return {
    stage, method, path,
    name: error?.name ?? 'Error', message: error?.message ?? String(error),
    cause: error?.cause ? {
      code: error.cause.code ?? null, address: error.cause.address ?? null,
      port: error.cause.port ?? null,
    } : null,
  };
}

module.exports = { failureLedgerRecord, requestLedgerRecord, responseLedgerRecord };
