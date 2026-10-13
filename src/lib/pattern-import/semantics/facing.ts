// MOOD Ф3.3 (R11) — a facing FOLD LINE drawn across a piece in the size's own pen.
//
// Mood cuts a facing in one with the piece: the outline runs round both, and a line across the
// piece — drawn by every size in its own pen, both ends on that size's outline, "Facing Fold Line"
// printed on it — is where the facing folds back (MOOD-DIAG §1.3). The fill reads the outline
// round both sides (the exterior flood does not see a line inside), so two dangers are silent:
//   • the fold line is a size line inside the outline: features skip it as "the size's own line" —
//     the piece leaves WITHOUT its fold;
//   • where the facing's own lines do not close in a size, the fill stops at the fold line — the
//     piece leaves WITHOUT its facing.
// Two evidences make a line a facing fold (D3): it is a line of the outline's OWN size whose two
// ends lie on that outline, and a fold word is printed on or along it. Then it is written as an
// internal line (layer 8, "fold line"). A fold line the outline runs ALONG while the size's own
// lines go on beyond it (the side seams cross into the facing) is a cut-off facing: the piece stops.
import type { ChainId, ChainSet, IRText, PieceCandidate, PtMm, Sheet } from '../types';
import { closestOnPolyline, dist, pointInPolygon } from './geom';

/** A fold word: "Facing Fold Line", "fold line", "FOLD" (not the grain, not "on fold" alone). */
export const FOLD_LINE_WORDS = /\bfold\b/i;
/** The word lies on the line (its box centre this close), mm … */
export const FOLD_TEXT_ON_MM = 15;
/** …or is turned along it (± 10°) this close, mm. */
export const FOLD_TEXT_ALONG_MM = 30;
/** A line's end is on the outline within this, mm. */
const END_ON_MM = 2;
/** A chord: this share of it lies inside the outline, farther than 1.5 mm from it. */
const INTERIOR_SHARE = 0.8;
/** The outline runs along a line: this share of it within 1 mm of the outline. */
const ALONG_SHARE = 0.6;
const MIN_LEN_MM = 30;

export type FoldChord = { chain: ChainId; pts: PtMm[]; text: string };

export type FacingRead = {
  /** Own-size lines across the piece named fold — internal fold lines of this size. */
  interior: FoldChord[];
  /** Own-size fold lines the outline runs along while the size's lines go on beyond: cut off. */
  cutOff: FoldChord[];
};

const centre = (t: IRText): PtMm => ({
  x: (t.bbox.minX + t.bbox.maxX) / 2,
  y: (t.bbox.minY + t.bbox.maxY) / 2,
});

/** Points every `step` mm along an open polyline. */
function samples(pts: readonly PtMm[], step = 2): PtMm[] {
  const out: PtMm[] = [];
  let next = step / 2;
  let s0 = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const l = dist(a, b);
    if (l < 1e-9) continue;
    for (; next <= s0 + l; next += step) {
      const k = (next - s0) / l;
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    }
    s0 += l;
  }
  return out;
}

const lenOf = (pts: readonly PtMm[]) => {
  let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) L += dist(pts[i], pts[i + 1]);
  return L;
};

/** The fold word naming a line: on it, or turned along it, inside or by the outline. */
function foldWordOn(pts: readonly PtMm[], texts: readonly IRText[]): string | null {
  for (const t of texts) {
    if (!FOLD_LINE_WORDS.test(t.text)) continue;
    const c = centre(t);
    const f = closestOnPolyline(c, pts, false);
    if (f.d <= FOLD_TEXT_ON_MM) return t.text.trim();
    if (f.d > FOLD_TEXT_ALONG_MM) continue;
    const a = pts[f.seg];
    const b = pts[Math.min(pts.length - 1, f.seg + 1)];
    const dir = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    const d = (((t.rotationDeg - dir) % 180) + 180) % 180;
    if (Math.min(d, 180 - d) <= 10) return t.text.trim();
  }
  return null;
}

