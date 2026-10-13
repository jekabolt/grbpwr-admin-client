// MOOD Ф3.3 (R11) — a facing FOLD LINE drawn across a piece by the sizes' pens.
//
// Mood cuts a facing in one with the piece: the outline runs round both, and a line across the
// piece — drawn by every size in its own pen in one place (an overlay, sizes/overlay.ts), "Facing
// Fold Line" printed on it — is where the facing folds back (MOOD-DIAG §1.3). Each size's side
// lines turn at it (the facing mirrors the piece), so a size's fold is the stretch of that line
// between the size's own two sides. The fill reads the outline round both parts (the exterior
// flood does not see a line inside), so two dangers are silent:
//   • the fold line is a size line inside the outline: features skip it as "a size's own line" —
//     the piece leaves WITHOUT its fold;
//   • where the facing's lines do not close in a size, the fill stops at the fold line — the piece
//     leaves WITHOUT its facing.
// Two evidences make a line across the outline a facing fold (D3): the fold word printed on or
// along it, and the line itself proven a size line there — the outline's own size draws it, or
// ≥ 3 sizes' pens draw it in one place. Then the stretch inside the outline (side to side) is
// written as an internal line (layer 8, "fold line"). A fold line the outline runs ALONG while the
// size's own lines go on beyond it (its sides carried into the facing) is a cut-off facing.
import type { ChainId, ChainSet, IRText, PieceCandidate, PtMm, Sheet } from '../types';
import { overlayShare, type OverlayLines } from '../sizes/overlay';
import { classOverlayLines } from '../pieces/walls';
import { closestOnPolyline, dist, pointInPolygon } from './geom';

/**
 * A fold LINE: "Facing Fold Line", "Fold Line". A bare "FOLD" (Mood prints it along a cut-on-fold
 * edge, beside "Cut 1 on fold") names an edge, not a line across the piece.
 */
export const FOLD_LINE_WORDS = /\bfold[\s-]*line\b/i;
/** …but not a cut-on-fold instruction ("Place on fold", "cut on fold"): that names an EDGE. */
const PLACE_ON_FOLD = /\b(place[ds]?|cut|lay)\s+(it\s+)?(on|to|at)\s+(the\s+)?fold/i;
/** The word lies on the line (its box centre this close), mm … */
export const FOLD_TEXT_ON_MM = 15;
/** …or is turned along it (± 10°) this close, mm. */
export const FOLD_TEXT_ALONG_MM = 30;
/** The stretch inside reaches the outline at both ends within this, mm. */
const END_ON_MM = 2;
/** …the size's own line, drawn, within this of it, mm. */
const END_NEAR_MM = 15;
/** A stretch inside the outline at least this long, mm. */
const MIN_LEN_MM = 30;
/** The outline runs along a fold line: this much of it within 1 mm of the outline, mm. */
const ALONG_MIN_MM = 30;
/** The stretch is proven by the pens: this share of it on an overlay. */
const PROVEN_SHARE = 0.8;

export type FoldChord = { pts: PtMm[]; text: string; chains: ChainId[] };

export type FacingRead = {
  /** The fold line across this size's outline, side to side (none, or one). */
  interior: FoldChord[];
  /** A fold line this size's outline runs along while its own lines go on beyond: cut off. */
  cutOff: FoldChord[];
};

const centre = (t: IRText): PtMm => ({
  x: (t.bbox.minX + t.bbox.maxX) / 2,
  y: (t.bbox.minY + t.bbox.maxY) / 2,
});

/** Points every `step` mm along an open polyline. */
function samples(pts: readonly PtMm[], step: number): PtMm[] {
  const out: PtMm[] = [];
  let next = 0;
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
  const z = pts[pts.length - 1];
  if (z && (!out.length || dist(out[out.length - 1], z) > 1e-6)) out.push(z);
  return out;
}

const lenOf = (pts: readonly PtMm[]) => {
  let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) L += dist(pts[i], pts[i + 1]);
  return L;
};

