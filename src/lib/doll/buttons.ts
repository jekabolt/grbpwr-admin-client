// Buttons on their holes. The closure of a garment is its buttons, and the card already says it:
// a `buttonhole` step on one part, a `button_attach` step on another, each with its count and its
// marks on the pattern. Nothing here reads a piece's name or code: the same rule holds for any
// garment with these two steps. Whatever the data does not settle is refused in words.

import { closureDrills } from 'lib/assembly-skeleton/geometry/closures';
import { readName } from 'lib/assembly-skeleton/skeleton';
import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { frameOf, toUV } from 'lib/seams/frame';

import type { DeclaredOp } from './joins';
import type { DollFold } from './types';

/** A step that makes the holes or sets the buttons, its input read down to pieces. */
export type DeclaredFastening = {
  side: 'holes' | 'buttons';
  /** The step's number on the card. */
  step: number;
  pieces: string[];
  /** How many the step says; 0 = it does not say. */
  count: number;
};

export type FasteningOp = DeclaredOp & { work: string; count: number; step: number };

const SIDE_OF_WORK: Record<string, DeclaredFastening['side']> = {
  buttonhole: 'holes',
  button_attach: 'buttons',
};

/** Operations → the steps that fasten. Units accumulate their leaf pieces, in step order. */
export function fasteningsFromOps(
  ops: readonly FasteningOp[],
  pieceOf: (key: string) => string | null,
): DeclaredFastening[] {
  const units = new Map<string, string[]>();
  const leaves = (k: string): string[] => {
    const p = pieceOf(k);
    return p ? [p] : units.get(k) ?? [];
  };
  const out: DeclaredFastening[] = [];
  for (const op of ops) {
    const pieces = [...new Set(op.inputs.flatMap(leaves))];
    const side = SIDE_OF_WORK[op.work.trim()];
    if (side) out.push({ side, step: op.step, pieces, count: op.count });
    if (op.output) units.set(op.output, [...new Set([...(units.get(op.output) ?? []), ...pieces])]);
  }
  return out;
}

/** How far off a straight line a mark may sit and still be of that line's column, mm. */
const COLUMN_MM = 6;
/** How far a hole's spacing and its button's may differ and still be the same closure, mm. */
const PITCH_MM = 12;

/** Marks in order along the line through the two farthest apart. */
export function inColumnOrder(marks: readonly Pt2[]): Pt2[] {
  if (marks.length < 2) return [...marks];
  let a = marks[0];
  let b = marks[1];
  let far = -1;
  for (let i = 0; i < marks.length; i++)
    for (let j = i + 1; j < marks.length; j++) {
      const d = Math.hypot(marks[i][0] - marks[j][0], marks[i][1] - marks[j][1]);
      if (d > far) [far, a, b] = [d, marks[i], marks[j]];
    }
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const along = (p: Pt2) => (p[0] - a[0]) * dx + (p[1] - a[1]) * dy;
  return [...marks].sort((p, q) => along(p) - along(q));
}

/** The largest sets of marks on one straight line; more than one when two lines tie. */
export function largestColumns(marks: readonly Pt2[]): Pt2[][] {
  const seen = new Map<string, number[]>();
  let size = 0;
  for (let i = 0; i < marks.length; i++)
    for (let j = i + 1; j < marks.length; j++) {
      const dx = marks[j][0] - marks[i][0];
      const dy = marks[j][1] - marks[i][1];
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const on: number[] = [];
      marks.forEach((m, k) => {
        if (Math.abs((m[0] - marks[i][0]) * dy - (m[1] - marks[i][1]) * dx) / len <= COLUMN_MM)
          on.push(k);
      });
      if (on.length < size) continue;
      if (on.length > size) {
        size = on.length;
        seen.clear();
      }
      seen.set(on.join(','), on);
    }
  return [...seen.values()].map((on) => inColumnOrder(on.map((k) => marks[k])));
}

