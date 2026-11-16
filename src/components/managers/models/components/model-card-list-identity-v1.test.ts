import { describe, expect, it } from 'vitest';
import { resolveModelCardListIdentitiesV1 } from './model-card-list-identity-v1';

describe('model card list identity v1', () => {
  it('admits only unique positive safe integer ids', () => {
    const identities = resolveModelCardListIdentitiesV1([
      { id: 7 },
      { id: 7 },
      { id: 8 },
      { id: undefined },
      { id: 0 },
      { id: -2 },
      { id: 1.5 },
      { id: Number.MAX_SAFE_INTEGER + 1 },
    ]);

    expect(identities.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: null, status: 'duplicate' },
      { id: null, status: 'duplicate' },
      { id: 8, status: 'valid' },
      { id: null, status: 'invalid' },
      { id: null, status: 'invalid' },
      { id: null, status: 'invalid' },
      { id: null, status: 'invalid' },
      { id: null, status: 'invalid' },
    ]);
    expect(new Set(identities.map(({ key }) => key).values()).size).toBe(identities.length);
    expect(Object.isFrozen(identities)).toBe(true);
    expect(identities.every(Object.isFrozen)).toBe(true);
  });
});
