// A STRIP IS NOT A PATTERN PIECE. It lives on the card as a row of its own (`cutStrips`), hangs off a
// BOM line, and shares only the key space with the pieces, so a step's inputs and a seam's anchors
// can name it. Everything that lays out a step reads it as one more piece; everything that cuts
// cloth never sees it.
//
// So the virtual rows are added to the READ view here and nowhere else. They must never reach the
// form's `pieces` (the mapper would save them) nor the raw card that the cut sheet, the marker and
// the fabric norm read. This file is pure: the assembly worker imports it.
import type { common_TechCard } from 'api/proto-http/admin';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import type { CutStripMark } from 'lib/assembly-skeleton/types';
import type { PieceDTO } from 'lib/nesting/types';

import { sizeTokensOf } from '../nesting/block-code';
import type { FoundPiece } from '../nesting/dxf-geometry';
import { stripCutMm, stripSewnMm } from './lengths';

type StripLengths = Parameters<typeof stripSewnMm>[0];

/** A strip as both the card read (proto decimals) and the form (strings) carry it. */
export type CutStripLike = StripLengths & {
  lineKey?: string | null;
  bomLineKey?: string | null;
  seamKey?: string | null;
  widthMm?: string | number | { value?: string | null } | null;
  qty?: number | null;
};

export type BomLineLike = { lineKey?: string | null; name?: string | null };

