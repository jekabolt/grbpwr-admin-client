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
import type { Gap, GapSink } from './gaps';
import { englishT, type PdfT } from './i18n';

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

const hatchOf = (state: PieceClothState): PieceClothState | undefined =>
  state === 'main' ? undefined : state;

const perimeterCm = (found: FoundPiece | null): number | null => {
  const poly = found?.piece.poly;
  if (!poly?.length) return null;
  return poly.reduce((sum, point, index) => {
    const next = poly[(index + 1) % poly.length];
    return sum + Math.hypot(next.x - point.x, next.y - point.y);
  }, 0);
};

/** The box PieceShape draws a piece in (its bbox plus 6 % of the long side each way), cm. */
const drawBox = (found: FoundPiece | null): { w: number; h: number } | null => {
  if (!found) return null;
  const { bboxW, bboxH } = found.piece;
  const pad = Math.max(bboxW, bboxH, 1) * 0.06;
  return { w: bboxW + 2 * pad, h: bboxH + 2 * pad };
};

const PAIR = /^(left|right)\s+(.+)$/i;
const INTERNAL_PIECE_ID =
  /^(?:[0-9A-HJKMNP-TV-Z]{26}|[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i;

/** A line key is useful as identity, but only a human-authored key is useful as a printed code. */
export const pieceCode = (lineKey?: string): string => {
  const value = clean(lineKey);
  return INTERNAL_PIECE_ID.test(value) ? '' : value.toUpperCase();
};

/**
 * «Left flap» + «Right flap» of one fabric print as one tile «flap · 2 pcs · L+R»: the workshop
 * cuts them as a mirrored pair. A side without its partner stays a tile of its own.
 */
function pairTiles<T extends { key: string; name: string }>(pieces: readonly T[]) {
  const used = new Set<number>();
  const tiles: { key: string; name: string; pieces: T[] }[] = [];
  pieces.forEach((piece, index) => {
    if (used.has(index)) return;
    used.add(index);
    const match = PAIR.exec(piece.name);
    if (match) {
      const left = match[1].toLowerCase() === 'left';
      const partner = `${left ? 'right' : 'left'} ${match[2].toLowerCase()}`;
      const at = pieces.findIndex(
        (other, i) => !used.has(i) && other.name.toLowerCase() === partner,
      );
      if (at >= 0) {
        used.add(at);
        const pair = left ? [piece, pieces[at]] : [pieces[at], piece];
        tiles.push({ key: pair.map((p) => p.key).join('+'), name: match[2], pieces: pair });
        return;
      }
    }
    tiles.push({ key: piece.key, name: piece.name, pieces: [piece] });
  });
  return tiles;
}

export type PiecesModel = ReturnType<typeof derivePieces>;

export function derivePieces(
  techCard: common_TechCard,
  geometry?: TechpackPieceGeometry,
  sink?: GapSink,
  t: PdfT = englishT,
) {
  const card = techCard.techCard;
  const refs = bomRefs(techCard);
  const primary = techCard.colorways?.[0];
  const sourcePieces = card?.pieces ?? [];
  const rollRefs = refs.filter(rollGoods);
  const add = (code: string, label: string, field: string, piece?: string): Gap => {
    const gap: Gap = {
      code,
      refs: [piece ? `piece:${piece}` : '', `field:${field}`].filter(Boolean),
      label,
      section: '02',
      target: { tab: 'pieces', piece, field },
    };
    return sink?.add(gap) ?? gap;
  };
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
        const code = pieceCode(piece.lineKey);
        const pieceRef = clean(piece.lineKey) || `piece-${index + 1}`;
        return [
          {
            key: pieceKey(piece, index),
            name: clean(piece.name),
            code,
            qty,
            grainline: grainlineText(piece.grainline),
            symmetry: cutSymmetryPrintCaption(piece.cutSymmetry, piece.piecesPerGarment),
            shape,
            perimeterCm: perimeterCm(shape),
            box: drawBox(shape),
            areaM2: shape && qty != null ? (shape.piece.areaCm2 * qty) / 10_000 : null,
            missing: [
              !clean(piece.name) && add('pdf_piece_name_missing', t('gaps.name'), 'name', pieceRef),
              !code && add('asm_piece_no_code', t('gaps.code'), 'code', pieceRef),
              qty == null && add('pdf_piece_qty_missing', t('gaps.quantity'), 'qty', pieceRef),
              !ref && add('pdf_piece_material_missing', t('gaps.material'), 'material', pieceRef),
              geometry?.shapeByKey &&
                !shape &&
                add('pdf_piece_dxf_missing', t('gaps.dxf'), 'dxf', pieceRef),
            ].filter((value): value is Gap => Boolean(value)),
          },
        ];
      });
      const colour = group.ref ? materialColour(group.ref, primary) : { name: '', swatch: '' };
      const tiles = pairTiles(pieces).map((tile) => {
        const qty = tile.pieces.every((piece) => piece.qty != null)
          ? tile.pieces.reduce((sum, piece) => sum + (piece.qty ?? 0), 0)
          : null;
        const drawn = tile.pieces.find((piece) => piece.shape) ?? tile.pieces[0];
        return {
          key: tile.key,
          name: tile.name,
          codes: tile.pieces
            .map((piece) => piece.code)
            .filter(Boolean)
            .join(' · '),
          qty,
          paired: tile.pieces.length === 2,
          symmetry: tile.pieces.length === 1 ? tile.pieces[0].symmetry : '',
          shape: drawn.shape,
          box: drawn.box,
          perimeterCm: drawn.perimeterCm,
          missing: Array.from(new Set(tile.pieces.flatMap((piece) => piece.missing))),
        };
      });
      return {
        key: group.key,
        label: group.label,
        name: group.ref
          ? clean(group.ref.item.name) || t('common.generated', { text: materialRole(group.ref) })
          : t('pieces.materialMissing'),
        role: group.ref
          ? t('common.generated', { text: materialRole(group.ref) })
          : t('pieces.unassigned'),
        composition: clean(group.ref?.item.composition),
        colour: colour.name,
        swatch: colour.swatch,
        // the main cloth reads plain; every other cloth carries its hatch
        hatchRole: hatchOf(group.ref ? clothState(group.ref.item.purpose) : 'unbound'),
        pieces,
        tiles,
        netAreaM2: pieces.reduce((sum, piece) => sum + (piece.areaM2 ?? 0), 0),
        panelCount: pieces.reduce((sum, piece) => sum + (piece.qty ?? 0), 0),
      };
    })
    .filter((group) => group.pieces.length);

  // one scale for every tile, so a flap reads small next to the back
  const boxes = groups.flatMap((group) => group.tiles.map((tile) => tile.box)).filter(Boolean);
  const scaleCm = Math.max(1, ...boxes.map((box) => Math.max(box!.w, box!.h)));

  return {
    groups,
    scaleCm,
    paired: groups.some((group) => group.tiles.some((tile) => tile.paired)),
    grainLayer: geometry?.grainLayer ?? '',
    pieceCount: sourcePieces.length,
    panelCount: sourcePieces.reduce((sum, piece) => sum + (piece.piecesPerGarment ?? 0), 0),
    hasGeometry: Boolean(geometry?.shapeByKey),
    emptyGap: !sourcePieces.length
      ? add('pdf_pieces_missing', t('gaps.pieces'), 'pieces')
      : undefined,
  };
}
