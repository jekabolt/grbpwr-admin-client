// P2 lane Z — closures beyond the centre front, read off the pattern (03-P2-DESIGN.md §5).
//
//   closure-not-seam — a straight mirror pair with drills along it, or a front pair with closure
//                trims in the BOM, is a closure, never a seam (moved here from match.ts; the drills
//                are now the classified marks of geometry/marks.ts — drill + buttonhole — one truth);
//   Z1 buttons — drill / buttonhole marks in COLUMNS (≥ 2 along one edge at one offset). Two columns
//                of one piece that a fold line of the piece maps onto each other are one column
//                through two layers (a folded box placket); columns of the same count on pieces sewn
//                to each other (front + facing) or stacked as identical layers are one closure side.
//                Sides pair up through mirror twins. Which side takes the holes: buttonhole marks
//                on one side only, or marks on a piece whose mirror twin carries none — else it is
//                a guess (CLO draws the same circle + cross on both sides), said as «check»;
//   Z2 zips    — no geometric signal exists in the corpus (0 zips in 5 files): seats are read from
//                roles + straight seams only (centre back, left side seam), always «check»;
//   Z3 vents   — not detected; a template step whose confidence a V line wide at an edge, or a step
//                in the outline next to a fold line, raises — still «check».
// No rule knows a garment: only marks, the seam graph, roles and the BOM.

import {
  SKELETON,
  type Edge,
  type EdgeId,
  type PieceGeom,
  type PieceMark,
  type Pt2,
  type SeamCandidate,
  type SeamGraph,
  type SkeletonFacts,
} from '../types';
import type { Run } from './match';
import { angleAt, dist } from './segment';

/** A closure needs at least this many drills along its edge. */
const DRILLS_FOR_CLOSURE = 2;
const FRONT_NAME = /(^|[^a-z])(front|frt|fp|cf|перед|полоч)/i;

/** Z1: marks of one column sit at one offset from their edge, within this. */
const COLUMN_OFFSET_MM = 5;
/** Z1: a column mapped through a fold line lands on the other within this. */
const FOLD_MATCH_MM = 4;
/** Z2: chord / length of a seam a zip goes into. */
const ZIP_STRAIGHT = 0.95;
/** Z3: a V line at least this wide where it opens is a vent, not a dart (darts ≤ 60 mm). */
const VENT_VEE_MM = 100;
/** Z3: a step in the outline — an edge no longer than this between two square corners. */
const VENT_STEP_MM = 50;
const VENT_STEP_TURN: readonly [number, number] = [60, 120];

const pieceOf = (id: EdgeId) => id.slice(0, id.lastIndexOf('#'));

// ── closure-not-seam ────────────────────────────────────────────────────────────────────────

/** Drill and buttonhole centres of a piece (its classified marks), mm in its `rs` frame. */
export function closureDrills(p: PieceGeom): Pt2[] {
  return (p.marks ?? [])
    .filter((m) => m.kind === 'drill' || m.kind === 'buttonhole')
    .map((m): Pt2 => [m.bbox.cx, m.bbox.cy]);
}

export type ClosureVerdict = { rule: string; closure: NonNullable<SeamCandidate['closure']> };

/**
 * Is a straight mirror pair `u ~ v` a closure rather than a seam: ≥ 2 drills within
 * SKELETON.drillEdgeMm of either edge, or a front pair with zip / buttons / snaps in the BOM.
 */
export function closureReason(
  u: Run,
  v: Run,
  straight: boolean,
  facts: SkeletonFacts,
  drills: ReadonlyMap<string, Pt2[]>,
): ClosureVerdict | null {
  if (!straight) return null;
  const near = (r: Run) =>
    (drills.get(r.piece.pieceKey) ?? []).filter((d) =>
      r.pts.some((p) => dist(p, d) <= SKELETON.drillEdgeMm),
    ).length;
  const nd = Math.max(near(u), near(v));
  const { zipper, buttons, snaps } = facts.bom;
  const lengthMm = Math.round(Math.max(u.lenMm, v.lenMm));
  if (nd >= DRILLS_FOR_CLOSURE) {
    return {
      rule: `closure: ${nd} drills along the edge`,
      closure: {
        kind: snaps > 0 && buttons === 0 ? 'snaps' : 'buttons',
        evidence: `${nd} drills along the edge`,
        lengthMm,
        open: 'full',
        count: nd,
      },
    };
  }
  const front = FRONT_NAME.test(u.piece.name) || FRONT_NAME.test(v.piece.name);
  if (zipper + buttons + snaps > 0 && front) {
    const only = [zipper && 'zip', buttons && 'buttons', snaps && 'snaps'].filter(Boolean);
    return {
      rule: 'closure: centre front with zip / buttons / snaps in the BOM',
      closure: {
        kind: only.length === 1 ? (only[0] as 'zip' | 'buttons' | 'snaps') : 'unknown',
        evidence: 'bom+name',
        lengthMm,
        open: 'full',
      },
    };
  }
  return null;
}