const gapsOf = (column: readonly Pt2[]) =>
  column.slice(1).map((p, i) => Math.hypot(p[0] - column[i][0], p[1] - column[i][1]));

/** The worst difference between two columns' spacings, read either way along one of them, mm. */
const pitchDiff = (a: readonly Pt2[], b: readonly Pt2[]) => {
  const ga = gapsOf(a);
  const gb = gapsOf(b);
  const rb = [...gb].reverse();
  const worst = (x: number[]) => Math.max(0, ...ga.map((g, i) => Math.abs(g - x[i])));
  return Math.min(worst(gb), worst(rb));
};

/**
 * More marks than the step says, the other side exactly as many: the one run of consecutive marks
 * spaced as the other side is. Null when no run is, or when a second one comes close.
 */
function runLike(long: readonly Pt2[], short: readonly Pt2[]): Pt2[] | null {
  if (short.length < 2) return null;
  const scored: { run: Pt2[]; diff: number }[] = [];
  for (let i = 0; i + short.length <= long.length; i++) {
    const run = long.slice(i, i + short.length);
    scored.push({ run, diff: pitchDiff(run, short) });
  }
  scored.sort((x, y) => x.diff - y.diff);
  if (!scored.length || scored[0].diff > PITCH_MM) return null;
  if (scored[1] && scored[1].diff <= scored[0].diff + PITCH_MM) return null;
  return scored[0].run;
}

export type FasteningSide = {
  step: number;
  piece: string;
  /** In the piece's own frame, in column order: exactly the step's count. */
  marks: Pt2[];
  /** Marks of the column left over, when the drawing has more than the step says. */
  unused: number;
  /** The step's count runs past this part: where the rest of its marks are, in words. */
  apart?: string;
};
export type FasteningPair = { count: number; holes: FasteningSide; buttons: FasteningSide };
export type FasteningRead = { pairs: FasteningPair[]; refused: string[] };
export type InferredPlacketFold = { piece: string; fold: DollFold; how: string };

type StepColumn = { piece: string; column: Pt2[]; apart?: string } | { why: string };

const wordOf = (s: DeclaredFastening) =>
  `${s.side === 'holes' ? 'buttonhole' : 'button'}${s.count === 1 ? '' : 's'}`;

/** A step's input in words: its pieces, or how many when it names a whole unit. */
const piecesWord = (keys: readonly string[], nameOf: (key: string) => string) =>
  keys.length > 3 ? `${keys.length} pieces` : keys.map(nameOf).join(', ') || 'no piece';

const sameInput = (a: DeclaredFastening, b: DeclaredFastening) =>
  a.pieces.length === b.pieces.length && a.pieces.every((k) => b.pieces.includes(k));

/** The column of marks a step's input carries, or why there is none. */
function columnOfStep(
  s: DeclaredFastening,
  geomOf: (key: string) => PieceGeom | undefined,
  nameOf: (key: string) => string,
): StepColumn {
  const here = `step ${s.step} (${s.count} ${wordOf(s)} on ${piecesWord(s.pieces, nameOf)})`;
  const fits: { piece: string; column: Pt2[] }[] = [];
  const reasons: string[] = [];
  let anyMarks = false;
  for (const key of s.pieces) {
    const g = geomOf(key);
    const marks = g ? closureDrills(g) : [];
    if (marks.length) anyMarks = true;
    if (marks.length < s.count) {
      if (marks.length) reasons.push(`${nameOf(key)} has ${marks.length} marks`);
      continue;
    }
    if (marks.length === s.count) {
      fits.push({ piece: key, column: inColumnOrder(marks) });
      continue;
    }
    const columns = largestColumns(marks);
    if (columns.length !== 1)
      reasons.push(`${nameOf(key)} has ${marks.length} marks and no one column of them`);
    else if (columns[0].length < s.count)
      reasons.push(`${nameOf(key)} has ${columns[0].length} marks in its longest column`);
    else fits.push({ piece: key, column: columns[0] });
  }
  if (fits.length === 1) return fits[0];
  if (fits.length > 1)
    return {
      why: `${here}: ${fits.map((f) => nameOf(f.piece)).join(' and ')} both carry them, the step does not say which`,
    };
  if (!anyMarks) return { why: `${here}: no marks on the pattern` };
  return spreadOver(s, geomOf, nameOf) ?? { why: `${here}: ${reasons.join(', ')}` };
}

