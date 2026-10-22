// pieces/ (MOOD Ф0, R3 · R12) — a size line's LOOK as its identity, apart from where its ends meet.
//
// Under an identity encoding (declared dashes; recovered motifs; the drawing's own size key) every
// size has a pen, and the pen is evidence of its own: a chain drawn with the pen of size 00 is a
// line of size 00 wherever its ends happen to touch. Two consumers:
//   • connectRanks (walls.ts) — continuity (ends meeting) is ONE evidence; it may move a chain into
//     a rank only when the chain's look is that rank's look (the second). Mood Paris: the narrow
//     end of a strap where all 18 sizes meet joined the lines of 00 to 16's and exported "16" = 00.
//   • gate G22-identity — a written size block of a rank with a pen lies on that pen's chains.
// A rank whose pen is not known (the key's sample for it matches no line) proves nothing by pen.
import type {
  Chain,
  ChainId,
  ChainSet,
  LineClass,
  PieceFamily,
  PtMm,
  SizeRun,
  Style,
} from 'lib/pattern-import/types';

import { normDash } from '../chains/link';
import { sameDashShape } from '../chains/motif';
import { bboxOf, dist, pointInPoly } from './geom';

/**
 * Probe switch (node only): MOOD_F0_OFF turns every Ф0 safety off (R2, R3, G22, G24) — the mood
 * probe's "before" column on the same code.
 */
export function f0Off(): boolean {
  return typeof process !== 'undefined' && !!process.env?.MOOD_F0_OFF;
}

export type Look =
  | { kind: 'dash'; d: number[] }
  | { kind: 'motif'; m: number[] }
  /** A plain stroke, by width (robe's size 46: solid 0.42 beside five dashes). */
  | { kind: 'solid'; w: number };

const Q = 0.25;
/** Two recovered motifs of one pen keep their period within this ratio (viola: 5.5 vs 7.0 mm). */
const MOTIF_SCALE = 0.7;
const q = (v: number) => Math.round(v / Q) * Q;

export function describeLook(l: Look | null): string {
  if (!l) return 'unknown pen';
  if (l.kind === 'solid') return `solid w${l.w.toFixed(2)}`;
  return l.kind === 'dash'
    ? `dash ${l.d.map((v) => v.toFixed(2)).join('/')}`
    : `motif ${l.m.map((v) => v.toFixed(2)).join('/')}`;
}

const lookMemo = new WeakMap<Chain, { styles: ReadonlyMap<number, Style>; l: Look | null }>();

/** The look of one chain: its declared dash (the backbone style), else its recovered motif. */
export function chainLook(c: Chain, styles: ReadonlyMap<number, Style>): Look | null {
  const m = lookMemo.get(c);
  if (m && m.styles === styles) return m.l;
  const l = lookOf(c, styles);
  lookMemo.set(c, { styles, l });
  return l;
}

function lookOf(c: Chain, styles: ReadonlyMap<number, Style>): Look | null {
  const st = styles.get(c.style);
  if (st?.dash && st.dash.some((v) => v > 0.01)) return { kind: 'dash', d: normDash(st.dash) };
  if (c.motif && c.motif.length >= 2 && c.motif.some((v) => v > 0))
    return { kind: 'motif', m: c.motif };
  // a plain stroke: long pieces (a path per tile, not dashes the linker joined), not filled beads
  if (
    st &&
    !st.fill &&
    st.widthMm > 0 &&
    !c.motif &&
    c.lengthMm / Math.max(1, c.ranges.length) >= 15
  )
    return { kind: 'solid', w: st.widthMm };
  return null;
}

/**
 * The pens a size class is identified by: its dominant declared-dash / recovered-motif evidence;
 * a further look only when the operator merged or confirmed the row (confidence 1:
 * `mergeSameSize`, `confirmRows`). recover lists up to three looks per rank by length (≥ 5 %): a
 * minor one may be another size's lines ranked into it — its share is no identity. [] = none.
 */
