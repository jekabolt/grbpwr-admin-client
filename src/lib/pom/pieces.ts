// What each piece is for the POM engine: kind (from the name, read by the SAME role book the
// assembly skeleton uses), garment kind, girth multiplier, identical layers.

import { readName } from 'lib/assembly-skeleton/skeleton';
import type { PieceGeom, SkeletonCategory, SkeletonPieceInput } from 'lib/assembly-skeleton/types';
import { bboxOf } from './geom';
import type { GarmentKind, PieceInfo, PieceKind } from './types';

const ROLE_KIND: Record<string, PieceKind> = {
  front: 'front',
  back: 'back',
  side: 'side',
  yoke: 'yoke',
  sleeve: 'sleeve',
  collar: 'collar',
  stand: 'stand',
  cuff: 'cuff',
  placket: 'placket',
  facing: 'facing',
  pocket: 'pocket',
  waistband: 'waistband',
  hood: 'hood',
  rib: 'rib',
  hemband: 'hemband',
  loop: 'loop',
  fly: 'fly',
  skirt: 'skirt',
};

/** Kinds that are small by nature: a body-sized piece named like one is not believed. */
const SMALL_KINDS: ReadonlySet<PieceKind> = new Set(['pocket', 'loop', 'fly', 'cuff']);

export const BODY_TOP: ReadonlySet<PieceKind> = new Set(['front', 'back', 'side', 'yoke']);
export const LEG: ReadonlySet<PieceKind> = new Set(['leg-front', 'leg-back', 'skirt']);
export const STRIP: ReadonlySet<PieceKind> = new Set([
  'cuff',
  'placket',
  'facing',
  'waistband',
  'rib',
  'hemband',
  'loop',
  'fly',
]);

/**
 * House abbreviations the shared role book does not carry, read ONLY by the POM engine and only in
 * the shape the prod cards use them (SS26-006 / SS26-008 / SS26-011, 10.10): P_L / P_R = front
 * panel next to a BP back panel, MP = middle (side) panel, BPU = back upper (yoke), WST = waistband.
 */
function houseToken(
  name: string,
  hand: 'L' | 'R' | null,
  fileHasBackPanel: boolean,
): { kind: PieceKind; why: string } | null {
  const toks = name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const head = toks[0];
  if (head === 'wst')
    return { kind: 'waistband', why: `«${name}»: WST read as waistband (house abbreviation)` };
  if (head === 'mp')
    return {
      kind: 'side',
      why: `«${name}»: MP read as a middle / side panel (house abbreviation)`,
    };
  if (head === 'bpu')
    return {
      kind: 'yoke',
      why: `«${name}»: BPU read as the back upper / yoke (house abbreviation)`,
    };
  if (head === 'p' && hand && fileHasBackPanel && !toks.includes('u'))
    return {
      kind: 'front',
      why: `«${name}»: P with a hand read as the front panel — the file names BP back panels (house abbreviation)`,
    };
  return null;
}

export function garmentOf(category: SkeletonCategory, kinds: PieceKind[]): GarmentKind {
  if (category === 'trousers' || category === 'skirt') return 'bottom';
  if (category !== 'generic') return 'top';
  if (kinds.some((k) => k === 'sleeve' || k === 'collar' || k === 'stand')) return 'top';
  if (kinds.some((k) => k === 'waistband')) return 'bottom';
  return 'top';
}

/** Girth multiplier from the card: a FOLD half or a block cut as a mirrored pair counts twice. */
function girthMultOf(input: SkeletonPieceInput, hand: 'L' | 'R' | null): number {
  const sym = (input.cutSymmetry ?? '').toUpperCase();
  if (sym.includes('FOLD')) return 2;
  if (sym.includes('MIRROR') && input.piecesPerGarment >= 2 && !hand) return 2;
  return 1;
}