/**
 * A step whose count runs over two parts of its input (a placket's column and a pocket's one
 * mark: «8 buttonholes» on a front with its pocket): the one column that carries most of them, the
 * rest said where they are. Null unless the input's marks reach the count and one part's column
 * holds more than half of it, longer than any other part's.
 */
function spreadOver(
  s: DeclaredFastening,
  geomOf: (key: string) => PieceGeom | undefined,
  nameOf: (key: string) => string,
): { piece: string; column: Pt2[]; apart: string } | null {
  const parts: { piece: string; marks: number; column: Pt2[] }[] = [];
  for (const key of s.pieces) {
    const g = geomOf(key);
    const marks = g ? closureDrills(g) : [];
    if (!marks.length) continue;
    const columns = marks.length < 2 ? [marks] : largestColumns(marks);
    parts.push({ piece: key, marks: marks.length, column: columns.length === 1 ? columns[0] : [] });
  }
  if (parts.reduce((sum, p) => sum + p.marks, 0) < s.count) return null;
  parts.sort((a, b) => b.column.length - a.column.length);
  const [best, next] = parts;
  if (!best || best.column.length < 2 || 2 * best.column.length <= s.count) return null;
  if (next && next.column.length >= best.column.length) return null;
  const rest = parts
    .slice(1)
    .map((p) => `${p.marks} on ${nameOf(p.piece)}`)
    .join(', ');
  return {
    piece: best.piece,
    column: best.column,
    apart: `the step says ${s.count}: ${best.column.length} on ${nameOf(best.piece)}, ${rest}`,
  };
}

/** Do these two steps fasten to each other? The two columns of exactly `count` marks, or why not. */
function fit(
  h: DeclaredFastening,
  hc: { piece: string; column: Pt2[]; apart?: string },
  b: DeclaredFastening,
  bc: { piece: string; column: Pt2[]; apart?: string },
  nameOf: (key: string) => string,
): FasteningPair | { why: string } {
  const here = `steps ${h.step} and ${b.step}`;
  if (hc.piece === bc.piece)
    return { why: `${here}: holes and buttons on the same part (${nameOf(hc.piece)})` };
  // A count spread over two parts fastens what its main column holds (never more than the step says).
  const n = Math.min(h.count, hc.column.length, bc.column.length);
  const side = (
    s: DeclaredFastening,
    c: { piece: string; column: Pt2[]; apart?: string },
    marks: Pt2[],
  ): FasteningSide => ({
    step: s.step,
    piece: c.piece,
    marks,
    unused: c.apart ? 0 : c.column.length - marks.length,
    ...(c.apart ? { apart: c.apart } : {}),
  });
  let holes = hc.column;
  let buttons = bc.column;
  if (holes.length > n && buttons.length > n)
    return {
      why: `${here}: ${nameOf(hc.piece)} has ${holes.length} marks and ${nameOf(bc.piece)} ${buttons.length}, each step says ${n}`,
    };
  if (holes.length > n) {
    const run = runLike(holes, buttons);
    if (!run)
      return {
        why: `${here}: ${nameOf(hc.piece)} has ${holes.length} marks, the step says ${n}, and no one run of them is spaced as the buttons are`,
      };
    holes = run;
  } else if (buttons.length > n) {
    const run = runLike(buttons, holes);
    if (!run)
      return {
        why: `${here}: ${nameOf(bc.piece)} has ${buttons.length} marks, the step says ${n}, and no one run of them is spaced as the holes are`,
      };
    buttons = run;
  } else {
    const diff = pitchDiff(holes, buttons);
    if (diff > PITCH_MM)
      return {
        why: `${here}: holes and buttons are spaced differently, by up to ${diff.toFixed(0)} mm`,
      };
  }
  return {
    count: n,
    holes: side(h, hc, holes),
    buttons: side(b, bc, buttons),
  };
}