export function classLooks(c: LineClass | undefined): Look[] {
  const all: Look[] = [];
  for (const e of c?.evidence ?? []) {
    if (e.kind === 'declared-dash' && e.dash.some((v) => v > 0.01))
      all.push({ kind: 'dash', d: normDash(e.dash) });
    if (e.kind === 'recovered-motif' && e.motif.length >= 2)
      all.push({ kind: 'motif', m: e.motif });
  }
  return c && c.confidence >= 1 ? all : all.slice(0, 1);
}

/** A pen = the looks one size is drawn with ([] = not known). */
export type Pen = Look[];
export const onPen = (l: Look, pen: Pen) => pen.some((p) => sameLook(l, p));
export const describePen = (pen: Pen) => pen.map(describeLook).join(' + ');

const closeArr = (a: number[], b: number[], tol: (x: number, y: number) => number) =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol(v, b[i]));

/**
 * Same pen? Declared dashes: the same SHAPE (ratios; Illustrator stretches each path's period a
 * little to land dashes in corners) at nearly the same scale — exact evidence. Recovered motifs are
 * measured off the drawing (a rhythm of dashes and beads, noisy per chain: viola's size 40 reads
 * 4.25/1.25 on one line and 5.00/2.00 on the next), so two motifs are the same pen unless their
 * periods differ in length or scale (> 1/0.7) or their shares of the period differ by more than a
 * quarter.
 */
export function sameLook(a: Look, b: Look): boolean {
  if (a.kind === 'solid' || b.kind === 'solid')
    return a.kind === 'solid' && b.kind === 'solid' && Math.abs(a.w - b.w) <= 0.03;
  if (a.kind === 'dash' && b.kind === 'dash') return sameDashShape(a.d, b.d, 0.15, 0.1);
  const ma = a.kind === 'dash' ? a.d.map(q) : a.m;
  const mb = b.kind === 'dash' ? b.d.map(q) : b.m;
  if (ma.length !== mb.length) return false;
  const sa = ma.reduce((x, y) => x + y, 0);
  const sb = mb.reduce((x, y) => x + y, 0);
  if (sa <= 0 || sb <= 0) return closeArr(ma, mb, () => Q + 0.01);
  // the same pen at nearly the same scale (a [2, 1] and a [6, 3] rhythm are two pens)
  if (sa / sb < MOTIF_SCALE || sb / sa < MOTIF_SCALE) return false;
  return ma.every((v, i) => {
    const x = v / sa;
    const y = mb[i] / sb;
    return Math.abs(x - y) <= Math.max(0.05, 0.25 * Math.max(x, y));
  });
}

/** The run reads its sizes from the drawing's own key ("legend 16" label evidence). */
export function legendRun(set: ChainSet): boolean {
  return set.classes.some(
    (c) =>
      c.role === 'size' &&
      c.evidence.some((e) => e.kind === 'text-label' && e.text.startsWith('legend ')),
  );
}

/** Labels whose key sample matched no line (recover's 'size-empty' question on a keyed run). */
export function keyAbsent(set: ChainSet): Set<string> {
  const out = new Set<string>();
  for (const a of set.ambiguities ?? []) {
    if (a.kind !== 'size-empty') continue;
    const m = /legend's sample for (\S+) matches no line/.exec(a.message);
    if (m) out.add(m[1].trim().toUpperCase());
  }
  return out;
}

/**
 * Per rank, the pen that identifies it — or null for every rank when the run is not identity
 * encoded (declared dashes, recovered motifs, or a key). A rank of an identity run whose class
 * carries no pen evidence takes the one look ≥ 75 % of its own lines share (robe's solid 46 beside
 * five dashes; viola's 40, whose first line had no clean rhythm). `absent[r]`: the drawing's key
 * shows the size but its sample matches no line — its lines were ranked by their neighbours
 * (MOOD-DIAG R5/R6: Paris "18" = the lines of 00): its pen is unknown and proves nothing.
 */
