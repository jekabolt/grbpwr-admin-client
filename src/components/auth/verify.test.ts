import { describe, expect, it } from 'vitest';

import { afterVerify } from './verify';

const base = { teamSlug: 'fold', handoffCode: '', awaitingApproval: false, rootToken: '' };

describe('afterVerify', () => {
  it('signs in when the answer carries a root token, also while the team waits', () => {
    expect(afterVerify({ ...base, awaitingApproval: true, rootToken: 't' }, '')).toEqual({
      kind: 'signed-in',
      token: 't',
    });
  });

  it('falls back to the waiting address without a token (old server)', () => {
    expect(afterVerify({ ...base, awaitingApproval: true, teamSlug: '' }, 'mono')).toEqual({
      kind: 'awaiting',
      slug: 'mono',
    });
    expect(afterVerify({ ...base, awaitingApproval: true, rootToken: undefined }, '')).toEqual({
      kind: 'awaiting',
      slug: 'fold',
    });
  });

  it('falls back to the team hand-off without a token when the team is ready', () => {
    const r = afterVerify({ ...base, handoffCode: 'c d' }, '');
    expect(r.kind).toBe('handoff');
    expect(r.kind === 'handoff' && r.url).toMatch(/\/\/fold\.[^/]*\/auth#code=c%20d&from=signup$/);
  });
});