// ── Z1: button columns ──────────────────────────────────────────────────────────────────────

export type ButtonColumn = {
  pieceKey: string;
  edge: EdgeId;
  offsetMm: number;
  /** Positions along the closure (a column through a fold counts its rows once). */
  count: number;
  /** Any mark of the column is a buttonhole (drawn as a slit, not a drill). */
  holes: boolean;
  marks: PieceMark[];
  /** 2 when the column runs through a fold of the piece (a folded placket). */
  layers: number;
};

const reflect = (p: Pt2, a: Pt2, b: Pt2): Pt2 => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  const fx = a[0] + t * dx;
  const fy = a[1] + t * dy;
  return [2 * fx - p[0], 2 * fy - p[1]];
};
const centre = (m: PieceMark): Pt2 => [m.bbox.cx, m.bbox.cy];

/** Columns of drill / buttonhole marks along the piece's edges (fold-through columns merged). */
export function buttonColumns(p: PieceGeom): ButtonColumn[] {
  const marks = (p.marks ?? []).filter(
    (m) =>
      (m.kind === 'drill' || m.kind === 'buttonhole') &&
      m.nearEdge &&
      m.nearEdge.offsetMm <= SKELETON.drillEdgeMm,
  );
  const byEdge = new Map<EdgeId, PieceMark[]>();
  for (const m of marks) byEdge.set(m.nearEdge!.edge, [...(byEdge.get(m.nearEdge!.edge) ?? []), m]);
  let cols: ButtonColumn[] = [];
  for (const [edge, ms] of byEdge) {
    const sorted = [...ms].sort((a, b) => a.nearEdge!.offsetMm - b.nearEdge!.offsetMm);
    let run: PieceMark[] = [];
    const flush = () => {
      if (run.length >= 2) {
        cols.push({
          pieceKey: p.pieceKey,
          edge,
          offsetMm: run.reduce((s, m) => s + m.nearEdge!.offsetMm, 0) / run.length,
          count: run.length,
          holes: run.some((m) => m.kind === 'buttonhole'),
          marks: run,
          layers: 1,
        });
      }
      run = [];
    };
    for (const m of sorted) {
      if (run.length && m.nearEdge!.offsetMm - run[0].nearEdge!.offsetMm > COLUMN_OFFSET_MM)
        flush();
      run.push(m);
    }
    flush();
  }
  // A fold line of the piece mapping one column onto another of the same count: one column, two
  // layers (the hole goes through the folded placket) — counted once.
  const folds = (p.marks ?? []).filter((m) => m.kind === 'fold' && m.pts.length >= 2);
  for (let i = 0; i < cols.length; i++) {
    for (let j = i + 1; j < cols.length; j++) {
      const a = cols[i];
      const b = cols[j];
      if (a.count !== b.count) continue;
      const fold = folds.find((f) => {
        const f0 = f.pts[0];
        const f1 = f.pts[f.pts.length - 1];
        return b.marks.every((m) => {
          const r = reflect(centre(m), f0, f1);
          return a.marks.some((n) => dist(r, centre(n)) <= FOLD_MATCH_MM);
        });
      });
      if (!fold) continue;
      cols[i] = { ...a, holes: a.holes || b.holes, marks: [...a.marks, ...b.marks], layers: 2 };
      cols = cols.filter((_, k) => k !== j);
      j = i;
    }
  }
  return cols;
}