export function rankLooks(
  set: ChainSet,
  run: SizeRun,
  styles: ReadonlyMap<number, Style>,
): { identity: boolean; looks: Pen[]; absent: boolean[] } {
  const none = {
    identity: false,
    looks: run.sizes.map((): Pen => []),
    absent: run.sizes.map(() => false),
  };
  if (run.sizes.length < 2) return none;
  const byId = new Map(set.classes.map((c) => [c.id, c]));
  const classes = run.sizes.map((z) => (z.classId != null ? byId.get(z.classId) : undefined));
  const keyed = legendRun(set);
  const evidenced = classes.filter((c) => classLooks(c).length).length;
  const identity =
    run.encoding === 'declared-dash' ||
    ((run.encoding === 'subpath-dash' || run.encoding === 'separate-dash') &&
      (keyed || evidenced >= 2));
  if (!identity) return none;
  const gone = keyed ? keyAbsent(set) : new Set<string>();
  const absent = run.sizes.map((z) => gone.has(z.label.trim().toUpperCase()));
  const looks = classes.map((c, r): Pen => {
    const l = classLooks(c);
    if (absent[r]) return [];
    if (l.length || !c || c.role !== 'size') return l;
    // one look carried by ≥ 75 % of the class's length
    const groups: { l: Look; len: number }[] = [];
    let total = 0;
    for (const id of c.chains) {
      const ch = set.chains[id];
      if (!ch) continue;
      total += ch.lengthMm;
      const cl = chainLook(ch, styles);
      if (!cl) continue;
      const g = groups.find((x) => sameLook(x.l, cl));
      if (g) g.len += ch.lengthMm;
      else groups.push({ l: cl, len: ch.lengthMm });
    }
    const best = groups.sort((a, b) => b.len - a.len)[0];
    return best && best.len >= 0.75 * total ? [best.l] : [];
  });
  return { identity: true, looks, absent };
}

/**
 * R3 guard for continuity ranking: may chain `id` take rank `r`? Not when both looks are known and
 * differ — the pen says it is another size. Nor when r's pen is not known (its key sample matched
 * no line) but the chain's look is exactly one OTHER size's pen: that is that size's line (palto
 * P03: chain 338 — 88's hem, an undrawn 18 mm jump inside one operation, then 80's armhole, in
 * 80's pen — was voted into 88 by length, and 88 closed along 80's armhole). A chain look not
 * known (too short or irregular for a rhythm), or on no / several pens, proves nothing: continuity
 * stays as it was, and gate G22 holds a rank of unknown pen. Null when the run is no identity run.
 */
export type RankGuard = {
  ok: (id: ChainId, r: number) => boolean;
  /** The chain's look names no pen (MOOD Ф3 R5: such a line on an overlay moves nowhere). */
  lookless?: (id: ChainId) => boolean;
};

export function rankGuard(
  set: ChainSet,
  run: SizeRun,
  styles: ReadonlyMap<number, Style> | undefined,
): RankGuard | null {
  // LINEFIX: a line the operator put in a row moves into no other rank (his answer outranks
  // continuity and the pen) — a guard of that alone where the run has no pen identity
  const pin = pinnedRanks(set, run);
  // a line in two sizes moves nowhere (connectRanks holds one rank per line: a move would take it
  // out of the other)
  const pinned = (p: Set<number>, r: number) => p.size === 1 && p.has(r);
  const pinOk = (id: ChainId, r: number) => {
    const p = pin?.get(id);
    return p ? pinned(p, r) : true;
  };
  if (!styles || f0Off()) return pin ? { ok: pinOk } : null;
  const { identity, looks } = rankLooks(set, run, styles);
  if (!identity) return pin ? { ok: pinOk } : null;
  const memo = new Map<ChainId, Look | null>();
  const lookOf = (id: ChainId) => {
    if (!memo.has(id)) {
      const c = set.chains[id];
      memo.set(id, c ? chainLook(c, styles) : null);
    }
    return memo.get(id)!;
  };
  return {
    ok: (id, r) => {
      const p = pin?.get(id);
      if (p) return pinned(p, r);
      const rl = looks[r];
      const cl = lookOf(id);
      if (!cl) return true;
      if (rl?.length) return onPen(cl, rl);
      // r's pen not known: a chain on exactly one OTHER size's pen is that size's line
      return looks.filter((pen, k) => k !== r && pen.length > 0 && onPen(cl, pen)).length !== 1;
    },
    lookless: (id) => !lookOf(id),
  };
}

