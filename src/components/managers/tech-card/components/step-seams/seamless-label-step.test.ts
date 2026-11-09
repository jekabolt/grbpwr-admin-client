import type { PieceGeom } from 'lib/assembly-skeleton/types';
import { describe, expect, it } from 'vitest';

import { labelSewn, seamlessLabelStep, unsewnLabel } from './step-seams-model';

const label = (attachment: string) =>
  ({
    garmentLabel: { label: 'tag', widthMm: 50, heightMm: 90, fold: 'flat', attachment },
  }) as unknown as PieceGeom;

describe('labels that go on without a seam', () => {
  it('reads sewn kinds and an empty attachment as sewn', () => {
    expect(labelSewn('sewn into the seam')).toBe(true);
    expect(labelSewn('sewn 4 sides')).toBe(true);
    expect(labelSewn('')).toBe(true);
    expect(labelSewn('hung')).toBe(false);
    expect(labelSewn('swift tack')).toBe(false);
    expect(labelSewn('stuck on')).toBe(false);
  });

  it('a step of hung labels needs no seam; one sewn label brings the seam back', () => {
    const geoms = new Map<string, PieceGeom>([
      ['tag', label('hung')],
      ['care', label('sewn into the seam')],
    ]);
    expect(unsewnLabel(geoms.get('tag'))).toBe(true);
    expect(seamlessLabelStep({ labelKeys: ['tag'] }, geoms)).toBe(true);
    expect(seamlessLabelStep({ labelKeys: ['tag', 'care'] }, geoms)).toBe(false);
    expect(seamlessLabelStep({ labelKeys: [] }, geoms)).toBe(false);
    expect(seamlessLabelStep({ labelKeys: ['gone'] }, geoms)).toBe(false);
  });
});