export type ButtonStepPlan = {
  /** holes / buttons: the side is read (or guessed); either: one column nobody pairs with. */
  role: 'holes' | 'buttons' | 'either';
  /** The piece the step names (the biggest of the side). */
  pieceKey: string;
  count: number;
  /** PieceMark ids the step stands on (empty for buttons on an unmarked mirror twin). */
  marks: string[];
  /**
   * marks: buttonhole marks on this side only, or marks on a piece whose mirror twin has none;
   * guess: both sides drawn alike — holes put on the left by convention; lone: no other side.
   */
  proof: 'marks' | 'guess' | 'lone';
  /** In words, for the step's reason. */
  evidence: string;
};

/**
 * Z1: the button closures of a graph as step plans — one pair (holes + buttons) per closure, or
 * one step for a column with no other side. Columns are merged into closure sides first: equal
 * counts on one piece, on identical layers, or on pieces sewn to each other by a chosen seam.
 */
export function planButtons(graph: SeamGraph, name: (key: string) => string): ButtonStepPlan[] {
  const geom = new Map(graph.pieces.map((p) => [p.pieceKey, p]));
  const cols = graph.pieces.flatMap(buttonColumns);
  if (!cols.length) return [];
  const sewn = new Set<string>();
  for (const c of graph.chosen) {
    const as = new Set([c.a, ...(c.aParts ?? [])].map(pieceOf));
    const bs = new Set([c.b, ...(c.bParts ?? [])].map(pieceOf));
    for (const x of as)
      for (const y of bs) if (x !== y) sewn.add(`${x}\u0000${y}`).add(`${y}\u0000${x}`);
  }
  const twinKind = (a: string, b: string) =>
    geom.get(a)?.twinOf.find((t) => t.key === b)?.kind ?? null;
  const layered = (a: string, b: string) =>
    a === b || twinKind(a, b) === 'identical' || sewn.has(`${a}\u0000${b}`);

  // closure sides: union of columns of one count that are layers of each other
  const parent = cols.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < cols.length; i++)
    for (let j = i + 1; j < cols.length; j++)
      if (cols[i].count === cols[j].count && layered(cols[i].pieceKey, cols[j].pieceKey))
        parent[find(i)] = find(j);
  const sides = new Map<number, ButtonColumn[]>();
  cols.forEach((c, i) => sides.set(find(i), [...(sides.get(find(i)) ?? []), c]));
  type Side = { cols: ButtonColumn[]; pieces: string[]; count: number; holes: boolean };
  const list: Side[] = [...sides.values()].map((cs) => ({
    cols: cs,
    pieces: [...new Set(cs.map((c) => c.pieceKey))].sort(),
    count: cs[0].count,
    holes: cs.some((c) => c.holes),
  }));
  const area = (k: string) => geom.get(k)?.areaMm2 ?? 0;
  const biggest = (keys: string[]) =>
    [...keys].sort((a, b) => area(b) - area(a) || (a < b ? -1 : a > b ? 1 : 0))[0];
  const marked = new Set(cols.map((c) => c.pieceKey));
  /** A piece of the side whose mirror twin carries no column: the marks are this side's own. */
  const unmarkedTwin = (s: Side): [string, string] | null => {
    for (const k of [...s.pieces].sort((a, b) => area(b) - area(a))) {
      const t = geom.get(k)?.twinOf.find((x) => x.kind === 'mirror' && !marked.has(x.key));
      if (t) return [k, t.key];
    }
    return null;
  };
  const hasHand = (s: Side, h: 'L' | 'R') => s.pieces.some((k) => geom.get(k)?.hand === h);
  const ids = (s: Side) => s.cols.flatMap((c) => c.marks.map((m) => m.id));
  const words = (s: Side) => {
    const thru = s.cols.some((c) => c.layers > 1) ? ' (through a fold)' : '';
    const kind = s.holes ? 'buttonhole' : 'drill';
    return `${s.count} ${kind} marks in a column on ${s.pieces.map(name).join(' + ')}${thru}`;
  };

  // pairs through mirror twins; the side with the stronger evidence first
  const used = new Set<Side>();
  const out: ButtonStepPlan[] = [];
  const order = [...list].sort(
    (a, b) =>
      Number(!!unmarkedTwin(b)) - Number(!!unmarkedTwin(a)) ||
      Number(b.holes) - Number(a.holes) ||
      (a.pieces[0] < b.pieces[0] ? -1 : 1),
  );
  for (const s of order) {
    if (used.has(s)) continue;
    used.add(s);
    const other = order.find(
      (o) =>
        !used.has(o) &&
        o.count === s.count &&
        s.pieces.some((k) => o.pieces.some((q) => twinKind(k, q) === 'mirror')),
    );
    if (other) used.add(other);
    const own = unmarkedTwin(s);
    if (other) {
      // The side that takes the holes, when the pattern says: buttonhole slits on one side only,
      // else marks on a piece whose mirror twin has none (the other side's are a facing's copy).
      const otherOwn = unmarkedTwin(other);
      let hole: Side | null = null;
      if (s.holes !== other.holes) hole = s.holes ? s : other;
      else if (!!own !== !!otherOwn) hole = own ? s : other;
      const proven = !!hole;
      const h = hole ?? (hasHand(other, 'L') && !hasHand(s, 'L') ? other : s);
      const b = h === s ? other : s;
      const ht = unmarkedTwin(h);
      const why = !proven
        ? 'both sides are drawn alike — holes put on the left (menswear), check'
        : h.holes !== b.holes
          ? 'only this side is drawn with buttonholes'
          : `${name(ht![0])} carries the marks, its mirror twin ${name(ht![1])} none`;
      const holesOn = ht ? ht[0] : biggest(h.pieces);
      out.push({
        role: 'holes',
        pieceKey: holesOn,
        count: h.count,
        marks: ids(h),
        proof: proven ? 'marks' : 'guess',
        evidence: `${words(h)}; ${why}`,
      });
      out.push({
        role: 'buttons',
        // Buttons go onto the front the holes' front laps over: its mirror twin when that has no
        // marks of its own (the marks of the other side are then a facing's mirrored copy).
        pieceKey: ht ? ht[1] : biggest(b.pieces),
        count: b.count,
        marks: ids(b),
        proof: proven ? 'marks' : 'guess',
        evidence: ht
          ? `buttons opposite the ${h.holes ? 'buttonholes' : 'drills'} on ${name(holesOn)}; ${why}`
          : `${words(b)}; ${why}`,
      });
      continue;
    }
    if (own) {
      out.push({
        role: 'holes',
        pieceKey: own[0],
        count: s.count,
        marks: ids(s),
        proof: s.holes ? 'marks' : 'guess',
        evidence: `${words(s)}; its mirror twin ${name(own[1])} carries none`,
      });
      out.push({
        role: 'buttons',
        pieceKey: own[1],
        count: s.count,
        marks: [],
        proof: s.holes ? 'marks' : 'guess',
        evidence: `buttons opposite the ${s.holes ? 'buttonholes' : 'drills'} on ${name(own[0])}`,
      });
      continue;
    }
    out.push({
      role: s.holes ? 'holes' : 'either',
      pieceKey: biggest(s.pieces),
      count: s.count,
      marks: ids(s),
      proof: 'lone',
      evidence: `${words(s)}; no other side carries a column of ${s.count}`,
    });
  }
  // Closures with two sides first, a lone column (a collar band's slit) after.
  return [...out.filter((p) => p.proof !== 'lone'), ...out.filter((p) => p.proof === 'lone')];
}