/** LINEFIX: per operator-answered line, the ranks its rows are (none: a common / ignore row). */
function pinnedRanks(set: ChainSet, run: SizeRun): Map<ChainId, Set<number>> | null {
  if (!set.assigned?.length) return null;
  const rankOfClass = new Map<number, number>();
  run.sizes.forEach((z, r) => {
    if (z.classId != null) rankOfClass.set(z.classId, r);
  });
  const out = new Map<ChainId, Set<number>>();
  for (const a of set.assigned)
    out.set(
      a.chain,
      new Set(a.classes.flatMap((c) => (rankOfClass.has(c) ? [rankOfClass.get(c)!] : []))),
    );
  return out;
}

// ── G22 evidence: the rank's own pen lines near an outline ──────────────────────────────────

/** Short solid stubs that close a pen's corners (Mood: 3–15 mm L-pieces at each vertex). */
const STUB_MAX_MM = 15;
const STUB_TOUCH_MM = 1.5;

/**
 * What gate G22 measures a written size against, near `box`: `own` = the chains drawn with the
 * rank's pen (+ its class's lines whose look is only measured, + the short solid stubs touching
 * their ends: Mood closes each corner with one); `foreign` = lines that are provably ANOTHER
 * size's — a declared dash of another pen, a line of another size's class or an orphan whose look
 * differs. Everything else (a line of unknown look, a bridge) is neutral. `look` null: the rank
 * has no one look — its own class's lines are its lines.
 */
export function penLines(
  set: ChainSet,
  look: Pen,
  styles: ReadonlyMap<number, Style>,
  box: { minX: number; minY: number; maxX: number; maxY: number },
  classChains: ReadonlySet<ChainId>,
  otherSizeChains: ReadonlySet<ChainId>,
  padMm = 5,
): { own: ChainId[]; foreign: ChainId[] } {
  const inBox = (c: Chain) => {
    const b = bboxOf(c.pts);
    return (
      b.maxX >= box.minX - padMm &&
      b.minX <= box.maxX + padMm &&
      b.maxY >= box.minY - padMm &&
      b.minY <= box.maxY + padMm
    );
  };
  const orphans = new Set(set.orphans);
  // LINEFIX: a line the operator put in this size's row is its own line whatever its pen — that
  // line only (the rank's pen stays what it is for every other line)
  const answered = new Set((set.assigned ?? []).map((a) => a.chain));
  const own: Chain[] = [];
  const stubs: Chain[] = [];
  const foreign: Chain[] = [];
  for (const c of set.chains) {
    if (c.pts.length < 2 || !inBox(c)) continue;
    const cl = chainLook(c, styles);
    const same = !!cl && onPen(cl, look);
    // the rank's own class line counts unless its look is EXACT (a declared dash, a plain stroke)
    // and another pen's — a recovered rhythm is measured, not declared, and may read off
    const exactOther = !!cl && look.length > 0 && cl.kind !== 'motif' && !same;
    if (same || (classChains.has(c.id) && (!exactOther || answered.has(c.id)))) {
      own.push(c);
      continue;
    }
    if (cl?.kind === 'solid' && c.lengthMm <= STUB_MAX_MM) stubs.push(c);
    const sized = otherSizeChains.has(c.id) || orphans.has(c.id);
    if ((cl?.kind === 'dash' && exactOther) || (sized && !same)) foreign.push(c);
  }
  const ends = own.flatMap((c) => [c.pts[0], c.pts[c.pts.length - 1]]);
  const touching = new Set(
    stubs
      .filter((st) => {
        const a = st.pts[0];
        const b = st.pts[st.pts.length - 1];
        return ends.some((e) => dist(e, a) <= STUB_TOUCH_MM || dist(e, b) <= STUB_TOUCH_MM);
      })
      .map((c) => c.id),
  );
  return {
    own: [...own.map((c) => c.id), ...touching],
    foreign: foreign.filter((c) => !touching.has(c.id)).map((c) => c.id),
  };
}

