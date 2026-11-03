// Stored fold rows of one piece → what the picker draws, and the picker's choices → rows to write.
//
// Storage keeps folds as plain rows in `seq` order (inward / outward). The picker speaks in three
// words: `in`, `out` and `double` — two equal inward turns read back as one `double` when two
// consecutive inward rows are parallel, flip the same way, and the first lies on the flipping side of
// the second. Everything here is millimetres in the piece's `rs` frame.

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import {
  doubleTurn,
  foldFromLine,
  pointOnSide,
  resolveFolds,
  sideOf,
  smallerSide,
  type FlatFold,
  type FoldHint,
  type FoldSource,
  type StoredFold,
} from 'lib/folds';
import { frameOf, fromUV } from 'lib/folds/geom';
import { rotatePt } from 'lib/pom/upright';

export type PickKind = 'in' | 'out' | 'double';
export const PICK_KINDS: readonly PickKind[] = ['in', 'out', 'double'];

/** One fold as the owner sees it: one line, one kind, one flipping side. */
export type FoldGroup = {
  kind: PickKind;
  /** The line the owner drew or accepted (for a double, the second — outer — turn). */
  line: [Pt2, Pt2];
  side: 1 | -1;
  rows: StoredFold[];
  /** The folds to apply, in order (two for a double). */
  flat: FlatFold[];
  source: FoldSource;
};

const angle = (p: [Pt2, Pt2], q: [Pt2, Pt2]) => {
  const d1 = [p[1][0] - p[0][0], p[1][1] - p[0][1]];
  const d2 = [q[1][0] - q[0][0], q[1][1] - q[0][1]];
  const c =
    Math.abs(d1[0] * d2[0] + d1[1] * d2[1]) /
    (Math.hypot(d1[0], d1[1]) * Math.hypot(d2[0], d2[1]) || 1);
  return (Math.acos(Math.min(1, c)) * 180) / Math.PI;
};

const mid = (l: [Pt2, Pt2]): Pt2 => [(l[0][0] + l[1][0]) / 2, (l[0][1] + l[1][1]) / 2];

/** The rows of one piece, laid on today's geometry and grouped as the picker speaks. */
export function foldGroupsOf(
  piece: PieceGeom,
  rows: readonly StoredFold[],
  grainDeg: number,
  innerLines?: readonly (readonly Pt2[])[],
): { groups: FoldGroup[]; unresolved: string[] } {
  const own = rows.filter((r) => r.pieceKey.toUpperCase() === piece.pieceKey.toUpperCase());
  if (!own.length) return { groups: [], unresolved: [] };
  const res = resolveFolds(own, [piece], {
    grainDeg: new Map([[piece.pieceKey, grainDeg]]),
    nameOf: () => piece.name,
    ...(innerLines ? { innerLines: new Map([[piece.pieceKey, innerLines]]) } : {}),
  });
  const f = frameOf(piece, grainDeg);
  const laid = Object.values(res.folds)[0] ?? [];
  const bySeq = new Map(
    own.filter((r) => !res.unresolved.some((u) => u.foldKey === r.foldKey)).map((r) => [r.seq, r]),
  );
  const items = laid
    .map((d) => {
      const row = bySeq.get(d.seq);
      if (!row) return null;
      const flat: FlatFold = {
        a: fromUV(f, d.a),
        b: fromUV(f, d.b),
        flipAt: fromUV(f, d.flipAt),
        kind: d.kind,
      };
      return { row, flat };
    })
    .filter((x): x is { row: StoredFold; flat: FlatFold } => !!x);

  const groups: FoldGroup[] = [];
  for (let i = 0; i < items.length; i++) {
    const one = items[i];
    const two = items[i + 1];
    const l1: [Pt2, Pt2] = [one.flat.a, one.flat.b];
    const s1 = sideOf(one.flat.a, one.flat.b, one.flat.flipAt);
    if (two && one.flat.kind === 'inward' && two.flat.kind === 'inward') {
      const l2: [Pt2, Pt2] = [two.flat.a, two.flat.b];
      const s2 = sideOf(two.flat.a, two.flat.b, two.flat.flipAt);
      const sameWay =
        (two.flat.b[0] - two.flat.a[0]) * (one.flat.b[0] - one.flat.a[0]) +
          (two.flat.b[1] - two.flat.a[1]) * (one.flat.b[1] - one.flat.a[1]) >=
        0;
      const firstOnFlipSide = sideOf(two.flat.a, two.flat.b, mid(l1)) === s2;
      if (angle(l1, l2) < 3 && (sameWay ? s1 === s2 : s1 !== s2) && firstOnFlipSide) {
        groups.push({
          kind: 'double',
          line: l2,
          side: s2,
          rows: [one.row, two.row],
          flat: [one.flat, two.flat],
          source: two.row.source,
        });
        i++;
        continue;
      }
    }
    groups.push({
      kind: one.flat.kind === 'outward' ? 'out' : 'in',
      line: l1,
      side: s1,
      rows: [one.row],
      flat: [one.flat],
      source: one.row.source,
    });
  }
  return { groups, unresolved: res.unresolved.map((u) => u.words) };
}

