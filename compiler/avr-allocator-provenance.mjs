// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const AVR_ALLOCATOR_PROVENANCE_SCHEMA = 'intent-mcu-avr-allocator-provenance@1';
export const AVR_ALLOCATOR_LINKER_PROOF_DIAGNOSTIC_SCHEMA =
  'intent-mcu-avr-allocator-linker-proof-diagnostic@1';
export const AVR_ALLOCATOR_ID = 'avr-libc@2.0.0-malloc';
export const AVR_ALLOCATOR_ARCHIVE = '/opt/arduino/data/packages/arduino/tools/avr-gcc/7.3.0-atmel3.6.1-arduino7/avr/lib/avr5/libc.a';
export const AVR_ALLOCATOR_ARCHIVE_SHA256 = 'f4e9bdaa567959659f6974d75aeef8acb7ea17fbfac4bc3f85b8f8640af4f1e8';
export const AVR_ALLOCATOR_MEMBER = 'malloc.o';
export const AVR_ALLOCATOR_MEMBER_SHA256 = 'bc6353d3d3f242f9ac6b2b2c68a30145040d14d27ff022d41bb35a4535620541';
export const AVR_ALLOCATOR_SYMBOLS = Object.freeze([
  '__brkval', '__flp', '__malloc_heap_end', '__malloc_heap_start', '__malloc_margin',
  'free', 'malloc',
]);

const HASH = /^[a-f0-9]{64}$/u;
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const unavailable = (elfSha256, reason) => Object.freeze({
  schema: AVR_ALLOCATOR_PROVENANCE_SCHEMA, state: 'unavailable', reason,
  elfSha256: HASH.test(elfSha256 ?? '') ? elfSha256 : null,
  allocator: null, archiveSha256: null, member: null, memberSha256: null, symbols: null,
});

const exactOwner = `${AVR_ALLOCATOR_ARCHIVE}(${AVR_ALLOCATOR_MEMBER})`;
const definitionRows = (linkerText) => {
  const definitions = new Map(AVR_ALLOCATOR_SYMBOLS.map((name) => [name, []]));
  if (typeof linkerText !== 'string') return definitions;
  for (const line of linkerText.split(/\r?\n/u)) {
    const match = /^(.*): definition of ([A-Za-z_][A-Za-z0-9_]*)$/u.exec(line.trim());
    if (match && definitions.has(match[2])) definitions.get(match[2]).push(match[1]);
  }
  return definitions;
};

const ownerClassification = (owner) => {
  if (owner === exactOwner) return 'exact-pinned-archive-member';
  if (owner === AVR_ALLOCATOR_ARCHIVE) return 'pinned-archive-member-omitted';
  if (owner.startsWith(`${AVR_ALLOCATOR_ARCHIVE}(`)) return 'pinned-archive-other-member';
  if (owner.startsWith('/opt/arduino/')) return 'pinned-toolchain-other-owner';
  if (owner.startsWith('/workspace/') || owner.startsWith('/tmp/')) {
    return 'project-or-transient-object';
  }
  return 'other-owner';
};

export function createAvrAllocatorLinkerProofDiagnostic(linkerText, ownerSha256) {
  if (typeof ownerSha256 !== 'function') throw new TypeError('ALLOCATOR_OWNER_HASHER_REQUIRED');
  const definitions = definitionRows(linkerText);
  const ownerRecord = (owner) => {
    const digest = ownerSha256(owner);
    if (!HASH.test(digest ?? '')) throw new TypeError('ALLOCATOR_OWNER_HASH_INVALID');
    return Object.freeze({ classification: ownerClassification(owner), ownerSha256: digest });
  };
  const expectedOwnerSha256 = ownerSha256(exactOwner);
  if (!HASH.test(expectedOwnerSha256 ?? '')) throw new TypeError('ALLOCATOR_OWNER_HASH_INVALID');
  return Object.freeze({
    schema: AVR_ALLOCATOR_LINKER_PROOF_DIAGNOSTIC_SCHEMA,
    expectedOwnerSha256,
    symbols: Object.freeze(AVR_ALLOCATOR_SYMBOLS.map((symbol) => {
      const owners = definitions.get(symbol);
      return Object.freeze({ symbol, definitionCount: owners.length,
        owners: Object.freeze(owners.slice(0, 4).map(ownerRecord)),
        ownersTruncated: owners.length > 4 });
    })),
  });
}

export function avrAllocatorTraceFlags() {
  return `-Wl,${AVR_ALLOCATOR_SYMBOLS.map((name) => `--trace-symbol=${name}`).join(',')}`;
}

export function createAvrAllocatorProvenance({
  linkerText, elfSha256, archiveSha256, memberSha256,
}) {
  if (!HASH.test(elfSha256 ?? '')) return unavailable(null, 'allocator-elf-identity-missing');
  if (archiveSha256 !== AVR_ALLOCATOR_ARCHIVE_SHA256
      || memberSha256 !== AVR_ALLOCATOR_MEMBER_SHA256) {
    return unavailable(elfSha256, 'allocator-toolchain-archive-untrusted');
  }
  if (typeof linkerText !== 'string') return unavailable(elfSha256, 'allocator-linker-proof-missing');
  const definitions = definitionRows(linkerText);
  if (AVR_ALLOCATOR_SYMBOLS.some((name) => {
    const owners = definitions.get(name);
    return owners.length !== 1 || owners[0] !== exactOwner;
  })) return unavailable(elfSha256, 'allocator-linker-definition-unproven');
  return Object.freeze({
    schema: AVR_ALLOCATOR_PROVENANCE_SCHEMA, state: 'supported', reason: null,
    elfSha256, allocator: AVR_ALLOCATOR_ID,
    archiveSha256: AVR_ALLOCATOR_ARCHIVE_SHA256, member: AVR_ALLOCATOR_MEMBER,
    memberSha256: AVR_ALLOCATOR_MEMBER_SHA256, symbols: [...AVR_ALLOCATOR_SYMBOLS],
  });
}

export function normalizeAvrAllocatorProvenance(value, elfSha256) {
  if (!HASH.test(elfSha256 ?? '')) return unavailable(null, 'allocator-elf-identity-missing');
  if (!value) return unavailable(elfSha256, 'allocator-provenance-missing');
  if (!exactKeys(value, ['schema', 'state', 'reason', 'elfSha256', 'allocator',
    'archiveSha256', 'member', 'memberSha256', 'symbols'])
      || value.schema !== AVR_ALLOCATOR_PROVENANCE_SCHEMA
      || value.elfSha256 !== elfSha256 || !['supported', 'unavailable'].includes(value.state)) {
    return unavailable(elfSha256, 'allocator-provenance-untrusted');
  }
  if (value.state === 'unavailable') {
    return typeof value.reason === 'string' && value.reason.length > 0
      && value.allocator === null && value.archiveSha256 === null && value.member === null
      && value.memberSha256 === null && value.symbols === null
      ? unavailable(elfSha256, value.reason)
      : unavailable(elfSha256, 'allocator-provenance-untrusted');
  }
  if (value.reason !== null || value.allocator !== AVR_ALLOCATOR_ID
      || value.archiveSha256 !== AVR_ALLOCATOR_ARCHIVE_SHA256
      || value.member !== AVR_ALLOCATOR_MEMBER
      || value.memberSha256 !== AVR_ALLOCATOR_MEMBER_SHA256
      || JSON.stringify(value.symbols) !== JSON.stringify(AVR_ALLOCATOR_SYMBOLS)) {
    return unavailable(elfSha256, 'allocator-provenance-untrusted');
  }
  return Object.freeze(structuredClone(value));
}