// ── Z2: zip seats ───────────────────────────────────────────────────────────────────────────

export type ZipSeat = {
  where: 'cb' | 'side';
  seam: SeamCandidate;
  pieces: [string, string];
  /** Of the seam, or from its end to the notch the zip stops at. */
  lengthMm: number;
  open: 'full' | 'to-notch';
};

/**
 * Z2: seams a zip of the BOM may go into, in the design's order — the centre back (two backs of
 * opposite hands meeting along a straight edge), then the left side seam (a front onto a back /
 * side panel, the longest straight one; left hand, or no hands in the garment at all). A seam
 * carrying exactly one notch stops the zip there (`to-notch`, the shorter stretch).
 */
export function zipSeats(graph: SeamGraph, roleOf: (key: string) => string | null): ZipSeat[] {
  const edges = new Map<EdgeId, Edge>();
  const geom = new Map(graph.pieces.map((p) => [p.pieceKey, p]));
  for (const p of graph.pieces) for (const e of p.edges) edges.set(e.id, e);
  const anyHand = graph.pieces.some((p) => p.hand);
  const straight = (id: EdgeId) => {
    const e = edges.get(id);
    return !!e && e.chordMm / e.lenMm >= ZIP_STRAIGHT;
  };
  const seat = (c: SeamCandidate, where: ZipSeat['where']): ZipSeat => {
    const e = edges.get(c.a)!;
    const f = edges.get(c.b)!;
    const one = e.notchesMm.length === 1 && f.notchesMm.length === 1;
    const n = e.notchesMm[0];
    return {
      where,
      seam: c,
      pieces: [pieceOf(c.a), pieceOf(c.b)],
      lengthMm: Math.round(one ? Math.min(n, e.lenMm - n) : e.lenMm),
      open: one ? 'to-notch' : 'full',
    };
  };
  const plain = graph.chosen.filter(
    (c) => c.kind === 'edge' && edges.has(c.a) && edges.has(c.b) && straight(c.a) && straight(c.b),
  );
  const longest = (cs: SeamCandidate[]) =>
    [...cs].sort((a, b) => edges.get(b.a)!.lenMm - edges.get(a.a)!.lenMm)[0];
  const out: ZipSeat[] = [];
  const cb = plain.filter((c) => {
    const [a, b] = [pieceOf(c.a), pieceOf(c.b)];
    if (a === b || roleOf(a) !== 'back' || roleOf(b) !== 'back') return false;
    const ha = geom.get(a)?.hand;
    const hb = geom.get(b)?.hand;
    return (
      (!!ha && !!hb && ha !== hb) ||
      !!geom.get(a)?.twinOf.some((t) => t.key === b && t.kind === 'mirror')
    );
  });
  if (cb.length) out.push(seat(longest(cb), 'cb'));
  const side = plain.filter((c) => {
    const [a, b] = [pieceOf(c.a), pieceOf(c.b)];
    const ra = roleOf(a);
    const rb = roleOf(b);
    const pair =
      (ra === 'front' && (rb === 'back' || rb === 'side')) ||
      (rb === 'front' && (ra === 'back' || ra === 'side'));
    if (!pair) return false;
    const hands = [geom.get(a)?.hand, geom.get(b)?.hand];
    return hands.includes('L') || (!anyHand && hands.every((h) => !h));
  });
  if (side.length) out.push(seat(longest(side), 'side'));
  return out;
}