/** Every way to give each of `n` steps one of `n` others. */
function* permutations(n: number): Generator<number[]> {
  const walk = function* (left: number[], at: number[]): Generator<number[]> {
    if (!left.length) yield at;
    for (const x of left)
      yield* walk(
        left.filter((y) => y !== x),
        [...at, x],
      );
  };
  yield* walk(
    Array.from({ length: n }, (_, i) => i),
    [],
  );
}

/**
 * Which hole steps fasten to which button steps. Count first; several sets of one count pair only
 * when the marks leave a single way to pair them. Everything left over is a line in `refused`.
 */
export function pairFastenings(
  steps: readonly DeclaredFastening[],
  geomOf: (key: string) => PieceGeom | undefined,
  nameOf: (key: string) => string = (key) => geomOf(key)?.name || key,
): FasteningRead {
  const pairs: FasteningPair[] = [];
  const refused: string[] = [];
  const counted: DeclaredFastening[] = [];
  for (const s of steps) {
    if (s.count > 0) counted.push(s);
    else refused.push(`step ${s.step} (${wordOf(s)}) does not say how many`);
  }
  const counts = [...new Set(counted.map((s) => s.count))].sort((a, b) => b - a);
  const alone: DeclaredFastening[] = [];
  for (const count of counts) {
    let holes = counted.filter((s) => s.count === count && s.side === 'holes');
    let buttons = counted.filter((s) => s.count === count && s.side === 'buttons');
    // Holes and buttons on the very same input: one part on both sides, nothing to fasten.
    for (const h of holes) {
      const b = buttons.find((x) => sameInput(h, x));
      if (!b) continue;
      refused.push(
        `steps ${h.step} and ${b.step}: holes and buttons on the same part (${piecesWord(h.pieces, nameOf)})`,
      );
      holes = holes.filter((x) => x !== h);
      buttons = buttons.filter((x) => x !== b);
    }
    if (!holes.length && !buttons.length) continue;
    if (!holes.length || !buttons.length) {
      alone.push(...holes, ...buttons);
      continue;
    }
    const listed = [...holes, ...buttons].map((s) => s.step).join(', ');
    if (holes.length !== buttons.length) {
      refused.push(
        `steps ${listed}: ${holes.length} set(s) of ${count} buttonholes and ${buttons.length} of ${count} buttons, they do not pair`,
      );
      continue;
    }
    const columnsOf = (list: DeclaredFastening[]) =>
      list.map((s) => columnOfStep(s, geomOf, nameOf));
    const hc = columnsOf(holes);
    const bc = columnsOf(buttons);
    const missing = [...hc, ...bc].flatMap((c) => ('why' in c ? [c.why] : []));
    if (missing.length) {
      refused.push(...missing);
      continue;
    }
    const got = (c: StepColumn) => c as { piece: string; column: Pt2[]; apart?: string };
    const ways: FasteningPair[][] = [];
    let why: string[] = [];
    for (const way of permutations(holes.length)) {
      const tried = way.map((j, i) => fit(holes[i], got(hc[i]), buttons[j], got(bc[j]), nameOf));
      const bad = tried.flatMap((t) => ('why' in t ? [t.why] : []));
      if (bad.length) why = why.length ? why : bad;
      else ways.push(tried as FasteningPair[]);
    }
    if (ways.length === 1) pairs.push(...ways[0]);
    else if (ways.length > 1)
      refused.push(
        `steps ${listed}: ${holes.length} sets of ${count}, and the marks do not say which holes go with which buttons`,
      );
    else refused.push(...why);
  }
  // A count with one side only: two such steps left are one closure whose counts differ.
  const lonelyHoles = alone.filter((s) => s.side === 'holes');
  const lonelyButtons = alone.filter((s) => s.side === 'buttons');
  if (lonelyHoles.length === 1 && lonelyButtons.length === 1) {
    const [h] = lonelyHoles;
    const [b] = lonelyButtons;
    refused.push(
      `step ${h.step} says ${h.count} buttonholes, step ${b.step} says ${b.count} buttons`,
    );
  } else
    for (const s of alone)
      refused.push(
        `step ${s.step} (${s.count} ${wordOf(s)}): no ${s.side === 'holes' ? 'button' : 'buttonhole'} step says ${s.count}`,
      );
  return { pairs, refused };
}