/** The folds a choice applies, without writing anything (a preview, a just-picked fold). */
export function flatOfChoice(
  piece: PieceGeom,
  line: [Pt2, Pt2],
  side: 1 | -1,
  kind: PickKind,
): FlatFold[] | null {
  const lines = kind === 'double' ? doubleTurn(piece.rs, line[0], line[1], side) : [line];
  const out: FlatFold[] = [];
  for (const l of lines) {
    const flipAt = pointOnSide(piece.rs, l[0], l[1], side);
    if (!flipAt) return null;
    out.push({ a: l[0], b: l[1], flipAt, kind: kind === 'out' ? 'outward' : 'inward' });
  }
  return out;
}

/** The rows a choice writes. `keys` reuses existing fold keys (a kind change, a swap), in order. */
export function rowsOfChoice(
  piece: PieceGeom,
  choice: { line: [Pt2, Pt2]; side: 1 | -1; kind: PickKind; source: FoldSource },
  ctx: { seq: number; grainDeg: number; keys?: string[]; anchoredSize?: string },
): StoredFold[] | null {
  const flat = flatOfChoice(piece, choice.line, choice.side, choice.kind);
  if (!flat) return null;
  return flat.map((fl, i) =>
    foldFromLine(piece, [fl.a, fl.b], fl.flipAt, {
      seq: ctx.seq + i,
      kind: fl.kind,
      source: choice.source,
      foldKey: ctx.keys?.[i],
      grainDeg: ctx.grainDeg,
      anchoredSize: ctx.anchoredSize,
    }),
  );
}

export const defaultSide = (piece: PieceGeom, line: [Pt2, Pt2]) =>
  smallerSide(piece.rs, line[0], line[1]);

/** Hints not already saved as a fold (same line within 5 mm at both ends). */
export function openHints(hints: readonly FoldHint[], groups: readonly FoldGroup[]): FoldHint[] {
  const near = (p: Pt2, q: Pt2) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 5;
  const same = (a: [Pt2, Pt2], b: [Pt2, Pt2]) =>
    (near(a[0], b[0]) && near(a[1], b[1])) || (near(a[0], b[1]) && near(a[1], b[0]));
  return hints.filter((h) => !groups.some((g) => same(g.line, h.lineMm)));
}

// ── view: the piece upright by its grain, y up → screen y down, long pieces lying ──────────────

export type PieceView = {
  /** mm (rs frame) → px. */
  toPx: (p: Pt2) => Pt2;
  /** px → mm (rs frame). */
  fromPx: (p: Pt2) => Pt2;
  scale: number;
  /** The piece lies on its side (drawn 90° turned). */
  lying: boolean;
  /** The box height actually used (≤ `box.h`; less with `tight`). */
  h: number;
  /** A long piece drawn larger than the box: its long ends run past the box and are cut off. */
  cropped: boolean;
};