const decimal = (value: CutStripLike['widthMm'], fallback: number): number => {
  const text = (typeof value === 'object' && value !== null ? value.value ?? '' : value ?? '')
    .toString()
    .trim()
    .replace(',', '.');
  const parsed = text ? Number(text) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const keyOf = (strip: CutStripLike) => (strip.lineKey ?? '').trim();

const NO_STRIPS: readonly CutStripLike[] = [];

/**
 * The card's strips. The read carries them beside the insert; a live form card, inside it. The same
 * empty list every time: this is a memo dependency.
 */
export function cutStripsOfCard(card: common_TechCard | undefined): readonly CutStripLike[] {
  const inside = card?.techCard as { cutStrips?: readonly CutStripLike[] } | undefined;
  return ((card as { cutStrips?: readonly CutStripLike[] } | undefined)?.cutStrips ??
    inside?.cutStrips ??
    NO_STRIPS) as readonly CutStripLike[];
}

export function stripKeysOf(strips: readonly CutStripLike[]): ReadonlySet<string> {
  return new Set(strips.map(keyOf).filter(Boolean));
}

export function stripKeysOfCard(card: common_TechCard | undefined): ReadonlySet<string> {
  return stripKeysOf(cutStripsOfCard(card));
}

/**
 * The BOM lines a step consumes: the ones linked to it, and the line of each strip it sews. A strip in
 * a step is the trim in that step, nobody should have to link the line a second time.
 */
export function bomLinesOfStep(
  op: {
    bomLineKeys?: readonly string[] | null;
    inputKeys?: readonly string[] | null;
    pieceLineKeys?: readonly string[] | null;
  },
  strips: readonly CutStripLike[],
): string[] {
  const inputs = op.inputKeys?.length ? op.inputKeys : op.pieceLineKeys ?? [];
  const sewn = strips
    .filter((strip) => inputs.includes(keyOf(strip)))
    .map((strip) => (strip.bomLineKey ?? '').trim())
    .filter(Boolean);
  return [...new Set([...(op.bomLineKeys ?? []).map((key) => key.trim()), ...sewn])];
}

/** Strips of a BOM line one step sews: the trim's quantity there when nobody typed one. */
export function stripQtyInStep(
  op: { inputKeys?: readonly string[] | null; pieceLineKeys?: readonly string[] | null },
  strips: readonly CutStripLike[],
  bomLineKey: string,
): number | null {
  const inputs = op.inputKeys?.length ? op.inputKeys : op.pieceLineKeys ?? [];
  const sewn = strips.filter(
    (strip) => (strip.bomLineKey ?? '').trim() === bomLineKey && inputs.includes(keyOf(strip)),
  );
  return sewn.length ? sewn.reduce((sum, strip) => sum + (strip.qty || 1), 0) : null;
}

/** The tile's and the picture's name: the BOM line's, never the strip's key. */
export function stripName(strip: CutStripLike, bomLines: readonly BomLineLike[] = []): string {
  const key = (strip.bomLineKey ?? '').trim();
  const line = key ? bomLines.find((row) => (row.lineKey ?? '').trim() === key) : undefined;
  return (line?.name ?? '').trim() || 'strip';
}

export type StripRef = { lineKey: string; name: string; strip: { qty: number } };

/** The strips as the assembly surfaces list them, after the pieces. */
export function stripRefsOf(
  strips: readonly CutStripLike[],
  bomLines: readonly BomLineLike[] = [],
): StripRef[] {
  return strips.flatMap((strip) => {
    const lineKey = keyOf(strip);
    return lineKey
      ? [{ lineKey, name: stripName(strip, bomLines), strip: { qty: strip.qty || 1 } }]
      : [];
  });
}

/**
 * The read view with one virtual row per strip. Idempotent, and the raw card when there are none.
 * No materials on the row: a strip is not cut from cloth, and a binding line's purpose would
 * otherwise colour it as contrast.
 */
export function withStripPieces(card: common_TechCard): common_TechCard {
  const ins = card.techCard;
  const strips = cutStripsOfCard(card);
  if (!ins || strips.length === 0) return card;
  const known = new Set((ins.pieces ?? []).map((piece) => piece.lineKey));
  const rows = stripRefsOf(strips, ins.bomItems ?? [])
    .filter((ref) => !known.has(ref.lineKey))
    .map((ref) => ({
      lineKey: ref.lineKey,
      name: ref.name,
      piecesPerGarment: ref.strip.qty,
      materials: [],
    }));
  if (rows.length === 0) return card;
  return {
    ...card,
    techCard: { ...ins, pieces: [...(ins.pieces ?? []), ...(rows as never[])] },
  };
}

type AnchorLike = { piece?: string; pieceLineKey?: string };
type SideLike = readonly AnchorLike[] | { parts?: readonly AnchorLike[] } | undefined;
type SeamRowLike = { sideA?: SideLike; sideB?: SideLike };

const anchorsOf = (side: SideLike): readonly AnchorLike[] =>
  Array.isArray(side) ? side : (side as { parts?: readonly AnchorLike[] })?.parts ?? [];

/** The row holds a strip on one of its sides. Works on a stored row and on the wire alike. */
export function rowTouchesStrip(row: SeamRowLike, keys: ReadonlySet<string>): boolean {
  if (keys.size === 0) return false;
  const named = (anchor: AnchorLike) =>
    keys.has(anchor.piece ?? '') || keys.has(anchor.pieceLineKey ?? '');
  return anchorsOf(row.sideA).some(named) || anchorsOf(row.sideB).some(named);
}

/**
 * The card as the garment read must see it: no strip anywhere. A rectangle in the pool would pair
 * with the first waistband or belt loop of its length and change what the real pieces read as, so
 * the read runs without strips and their seams stand on their stored rows alone.
 */
export function withoutStripPieces(card: common_TechCard): common_TechCard {
  const keys = stripKeysOfCard(card);
  const ins = card.techCard;
  if (!ins || keys.size === 0) return card;
  const rows = (card.seams ?? []) as unknown as (SeamRowLike & { seamKey?: string })[];
  const seamKeys = new Set(
    rows.filter((row) => rowTouchesStrip(row, keys)).map((row) => row.seamKey ?? ''),
  );
  return {
    ...card,
    seams: rows.filter((row) => !seamKeys.has(row.seamKey ?? '')) as never,
    techCard: {
      ...ins,
      pieces: (ins.pieces ?? []).filter((piece) => !keys.has(piece.lineKey ?? '')),
      operations: withoutStripInputs(ins.operations ?? [], keys, seamKeys),
    },
  };
}

type StepInputsLike = {
  inputKeys?: readonly string[];
  pieceLineKeys?: readonly string[];
  seamKeys?: readonly string[];
};

/** The steps with their strips, and the seams that sew them, taken out. A clean step stays the same. */
export function withoutStripInputs<O extends StepInputsLike>(
  operations: readonly O[],
  keys: ReadonlySet<string>,
  seamKeys: ReadonlySet<string> = new Set(),
): O[] {
  return operations.map((operation) => {
    const touches =
      operation.inputKeys?.some((key) => keys.has(key)) ||
      operation.pieceLineKeys?.some((key) => keys.has(key)) ||
      operation.seamKeys?.some((key) => seamKeys.has(key));
    if (!touches) return operation;
    return {
      ...operation,
      inputKeys: operation.inputKeys?.filter((key) => !keys.has(key)),
      pieceLineKeys: operation.pieceLineKeys?.filter((key) => !keys.has(key)),
      seamKeys: operation.seamKeys?.filter((key) => !seamKeys.has(key)),
    } as O;
  });
}

export type StripDrawOptions = {
  /** The size token the pattern pieces were read at, so strip and waistband agree. */
  sizeToken?: string;
  sizeNames?: ReadonlyMap<number, string>;
  baseSizeId?: number;
};

/** The sizes a strip knows, and the one it is drawn at. `null` when no length is known at all. */
export function stripDrawnSizeId(strip: CutStripLike, o: StripDrawOptions): number | null {
  const ids = (strip.sizes ?? []).map((row) => Number(row.sizeId)).filter((id) => id > 0);
  const known = (id: number) => stripSewnMm(strip, id) !== undefined;
  const token = (o.sizeToken ?? '').trim().toLowerCase();
  const named = token
    ? ids.find((id) => sizeTokensOf(o.sizeNames?.get(id)).includes(token) && known(id))
    : undefined;
  if (named !== undefined) return named;
  if (o.baseSizeId && known(o.baseSizeId)) return o.baseSizeId;
  return ids.find(known) ?? null;
}

const seamMmAt = (strip: CutStripLike, sizeId: number): number | undefined => {
  const row = strip.sizes?.find((size) => Number(size.sizeId) === sizeId);
  const value = decimal(row?.seamMm as CutStripLike['widthMm'], Number.NaN);
  return Number.isFinite(value) ? value : undefined;
};

/**
 * The facts of the drawn rectangle. `null` when it cannot be drawn: no length at any size, or no
 * width. Such a strip keeps its tile and its key; it just has no shape yet.
 */
export function stripMarkOf(
  strip: CutStripLike,
  bomLines: readonly BomLineLike[],
  o: StripDrawOptions,
): CutStripMark | null {
  const widthMm = decimal(strip.widthMm, 0);
  if (widthMm <= 0) return null;
  const one = strip.lengthMode === 'one_length';
  const sizeId = one ? 0 : stripDrawnSizeId(strip, o);
  if (sizeId === null) return null;
  const sewnMm = stripSewnMm(strip, sizeId);
  if (sewnMm === undefined || sewnMm <= 0) return null;
  const mode =
    strip.lengthMode === 'from_seam' || strip.lengthMode === 'one_length'
      ? strip.lengthMode
      : 'per_size';
  const row = strip.sizes?.find((size) => Number(size.sizeId) === sizeId);
  const manual = !one && String(row?.manualCutMm ?? '').trim() !== '';
  const seamMm = mode === 'from_seam' ? seamMmAt(strip, sizeId) : undefined;
  const sizeName = one ? undefined : formatSizeName(o.sizeNames?.get(sizeId));
  return {
    label: stripName(strip, bomLines),
    mode,
    fitPct: decimal(strip.fitPct as CutStripLike['widthMm'], 100),
    overlapMm: decimal(strip.overlapMm as CutStripLike['widthMm'], 0),
    widthMm,
    sewnMm,
    ...(seamMm !== undefined ? { seamMm } : {}),
    ...(sizeName ? { sizeName } : {}),
    ...(manual ? { manual } : {}),
  };
}

/** Stable and negative: real DXF ids are positive, and two strips must not collide in a cache key. */
function stripPieceId(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return -1 - Math.abs(hash);
}

/**
 * The rectangle a strip is drawn as, in the shape the DXF reader gives a piece (cm, counter-clockwise,
 * origin at the bbox min), so `segmentPiece` makes its edges and nothing downstream knows the
 * difference. No grain: `grainRotation` reads that as 0, and a missing grain never marks bad geometry.
 */
export function stripFoundPiece(key: string, mark: CutStripMark, sizeToken = ''): FoundPiece {
  const w = mark.sewnMm / 10;
  const h = mark.widthMm / 10;
  const piece: PieceDTO = {
    id: stripPieceId(key),
    name: mark.label,
    source: 'cut strip',
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
  return { piece, block: '', size: sizeToken, instances: 1, layer: '', sizes: [sizeToken] };
}

/** The token most of the card's found pieces were read at: the size the picture is drawn in. */
export function drawnSizeToken(found: Iterable<{ size?: string } | null>): string {
  const counts = new Map<string, number>();
  for (const hit of found) {
    const size = (hit?.size ?? '').trim();
    if (size) counts.set(size, (counts.get(size) ?? 0) + 1);
  }
  let best = '';
  let most = 0;
  for (const [size, count] of counts) {
    if (count > most) {
      best = size;
      most = count;
    }
  }
  return best;
}

export type StripDrawing = { key: string; found: FoundPiece; mark: CutStripMark };

/** Every strip that has a shape at the drawn size. */
export function stripDrawingsOf(
  strips: readonly CutStripLike[],
  bomLines: readonly BomLineLike[],
  o: StripDrawOptions,
): StripDrawing[] {
  return strips.flatMap((strip) => {
    const key = keyOf(strip);
    const mark = key ? stripMarkOf(strip, bomLines, o) : null;
    return key && mark ? [{ key, mark, found: stripFoundPiece(key, mark, o.sizeToken) }] : [];
  });
}

export { stripCutMm, stripSewnMm };
