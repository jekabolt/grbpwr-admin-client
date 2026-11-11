import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { TechCardPieceFold } from 'api/proto-http/common';
import type { Pt2 } from 'lib/assembly-skeleton/types';
import { frameOf, toUV } from 'lib/folds/geom';

import { StepPictureSvg } from '../components/step-seams/step-picture-view';
import { card83StoredSeamsFixture } from './assembly-inference.fixture';
import { deriveAssembly } from './derive-assembly';
import { editorOperationPictures } from './pages/assembly';

// The real print path of a real card: a right pleat on the largest piece of its first join.
function printedPleat(staleSeq?: number) {
  const input = card83StoredSeamsFixture();
  const first = deriveAssembly(input);
  const opNumber = first.rows.find((row) => row.card)!.n;
  const firstPicture = editorOperationPictures(input.techCard, first)!.get(opNumber)!;
  const area = (key: string) => {
    const ring = input.pieces.get(key)?.geom.rs ?? [];
    const xs = ring.map(([x]) => x);
    const ys = ring.map(([, y]) => y);
    return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  };
  const key = [...firstPicture.layout.T.keys()]
    .filter((one) => input.pieces.has(one))
    .sort((a, b) => area(b) - area(a))[0];
  const piece = input.pieces.get(key)!;
  const deg = input.grainDeg.get(key) ?? 0;
  const frame = frameOf(piece.geom, deg);
  const fromUV = ([u, v]: Pt2): Pt2 => {
    const xs = [0, 1].map((one) => toUV(frame, [one, 0]));
    const ys = [0, 1].map((one) => toUV(frame, [0, one]));
    const [ux, vx] = [xs[1][0] - xs[0][0], xs[1][1] - xs[0][1]];
    const [uy, vy] = [ys[1][0] - ys[0][0], ys[1][1] - ys[0][1]];
    const det = ux * vy - uy * vx;
    const du = u - xs[0][0];
    const dv = v - xs[0][1];
    return [(du * vy - uy * dv) / det, (ux * dv - du * vx) / det];
  };
  const uvLines: [Pt2, Pt2][] = [
    [
      [0.5, 0.2],
      [0.44, 0.8],
    ],
    [
      [0.5, 0.2],
      [0.5, 0.8],
    ],
    [
      [0.5, 0.2],
      [0.56, 0.8],
    ],
  ];
  const inner = uvLines.map((line) => line.map(fromUV).map(([x, y]): Pt2 => [x, -y]));
  const pieces = new Map(input.pieces);
  pieces.set(key, { ...piece, inner: [...piece.inner, ...inner] });
  const wire = (index: number): TechCardPieceFold => ({
    foldKey: `pleat-${index}`,
    pieceLineKey: key,
    seq: index + 1,
    kind: 'TECH_CARD_PIECE_FOLD_KIND_PLEAT_RIGHT',
    source: 'TECH_CARD_PIECE_FOLD_SOURCE_DXF',
    line: uvLines[index].map(([u, v]) => ({ u, v })),
    flipAt: { u: 0.5, v: 0.5 },
    edgeHint: '',
    edgeSamples: [],
    offsetMm: 0,
    contourSig: '',
    anchoredSize: 'M',
    note: '',
    stale: index + 1 === staleSeq,
    createdBy: '',
    createdAt: '',
    updatedBy: '',
    updatedAt: '',
  });
  const insert = input.techCard.techCard!;
  const foldKeys = uvLines.map((_, index) => `pleat-${index}`);
  const techCard = {
    ...input.techCard,
    pieceFolds: uvLines.map((_, index) => wire(index)),
    techCard: {
      ...insert,
      operations: (insert.operations ?? []).map((operation) =>
        operation.operationNumber === opNumber ? { ...operation, foldKeys } : operation,
      ),
    },
  } as typeof input.techCard;
  const model = deriveAssembly({ ...input, pieces, techCard, drawnSize: 'M' });
  const pictures = editorOperationPictures(techCard, model)!;
  return { model, pictures, opNumber };
}

type Picture =
  NonNullable<ReturnType<typeof editorOperationPictures>> extends ReadonlyMap<number, infer P>
    ? P
    : never;
const render = (picture: Picture) =>
  renderToStaticMarkup(
    <StepPictureSvg
      w={600}
      h={600}
      pad={8}
      look='print'
      layout={picture.layout}
      layers={picture.resultLayers}
      stacked={picture.resultStacked}
      geoms={picture.geoms}
      pleatNote='M'
    />,
  );

describe('a pleat through the real print path', () => {
  it('prints the line, the section and the length on its step only', () => {
    const { model, pictures, opNumber } = printedPleat();
    expect(model.words.get(opNumber)?.folds).toEqual([
      expect.stringMatching(/^Pleat .+ · \d+ mm →$/),
    ]);
    const svg = render(pictures.get(opNumber)!);
    expect(svg).toContain('data-fold-section-kind="pleat_r"');
    expect(svg).toMatch(/M · \d+<\/text>/);
    const later = [...pictures.keys()].filter((n) => n > opNumber);
    expect(later.length).toBeGreaterThan(0);
    for (const n of later) expect(render(pictures.get(n)!)).not.toContain('data-fold-section');
    for (const [n, words] of model.words) if (n !== opNumber) expect(words.folds).toBeUndefined();
    expect(model.gaps.filter((gap) => gap.code === 'pdf_fold_unresolved')).toEqual([]);
  }, 60_000);

  it('a step fold this size cannot lay is a gap on its step: piece code, fold number, size', () => {
    const { model, opNumber } = printedPleat(2);
    const gaps = model.gaps.filter((gap) => gap.code === 'pdf_fold_unresolved');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ section: '06', target: { tab: 'construction', op: opNumber } });
    expect(gaps[0].label).toMatch(/^fold \S+ 2 M$/);
    expect(gaps[0].label).not.toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  }, 60_000);
});