/** The chains of the candidate's own size class (by its rank), or null when it has none. */
export function ownSizeChains(cand: PieceCandidate, set: ChainSet): Set<ChainId> | null {
  const k = set.classes.find(
    (c) =>
      c.role === 'size' &&
      c.evidence.some((e) => e.kind === 'nesting-order' && e.rank === cand.rank),
  );
  return k ? new Set(k.chains) : null;
}

/**
 * The facing fold lines of one candidate (one size): its own size's lines named fold by a word on
 * or along them — across the outline (both ends on it) or along it with the size going on beyond.
 */
export function facingFolds(
  cand: PieceCandidate,
  set: ChainSet,
  sheet: Pick<Sheet, 'texts'> | undefined,
): FacingRead {
  const out: FacingRead = { interior: [], cutOff: [] };
  const outer = cand.outer;
  if (outer.length < 3 || !sheet) return out;
  const own = ownSizeChains(cand, set);
  if (!own?.size) return out;
  const pad = FOLD_TEXT_ALONG_MM;
  const b = cand.bbox;
  const texts = sheet.texts.filter((t) => {
    if (!FOLD_LINE_WORDS.test(t.text)) return false;
    const c = centre(t);
    return c.x >= b.minX - pad && c.x <= b.maxX + pad && c.y >= b.minY - pad && c.y <= b.maxY + pad;
  });
  if (!texts.length) return out;
  const onOutline = (p: PtMm, tol: number) => closestOnPolyline(p, outer, true).d <= tol;
  for (const id of own) {
    const c = set.chains[id];
    if (!c || c.closed || c.pts.length < 2 || c.lengthMm < MIN_LEN_MM) continue;
    const cb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const p of c.pts) {
      cb.x0 = Math.min(cb.x0, p.x);
      cb.y0 = Math.min(cb.y0, p.y);
      cb.x1 = Math.max(cb.x1, p.x);
      cb.y1 = Math.max(cb.y1, p.y);
    }
    if (cb.x1 < b.minX - 2 || cb.x0 > b.maxX + 2 || cb.y1 < b.minY - 2 || cb.y0 > b.maxY + 2)
      continue;
    const word = foldWordOn(c.pts, texts);
    if (!word) continue;
    const smp = samples(c.pts);
    if (!smp.length) continue;
    const a = c.pts[0];
    const z = c.pts[c.pts.length - 1];
    const interior =
      smp.filter((p) => pointInPolygon(p, outer) && !onOutline(p, 1.5)).length / smp.length;
    if (onOutline(a, END_ON_MM) && onOutline(z, END_ON_MM) && interior >= INTERIOR_SHARE) {
      out.interior.push({ chain: id, pts: c.pts, text: word });
      continue;
    }
    const along = smp.filter((p) => onOutline(p, 1)).length / smp.length;
    if (along < ALONG_SHARE) continue;
    // the size's own lines go on beyond the fold: a line of the size through either end of the
    // fold (a side seam carried down into the facing) runs ≥ 10 mm outside the outline there
    const span = lenOf(c.pts);
    const ux = (z.x - a.x) / (dist(a, z) || 1);
    const uy = (z.y - a.y) / (dist(a, z) || 1);
    let beyond = 0;
    for (const oid of own) {
      if (oid === id) continue;
      const o = set.chains[oid];
      if (!o || o.pts.length < 2) continue;
      const through = [a, z].some((e) => closestOnPolyline(e, o.pts, o.closed).d <= 3);
      if (!through) continue;
      for (const p of samples(o.pts)) {
        const t = (p.x - a.x) * ux + (p.y - a.y) * uy;
        if (t < -0.1 * span || t > 1.1 * span) continue;
        if (Math.min(dist(p, a), dist(p, z)) > 300) continue;
        if (!pointInPolygon(p, outer) && !onOutline(p, 1.5)) beyond += 2;
      }
    }
    if (beyond >= 10) out.cutOff.push({ chain: id, pts: c.pts, text: word });
  }
  return out;
}