/**
 * Fit the piece into a box `w × h` with `pad` px around it. `tight` shrinks the height to the piece;
 * `minShort` keeps a lying (long) piece's short side at least that many px — a placket stays
 * readable across its folds, its long ends cropped.
 */
export function pieceView(
  piece: PieceGeom,
  grainDeg: number,
  box: {
    w: number;
    h: number;
    pad: number;
    padRight?: number;
    padBottom?: number;
    tight?: boolean;
    minShort?: number;
  },
  polys: readonly (readonly Pt2[])[] = [piece.rs],
): PieceView {
  const c = frameOf(piece, grainDeg).c;
  const up = (p: Pt2): Pt2 => {
    const q = grainDeg ? rotatePt(p, grainDeg, c) : p;
    return [q[0], -q[1]];
  };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const q of piece.rs.map(up)) {
    x0 = Math.min(x0, q[0]);
    x1 = Math.max(x1, q[0]);
    y0 = Math.min(y0, q[1]);
    y1 = Math.max(y1, q[1]);
  }
  const lying = y1 - y0 > 3 * (x1 - x0) && box.w > box.h;
  const turn = (q: Pt2): Pt2 => (lying ? [q[1], -q[0]] : q);
  const unturn = (q: Pt2): Pt2 => (lying ? [-q[1], q[0]] : q);
  let X0 = Infinity;
  let Y0 = Infinity;
  let X1 = -Infinity;
  let Y1 = -Infinity;
  for (const P of polys)
    for (const p of P) {
      const q = turn(up(p));
      X0 = Math.min(X0, q[0]);
      X1 = Math.max(X1, q[0]);
      Y0 = Math.min(Y0, q[1]);
      Y1 = Math.max(Y1, q[1]);
    }
  const pr = box.padRight ?? box.pad;
  const pb = box.padBottom ?? box.pad;
  let s = Math.min(
    (box.w - box.pad - pr) / (X1 - X0 || 1),
    (box.h - box.pad - pb) / (Y1 - Y0 || 1),
  );
  let cropped = false;
  if (box.minShort && lying && (Y1 - Y0) * s < box.minShort) {
    s = Math.min(box.minShort, box.h - box.pad - pb) / (Y1 - Y0 || 1);
    cropped = (X1 - X0) * s > box.w - box.pad - pr;
  }
  const h = box.tight ? Math.min(box.h, (Y1 - Y0) * s + box.pad + pb) : box.h;
  const ox = box.pad + (box.w - box.pad - pr - (X1 - X0) * s) / 2 - X0 * s;
  const oy = box.pad + (h - box.pad - pb - (Y1 - Y0) * s) / 2 - Y0 * s;
  return {
    toPx: (p) => {
      const q = turn(up(p));
      return [ox + q[0] * s, oy + q[1] * s];
    },
    fromPx: (p) => {
      const q = unturn([(p[0] - ox) / s, (p[1] - oy) / s]);
      const r: Pt2 = [q[0], -q[1]];
      return grainDeg ? rotatePt(r, -grainDeg, c) : r;
    },
    scale: s,
    lying,
    h,
    cropped,
  };
}

export const ptsAttr = (v: PieceView, poly: readonly Pt2[]) =>
  poly
    .map((p) =>
      v
        .toPx(p)
        .map((n) => n.toFixed(1))
        .join(','),
    )
    .join(' ');

/** The size the contours were read on: the one most pieces were found at (findPiece's median). */
export function sizeOf(
  shapes: ReadonlyMap<string, { size?: string } | null> | null | undefined,
): string {
  const n = new Map<string, number>();
  for (const f of shapes?.values() ?? []) if (f?.size) n.set(f.size, (n.get(f.size) ?? 0) + 1);
  let best = '';
  let most = 0;
  for (const [s, c] of n) if (c > most) [best, most] = [s, c];
  return best;
}
