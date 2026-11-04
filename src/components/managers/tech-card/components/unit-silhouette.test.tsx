import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { UnionPicture } from 'lib/assembly-skeleton/union';

import { UnitGlyph, UnitPieceNamesProvider, unitShapeTitle } from './unit-silhouette';

const KEY = '01M2R89631MR65TBJ9Z79497KF';
const shape = (over: Partial<UnionPicture['shapes'][number]>) =>
  ({
    pieceKey: KEY,
    pts: [
      [0, 0],
      [10, 0],
      [10, 10],
    ],
    lines: [],
    count: 1,
    hung: false,
    surface: false,
    ...over,
  }) as UnionPicture['shapes'][number];

const picture = {
  shapes: [shape({ count: 2, hung: true, surface: true })],
  pieceCount: 1,
  w: 100,
  h: 100,
  overflow: [KEY],
  underlay: [KEY],
} as unknown as UnionPicture;

describe('unit pictogram tooltip', () => {
  it('names every line by the piece code', () => {
    const lines = unitShapeTitle('Collar', picture, () => 'CLR_1').split('\n');
    expect(lines.slice(1)).toEqual([
      '×2 layers drawn as one: CLR_1',
      '~ hung on a 3D seam, drawn beside it: CLR_1',
      'sewn on top: CLR_1',
      'not drawn, would overlap: CLR_1',
      'fused underneath: CLR_1',
    ]);
  });

  it('never shows the internal key', () => {
    expect(unitShapeTitle('Collar', picture)).not.toContain(KEY);
    expect(unitShapeTitle('Collar', picture, () => '')).toContain('unnamed piece');
  });

  it('the glyph reads the codes from the card', () => {
    const markup = renderToStaticMarkup(
      <UnitPieceNamesProvider names={new Map([[KEY, 'PLCK']])}>
        <UnitGlyph picture={picture} name='Collar' />
      </UnitPieceNamesProvider>,
    );
    expect(markup).toContain('hung on a 3D seam, drawn beside it: PLCK');
    expect(markup.match(/title="([^"]*)"/)?.[1]).not.toContain(KEY);
  });
});