/**
 * A separate placket whose button line sits in one half of a long narrow strip is the finished
 * half; the other half turns under on the strip's midline. This is a doll proposal used only when
 * the card has no fold for the piece. Names decide only that the strip is a placket; the fold side
 * and direction come from its geometry and fastening marks.
 */
export function inferredPlacketFolds(
  steps: readonly DeclaredFastening[],
  geomOf: (key: string) => PieceGeom | undefined,
  hasFold: (key: string) => boolean = () => false,
): InferredPlacketFold[] {
  const out = new Map<string, InferredPlacketFold>();
  for (const pair of pairFastenings(steps, geomOf).pairs)
    for (const side of [pair.holes, pair.buttons]) {
      if (out.has(side.piece) || hasFold(side.piece) || side.marks.length < 2) continue;
      const g = geomOf(side.piece);
      if (!g || readName(g.name).role !== 'placket') continue;
      const frame = frameOf(g);
      const longV = frame.h >= frame.w;
      const short = longV ? frame.w : frame.h;
      const long = longV ? frame.h : frame.w;
      if (short < 20 || short > 160 || long < 300 || long < 4 * short) continue;
      const across = side.marks.map((mark) => {
        const uv = toUV(frame, mark);
        return longV ? uv[0] : uv[1];
      });
      const lo = Math.min(...across);
      const hi = Math.max(...across);
      if (hi - lo > 0.08) continue;
      const column = across.reduce((sum, value) => sum + value, 0) / across.length;
      // A line on the midline does not say which half is the face. A line too near an outer edge is
      // not centred on a plausible finished half either.
      if (Math.abs(column - 0.5) < 0.06 || column < 0.12 || column > 0.88) continue;
      const fold: DollFold = longV
        ? {
            seq: 0,
            a: [0.5, 0],
            b: [0.5, 1],
            flipAt: [column < 0.5 ? 0.9 : 0.1, 0.5],
            kind: 'inward',
          }
        : {
            seq: 0,
            a: [0, 0.5],
            b: [1, 0.5],
            flipAt: [0.5, column < 0.5 ? 0.9 : 0.1],
            kind: 'inward',
          };
      out.set(side.piece, {
        piece: side.piece,
        fold,
        how: `placket fold proposed from its ${Math.round(short)} mm cut width and button line at ${Math.round(column * short)} mm`,
      });
    }
  return [...out.values()];
}

// ── Where a mark is on a piece's mesh ─────────────────────────────────────────────────────────

/**
 * A point as local vertices and their weights (affine, summing to 1): a triangle's three, a weight
 * negative past the triangle, or the spread of a footprint's vertices a point past it reads.
 */
export type Located = { i: number[]; w: number[] };

/**
 * The triangle under `q`, or the nearest one with the point clamped onto it; `out` is how far past
 * that triangle the point was, in its own weights (0 = inside). `keep` narrows the triangles.
 */