// ── Z3: vent evidence ───────────────────────────────────────────────────────────────────────

/**
 * Z3: what on a piece looks like a vent — a V line opening ≥ VENT_VEE_MM wide at an edge (a dart
 * opens ≤ 60 mm), or a step in the outline (a short edge between two square corners turning
 * opposite ways) with a fold line on the piece. Null when neither: the template step stays a guess.
 */
export function ventEvidence(p: PieceGeom): { marks: string[]; why: string } | null {
  const vee = (p.marks ?? []).find(
    (m) => m.kind === 'vee' && (m.vee?.intakeMm ?? 0) >= VENT_VEE_MM,
  );
  if (vee)
    return {
      marks: [vee.id],
      why: `a V line ${Math.round(vee.vee!.intakeMm)} mm wide at an edge of ${p.name}`,
    };
  const folds = (p.marks ?? []).filter((m) => m.kind === 'fold');
  if (!folds.length || p.rs.length < 3) return null;
  const w = Math.max(1, Math.round(SKELETON.cornerWinMm / SKELETON.resampleMm));
  const turn = (i: number) => angleAt(p.rs, i % p.rs.length, w);
  const square = (t: number) =>
    Math.abs(t) >= VENT_STEP_TURN[0] && Math.abs(t) <= VENT_STEP_TURN[1];
  const step = p.edges.find((e) => {
    if (e.lenMm > VENT_STEP_MM) return false;
    const t0 = turn(e.s);
    const t1 = turn(e.e);
    return square(t0) && square(t1) && Math.sign(t0) !== Math.sign(t1);
  });
  if (!step) return null;
  return {
    marks: folds.map((f) => f.id),
    why: `a ${Math.round(step.lenMm)} mm step in the outline of ${p.name} and a fold line`,
  };
}
