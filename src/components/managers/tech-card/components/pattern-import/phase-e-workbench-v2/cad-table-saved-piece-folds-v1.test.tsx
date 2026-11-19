import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { seamPieceOf, segmentPiece } from 'lib/assembly-skeleton/geometry/segment';
import { foldFromLine } from 'lib/folds/anchor';
import type { TechCardPieceFoldWire } from 'lib/folds/types';
import { foldToWire } from 'lib/folds/wire';
import type { PieceDTO } from 'lib/nesting/types';
import type { PatternImportDxfProductPhaseEAssemblyProjectionPieceV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { runsOfPiece } from 'lib/seams/frame';

import { CadTablePieceFeatureMarks } from './cad-table-piece-feature-marks-v1';
import { hasCadTablePieceFeature, type CadTablePieceFeatures } from './cad-table-piece-features-v1';
import { projectCadTableSavedPieceFoldAxesV1 } from './cad-table-saved-piece-folds-v1';

const pieceId = 'FLAP';
const pieceLineKey = '01M1M1ZAHFRDCHBSHH64B5NYQN';
const objectKey = pieceId + '::' + pieceLineKey;

function rectangle(w: number, h: number) {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
}

function fixture() {
  const cut: PieceDTO = {
    id: 1,
    name: 'FLAP_M',
    blockName: 'FLAP_M',
    layer: '1',
    source: 'fixture.dxf',
    poly: rectangle(10, 14),
    bboxW: 10,
    bboxH: 14,
    areaCm2: 140,
    originX: 4,
    originY: 3,
  };
  const seam: PieceDTO = {
    ...cut,
    id: 2,
    layer: '14',
    poly: rectangle(8, 12),
    bboxW: 8,
    bboxH: 12,
    areaCm2: 96,
    originX: 5,
    originY: 4,
    inner: [
      {
        layer: '8',
        closed: false,
        pts: [
          { x: 4, y: 2 },
          { x: 4, y: 10 },
        ],
      },
    ],
  };
  const piece = segmentPiece({
    piece: seamPieceOf([cut, seam])!,
    pieceKey: pieceLineKey,
    name: pieceId,
    piecesPerGarment: 1,
    cutSymmetry: null,
    cloth: null,
    fused: false,
  });
  const drawn = foldToWire(
    foldFromLine(
      piece,
      [
        [40, 20],
        [40, 100],
      ],
      [30, 60],
      {
        source: 'dxf',
        edge: null,
        kind: 'inward',
        seq: 1,
        anchoredSize: 'M',
        foldKey: 'drawn-fold',
      },
    ),
  );
  const hint = foldToWire(
    foldFromLine(
      piece,
      [
        [30, 0],
        [30, 120],
      ],
      [15, 60],
      {
        source: 'accepted_hint',
        kind: 'inward',
        seq: 2,
        anchoredSize: 'M',
        foldKey: 'accepted-fold',
        edge: runsOfPiece(piece).find((edge) => edge.pts.every(([x]) => x === 0)),
      },
    ),
  );
  const displayed: PatternImportDxfProductPhaseEAssemblyProjectionPieceV1 = {
    pieceId,
    pieceLineKey,
    cameraMm: { minX: 40, minY: 30, maxX: 140, maxY: 170, padding: 20 },
    contours: [
      {
        contourId: 'current-cut',
        role: 'cut-boundary',
        closed: true,
        vertices: cut.poly.map(({ x, y }, ordinal) => ({
          ordinal,
          vertexId: 'native-' + ordinal,
          normalizedArc: ordinal / 4,
          pointMm: { x: (x + cut.originX!) * 10, y: (y + cut.originY!) * 10 },
        })),
      },
    ],
  };
  return { cut, seam, drawn, hint, projection: { sizeToken: 'M', pieces: [displayed] } };
}

function project(
  rows: readonly TechCardPieceFoldWire[],
  projection: ReturnType<typeof fixture>['projection'],
  candidates: readonly PieceDTO[],
) {
  const { cut, seam } = fixture();
  // The archived FLAP has the exact same L1 ring and sheet origin at all ranks.
  const otherGrade = [
    { ...cut, id: 11, name: 'FLAP_S', blockName: 'FLAP_S' },
    { ...seam, id: 12, name: 'FLAP_S', blockName: 'FLAP_S', inner: [] },
  ];
  return projectCadTableSavedPieceFoldAxesV1(
    rows,
    projection,
    [...candidates, ...otherGrade],
    ['M', 'S'],
  );
}

describe('saved fold geometry in the Workbench', () => {
  it('draws the proven axis in the source frame using the existing fold visibility layer', () => {
    const { cut, seam, drawn, hint, projection } = fixture();
    const axes = project([drawn, hint], projection, [cut, seam]);
    const exact = axes.get(objectKey);
    expect(hint.edgeHint).toBeTruthy();
    expect(exact).toEqual([
      { foldKey: 'accepted-fold', a: { x: 80, y: 40 }, b: { x: 80, y: 160 } },
      { foldKey: 'drawn-fold', a: { x: 90, y: 60 }, b: { x: 90, y: 140 } },
    ]);

    const features: CadTablePieceFeatures = {
      grain: null,
      internal: [],
      fold: null,
      notches: [],
      drills: [],
      pieceLabel: 'FLAP',
      materialLabel: null,
      quantity: 1,
      savedFoldAxes: exact,
    };
    expect(hasCadTablePieceFeature(features, 'fold')).toBe(true);
    const render = (hide: boolean) =>
      renderToStaticMarkup(
        <svg>
          <CadTablePieceFeatureMarks
            features={features}
            hiddenLayers={new Set(hide ? ['fold'] : [])}
            materialRings={[]}
            unit={1}
          />
        </svg>,
      );
    expect(render(false)).toContain('pointer-events="none"');
    expect(render(false)).toContain(
      'data-cad-saved-fold-key="drawn-fold" x1="90" y1="-60" x2="90" y2="-140"',
    );
    expect(render(true)).not.toContain('data-cad-zero-connect-fold');
  });

  it('withholds wrong rank, signature, stale or incomplete anchors and ambiguous original frames', () => {
    const { cut, seam, drawn, projection } = fixture();
    for (const blocked of [
      { ...drawn, anchoredSize: 'S' },
      { ...drawn, pieceLineKey: 'an-unrelated-piece' },
      { ...drawn, stale: true },
      { ...drawn, contourSig: 'wrong-current-contour' },
      { ...drawn, line: [{ u: undefined, v: 0.2 }, drawn.line![1]] },
      { ...drawn, flipAt: { u: Number.NaN, v: 0.4 } },
    ]) {
      expect(project([blocked], projection, [cut, seam]).size).toBe(0);
    }
    expect(project([drawn, drawn], projection, [cut, seam]).size).toBe(0);
    expect(project([drawn], projection, [cut, { ...cut, id: 3 }, seam]).size).toBe(0);
    expect(project([drawn], projection, [{ ...cut, originX: 5 }, seam]).size).toBe(0);
    expect(
      project([drawn], projection, [
        cut,
        { ...seam, inner: seam.inner?.map((mark) => ({ ...mark, layer: '4' })) },
      ]).size,
    ).toBe(0);
  });
});