export function locateIn(
  pts: readonly Pt2[],
  tris: ArrayLike<number>,
  q: Pt2,
  keep?: (triangle: number) => boolean,
): (Located & { out: number }) | null {
  let best: (Located & { out: number }) | null = null;
  for (let t = 0; t < tris.length; t += 3) {
    if (keep && !keep(t / 3)) continue;
    const a = pts[tris[t]];
    const b = pts[tris[t + 1]];
    const c = pts[tris[t + 2]];
    const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(den) < 1e-9) continue;
    const l1 = ((b[1] - c[1]) * (q[0] - c[0]) + (c[0] - b[0]) * (q[1] - c[1])) / den;
    const l2 = ((c[1] - a[1]) * (q[0] - c[0]) + (a[0] - c[0]) * (q[1] - c[1])) / den;
    const l3 = 1 - l1 - l2;
    const out = Math.max(0, -l1) + Math.max(0, -l2) + Math.max(0, -l3);
    if (best && out >= best.out) continue;
    const c1 = Math.max(0, l1);
    const c2 = Math.max(0, l2);
    const c3 = Math.max(0, l3);
    const sum = c1 + c2 + c3 || 1;
    best = {
      i: [tris[t], tris[t + 1], tris[t + 2]],
      w: [c1 / sum, c2 / sum, c3 / sum],
      out,
    };
    if (out === 0) break;
  }
  return best;
}

/** How far in a stencil reaches from the footprint's edge, and how wide it stands, mm. */
const STENCIL_IN_MM = 50;
const STENCIL_WIDE_MM = 25;

/**
 * A point past a footprint (a placket overhanging its host's folded edge): three of the
 * footprint's vertices whose flat frame carries the point straight on. Wide on purpose, so that a
 * few mm of overhang stays a small lever on the host. `on` marks the vertices it may use.
 */
export function stencilPast(pts: readonly Pt2[], on: ArrayLike<number>, q: Pt2): Located | null {
  const nearestTo = (p: Pt2, skip: number[]) => {
    let at = -1;
    let bd = Infinity;
    for (let v = 0; v < pts.length; v++) {
      if (!on[v] || skip.includes(v)) continue;
      const d = (pts[v][0] - p[0]) ** 2 + (pts[v][1] - p[1]) ** 2;
      if (d < bd) [bd, at] = [d, v];
    }
    return at;
  };
  const v0 = nearestTo(q, []);
  if (v0 < 0) return null;
  let dx = pts[v0][0] - q[0];
  let dy = pts[v0][1] - q[1];
  let len = Math.hypot(dx, dy);
  if (len < 1) {
    // On the vertex itself: inward is toward the footprint's middle.
    let cx = 0;
    let cy = 0;
    let n = 0;
    for (let v = 0; v < pts.length; v++)
      if (on[v]) {
        cx += pts[v][0];
        cy += pts[v][1];
        n++;
      }
    dx = cx / n - q[0];
    dy = cy / n - q[1];
    len = Math.hypot(dx, dy) || 1;
  }
  dx /= len;
  dy /= len;
  const at = (a: number, b: number): Pt2 => [
    pts[v0][0] + dx * a - dy * b,
    pts[v0][1] + dy * a + dx * b,
  ];
  const v1 = nearestTo(at(STENCIL_IN_MM, STENCIL_WIDE_MM), [v0]);
  const v2 = nearestTo(at(STENCIL_IN_MM, -STENCIL_WIDE_MM), [v0, v1]);
  if (v1 < 0 || v2 < 0) return null;
  const [a, b, c] = [pts[v0], pts[v1], pts[v2]];
  const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(den) < 1) return null;
  const l1 = ((b[1] - c[1]) * (q[0] - c[0]) + (c[0] - b[0]) * (q[1] - c[1])) / den;
  const l2 = ((c[1] - a[1]) * (q[0] - c[0]) + (a[0] - c[0]) * (q[1] - c[1])) / den;
  return { i: [v0, v1, v2], w: [l1, l2, 1 - l1 - l2] };
}

/** How far round it a point past a footprint reads the footprint, mm: the weights' σ. */
export const PAST_SIGMA_MM = 30;

