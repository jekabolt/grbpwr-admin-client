import { renderToStaticMarkup } from 'react-dom/server';
import type { PieceGeom } from 'lib/assembly-skeleton/types';
import type { StoredFold } from 'lib/folds';
import { describe, expect, it, vi } from 'vitest';
import { StepFoldThumbs } from './step-fold-thumbs';

const flap: PieceGeom = {
  pieceKey: 'FLAP_L',
  name: 'flap',
  hand: 'L',
  cloth: null,
  rs: [
    [0, 0],
    [80, 0],
    [80, 200],
    [0, 200],
  ],
  corners: [0, 1, 2, 3],
  notchIdx: [],
  edges: [],
  rect: true,
  areaMm2: 16000,
  perimMm: 560,
  twinOf: [],
} as unknown as PieceGeom;

vi.mock('../step-seams/step-picture-view', () => ({
  useCardGeoms: () => ({
    geoms: new Map([['FLAP_L', flap]]),
    innerLines: new Map(),
    geo: { grainDeg: new Map([['FLAP_L', 0]]) },
  }),
}));

const fold: StoredFold = vi.hoisted(() => ({
  foldKey: 'fold-1',
  pieceKey: 'FLAP_L',
  seq: 1,
  kind: 'inward',
  source: 'accepted_hint',
  line: [
    [0.5, 1],
    [0.5, 0],
  ],
  flipAt: [0.25, 0.5],
  edge: null,
  contourSig: '',
  anchoredSize: '',
  note: '',
  stale: false,
})) as StoredFold;

vi.mock('../assembly-folds/folds-store', () => ({ useFoldRows: () => [fold] }));

const ops = [{ foldKeys: [] }, { foldKeys: ['fold-1'] }, {}];

describe('StepFoldThumbs', () => {
  it('shows flat and folded on the step that closes the fold', () => {
    const html = renderToStaticMarkup(<StepFoldThumbs ops={ops} index={1} />);
    expect(html).toContain('data-map-fold="FLAP_L"');
    expect(html.match(/<svg/g)).toHaveLength(2);
  });

  it('draws nothing before the fold, after it, or when no step names it', () => {
    expect(renderToStaticMarkup(<StepFoldThumbs ops={ops} index={0} />)).toBe('');
    expect(renderToStaticMarkup(<StepFoldThumbs ops={ops} index={2} />)).toBe('');
    expect(renderToStaticMarkup(<StepFoldThumbs ops={[{}, {}]} index={1} />)).toBe('');
  });
});
