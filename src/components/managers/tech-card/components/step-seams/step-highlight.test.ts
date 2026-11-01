import { describe, expect, it } from 'vitest';

import type { EdgeAnchor, StoredSeam } from 'lib/seams';

import { stepHighlightOf } from './step-highlight';

const anchor = (piece: string, edgeHint: string): EdgeAnchor => ({ piece, edgeHint }) as EdgeAnchor;

const row = (
  seamKey: string,
  sideA: readonly EdgeAnchor[],
  sideB: readonly EdgeAnchor[],
): StoredSeam =>
  ({
    seamKey,
    status: 'confirmed',
    kind: 'edge',
    direction: 'reversed',
    source: 'manual',
    sideA: [...sideA],
    sideB: [...sideB],
    anchoredSize: 'base',
    note: '',
  }) as StoredSeam;

describe('step highlight targets', () => {
  const armhole = row(
    'armhole',
    [anchor('SLEEVE', 'SLEEVE#7')],
    [anchor('BODY', 'BODY#2+3'), anchor('FRONT_2', 'i1'), anchor('SLEEVE_2', 'SLEEVE_2#8')],
  );
  const rows = new Map([[armhole.seamKey, armhole]]);

  it('uses both persisted sides of this step own row, including an inner target', () => {
    const highlight = stepHighlightOf([{ seamKeys: ['armhole'] }], 0, rows);

    expect(highlight.targets).toEqual(['SLEEVE#7', 'BODY#2', 'BODY#3', 'FRONT_2:i1', 'SLEEVE_2#8']);
    expect(highlight.inherited).toBe(false);
  });

  it('keeps an ordinary rowless step empty', () => {
    expect(stepHighlightOf([{ work: 'buttonhole' }], 0, rows).targets).toEqual([]);
  });

  it('takes only the producer host side for a rowless bind step', () => {
    const ops = [
      { inputKeys: ['SLEEVE'], outputUnitKey: 'LEFT_SLEEVE' },
      { inputKeys: ['SLEEVE_2'], outputUnitKey: 'RIGHT_SLEEVE' },
      { inputKeys: ['BODY', 'FRONT_2'], outputUnitKey: 'BASE' },
      {
        inputKeys: ['LEFT_SLEEVE', 'RIGHT_SLEEVE', 'BASE'],
        outputUnitKey: 'BASE_WITH_SLEEVES',
        seamKeys: ['armhole'],
      },
      { inputKeys: ['BASE_WITH_SLEEVES'], work: 'bind' },
    ];
    const highlight = stepHighlightOf(ops, 4, rows);

    expect(highlight.targets).toEqual(['BODY#2', 'BODY#3', 'FRONT_2:i1']);
    expect(highlight.targets).not.toContain('SLEEVE#7');
    expect(highlight.targets).not.toContain('SLEEVE_2#8');
    expect(highlight.inherited).toBe(true);
  });
});
