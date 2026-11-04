// A waistband, its elastic and the step that sews them, read through the real geometry builder.
import type { common_TechCard } from 'api/proto-http/admin';
import { anchorOfRunId, toWire } from 'lib/seams';
import type { PieceDTO } from 'lib/nesting/types';

import {
  assemblyCardInput,
  buildAssemblyPiecesFromInput,
} from '../../techpack/assembly-geometry-build';
import type { AssemblyInput } from '../../techpack/derive-assembly';
import type { FoundPiece } from '../nesting/dxf-geometry';
import { stripDrawingsOf, withStripPieces, type CutStripLike } from './strip-pieces';

export const WAISTBAND = '01M2R89631WAISTBAND0000000';
export const STRIP = '01M2R89631STRIP00000000000';
export const RUBBER = '01M2R89631RUBBER0000000000';
export const SEAM = '01M2R89631SEAM000000000000';

export const STRIP_SIZE_NAMES = new Map([
  [1, 'S'],
  [2, 'M'],
  [3, 'L'],
  [4, 'XL'],
]);

export const fromSeamStrip = (over: Partial<CutStripLike> = {}): CutStripLike =>
  ({
    lineKey: STRIP,
    bomLineKey: RUBBER,
    lengthMode: 'from_seam',
    seamKey: SEAM,
    fitPct: { value: '85' },
    overlapMm: { value: '30' },
    widthMm: { value: '40' },
    qty: 1,
    sizes: [
      { sizeId: 1, seamMm: { value: '750' } },
      { sizeId: 2, seamMm: { value: '790' } },
      { sizeId: 3, seamMm: { value: '830' } },
      { sizeId: 4, seamMm: { value: '870' } },
    ],
    ...over,
  }) as CutStripLike;

export const oneLengthStrip = (mm = 700): CutStripLike =>
  fromSeamStrip({
    lengthMode: 'one_length',
    seamKey: '',
    fitPct: { value: '100' },
    overlapMm: { value: '0' },
    oneLengthMm: mm,
    sizes: [],
  } as Partial<CutStripLike>);

export function foundRectangle(w: number, h: number, name: string): FoundPiece {
  const piece: PieceDTO = {
    id: 1,
    name,
    source: 'fixture',
    poly: [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ],
    bboxW: w,
    bboxH: h,
    areaCm2: w * h,
    originX: 0,
    originY: 0,
  };
  return { piece, block: name, size: 'M', instances: 1, layer: '', sizes: ['M'] };
}

/** The card, its geometry and (unless `seam` is off) the stored seam along the band's top edge. */
export function waistbandCard(
  strip: CutStripLike = fromSeamStrip(),
  o: { seam?: boolean; inStep?: boolean; sizeNames?: ReadonlyMap<number, string> } = {},
): AssemblyInput {
  const { seam = true, inStep = true, sizeNames = STRIP_SIZE_NAMES } = o;
  const card = {
    id: 1,
    techCard: {
      baseSampleSizeId: 2,
      pieces: [{ lineKey: WAISTBAND, name: 'waistband', piecesPerGarment: 1 }],
      bomItems: [{ lineKey: RUBBER, name: 'rubber', unitOfMeasure: 'm' }],
      operations: [
        {
          operationNumber: 230,
          operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
          work: 'join_lockstitch',
          inputKeys: [WAISTBAND, ...(inStep ? [STRIP] : [])],
          seamKeys: seam ? [SEAM] : [],
          outputUnitKey: 'belt',
          outputUnitName: 'belt',
        },
      ],
    },
    cutStrips: [strip],
  } as unknown as common_TechCard;
  const drawings = stripDrawingsOf([strip], card.techCard?.bomItems ?? [], {
    sizeToken: 'M',
    sizeNames,
    baseSizeId: 2,
  });
  const found = new Map<string, FoundPiece>([
    [WAISTBAND, foundRectangle(79, 8, 'waistband')],
    ...drawings.map((drawing) => [drawing.key, drawing.found] as const),
  ]);
  const input = assemblyCardInput(withStripPieces(card));
  const built = buildAssemblyPiecesFromInput(
    {
      ...input,
      pieces: input.pieces.map((piece) => {
        const mark = drawings.find((drawing) => drawing.key === piece.lineKey)?.mark;
        return mark ? { ...piece, cutStrip: mark } : piece;
      }),
    },
    found,
  );
  const geoms = [...built.pieces.values()].map((piece) => piece.geom);
  if (seam) {
    const longEdge = (key: string) => {
      const geom = built.pieces.get(key)!.geom;
      return [...geom.edges].sort((a, b) => b.lenMm - a.lenMm)[0].id;
    };
    const a = anchorOfRunId(geoms, longEdge(WAISTBAND));
    const b = anchorOfRunId(geoms, longEdge(STRIP));
    if (a && b)
      (card as { seams?: unknown[] }).seams = [
        toWire({
          seamKey: SEAM,
          status: 'confirmed',
          kind: 'edge',
          direction: 'same',
          source: 'manual',
          sideA: [a],
          sideB: [b],
          anchoredSize: 'M',
          note: '',
          stale: false,
        }),
      ];
  }
  return { techCard: card, pieces: built.pieces, grainDeg: built.grainDeg };
}
