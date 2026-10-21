import type { common_TechCard } from 'api/proto-http/admin';
import {
  cutSymmetryPrintCaption,
  grainlineText,
} from 'components/managers/tech-card/components/piece-codes';
import type { PieceClothState } from 'components/managers/tech-card/components/piece-cloth';
import { pieceRefKey } from 'components/managers/tech-card/components/piece-block-refs';
import type { FoundPiece } from 'components/managers/tech-card/components/nesting/dxf-geometry';
import {
  alphaKey,
  bomRefs,
  clean,
  materialColour,
  materialForPiece,
  materialRole,
  pieceKey,
  rollGoods,
} from './derive-shared';

export type TechpackPieceGeometry = {
  shapeByKey: ReadonlyMap<string, FoundPiece | null> | null;
  grainLayer: string;
};

const clothState = (purpose?: string): PieceClothState => {
  const value = clean(purpose).replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase();
  if (value === 'interfacing') return 'interfacing';
  if (
    value === 'main' ||
    value === 'contrast' ||
    value === 'lining' ||
    value === 'pocketing' ||
    value === 'mesh' ||
    value === 'insulation' ||
    value === 'other'
  ) {
    return value;
  }
  return value ? 'other' : 'unsorted';
};

const perimeterCm = (found: FoundPiece | null): number | null => {
  const poly = found?.piece.poly;
  if (!poly?.length) return null;
  return poly.reduce((sum, point, index) => {
    const next = poly[(index + 1) % poly.length];
    return sum + Math.hypot(next.x - point.x, next.y - point.y);
  }, 0);
};

export type PiecesModel = ReturnType<typeof derivePieces>;

export function derivePieces(techCard: common_TechCard, geometry?: TechpackPieceGeometry) {
  const card = techCard.techCard;
  const refs = bomRefs(techCard);
  const primary = techCard.colorways?.[0];
  const sourcePieces = card?.pieces ?? [];
  const rollRefs = refs.filter(rollGoods);
  const groups = [
    ...rollRefs.map((ref, index) => ({ ref, key: ref.key, label: alphaKey(index) })),
    { ref: null, key: 'unassigned', label: '!' },
  ]
    .map((group) => {
      const pieces = sourcePieces.flatMap((piece, index) => {
        const ref = materialForPiece(refs, primary, piece, index);
        if ((ref?.key ?? 'unassigned') !== group.key) return [];
        const shape = geometry?.shapeByKey?.get(pieceRefKey(clean(piece.lineKey))) ?? null;
        const qty = piece.piecesPerGarment ?? null;
        return [
          {
            key: pieceKey(piece, index),
            name: clean(piece.name),
            qty,
            grainline: grainlineText(piece.grainline),
            symmetry: cutSymmetryPrintCaption(piece.cutSymmetry, piece.piecesPerGarment),
            shape,
            perimeterCm: perimeterCm(shape),
            areaM2: shape && qty != null ? (shape.piece.areaCm2 * qty) / 10_000 : null,
            missing: [
              !clean(piece.name) && 'name',
              qty == null && 'qty',
              !clean(piece.grainline) && 'grain',
              !ref && 'material',
              geometry?.shapeByKey && !shape && 'dxf',
            ].filter((value): value is string => Boolean(value)),
          },
        ];
      });
      const colour = group.ref ? materialColour(group.ref, primary) : { name: '', swatch: '' };
      return {
        key: group.key,
        label: group.label,
        name: group.ref ? clean(group.ref.item.name) : 'material missing',
        role: group.ref ? materialRole(group.ref) : 'unassigned',
        colour: colour.name,
        swatch: colour.swatch,
        hatchRole: group.ref ? clothState(group.ref.item.purpose) : ('unbound' as const),
        pieces,
        netAreaM2: pieces.reduce((sum, piece) => sum + (piece.areaM2 ?? 0), 0),
        panelCount: pieces.reduce((sum, piece) => sum + (piece.qty ?? 0), 0),
      };
    })
    .filter((group) => group.pieces.length);

  return {
    groups,
    grainLayer: geometry?.grainLayer ?? '',
    pieceCount: sourcePieces.length,
    panelCount: sourcePieces.reduce((sum, piece) => sum + (piece.piecesPerGarment ?? 0), 0),
    hasGeometry: Boolean(geometry?.shapeByKey),
  };
}
