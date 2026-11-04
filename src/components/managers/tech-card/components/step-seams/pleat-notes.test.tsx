import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { compose } from 'lib/assembly-skeleton/union/affine';
import { frameOf, toUV } from 'lib/folds/geom';
import type { FoldKind, StoredFold } from 'lib/folds';

import { cardFoldsOf } from './step-folds';
import { stepLayout, type StepLayout } from './step-picture';
import { StepPictureSvg } from './step-picture-view';

const W = 569;
const H = 662;
const piece = {
  pieceKey: 'BP',
  name: 'BP',
  hand: null,
  cloth: null,
  rs: [
    [0, 0],
    [W, 0],
    [W, H],
    [0, H],
  ] as Pt2[],
  corners: [0, 1, 2, 3],
  notchIdx: [],
  edges: [],
  rect: true,
  areaMm2: W * H,
  perimMm: 2 * (W + H),
  twinOf: [],
} as PieceGeom;
const geoms = new Map([['BP', piece]]);
const frame = frameOf(piece, 0);
const row = (foldKey: string, seq: number, kind: FoldKind, line: [Pt2, Pt2]): StoredFold => ({
  foldKey,
  pieceKey: 'BP',
  seq,
  kind,
  source: 'dxf',
  line: [toUV(frame, line[0]), toUV(frame, line[1])],
  flipAt: toUV(frame, [line[1][0] + 5, 300]),
  edge: null,
  contourSig: '',
  anchoredSize: 'M',
  note: '',
  stale: false,
});
const apex: Pt2 = [285, 14];
const pleat = (kind: FoldKind) => [
  row('leg-a', 1, kind, [apex, [250, 662]]),
  row('centre', 2, kind, [apex, [285, 662]]),
  row('leg-b', 3, kind, [apex, [320, 662]]),
];
const hem = {
  ...row('hem', 4, 'inward', [
    [0, 60],
    [W, 60],
  ]),
  source: 'owner' as const,
  flipAt: toUV(frame, [W / 2, 20]),
};
const flat = stepLayout([['BP']], [], geoms);
const keys = pleat('pleat').map((one) => one.foldKey);
const steps = [{ foldKeys: keys }, { foldKeys: ['hem'] }, {}];

const layoutOf = (kind: FoldKind, index: number): StepLayout => ({
  ...flat,
  folds: cardFoldsOf(steps, { rows: [...pleat(kind), hem], grainDeg: new Map() }, geoms)!(index)!,
});
const svgOf = (layout: StepLayout, note: string | undefined, look: 'tile' | 'print' = 'print') =>
  renderToStaticMarkup(
    <StepPictureSvg
      w={300}
      h={400}
      pad={4}
      look={look}
      layout={layout}
      geoms={geoms}
      pleatNote={note}
    />,
  );

describe('the pleat beside its closing step', () => {
  it('shows the section and M · 70 on print and on the map', () => {
    for (const look of ['print', 'tile'] as const) {
      const svg = svgOf(layoutOf('pleat_r', 0), 'M', look);
      expect(svg).toContain('data-fold-section-kind="pleat_r"');
      expect(svg).toContain('M · 70');
      expect(svg).toContain('data-fold-pleat-opening="BP"');
      expect(svg).not.toContain('face');
      expect(svg).not.toContain('wrong');
    }
  });

  it('leaves them off a later step, also one that closes another fold of the piece', () => {
    expect(svgOf(layoutOf('pleat_r', 1), 'M')).not.toContain('data-fold-section');
    expect(svgOf(layoutOf('pleat_r', 2), 'M')).not.toContain('data-fold-section');
  });

  it('leaves them off every other picture', () => {
    expect(svgOf(layoutOf('pleat_r', 0), undefined)).not.toContain('data-fold-section');
  });

  it('prints the bare length when the size is not known', () => {
    const svg = svgOf(layoutOf('pleat', 0), '');
    expect(svg).toContain('data-fold-section-kind="pleat"');
    expect(svg).toMatch(/>70<\/text>/);
  });

  it('keeps the piece under the note, inside the picture', () => {
    const svg = svgOf(layoutOf('pleat_l', 0), 'M');
    const section = /<svg x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/.exec(
      svg,
    )!;
    expect(Number(section[2])).toBeGreaterThanOrEqual(0);
    const d = /<path d="([^"]+)"[^>]*data-piece-outline="BP"/.exec(svg)![1];
    const ys = [...d.matchAll(/(-?[\d.]+)[, ](-?[\d.]+)/g)].map((point) => Number(point[2]));
    expect(Math.min(...ys)).toBeGreaterThan(Number(section[2]) + Number(section[4]));
  });

  it('turns the section with a mirrored piece: it goes with what is drawn beside it', () => {
    const T = flat.T.get('BP')!;
    const mirrored: StepLayout = {
      ...layoutOf('pleat_r', 0),
      T: new Map([['BP', compose([-1, 0, 0, 1, W, 0], T)]]),
    };
    expect(svgOf(mirrored, 'M')).toContain('data-fold-section-kind="pleat_l"');
  });
});