/**
 * A point past a footprint (a placket overhanging its host's folded edge): the footprint's
 * vertices round it fitted as a plane (weighted least squares, weights falling off smoothly with
 * distance) and carried straight on. The weights are linear in the vertices' positions, so the
 * solver holds the very point the drawing lays; and neighbouring points ride one smooth surface,
 * not a three-vertex lever each that jumps as its nearest vertex changes. `on` marks the vertices
 * it may use. Null when the fit is degenerate (the vertices in a line).
 */
export function spreadPast(
  pts: readonly Pt2[],
  on: ArrayLike<number>,
  q: Pt2,
  sigma = PAST_SIGMA_MM,
): Located | null {
  const s2 = 2 * sigma * sigma;
  let near = Infinity;
  for (let v = 0; v < pts.length; v++)
    if (on[v]) near = Math.min(near, (pts[v][0] - q[0]) ** 2 + (pts[v][1] - q[1]) ** 2);
  if (!Number.isFinite(near)) return null;
  // Far past the footprint every weight is small: they are taken against the nearest one.
  const reach = near + s2 * Math.log(1e3);
  const vs: number[] = [];
  const ws: number[] = [];
  let [m00, m01, m02, m11, m12, m22] = [0, 0, 0, 0, 0, 0];
  for (let v = 0; v < pts.length; v++) {
    if (!on[v]) continue;
    const x = pts[v][0] - q[0];
    const y = pts[v][1] - q[1];
    const d2 = x * x + y * y;
    if (d2 > reach) continue;
    const w = Math.exp(-(d2 - near) / s2);
    vs.push(v);
    ws.push(w);
    m00 += w * x * x;
    m01 += w * x * y;
    m02 += w * x;
    m11 += w * y * y;
    m12 += w * y;
    m22 += w;
  }
  // The plane's value at q (the origin) by the adjugate of the symmetric 3×3 normal matrix.
  const c00 = m11 * m22 - m12 * m12;
  const c01 = m02 * m12 - m01 * m22;
  const c02 = m01 * m12 - m02 * m11;
  const D = m00 * c00 + m01 * c01 + m02 * c02;
  if (!(Math.abs(D) > 1e-6 * Math.max(1, m22) * sigma ** 4)) return null;
  const c12 = m01 * m02 - m00 * m12;
  const c22 = m00 * m11 - m01 * m01;
  const w = vs.map(
    (v, k) => (ws[k] * (c02 * (pts[v][0] - q[0]) + c12 * (pts[v][1] - q[1]) + c22)) / D,
  );
  return w.every(Number.isFinite) ? { i: vs, w } : null;
}

/** A located point read in another position set of the same mesh (as cut → folded footprint). */
export const readAt = (pts: readonly Pt2[], L: Located): Pt2 => {
  const out: Pt2 = [0, 0];
  L.i.forEach((v, j) => {
    out[0] += L.w[j] * pts[v][0];
    out[1] += L.w[j] * pts[v][1];
  });
  return out;
};

/**
 * The side of a column its free edge is on: the side the cloth ends sooner. `n` is that way, unit;
 * `off` is how far the outline reaches past the column, mm. Null for a column of one mark.
 */
export function freeSideOf(
  outline: readonly Pt2[],
  column: readonly Pt2[],
): { n: Pt2; off: number } | null {
  if (column.length < 2) return null;
  const a = column[0];
  const b = column[column.length - 1];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-6) return null;
  const px = -(b[1] - a[1]) / len;
  const py = (b[0] - a[0]) / len;
  let plus = 0;
  let minus = 0;
  for (const p of outline) {
    const d = (p[0] - a[0]) * px + (p[1] - a[1]) * py;
    plus = Math.max(plus, d);
    minus = Math.max(minus, -d);
  }
  return plus <= minus ? { n: [px, py], off: plus } : { n: [-px, -py], off: minus };
}
