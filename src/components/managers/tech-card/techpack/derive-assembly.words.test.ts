import { describe, expect, it } from 'vitest';

import { compactInputNames } from './derive-assembly';

describe('compactInputNames', () => {
  it('drops the tail every input shares and step numbers that tell nothing apart', () => {
    expect(
      compactInputNames([
        { name: 'Front upper right with pocket detail', step: 610 },
        { name: 'Front right with pocket detail', step: 630 },
      ]),
    ).toEqual(['Front upper right', 'Front right']);
  });

  it('keeps the step number between equally named inputs', () => {
    expect(
      compactInputNames([
        { name: 'Sleeve', step: 10 },
        { name: 'Sleeve', step: 20 },
      ]),
    ).toEqual(['Sleeve (10)', 'Sleeve (20)']);
  });

  it('folds consecutively numbered pieces into one range', () => {
    const pieces = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
      name: `outer_trapezoid_${n}_OS`,
      pieceNumber: n,
    }));
    expect(compactInputNames(pieces)).toEqual(['outer_trapezoid_1–8_OS']);
  });

  it('leaves two numbered pieces and gapped numbers as they are', () => {
    expect(compactInputNames([{ name: 'part_1' }, { name: 'part_2' }])).toEqual([
      'part_1',
      'part_2',
    ]);
    expect(compactInputNames([{ name: 'part_1' }, { name: 'part_2' }, { name: 'part_5' }])).toEqual(
      ['part_1', 'part_2', 'part_5'],
    );
  });
});