/** The fold word naming a line: on it, or turned along it. */
function foldWordOn(pts: readonly PtMm[], texts: readonly IRText[]): string | null {
  for (const t of texts) {
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

const overlays = new WeakMap<ChainSet, OverlayLines>();
/** The size classes' overlay lines, built once per chain set. */
function overlayOf(set: ChainSet, nSizes?: number): OverlayLines {
  let L = overlays.get(set);
  if (!L) {
    let n = nSizes ?? 0;
    if (!n)
      for (const k of set.classes)
        for (const e of k.evidence)
          if (k.role === 'size' && e.kind === 'nesting-order') n = Math.max(n, e.rank + 1);
    L = classOverlayLines(set, n);
    overlays.set(set, L);
  }
  return L;
}

/** The size class of a candidate's rank: its chains (null: none). */
export function ownSizeChains(cand: PieceCandidate, set: ChainSet): Set<ChainId> | null {
  const k = set.classes.find(
    (c) =>
      c.role === 'size' &&
      c.evidence.some((e) => e.kind === 'nesting-order' && e.rank === cand.rank),
  );
  return k ? new Set(k.chains) : null;
}

/** The longest run of `smp` for which `ok` holds (indices, inclusive). */
function longestRun(n: number, ok: (i: number) => boolean): [number, number] | null {
  let best: [number, number] | null = null;
  let i = 0;
  while (i < n) {
    if (!ok(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n && ok(j + 1)) j++;
    if (!best || j - i > best[1] - best[0]) best = [i, j];
    i = j + 1;
  }
  return best;
}

/**
 * The facing fold of one candidate (one size): a size line named fold by a word on or along it,
 * across the outline from side to side (its stretch inside, proven a size line by the outline's
 * own pen or by ≥ 3 pens in one place), or along the outline with the size going on beyond it.
 * `overlay`: the class lines as overlay evidence (built here when absent).
 */
export function facingFolds(
  cand: PieceCandidate,
  set: ChainSet,
  sheet: Pick<Sheet, 'texts'> | undefined,
  nSizes?: number,
  overlay?: OverlayLines | null,
): FacingRead {
  const out: FacingRead = { interior: [], cutOff: [] };
  const outer = cand.outer;
  if (outer.length < 3 || !sheet) return out;
  const own = ownSizeChains(cand, set);
  if (!own?.size) return out;
  const pad = FOLD_TEXT_ALONG_MM;
  const b = cand.bbox;
  const texts = sheet.texts.filter((t) => {
    if (!FOLD_LINE_WORDS.test(t.text) || PLACE_ON_FOLD.test(t.text)) return false;
    const c = centre(t);
    return c.x >= b.minX - pad && c.x <= b.maxX + pad && c.y >= b.minY - pad && c.y <= b.maxY + pad;
  });
  if (!texts.length) return out;
  // the size lines named fold near this outline
  const sized = new Set<ChainId>();
  for (const k of set.classes) if (k.role === 'size') for (const id of k.chains) sized.add(id);
  const named: { id: ChainId; text: string }[] = [];
  for (const id of sized) {
    const c = set.chains[id];
    if (!c || c.closed || c.pts.length < 2 || c.lengthMm < MIN_LEN_MM) continue;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of c.pts) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    if (x1 < b.minX - 2 || x0 > b.maxX + 2 || y1 < b.minY - 2 || y0 > b.maxY + 2) continue;
    const text = foldWordOn(c.pts, texts);
    if (text) named.push({ id, text });
  }
  if (!named.length) return out;
  const L = overlay ?? overlayOf(set, nSizes);
  const dOut = (p: PtMm) => closestOnPolyline(p, outer, true).d;
  // the size's own line first (written as drawn), then the longest: the largest size's line
  // reaches across every smaller outline
  named.sort(
    (x, y) =>
      Number(own.has(y.id)) - Number(own.has(x.id)) ||
      set.chains[y.id].lengthMm - set.chains[x.id].lengthMm,
  );
  for (const { id, text } of named) {
    const c = set.chains[id];
    const smp = samples(c.pts, 0.5);
    // ── across: the longest stretch inside the outline, reaching it at both ends ──
    const run = longestRun(smp.length, (i) => pointInPolygon(smp[i], outer) || dOut(smp[i]) <= 0.3);
    if (run) {
      const part = smp.slice(run[0], run[1] + 1);
      const len = lenOf(part);
      const ownLine = own.has(id);
      // the size's own line stops short of its sides (Mood: ~10 mm, where the facing's side turns);
      // another size's line, proven by the pens, is cut by this outline itself
      const endOn = ownLine ? END_NEAR_MM : END_ON_MM;
      if (
        !out.interior.length &&
        len >= MIN_LEN_MM &&
        dOut(part[0]) <= endOn &&
        dOut(part[part.length - 1]) <= endOn &&
        // the stretch runs inside, not along the outline (a fold EDGE is the fold module's)
        part.filter((p) => dOut(p) > 1.5).length >= 0.8 * part.length &&
        (ownLine || (!!L && overlayShare(part, L, null) >= PROVEN_SHARE))
      ) {
        out.interior.push({ pts: part, text, chains: [id] });
        continue;
      }
    }
    // ── along: the outline runs on the fold line; the size's own lines go on beyond it ──
    const on = longestRun(smp.length, (i) => dOut(smp[i]) <= 1);
    if (!on) continue;
    const seg = smp.slice(on[0], on[1] + 1);
    if (lenOf(seg) < ALONG_MIN_MM) continue;
    if (!own.has(id) && !(L && overlayShare(seg, L, null) >= PROVEN_SHARE)) continue;
    const a = seg[0];
    const z = seg[seg.length - 1];
    let beyond = 0;
    for (const oid of own) {
      if (oid === id) continue;
      const o = set.chains[oid];
      if (!o || o.pts.length < 2) continue;
      if (![a, z].some((e) => closestOnPolyline(e, o.pts, o.closed).d <= 3)) continue;
      for (const p of samples(o.pts, 2))
        if (Math.min(dist(p, a), dist(p, z)) <= 300 && !pointInPolygon(p, outer) && dOut(p) > 1.5)
          beyond += 2;
    }
    if (beyond >= 10) out.cutOff.push({ pts: seg, text, chains: [id] });
  }
  return out;
}