export function readPieces(
  inputs: readonly SkeletonPieceInput[],
  geoms: readonly PieceGeom[],
  category: SkeletonCategory,
): { pieces: PieceInfo[]; garment: GarmentKind } {
  const geomOf = new Map(geoms.map((g) => [g.pieceKey, g]));
  const fileHasBackPanel = inputs.some((p) => readName(p.name).role === 'back');
  const maxArea = Math.max(1, ...geoms.map((g) => g.areaMm2));
  const raw = inputs.map((inp) => {
    const g = geomOf.get(inp.pieceKey);
    const reading = readName(inp.name);
    let kind: PieceKind = reading.role ? ROLE_KIND[reading.role] ?? 'unknown' : 'unknown';
    let why = reading.role
      ? `name «${inp.name}» reads ${reading.role}`
      : `name «${inp.name}» names no role`;
    if (!reading.role) {
      const extra = houseToken(inp.name, reading.hand, fileHasBackPanel);
      if (extra) {
        kind = extra.kind;
        why = extra.why;
      }
    }
    if (g && SMALL_KINDS.has(kind)) {
      const bb = bboxOf(g.rs);
      if (g.areaMm2 > 0.25 * maxArea && Math.max(bb.w, bb.h) > 400) {
        why = `name «${inp.name}» reads ${kind}, but the piece is body-sized (${Math.round(bb.w)}×${Math.round(bb.h)} mm) — not believed`;
        kind = 'unknown';
      }
    }
    let hand = g?.hand ?? reading.hand;
    // FL / FR, body-sized: front left / right (house naming; «fl» alone is a flap in the role book).
    const head = inp.name.toLowerCase().split(/[^\p{L}\p{N}]+/u)[0] ?? '';
    if ((head === 'fl' || head === 'fr') && g && g.areaMm2 > 0.25 * maxArea && !hand) {
      kind = 'front';
      hand = head === 'fl' ? 'L' : 'R';
      why = `«${inp.name}»: body-sized ${head.toUpperCase()} read as the front ${hand === 'L' ? 'left' : 'right'} (house naming)`;
    }
    return { inp, g, kind, why, hand };
  });
  const garment = garmentOf(
    category,
    raw.map((r) => r.kind),
  );
  // A sleeve-named piece far smaller than the sleeve is a cuff (FW26-001: SLV_M_L 27×14 cm next to
  // a 41×52 cm SLV_L).
  const sleeveH = Math.max(
    1,
    ...raw.filter((r) => r.g && r.kind === 'sleeve').map((r) => bboxOf(r.g!.rs).h),
  );
  for (const r of raw) {
    if (r.kind !== 'sleeve' || !r.g) continue;
    const bb = bboxOf(r.g.rs);
    if (bb.h < 0.35 * sleeveH && bb.w > 1.5 * bb.h) {
      r.kind = 'cuff';
      r.why = `${r.why}, but it is a ${Math.round(bb.w)}×${Math.round(bb.h)} mm band next to a ${Math.round(sleeveH)} mm sleeve — read as a cuff`;
    }
  }
  // A back-named piece that is a short wide strip above a taller back is a yoke (Allsizes: BP is
  // the yoke, BP_1 the back): the name says «back», the shape says where it sits.
  const bodyH = Math.max(
    1,
    ...raw.filter((r) => r.g && BODY_TOP.has(r.kind)).map((r) => bboxOf(r.g!.rs).h),
  );
  const pieces: PieceInfo[] = raw.map(({ inp, g, kind, why, hand }) => {
    let k = kind;
    if (garment === 'top' && kind === 'back' && g) {
      const bb = bboxOf(g.rs);
      if (bb.h < 0.3 * bodyH && bb.w > 2.5 * bb.h) {
        k = 'yoke';
        why = `${why}; a short wide strip (${Math.round(bb.w)}×${Math.round(bb.h)} mm) against a ${Math.round(bodyH)} mm body — read as a yoke`;
      }
    }
    if (garment === 'top' && kind === 'back' && /(^|[^a-z])u([^a-z]|$)/i.test(inp.name)) {
      k = 'yoke';
      why = `${why}; U (upper) read as the yoke`;
    }
    if (garment === 'bottom' && (kind === 'front' || kind === 'back') && g) {
      const legH = Math.max(
        1,
        ...raw
          .filter((r) => r.g && (r.kind === 'front' || r.kind === 'back'))
          .map((r) => bboxOf(r.g!.rs).h),
      );
      if (bboxOf(g.rs).h < 0.4 * legH) {
        k = 'unknown';
        why = `${why}, but it is ${Math.round(bboxOf(g.rs).h)} mm tall against a ${Math.round(legH)} mm leg — not a leg panel`;
      } else k = kind === 'front' ? 'leg-front' : 'leg-back';
    }
    return {
      pieceKey: inp.pieceKey,
      name: inp.name,
      kind: k,
      hand,
      lining: g?.cloth === 'lining' || inp.cloth === 'lining',
      girthMult: girthMultOf(inp, hand),
      layerOf: null,
      why,
    };
  });
  // Identical layers: an identical twin with the same hand duplicates the first one in card order.
  const byKey = new Map(pieces.map((p) => [p.pieceKey, p]));
  const order = new Map(pieces.map((p, i) => [p.pieceKey, i]));
  for (const g of geoms) {
    const me = byKey.get(g.pieceKey);
    if (!me) continue;
    for (const t of g.twinOf) {
      const other = byKey.get(t.key);
      if (!other || t.kind !== 'identical' || other.hand !== me.hand) continue;
      if ((order.get(t.key) ?? 0) < (order.get(g.pieceKey) ?? 0) && !other.layerOf) {
        me.layerOf = t.key;
        break;
      }
    }
  }
  return { pieces, garment };
}