// ── G24 evidence: one outline, one piece ────────────────────────────────────────────────────

/** Area of the intersection of two simple polygons, by horizontal scanlines `stepMm` apart. */
export function overlapArea(a: readonly PtMm[], b: readonly PtMm[], stepMm = 1): number {
  const ba = bboxOf(a);
  const bb = bboxOf(b);
  const y0 = Math.max(ba.minY, bb.minY);
  const y1 = Math.min(ba.maxY, bb.maxY);
  if (y1 <= y0 || Math.min(ba.maxX, bb.maxX) <= Math.max(ba.minX, bb.minX)) return 0;
  const spans = (p: readonly PtMm[], y: number) => {
    const xs: number[] = [];
    for (let i = 0; i < p.length; i++) {
      const u = p[i];
      const v = p[(i + 1) % p.length];
      if (u.y <= y === v.y <= y) continue;
      xs.push(u.x + ((y - u.y) * (v.x - u.x)) / (v.y - u.y));
    }
    xs.sort((s, t) => s - t);
    const out: [number, number][] = [];
    for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
    return out;
  };
  let area = 0;
  for (let y = y0 + stepMm / 2; y < y1; y += stepMm) {
    const sa = spans(a, y);
    const sb = spans(b, y);
    for (const [p0, p1] of sa)
      for (const [r0, r1] of sb) {
        const w = Math.min(p1, r1) - Math.max(p0, r0);
        if (w > 0) area += w * stepMm;
      }
  }
  return area;
}

/** Overlap above this share of the smaller outline: two outlines of one size share a face. */
export const ONE_PIECE_OVERLAP = 0.05;

/**
 * G24 evidence per (seed, rank) of a closed candidate: "the outline runs across two pieces" —
 * (a) the face holds the header (seed text) — or the outline the seed point — of another piece
 * whose own outline of that size did not close (its fill ran into this face), or (b) it overlaps another family's closed outline of
 * the same rank by > 5 % of the smaller one, unless that one lies wholly inside it (a pocket drawn
 * on the front is G20's business). Mood Margaux: a hole at a corner of size r merged its face with
 * the touching piece's face of the same size. Two live seeds in one face are 'merged' already.
 */
