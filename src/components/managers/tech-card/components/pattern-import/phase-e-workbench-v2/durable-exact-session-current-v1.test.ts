import { describe, expect, it } from 'vitest';

import {
  matchesPatternImportDxfProductExactNSessionFreshAuthorityV1,
  matchesPatternImportDxfProductExactNSessionSavedBindingV1,
} from './durable-exact-session-current-v1';

const digest = (character: string) => character.repeat(64);
const row = {
  techCardId: 11,
  scopeKey: 'fabric:main',
  patternLineKey: 'pattern:main',
  revision: 8,
  cardLockVersion: 301,
  url: 'https://media.example.invalid/pants.dxf',
  sizeBytes: 42,
  sha256: digest('a'),
};
const session = {
  current: {
    row,
    serverAssemblyRevision: 'assembly:revision:7',
    assemblyTopologySha256: digest('b'),
    selectedOperation: {
      sourceOperationNumber: 7,
      authoringOperationId: `zero-connect-binding-v1:${digest('c')}`,
      localOperationOrder: 0,
      seamIds: ['seam-side'],
    },
  },
} as never;
const current = {
  row,
  selectedOperationNumber: 7,
  serverAssemblyRevision: 'assembly:revision:7',
  assemblyTopologySha256: digest('b'),
  topology: { operations: [{ number: 7, seamKeys: ['seam-side'] }] },
};

describe('durable exact-N cached session freshness', () => {
  it.each([
    ['saved-row revision', { ...row, revision: row.revision + 1 }],
    ['card lock', { ...row, cardLockVersion: row.cardLockVersion + 1 }],
  ])('rejects the same operation number after a %s change', (_label, changedRow) => {
    expect(
      matchesPatternImportDxfProductExactNSessionSavedBindingV1(session, changedRow, 7, [
        'seam-side',
      ]),
    ).toBe(false);
  });

  it.each([
    ['different seam', ['seam-other']],
    ['additional seam', ['seam-side', 'seam-other']],
    ['reordered seams', ['seam-other', 'seam-side']],
  ])('rejects stale exact IDs for %s', (_label, seamIds) => {
    expect(
      matchesPatternImportDxfProductExactNSessionSavedBindingV1(session, row, 7, seamIds),
    ).toBe(false);
  });

  it('requires the fresh server assembly revision, topology hash and ordered seam IDs', () => {
    expect(
      matchesPatternImportDxfProductExactNSessionFreshAuthorityV1(session, current as never),
    ).toBe(true);
    expect(
      matchesPatternImportDxfProductExactNSessionFreshAuthorityV1(session, {
        ...current,
        assemblyTopologySha256: digest('9'),
      } as never),
    ).toBe(false);
    expect(
      matchesPatternImportDxfProductExactNSessionFreshAuthorityV1(session, {
        ...current,
        topology: { operations: [{ number: 7, seamKeys: ['seam-other'] }] },
      } as never),
    ).toBe(false);
  });
});
