import { describe, expect, it } from 'vitest';

import type { StoredRow } from 'lib/seams';

import { mirrorClickDialog, mirrorConfirmTitle } from './mirror-step';

const row = (kind: string) => ({ kind }) as unknown as StoredRow;

describe('mirror left confirm', () => {
  it('opens a confirm for create and for replace — the click itself writes nothing', () => {
    expect(mirrorClickDialog('create')).toBe('create');
    expect(mirrorClickDialog('replace')).toBe('replace');
  });

  it('names the number of seams the plan writes, poses not counted', () => {
    expect(mirrorConfirmTitle({ upsert: [row('partial'), row('surface'), row('pose')] })).toBe(
      'MIRROR 2 SEAMS?',
    );
    expect(mirrorConfirmTitle({ upsert: [row('partial')] })).toBe('MIRROR 1 SEAM?');
    expect(mirrorConfirmTitle({ upsert: [row('pose')] })).toBe('MIRROR LEFT?');
  });
});