export function onePieceProblems(
  families: readonly PieceFamily[],
  seedTexts: Readonly<Record<number, number>>,
  /** Every seed's point (text, click, face): a piece without a header is a piece too. */
  seedAts: Readonly<Record<number, PtMm>> = {},
): Map<string, string> {
  const out = new Map<string, string>();
  const key = (seed: number, rank: number) => `${seed}:${rank}`;
  const add = (seed: number, rank: number, why: string) => {
    const k = key(seed, rank);
    if (!out.has(k)) out.set(k, why);
  };
  const seedOfText = new Map<number, number>();
  for (const [sd, t] of Object.entries(seedTexts)) seedOfText.set(t, Number(sd));
  const closedAt = new Map<string, boolean>();
  for (const f of families)
    for (const c of f.candidates) closedAt.set(key(f.seed, c.rank), c.outcome === 'closed');
  const famSeeds = families.map((f) => f.seed);
  const byRank = new Map<number, { seed: number; outer: PtMm[]; area: number }[]>();
  for (const f of families)
    for (const c of f.candidates) {
      if (c.outcome !== 'closed' || c.outer.length < 3) continue;
      // (a) another piece's header or seed inside this face, that piece not closed at this size
      let other: number | undefined;
      for (const tid of c.textsInside) {
        const o = seedOfText.get(tid);
        if (o !== undefined && o !== f.seed && !closedAt.get(key(o, c.rank))) other = o;
      }
      if (other === undefined)
        for (const o of famSeeds) {
          const at = seedAts[o];
          if (o === f.seed || !at || closedAt.get(key(o, c.rank))) continue;
          const b = c.bbox;
          if (at.x < b.minX || at.x > b.maxX || at.y < b.minY || at.y > b.maxY) continue;
          if (pointInPoly(at, c.outer)) {
            other = o;
            break;
          }
        }
      if (other !== undefined)
        add(f.seed, c.rank, `its outline holds piece ${other}, which does not close at this size`);
      const a = byRank.get(c.rank) ?? [];
      a.push({ seed: f.seed, outer: c.outer, area: c.areaMm2 });
      byRank.set(c.rank, a);
    }
  // (b) two closed outlines of one rank overlapping (not nested)
  for (const [rank, list] of byRank)
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i];
        const B = list[j];
        if (A.seed === B.seed) continue;
        const ov = overlapArea(A.outer, B.outer);
        const small = Math.min(A.area, B.area);
        if (!small || ov <= ONE_PIECE_OVERLAP * small) continue;
        // nested wholly (≥ 98 % of the smaller one inside the larger): not two pieces in one face
        const [S, L] = A.area <= B.area ? [A, B] : [B, A];
        const inside = S.outer.filter((p) => pointInPoly(p, L.outer)).length / S.outer.length;
        if (ov >= 0.98 * S.area && inside >= 0.98) continue;
        const pct = Math.round((100 * ov) / small);
        add(
          A.seed,
          rank,
          `its outline overlaps another piece's outline of the same size by ${pct} %`,
        );
        add(
          B.seed,
          rank,
          `its outline overlaps another piece's outline of the same size by ${pct} %`,
        );
      }
  return out;
}

/**
 * G22: the walls of an outline drawn with ANOTHER size's pen (a line of another size's class, of
 * known look) that are an edge this rank shares — a line on whose interior (≥ 2 mm from its ends, ≤ 1 mm off) a line of this rank's own pen ends (robe:
 * the sizes 36–44 land on size 46's solid line where every size runs along it, drawn once). The
 * gate excuses at most half the outline this way.
 */
export function sharedEdges(
  set: ChainSet,
  walls: readonly ChainId[],
  ownIds: readonly ChainId[],
  look: Pen,
  styles: ReadonlyMap<number, Style>,
  /** Lines of the other sizes' classes: only another SIZE's line is an edge sizes share. */
  otherSizeChains: ReadonlySet<ChainId>,
): ChainId[] {
  const ownSet = new Set(ownIds);
  const ends: PtMm[] = [];
  for (const id of ownIds) {
    const c = set.chains[id];
    if (!c || c.closed || c.pts.length < 2) continue;
    ends.push(c.pts[0], c.pts[c.pts.length - 1]);
  }
  const out: ChainId[] = [];
  for (const id of new Set(walls)) {
    if (ownSet.has(id)) continue;
    const c = set.chains[id];
    if (!c || c.pts.length < 2) continue;
    const cl = chainLook(c, styles);
    if (!otherSizeChains.has(id) || !cl || onPen(cl, look)) continue;
    const a = c.pts[0];
    const b = c.pts[c.pts.length - 1];
    const lands = ends.some((e) => {
      if (!c.closed && (dist(e, a) < 2 || dist(e, b) < 2)) return false;
      for (let i = 0; i + 1 < c.pts.length; i++)
        if (segDist(e, c.pts[i], c.pts[i + 1]) <= 1) return true;
      return false;
    });
    if (lands) out.push(id);
  }
  return out;
}

function segDist(p: PtMm, a: PtMm, b: PtMm): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}
