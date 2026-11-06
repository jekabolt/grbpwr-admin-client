// solveDoll — the paper doll end to end (design §3): groups → meshes → flat charts → wrap onto the
// pattern-derived proxy → phase 1 (body alone) → free loops → proposed inter-group joins + placing
// sleeves / collar / cuffs / bands on those loops → phase 2 (everything) → release seams that can only
// close by tearing the paper → report in words.

import { edgeIdsOf, orderUnits } from 'lib/assembly-skeleton/geometry';
import { legPanels, sameLeg } from 'lib/assembly-skeleton/geometry/legs';
import { readSeamGraph } from 'lib/assembly-skeleton/pipeline';
import { apply, det } from 'lib/assembly-skeleton/union/affine';
import type {
  Edge,
  EdgeId,
  PieceGeom,
  Pt2,
  SeamCandidate,
  SeamGraph,
} from 'lib/assembly-skeleton/types';
import { rotatePt } from 'lib/pom/upright';
import { frameOf, grainDegOf, type PieceFrame } from 'lib/seams/frame';
import { resolveAcrossSizes, type SizeResolved } from 'lib/seams/transfer';

import {
  freeSideOf,
  locateIn,
  pairFastenings,
  PAST_SIGMA_MM,
  readAt,
  spreadPast,
  stencilPast,
  type FasteningSide,
  type Located,
} from './buttons';
import { buildChart, toChart, type Chart, type ChartSeam } from './chart';
import {
  finishedAnchors,
  finishedArc,
  finishedRows,
  openWalkAt,
  readFinishedNeck,
  type NeckRows,
  type NeckWalk,
} from './finished-neck';
import {
  carry,
  foldPlies,
  type FoldStep,
  type FoldStretch,
  movedBy,
  reflectTo,
  stretchFor,
} from './fold-outline';
import {
  baseCurve,
  cbIndex,
  closedNeckPath,
  findNeckPath,
  makeMap,
  neckFromRun,
  restPath,
  runMarks,
  smoothest,
  symmetricPair,
  type CollarCtx,
  type NeckPath,
} from './collar';
import {
  gapStretchesOf,
  groupPieces,
  roleOfPiece,
  unitSkipKeys,
  type GroupedPiece,
  type GroupedSeam,
} from './groups';
import { instanceMirrored } from './instance';
import {
  completeFromJoins,
  isStripEnd,
  isSurfacePiece,
  pocketBagJoins,
  stripLongEdges,
  twinUnits,
} from './joins';
import { liningByName } from 'lib/assembly-skeleton/names';
import { readName } from 'lib/assembly-skeleton/skeleton';
import { findLoops, loopPath, type RawLoop } from './loops';
import { meshPiece, pointInPolygon, type MeshCrease, type PieceMesh } from './mesh';
import { planPleats, sideOfLine, type MeshPleat, type PleatPlan } from './pleat-mesh';
import { type Ring, ringsFromJoins } from './rings';
import { surfaceFit, surfaceHosts } from './surface';
import {
  arcCrop,
  foldPt,
  foldedUnder,
  planSurfaceByRows,
  resample,
  rowParts,
  type RowLay,
} from './surface-rows';
import {
  anchoredRows,
  type FoldContact,
  pass,
  rowGaps,
  seamRows,
  strains,
  type Path,
  type Proxy,
  type SeamRows,
  type SolverSeam,
  type SolverState,
  type Tie,
  tieGap,
} from './solve';
import type {
  DollCollarReport,
  DollClosureReport,
  DollCollarUnit,
  DollFold,
  DollFoldReport,
  DollGroupId,
  DollInput,
  DollLoop,
  DollProxy,
  DollReport,
  DollSeamReport,
  DollSeamState,
  Vec3,
} from './types';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const pk = (id: string) => id.slice(0, id.lastIndexOf('#'));
const TAU = Math.PI * 2;
const CLEAR = 0; // the proxy is already EPS_WRAP smaller than the cloth: no extra gap (a gap stretches small tubes)
const EPS_WRAP = 0.04; // paper needs slack to wrap (design §3.3)
const ASPECT = 1.3; // chest wider than deep
const ARM_DEG = 42; // A-pose: arms 42° off vertical
const PROXY_K = 0.93; // proxies push to 93 % of the cloth's own girth: a guide, never a stretcher
// One-piece collar (no separate stand): where it rolls over, as a share of its depth at the CB.
// The pattern carries no roll-line mark. Half: the fall covers the stand down to the neck seam and
// no further — below the seam the body widens far faster than a collar's outer edge is longer than
// its neck edge, so a deeper fall cannot lie down and its free ends would stand off as wings.
// TODO(doll-folds, step «collar»): the roll becomes an outward DollFold along the roll line once
// the collar step lands (options.folds on the collar piece); ROLL_FRAC and the stand / fall split
// below stay until then.
const ROLL_FRAC = 0.5;
// A standing collar part leans in toward the neck by this much off vertical.
const STAND_LEAN = (8 * Math.PI) / 180;
// Folds (options.folds): the plies of a folded piece lie this far apart, mm, ramped to 0 at the crease.
const PLY = 1.0;
/** The ply offset ramps from 0 at the crease to PLY over this length, mm: the two plies meet at
 * the crease at ≤ 8° (atan PLY / RAMP), whatever the mesh step. */
const RAMP = 7 * PLY;

/** Keep only candidates that came from an owner row, and rebuild their connected components. */
function ownerGraphOf(
  graph: SeamGraph,
  warnings: readonly string[] = [],
  /** Exact step-editor candidates; unlike the graph pipeline this also keeps placed surface rows. */
  exact?: readonly SeamCandidate[],
): SeamGraph {
  const chosen = (exact ?? graph.chosen).filter((seam) => seam.provenance?.status === 'confirmed');
  const rejected = graph.rejected.filter(
    (seam) => seam.kind === 'closure-not-seam' && seam.provenance?.status === 'confirmed',
  );
  const parent = new Map(graph.pieces.map((piece) => [piece.pieceKey, piece.pieceKey]));
  const find = (key: string): string => {
    const next = parent.get(key);
    if (!next || next === key) return key;
    const root = find(next);
    parent.set(key, root);
    return root;
  };
  const join = (left: string, right: string) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(b, a);
  };
  for (const seam of chosen) {
    if (seam.kind === 'closure-not-seam') continue;
    const keys = [...(seam.aParts ?? edgeIdsOf(seam.a)), ...(seam.bParts ?? edgeIdsOf(seam.b))]
      .map(pk)
      .filter((key) => parent.has(key));
    for (let index = 1; index < keys.length; index++) join(keys[0], keys[index]);
  }
  const components = new Map<string, string[]>();
  for (const { pieceKey } of graph.pieces) {
    const root = find(pieceKey);
    components.set(root, [...(components.get(root) ?? []), pieceKey]);
  }
  return {
    ...graph,
    chosen,
    rejected,
    components: [...components.values()],
    warnings: [...warnings],
    assignment: undefined,
    shadow: undefined,
  };
}

type Panel = GroupedPiece & {
  idx: number;
  mesh: PieceMesh;
  offset: number;
  count: number;
  nb: number;
  ringPos: Map<number, number>;
  mirrored: boolean;
  /** Set when options.folds fold this piece: `mesh.pts` / `geom` hold the folded footprint. */
  fold?: PanelFold;
};

/** One side of a closure by marks: where its holes or buttons are on the doll. */
type FastenedSide = {
  /** The solved panel that carries them: the piece itself, or the host of a surface part. */
  P: Panel;
  part: string;
  /** Each mark on P's mesh (local vertices), carried straight on when past its footprint. */
  at: Located[];
  /** The marks in P's folded footprint. */
  foot: Pt2[];
  /** How far outside P's face the marks' layer lies, mm (a surface part's lift, signed). */
  shift: number;
  /** Which way the free edge lies from the column in that footprint, and how far. */
  free: { n: Pt2; off: number } | null;
  /** Each mark as drawn on a surface part, once it is laid. */
  laid?: Vec3[];
};

/** A closure by marks: `pairs[k]` joins top mark k with under mark pairs[k]. */
type Fastened = {
  id: string;
  top: FastenedSide;
  under: FastenedSide;
  pairs: number[];
  tieIdx: number;
  contactIdx: number;
  how: string;
};

/** A piece folded on itself (options.folds): what the mesh, the placement and the solve need. */
type PanelFold = {
  /** The piece's geometry folded (rs, edge points, marks): what charts and placement lay out. */
  geom: PieceGeom;
  /** Every vertex as cut, mm, the piece's own frame — rest lengths and the report's `uv`. */
  flat: Pt2[];
  /** Stack rank per vertex: 0 the base ply, −1 one ply under (toward the body), +1 one over. */
  ply: Int8Array;
  /** Ply offset along the outward normal, mm: ply · PLY, ramped over RAMP to the crease's ply. */
  off: Float64Array;
  /** Distance of each vertex from the nearest crease, mm, as cut. */
  creaseD: Float64Array;
  /**
   * Distance from the nearest crease lying at another ply than the vertex, mm, as cut: where its
   * offset ramps. A crease carried inside a turned package is no ramp for that package.
   */
  rampD: Float64Array;
  /** Per triangle: 1 when the folds turned it face down (an odd number of reflections). */
  triFlip: Uint8Array;
  /**
   * Stack rank per triangle: that of its vertex farthest from the creases (a crease vertex is
   * shared by two plies and carries one of them by chance; no triangle straddles a crease).
   */
  triPly: Int8Array;
  /** Edge keys (a < b: a·1e6 + b, local ids) lying on a crease: hinged, never bent the ordinary way. */
  creaseEdge: Set<number>;
  /** The creases as applied, in seq order: local vertex ids end to end, the line as cut. */
  creases: {
    seq: number;
    kind: DollFold['kind'];
    verts: number[];
    a: Pt2;
    b: Pt2;
    flipAt: Pt2;
    report: DollFoldReport;
  }[];
  /**
   * The folded footprint as the polygons of its plies, the piece's frame (what the chart's overlap
   * test and the ring widths read: the mapped contour is self-overlapping, blind to even-odd).
   */
  plies: Pt2[][];
  /** The same in chart coordinates, once the chart laid the piece. */
  pliesChart?: Pt2[][];
  /** The ply offsets were added to the placed positions (once, by whichever placement ran). */
  plyDone: boolean;
};

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** A seam-frame point back into the piece's own mm (the inverse of lib/seams `toUV`). */
const fromUV = (f: PieceFrame, p: readonly [number, number]): Pt2 => {
  const q: Pt2 = [f.x0 + p[0] * f.w, f.y0 + p[1] * f.h];
  return f.deg ? rotatePt(q, -f.deg, f.c) : q;
};

/** The inverse of an affine map (SVG order, affine.ts), or null for a degenerate one. */
const invertAffine = (T: Parameters<typeof det>[0]): Parameters<typeof det>[0] | null => {
  const [a, b, c, d, e, f] = T;
  const D = a * d - b * c;
  if (Math.abs(D) < 1e-12) return null;
  const [ia, ib, ic, id] = [d / D, -b / D, -c / D, a / D];
  return [ia, ib, ic, id, -(ia * e + ic * f), -(ib * e + id * f)];
};

const segDist2D = (p: Pt2, a: Pt2, b: Pt2): number => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
};

/**
 * Where the fold line a–b, extended, leaves the contour on either side of its middle: the `rs`
 * indices the crease runs between (the 1 mm contour sample nearest each crossing). Null when the
 * line does not cross the contour on both sides of its middle.
 */
function creaseEndsOf(rs: readonly Pt2[], f: PieceFrame, fold: DollFold): MeshCrease | null {
  return creaseEndsMm(rs, fromUV(f, fold.a), fromUV(f, fold.b));
}

/** Where the line A–B, extended, crosses the contour: mm along it from A, and the nearest `rs` index. */
function lineCrossings(rs: readonly Pt2[], A: Pt2, B: Pt2): { t: number; i: number }[] {
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  if (L < 1e-6) return [];
  const dx = (B[0] - A[0]) / L;
  const dy = (B[1] - A[1]) / L;
  const n = rs.length;
  const side = (p: Pt2) => (p[0] - A[0]) * -dy + (p[1] - A[1]) * dx;
  const along = (p: Pt2) => (p[0] - A[0]) * dx + (p[1] - A[1]) * dy;
  const out: { t: number; i: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p = rs[i];
    const q = rs[(i + 1) % n];
    const sp = side(p);
    const sq = side(q);
    if (sp > 0 === sq > 0) continue;
    const fr = sp / (sp - sq);
    const x: Pt2 = [p[0] + (q[0] - p[0]) * fr, p[1] + (q[1] - p[1]) * fr];
    out.push({ t: along(x), i: fr < 0.5 ? i : (i + 1) % n });
  }
  return out;
}

/** The same for a line in the piece's mm. */
function creaseEndsMm(rs: readonly Pt2[], A: Pt2, B: Pt2): MeshCrease | null {
  const tMid = Math.hypot(B[0] - A[0], B[1] - A[1]) / 2;
  let lo: { t: number; i: number } | null = null;
  let hi: { t: number; i: number } | null = null;
  for (const x of lineCrossings(rs, A, B)) {
    if (x.t <= tMid && (!lo || x.t > lo.t)) lo = x;
    if (x.t > tMid && (!hi || x.t < hi.t)) hi = x;
  }
  if (!lo || !hi || lo.i === hi.i) return null;
  return { s: lo.i, e: hi.i };
}

/** A line through a piece wherever it crosses it: its first and last crossing of the contour. */
function chordMm(rs: readonly Pt2[], A: Pt2, B: Pt2): MeshCrease | null {
  const xs = lineCrossings(rs, A, B).sort((p, q) => p.t - q.t);
  if (xs.length < 2 || xs[0].i === xs[xs.length - 1].i) return null;
  return { s: xs[0].i, e: xs[xs.length - 1].i };
}

/**
 * The knife pleats of a piece that close in its mesh, and the fold rows across them (pleat-mesh.ts).
 * Deterministic: the mesh (foldCreases) and the fold (foldPanel) read the same plan.
 */
function pleatPlanOf(rs: readonly Pt2[], f: PieceFrame, folds: readonly DollFold[]): PleatPlan {
  return planPleats(
    folds.map((fold, k) => ({
      k,
      kind: fold.kind,
      a: fromUV(f, fold.a),
      b: fromUV(f, fold.b),
      flipAt: fromUV(f, fold.flipAt),
    })),
    (a, b) => {
      const c = creaseEndsMm(rs, a, b);
      return c ? [rs[c.s], rs[c.e]] : null;
    },
    (q) => pointInPolygon(q, rs),
  );
}

/** The mesh crease index of the hidden-side line of a fold row bent across a pleat. */
const bentExtraIndex = (plan: PleatPlan, folds: readonly DollFold[], k: number) =>
  folds.length + [...plan.bent.keys()].sort((x, y) => x - y).indexOf(k);

/**
 * The fold rows of a piece as the mesh takes them. A pleat row folds when its fan closes in the
 * mesh (a knife pleat, pleat-mesh.ts) and is passive otherwise; a fold row across a closed pleat
 * is creased as two lines, its open-side line in its own place and its hidden-side line appended.
 */
export const foldCreases = (
  rs: readonly Pt2[],
  f: PieceFrame,
  folds: readonly DollFold[],
): MeshCrease[] => {
  const plan = pleatPlanOf(rs, f, folds);
  const out: MeshCrease[] = folds.map((fold, k) => {
    const bent = plan.bent.get(k);
    if (bent)
      return { ...(creaseEndsMm(rs, bent.meshOpen[0], bent.meshOpen[1]) ?? { s: 0, e: 0 }) };
    return {
      ...(creaseEndsOf(rs, f, fold) ?? { s: 0, e: 0 }),
      passive: fold.kind !== 'inward' && fold.kind !== 'outward' && !plan.rows.has(k),
    };
  });
  for (const k of [...plan.bent.keys()].sort((x, y) => x - y)) {
    const bent = plan.bent.get(k)!;
    out.push({ ...(creaseEndsMm(rs, bent.meshHidden[0], bent.meshHidden[1]) ?? { s: 0, e: 0 }) });
  }
  return out;
};

/**
 * Fold a meshed piece on itself: every fold in seq order turns the side holding `flipAt` (as cut)
 * over the crease's current line — a plain reflection of the vertices on that side, so a second
 * fold over a turned part rolls or zigzags it as paper would. A crease that crosses an earlier one
 * has one current line per stretch, and each ply turns over the image of its own stretch (the rule
 * and its helpers are shared with fold-outline.ts, so 2D and 3D agree). `mesh.pts` becomes the
 * folded footprint; the piece as cut stays in `flat`. Stack ranks: the turned package goes under
 * (inward) or over (outward) the rest, its own order reversed as a flipped stack is.
 */
export function foldPanel(
  g: PieceGeom,
  mesh: PieceMesh,
  folds: readonly DollFold[],
  frame: PieceFrame,
  h: number,
  warnings: string[],
  reports: DollFoldReport[],
): PanelFold | undefined {
  const count = mesh.pts.length;
  const flat: Pt2[] = mesh.pts.map((p) => [p[0], p[1]]);
  const cur = mesh.pts;
  const plyOf = new Int8Array(count);
  const creases: PanelFold['creases'] = [];
  const chain: FoldStep[] = [];
  /** Per applied fold, the vertices it moved: a crease vertex stays with the ply it did not leave. */
  const moves: Uint8Array[] = [];
  const blank = (fold: DollFold, note: string): DollFoldReport => ({
    pieceKey: g.pieceKey,
    seq: fold.seq,
    kind: fold.kind,
    applied: false,
    creaseDevMm: NaN,
    dihedralMinDeg: NaN,
    dihedralMeanDeg: NaN,
    plyGapMm: null,
    interpenetrating: 0,
    cutWidthMm: NaN,
    finishedWidthMm: NaN,
    drawnWidthMm: NaN,
    note,
  });
  const refuse = (fold: DollFold, why: string) => {
    const r = blank(fold, `${why} — not folded`);
    reports.push(r);
    warnings.push(`${g.pieceKey} fold ${fold.seq}: ${r.note}`);
  };
  /** The crease's line now, one stretch per run between its crossings with the folds applied. */
  const stretchesOf = (verts: readonly number[], a: Pt2, b: Pt2): FoldStretch[] => {
    const earlier = new Set(creases.flatMap((c) => c.verts));
    const runs: number[][] = [[verts[0]]];
    verts.slice(1).forEach((v, n) => {
      runs[runs.length - 1].push(v);
      if (n + 2 < verts.length && earlier.has(v)) runs.push([v]);
    });
    return runs.map((run) => {
      const p = flat[run[0]];
      const q = flat[run[run.length - 1]];
      const moved = movedBy([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], chain);
      if (runs.length > 1) return { moved, a1: carry(a, moved, chain), b1: carry(b, moved, chain) };
      const [s, e] = [cur[verts[0]], cur[verts[verts.length - 1]]];
      return { moved, a1: [s[0], s[1]], b1: [e[0], e[1]] };
    });
  };
  /** The turned package goes under (inward) or over (outward) the rest, its order reversed. */
  const stack = (mv: Uint8Array, moving: readonly number[], kind: DollFold['kind']) => {
    let lo = Infinity;
    let hi = -Infinity;
    let minM = Infinity;
    let maxM = -Infinity;
    for (let i = 0; i < count; i++) {
      if (mv[i]) {
        minM = Math.min(minM, plyOf[i]);
        maxM = Math.max(maxM, plyOf[i]);
      } else {
        lo = Math.min(lo, plyOf[i]);
        hi = Math.max(hi, plyOf[i]);
      }
    }
    for (const i of moving)
      plyOf[i] = kind === 'inward' ? lo - 1 - (plyOf[i] - minM) : hi + 1 + (maxM - plyOf[i]);
  };
  /** The rows foldPlies reads for the footprint (a bent row as its straight line as cut). */
  const plyRows: { seq: number; a: Pt2; b: Pt2; flipAt: Pt2; kind: DollFold['kind'] }[] = [];

  // A knife pleat closes first, before any turn: the halves turn about its apex, the intake lies
  // as a Z under the half its flip point names (pleat-mesh.ts). Its plies are kept apart from the
  // turns' stack and added at the end: the turns stack as if the pleat lay flat, the pleat's own
  // two plies sit under its hidden half.
  const plan = pleatPlanOf(g.rs, frame, folds);
  for (const w of plan.words) warnings.push(`${g.pieceKey}: ${w}`);
  const pleatPly = new Int8Array(count);
  const closedPleats: MeshPleat[] = [];
  const closedIdx = new Set<number>();
  plan.pleats.forEach((pl, pi) => {
    if (closedPleats.length) {
      warnings.push(
        `${g.pieceKey}: pleat at rows ${[pl.openLeg, pl.centre, pl.hiddenLeg].map((k) => folds[k].seq).join(', ')} stays flat — one pleat per piece closes in the doll`,
      );
      return;
    }
    const rowsK = [pl.openLeg, pl.centre, pl.hiddenLeg];
    const vs = rowsK.map((k) => mesh.creases?.[k] ?? []);
    if (vs.some((v) => v.length < 2)) {
      warnings.push(
        `${g.pieceKey}: pleat at rows ${rowsK.map((k) => folds[k].seq).join(', ')} stays flat — its lines do not crease the mesh from contour to contour`,
      );
      return;
    }
    const mv = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      const q = flat[i];
      cur[i] = pl.map(q);
      const r = pl.regionOf(q);
      if (r === 'hiddenIntake') {
        pleatPly[i] = -1;
        mv[i] = 1;
      } else if (r === 'openIntake') pleatPly[i] = -2;
    }
    chain.push({
      sideOf: (q) => (pl.regionOf(q) === 'hiddenIntake' ? 1 : -1),
      sF: 1,
      stretches: [],
      map: (p, q) => pl.map(p, q),
    });
    moves.push(mv);
    closedPleats.push(pl);
    closedIdx.add(pi);
    rowsK.forEach((k, j) => {
      const fold = folds[k];
      const verts = vs[j];
      const report = blank(
        fold,
        j === 1
          ? `pleat closed in the mesh: the halves turned about its point, the intake laid under as a Z`
          : `pleat ${j === 0 ? 'placement' : 'fold'} line, closed with its centre row`,
      );
      report.applied = true;
      reports.push(report);
      creases.push({
        seq: fold.seq,
        kind: fold.kind,
        verts,
        a: flat[verts[0]],
        b: flat[verts[verts.length - 1]],
        flipAt: fromUV(frame, fold.flipAt),
        report,
      });
    });
  });

  /** A fold row across a pleat: below its bent line it turns, over one line once the pleat closed. */
  const foldBent = (fold: DollFold, k: number) => {
    const B = plan.bent.get(k)!;
    const pl = plan.pleats[B.pleat];
    const vO = mesh.creases?.[k] ?? [];
    const vH = mesh.creases?.[bentExtraIndex(plan, folds, k)] ?? [];
    if (vO.length < 2 || vH.length < 2) {
      refuse(
        fold,
        'the fold line, bent at the pleat, does not crease the piece from contour to contour',
      );
      return;
    }
    const near = (ids: readonly number[], p: Pt2) => {
      let best = 0;
      for (let j = 1; j < ids.length; j++)
        if (
          Math.hypot(flat[ids[j]][0] - p[0], flat[ids[j]][1] - p[1]) <
          Math.hypot(flat[ids[best]][0] - p[0], flat[ids[best]][1] - p[1])
        )
          best = j;
      return best;
    };
    // Each line from its end on the contour (in its own half) to where the bend leaves it.
    const fromEnd = (ids: number[], end: Pt2) =>
      near([ids[0], ids[ids.length - 1]], end) === 0 ? ids : [...ids].reverse();
    const lo = fromEnd([...vO], B.endOpen);
    const lh = fromEnd([...vH], B.endHidden);
    const centreV = new Set(mesh.creases?.[pl.centre] ?? []);
    const legV = new Set(mesh.creases?.[pl.hiddenLeg] ?? []);
    let iC = lo.findIndex((v) => centreV.has(v));
    if (iC < 0) iC = near(lo, B.atCentre);
    let iL = lh.findIndex((v) => legV.has(v));
    if (iL < 0) iL = near(lh, B.atLeg);
    const openPart = lo.slice(0, iC + 1);
    const hiddenPart = lh.slice(0, iL + 1).reverse();
    const xC = lo[iC];
    const xL = lh[iL];
    let joined = xC === xL;
    if (!joined)
      for (let t = 0; t < mesh.tris.length && !joined; t += 3) {
        const tri = [mesh.tris[t], mesh.tris[t + 1], mesh.tris[t + 2]];
        joined = tri.includes(xC) && tri.includes(xL);
      }
    // The side that turns, per region: the one the row's flip point is on, read at each line.
    const A0 = fromUV(frame, fold.a);
    const B0 = fromUV(frame, fold.b);
    const flipAt = fromUV(frame, fold.flipAt);
    const sFlip = sideOfLine(flipAt, [A0, B0]);
    if (!sFlip) {
      refuse(fold, 'the side to turn (flipAt) lies on the fold line');
      return;
    }
    const dl = Math.hypot(B0[0] - A0[0], B0[1] - A0[1]) || 1;
    const nrm: Pt2 = [(-(B0[1] - A0[1]) / dl) * sFlip, ((B0[0] - A0[0]) / dl) * sFlip];
    const toward = (p: Pt2): Pt2 => [p[0] + 5 * nrm[0], p[1] + 5 * nrm[1]];
    const sO = sideOfLine(toward(B.endOpen), B.open);
    const sI = sideOfLine(toward(B.atCentre), B.intake);
    const sH = sideOfLine(toward(B.endHidden), B.hidden);
    const lineAt = (q: Pt2): [readonly [Pt2, Pt2], number] => {
      const r = pl.regionOf(q);
      return r === 'hidden' ? [B.hidden, sH] : r === 'hiddenIntake' ? [B.intake, sI] : [B.open, sO];
    };
    const turns = (q: Pt2) => {
      const [L, sd] = lineAt(q);
      return sideOfLine(q, L) === sd;
    };
    const onCrease = new Set([...openPart, ...hiddenPart]);
    const moving: number[] = [];
    for (let i = 0; i < count; i++) if (!onCrease.has(i) && turns(flat[i])) moving.push(i);
    if (!moving.length) {
      refuse(fold, 'nothing of the piece lies on the side to turn');
      return;
    }
    // The pleat closed: one line through the two ends as they lie now. Flat: each region's own.
    const closedHere = closedIdx.has(B.pleat);
    const one: FoldStretch = { moved: [], a1: cur[lo[0]], b1: cur[lh[0]] };
    const stretchOf = (q: Pt2): FoldStretch => {
      if (closedHere) return one;
      const [L] = lineAt(q);
      return { moved: [], a1: L[0], b1: L[1] };
    };
    const mv = new Uint8Array(count);
    for (const i of moving) {
      const st = stretchOf(flat[i]);
      cur[i] = reflectTo(cur[i], st.a1, st.b1);
      mv[i] = 1;
    }
    stack(mv, moving, fold.kind);
    chain.push({ sideOf: (q) => (turns(q) ? 1 : -1), sF: 1, stretches: [one], stretchOf });
    moves.push(mv);
    const report = blank(
      fold,
      `${fold.kind} fold creased along ${openPart.length + hiddenPart.length - 2 + (xC === xL ? 0 : 1)} mesh edges, bent where it crosses the pleat${closedHere ? ' — one straight line with the pleat closed' : ''} · ${moving.length} of ${count} vertices turned ${fold.kind === 'inward' ? 'under' : 'over'} the rest`,
    );
    report.applied = true;
    reports.push(report);
    const part = (verts: number[]) => ({
      seq: fold.seq,
      kind: fold.kind,
      verts,
      a: flat[verts[0]],
      b: flat[verts[verts.length - 1]],
      flipAt,
      report,
    });
    creases.push(part(openPart));
    if (xC !== xL && joined) creases.push(part([xC, xL]));
    creases.push(part(hiddenPart));
    plyRows.push({ seq: fold.seq, a: A0, b: B0, flipAt, kind: fold.kind });
  };

  folds.forEach((fold, k) => {
    // An even pleat, or a pleat the plan left flat, stays flat. It must never fall through the
    // inward/outward ternary below and be reflected as an outward fold.
    if (fold.kind !== 'inward' && fold.kind !== 'outward') return;
    if (plan.bent.has(k)) {
      foldBent(fold, k);
      return;
    }
    const verts = mesh.creases?.[k] ?? [];
    if (verts.length < 2) {
      refuse(
        fold,
        'the fold line does not cross the piece as one straight crease from contour to contour',
      );
      return;
    }
    const a = flat[verts[0]];
    const b = flat[verts[verts.length - 1]];
    const sideOf = (q: Pt2) =>
      Math.sign((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]));
    const flipAt = fromUV(frame, fold.flipAt);
    const sF = sideOf(flipAt);
    if (!sF) {
      refuse(fold, 'the side to turn (flipAt) lies on the fold line');
      return;
    }
    const onCrease = new Set(verts);
    const moving: number[] = [];
    for (let i = 0; i < count; i++) if (!onCrease.has(i) && sideOf(flat[i]) === sF) moving.push(i);
    if (!moving.length) {
      refuse(fold, 'nothing of the piece lies on the side to turn');
      return;
    }
    const stretches = stretchesOf(verts, a, b);
    const mv = new Uint8Array(count);
    for (const i of moving) {
      const s = stretchFor(
        stretches,
        moves.map((m) => m[i] === 1),
      );
      cur[i] = reflectTo(cur[i], s.a1, s.b1);
      mv[i] = 1;
    }
    stack(mv, moving, fold.kind);
    chain.push({ sideOf, sF, stretches });
    moves.push(mv);
    const report = blank(
      fold,
      `${fold.kind} fold creased along ${verts.length - 1} mesh edges · ${moving.length} of ${count} vertices turned ${fold.kind === 'inward' ? 'under' : 'over'} the rest`,
    );
    report.applied = true;
    reports.push(report);
    creases.push({ seq: fold.seq, kind: fold.kind, verts, a, b, flipAt, report });
    plyRows.push({ seq: fold.seq, a, b, flipAt, kind: fold.kind });
  });
  for (let i = 0; i < count; i++) plyOf[i] += pleatPly[i];
  if (!creases.length) return undefined;
  const foldPt = (q: Pt2): Pt2 => carry(q, movedBy(q, chain), chain);
  const creaseD = new Float64Array(count);
  const off = new Float64Array(count);
  const rampD = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    let d = Infinity;
    // The ramp runs from the nearest crease lying at another ply than the vertex, down to that
    // crease's ply: the face for a first turn, the turned package for a crease a later fold
    // carried along (a placket edge inside a turned-up hem lies with the hem, not at the face).
    let r = Infinity;
    let base = 0;
    for (const c of creases) {
      const dc = segDist2D(flat[i], c.a, c.b);
      d = Math.min(d, dc);
      if (dc >= r) continue;
      let best = Infinity;
      let at = 0;
      for (const v of c.verts) {
        const e = (flat[v][0] - flat[i][0]) ** 2 + (flat[v][1] - flat[i][1]) ** 2;
        if (e < best) [best, at] = [e, plyOf[v]];
      }
      if (at !== plyOf[i]) [r, base] = [dc, at];
    }
    creaseD[i] = d;
    rampD[i] = r;
    off[i] = PLY * (r < Infinity ? base + (plyOf[i] - base) * Math.min(1, r / RAMP) : plyOf[i]);
  }
  const T = mesh.tris;
  const triFlip = new Uint8Array(T.length / 3);
  for (let t = 0; t < T.length; t += 3) {
    const A = flat[T[t]];
    const B = flat[T[t + 1]];
    const C = flat[T[t + 2]];
    const cen: Pt2 = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];
    let f = 0;
    for (const c of chain) if (c.sideOf(cen) === c.sF) f ^= 1;
    triFlip[t / 3] = f;
  }
  const triPly = new Int8Array(T.length / 3);
  // Beside a crossing a triangle can lie on creases with all three vertices, none of them telling
  // its ply: its centroid does, through the rank of a vertex off the creases moved the same way.
  const crossed = chain.some((c) => c.stretches.length > 1);
  const rankOf = new Map<string, number>();
  if (crossed)
    for (let i = 0; i < count; i++)
      if (creaseD[i] > 1e-6) rankOf.set(moves.map((m) => m[i]).join(), plyOf[i]);
  for (let t = 0; t < T.length; t += 3) {
    let far = T[t];
    for (const v of [T[t + 1], T[t + 2]]) if (creaseD[v] > creaseD[far]) far = v;
    triPly[t / 3] = plyOf[far];
    if (crossed && creaseD[far] <= 1e-6) {
      const [A, B, C] = [flat[T[t]], flat[T[t + 1]], flat[T[t + 2]]];
      const cen: Pt2 = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];
      const rank = rankOf.get(movedBy(cen, chain).map(Number).join());
      if (rank !== undefined) triPly[t / 3] = rank;
    }
  }
  const creaseEdge = new Set<number>();
  const key = (a: number, b: number) => (a < b ? a * 1e6 + b : b * 1e6 + a);
  for (const c of creases)
    for (let k = 0; k + 1 < c.verts.length; k++) creaseEdge.add(key(c.verts[k], c.verts[k + 1]));
  const geom: PieceGeom = {
    ...g,
    rs: g.rs.map(foldPt),
    edges: g.edges.map((e) => ({ ...e, pts: e.pts.map(foldPt) })),
    ...(g.marks ? { marks: g.marks.map((m) => ({ ...m, pts: m.pts.map(foldPt) })) } : {}),
  };
  const plies = foldPlies(g.rs, plyRows).plies.map((ply) => ply.poly);
  return {
    geom,
    flat,
    ply: plyOf,
    off,
    creaseD,
    rampD,
    triFlip,
    triPly,
    creaseEdge,
    creases,
    plies,
    plyDone: false,
  };
}

type Work = {
  id: string;
  a: EdgeId[];
  b: EdgeId[];
  kind: DollSeamReport['kind'];
  origin: DollSeamReport['origin'];
  A: Path;
  B: Path;
  same: boolean;
  aRange: [number, number];
  bRange: [number, number];
  rows: SeamRows;
  solver: SolverSeam;
  target: number;
  born: number;
  ramp: number;
  note: string;
  released?: boolean;
  closure?: boolean;
  /** Not solved: free edges facing each other, welded only for the loop topology, drawn open. */
  virtual?: boolean;
  /** The sewn stretch of end parts of a composite (mm along each such edge), for the report. */
  partRange?: Record<EdgeId, [number, number]>;
  /** Intake on side B folded closed before the lengths were compared (pleats, darts), mm. */
  foldedMm?: number;
  /** Found from the technologist's order (a declared join the graph had no seam for). */
  fromOrder?: boolean;
  /** Exact sleeve-cap row used to register a sleeve on the body; keep the attachment structural. */
  sleeveCap?: boolean;
  /** L4: a seam a person confirmed (stored row) — never released; open at the end = contradiction. */
  confirmed?: boolean;
  /** Owner mode: whether an operation names this confirmed row. */
  inStep?: boolean;
  /** Owner mode: a sewing step named no row — sewn by its step picture's guess (drawn dashed). */
  guess?: { step: number };
  /** L4: a doll proposal on a pair a person rejected — not sewn, not reported as a seam. */
  rejectedByPerson?: boolean;
  /** L4: a closure drawn overlapped (the buttoned centre fronts). */
  overlap?: DollClosureReport;
  /** Not reported as a seam: replaced by its mirror-twin reading, or refused (said in notSewn). */
  hidden?: boolean;
  /**
   * The crotch: a seam between the left and the right leg (the rise — legs meet nowhere else). The
   * paper doll cannot fold paper into the saddle under the body without straining it, so the
   * crotch is never released as «tearing the paper», and never read as crossing the doll.
   */
  crotch?: boolean;
  /**
   * A confirmed row whose walk starts or ends on a laid piece: sewn over its drawn parts, reported
   * once the piece is laid, measured over the whole row (the laid stretch included). Its whole
   * sides and the laid pieces its walk runs onto.
   */
  laidEnds?: { a: EdgeId[]; b: EdgeId[]; off: string[] };
};

/**
 * Trouser legs read from shape alone (no names): a tall, narrow piece whose top end is a straight,
 * near-level waist running into a concave crotch curve (the curve below the waist widens the piece
 * — a front / back leg). A dress or a shirt front has a short slanted shoulder above its armhole,
 * never a level waist as wide as half the piece. Returns the leg pieces' names, or null unless a
 * front and a back pair of them are found.
 */
function trouserLegs(pieces: readonly PieceGeom[]): string | null {
  const legs = new Set<string>();
  for (const g of pieces) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [x, y] of g.rs) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    const w = x1 - x0;
    const h = y1 - y0;
    if (h < 700 || w > 0.5 * h) continue;
    const ends = (e: Edge) => [e.pts[0], e.pts[e.pts.length - 1]];
    const near = (a: Pt2, b: Pt2) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 3;
    const plain = g.edges.filter((e) => e.kind === 'edge');
    const ok = plain.some((c) => {
      if (c.turnDeg > -120 || c.chordMm / c.lenMm > 0.98 || c.lenMm < 150) return false;
      const top = ends(c).reduce((m, q) => (q[1] > m[1] ? q : m));
      if (top[1] < y1 - 0.15 * h) return false;
      return plain.some((e) => {
        if (e === c || !ends(e).some((q) => near(q, top))) return false;
        const [a, b] = ends(e);
        const off = Math.atan2(Math.abs(b[1] - a[1]), Math.abs(b[0] - a[0]));
        return e.chordMm / e.lenMm >= 0.97 && off <= Math.PI / 12 && e.lenMm >= 0.5 * w;
      });
    });
    if (ok) legs.add(g.pieceKey);
  }
  const named = pieces.filter(
    (g) => legs.has(g.pieceKey) && g.twinOf.some((t) => t.kind === 'mirror' && legs.has(t.key)),
  );
  // Two mirror pairs (front legs and back legs): one tall pair alone could be a dress's panels.
  return named.length >= 4 ? named.map((g) => g.name).join(', ') : null;
}

const HONESTY =
  'paper doll — shape approximate, no fabric, no body · seams pulled shut along the pattern · measures come from the pattern laid flat, never from this shape';

export function solveDoll(input: DollInput): DollReport {
  const t0 = now();
  const opt = input.options ?? {};
  const warnings: string[] = [];
  // L4: stored seams. Owner mode is stricter: after resolution only the confirmed owner candidates
  // remain. The historical rows-without-mode path is unchanged for probes and archived goldens.
  const owner = opt.seams?.mode === 'owner';
  const l4 = owner || !!opt.seams?.rows.length;
  const ownerInStepKeys = new Set([
    ...(opt.seams?.inStepKeys ?? []),
    ...(opt.seams?.candidates ?? [])
      .filter((candidate) => candidate.inStep && !candidate.guess)
      .map((candidate) => candidate.seamKey),
  ]);
  /** Owner mode: the step each guess candidate was guessed for, by its synthetic key. */
  const guessStepOf = new Map(
    (opt.seams?.candidates ?? [])
      .filter((candidate) => candidate.guess)
      .map((candidate) => [candidate.seamKey, candidate.guess!.step] as const),
  );
  const isGuess = (c: SeamCandidate) =>
    c.provenance?.source === 'doll' && guessStepOf.has(c.provenance.seamKey);
  const declaredJoins = owner ? undefined : opt.joins;
  const proposalsAllowed = !owner && opt.proposeComposite !== false;
  let resolvedRows: SizeResolved | undefined;
  /** By steps: confirmed rows no step names — not sewn, kept only as cues for laying composites. */
  let joinsNotSewn: SeamCandidate[] = [];
  let graphIn = input.graph;
  if (l4 && opt.seams?.rows.length) {
    const S = opt.seams!;
    const grain = grainDegOf(input.facts);
    graphIn = readSeamGraph(
      input.facts,
      undefined,
      undefined,
      (pieces) => {
        const r = resolveAcrossSizes(S.rows, [
          { size: S.size, pieces, grainDeg: grain },
          ...(S.sizes ?? []).filter((x) => x.size !== S.size),
        ]).get(S.size)!;
        if (owner && S.candidates) {
          const rowByKey = new Map(S.rows.map((row) => [row.seamKey, row]));
          const edgeIds = new Set(pieces.flatMap((piece) => piece.edges.map((edge) => edge.id)));
          const pieceKeys = new Set(pieces.map((piece) => piece.pieceKey));
          const exactKeys = new Set(S.candidates.map(({ seamKey }) => seamKey));
          const ignoredWords = new Set(
            [...r.stale, ...r.orphan]
              .filter(({ seam }) => exactKeys.has(seam.seamKey))
              .map(({ words }) => words),
          );
          r.words = r.words.filter((words) => !ignoredWords.has(words));
          // By steps: a closure row no step names is not drawn buttoned either.
          if (S.inStepKeys)
            r.closures = r.closures.filter((c) => ownerInStepKeys.has(c.provenance?.seamKey ?? ''));
          // A confirmed row no step names is not sewn here — but a person confirmed the pieces
          // meet there, so it still says which of two parts sits above the other when a composite
          // path is laid (the yoke above the front it is sewn on, not hanging under it).
          if (S.inStepKeys)
            joinsNotSewn = r.forced.filter(
              (c) => !c.surface && !ownerInStepKeys.has(c.provenance?.seamKey ?? ''),
            );
          r.forced = S.candidates.flatMap(({ seamKey, candidate, guess }) => {
            const row = guess ? undefined : rowByKey.get(seamKey);
            if (!guess && (!row || row.status !== 'confirmed')) return [];
            const present = candidate.surface
              ? pieceKeys.has(candidate.surface.host) && pieceKeys.has(candidate.surface.part)
              : [
                  ...(candidate.aParts ?? edgeIdsOf(candidate.a)),
                  ...(candidate.bParts ?? edgeIdsOf(candidate.b)),
                ]
                  .flatMap(edgeIdsOf)
                  .every((edge) => edgeIds.has(edge));
            if (!present) return [];
            // A guess rides as a confirmed candidate (ownerGraphOf keeps those) under a synthetic
            // provenance the doll recognises (`isGuess`): sewn, drawn dashed, never a contradiction.
            const provenance = row
              ? {
                  seamKey,
                  status: row.status,
                  source: row.source,
                  direction: row.direction,
                  by: row.updatedBy || row.createdBy || 'owner',
                  at: row.updatedAt || row.createdAt || '',
                  how: 'hint' as const,
                }
              : {
                  seamKey,
                  status: 'confirmed' as const,
                  source: 'doll' as const,
                  direction: 'unknown' as const,
                  by: 'doll',
                  at: '',
                  how: 'shape' as const,
                };
            return [{ ...candidate, provenance }];
          });
        }
        resolvedRows = r;
        return r;
      },
      undefined,
      // the same assignment (greedy / global) the caller's graph was read with
      opt.assignment,
    );
  }
  if (owner) graphIn = ownerGraphOf(graphIn, resolvedRows?.words, resolvedRows?.forced);
  const ownerSeamPieces = owner
    ? new Set(
        graphIn.chosen.flatMap((seam) =>
          seam.surface
            ? [seam.surface.host, seam.surface.part]
            : [...(seam.aParts ?? edgeIdsOf(seam.a)), ...(seam.bParts ?? edgeIdsOf(seam.b))].map(
                pk,
              ),
        ),
      )
    : null;
  const layerRelations = opt.seams?.layers ?? [];
  const layerScore = new Map<string, number>();
  for (const [under, over] of layerRelations) {
    layerScore.set(under, (layerScore.get(under) ?? 0) - 1);
    layerScore.set(over, (layerScore.get(over) ?? 0) + 1);
  }
  /** Today's role/area offset is used only when none of these pieces has an explicit claim. */
  const claimedLayer = (keys: Iterable<string>, fallback: number): number => {
    const scores = [...keys].flatMap((key) => (layerScore.has(key) ? [layerScore.get(key)!] : []));
    if (!scores.length) return fallback;
    const score = scores.reduce((sum, value) => sum + value, 0) / scores.length;
    return score === 0 ? 0 : score > 0 ? 3 : -3;
  };
  const isUnder = (under: Iterable<string>, over: Iterable<string>): boolean => {
    const targets = new Set(over);
    const next = new Map<string, string[]>();
    for (const [a, b] of layerRelations) next.set(a, [...(next.get(a) ?? []), b]);
    const todo = [...under];
    const seen = new Set(todo);
    while (todo.length) {
      const key = todo.shift()!;
      for (const candidate of next.get(key) ?? []) {
        if (targets.has(candidate)) return true;
        if (!seen.has(candidate)) {
          seen.add(candidate);
          todo.push(candidate);
        }
      }
    }
    return false;
  };
  const isConf = (c: SeamCandidate) => l4 && c.provenance?.status === 'confirmed' && !isGuess(c);
  const excludedPairs = (resolvedRows?.excluded ?? []).filter((x) => !x.surface);
  /** A pair of runs a person rejected (any edge of a on one side, any of b on the other). */
  const isExcluded = (a: readonly EdgeId[], b: readonly EdgeId[]) => {
    if (!excludedPairs.length) return false;
    const ea = a.flatMap((x) => edgeIdsOf(x));
    const eb = b.flatMap((x) => edgeIdsOf(x));
    return excludedPairs.some((x) => {
      const A = new Set(x.aIds);
      const B = new Set(x.bIds);
      return (
        (ea.some((e) => A.has(e)) && eb.some((e) => B.has(e))) ||
        (ea.some((e) => B.has(e)) && eb.some((e) => A.has(e)))
      );
    });
  };
  // Mirrored ×2 blocks become two panels (the block and its mirror).
  const inst = instanceMirrored(graphIn, input.facts);
  warnings.push(...inst.notes);
  // A card with no garment named whose pattern carries trouser legs (by shape) is read as trousers:
  // the legs are wrapped as legs, not left floating beside a torso (11.10 corpus: SS26-011).
  // (a «bottom» — a waistband on paired panels read from the names — may be a skirt or trousers:
  // the leg shape decides)
  const legsByShape =
    inst.facts.category === 'generic' || inst.facts.category === 'bottom'
      ? trouserLegs(inst.graph.pieces)
      : null;
  if (legsByShape)
    warnings.push(
      `the card names no trousers — read as trousers from the pattern: ${legsByShape} carry a crotch curve under a straight waist (leg panels)`,
    );
  const facts = legsByShape ? { ...inst.facts, category: 'trousers' as const } : inst.facts;
  // Suspect graph seams: joins that make the wrap topology impossible are not sewn as drawn.
  //  · the two fronts of a top sewn along their centre-front edges: that is the opening — a
  //    closure (buttons), drawn closed like one;
  //  · the left leg sewn to the right leg along more than a rise: legs meet only at the crotch.
  const suspectsIn = (Gx: ReturnType<typeof groupPieces>) => {
    const gp = new Map(Gx.pieces.map((p) => [p.key, p]));
    /** An edge running up its piece (pieces are drawn upright): chord within 30° of vertical. */
    const upright = (id: string) => {
      const e = gp.get(pk(id))?.geom.edges.find((x) => x.id === id);
      if (!e || e.pts.length < 2) return true;
      const p = e.pts[0];
      const q = e.pts[e.pts.length - 1];
      return Math.atan2(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1])) <= Math.PI / 6;
    };
    const handOf = (k: string) => gp.get(k)?.geom.hand ?? null;
    const edgeLen = (id: string) =>
      edgeIdsOf(id).reduce(
        (t, one) => t + (gp.get(pk(one))?.geom.edges.find((e) => e.id === one)?.lenMm ?? 0),
        0,
      );
    const lenOf = (s: GroupedSeam) => Math.max(edgeLen(s.seam.a), edgeLen(s.seam.b));
    const out = new Map<string, { kind: 'closure' | 'drop'; note: string }>();
    for (const s of Gx.seams) {
      const a = gp.get(pk(s.a[0]));
      const b = gp.get(pk(s.b[0]));
      if (!a || !b) continue;
      // A seam a person confirmed is never suspect.
      if (isConf(s.seam)) continue;
      if (a.key === b.key) {
        // A piece onto itself: only a tube seam running its length (the matcher's rule, kept here
        // for seams that reach the doll another way).
        if ([...s.a, ...s.b].some((e) => !upright(e)))
          out.set(`${s.seam.a}~${s.seam.b}`, {
            kind: 'drop',
            note: `not sewn — the graph sews ${a.key} to itself across its width; a piece is sewn to itself only along a tube seam running its length`,
          });
        continue;
      }
      const id = `${s.seam.a}~${s.seam.b}`;
      const hands = new Set([handOf(a.key), handOf(b.key)]);
      const lr = hands.has('L') && hands.has('R');
      // Centre-front: two fronts, or — when the back already has its own left/right centre seam —
      // any other long left/right seam of the body (fronts whose names carry no role).
      const isBack = (p: GroupedPiece) => p.role === 'back' || p.role === 'yoke';
      const cfByRole = a.role === 'front' && b.role === 'front';
      const cfByCb =
        !isBack(a) &&
        !isBack(b) &&
        Gx.seams.some((o) => {
          const oa = gp.get(pk(o.a[0]));
          const ob = gp.get(pk(o.b[0]));
          if (!oa || !ob || o === s || !isBack(oa) || !isBack(ob)) return false;
          const oh = new Set([handOf(oa.key), handOf(ob.key)]);
          return oh.has('L') && oh.has('R') && lenOf(o) > 300;
        });
      if (a.group === 'BODY' && b.group === 'BODY' && (cfByRole || cfByCb) && lr && lenOf(s) > 300)
        out.set(id, {
          kind: 'closure',
          note: `suspect — the graph sews the left front to the right front along ${lenOf(s).toFixed(0)} mm: that is the front opening (a closure), drawn closed, not a seam`,
        });
      // The left and the right sleeve (cuff) are never sewn to each other: limbs meet the body.
      const gs = new Set([a.group, b.group]);
      const limb = (['SLEEVE', 'CUFF'] as const).find((x) => gs.has(`${x}_L`) && gs.has(`${x}_R`));
      if (limb) {
        out.set(id, {
          kind: 'drop',
          note: `not sewn — the graph sews the left ${limb.toLowerCase()} to the right one (${lenOf(s).toFixed(0)} mm); the two ${limb === 'SLEEVE' ? 'sleeves' : 'cuffs'} never meet`,
        });
        continue;
      }
      // Mirror halves meet only on their centre line (a centre front / back running up the
      // pieces): two hems, two wrists, two waists, two shoulders of mirror twins are not a seam.
      const mirrorTwins = a.geom.twinOf.some((t) => t.key === b.key && t.kind === 'mirror');
      const across = [...s.a, ...s.b].some((e) => !upright(e));
      if (mirrorTwins && across && !(gs.has('LEG_L') && gs.has('LEG_R'))) {
        out.set(id, {
          kind: 'drop',
          note: `not sewn — the graph sews two mirror halves to each other across them (${lenOf(s).toFixed(0)} mm, not their centre line); mirror halves meet only along a centre front / back`,
        });
        continue;
      }
      const legs = gs;
      if (legs.has('LEG_L') && legs.has('LEG_R') && lenOf(s) > 450)
        out.set(id, {
          kind: 'drop',
          note: `suspect — the graph sews the left leg to the right leg along ${lenOf(s).toFixed(0)} mm; legs meet only at the rise (crotch) — not sewn`,
        });
    }
    // A VENT (a two-piece sleeve's cuff vent, a hem vent): two pieces already joined by a long seam
    // also paired by a short one (≤ 150 mm) that on BOTH pieces sits two edges from the long seam's
    // edge round the contour, a small notched step (≤ 60 mm) between, and runs along the same line
    // as the long seam — the seam's continuation below the step, which stays open: not sewn.
    {
      const edgeOf = (id: string) => {
        const P = gp.get(pk(id));
        return P ? { P, e: P.geom.edges.find((x) => x.id === id) } : null;
      };
      const chordDir = (e: Edge) => {
        const p = e.pts[0];
        const q = e.pts[e.pts.length - 1];
        return Math.atan2(q[1] - p[1], q[0] - p[0]);
      };
      const parallel = (a: Edge, b: Edge) => {
        let d = Math.abs(chordDir(a) - chordDir(b)) % Math.PI;
        if (d > Math.PI / 2) d = Math.PI - d;
        return d <= (25 * Math.PI) / 180;
      };
      /** The long seam's edge on this piece lies two edges from e with a short step between. */
      const stepFrom = (P: GroupedPiece, e: Edge, long: Edge) => {
        const plain = P.geom.edges.filter((x) => x.kind === 'edge').sort((x, y) => x.k - y.k);
        const n = plain.length;
        const i = plain.findIndex((x) => x.id === e.id);
        const j = plain.findIndex((x) => x.id === long.id);
        if (i < 0 || j < 0 || n < 4) return false;
        const d = (j - i + n) % n;
        if (d !== 2 && d !== n - 2) return false;
        const mid = plain[(i + (d === 2 ? 1 : n - 1)) % n];
        // (the step carries the vent's notch — a plain short edge between two seams is no vent)
        return mid.lenMm <= 60 && mid.notchesMm.length > 0 && parallel(e, long);
      };
      for (const s of Gx.seams) {
        const id = `${s.seam.a}~${s.seam.b}`;
        if (out.has(id) || isConf(s.seam) || s.a.length !== 1 || s.b.length !== 1) continue;
        const A = edgeOf(s.a[0]);
        const B = edgeOf(s.b[0]);
        if (!A?.e || !B?.e || A.P.key === B.P.key) continue;
        if (A.e.lenMm > 150 || B.e.lenMm > 150) continue;
        const long = Gx.seams.find((o) => {
          if (o === s || o.a.length !== 1 || o.b.length !== 1 || out.has(`${o.seam.a}~${o.seam.b}`))
            return false;
          const X = edgeOf(o.a[0]);
          const Y = edgeOf(o.b[0]);
          if (!X?.e || !Y?.e || Math.min(X.e.lenMm, Y.e.lenMm) < 300) return false;
          const [la, lb] =
            X.P.key === A.P.key && Y.P.key === B.P.key
              ? [X.e, Y.e]
              : X.P.key === B.P.key && Y.P.key === A.P.key
                ? [Y.e, X.e]
                : [null, null];
          return !!la && !!lb && stepFrom(A.P, A.e!, la) && stepFrom(B.P, B.e!, lb);
        });
        if (!long) continue;
        out.set(id, {
          kind: 'drop',
          note: `not sewn — a vent: ${A.e.lenMm.toFixed(0)} = ${B.e.lenMm.toFixed(0)} mm below the ${A.P.key} ↔ ${B.P.key} seam, a notched step between; the seam ends at the step and the vent stays open`,
        });
      }
    }
    // A piece sewn along its centre to BOTH mirror halves (a placket strip between the two fronts,
    // each seam the fronts' full centre length): the front would be sewn shut — one of the two is
    // the opening. The weaker reading (by the matcher's score) is drawn as the closure (11.10
    // corpus: FW26-001's PLCK took FL and FR; the doll then tore a shoulder to make room).
    for (const Q of Gx.pieces) {
      // A strip (a placket): its mean width (2·area / perimeter) small — never a back whose two
      // side seams take the two fronts.
      if (Q.group !== 'BODY' || (2 * Math.abs(Q.geom.areaMm2)) / Q.geom.perimMm > 80) continue;
      const onQ = Gx.seams.filter((s) => {
        if (isConf(s.seam) || out.has(`${s.seam.a}~${s.seam.b}`)) return false;
        const qa = s.a.every((e) => pk(e) === Q.key);
        const qb = s.b.every((e) => pk(e) === Q.key);
        if (qa === qb) return false;
        const other = qa ? s.b : s.a;
        const X = gp.get(pk(other[0]));
        return (
          !!X &&
          X.group === 'BODY' &&
          other.every((e) => pk(e) === X.key) &&
          lenOf(s) > 300 &&
          (qa ? s.a : s.b).every(upright)
        );
      });
      const xOf = (s: GroupedSeam) =>
        gp.get(pk((s.a.every((e) => pk(e) === Q.key) ? s.b : s.a)[0]))!;
      for (let i = 0; i < onQ.length; i++)
        for (let j = i + 1; j < onQ.length; j++) {
          const X1 = xOf(onQ[i]);
          const X2 = xOf(onQ[j]);
          const halves =
            X1.geom.twinOf.some((t) => t.key === X2.key && t.kind === 'mirror') ||
            (handOf(X1.key) && handOf(X2.key) && handOf(X1.key) !== handOf(X2.key));
          if (!halves) continue;
          const weak =
            onQ[i].seam.score < onQ[j].seam.score ||
            (onQ[i].seam.score === onQ[j].seam.score &&
              `${onQ[i].seam.a}~${onQ[i].seam.b}` > `${onQ[j].seam.a}~${onQ[j].seam.b}`)
              ? onQ[i]
              : onQ[j];
          out.set(`${weak.seam.a}~${weak.seam.b}`, {
            kind: 'closure',
            note: `suspect — ${Q.key} is sewn along its centre to both ${X1.key} and ${X2.key} (${lenOf(weak).toFixed(0)} mm): the front would be sewn shut — this side is the front opening (a closure), drawn closed`,
          });
        }
    }
    // One front opening at most: the longest; any other long left/right seam across the body is
    // not sewn (side panels sewn to each other across the doll?).
    const cfs = [...out].filter(([, v]) => v.kind === 'closure');
    if (cfs.length > 1) {
      const lenId = (id: string) => {
        const s = Gx.seams.find((x) => `${x.seam.a}~${x.seam.b}` === id);
        return s ? lenOf(s) : 0;
      };
      cfs.sort((x, y) => lenId(y[0]) - lenId(x[0]));
      for (const [id] of cfs.slice(1))
        out.set(id, {
          kind: 'drop',
          note: `suspect — a second long left/right seam across the body (${lenId(id).toFixed(0)} mm) besides the centre back and the front opening: the two sides would be sewn to each other — not sewn`,
        });
    }
    return out;
  };
  // Every piece cut from the lining (a card whose only fabric line says «lining»): there is no
  // shell to solve without it — the lining pieces are drawn as the shell, and said so.
  const clothOf = (p: (typeof facts.pieces)[number]) =>
    p.cloth ?? (liningByName(p.name) ? 'lining' : null);
  const allLining =
    !opt.lining &&
    facts.pieces.some((p) => clothOf(p) === 'lining') &&
    facts.pieces.every((p) => clothOf(p) === 'lining' || clothOf(p) === 'interfacing');
  const lining = !!opt.lining || allLining;
  if (allLining)
    warnings.push(
      'every piece is cut from the lining fabric — no shell to solve without it: the lining pieces are drawn as the shell',
    );
  // The order's hardware (an elastic): listed, never a panel or a seam.
  const hardwareOf = new Map<string, string>();
  for (const h of opt.hardware ?? []) for (const k of h.pieces) hardwareOf.set(k, h.label);
  const G0 = groupPieces(inst.graph, facts, {
    lining,
    dropSeams: opt.dropSeams,
    hardware: hardwareOf,
    ...(owner ? { layers: layerRelations, owner: true } : {}),
  });
  const suspect0 = suspectsIn(G0);
  // NOT A GARMENT (bags, covers, flat accessories): the card names no garment and no piece reads as
  // a sleeve, cuff, collar, stand, leg or hem band. Read first from the names' grouping — the order
  // is then read the way a bag is sewn (every matching edge pair between two parts, strips round
  // corners), and the pieces are drawn assembled round a plain shape instead of a body. A belt or a
  // strap reads as a band, so a band alone does not make a garment.
  const GARMENT_GROUPS = new Set<DollGroupId>([
    'SLEEVE_L',
    'SLEEVE_R',
    'CUFF_L',
    'CUFF_R',
    'COLLAR',
    'STAND',
    'LEG_L',
    'LEG_R',
    'HEMBAND',
  ]);
  const bag =
    facts.category === 'generic' &&
    // positive evidence of an accessory: drawn in one size (a garment is graded)
    !!opt.oneSize &&
    G0.pieces.length > 0 &&
    !G0.pieces.some((p) => GARMENT_GROUPS.has(p.group));
  // Declared joins (the technologist's order) complete the graph where it has no seam.
  let graph = inst.graph;
  const notShell = new Set(
    facts.pieces
      .filter((p) => {
        const cloth = p.cloth ?? (liningByName(p.name) ? 'lining' : null);
        return cloth === 'interfacing' || (cloth === 'lining' && !lining);
      })
      .flatMap((p) => [p.pieceKey, p.name]),
  );
  // RINGS OF IDENTICAL PANELS and LIDS (rings.ts): an operation that lists three or more identical
  // pieces as parts sews them side to side into a ring; a lid's equal edges go onto the ring's free
  // tops; two rings meet base to base. The graph's pairings across two rings are refused. Their
  // panels are never stacked as plies.
  const ringNotSewn: NonNullable<DollReport['notSewn']> = [];
  const ringsR = declaredJoins?.length
    ? ringsFromJoins(graph, declaredJoins, notShell, (k) => {
        const g = graph.pieces.find((x) => x.pieceKey === k);
        return !!g && isSurfacePiece(g, graph);
      })
    : null;
  if (ringsR && (ringsR.added.length || ringsR.refused.length)) {
    const refused = new Set(ringsR.refused.map((x) => x.seam));
    graph = {
      ...graph,
      chosen: [...graph.chosen.filter((s) => !refused.has(s)), ...ringsR.added.map((x) => x.seam)],
    };
    for (const x of ringsR.refused) {
      ringNotSewn.push({
        id: `${x.seam.a}~${x.seam.b}`,
        a: edgeIdsOf(x.seam.a),
        b: edgeIdsOf(x.seam.b),
        note: x.note,
      });
      warnings.push(`${x.seam.a}~${x.seam.b}: ${x.note}`);
    }
  }
  // Units the order sews first (two yoke halves → one unit → onto the back leg): laid flat, their
  // joint edge sewn onto the next piece; leg seams run on across them (units.ts).
  const unitNotes = new Map<string, string>();
  /** Unit seams, listed with the order joins (they are the order's, sewn as graph seams). */
  const unitJoins: DollReport['orderJoins'] = [];
  const unitDropped: NonNullable<DollReport['notSewn']> = [];
  // (trousers only for now: a shirt's order is read by the free-loop proposals as before)
  const legsCat0 =
    facts.category === 'trousers' || facts.category === 'jumpsuit' || facts.category === 'bottom';
  if (legsCat0 && (declaredJoins?.length || hardwareOf.size)) {
    const skipK = unitSkipKeys(graph, facts, lining, hardwareOf);
    const u = orderUnits(graph, declaredJoins ?? [], skipK, hardwareOf);
    graph = u.graph;
    for (const x of u.added) {
      unitNotes.set(`${x.seam.a}~${x.seam.b}`, x.note);
      unitJoins.push({ join: x.join, seam: `${x.seam.a}~${x.seam.b}`, note: x.note });
    }
    unitDropped.push(...u.dropped);
    warnings.push(...u.words, ...u.dropped.map((x) => `${x.id}: ${x.note}`));
  }
  const orderNote = new Map<string, string>();
  const orderJoins: DollReport['orderJoins'] = [...unitJoins];
  const orderSurface: DollReport['orderSurface'] = [];
  for (const x of ringsR?.added ?? []) {
    orderNote.set(`${x.seam.a}~${x.seam.b}`, x.note);
    orderJoins.push({ join: x.join, seam: `${x.seam.a}~${x.seam.b}`, note: x.note });
  }
  // POCKET BAGS (joins.ts): two pocket pieces the order puts on different sides of one operation,
  // with equal edges, are sewn to each other round the bag — reported as a seam, drawn on the panel
  // they are sewn onto (surface pieces are not solved).
  const bagSeams = declaredJoins?.length ? pocketBagJoins(graph, declaredJoins, notShell) : [];
  for (const x of bagSeams) {
    orderJoins.push({ join: x.join, seam: `${x.seam.a}~${x.seam.b}`, note: x.note });
    warnings.push(x.note);
  }
  if (declaredJoins?.length) {
    const r = completeFromJoins(
      graph,
      declaredJoins,
      notShell,
      new Set([...suspect0].filter(([, v]) => v.kind === 'drop').map(([k]) => k)),
      facts.category === 'trousers' || facts.category === 'jumpsuit',
      { multi: bag, fixed: ringsR?.panels },
    );
    if (l4)
      r.added = r.added.filter((x) => {
        const no = isExcluded(x.seam.aParts ?? [x.seam.a], x.seam.bParts ?? [x.seam.b]);
        if (no)
          warnings.push(
            `technologist's order «${x.join}»: ${x.seam.a} ↔ ${x.seam.b} not proposed — a person rejected this pair`,
          );
        return !no;
      });
    // Graph seams the order's reading refuses (a strip sewn by both long edges to one piece, a ply
    // of a two-ply strip sewn elsewhere, a pairing on edges a notched strip fits round): said.
    const stripRefused = new Set(r.refused.map((x) => x.seam));
    for (const { seam: s, note } of r.refused) {
      ringNotSewn.push({ id: `${s.a}~${s.b}`, a: edgeIdsOf(s.a), b: edgeIdsOf(s.b), note });
      warnings.push(`${s.a}~${s.b}: ${note}`);
    }
    graph = {
      ...graph,
      chosen: [...graph.chosen.filter((s) => !stripRefused.has(s)), ...r.added.map((x) => x.seam)],
    };
    for (const x of r.added) {
      orderNote.set(`${x.seam.a}~${x.seam.b}`, x.note);
      orderJoins.push({ join: x.join, seam: `${x.seam.a}~${x.seam.b}`, note: x.note });
    }
    for (const l of r.left) warnings.push(`technologist's order — not found: ${l}`);
    if (opt.debug)
      warnings.push(
        `debug: order joins ${declaredJoins.length} · added ${r.added.map((x) => `${x.seam.a}~${x.seam.b}`).join(' ')} · by loops ${r.byLoops.map((x) => x.part.join('+')).join(' | ')} · ignored ${[...suspect0.keys()].join(' ')}`,
      );
    orderSurface.push(...r.surface);
    for (const x of r.surface)
      warnings.push(
        `technologist's order «${x.join}»: ${x.part.join('+')} is sewn onto a panel's face (a flap / welt / patch), not edge to edge — not drawn as a seam`,
      );
  }
  const G = groupPieces(graph, facts, {
    lining,
    dropSeams: opt.dropSeams,
    hardware: hardwareOf,
    panels: ringsR?.panels,
    ...(owner ? { layers: layerRelations, owner: true } : {}),
  });
  warnings.push(...G.warnings);
  // LEGS FROM THE DRAWING (trousers). A leg is the front and the back sewn by their inseam /
  // outseam, with whatever is sewn on top of them (a yoke unit, a pocket bag): the pieces joined by
  // seams that are not the crotch (left ↔ right panel) and not between mirror twins. Which leg is
  // the left one is read from the front's drawing — pieces lie face up, the left front seen from
  // the front has its crotch curve on its left — never from a name (SS26-011's «Back_Top_L_R» is a
  // left-yoke piece whose name ends in R).
  if (facts.category === 'trousers' || facts.category === 'jumpsuit') {
    const legsD = legPanels(G.pieces.map((P) => P.geom));
    const gp = new Map(G.pieces.map((P) => [P.key, P]));
    const legLike = (k: string) => {
      const g = gp.get(k)?.group;
      return g === 'LEG_L' || g === 'LEG_R' || g === 'BODY';
    };
    if (legsD.size >= 2) {
      const parent = new Map<string, string>();
      const find = (k: string): string => {
        if (!parent.has(k)) parent.set(k, k);
        let r = k;
        while (parent.get(r) !== r) r = parent.get(r)!;
        parent.set(k, r);
        return r;
      };
      const twins = (x: string, y: string) =>
        !!gp.get(x)?.geom.twinOf.some((t) => t.key === y && t.kind === 'mirror');
      // The crotch (rise to rise — running on up a yoke or not) joins the two legs: no link.
      const riseIds = new Set([...legsD.values()].map((L) => L.rise.id));
      for (const sm of G.seams) {
        // One run along a side, over a leg panel and pieces with no leg panel of their own (a yoke
        // carrying the centre back on up, a waist run over the yoke), puts them in that leg — when
        // every leg panel on the run is of one leg (a waist run round both legs says nothing).
        for (const ids of [sm.a, sm.b]) {
          const ks = [...new Set(ids.map(pk))].filter(legLike);
          const Ls = ks.filter((k) => legsD.has(k));
          if (ks.length < 2 || !Ls.length || Ls.length === ks.length) continue;
          if (Ls.some((k) => k !== Ls[0] && !sameLeg(legsD.get(k)!, legsD.get(Ls[0])!))) continue;
          for (const k of ks) if (!legsD.has(k)) parent.set(find(k), find(Ls[0]));
        }
        if (sm.a.some((id) => riseIds.has(id)) && sm.b.some((id) => riseIds.has(id))) continue;
        const ka = [...new Set(sm.a.map(pk))].filter(legLike);
        const kb = [...new Set(sm.b.map(pk))].filter(legLike);
        for (const x of ka)
          for (const y of kb) {
            if (x === y || twins(x, y)) continue;
            const Lx = legsD.get(x);
            const Ly = legsD.get(y);
            if (Lx && Ly && !sameLeg(Lx, Ly)) continue;
            parent.set(find(x), find(y));
          }
      }
      const comps = new Map<string, string[]>();
      for (const P of G.pieces)
        if (legLike(P.key) && parent.has(P.key))
          comps.set(find(P.key), [...(comps.get(find(P.key)) ?? []), P.key]);
      const sideOf = (keys: string[]): DollGroupId | null => {
        const Ls = keys.map((k) => legsD.get(k)).filter((x): x is NonNullable<typeof x> => !!x);
        const front = Ls.find((L) => L.part === 'front');
        const back = Ls.find((L) => L.part === 'back');
        if (front) return front.crotchSide < 0 ? 'LEG_L' : 'LEG_R';
        if (back) return back.crotchSide > 0 ? 'LEG_L' : 'LEG_R';
        return null;
      };
      const legsOf = [...comps.values()]
        .filter((ks) => ks.some((k) => legsD.has(k)))
        .map((ks) => ({ ks, side: sideOf(ks) }));
      const sides = legsOf.map((x) => x.side);
      if (legsOf.length === 2 && sides[0] && sides[1] && sides[0] !== sides[1]) {
        for (const { ks, side } of legsOf)
          for (const k of ks) {
            const P = gp.get(k)!;
            if (P.group === side) continue;
            const was = P.group;
            P.group = side!;
            const hand = P.geom.hand;
            if (hand && (hand === 'L') !== (side === 'LEG_L'))
              warnings.push(
                `${P.geom.name}: its name reads ${hand === 'L' ? 'left' : 'right'}, its seams sew it into the ${side === 'LEG_L' ? 'left' : 'right'} leg (read from the drawing) — placed there`,
              );
            else if (was === 'BODY')
              warnings.push(
                `${P.geom.name}: sewn into the ${side === 'LEG_L' ? 'left' : 'right'} leg (read from the drawing)`,
              );
          }
      }
    }
  }
  // NOT A GARMENT (see `bag` above): the pieces are drawn ASSEMBLED by their seams round a plain
  // shape the cloth's area fills (an ellipsoid — no torso, no tubes), and the report says so in
  // words (never a «closing the seams…» that does not end, never a tote torn open round a torso).
  // Pieces no seam reaches are laid out flat beside it. Every drawn piece is a body panel for the
  // solver; the body's own readings (torso, loops for tubes) are skipped.
  const notGarment = bag
    ? `the paper doll cannot wrap this item round a body — the card names no garment and no piece reads as a sleeve, collar, cuff or leg: its ${G.pieces.length} ${G.pieces.length === 1 ? 'piece is' : 'pieces are'} drawn assembled by ${G.seams.length === 1 ? 'the one seam' : `the ${G.seams.length} seams`} between them (the graph's and the order's) round a plain shape, no body inside`
    : undefined;
  if (bag) for (const p of G.pieces) p.group = 'BODY';

  // WAISTBAND HALVES (11.10 corpus: SS26-011's WST_L / WST_R, 80 mm apart, floated). Two halves
  // of one band — mirror twins, or a left and a right strip — no seam joins: they are sewn at the
  // centre back, end to end, into ONE ring over the waist. Which ends: those from which the notches
  // of their long edges stand at the same distance (the side / yoke marks); the longer half's extra
  // length is the fly extension at the centre front — overlapped, not sewn (cut off the ring's
  // run below). Proposed by the doll, said in words.
  const dollNote = new Map<string, string>();
  const bandExt: { key: string; mm: number } | null = (() => {
    if (owner) return null;
    const band = G.pieces.filter((P) => P.group === 'WAISTBAND');
    if (band.length !== 2) return null;
    const [A, B] = band;
    if (
      G.seams.some(
        (sm) =>
          [...sm.a, ...sm.b].some((id) => pk(id) === A.key) &&
          [...sm.a, ...sm.b].some((id) => pk(id) === B.key),
      )
    )
      return null;
    const halves =
      A.geom.twinOf.some((t) => t.key === B.key && t.kind === 'mirror') ||
      (!!A.geom.hand && !!B.geom.hand && A.geom.hand !== B.geom.hand);
    if (!halves) return null;
    /** A strip's two short ends (the edges at its long axis' extremes) and its long edges. */
    const ends = (P: GroupedPiece) => {
      const xs = P.geom.rs.map((q) => q[0]);
      const ys = P.geom.rs.map((q) => q[1]);
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      const ax = w >= h ? 0 : 1;
      const lo = Math.min(...(ax ? ys : xs));
      const hi = Math.max(...(ax ? ys : xs));
      const span = hi - lo;
      const mid = (e: Edge) => e.pts.reduce((t, q) => t + q[ax], 0) / e.pts.length;
      const short = P.geom.edges.filter((e) => e.lenMm < 0.3 * span);
      const loE = short.filter((e) => mid(e) < lo + 0.15 * span);
      const hiE = short.filter((e) => mid(e) > hi - 0.15 * span);
      if (loE.length !== 1 || hiE.length !== 1) return null;
      const long = P.geom.edges.filter((e) => e.lenMm >= 0.6 * span);
      // Notches of the long edges, as distances from each end.
      const from = (end: Edge) =>
        long.flatMap((e) => {
          const s0 = e.pts[0];
          const near = Math.min(...end.pts.map((q) => Math.hypot(q[0] - s0[0], q[1] - s0[1]))) < 5;
          return e.notchesMm.map((d) => (near ? d : e.lenMm - d));
        });
      return {
        ends: [
          { e: loE[0], notches: from(loE[0]) },
          { e: hiE[0], notches: from(hiE[0]) },
        ],
        len: Math.max(0, ...long.map((e) => e.lenMm)),
      };
    };
    const ea = ends(A);
    const eb = ends(B);
    if (!ea || !eb) return null;
    let best: { x: (typeof ea.ends)[number]; y: (typeof eb.ends)[number]; why: string } | null =
      null;
    let bestErr = Infinity;
    for (const x of ea.ends)
      for (const y of eb.ends) {
        if (!x.notches.length || !y.notches.length) continue;
        const err = Math.min(...x.notches.flatMap((d) => y.notches.map((q) => Math.abs(d - q))));
        if (err < bestErr) {
          bestErr = err;
          best = {
            x,
            y,
            why: `their notches stand ${Math.round(Math.min(...x.notches))} mm from those ends on both halves`,
          };
        }
      }
    if (!best || bestErr > 5) {
      // No notch to read: the ends of matching length; the far ends then are the front.
      const pairs = ea.ends.flatMap((x) => eb.ends.map((y) => ({ x, y })));
      pairs.sort(
        (p, q) => Math.abs(p.x.e.lenMm - p.y.e.lenMm) - Math.abs(q.x.e.lenMm - q.y.e.lenMm),
      );
      best = { ...pairs[0], why: 'no notch tells — the ends of matching length' };
    }
    const ext = Math.abs(ea.len - eb.len);
    const longer = ea.len >= eb.len ? A : B;
    const id = `${best.x.e.id}~${best.y.e.id}`;
    const note = `proposed by the doll · waistband: ${A.geom.name} + ${B.geom.name} joined end to end at the centre back (${best.why}) — one ring over the waist${ext >= 10 ? ` · ${longer.geom.name} is ${Math.round(ext)} mm longer: the fly extension at the centre front, overlapped, not sewn` : ''} · not in the pattern`;
    const seam: SeamCandidate = {
      a: best.x.e.id,
      b: best.y.e.id,
      score: 0.7,
      kind: 'edge',
      evidence: {
        dLenMm: Math.abs(best.x.e.lenMm - best.y.e.lenMm),
        relLen: 0,
        notchScore: null,
        curvature: 'flat',
        hand: 'cross',
        twin: 'mirror',
        self: false,
        rule: note,
        aLenMm: best.x.e.lenMm,
        bLenMm: best.y.e.lenMm,
      },
    };
    G.seams.push({ seam, a: [best.x.e.id], b: [best.y.e.id] });
    dollNote.set(id, note);
    warnings.push(note);
    return ext >= 10 ? { key: longer.key, mm: ext } : null;
  })();
  const suspectNote = new Map<string, string>();
  const suspects: { s: GroupedSeam; note: string }[] = [];
  {
    const sus = suspectsIn(G);
    const keep: GroupedSeam[] = [];
    for (const s of G.seams) {
      const id = `${s.seam.a}~${s.seam.b}`;
      const v = sus.get(id);
      if (!v || orderNote.has(id)) {
        keep.push(s);
        continue;
      }
      warnings.push(`${id}: ${v.note}`);
      if (v.kind === 'closure') {
        suspectNote.set(id, v.note);
        G.closures.push(s);
      } else suspects.push({ s, note: v.note });
    }
    G.seams.splice(0, G.seams.length, ...keep);
  }

  // L4 — groups by CONFIRMED seams, not by names, where they disagree.
  if (l4) {
    const gp = new Map(G.pieces.map((p) => [p.key, p]));
    const confSeams = G.seams.filter((s) => isConf(s.seam));
    // The waistband by EDGE ROLE: a long strip whose long edge a confirmed seam sews onto two or
    // more pieces of the body / legs (the top path), whatever its name says.
    const bodyish = new Set<DollGroupId>(['BODY', 'LEG_L', 'LEG_R']);
    const legsCat =
      facts.category === 'trousers' ||
      facts.category === 'jumpsuit' ||
      facts.category === 'skirt' ||
      facts.category === 'bottom';
    for (const P of G.pieces) {
      if (P.group === 'WAISTBAND' || !legsCat) continue;
      // A strip: mean width (2·area / perimeter) small against its length (half the perimeter).
      const long = P.geom.perimMm / 2;
      const short = (2 * Math.abs(P.geom.areaMm2)) / Math.max(1, P.geom.perimMm);
      if (long < 250 || short > 0.15 * long) continue;
      const onTop = confSeams.some((s) => {
        const A = s.a.map(pk);
        const B = s.b.map(pk);
        const other = A.every((k) => k === P.key) ? B : B.every((k) => k === P.key) ? A : null;
        if (!other) return false;
        const ks = new Set(other.filter((k) => bodyish.has(gp.get(k)?.group as DollGroupId)));
        return ks.size >= 2;
      });
      if (!onTop) continue;
      warnings.push(
        `${P.key}: a strip ${long.toFixed(0)} × ${short.toFixed(0)} mm whose long edge a confirmed seam sews onto the top of the legs — drawn as the waistband ring (by its edge, not its name)`,
      );
      P.group = 'WAISTBAND';
    }
    // A leg piece whose name says one hand but whose confirmed seams sew it into the other leg
    // (a back yoke named «…_R» sewn to the left back): the seams win. A vote counts a seam whose
    // other side is ONE leg piece (an inseam, an outseam, a yoke seam); seams onto several pieces
    // (the waistband, a rise through the yoke) say nothing about the hand. Two rounds.
    for (let round = 0; round < 2; round++)
      for (const P of G.pieces) {
        // A handless back / yoke piece of trousers lands in BODY by its name: its seams say which leg.
        const handless = legsCat && P.group === 'BODY';
        if (P.group !== 'LEG_L' && P.group !== 'LEG_R' && !handless) continue;
        const votes: Record<string, number> = { LEG_L: 0, LEG_R: 0, BODY: 0 };
        for (const s of confSeams) {
          const A = [...new Set(s.a.map(pk))];
          const B = [...new Set(s.b.map(pk))];
          const other = A.includes(P.key) ? B : B.includes(P.key) ? A : null;
          if (!other || other.length !== 1 || other[0] === P.key) continue;
          const g = gp.get(other[0])?.group;
          if (g !== 'LEG_L' && g !== 'LEG_R') continue;
          votes[g] += Math.max(s.seam.evidence.aLenMm ?? 0, s.seam.evidence.bLenMm ?? 0, 50);
        }
        if (handless) {
          const best = votes.LEG_L >= votes.LEG_R ? 'LEG_L' : 'LEG_R';
          if (votes[best] > 0 && votes[best] > 1.5 * Math.min(votes.LEG_L, votes.LEG_R)) {
            warnings.push(
              `${P.key}: no hand in its name — its confirmed seams sew it into the ${best === 'LEG_L' ? 'left' : 'right'} leg`,
            );
            P.group = best;
          }
          continue;
        }
        const cur = P.group as 'LEG_L' | 'LEG_R';
        const alt = cur === 'LEG_L' ? 'LEG_R' : 'LEG_L';
        if (votes[alt] > 1.5 * votes[cur] && votes[alt] > 0) {
          warnings.push(
            `${P.key}: its name reads ${cur === 'LEG_L' ? 'left' : 'right'}, its confirmed seams sew it into the ${alt === 'LEG_L' ? 'left' : 'right'} leg — placed there`,
          );
          P.group = alt;
        }
      }
  }

  // L4: confirmed rows that cannot be what they say, before solving (lengths, an edge sewn twice).
  const preContradictions: string[] = [];
  if (l4) {
    const lenOfEdge = new Map<string, number>();
    for (const P of G.pieces) for (const e of P.geom.edges) lenOfEdge.set(e.id, e.lenMm);
    const sideLen = (g: GroupedSeam, side: 'a' | 'b') => {
      const gapped = gapStretchesOf(g, side);
      if (gapped)
        return gapped.reduce(
          (t, { id, range }) => t + (range ? range[1] - range[0] : lenOfEdge.get(id) ?? 0),
          0,
        );
      const ids = side === 'a' ? g.a : g.b;
      const pr = g.seam.partRange ?? {};
      const rg = g.seam.range && ids.length === 1 ? g.seam.range[side] : null;
      if (rg) return rg[1] - rg[0];
      return ids.reduce((t, id) => {
        const r = pr[id];
        return t + (r ? r[1] - r[0] : lenOfEdge.get(id) ?? 0);
      }, 0);
    };
    const usedBy = new Map<string, string[]>();
    for (const g of [...G.seams, ...G.closures]) {
      if (!isConf(g.seam)) continue;
      const id = `${g.seam.a}~${g.seam.b}`;
      const la = sideLen(g, 'a');
      const lb = sideLen(g, 'b');
      const diff = 1 - Math.min(la, lb) / Math.max(la, lb, 1e-9);
      if (diff > 0.35)
        preContradictions.push(
          `${id}: confirmed by a person, but its sides are ${la.toFixed(0)} and ${lb.toFixed(0)} mm — ${(diff * 100).toFixed(0)} % apart, more than any ease: not one seam`,
        );
      // The stretch of each edge this seam takes (mm): partial ranges and composite part ranges.
      const span = (e: string, side: 'a' | 'b'): [number, number] => {
        const ids = side === 'a' ? g.a : g.b;
        const r =
          g.seam.partRange?.[e] ?? (g.seam.range && ids.length === 1 ? g.seam.range[side] : null);
        return r ?? [0, lenOfEdge.get(e) ?? 0];
      };
      for (const side of ['a', 'b'] as const) {
        const gapped = gapStretchesOf(g, side);
        if (gapped)
          for (const { id: e, range } of gapped)
            usedBy.set(e, [
              ...(usedBy.get(e) ?? []),
              `${id}|${(range ?? [0, lenOfEdge.get(e) ?? 0]).join(',')}`,
            ]);
        else
          for (const e of side === 'a' ? g.a : g.b)
            usedBy.set(e, [...(usedBy.get(e) ?? []), `${id}|${span(e, side).join(',')}`]);
      }
    }
    const ringish = new Set<DollGroupId>(['COLLAR', 'STAND']);
    const groupOfKey = new Map(G.pieces.map((P) => [P.key, P.group]));
    for (const [e, list] of usedBy) {
      // Collar plies / stacked collars sandwich one edge between two layers: not a contradiction.
      if (ringish.has(groupOfKey.get(pk(e)) as DollGroupId)) continue;
      const items = list.map((x) => {
        const [id, r] = x.split('|');
        const [r0, r1] = r.split(',').map(Number);
        return { id, r0, r1 };
      });
      const clash = new Set<string>();
      for (let i = 0; i < items.length; i++)
        for (let j = i + 1; j < items.length; j++) {
          const A = items[i];
          const B = items[j];
          if (A.id === B.id) continue;
          // Two seams on one edge are fine when they take different stretches of it.
          if (Math.min(A.r1, B.r1) - Math.max(A.r0, B.r0) > 5) clash.add(A.id).add(B.id);
        }
      if (clash.size)
        preContradictions.push(
          `${e} is sewn by ${clash.size} confirmed seams over the same stretch (${[...clash].join(', ')}) — an edge takes one seam`,
        );
    }
    for (const w of preContradictions) warnings.push(`contradiction: ${w}`);
  }

  // ── meshes ───────────────────────────────────────────────────────────────────────────────
  const area = G.pieces.reduce((s, p) => s + Math.abs(p.geom.areaMm2), 0);
  const h =
    opt.gridMm ??
    Math.min(
      40,
      Math.max(9, Math.sqrt((2 * area) / (Math.sqrt(3) * (opt.targetVertices ?? 2200)))),
    );
  const gridH = h;
  const panels: Panel[] = [];
  let N = 0;
  // Folds (options.folds), per piece key (a second instance `key@n` takes its piece's folds).
  const foldsIn = opt.folds ?? {};
  warnings.push(...(opt.hemWords ?? []));
  const grainFold = Object.values(foldsIn).some((list) => list?.length)
    ? grainDegOf(input.facts)
    : null;
  const foldsOf = (key: string): DollFold[] => {
    const at = key.lastIndexOf('@');
    const list = foldsIn[key] ?? (at > 0 ? foldsIn[key.slice(0, at)] : undefined) ?? [];
    return [...list].sort((x, y) => x.seq - y.seq);
  };
  const foldReports: DollFoldReport[] = [];
  /** Folded pieces: the polygons of their plies, for the chart's overlap test. */
  const footprints = new Map<string, Pt2[][]>();
  /** Pleat rows of a piece as lines as cut, mm: the mesh leaves them flat, the neck reads them. */
  const neckPleatLines = new Map<string, NeckRows['pleatLines']>();
  for (const p of G.pieces) {
    const g = p.geom;
    const keep = [...g.edges.flatMap((e) => [e.s, e.e]), ...g.notchIdx, ...g.corners];
    const folds = grainFold ? foldsOf(p.key) : [];
    const frame = folds.length ? frameOf(g, grainFold!.get(g.pieceKey) ?? 0) : null;
    const mesh = frame
      ? meshPiece(g.rs, keep, h, foldCreases(g.rs, frame, folds))
      : meshPiece(g.rs, keep, h);
    const fold = frame ? foldPanel(g, mesh, folds, frame, h, warnings, foldReports) : undefined;
    if (fold) footprints.set(p.key, fold.plies);
    if (frame)
      neckPleatLines.set(
        p.key,
        folds
          .filter((f) => f.kind !== 'inward' && f.kind !== 'outward')
          .map((f) => ({
            a: fromUV(frame, f.a),
            b: fromUV(frame, f.b),
            kind: f.kind,
            flipAt: fromUV(frame, f.flipAt),
          })),
      );
    const ringPos = new Map<number, number>();
    mesh.bRs.forEach((r, i) => ringPos.set(r, i));
    panels.push({
      ...p,
      ...(fold ? { geom: fold.geom, fold } : {}),
      idx: panels.length,
      mesh,
      offset: N,
      count: mesh.pts.length,
      nb: mesh.bRs.length,
      ringPos,
      mirrored: false,
    });
    N += mesh.pts.length;
  }
  const msMesh = now() - t0;
  opt.onMesh?.({
    vertices: N,
    panels: panels.map((P) => ({
      pieceKey: P.key,
      group: P.group,
      offset: P.offset,
      count: P.count,
      tris: Uint32Array.from(P.mesh.tris),
    })),
  });
  const pos = new Float64Array(3 * N);
  const uv = new Float64Array(2 * N);
  const cuv = new Float64Array(2 * N); // chart coords
  const panelOf = new Int32Array(N).fill(-1);
  const ringOf = new Int32Array(N).fill(-1);
  const groupOfV: DollGroupId[] = new Array(N);
  for (const P of panels) {
    for (let i = 0; i < P.count; i++) {
      const v = P.offset + i;
      uv[2 * v] = P.mesh.pts[i][0];
      uv[2 * v + 1] = P.mesh.pts[i][1];
      panelOf[v] = P.idx;
      ringOf[v] = i < P.nb ? i : -1;
      groupOfV[v] = P.group;
    }
  }
  const panelByKey = new Map(panels.map((P) => [P.key, P]));
  const edgeById = new Map<string, Edge>();
  for (const P of panels) for (const e of P.geom.edges) edgeById.set(e.id, e);

  /** Boundary path of a run of edges (chains / composite parts concatenated). */
  const pathOf = (ids: EdgeId[]): Path | null => {
    const v: number[] = [];
    const s: number[] = [];
    for (const id0 of ids)
      for (const id of edgeIdsOf(id0)) {
        const P = panelByKey.get(pk(id));
        const e = edgeById.get(id);
        if (!P || !e) return null;
        const n = P.geom.rs.length;
        const ps = P.ringPos.get(((e.s % n) + n) % n);
        const pe = P.ringPos.get(((e.e % n) + n) % n);
        if (ps === undefined || pe === undefined) return null;
        let q = ps;
        for (let guard = 0; guard <= P.nb; guard++) {
          const gv = P.offset + q;
          if (v.length && v[v.length - 1] === gv) {
            // shared vertex of a chain
          } else {
            const prev = v.length ? v[v.length - 1] : -1;
            const d =
              prev >= 0 && panelOf[prev] === P.idx
                ? Math.hypot(uv[2 * gv] - uv[2 * prev], uv[2 * gv + 1] - uv[2 * prev + 1])
                : 0;
            v.push(gv);
            s.push((s.length ? s[s.length - 1] : 0) + d);
          }
          if (q === pe) break;
          q = (q + 1) % P.nb;
        }
      }
    if (v.length < 2) return null;
    return { v: Int32Array.from(v), s: Float64Array.from(s), len: s[s.length - 1] };
  };

  /** A path cut to the stretch [r0, r1] mm of its rest arc (a part sewn over part of its edge). */
  const cropPath = (P: Path, r: [number, number]): Path => {
    const keep: number[] = [];
    for (let k = 0; k < P.v.length; k++) if (P.s[k] >= r[0] - 1 && P.s[k] <= r[1] + 1) keep.push(k);
    if (keep.length < 2) {
      let k0 = 0;
      for (let k = 0; k < P.v.length; k++)
        if (Math.abs(P.s[k] - (r[0] + r[1]) / 2) < Math.abs(P.s[k0] - (r[0] + r[1]) / 2)) k0 = k;
      keep.splice(0, keep.length, Math.max(0, k0 - 1), Math.min(P.v.length - 1, Math.max(1, k0)));
    }
    const s0 = P.s[keep[0]];
    return {
      v: Int32Array.from(keep.map((k) => P.v[k])),
      s: Float64Array.from(keep.map((k) => P.s[k] - s0)),
      len: P.s[keep[keep.length - 1]] - s0,
    };
  };
  /** A path's vertices over the share `r` (0..1) of its length it is sewn over. */
  const sewnStretch = (P: Path, r?: [number, number]) =>
    r && (r[0] > 1e-3 || r[1] < 1 - 1e-3) ? cropPath(P, [r[0] * P.len, r[1] * P.len]).v : P.v;
  const revPath = (P: Path): Path => ({
    v: Int32Array.from([...P.v].reverse()),
    s: Float64Array.from([...P.s].reverse().map((x) => P.len - x)),
    len: P.len,
  });
  /** Pieces laid on a panel's face after the solve (pockets, a fly's flap): never in the mesh. */
  const laidKeys = new Set(G.skipped.filter((x) => x.surface).map((x) => x.pieceKey));
  const restLenOf = new Map(
    graph.pieces.flatMap((p) => p.edges.map((e) => [e.id, e.lenMm] as const)),
  );
  /**
   * A side's stretches in walk order, and the ones the solve can sew: a row whose walk starts or
   * ends on a piece laid on a panel (a waist run ending on the fly's flap, an armhole run starting
   * on a pocket) is sewn over its drawn parts; `share` is the part of the side's rest length they
   * take (null when the whole side is drawn). A laid piece inside the walk, or a part on a piece
   * neither drawn nor laid, leaves the side unsewable (null).
   */
  const laidEndsOf = (g: GroupedSeam, side: 'a' | 'b') => {
    const ids = side === 'a' ? g.a : g.b;
    const orig = (
      side === 'a' ? g.seam.aParts ?? edgeIdsOf(g.seam.a) : g.seam.bParts ?? edgeIdsOf(g.seam.b)
    ).flatMap((x) => edgeIdsOf(x));
    const pr = g.seam.partRange ?? {};
    const all =
      gapStretchesOf(g, side) ??
      ids.map((id, i) => ({ id, range: pr[orig[i]] ?? pr[id], reversed: undefined }));
    const drawnAt = all.map(({ id }) => panelByKey.has(pk(id)));
    const first = drawnAt.indexOf(true);
    const last = drawnAt.lastIndexOf(true);
    if (first < 0) return null;
    if (drawnAt.every(Boolean))
      return { drawn: all, share: null as [number, number] | null };
    for (let i = 0; i < all.length; i++)
      if (!drawnAt[i] && (i > first && i < last ? true : !laidKeys.has(pk(all[i].id)))) return null;
    const len = all.map(({ id, range }) => (range ? range[1] - range[0] : restLenOf.get(id) ?? 0));
    const total = len.reduce((x, y) => x + y, 0);
    if (total <= 0) return null;
    const before = len.slice(0, first).reduce((x, y) => x + y, 0);
    const through = len.slice(0, last + 1).reduce((x, y) => x + y, 0);
    return {
      drawn: all.slice(first, last + 1),
      share: [before / total, through / total] as [number, number],
    };
  };
  /**
   * L4: a CONFIRMED side as one path — its parts in the stored walk order, each oriented to meet the
   * previous one where they lie now (parts on different pieces meet through other seams), each cut
   * to its sewn stretch when the row says so. One-piece contiguous sides keep `pathOf`.
   */
  const sidePath = (g: GroupedSeam, side: 'a' | 'b'): Path | null => {
    const ids = side === 'a' ? g.a : g.b;
    const pr = g.seam.partRange ?? {};
    const gapped = gapStretchesOf(g, side);
    const multi = !!gapped || new Set(ids.map(pk)).size > 1 || Object.keys(pr).length > 0;
    if (!multi) return pathOf(ids);
    const parts: Path[] = [];
    const ends = laidEndsOf(g, side);
    if (ends === null) return null;
    const stretches = ends.drawn;
    for (const { id, range } of stretches) {
      const P = pathOf([id]);
      if (!P) return null;
      parts.push(range ? cropPath(P, range) : P);
    }
    const d3 = (a: number, b: number) =>
      Math.hypot(
        pos[3 * a] - pos[3 * b],
        pos[3 * a + 1] - pos[3 * b + 1],
        pos[3 * a + 2] - pos[3 * b + 2],
      );
    const first = (P: Path) => P.v[0];
    const last = (P: Path) => P.v[P.v.length - 1];
    // Each part's direction: the one set of directions whose consecutive parts meet best where
    // they lie now (the sum of the joins), ties to the stored walk. Greedy, part by part, fails on
    // an armhole: the bottom of the back armhole can lie nearer the front princess point than the
    // shoulder does before the body is closed.
    const n = parts.length;
    let bestMask = 0;
    if (n <= 12) {
      let bestCost = Infinity;
      let bestRev = Infinity;
      for (let mask = 0; mask < 1 << n; mask++) {
        // Stretches of one edge go the way the edge runs between them: nothing to choose there.
        if (
          stretches.some(
            ({ reversed }, i) => reversed !== undefined && !!((mask >> i) & 1) !== reversed,
          )
        )
          continue;
        let cost = 0;
        let rev = 0;
        for (let i = 0; i < n; i++) {
          const r = (mask >> i) & 1;
          rev += r;
          if (i === 0) continue;
          const rp = (mask >> (i - 1)) & 1;
          const endPrev = rp ? first(parts[i - 1]) : last(parts[i - 1]);
          const startCur = r ? last(parts[i]) : first(parts[i]);
          cost += d3(endPrev, startCur);
        }
        if (cost < bestCost - 2 || (Math.abs(cost - bestCost) <= 2 && rev < bestRev))
          [bestCost, bestRev, bestMask] = [cost, rev, mask];
      }
    }
    const out: Path[] = parts.map((P, i) => ((bestMask >> i) & 1 ? revPath(P) : P));
    const v: number[] = [];
    const sv: number[] = [];
    let base = 0;
    for (const P of out) {
      for (let k = 0; k < P.v.length; k++) {
        if (k === 0 && v.length && v[v.length - 1] === P.v[0]) continue;
        v.push(P.v[k]);
        sv.push(base + P.s[k]);
      }
      base += P.len;
    }
    return { v: Int32Array.from(v), s: Float64Array.from(sv), len: base };
  };
  /**
   * A seam's side AS SEWN — the one path every reading of a seam goes by (12.10 review: the
   * sleeve's azimuth, the far-apart check and the solve each walked a side their own way). A side
   * whose stretches are known (a stored row, or the engine's partRange) has its parts walked in
   * order and cut to them (sidePath); a side the doll itself proposed from free loops is already
   * in walk order and keeps its ids' own run (re-walking it by where its parts lie now turned
   * card 9's underarms and card 16's placket). A one-piece side the row sews over a range is cut
   * to that range too; `crop = false` keeps the whole edges with the range left to the constraint
   * (the solve wants the whole side under its fractions).
   */
  const sewnSide = (g: GroupedSeam, side: 'a' | 'b', crop = true): Path | null => {
    const P =
      isConf(g.seam) || g.seam.partRange ? sidePath(g, side) : pathOf(side === 'a' ? g.a : g.b);
    if (!P || !crop) return P;
    const rg = g.seam.range;
    if (!rg || g.a.length !== 1 || g.b.length !== 1) return P;
    const r = side === 'a' ? rg.a : rg.b;
    return r && r[1] - r[0] > 1 && r[1] - r[0] < P.len - 1 ? cropPath(P, r) : P;
  };

  // ── charts ───────────────────────────────────────────────────────────────────────────────
  const groups = new Map<DollGroupId, Panel[]>();
  for (const P of panels) {
    if (!groups.has(P.group)) groups.set(P.group, []);
    groups.get(P.group)!.push(P);
  }
  const charts = new Map<DollGroupId, Chart>();
  const chartSeamOf = (s: GroupedSeam): ChartSeam | null => {
    // A side sewn with a gap has no whole edge to lay: its stretches are laid below, one by one.
    if (s.seam.walk) return null;
    const a = s.a.map((id) => edgeById.get(id)).filter((e): e is Edge => !!e);
    const b = s.b.map((id) => edgeById.get(id)).filter((e): e is Edge => !!e);
    if (!a.length || !b.length || a.length !== s.a.length || b.length !== s.b.length) return null;
    if (new Set(a.map((e) => e.pieceKey)).size > 1 || new Set(b.map((e) => e.pieceKey)).size > 1)
      return null;
    return { id: `${s.seam.a}~${s.seam.b}`, a, b, partial: s.seam.kind === 'partial' };
  };
  for (const [gid, list] of groups) {
    const keys = new Set(list.map((P) => P.key));
    const cs = G.seams
      .filter((s) => keys.has(pk(s.a[0])) && keys.has(pk(s.b[0])))
      .map(chartSeamOf)
      .filter((x): x is ChartSeam => !!x);
    // L4: a confirmed composite (one edge ↔ parts on two or more pieces of this group) lays each
    // part along its stretch of the single edge. Which end of the edge the stored walk starts at is
    // not in the row: each composite is laid both ways and keeps the one whose parts land on their
    // stretches in the chart (one fixed way twisted card6's placket or opened card11's left leg).
    // The same for a composite the order's units gave a leg (units.ts: the yoke's joint edge onto
    // the back leg, the back's outseam running on up the yoke): its parts are in boundary order
    // with the run's start on the single edge's END (face up) — laid against the edge.
    const comps: { parts: ChartSeam[]; flip: ChartSeam[]; fixed: boolean | null }[] = [];
    const unitLeg = (g: GroupedSeam) =>
      (gid === 'LEG_L' || gid === 'LEG_R') && unitNotes.has(`${g.seam.a}~${g.seam.b}`);
    if (l4 || unitNotes.size)
      for (const g of G.seams) {
        if (!(l4 && isConf(g.seam)) && !unitLeg(g)) continue;
        for (const [one, many, oneIsA] of [
          [g.a, g.b, true],
          [g.b, g.a, false],
        ] as const) {
          const gapped = gapStretchesOf(g, oneIsA ? 'b' : 'a');
          if (one.length !== 1 || gapStretchesOf(g, oneIsA ? 'a' : 'b')) continue;
          if (gapped ? gapped.length < 2 : new Set(many.map(pk)).size < 2) continue;
          if (![...one, ...many].every((id) => keys.has(pk(id)))) continue;
          const e1 = edgeById.get(one[0]);
          const pr = g.seam.partRange ?? {};
          const stretches = gapped ?? many.map((id) => ({ id, range: pr[id] }));
          const parts = stretches.map(({ id }) => edgeById.get(id));
          if (!e1 || parts.some((e) => !e)) continue;
          const lens = stretches.map(({ range: r }, i) => (r ? r[1] - r[0] : parts[i]!.lenMm));
          const L = lens.reduce((t, x) => t + x, 0) || 1;
          const mk = (against: boolean) => {
            let c = 0;
            return stretches.map(({ range: r }, i): ChartSeam => {
              const e = parts[i]!;
              const f0 = against ? 1 - (c + lens[i]) / L : c / L;
              const f1 = against ? 1 - c / L : (c + lens[i]) / L;
              c += lens[i];
              const own: [number, number] = r ? [r[0] / e.lenMm, r[1] / e.lenMm] : [0, 1];
              return {
                id: `${g.seam.a}~${g.seam.b}@${i}`,
                a: oneIsA ? [e1] : [e],
                b: oneIsA ? [e] : [e1],
                partial: true,
                ranges: oneIsA ? { a: [f0, f1], b: own } : { a: own, b: [f0, f1] },
              };
            });
          };
          // Pieces lie upright in the chart, so height says which part comes first along a
          // vertical edge: the first part sits above the second when the seam joining their pieces
          // lies below it on its own piece. Along a level edge the chart's fit decides.
          let fixed: boolean | null = unitLeg(g) ? true : null;
          const k0 = pk(many[0]);
          const k1 = pk(many[1] ?? many[0]);
          const joins = (sm: { a: readonly string[]; b: readonly string[] }) =>
            (sm.a.some((id) => pk(id) === k0) && sm.b.some((id) => pk(id) === k1)) ||
            (sm.a.some((id) => pk(id) === k1) && sm.b.some((id) => pk(id) === k0));
          const join =
            G.seams.find(joins) ??
            joinsNotSewn
              .map((c) => ({ a: c.aParts ?? edgeIdsOf(c.a), b: c.bParts ?? edgeIdsOf(c.b) }))
              .find(joins);
          const my = (pts: readonly Pt2[]) =>
            pts.reduce((t, q) => t + q[1], 0) / Math.max(1, pts.length);
          if (join && fixed === null && !gapped) {
            const jIds = [...join.a, ...join.b].filter((id) => pk(id) === k0);
            const jy = my(jIds.flatMap((id) => edgeById.get(id)?.pts ?? []));
            const py = my(parts[0]!.pts);
            const ey = e1.pts[e1.pts.length - 1][1] - e1.pts[0][1];
            if (Math.abs(jy - py) > 20 && Math.abs(ey) > 0.5 * e1.lenMm) {
              const firstOnTop = jy < py;
              const e1Down = ey < 0;
              fixed = firstOnTop !== e1Down; // along when the edge starts at the first part's end
            }
          }
          comps.push({ parts: mk(false), flip: mk(true), fixed });
        }
      }
    const sampleOn = (pts: readonly Pt2[], f0: number, f1: number, K: number): Pt2[] => {
      const cum = [0];
      for (let i = 1; i < pts.length; i++)
        cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const T = cum[cum.length - 1] || 1;
      const out: Pt2[] = [];
      for (let k = 0; k <= K; k++) {
        const t = (f0 + ((f1 - f0) * k) / K) * T;
        let i = 1;
        while (i < pts.length - 1 && cum[i] < t) i++;
        const u = (t - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
        out.push([
          pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u,
          pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u,
        ]);
      }
      return out;
    };
    /** How far the composites' parts land from their stretches in a chart (mean mm). */
    const compMiss = (ch: Chart, sel: ChartSeam[][]) => {
      let t = 0;
      let n = 0;
      for (const list2 of sel)
        for (const cs2 of list2) {
          const pa = ch.place.get(cs2.a[0].pieceKey);
          const pb = ch.place.get(cs2.b[0].pieceKey);
          if (!pa || !pb || !cs2.ranges) continue;
          const A = sampleOn(cs2.a[0].pts, ...cs2.ranges.a, 8).map((q) => toChart(pa, q));
          const B = sampleOn(cs2.b[0].pts, ...cs2.ranges.b, 8).map((q) => toChart(pb, q));
          let fw = 0;
          let bw = 0;
          for (let k = 0; k <= 8; k++) {
            fw += Math.hypot(A[k][0] - B[k][0], A[k][1] - B[k][1]);
            bw += Math.hypot(A[k][0] - B[8 - k][0], A[k][1] - B[8 - k][1]);
          }
          t += Math.min(fw, bw) / 9;
          n++;
        }
      return n ? t / n : 0;
    };
    const flips = comps.map(() => false);
    const csWith = () => [...cs, ...comps.flatMap((c, k) => (flips[k] ? c.flip : c.parts))];
    const byArea = [...list].sort(
      (x, y) => Math.abs(y.geom.areaMm2) - Math.abs(x.geom.areaMm2) || x.key.localeCompare(y.key),
    );
    let root = byArea[0].key;
    if (gid === 'BODY') {
      root = (
        byArea.find((P) => P.role === 'back' && !P.geom.hand) ??
        byArea.find((P) => P.role === 'back') ??
        byArea[0]
      ).key;
    } else if (gid === 'LEG_L' || gid === 'LEG_R') {
      root = (byArea.find((P) => P.role === 'front') ?? byArea[0]).key;
    }
    if (comps.length) {
      const sel = () => comps.map((c, k) => (flips[k] ? c.flip : c.parts));
      let best = compMiss(
        buildChart(
          list.map((P) => P.geom),
          csWith(),
          root,
          false,
          footprints,
        ),
        sel(),
      );
      comps.forEach((c, k) => {
        if (c.fixed !== null) flips[k] = c.fixed;
      });
      best = compMiss(
        buildChart(
          list.map((P) => P.geom),
          csWith(),
          root,
          false,
          footprints,
        ),
        sel(),
      );
      for (let k = 0; k < comps.length; k++) {
        if (comps[k].fixed !== null) continue;
        flips[k] = true;
        const m = compMiss(
          buildChart(
            list.map((P) => P.geom),
            csWith(),
            root,
            false,
            footprints,
          ),
          sel(),
        );
        if (m < best - 1) best = m;
        else flips[k] = false;
      }
      if (opt.debug)
        warnings.push(
          `debug: chart ${gid}: composites laid ${comps.map((c, k) => `${c.parts[0].id.split('@')[0]} ${flips[k] ? 'against' : 'along'}${c.fixed === null ? ' (chart fit)' : ' (by height)'}`).join(' · ')} (miss ${best.toFixed(0)} mm)`,
        );
      cs.splice(0, cs.length, ...csWith());
    }
    let chart = buildChart(
      list.map((P) => P.geom),
      cs,
      root,
      false,
      footprints,
    );
    if (gid === 'BODY') {
      // Which way round does the strip run? Seen from outside, a back's drawing-left is the doll's
      // left. Some CAD exports draw backs as seen from the front (mirrored). Decide by the seams
      // first — the reading in which fewer over-the-top seams (shoulders) cross from the doll's left
      // to its right — and by the hands of the names only when the seams cannot tell.
      const rootP = list.find((P) => P.key === root)!;
      const rootIsFront = rootP.role === 'front';
      const judge = (ch: Chart) => {
        const comp = new Set(ch.components[0].keys);
        const ucOf = (k: string) => {
          const g = list.find((P) => P.key === k)!.geom;
          const pl = ch.place.get(k)!;
          const xs = g.rs.filter((_, i) => i % 10 === 0).map((q) => toChart(pl, q)[0]);
          return xs.reduce((a, b) => a + b, 0) / xs.length;
        };
        let u0 = Infinity;
        let u1 = -Infinity;
        for (const k of comp) {
          const g = list.find((P) => P.key === k)!.geom;
          const pl = ch.place.get(k)!;
          for (const q of g.rs.filter((_, i) => i % 10 === 0)) {
            const x = toChart(pl, q)[0];
            u0 = Math.min(u0, x);
            u1 = Math.max(u1, x);
          }
        }
        const W = Math.max(1, u1 - u0);
        const uR = ucOf(root);
        const th0 = rootIsFront ? 0 : Math.PI;
        const side = (u: number) => Math.sign(Math.sin(th0 + (TAU * (u - uR)) / W));
        const edgeU = (id: string) => {
          const e = edgeById.get(id);
          const pl = ch.place.get(pk(id));
          if (!e || !pl) return null;
          return toChart(pl, e.pts[Math.floor(e.pts.length / 2)])[0];
        };
        let crossings = 0;
        for (const sm of cs) {
          if (ch.used.has(sm.id)) continue;
          const ka = sm.a[0].pieceKey;
          const kb = sm.b[0].pieceKey;
          if (!comp.has(ka) || !comp.has(kb)) continue;
          const ua = edgeU(sm.a[0].id);
          const ub = edgeU(sm.b[0].id);
          if (ua === null || ub === null) continue;
          const sa = side(ua);
          const sb = side(ub);
          if (sa && sb && sa !== sb && Math.abs(ua - uR) > 0.05 * W && Math.abs(ub - uR) > 0.05 * W)
            crossings++;
        }
        let hands = 0;
        for (const P of list) {
          const hd = P.geom.hand;
          if (!hd || !comp.has(P.key)) continue;
          hands += (hd === 'L' ? 1 : -1) * Math.sign(ucOf(P.key) - uR) * (rootIsFront ? -1 : 1);
        }
        return { crossings, hands };
      };
      const a0 = judge(chart);
      const alt = buildChart(
        list.map((P) => P.geom),
        cs,
        root,
        true,
        footprints,
      );
      const a1 = judge(alt);
      // Names first (a reading that puts every left piece on the left makes the strip as drawn);
      // only pieces without hands fall back on the seams. A crossing that survives is reported.
      const pickAlt =
        (a0.hands > 0 && a1.hands < a0.hands) || (a0.hands === 0 && a1.crossings < a0.crossings);
      if (opt.debug)
        warnings.push(
          `debug: strip reading: as drawn ${a0.crossings} crossing / hands ${a0.hands}; mirrored ${a1.crossings} / ${a1.hands} → ${pickAlt ? 'mirrored' : 'as drawn'}`,
        );
      if (pickAlt) {
        chart = alt;
        warnings.push(
          a0.hands === 0
            ? `no hands in the names — the body is laid the way its shoulder seams do not cross`
            : `the pieces are drawn face down relative to their names (backs drawn as seen from the front?) — the body is laid mirrored so left stays left`,
        );
      }
    }
    for (const id of [...chart.used])
      if (id.includes('@')) chart.used.add(id.slice(0, id.lastIndexOf('@')));
    charts.set(gid, chart);
    for (const P of list) {
      const pl = chart.place.get(P.key)!;
      P.mirrored = pl.mirror;
      if (P.fold) P.fold.pliesChart = P.fold.plies.map((poly) => poly.map((q) => toChart(pl, q)));
      for (let i = 0; i < P.count; i++) {
        const v = P.offset + i;
        const c = toChart(pl, [uv[2 * v], uv[2 * v + 1]]);
        cuv[2 * v] = c[0];
        cuv[2 * v + 1] = c[1];
      }
    }
  }
  if (opt.debug)
    for (const [gid, ch] of charts)
      warnings.push(
        `debug: chart ${gid}: ${ch.components.map((c) => `[${c.keys.map((k) => `${k}${ch.place.get(k)!.mirror ? '(m)' : ''}@${ch.place.get(k)!.dx.toFixed(0)},${ch.place.get(k)!.dy.toFixed(0)}`).join(' ')}]`).join(' ')}${ch.rejected.length ? ` · refused: ${ch.rejected.join('; ')}` : ''}`,
      );
  const compOfKey = new Map<string, number>();
  for (const ch of charts.values())
    ch.components.forEach((c, i) => c.keys.forEach((k) => compOfKey.set(k, i)));

  // Chart helpers: horizontal crossings of a set of panels at level v (chart coords).
  const boundaryChart = (P: Panel) => {
    const out: [number, number][] = [];
    for (let r = 0; r < P.nb; r++) out.push([cuv[2 * (P.offset + r)], cuv[2 * (P.offset + r) + 1]]);
    return out;
  };
  const crossings = (list: Panel[], v: number) => {
    const iv: [number, number][] = [];
    const cut = (ring: readonly Pt2[], into: [number, number][]) => {
      const xs: number[] = [];
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        if (a[1] > v !== b[1] > v) xs.push(a[0] + ((v - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((x, y) => x - y);
      for (let k = 0; k + 1 < xs.length; k += 2) into.push([xs[k], xs[k + 1]]);
    };
    for (const P of list) {
      if (P.fold?.pliesChart) {
        // A folded piece covers the union of its plies (its ring doubles back on itself).
        const own: [number, number][] = [];
        for (const ply of P.fold.pliesChart) cut(ply, own);
        own.sort((x, y) => x[0] - y[0]);
        let run: [number, number] | null = null;
        for (const [a, b] of own) {
          if (run && a <= run[1]) run[1] = Math.max(run[1], b);
          else iv.push((run = [a, b]));
        }
      } else cut(boundaryChart(P), iv);
    }
    iv.sort((x, y) => x[0] - y[0]);
    return iv;
  };
  const extent = (iv: [number, number][]) =>
    iv.length ? [Math.min(...iv.map((x) => x[0])), Math.max(...iv.map((x) => x[1]))] : null;
  const coverage = (iv: [number, number][]) => {
    const e = extent(iv);
    if (!e) return 0;
    let cov = 0;
    let end = -Infinity;
    for (const [a, b] of iv) {
      if (b <= end) continue;
      cov += b - Math.max(a, end);
      end = b;
    }
    return cov / Math.max(1, e[1] - e[0]);
  };
  /** Chart extent per level, cached on a 5 mm grid (proxies call it per vertex per pass). */
  const widthTable = (list: Panel[], lo: number, hi: number, fallback: number) => {
    const step = 5;
    const n = Math.max(2, Math.ceil((hi - lo) / step) + 1);
    const t = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const v = Math.max(lo + 2, Math.min(lo + k * step, hi - 2));
      const e = extent(crossings(list, v));
      t[k] = e ? e[1] - e[0] : NaN;
    }
    for (let k = 1; k < n; k++) if (Number.isNaN(t[k])) t[k] = t[k - 1];
    for (let k = n - 2; k >= 0; k--) if (Number.isNaN(t[k])) t[k] = t[k + 1];
    for (let k = 0; k < n; k++) if (Number.isNaN(t[k])) t[k] = fallback;
    return (v: number) => {
      const f = (v - lo) / step;
      const i = Math.max(0, Math.min(n - 2, Math.floor(f)));
      const w = Math.max(0, Math.min(1, f - i));
      return t[i] * (1 - w) + t[i + 1] * w;
    };
  };
  const vRange = (list: Panel[]) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const P of list)
      for (let r = 0; r < P.nb; r++) {
        const y = cuv[2 * (P.offset + r) + 1];
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
    return [lo, hi];
  };
  const setPos = (v: number, p: Vec3) => {
    pos[3 * v] = p[0];
    pos[3 * v + 1] = p[1];
    pos[3 * v + 2] = p[2];
  };
  const getPos = (v: number): Vec3 => [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]];

  const proxies: Proxy[] = [];
  const proxyOf = new Int32Array(N).fill(-1);
  const proxyReport: DollProxy[] = [];
  const placed = new Uint8Array(N);
  /** Panels omitted from garment frames/reports while their diagnostic geometry is still solved. */
  const hiddenFromView = new Uint8Array(N);
  for (const P of panels)
    if (P.group === 'FLOAT') for (let i = 0; i < P.count; i++) hiddenFromView[P.offset + i] = 1;

  // ── seams as work items ──────────────────────────────────────────────────────────────────
  const works: Work[] = [];
  const meanDist = (
    A: Path,
    B: Path,
    same: boolean,
    aR: [number, number],
    bR: [number, number],
  ) => {
    const r = seamRows(A, B, same, aR, bR);
    const g = rowGaps(pos, r);
    return g.reduce((x, y) => x + y, 0) / Math.max(1, g.length);
  };
  /** Build a work item; direction (and partial anchor) by the smaller initial gap. */
  const addWork = (
    w: Omit<Work, 'rows' | 'solver' | 'same' | 'aRange' | 'bRange' | 'born' | 'ramp'> & {
      partial?: boolean;
      gap?: number;
      forceSame?: boolean;
      /** L4: the sewn stretch of each side, shares of its path (a stored partial). */
      ranges?: { aR: [number, number]; bR: [number, number] };
      /** The stretches to choose from, each with its direction (a side sewn over a share). */
      rangeOptions?: { same: boolean; aR: [number, number]; bR: [number, number] }[];
    },
    passNow: number,
    ramp: number,
  ) => {
    const options: { same: boolean; aR: [number, number]; bR: [number, number] }[] = [
      ...(w.rangeOptions ?? []),
    ];
    if (w.ranges)
      for (const same of w.forceSame === undefined ? [false, true] : [w.forceSame])
        options.push({ same, aR: w.ranges.aR, bR: w.ranges.bR });
    const ratio = Math.min(w.A.len, w.B.len) / Math.max(w.A.len, w.B.len, 1e-9);
    const sames = w.forceSame === undefined ? [false, true] : [w.forceSame];
    // (graph seams pass forceSame: face-up pieces are sewn with their edges running opposite ways)
    for (const same of w.ranges || w.rangeOptions ? [] : sames) {
      if (w.partial && ratio < 0.97) {
        const aShort = w.A.len < w.B.len;
        for (const anchor of [0, 1]) {
          const sub: [number, number] = anchor === 0 ? [0, ratio] : [1 - ratio, 1];
          options.push(aShort ? { same, aR: [0, 1], bR: sub } : { same, aR: sub, bR: [0, 1] });
        }
      } else options.push({ same, aR: [0, 1], bR: [0, 1] });
    }
    let best = options[0];
    let bd = Infinity;
    for (const o of options) {
      const d = meanDist(w.A, w.B, o.same, o.aR, o.bR);
      if (d < bd - 1e-6) [best, bd] = [o, d];
    }
    const rows = seamRows(w.A, w.B, best.same, best.aR, best.bR);
    const solver: SolverSeam = { rows, k: 0, active: true, gap: w.gap ?? 0 };
    const item: Work = {
      ...w,
      same: best.same,
      aRange: best.aR,
      bRange: best.bR,
      rows,
      solver,
      born: passNow,
      ramp,
    };
    works.push(item);
    // L4: the doll never proposes a pair a person rejected (kept out of the solve and the report).
    if (
      l4 &&
      item.origin === 'doll-proposed' &&
      item.kind !== 'facing-free' &&
      isExcluded(item.a, item.b)
    ) {
      item.rejectedByPerson = true;
      item.released = true;
      item.solver.active = false;
      warnings.push(`${item.id}: not proposed — a person rejected this pair`);
    }
    return item;
  };

  // ── notches and fold evidence (shared by the legs' waist, the bands and the collar) ────
  const notchRs = new Map<number, Set<number>>();
  for (const P of panels) {
    const n = P.geom.rs.length;
    notchRs.set(P.idx, new Set(P.geom.notchIdx.map((i) => ((i % n) + n) % n)));
  }
  const cctx: CollarCtx = {
    pos,
    uv,
    cuv,
    panelOf,
    ringOf,
    nbOf: (p) => panels[p].nb,
    isNotch: (v) => {
      const r = ringOf[v];
      if (r < 0) return false;
      const P = panels[panelOf[v]];
      return notchRs.get(P.idx)!.has(P.mesh.bRs[r]);
    },
  };
  /** Edge of the panel's geometry a boundary segment (two ring vertices) lies on. */
  const edgeOfSeg = (a: number, b: number): Edge | null => {
    if (panelOf[a] !== panelOf[b] || ringOf[a] < 0 || ringOf[b] < 0) return null;
    const P = panels[panelOf[a]];
    const n = P.geom.rs.length;
    const ia = P.mesh.bRs[ringOf[a]];
    const ib = P.mesh.bRs[ringOf[b]];
    const inE = (e: Edge, i: number) => (((i - e.s) % n) + n) % n <= (((e.e - e.s) % n) + n) % n;
    return P.geom.edges.find((e) => inE(e, ia) && inE(e, ib)) ?? null;
  };
  /**
   * Intake marks ON a path (04-COLLAR K2 + intake), as arc ranges to fold closed before a unit or
   * a band is fitted: notch pairs 15–80 mm apart on one piece (a pleat, a dart's two legs), and
   * runs of short edges (< 35 mm, two or more: a stepped tuck or a dart slit drawn in the outline).
   */
  const foldsOnPath = (P: Path) => {
    const notchK: number[] = [];
    for (let k = 0; k < P.v.length; k++)
      if (cctx.isNotch(P.v[k]) && (!notchK.length || P.s[k] - P.s[notchK[notchK.length - 1]] > 2))
        notchK.push(k);
    const pairs: [number, number][] = [];
    /** The panel each pair lies on (aligned with `pairs`). */
    const pairPanel: number[] = [];
    for (let i = 0; i + 1 < notchK.length; i++) {
      const a = notchK[i];
      const b = notchK[i + 1];
      const d = P.s[b] - P.s[a];
      if (d >= 15 && d <= 80 && panelOf[P.v[a]] === panelOf[P.v[b]]) {
        pairs.push([P.s[a], P.s[b]]);
        pairPanel.push(panelOf[P.v[a]]);
        i++;
      }
    }
    const stairs: [number, number][] = [];
    /** The first and last vertex of each run (aligned with `stairs`). */
    const stairV: [number, number][] = [];
    let run: { s0: number; s1: number; v0: number; v1: number; edges: Set<string> } | null = null;
    const flush = () => {
      if (run && run.edges.size >= 2 && run.s1 - run.s0 <= 130) {
        stairs.push([run.s0, run.s1]);
        stairV.push([run.v0, run.v1]);
      }
      run = null;
    };
    for (let k = 1; k < P.v.length; k++) {
      const e = edgeOfSeg(P.v[k - 1], P.v[k]);
      if (e && e.lenMm < 35) {
        if (!run)
          run = { s0: P.s[k - 1], s1: P.s[k], v0: P.v[k - 1], v1: P.v[k], edges: new Set([e.id]) };
        else {
          run.s1 = P.s[k];
          run.v1 = P.v[k];
          run.edges.add(e.id);
        }
      } else flush();
    }
    flush();
    /** Notch arcs on the path with their panel. */
    const notches = notchK.map((k) => ({ s: P.s[k], panel: panelOf[P.v[k]] }));
    return { pairs, pairPanel, stairs, stairV, notches };
  };
  /**
   * Intake on a path read from EVIDENCE alone, never from how a band happens to fit (11.10
   * review: six balance-notch pairs 75 mm apart would otherwise have let a wrong 700 mm band pass
   * on a 1000 mm waist): pleats = two or more notch pairs of one width (± 3 mm or 15 %) on one
   * piece — a lone pair is a balance mark and never folds; darts = a run of short edges that
   * converges (its chord under half its length: a slit, a V), spanning the notches within 15 mm
   * either side when the piece carries them (the dart's legs). Overlaps merged.
   */
  type FoldKind = 'pleat' | 'dart';
  const foldEvidence = (
    B: Path,
  ): { folds: [number, number][]; kinds: FoldKind[]; Le: number } | null => {
    const f = foldsOnPath(B);
    const out: { r: [number, number]; kind: FoldKind }[] = [];
    const byPanel = new Map<number, [number, number][]>();
    f.pairs.forEach((p, i) => {
      const list = byPanel.get(f.pairPanel[i]) ?? [];
      list.push(p);
      byPanel.set(f.pairPanel[i], list);
    });
    for (const list of byPanel.values()) {
      if (list.length < 2) continue;
      for (const p of list) {
        const w = p[1] - p[0];
        const alike = list.filter((q) => Math.abs(q[1] - q[0] - w) <= Math.max(3, 0.15 * w));
        if (alike.length >= 2) out.push({ r: p, kind: 'pleat' });
      }
    }
    f.stairs.forEach((st, i) => {
      const [v0, v1] = f.stairV[i];
      if (panelOf[v0] !== panelOf[v1]) return;
      const chord = Math.hypot(uv[2 * v1] - uv[2 * v0], uv[2 * v1 + 1] - uv[2 * v0 + 1]);
      if (chord > 0.5 * (st[1] - st[0])) return;
      const pn = panelOf[v0];
      let lo = st[0];
      let hi = st[1];
      for (const n of f.notches) {
        if (n.panel !== pn) continue;
        if (n.s < st[0] && st[0] - n.s <= 15) lo = Math.min(lo, n.s);
        if (n.s > st[1] && n.s - st[1] <= 15) hi = Math.max(hi, n.s);
      }
      out.push({ r: [lo, hi], kind: 'dart' });
    });
    if (!out.length) return null;
    const folds: [number, number][] = [];
    const kinds: FoldKind[] = [];
    for (const x of [...out].sort((p, q) => p.r[0] - q.r[0])) {
      const last = folds[folds.length - 1];
      if (last && x.r[0] <= last[1]) {
        last[1] = Math.max(last[1], x.r[1]);
        // (a dart drawn inside a notch pair: sewn, not tucked)
        if (x.kind === 'dart') kinds[kinds.length - 1] = 'dart';
      } else {
        folds.push([x.r[0], x.r[1]]);
        kinds.push(x.kind);
      }
    }
    const Le = B.len - folds.reduce((t, x) => t + x[1] - x[0], 0);
    return Le > 0 ? { folds, kinds, Le } : null;
  };
  /**
   * The folds on a path FORMED in 3D (N9, 06-TROUSERS-SHAPE.md): what the pattern's intake marks
   * mean once sewn. A PLEAT's two notch points coincide in the seam — the tuck is sewn into the
   * waist seam only, so below it the pleat releases: the two sides may stand no farther apart than
   * w·d/D at depth d under the notches (unilateral limits), D = 4 w within 80–160 mm — never
   * pinned all the way down; the depth comes from the notches alone. A DART's two legs are sewn to
   * each other from the edge to its point (a self-seam: the vertex t mm in from one end of the run
   * meets the one t mm in from the other). Internal constraints, never seams: nothing is reported,
   * nothing is scored. Returns the intake taken in, mm.
   */
  const formFolds = (B: Path, ev: NonNullable<ReturnType<typeof foldEvidence>>): number => {
    const tie = (a: number, b: number) => {
      if (a === b) return;
      di.push(a);
      dj.push(b);
      dr.push(0);
      dk.push(1);
    };
    const atArc = (s0: number, k0: number, k1: number) => {
      let best = k0;
      for (let k = k0; k <= k1; k++) if (Math.abs(B.s[k] - s0) < Math.abs(B.s[best] - s0)) best = k;
      return best;
    };
    let taken = 0;
    ev.folds.forEach(([f0, f1], fi) => {
      const k0 = atArc(f0, 0, B.v.length - 1);
      const k1 = atArc(f1, 0, B.v.length - 1);
      if (k1 <= k0) return;
      const va = B.v[k0];
      const vb = B.v[k1];
      const pn = panelOf[va];
      if (pn < 0 || pn !== panelOf[vb]) return;
      const w = f1 - f0;
      taken += w;
      if (ev.kinds[fi] === 'dart') {
        for (let k = k0; k <= k1; k++) {
          const t = B.s[k] - f0;
          if (t > w / 2) break;
          const kk = atArc(f1 - t, k, k1);
          if (B.v[kk] !== B.v[k]) tie(B.v[k], B.v[kk]);
        }
        return;
      }
      tie(va, vb);
      // The release under the tuck: the inward normal of the edge in the piece's own frame.
      const P = panels[pn];
      const ring = P.mesh.pts.slice(0, P.nb);
      const ax = uv[2 * va];
      const ay = uv[2 * va + 1];
      const bx = uv[2 * vb];
      const by = uv[2 * vb + 1];
      const tl = Math.hypot(bx - ax, by - ay) || 1;
      let nx = -(by - ay) / tl;
      let ny = (bx - ax) / tl;
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      if (!pointInPolygon([mx + 10 * nx, my + 10 * ny], ring)) {
        nx = -nx;
        ny = -ny;
      }
      const nearest = (x: number, y: number) => {
        let best = -1;
        let bd = (0.9 * h) ** 2;
        for (let i = 0; i < P.count; i++) {
          const d = (P.mesh.pts[i][0] - x) ** 2 + (P.mesh.pts[i][1] - y) ** 2;
          if (d < bd) [best, bd] = [i, d];
        }
        return best < 0 ? -1 : P.offset + best;
      };
      const D = Math.max(80, Math.min(160, 4 * w));
      for (let d = h; d < D; d += h) {
        const ia = nearest(ax + nx * d, ay + ny * d);
        const ib = nearest(bx + nx * d, by + ny * d);
        if (ia < 0 || ib < 0 || ia === ib) continue;
        li.push(ia);
        lj.push(ib);
        lr.push((w * d) / D);
      }
    });
    return taken;
  };

  // ── constraint arrays (filled by the folds at placement and by buildPanel) ──────────────
  /** Stretch (rest length, stiffness) and bending (opposite vertices) distance constraints. */
  const di: number[] = [];
  const dj: number[] = [];
  const dr: number[] = [];
  const dk: number[] = [];
  const bi: number[] = [];
  const bj: number[] = [];
  const br: number[] = [];
  const bk: number[] = [];
  /** Long-range unilateral limits: never farther apart than lrest. */
  const li: number[] = [];
  const lj: number[] = [];
  const lr: number[] = [];

  // ── BODY / LEGS placement ───────────────────────────────────────────────────────────────
  const legPanelsOf = legPanels(G.pieces.map((P) => P.geom));
  const body = groups.get('BODY') ?? [];
  const bodyChart = charts.get('BODY');
  let vArm = 0;
  let vSh = 0;
  /** The neck cylinder once a finished neck is read: never wider than that neck's own girth. */
  let neckGirthR = Infinity;
  let vLo = 0;
  const torso: { y: number; a: number; b: number; tab: Float64Array }[] = [];
  const ellPerimFactor = (() => {
    const b = 1 / ASPECT;
    return Math.PI * (3 * (1 + b) - Math.sqrt((3 + b) * (1 + 3 * b)));
  })();
  const arcTable = (a: number, b: number) => {
    const K = 96;
    const t = new Float64Array(K + 1);
    let px = 0;
    let pz = b;
    for (let k = 1; k <= K; k++) {
      const ph = (TAU * k) / K;
      const x = a * Math.sin(ph);
      const z = b * Math.cos(ph);
      t[k] = t[k - 1] + Math.hypot(x - px, z - pz);
      px = x;
      pz = z;
    }
    return t;
  };
  const torsoAt = (y: number) => {
    if (!torso.length) return null;
    const step = torso.length > 1 ? torso[1].y - torso[0].y : 10;
    const f = (y - torso[0].y) / step;
    const i = Math.max(0, Math.min(torso.length - 1, Math.floor(f)));
    return torso[i];
  };
  /** Point on the torso at azimuth θ (0 = front, π = back, + toward the doll's right at the back). */
  const torsoPoint = (theta: number, y: number, off: number): Vec3 => {
    const L = torsoAt(y)!;
    const tab = L.tab;
    const K = tab.length - 1;
    let fr = (((theta % TAU) + TAU) % TAU) / TAU;
    const target = fr * tab[K];
    let lo = 0;
    let hi = K;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (tab[m] <= target) lo = m;
      else hi = m;
    }
    fr = (lo + (target - tab[lo]) / Math.max(1e-9, tab[hi] - tab[lo])) / K;
    const ph = fr * TAU;
    const x = L.a * Math.sin(ph);
    const z = L.b * Math.cos(ph);
    const nx = x / (L.a * L.a);
    const nz = z / (L.b * L.b);
    const nl = Math.hypot(nx, nz) || 1;
    return [x + (nx / nl) * off, y, z + (nz / nl) * off];
  };

  // ── BAG (not a garment): the panels wrapped round a plain shape, placed by their seams ──────
  // No body to wrap: the cloth's area says how big the item is, the biggest panel what shape. Two
  // panels that carry most of the cloth (a pouch, a cover) make a flat shape of that panel's size,
  // as deep as the strips between them are wide; otherwise a ball the area fills with slack. The
  // biggest panel is laid on the front; every other panel is walked onto the shape from the panel
  // it is sewn to, across their seam (longest seams first), its face out; the seams then close in
  // the solve, the shape pushing the paper out so it does not collapse.
  /** A bag's flap and straps: drawn on a face by a reading, said as surface rows of the report. */
  const bagSurfaceRows: NonNullable<DollReport['surface']> = [];
  if (bag && body.length) {
    const V3 = {
      add: (p: Vec3, q: Vec3, k = 1): Vec3 => [p[0] + q[0] * k, p[1] + q[1] * k, p[2] + q[2] * k],
      sub: (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]],
      dot: (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2],
      cross: (p: Vec3, q: Vec3): Vec3 => [
        p[1] * q[2] - p[2] * q[1],
        p[2] * q[0] - p[0] * q[2],
        p[0] * q[1] - p[1] * q[0],
      ],
      len: (p: Vec3) => Math.hypot(p[0], p[1], p[2]),
      unit: (p: Vec3): Vec3 | null => {
        const l = Math.hypot(p[0], p[1], p[2]);
        return l > 1e-9 ? [p[0] / l, p[1] / l, p[2] / l] : null;
      },
    };
    const areaOfP = (P: Panel) => Math.abs(P.geom.areaMm2);
    const bounds2 = (P: Panel) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let r = 0; r < P.nb; r++) {
        const v = P.offset + r;
        x0 = Math.min(x0, uv[2 * v]);
        x1 = Math.max(x1, uv[2 * v]);
        y0 = Math.min(y0, uv[2 * v + 1]);
        y1 = Math.max(y1, uv[2 * v + 1]);
      }
      return { w: x1 - x0, h: y1 - y0 };
    };
    const total = body.reduce((t, P) => t + areaOfP(P), 0);
    const byArea = [...body].sort((x, y) => areaOfP(y) - areaOfP(x) || x.key.localeCompare(y.key));
    const big = byArea[0];
    const second = byArea[1];
    let a: number;
    let b: number;
    let c: number;
    let shapeWords: string;
    // RINGS (rings.ts): panels sewn side to side into a ring, a lid on its tops, two rings base to
    // base — a shape of revolution round the lens axis (z, toward the viewer). The base polygon's
    // circumradius is the shape's radius (the panels' corners reach it), the panels' height from
    // base to top the meridian, the lid's polygon the pole; two flat octagons (a panel's height =
    // the drop from the base polygon's inradius to the lid's) make a flat pouch a few per cent of
    // its radius thick, a taller panel a lens. The panels are placed round the axis by the ring's
    // order, not walked — a walk on a ball of the cloth's area crushed them into each other.
    const bodyKey = (k: string) => panelByKey.get(k)?.group === 'BODY';
    const boxOf = (P: Panel) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let r = 0; r < P.nb; r++) {
        const v = P.offset + r;
        x0 = Math.min(x0, uv[2 * v]);
        x1 = Math.max(x1, uv[2 * v]);
        y0 = Math.min(y0, uv[2 * v + 1]);
        y1 = Math.max(y1, uv[2 * v + 1]);
      }
      return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
    };
    /**
     * The stretch of a panel's boundary the other panels' seams hold (a partial cropped to its
     * sewn run — sidePath): its box in the panel's frame. Null when no seam reaches the panel.
     */
    const sewnBoxOf = (P: Panel) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      let n = 0;
      for (const sm of G.seams) {
        const side = sm.a.every((id) => pk(id) === P.key)
          ? ('a' as const)
          : sm.b.every((id) => pk(id) === P.key)
            ? ('b' as const)
            : null;
        if (!side) continue;
        const other = side === 'a' ? sm.b : sm.a;
        if (!other.every((id) => pk(id) !== P.key && bodyKey(pk(id)))) continue;
        const p = sidePath(sm, side);
        if (!p) continue;
        for (const v of p.v) {
          x0 = Math.min(x0, uv[2 * v]);
          x1 = Math.max(x1, uv[2 * v]);
          y0 = Math.min(y0, uv[2 * v + 1]);
          y1 = Math.max(y1, uv[2 * v + 1]);
          n++;
        }
      }
      return n ? { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 } : null;
    };
    /**
     * A FLAP: the biggest panel's seams hold only part of it (a dust bag's outer panel runs on
     * past the gusset to fold over the mouth). The shape is the sewn part's size; the rest, sewn
     * along no edge of its own, hinges where the seams end and folds over the other face.
     */
    let flap: ReturnType<typeof sewnBoxOf> = null;
    const mid2Of = (id: EdgeId): Pt2 | null => {
      const p = pathOf([id]);
      if (!p) return null;
      let x = 0;
      let y = 0;
      for (const v of p.v) {
        x += uv[2 * v];
        y += uv[2 * v + 1];
      }
      return [x / p.v.length, y / p.v.length];
    };
    const edgeLen = (id: EdgeId) => edgeById.get(id)?.lenMm ?? 0;
    const ringsHere = (ringsR?.rings ?? []).filter(
      (r) => r.pieces.length >= 3 && r.pieces.every(bodyKey),
    );
    /** A ring panel's base edge (the partner ring's, else the longest non-side) and top (the lid's, else the shortest). */
    const ringEdges = (r: Ring, k: string) => {
      const g = panelByKey.get(k)!.geom;
      const sides = new Set(r.sides.get(k) ?? []);
      const others = g.edges
        .filter((e) => e.kind === 'edge' && !sides.has(e.id))
        .sort((x, y) => y.lenMm - x.lenMm);
      const knownTop = r.top.get(k);
      const knownBase = r.base.get(k);
      const base = knownBase ?? others.find((e) => e.id !== knownTop)?.id;
      const top =
        knownTop ??
        (others.length > 1 ? [...others].reverse().find((e) => e.id !== base)?.id : undefined);
      return { base, top: top === base ? undefined : top };
    };
    const ringDims = (r: Ring) => {
      let baseP = 0;
      let topP = 0;
      let hSum = 0;
      let n = 0;
      for (const k of r.pieces) {
        const { base, top } = ringEdges(r, k);
        if (!base) continue;
        baseP += edgeLen(base);
        if (top) topP += edgeLen(top);
        const mb = mid2Of(base);
        const mt = top ? mid2Of(top) : null;
        if (!mb) continue;
        if (mt) hSum += Math.hypot(mt[0] - mb[0], mt[1] - mb[1]);
        else {
          const P = panelByKey.get(k)!;
          let far = 0;
          for (let i = 0; i < P.nb; i++) {
            const v = P.offset + i;
            far = Math.max(far, Math.hypot(uv[2 * v] - mb[0], uv[2 * v + 1] - mb[1]));
          }
          hSum += far;
        }
        n++;
      }
      return { n: r.pieces.length, baseP, topP, h: n ? hSum / n : 0 };
    };
    const ringA = ringsHere.find((r) => r.mate && ringsHere.includes(r.mate.ring)) ?? ringsHere[0];
    const ringB = ringA?.mate && ringsHere.includes(ringA.mate.ring) ? ringA.mate.ring : null;
    const ringLays = ringA ? (ringB ? [ringA, ringB] : [ringA]) : [];
    const ringDimsAll = ringLays.map(ringDims);
    const useRings =
      ringDimsAll.length > 0 &&
      ringDimsAll.every((d) => d.baseP > 0 && d.h > 0 && d.topP < 0.95 * d.baseP);
    // Two faces of about one size that carry most of the cloth: a pouch, a cover.
    const twoFaces =
      !!second &&
      areaOfP(second) >= 0.4 * areaOfP(big) &&
      areaOfP(big) + areaOfP(second) > 0.55 * total;
    if (useRings) {
      const circum = (perim: number, n: number) => perim / n / (2 * Math.sin(Math.PI / n));
      const inr = (perim: number, n: number) => perim / n / (2 * Math.tan(Math.PI / n));
      const R = ringDimsAll.reduce((t, d) => t + circum(d.baseP, d.n), 0) / ringDimsAll.length;
      a = Math.max(1, R);
      b = a;
      let cc = 0;
      for (const d of ringDimsAll) {
        const rTop = d.topP > 0 ? inr(d.topP, d.n) : 0;
        const drop = Math.max(0, inr(d.baseP, d.n) - rTop);
        const z = Math.sqrt(Math.max(0, d.h * d.h - drop * drop));
        cc = Math.max(cc, z / Math.sqrt(1 - (rTop / R) ** 2));
      }
      c = Math.max(0.06 * a, Math.min(3 * a, cc));
      const n = ringDimsAll[0].n;
      shapeWords =
        ringLays.length === 2
          ? `${cc < 0.1 * a ? 'a flat pouch' : 'a lens'} ${(2 * a).toFixed(0)} mm across, ${(2 * c).toFixed(0)} mm thick (two rings of ${n} panels base to base${ringA.lid ? ', a lid at each pole' : ''})`
          : `a round shape ${(2 * a).toFixed(0)} mm across, ${c.toFixed(0)} mm deep (a ring of ${n} panels${ringA.lid ? ' closed by a lid' : ''})`;
    } else if (twoFaces) {
      const full = boxOf(big);
      const sb = sewnBoxOf(big);
      // A flap only on clear evidence (11.10 review: a seam the graph lacks must not turn the rest
      // of a face into a flap): the free part lies beyond exactly ONE side of the sewn box, and
      // the sewn box keeps at least 30 % of the panel both ways. Otherwise the whole panel is the
      // face and the free part is said open.
      if (sb && (sb.h < 0.8 * full.h || sb.w < 0.8 * full.w)) {
        const sides = [
          sb.x0 - full.x0 > 10,
          full.x1 - sb.x1 > 10,
          sb.y0 - full.y0 > 10,
          full.y1 - sb.y1 > 10,
        ].filter(Boolean).length;
        const kept = sb.w >= 0.3 * full.w && sb.h >= 0.3 * full.h;
        if (sides === 1 && kept) flap = sb;
        else {
          const note = `its seams hold ${sb.w.toFixed(0)} × ${sb.h.toFixed(0)} mm of its ${full.w.toFixed(0)} × ${full.h.toFixed(0)}, ${sides === 1 ? 'less than 30 % of it' : sides === 0 ? 'the free part all round the rim' : `the free part past ${sides} of its sides`} — not read as a flap (a seam the graph lacks?); drawn as the whole face, the free part left open`;
          bagSurfaceRows.push({ pieceKey: big.key, host: null, join: null, placed: false, note });
          warnings.push(`${big.key}: ${note}`);
        }
      }
      const { w: w0, h: h0 } = flap ?? full;
      a = Math.max(1, w0 / 2);
      b = Math.max(1, h0 / 2);
      const widths = body
        .filter((P) => P !== big && areaOfP(P) < 0.5 * areaOfP(big))
        .map((P) => (2 * areaOfP(P)) / Math.max(1, P.geom.perimMm))
        .sort((x, y) => x - y);
      const med = widths.length ? widths[Math.floor(widths.length / 2)] : 0;
      c = Math.max(12, Math.min(0.5 * Math.min(a, b), med ? med / 2 : 0.08 * Math.min(a, b)));
      shapeWords = `a flat shape ${(2 * a).toFixed(0)} × ${(2 * b).toFixed(0)} mm, ${(2 * c).toFixed(0)} mm deep (${flap ? 'the sewn part of the biggest panel' : "the biggest panel's size"}; the strips' width between the two faces)`;
    } else {
      const R = Math.max(1, Math.sqrt((0.9 * total) / (4 * Math.PI)));
      a = R;
      b = R;
      c = R;
      shapeWords = `a ball ${(2 * R).toFixed(0)} mm across (the cloth's area, with slack)`;
    }
    /** The point of the shape in the direction of p. */
    const onEll = (p: Vec3): Vec3 => {
      const q = Math.sqrt((p[0] / a) ** 2 + (p[1] / b) ** 2 + (p[2] / c) ** 2);
      return q < 1e-9 ? [0, 0, c] : [p[0] / q, p[1] / q, p[2] / q];
    };
    const nrmAt = (p: Vec3): Vec3 =>
      V3.unit([p[0] / (a * a), p[1] / (b * b), p[2] / (c * c)]) ?? [0, 0, 1];
    const tangentAt = (d: Vec3, p: Vec3): Vec3 | null => {
      const n = nrmAt(p);
      return V3.unit(V3.sub(d, V3.add([0, 0, 0], n, V3.dot(d, n))));
    };
    /**
     * Walk L mm over the shape from p0 in the tangent direction dir (unit): steps of 10 mm, finer
     * on a flat shape whose rim turns sharply (its radius there is c² / a — a 10 mm step would
     * overshoot the rim and never get round to the back).
     */
    const stepMm = Math.min(10, Math.max(1.5, (c * c) / (2 * Math.max(a, b))));
    const walk = (p0: Vec3, dir0: Vec3, L: number): { p: Vec3; dir: Vec3 } => {
      let p = p0;
      let dir = dir0;
      const steps = Math.max(1, Math.ceil(L / stepMm));
      const h = L / steps;
      for (let k = 0; k < steps; k++) {
        const q = onEll(V3.add(p, dir, h));
        dir = tangentAt(dir, q) ?? dir;
        p = q;
      }
      return { p, dir };
    };
    const K = PROXY_K;
    /** The shape grown by `g` mm: a flap or a strap lies that much outside the face under it. */
    const ellProxy = (g: number): Proxy => ({
      push(p, i) {
        const x = p[3 * i];
        const y = p[3 * i + 1];
        const z = p[3 * i + 2];
        const q = (x / ((a + g) * K)) ** 2 + (y / ((b + g) * K)) ** 2 + (z / ((c + g) * K)) ** 2;
        if (q >= 1 || q < 1e-9) return;
        const f = 1 / Math.sqrt(q);
        p[3 * i] = x * f;
        p[3 * i + 1] = y * f;
        p[3 * i + 2] = z * f;
      },
      pull(p, i, k) {
        const x = p[3 * i];
        const y = p[3 * i + 1];
        const z = p[3 * i + 2];
        const q =
          (x / (a + g + CLEAR)) ** 2 + (y / (b + g + CLEAR)) ** 2 + (z / (c + g + CLEAR)) ** 2;
        if (q <= 1) return;
        const f = 1 / Math.sqrt(q);
        p[3 * i] += (x * f - x) * k;
        p[3 * i + 1] += (y * f - y) * k;
        p[3 * i + 2] += (z * f - z) * k;
      },
    });
    const bagIdx = proxies.push(ellProxy(0)) - 1;
    proxyReport.push({ group: 'BODY', kind: 'torso', profile: [[0, a, c]], origin: [0, 0, 0] });
    const centroid2 = (vs: ArrayLike<number>): Pt2 => {
      let x = 0;
      let y = 0;
      for (let k = 0; k < vs.length; k++) {
        x += uv[2 * vs[k]];
        y += uv[2 * vs[k] + 1];
      }
      return [x / Math.max(1, vs.length), y / Math.max(1, vs.length)];
    };
    const centroid3 = (vs: ArrayLike<number>): Vec3 => {
      const q: Vec3 = [0, 0, 0];
      for (let k = 0; k < vs.length; k++) {
        q[0] += pos[3 * vs[k]];
        q[1] += pos[3 * vs[k] + 1];
        q[2] += pos[3 * vs[k] + 2];
      }
      const n = Math.max(1, vs.length);
      return [q[0] / n, q[1] / n, q[2] / n];
    };
    const ringVs = (P: Panel) => Array.from({ length: P.nb }, (_, r) => P.offset + r);
    /** Where a vertex at local offset (x, y) from the anchor lands: a straight walk over the shape. */
    const landing = (c3: Vec3, U: Vec3, Vv: Vec3, x: number, y: number): Vec3 => {
      const L = Math.hypot(x, y);
      if (L < 1e-6) return c3;
      const dir = V3.unit(V3.add(V3.add([0, 0, 0], U, x), Vv, y))!;
      return walk(c3, dir, L).p;
    };
    /**
     * Lay a panel: its local point q0 at c3, its local unit direction ux along U, the perpendicular
     * along V (flipped when mirrored: the panel face down on the shape).
     */
    const lay = (P: Panel, q0: Pt2, c3: Vec3, U: Vec3, Vv: Vec3, ux: Pt2, mirror: boolean) => {
      const uy: Pt2 = mirror ? [ux[1], -ux[0]] : [-ux[1], ux[0]];
      for (let i = 0; i < P.count; i++) {
        const v = P.offset + i;
        const dx = uv[2 * v] - q0[0];
        const dy = uv[2 * v + 1] - q0[1];
        setPos(v, landing(c3, U, Vv, dx * ux[0] + dy * ux[1], dx * uy[0] + dy * uy[1]));
        proxyOf[v] = bagIdx;
        placed[v] = 1;
      }
      P.mirrored = mirror;
    };
    const wrapA = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
    const azOf = (id: EdgeId): number | null => {
      const p = pathOf([id]);
      if (!p) return null;
      const m = centroid3(p.v);
      return Math.atan2(m[1], m[0]);
    };
    const unit2 = (p: Pt2, q: Pt2): Pt2 => {
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      return l > 1e-6 ? [(q[0] - p[0]) / l, (q[1] - p[1]) / l] : [0, 1];
    };
    /**
     * A ring's panel at azimuth th, its base on the equator, its top toward the pole on side s;
     * face out or face down so that its second side lies on the chain's way round (dir).
     */
    /** The side edge of ring panel i sewn to panel i + d (d = ±1), from the seams as grouped. */
    const sideToward = (r: Ring, i: number, d: 1 | -1): EdgeId | null => {
      const n = r.pieces.length;
      const k = r.pieces[i];
      const kn = r.pieces[(((i + d) % n) + n) % n];
      const mine = new Set(r.sides.get(k) ?? []);
      const theirs = new Set(r.sides.get(kn) ?? []);
      for (const sm of G.seams) {
        if (sm.a.length !== 1 || sm.b.length !== 1) continue;
        if (mine.has(sm.a[0]) && theirs.has(sm.b[0])) return sm.a[0];
        if (mine.has(sm.b[0]) && theirs.has(sm.a[0])) return sm.b[0];
      }
      return null;
    };
    const layRingPanel = (r: Ring, i: number, th: number, s: 1 | -1, dir: 1 | -1) => {
      const k = r.pieces[i];
      const P = panelByKey.get(k)!;
      const { base } = ringEdges(r, k);
      const cen = centroid2(ringVs(P));
      const q0 = (base ? mid2Of(base) : null) ?? cen;
      const ux = unit2(q0, cen);
      const c3: Vec3 = [a * Math.cos(th), b * Math.sin(th), 0];
      const U: Vec3 = [0, 0, s];
      const Vv = V3.cross([Math.cos(th), Math.sin(th), 0], U);
      lay(P, q0, c3, U, Vv, ux, false);
      // Face out or face down: the side sewn to the next panel lies on the chain's way round.
      const next = sideToward(r, i, 1);
      const prev = sideToward(r, i, -1);
      const an = next ? azOf(next) : null;
      const ap = prev ? azOf(prev) : null;
      const wrong =
        an !== null && ap !== null
          ? wrapA(an - ap) * dir < 0
          : an !== null
            ? wrapA(an - th) * dir < 0
            : ap !== null
              ? wrapA(ap - th) * dir > 0
              : false;
      if (wrong) lay(P, q0, c3, U, Vv, ux, true);
    };
    /** A ring's lid flat at its pole, its edge for the ring's first panel toward that panel. */
    const layLid = (r: Ring, s: 1 | -1, thetaOf: ReadonlyMap<string, number>) => {
      const lid = r.lid;
      const P = lid ? panelByKey.get(lid.key) : undefined;
      if (!lid || !P || !bodyKey(lid.key) || placed[P.offset]) return;
      const cen = centroid2(ringVs(P));
      const p0 = r.pieces.find((k) => lid.edgeFor.has(k) && thetaOf.has(k));
      const e0 = p0 ? lid.edgeFor.get(p0) : undefined;
      const m0 = e0 ? mid2Of(e0) : null;
      if (!p0 || !m0) return;
      const th0 = thetaOf.get(p0)!;
      const U: Vec3 = [Math.cos(th0), Math.sin(th0), 0];
      const Vv = V3.cross([0, 0, s], U);
      const c3: Vec3 = [0, 0, s * c];
      // Face out or face down: whichever lays every lid edge toward the panel it is sewn to.
      const miss = (mirror: boolean) => {
        lay(P, cen, c3, U, Vv, unit2(cen, m0), mirror);
        let t = 0;
        for (const [k, e] of lid.edgeFor) {
          const az = thetaOf.has(k) ? azOf(e) : null;
          if (az !== null) t += Math.abs(wrapA(az - thetaOf.get(k)!));
        }
        return t;
      };
      const m0f = miss(false);
      const m0t = miss(true);
      if (m0f <= m0t) lay(P, cen, c3, U, Vv, unit2(cen, m0), false);
    };
    if (useRings) {
      const thetaA = new Map<string, number>();
      const nA = ringA.pieces.length;
      ringA.pieces.forEach((k, i) => thetaA.set(k, (TAU * (i + 0.5)) / nA));
      ringA.pieces.forEach((k, i) => layRingPanel(ringA, i, thetaA.get(k)!, 1, 1));
      layLid(ringA, 1, thetaA);
      if (ringB) {
        const thetaB = new Map<string, number>();
        ringB.pieces.forEach((k, i) => {
          const mate = ringB.mate?.panel.get(k);
          const th = mate !== undefined ? thetaA.get(mate) : undefined;
          thetaB.set(k, th ?? (TAU * (i + 0.5)) / ringB.pieces.length);
        });
        const d01 = wrapA(thetaB.get(ringB.pieces[1])! - thetaB.get(ringB.pieces[0])!);
        const dir: 1 | -1 = d01 < 0 ? -1 : 1;
        ringB.pieces.forEach((k, i) => layRingPanel(ringB, i, thetaB.get(k)!, -1, dir));
        layLid(ringB, -1, thetaB);
      }
    } else {
      // The biggest panel on the front, upright, face out — its sewn part centred when it runs on
      // into a flap: the walk over the shape then carries the flap over the rim onto the other face.
      const q0: Pt2 = flap
        ? [(flap.x0 + flap.x1) / 2, (flap.y0 + flap.y1) / 2]
        : centroid2(ringVs(big));
      lay(big, q0, [0, 0, c], [1, 0, 0], [0, 1, 0], [1, 0], false);
      if (flap) {
        const F = flap;
        const flapIdx = proxies.push(ellProxy(4)) - 1;
        for (let i = 0; i < big.count; i++) {
          const v = big.offset + i;
          const x = uv[2 * v];
          const y = uv[2 * v + 1];
          if (x < F.x0 - 5 || x > F.x1 + 5 || y < F.y0 - 5 || y > F.y1 + 5) proxyOf[v] = flapIdx;
        }
        const full = boxOf(big);
        const beyond = Math.max(full.h - F.h, full.w - F.w);
        const note = `its seams hold ${F.w.toFixed(0)} × ${F.h.toFixed(0)} mm of it; the ${beyond.toFixed(0)} mm beyond them, sewn along no edge of its own, hinges where the seams end and folds over the other face as a flap — drawn lying on it, not solved as a face: a reading of where its seams end, not a seam`;
        bagSurfaceRows.push({
          pieceKey: big.key,
          host: second?.key ?? null,
          join: null,
          placed: true,
          note,
        });
        warnings.push(`${big.key}: ${note}`);
      }
    }
    const isBody = (P: Panel | undefined): P is Panel => !!P && P.group === 'BODY';
    const onePiece = (ids: EdgeId[]) => new Set(ids.map(pk)).size === 1;
    const links = G.seams.filter(
      (s) =>
        onePiece(s.a) &&
        onePiece(s.b) &&
        pk(s.a[0]) !== pk(s.b[0]) &&
        isBody(panelByKey.get(pk(s.a[0]))) &&
        isBody(panelByKey.get(pk(s.b[0]))),
    );
    const lenOfSide = (ids: EdgeId[]) =>
      ids.reduce((t, id) => t + (edgeById.get(id)?.lenMm ?? 0), 0);
    const isPlaced = (P: Panel) => !!placed[P.offset];
    /** Walk every reachable unplaced panel onto the shape across its longest seam (`hold`: not yet). */
    const walkAll = (hold: Panel | null) => {
      for (let guard = 0; guard < body.length; guard++) {
        let pick: { s: GroupedSeam; P: Panel; Q: Panel; sp: EdgeId[]; sq: EdgeId[] } | null = null;
        let best = -1;
        for (const s of links) {
          const Pa = panelByKey.get(pk(s.a[0]))!;
          const Pb = panelByKey.get(pk(s.b[0]))!;
          if (Pa === hold || Pb === hold) continue;
          if (isPlaced(Pa) === isPlaced(Pb)) continue;
          const L = Math.max(lenOfSide(s.a), lenOfSide(s.b));
          if (L > best) {
            best = L;
            pick = isPlaced(Pa)
              ? { s, P: Pa, Q: Pb, sp: s.a, sq: s.b }
              : { s, P: Pb, Q: Pa, sp: s.b, sq: s.a };
          }
        }
        if (!pick) break;
        const { P, Q, sp, sq } = pick;
        // The seam's SEWN stretch (a strip round the lower U of a panel that runs on into a flap:
        // sidePath crops a partial to its range), and the placed panel's sewn part — never the flap,
        // folded over the other face by now.
        const A = sidePath(pick.s, sp === pick.s.a ? 'a' : 'b') ?? pathOf(sp);
        const B = sidePath(pick.s, sq === pick.s.a ? 'a' : 'b') ?? pathOf(sq);
        if (!A || !B) {
          links.splice(links.indexOf(pick.s), 1);
          continue;
        }
        const mid3 = centroid3(A.v);
        const F = P === big ? flap : null;
        const cP3 = centroid3(
          F
            ? ringVs(P).filter(
                (v) =>
                  uv[2 * v] >= F.x0 - 5 &&
                  uv[2 * v] <= F.x1 + 5 &&
                  uv[2 * v + 1] >= F.y0 - 5 &&
                  uv[2 * v + 1] <= F.y1 + 5,
              )
            : ringVs(P),
        );
        const out =
          tangentAt(V3.sub(mid3, cP3), mid3) ??
          tangentAt([0, 1, 0], mid3) ??
          tangentAt([1, 0, 0], mid3) ??
          ([1, 0, 0] as Vec3);
        const mid2 = centroid2(B.v);
        const cQ2 = centroid2(ringVs(Q));
        const d2 = Math.max(1, Math.hypot(cQ2[0] - mid2[0], cQ2[1] - mid2[1]));
        const w = walk(mid3, out, d2);
        const cQ3 = w.p;
        const back: Vec3 = [-w.dir[0], -w.dir[1], -w.dir[2]];
        const n2 = nrmAt(cQ3);
        const U = tangentAt(back, cQ3) ?? back;
        const Vv = V3.cross(n2, U);
        const ux = ((): Pt2 => {
          const l = Math.hypot(mid2[0] - cQ2[0], mid2[1] - cQ2[1]);
          return l > 1e-6 ? [(mid2[0] - cQ2[0]) / l, (mid2[1] - cQ2[1]) / l] : [1, 0];
        })();
        // Face out or face down: whichever lays the seam's two ends on the partner's ends.
        const a0 = getPos(A.v[0]);
        const a1 = getPos(A.v[A.v.length - 1]);
        const endsCost = (mirror: boolean) => {
          const uy: Pt2 = mirror ? [ux[1], -ux[0]] : [-ux[1], ux[0]];
          const at = (v: number) => {
            const dx = uv[2 * v] - cQ2[0];
            const dy = uv[2 * v + 1] - cQ2[1];
            return landing(cQ3, U, Vv, dx * ux[0] + dy * ux[1], dx * uy[0] + dy * uy[1]);
          };
          const b0 = at(B.v[0]);
          const b1 = at(B.v[B.v.length - 1]);
          return Math.min(
            V3.len(V3.sub(b0, a0)) + V3.len(V3.sub(b1, a1)),
            V3.len(V3.sub(b0, a1)) + V3.len(V3.sub(b1, a0)),
          );
        };
        lay(Q, cQ2, cQ3, U, Vv, ux, endsCost(true) < endsCost(false));
        if (opt.debug)
          warnings.push(
            `debug: bag walk ${Q.key} from ${P.key} · seam mid ${mid3.map((x) => x.toFixed(0)).join(',')} · ${d2.toFixed(0)} mm out → ${cQ3.map((x) => x.toFixed(0)).join(',')} · U ${U.map((x) => x.toFixed(2)).join(',')} · ux ${ux.map((x) => x.toFixed(2)).join(',')} · mirrored ${Q.mirrored}`,
          );
      }
    };
    // The other face of a two-faced shape (a pouch, a cover) goes straight onto the back, centred,
    // once the strips have been walked from the front: a walk across a U-shaped seam starts at
    // that seam's centroid, a point inside the shape, and on a short pouch landed the face over
    // the top rim. Face out or its drawn face inward — the parity whose seam directions, the ones
    // graphWork will enforce from the mirrored flags (single-piece sides: face-up pieces run
    // opposite ways; composite sides: by the smaller gap), put the seam ends nearest over ALL its
    // seams to panels already placed. No such seam: nothing to decide — left to the walk.
    const backFace = twoFaces && !useRings && second ? second : null;
    walkAll(backFace);
    if (backFace && !isPlaced(backFace)) {
      const S2 = backFace;
      const q2 = centroid2(ringVs(S2));
      const incident = G.seams
        .map((sm) => {
          const A = [...new Set(sm.a.map(pk))];
          const B = [...new Set(sm.b.map(pk))];
          const mineA = A.length === 1 && A[0] === S2.key;
          const mineB = B.length === 1 && B[0] === S2.key;
          if (mineA === mineB) return null;
          const other = mineA ? B : A;
          if (other.includes(S2.key) || !other.every((k) => isPlaced(panelByKey.get(k)!)))
            return null;
          return { sm, mine: mineA ? ('a' as const) : ('b' as const), single: other.length === 1 };
        })
        .filter((x): x is NonNullable<typeof x> => !!x);
      const d3 = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      const costOf = (faceIn: boolean) => {
        lay(S2, q2, [0, 0, -c], [faceIn ? 1 : -1, 0, 0], [0, 1, 0], [1, 0], false);
        // Drawn face inward: its edges run the FRONT's way round the rim — sewn as a face-down
        // piece (graphWork reads the seam direction from this flag).
        S2.mirrored = faceIn;
        let t = 0;
        for (const { sm, mine, single } of incident) {
          const A = sidePath(sm, mine);
          const B = sidePath(sm, mine === 'a' ? 'b' : 'a');
          if (!A || !B) continue;
          const a0 = getPos(A.v[0]);
          const a1 = getPos(A.v[A.v.length - 1]);
          const b0 = getPos(B.v[0]);
          const b1 = getPos(B.v[B.v.length - 1]);
          const straight = d3(a0, b0) + d3(a1, b1);
          const crossed = d3(a0, b1) + d3(a1, b0);
          if (!single) {
            t += Math.min(straight, crossed);
            continue;
          }
          const otherM = panelByKey.get(pk((mine === 'a' ? sm.b : sm.a)[0]))?.mirrored ?? false;
          t += otherM !== faceIn ? straight : crossed;
        }
        return t;
      };
      if (incident.length) {
        const cOut = costOf(false);
        const cIn = costOf(true);
        if (cOut <= cIn) costOf(false);
        warnings.push(
          `${S2.key}: the other face, on the back, ${cOut <= cIn ? 'face out' : 'its drawn face inward'} — its ${incident.length} seam${incident.length > 1 ? 's' : ''} to the placed panels meet end to end that way (${cOut.toFixed(0)} vs ${cIn.toFixed(0)} mm the other way)`,
        );
        if (opt.debug) {
          const bb = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
          for (let i = 0; i < S2.count; i++)
            for (let k = 0; k < 3; k++) {
              bb[2 * k] = Math.min(bb[2 * k], pos[3 * (S2.offset + i) + k]);
              bb[2 * k + 1] = Math.max(bb[2 * k + 1], pos[3 * (S2.offset + i) + k]);
            }
          warnings.push(
            `debug: bag back face ${S2.key} laid at ${bb.map((x) => x.toFixed(0)).join(' ')} · shape ${a.toFixed(0)} ${b.toFixed(0)} ${c.toFixed(0)}`,
          );
        }
        walkAll(null);
      } else
        warnings.push(
          `${S2.key}: the other face — no seam to a placed panel says which way it faces; not laid on the back, left to the walk`,
        );
    }
    // A STRIP the order sews onto a panel with no edge of it matching an edge of that panel (a
    // handle, a strap — 11.10 corpus: SS26-015's 30 × 976 straps on 580 × 980 panels, laid flat
    // beside the bag): laid along the host's side of matching extent, on the host's face, 3 mm
    // out, held by the shape — a reading of the order, said in words; no seam is drawn.
    const strapIdx = proxies.push(ellProxy(3)) - 1;
    const sidesTaken = new Map<string, number>();
    for (const P of body) {
      if (isPlaced(P)) continue;
      const bx = boxOf(P);
      const long = Math.max(bx.w, bx.h);
      const short = Math.min(bx.w, bx.h);
      if (long < 3 * short) continue;
      const keys = new Set([P.key, ...P.layers]);
      // Every placed panel the order joins the strip to (across all its joins): the biggest hosts
      // it; all of them are checked for a seam the graph may have missed.
      const hosts: Panel[] = [];
      let host = null as Panel | null;
      let join = '';
      for (const J of declaredJoins ?? []) {
        const mine = J.parts.findIndex((X) => X.some((k) => keys.has(k)));
        if (mine < 0) continue;
        for (const [i, X] of J.parts.entries()) {
          if (i === mine) continue;
          for (const k of X) {
            const H = panelByKey.get(k);
            if (!H || H === P || !isBody(H) || !isPlaced(H)) continue;
            if (!hosts.includes(H)) hosts.push(H);
            if (!host || areaOfP(H) > areaOfP(host)) {
              host = H;
              join = J.label;
            }
          }
        }
      }
      if (!host) continue;
      // «No edge of it matches an edge of the host» — checked, not assumed: every run of the
      // strip's FREE edges (edges no seam took, contiguous along its boundary; its long edges and
      // the free runs of 60 % of its length or more) against every free run of EVERY panel the
      // order joins it to. A pair within 10 % is a plausible seam the graph missed (12.10 review:
      // a composite boundary over a second host as much as one edge of the first): the strip then
      // stays floating, said so, rather than being laid as a strap.
      const taken = new Set(
        G.seams.flatMap((s) => [...s.a, ...s.b].flatMap((id) => edgeIdsOf(id))),
      );
      /** Every contiguous run of a panel's free edges (one or more edges), with its length. */
      const freeRuns = (X: Panel, minMm: number) => {
        const E = X.geom.edges.filter((e) => e.kind === 'edge');
        const nE = E.length;
        const out: { run: string; mm: number }[] = [];
        for (let s0 = 0; s0 < nE; s0++) {
          if (taken.has(E[s0].id)) continue;
          let sum = 0;
          const ks: number[] = [];
          for (let k = 0; k < nE; k++) {
            const i = (s0 + k) % nE;
            if (taken.has(E[i].id) || (k > 0 && i === s0)) break;
            sum += E[i].lenMm;
            ks.push(E[i].k);
            if (sum >= minMm) out.push({ run: ks.map((x) => `edge ${x + 1}`).join('+'), mm: sum });
          }
        }
        return out;
      };
      const mineRuns = [
        ...P.geom.edges
          .filter((e) => e.kind === 'edge' && e.lenMm >= 0.6 * long)
          .map((e) => ({ run: `edge ${e.k + 1}`, mm: e.lenMm })),
        ...freeRuns(P, 0.6 * long),
      ];
      let match: { host: Panel; run: string; mm: number; mine: string; mineMm: number } | null =
        null;
      for (const H of hosts) {
        if (match) break;
        for (const h of freeRuns(H, 0)) {
          const m = mineRuns.find((r) => Math.abs(h.mm - r.mm) <= 0.1 * r.mm);
          if (m) {
            match = { host: H, run: h.run, mm: h.mm, mine: m.run, mineMm: m.mm };
            break;
          }
        }
      }
      if (match) {
        warnings.push(
          `${P.key}: a strip ${Math.round(long)} × ${Math.round(short)} mm the order sews onto ${host.key} («${join}») — its ${match.mine} (${Math.round(match.mineMm)} mm) could meet ${match.host.key}'s free ${match.run} (${Math.round(match.mm)} mm): a seam the graph has not got, not a strap; left apart`,
        );
        continue;
      }
      const hb = boxOf(host);
      const vertical = Math.abs(long - hb.h) <= Math.abs(long - hb.w);
      const n = sidesTaken.get(host.key) ?? 0;
      sidesTaken.set(host.key, n + 1);
      const first = n % 2 === 0;
      // The strip's frame → the host's: its long axis along the side, 5 mm in from it, centred.
      const inset = 5 + short / 2;
      const cx = vertical ? (first ? hb.x0 + inset : hb.x1 - inset) : (hb.x0 + hb.x1) / 2;
      const cy = vertical ? (hb.y0 + hb.y1) / 2 : first ? hb.y0 + inset : hb.y1 - inset;
      const sx = (bx.x0 + bx.x1) / 2;
      const sy = (bx.y0 + bx.y1) / 2;
      const rot = vertical !== bx.h >= bx.w;
      const toHost = (x: number, y: number): Pt2 => {
        const dx = x - sx;
        const dy = y - sy;
        return rot ? [cx - dy, cy + dx] : [cx + dx, cy + dy];
      };
      // Onto the host's solved face: the host triangle under the point (the nearest when it lies
      // outside), barycentric, then 3 mm out along the shape's normal.
      const T = host.mesh.tris;
      const H0 = host;
      const hv = (t: number, j: number) => H0.offset + T[t + j];
      // Every vertex must find a non-degenerate host triangle (no mesh → no place, said so).
      const landed: Vec3[] = [];
      let lost = false;
      for (let i = 0; i < P.count && !lost; i++) {
        const v = P.offset + i;
        const p = toHost(uv[2 * v], uv[2 * v + 1]);
        let bt = 0;
        let bw: [number, number, number] = [1, 0, 0];
        let bd = Infinity;
        for (let t = 0; t + 2 < T.length; t += 3) {
          const A = [uv[2 * hv(t, 0)], uv[2 * hv(t, 0) + 1]];
          const B = [uv[2 * hv(t, 1)], uv[2 * hv(t, 1) + 1]];
          const C = [uv[2 * hv(t, 2)], uv[2 * hv(t, 2) + 1]];
          const det = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
          if (Math.abs(det) < 1e-9) continue;
          let u = ((B[1] - C[1]) * (p[0] - C[0]) + (C[0] - B[0]) * (p[1] - C[1])) / det;
          let w = ((C[1] - A[1]) * (p[0] - C[0]) + (A[0] - C[0]) * (p[1] - C[1])) / det;
          let z = 1 - u - w;
          const out = Math.max(0, -u) + Math.max(0, -w) + Math.max(0, -z);
          if (out < bd) {
            u = Math.max(0, u);
            w = Math.max(0, w);
            z = Math.max(0, z);
            const s = u + w + z || 1;
            bd = out;
            bt = t;
            bw = [u / s, w / s, z / s];
            if (out === 0) break;
          }
        }
        if (!Number.isFinite(bd)) {
          lost = true;
          break;
        }
        const X: Vec3 = [0, 0, 0];
        for (let j = 0; j < 3; j++) {
          const q = getPos(hv(bt, j));
          for (let d = 0; d < 3; d++) X[d] += bw[j] * q[d];
        }
        const nn = nrmAt(X);
        landed.push([X[0] + 3 * nn[0], X[1] + 3 * nn[1], X[2] + 3 * nn[2]]);
      }
      if (lost || landed.length !== P.count) {
        const note = `a strip the order sews onto ${host.key} («${join}»), but the panel's mesh has no triangle to carry it — not placed`;
        bagSurfaceRows.push({ pieceKey: P.key, host: host.key, join, placed: false, note });
        warnings.push(`${P.key}: ${note}`);
        continue;
      }
      for (let i = 0; i < P.count; i++) {
        const v = P.offset + i;
        setPos(v, landed[i]);
        proxyOf[v] = strapIdx;
        placed[v] = 1;
      }
      P.mirrored = false;
      const side = vertical ? (first ? 'left' : 'right') : first ? 'lower' : 'upper';
      const note = `a strip ${Math.round(long)} × ${Math.round(short)} mm${P.layers.length ? ` (${P.layers.length + 1} plies)` : ''} the order sews onto ${host.key} («${join}») with no edge of it matching an edge of the panel — laid along the panel's ${side} side on its face (a strap, a handle): a reading of the order, not a seam`;
      bagSurfaceRows.push({ pieceKey: P.key, host: host.key, join, placed: true, note });
      warnings.push(`${P.key}: ${note}`);
    }
    const placedN = body.filter(isPlaced).length;
    warnings.push(
      `not a garment: ${placedN} of ${body.length} panels wrapped round ${shapeWords}, placed ${useRings ? "round the axis by the rings' order" : `by their seams from ${big.key}`}${placedN < body.length ? ` · ${body.length - placedN} no seam reaches, laid flat beside` : ''}`,
    );
  }

  // The two far ends of the body ring when girth components continue the main strip.
  const ringEnds: { left: Panel[] | null; right: Panel[] | null } = { left: null, right: null };
  if (!bag && body.length && bodyChart) {
    const comps = bodyChart.components.map((c) => c.keys.map((k) => panelByKey.get(k)!));
    // Later components: height from their seams to what is already aligned.
    const aligned = new Set(comps[0].map((P) => P.key));
    for (let ci = 1; ci < comps.length; ci++) {
      const own = new Set(comps[ci].map((P) => P.key));
      let sum = 0;
      let n = 0;
      for (const s of G.seams) {
        const ka = pk(s.a[0]);
        const kb = pk(s.b[0]);
        const [mine, theirs] =
          own.has(ka) && aligned.has(kb)
            ? [s.a, s.b]
            : own.has(kb) && aligned.has(ka)
              ? [s.b, s.a]
              : [null, null];
        if (!mine || !theirs) continue;
        const pm = pathOf(mine);
        const pt = pathOf(theirs);
        if (!pm || !pt) continue;
        const mv = [...pm.v].reduce((t, v) => t + cuv[2 * v + 1], 0) / pm.v.length;
        const tv = [...pt.v].reduce((t, v) => t + cuv[2 * v + 1], 0) / pt.v.length;
        sum += tv - mv;
        n++;
      }
      if (n) {
        const dy = sum / n;
        for (const P of comps[ci])
          for (let i = 0; i < P.count; i++) cuv[2 * (P.offset + i) + 1] += dy;
        for (const P of comps[ci]) aligned.add(P.key);
      }
    }
    const main = comps[0];
    const [lo, hi] = vRange(body.filter((P) => aligned.has(P.key)));
    const [mlo] = vRange(main);
    vLo = mlo;
    const H = hi - lo;
    // Armhole level: the lowest level (above 40 % of the height) where the main strip has holes.
    vArm = hi - 0.27 * H;
    for (let v = mlo + 0.4 * H; v < hi; v += 10) {
      if (
        coverage(crossings(main, v)) < 0.86 &&
        coverage(crossings(main, v + 10)) < 0.86 &&
        coverage(crossings(main, v + 20)) < 0.86
      ) {
        vArm = v;
        break;
      }
    }
    // Shoulder line: the seams that go over the top (body seams not used by the chart, high up).
    const over: number[] = [];
    for (const s of G.seams) {
      if (!aligned.has(pk(s.a[0])) || !aligned.has(pk(s.b[0]))) continue;
      if (bodyChart.used.has(`${s.seam.a}~${s.seam.b}`)) continue;
      const pa = pathOf(s.a);
      if (!pa) continue;
      const mv = [...pa.v].reduce((t, v) => t + cuv[2 * v + 1], 0) / pa.v.length;
      if (mv > vArm) over.push(mv);
    }
    vSh = over.length ? over.reduce((x, y) => x + y, 0) / over.length : hi - 0.03 * H;
    vSh = Math.max(vSh, vArm + 60);
    // Girth per level: every aligned component's extent; above the armhole the armhole girth.
    const levels: number[] = [];
    for (let v = mlo - 30; v <= vSh + 20; v += 10) levels.push(v);
    const girth = levels.map((v) => {
      const vv = Math.min(v, vArm);
      let w = 0;
      for (const c of comps) {
        if (!c.every((P) => aligned.has(P.key))) continue;
        const e = extent(crossings(c, Math.max(vv, mlo + 2)));
        if (e) w += e[1] - e[0];
      }
      return w;
    });
    // Below the level where the strip is whole (curved hems, short side panels), keep that girth.
    {
      const band = levels
        .map((v, i) => [v, girth[i]] as const)
        .filter(([v]) => v >= mlo + 0.1 * H && v <= vArm)
        .map(([, w]) => w)
        .sort((x, y) => x - y);
      const med = band.length ? band[Math.floor(band.length / 2)] : 0;
      const i10 = girth.findIndex((w, i) => levels[i] >= mlo && w >= 0.85 * med);
      if (i10 > 0) for (let i = 0; i < i10; i++) girth[i] = girth[i10];
    }
    // Fill and smooth.
    for (let i = 1; i < girth.length; i++) if (girth[i] <= 0) girth[i] = girth[i - 1];
    for (let i = girth.length - 2; i >= 0; i--) if (girth[i] <= 0) girth[i] = girth[i + 1];
    const sm = girth.map((_, i) => {
      let s = 0;
      let n = 0;
      for (let k = -3; k <= 3; k++) {
        const j = i + k;
        if (j < 0 || j >= girth.length) continue;
        s += girth[j];
        n++;
      }
      return s / n;
    });
    const iArm = Math.max(
      0,
      levels.findIndex((v) => v >= vArm),
    );
    const aArm = (sm[iArm] * (1 - EPS_WRAP)) / ellPerimFactor;
    levels.forEach((v, i) => {
      let a = (sm[i] * (1 - EPS_WRAP)) / ellPerimFactor;
      let b = a / ASPECT;
      if (v > vArm) {
        // Above the armhole the paper is not forced onto a dome (a doubly curved surface crumples
        // paper): the cylinder goes on, the shoulder seams tilt the panels in like a roof.
        a = aArm;
        b = aArm / ASPECT;
      }
      torso.push({ y: v, a, b, tab: arcTable(a, b) });
    });
    proxyReport.push({
      group: 'BODY',
      kind: 'torso',
      profile: torso.map((L) => [L.y - vLo, L.a, L.b]),
    });

    // The torso proxy.
    // Neck: a short cylinder on top of the dome keeps the shoulders' paper from folding inward.
    const rNeck = Math.max(45, 0.42 * aArm);
    const tProxy: Proxy = {
      push(p, i) {
        const y = p[3 * i + 1];
        if (y > vSh - 40 && y < vSh + 220) {
          const x = p[3 * i];
          const z = p[3 * i + 2];
          const d = Math.hypot(x, z);
          const R = Math.min(rNeck, neckGirthR) + CLEAR - 1;
          if (d < R && d > 1e-6) {
            p[3 * i] = (x / d) * R;
            p[3 * i + 2] = (z / d) * R;
          }
        }
        if (y < torso[0].y || y > vArm + 0.35 * (vSh - vArm)) return;
        const L = torsoAt(y)!;
        const a = L.a * PROXY_K;
        const b = L.b * PROXY_K;
        const x = p[3 * i];
        const z = p[3 * i + 2];
        const q = (x / a) ** 2 + (z / b) ** 2;
        if (q >= 1 || q < 1e-9) return;
        const f = 1 / Math.sqrt(q);
        p[3 * i] = x * f;
        p[3 * i + 2] = z * f;
      },
      pull(p, i, k) {
        const y = p[3 * i + 1];
        if (y < torso[0].y || y > vArm) return;
        const L = torsoAt(y)!;
        const a = L.a + CLEAR;
        const b = L.b + CLEAR;
        const x = p[3 * i];
        const z = p[3 * i + 2];
        const q = (x / a) ** 2 + (z / b) ** 2;
        if (q <= 1) return;
        const f = 1 / Math.sqrt(q);
        p[3 * i] += (x * f - x) * k;
        p[3 * i + 2] += (z * f - z) * k;
      },
    };
    const tIdx = proxies.push(tProxy) - 1;

    // Wrap: main strip centred on its root at the back; other components where their seams want.
    const totalW = (v: number) => (torsoAt(Math.min(v, vArm))!.a * ellPerimFactor) / (1 - EPS_WRAP);
    const rootP = panelByKey.get(bodyChart.components[0].root)!;
    let uRef = 0;
    {
      let x0 = Infinity;
      let x1 = -Infinity;
      for (let r = 0; r < rootP.nb; r++) {
        const x = cuv[2 * (rootP.offset + r)];
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
      }
      uRef = (x0 + x1) / 2;
    }
    const thetaBack = rootP.role === 'front' ? 0 : Math.PI;
    if (!body.some((P) => P.role === 'back' || P.role === 'front'))
      warnings.push(
        'front unknown — no piece is named front or back; the biggest piece is put at the back',
      );
    const wrapComp = (list: Panel[], theta0: number, uC: number, layer: number) => {
      for (const P of list) {
        // Above the armhole each piece keeps its own width (arc length) around its centre: the dome
        // is smaller than the strip there, the armholes absorb the difference, the paper does not.
        let ux0 = Infinity;
        let ux1 = -Infinity;
        for (let r = 0; r < P.nb; r++) {
          ux0 = Math.min(ux0, cuv[2 * (P.offset + r)]);
          ux1 = Math.max(ux1, cuv[2 * (P.offset + r)]);
        }
        const uP = (ux0 + ux1) / 2;
        const thP = theta0 + (TAU * (uP - uC)) / totalW(vArm);
        for (let i = 0; i < P.count; i++) {
          const v = P.offset + i;
          const u = cuv[2 * v];
          const y = cuv[2 * v + 1];
          const yy = Math.max(torso[0].y, Math.min(y, vSh + 200));
          let th: number;
          if (y <= vArm) th = theta0 + (TAU * (u - uC)) / totalW(y);
          else {
            const per = torsoAt(yy)!.tab[torsoAt(yy)!.tab.length - 1];
            th = thP + (TAU * (u - uP) * (1 - EPS_WRAP)) / per;
          }
          // A placket without a fold is lifted 2 mm so it reads as a strip on the front; a folded
          // one has real plies instead (their offsets below).
          setPos(
            v,
            torsoPoint(
              th,
              yy,
              CLEAR +
                claimedLayer([P.key], layer + (P.role === 'placket' && !P.fold ? 2 : 0)) +
                (P.fold ? P.fold.off[i] : 0),
            ),
          );
          if (y > vSh + 10) pos[3 * v + 1] = y; // above the shoulder line: keep the height
          proxyOf[v] = tIdx;
          placed[v] = 1;
        }
        if (P.fold) P.fold.plyDone = true;
      }
    };
    wrapComp(main, thetaBack, uRef, 0);
    // Later components. Girth pieces (a front chain the side seam does not join) continue the main
    // strip at the end their hand says; the rest (a yoke) go where their seams want them, on the side
    // their role says (back / front).
    const [mlo2, mhi2] = vRange(main);
    const mainU = (() => {
      const e = extent(crossings(main, mlo2 + 0.45 * (Math.min(vArm, mhi2) - mlo2)));
      return e ?? [uRef - 100, uRef + 100];
    })();
    const vMid = mlo2 + 0.45 * (Math.min(vArm, mhi2) - mlo2);
    const thMain = (u: number) => thetaBack + (TAU * (u - uRef)) / totalW(vMid);
    let endL = Math.min(thMain(mainU[0]), thMain(mainU[1]));
    let endR = Math.max(thMain(mainU[0]), thMain(mainU[1]));
    let flip = 0;
    for (let ci = 1; ci < comps.length; ci++) {
      const list = comps[ci];
      if (!list.every((P) => aligned.has(P.key))) continue;
      let x0 = Infinity;
      let x1 = -Infinity;
      for (const P of list)
        for (let r = 0; r < P.nb; r++) {
          x0 = Math.min(x0, cuv[2 * (P.offset + r)]);
          x1 = Math.max(x1, cuv[2 * (P.offset + r)]);
        }
      const uC = (x0 + x1) / 2;
      const [clo, chi] = vRange(list);
      const below = Math.max(0, Math.min(chi, vArm) - Math.max(clo, mlo2));
      const W = totalW(vMid);
      if (below > 0.4 * (chi - clo)) {
        let hand = 0;
        for (const P of list) hand += P.geom.hand === 'L' ? 1 : P.geom.hand === 'R' ? -1 : 0;
        const goLeft = hand > 0 || (hand === 0 && flip++ % 2 === 1);
        const gap = (TAU * 15) / W;
        const span = (TAU * (x1 - x0)) / W;
        // Face-up at the back: +u runs toward the doll's right (θ grows), so a left chain ends at endL.
        if (goLeft) {
          wrapComp(list, endL - gap - span / 2, uC, 0);
          endL -= gap + span;
          ringEnds.left = list;
        } else {
          wrapComp(list, endR + gap + span / 2, uC, 0);
          endR += gap + span;
          ringEnds.right = list;
        }
        continue;
      }
      const keys = new Set(list.map((P) => P.key));
      const links = G.seams.filter((s) => keys.has(pk(s.a[0])) !== keys.has(pk(s.b[0])));
      const roleBack = list.some((P) => P.role === 'back' || P.role === 'yoke');
      const roleFront = list.some((P) => P.role === 'front' || P.role === 'placket');
      const centre = roleBack ? thetaBack : roleFront ? thetaBack + Math.PI : null;
      // The component may be drawn the other way round from the main strip: try it mirrored too.
      const remirror = () => {
        for (const P of list) {
          P.mirrored = !P.mirrored;
          for (let i = 0; i < P.count; i++)
            cuv[2 * (P.offset + i)] = 2 * uC - cuv[2 * (P.offset + i)];
        }
      };
      let best = centre ?? 0;
      let bestMir = false;
      let bd = Infinity;
      const trials = [false, true];
      for (const mir of trials) {
        if (mir) remirror();
        for (let k = 0; k < (centre === null ? 24 : 1); k++) {
          void 0;
          // A back / yoke piece sits at the centre back, a front piece at the centre front: its
          // seams then say whether it is sewn the right way round (crossing seams are reported).
          const th = centre === null ? (TAU * k) / 24 : centre;
          wrapComp(list, th, uC, 3);
          let d = 0;
          for (const s of links) {
            const A = pathOf(s.a);
            const B = pathOf(s.b);
            if (!A || !B) continue;
            const same =
              (panelByKey.get(pk(s.a[0]))?.mirrored ?? false) !==
              (panelByKey.get(pk(s.b[0]))?.mirrored ?? false);
            d += meanDist(A, B, same, [0, 1], [0, 1]);
          }
          if (d < bd - 1e-6) [best, bestMir, bd] = [th, mir, d];
        }
      }
      if (trials.length === 2 && !bestMir) remirror();
      wrapComp(list, best, uC, 3);
      if (opt.debug) {
        const vs = list.flatMap((P) => Array.from({ length: P.count }, (_, i) => P.offset + i));
        const c = [0, 1, 2].map((q) => vs.reduce((t, v) => t + pos[3 * v + q], 0) / vs.length);
        warnings.push(
          `debug: secondary ${list.map((P) => P.key).join('+')} at θ ${((best * 180) / Math.PI).toFixed(0)}° centroid ${c.map((x) => x.toFixed(0)).join(',')} chart v ${clo.toFixed(0)}..${chi.toFixed(0)}`,
        );
      }
    }
    for (const P of body) {
      if (placed[P.offset]) continue;
      warnings.push(`${P.key} is in the body group but not sewn to it — placed apart`);
      P.group = 'FLOAT';
      for (let i = 0; i < P.count; i++) groupOfV[P.offset + i] = 'FLOAT';
    }
  }

  /** Vertices of the crotch seams (both sides): held on the body's mid-plane x = 0. */
  const midPlane = new Set<number>();
  // Legs: two tubes under the hip, inseam inward.
  const legInfo: { gid: DollGroupId; s: number; x: number; R: number }[] = [];
  for (const gid of ['LEG_L', 'LEG_R'] as DollGroupId[]) {
    const list = groups.get(gid);
    const ch = charts.get(gid);
    if (!list || !ch) continue;
    const s = gid === 'LEG_L' ? 1 : -1;
    const main = ch.components[0].keys.map((k) => panelByKey.get(k)!);
    const [lo, hi] = vRange(main);
    const H = hi - lo;
    // The crotch level: the crotch points of the leg panels (the rises' low ends, legs.ts) as laid
    // in the chart; a guess at 27 % of the height below the top only when no panel reads as a leg.
    const crotchVs = main.flatMap((P) => {
      const L = legPanelsOf.get(P.key);
      const pl = ch.place.get(P.key);
      if (!L || !pl) return [];
      const [a0, a1] = [L.rise.pts[0], L.rise.pts[L.rise.pts.length - 1]];
      return [toChart(pl, a0[1] < a1[1] ? a0 : a1)[1]];
    });
    const vCr = crotchVs.length
      ? crotchVs.reduce((t, x) => t + x, 0) / crotchVs.length
      : hi - 0.27 * H;
    const W = widthTable(main, lo, hi, 300);
    const Rcr = (W(vCr - 40) * (1 - EPS_WRAP)) / TAU;
    /**
     * The leg tube's cross-section at chart level y: its girth is the cloth's width there (W), its
     * shape an ellipse that is round under the crotch and flattens side-to-side toward the hem
     * (a/b → 1.5) — no gravity here, so this stands in for the fall of a wide leg: the cloth hangs
     * flat, not as a pipe, and the silhouette reads as the pattern widens.
     */
    const legAxes = (y: number) => {
      const per = (W(Math.max(lo, Math.min(vCr, y))) * (1 - EPS_WRAP)) / 1;
      const f0 = vCr > lo ? Math.max(0, Math.min(1, (vCr - y) / (vCr - lo))) : 0;
      const A = 1 + 0.5 * f0 * f0 * (3 - 2 * f0);
      const b = per / (Math.PI * (3 * (A + 1) - Math.sqrt((3 * A + 1) * (A + 3))));
      return { a: A * b, b };
    };
    const xAxis = s * (Rcr + 12);
    // Inseam: the chart seam between the first two pieces.
    let uRef = 0;
    // (a composite laid part by part is used as `id@k`: its seam is the id)
    const used = [...ch.used].map((id) =>
      id.includes('@') ? id.slice(0, id.lastIndexOf('@')) : id,
    )[0];
    const us = used ? G.seams.find((x) => `${x.seam.a}~${x.seam.b}` === used) : undefined;
    const up = us ? pathOf(us.a) : null;
    const eEnds = extent(crossings(main, vCr - 40));
    let endsInside = false;
    if (up) uRef = [...up.v].reduce((t, v) => t + cuv[2 * v], 0) / up.v.length;
    else uRef = eEnds ? eEnds[0] : 0;
    // The inseam is the side the rise seams (left leg ↔ right leg) start from: when they sit at the
    // strip's ends rather than at the chart seam, the strip's ends meet on the inside.
    {
      const keys = new Set(main.map((P) => P.key));
      const riseU: number[] = [];
      for (const sm of G.seams) {
        const ga = panelByKey.get(pk(sm.a[0]))?.group;
        const gb = panelByKey.get(pk(sm.b[0]))?.group;
        if (!((ga === 'LEG_L' && gb === 'LEG_R') || (ga === 'LEG_R' && gb === 'LEG_L'))) continue;
        // Only the rises themselves (the crotch running on up a yoke starts nowhere near it).
        // (a composite crotch — the rise running on up a yoke — counts by its rise edge)
        const riseOf = (ids: EdgeId[]) =>
          ids.find((id) => legPanelsOf.get(pk(id))?.rise.id === id) ?? null;
        if (legPanelsOf.size && !(riseOf(sm.a) && riseOf(sm.b))) continue;
        for (const side0 of [sm.a, sm.b]) {
          const side = legPanelsOf.size ? [riseOf(side0)!] : side0;
          if (keys.has(pk(side[0]))) {
            const P0 = pathOf(side);
            if (P0) {
              // The rise's crotch end (its lowest point) is where the inseam starts.
              let low = P0.v[0];
              for (const v of P0.v) if (cuv[2 * v + 1] < cuv[2 * low + 1]) low = v;
              riseU.push(cuv[2 * low]);
            }
          }
        }
      }
      if (riseU.length && eEnds) {
        let vote = 0;
        for (const ru of riseU)
          vote +=
            Math.min(Math.abs(ru - eEnds[0]), Math.abs(ru - eEnds[1])) < Math.abs(ru - uRef)
              ? 1
              : -1;
        if (vote > 0) {
          uRef = eEnds[0];
          endsInside = true;
        }
      }
      if (opt.debug)
        warnings.push(
          `debug: ${gid} inseam uRef ${uRef.toFixed(0)} ends ${eEnds?.map((x) => x.toFixed(0)).join('..')} rise u ${riseU.map((x) => x.toFixed(0)).join(',')} chart seam ${used ?? '-'}`,
        );
    }
    // The waist FOLDED (N9, 06-TROUSERS-SHAPE.md): each panel's top edges (both ends within the top
    // 12 % of its height; never its rise / inseam / outseam) walked as one path; the pleats and
    // darts on it — by evidence alone (foldEvidence) — are formed as constraints (formFolds), and
    // their intake comes off the width the pelvis guide is sized by at the top.
    let waistTopMm = 0;
    let waistFoldMm = 0;
    const foldWords: string[] = [];
    // Edges a graph seam sews INSIDE the legs / body (a yoke onto the back, a panel to a panel) are
    // structure, not the waist: the waist is the FREE run along the top.
    const sewnInside = new Set<EdgeId>();
    for (const sm of G.seams) {
      const ga = panelByKey.get(pk(sm.a[0]))?.group;
      const gb = panelByKey.get(pk(sm.b[0]))?.group;
      const inside = (g?: DollGroupId) => g === 'LEG_L' || g === 'LEG_R' || g === 'BODY';
      if (inside(ga) && inside(gb)) for (const id of [...sm.a, ...sm.b]) sewnInside.add(id);
    }
    for (const P of list) {
      const n = P.geom.rs.length;
      const vOf = (rsI: number) => {
        const r = P.ringPos.get(((rsI % n) + n) % n);
        return r === undefined ? NaN : cuv[2 * (P.offset + r) + 1];
      };
      let pLo = Infinity;
      let pHi = -Infinity;
      for (let r = 0; r < P.nb; r++) {
        const y = cuv[2 * (P.offset + r) + 1];
        if (y < pLo) pLo = y;
        if (y > pHi) pHi = y;
      }
      // (a yoke is a short piece: its waist edge's slant is a share of a larger height)
      const top = pHi - Math.max(30, 0.12 * (pHi - pLo));
      const L = legPanelsOf.get(P.key);
      const skip = new Set(L ? [L.rise.id, L.inseam.id, L.outseam.id] : []);
      const free = P.geom.edges.filter(
        (e) => e.kind === 'edge' && !skip.has(e.id) && !sewnInside.has(e.id),
      );
      let edges = free.filter((e) => vOf(e.s) >= top && vOf(e.e) >= top);
      // A short piece whose top edge slants more than the band (a curved yoke): its highest free
      // edge by its points' mean height.
      if (!edges.length && free.length) {
        const meanV = (e: Edge) => {
          let t = 0;
          let c = 0;
          for (let i = 0; i <= e.pts.length; i += Math.max(1, Math.floor(e.pts.length / 8))) {
            const v = vOf(e.s + i);
            if (Number.isFinite(v)) {
              t += v;
              c++;
            }
          }
          return c ? t / c : -Infinity;
        };
        const best = [...free].sort((a, b) => meanV(b) - meanV(a))[0];
        if (meanV(best) >= pHi - Math.max(60, 0.25 * (pHi - pLo))) edges = [best];
      }
      if (!edges.length) continue;
      // Chained in ring order from the edge no other selected edge leads into.
      const byStart = new Map(edges.map((e) => [((e.s % n) + n) % n, e]));
      const ends = new Set(edges.map((e) => ((e.e % n) + n) % n));
      let first = edges.find((e) => !ends.has(((e.s % n) + n) % n)) ?? edges[0];
      const chain: Edge[] = [];
      const seen = new Set<string>();
      while (first && !seen.has(first.id)) {
        seen.add(first.id);
        chain.push(first);
        first = byStart.get(((first.e % n) + n) % n)!;
      }
      const path = pathOf(chain.map((e) => e.id));
      if (!path) continue;
      waistTopMm += path.len;
      if (opt.debug)
        warnings.push(
          `debug: ${gid} ${P.key} top run ${path.len.toFixed(0)} mm over ${chain.length} edge${chain.length > 1 ? 's' : ''} (${chain.map((e) => `#${e.k} ${e.lenMm.toFixed(0)}`).join(', ')}) of ${edges.length} at the top · panel v ${pLo.toFixed(0)}..${pHi.toFixed(0)}`,
        );
      const ev = foldEvidence(path);
      if (!ev) continue;
      const taken = formFolds(path, ev);
      waistFoldMm += taken;
      foldWords.push(
        `${P.key}: ${ev.folds.map((f, i) => `${ev.kinds[i]} ${(f[1] - f[0]).toFixed(0)} mm`).join(', ')}`,
      );
    }
    if (foldWords.length)
      warnings.push(
        `${gid}: the waist's intake formed — ${foldWords.join(' · ')} — ${waistFoldMm.toFixed(0)} mm of ${waistTopMm.toFixed(0)} folded closed (the pelvis is sized by the folded waist at the top)`,
      );
    // Pelvis: above the crotch both legs wrap ONE elliptic body (the rise seams meet at x = 0 front
    // and back); below it each leg is its own capsule. Its girth is the chart's width at each level
    // — at the top the FOLDED waist, blended in from the seat (3" over the crotch) up.
    const vSeat = vCr + 76;
    // The top: the waist edges' own length less the intake folded (the chart's extent at its top
    // level is no measure of the waist — a slanted waist leaves only a corner up there).
    const Wtop = waistTopMm > 0 ? waistTopMm - waistFoldMm : W(vSeat);
    const pelvis = (y: number) => {
      const v = Math.min(y + lo, hi);
      const t0 = hi > vSeat ? Math.max(0, Math.min(1, (v - vSeat) / (hi - vSeat))) : 1;
      const t = t0 * t0 * (3 - 2 * t0);
      // This leg's cloth (its chart width) wraps its own half of the pelvis: the half-perimeter IS
      // that width (12.10: it was half of it — a guide half the cloth, the waist crumpled round a
      // cone that ran down to nothing where the slanted waist left the chart's top level empty).
      // Over the seat the chart's extent is no girth (slanted tops laid side by side over-count:
      // a yoke's level read 4 % over the waist and strained it) — seat to folded waist, blended.
      const half = (W(Math.min(v, vSeat)) * (1 - t) + Wtop * t) * (1 - EPS_WRAP);
      // Half-perimeter of an ellipse a = 1.25 b ≈ π/2 (3(a+b) − √((3a+b)(a+3b))).
      const k = (Math.PI / 2) * (3 * 2.25 - Math.sqrt((3 * 1.25 + 1) * (1.25 + 3)));
      const b = (2 * half) / (2 * k);
      return { a: 1.25 * b, b };
    };
    if (opt.debug) {
      const pr = (v: number) => {
        const { a, b } = pelvis(v - lo);
        return `${v.toFixed(0)}: W ${W(v).toFixed(0)} a ${a.toFixed(0)} b ${b.toFixed(0)} perim ${(Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))).toFixed(0)}`;
      };
      warnings.push(
        `debug: ${gid} pelvis · lo ${lo.toFixed(0)} crotch ${vCr.toFixed(0)} seat ${vSeat.toFixed(0)} top ${hi.toFixed(0)} · Wtop ${Wtop.toFixed(0)} (waist edges ${waistTopMm.toFixed(0)} − folds ${waistFoldMm.toFixed(0)}) · ${[vCr + 30, vSeat, (vSeat + hi) / 2, hi].map(pr).join(' · ')}`,
      );
    }
    // The crotch points (each leg panel's rise low end): they rest on the body's crotch, under
    // it — between the front and the back, on the mid-plane — not wherever the shorter rise drags
    // them (SS26-007's front rise pulled the crotch forward, the back's crotch extension bulged).
    const crotchPts = new Set<number>();
    for (const P of list) {
      const L = legPanelsOf.get(P.key);
      if (!L) continue;
      const [r0, r1] = [L.rise.pts[0], L.rise.pts[L.rise.pts.length - 1]];
      const low = r0[1] < r1[1] ? r0 : r1;
      let best = -1;
      let bd = Infinity;
      for (let r = 0; r < P.nb; r++) {
        const v = P.offset + r;
        const d = Math.hypot(uv[2 * v] - low[0], uv[2 * v + 1] - low[1]);
        if (d < bd) [best, bd] = [v, d];
      }
      if (best >= 0 && bd < 15) crotchPts.add(best);
    }
    const legProxy: Proxy = {
      push(p, i) {
        if (crotchPts.has(i)) {
          p[3 * i] *= 0.95;
          p[3 * i + 2] *= 0.95;
        }
        // The crotch seam lies on the body's mid-plane (the centre front / back of a garment
        // symmetric left to right): its two sides are not let buckle sideways apart.
        if (midPlane.has(i)) p[3 * i] = 0;
        const y = p[3 * i + 1] - lo;
        if (y > vCr - lo + 30 && y <= H + 10) {
          // Own half of the pelvis: never past the mid-plane, never inside the ellipse.
          if (p[3 * i] * s < 0) p[3 * i] = 0;
          const { a, b } = pelvis(y);
          const x = p[3 * i];
          const z = p[3 * i + 2];
          // Just above the crotch the body is a saddle the front and the back rise curve under to
          // meet: the guide there is a thin one, growing to full over the rises' curved part
          // (~90 mm) — not a body's depth to cross. (The waist's intake is folded for real now —
          // the 0.8 «darts» allowance the guide used to carry is gone.)
          const up = Math.max(0, Math.min(1, (y - (vCr - lo) - 30) / 90));
          const g = 0.35 + 0.65 * up * up * (3 - 2 * up);
          const q = (x / (a * g)) ** 2 + (z / (b * g)) ** 2;
          if (q >= 1 || q < 1e-9) return;
          const f = 1 / Math.sqrt(q);
          p[3 * i] = x * f;
          p[3 * i + 2] = z * f;
          return;
        }
        if (y > H + 10) return;
        const dx = p[3 * i] - xAxis;
        const dz = p[3 * i + 2];
        const { a, b } = legAxes(y + lo);
        const q = (dx / (a * PROXY_K)) ** 2 + (dz / (b * PROXY_K)) ** 2;
        if (q >= 1 || q < 1e-9) return;
        const f = 1 / Math.sqrt(q);
        p[3 * i] = xAxis + dx * f;
        p[3 * i + 2] = dz * f;
      },
      pull(p, i, k) {
        const y = p[3 * i + 1] - lo;
        if (y > vCr - lo) return;
        const dx = p[3 * i] - xAxis;
        const dz = p[3 * i + 2];
        const { a, b } = legAxes(y + lo);
        const q = (dx / (a + CLEAR)) ** 2 + (dz / (b + CLEAR)) ** 2;
        if (q <= 1 || q < 1e-9) return;
        const f = 1 - (1 - 1 / Math.sqrt(q)) * k;
        p[3 * i] = xAxis + dx * f;
        p[3 * i + 2] = dz * f;
      },
    };
    const pi = proxies.push(legProxy) - 1;
    proxyReport.push({
      group: gid,
      kind: 'capsule',
      profile: [[0, Rcr, Rcr]],
      origin: [xAxis, 0, 0],
      axis: [0, 1, 0],
    });
    const extCache = new Map<number, [number, number] | null>();
    const extAt = (y: number) => {
      const k = Math.round(Math.max(lo + 2, Math.min(hi - 2, y)) / 5);
      if (!extCache.has(k))
        extCache.set(k, extent(crossings(main, k * 5)) as [number, number] | null);
      return extCache.get(k) ?? null;
    };
    for (const P of list) {
      const inMain = main.includes(P);
      for (let i = 0; i < P.count; i++) {
        const v = P.offset + i;
        const u = cuv[2 * v];
        const y = cuv[2 * v + 1];
        const Wv = W(y);
        const ax = legAxes(y);
        const Ra = ax.a + CLEAR + (inMain ? 0 : 3);
        const Rb = ax.b + CLEAR + (inMain ? 0 : 3);
        // When the strip's ends meet on the inside, each height wraps its own extent end to end
        // (the rise runs beyond the crotch-level ends).
        const ext = endsInside && inMain ? extAt(y) : null;
        // (clamped: a crotch point a hair outside this height's extent must not wrap round to
        // the other end — the front crotch point landed at the back, the back one at the front)
        const th = ext
          ? (TAU * Math.max(0, Math.min(ext[1] - ext[0], u - ext[0]))) /
            Math.max(1, ext[1] - ext[0])
          : (TAU * (u - uRef)) / Wv;
        const leg: Vec3 = [xAxis - s * Ra * Math.cos(th), y - lo, s * Rb * Math.sin(th)];
        // Above the crotch: the leg's arc becomes this side's half of the pelvis — the inseam end
        // splits into the front rise (x = 0, z > 0) and the back rise; blended over 60 mm.
        const yy = y - lo;
        const t = Math.max(0, Math.min(1, (yy - (vCr - lo)) / 60));
        if (t > 0) {
          const { a, b } = pelvis(yy);
          // (an extent read end to end is already 0…2π: its far end must stay 2π, not wrap to 0)
          const thn = ext ? th : ((th % TAU) + TAU) % TAU;
          const phi = Math.PI / 2 - thn / 2;
          const pel: Vec3 = [s * a * Math.cos(phi), yy, s * b * Math.sin(phi)];
          setPos(v, [leg[0] + (pel[0] - leg[0]) * t, yy, leg[2] + (pel[2] - leg[2]) * t]);
        } else setPos(v, leg);
        proxyOf[v] = pi;
        placed[v] = 1;
      }
    }
    legInfo.push({ gid, s, x: xAxis, R: Rcr });
    vLo = 0;
  }

  // ── constraints (distances) ─────────────────────────────────────────────────────────────
  const built = new Set<number>();
  const foldContacts: FoldContact[] = [];
  /** The same pairs nearer the crease than the contacts reach: measured for the report, not held. */
  const foldProbes: FoldContact[] = [];
  const buildPanel = (P: Panel) => {
    if (built.has(P.idx)) return;
    built.add(P.idx);
    const T = P.mesh.tris;
    const F = P.fold;
    // Rest lengths come from the piece as cut (a fold is an isometry: the folded footprint has the
    // same lengths, bar rounding).
    const fp = F ? F.flat : P.mesh.pts;
    const edgeOpp = new Map<number, number>();
    const seen = new Set<number>();
    const key = (a: number, b: number) => (a < b ? a * 1e6 + b : b * 1e6 + a);
    const addD = (a: number, b: number) => {
      const k = key(a, b);
      if (seen.has(k)) return;
      seen.add(k);
      const A = P.offset + a;
      const B = P.offset + b;
      di.push(A);
      dj.push(B);
      dr.push(Math.hypot(fp[b][0] - fp[a][0], fp[b][1] - fp[a][1]));
      dk.push(1);
    };
    for (let t = 0; t < T.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = T[t + e];
        const b = T[t + ((e + 1) % 3)];
        const c = T[t + ((e + 2) % 3)];
        addD(a, b);
        const k = key(a, b);
        const o = edgeOpp.get(k);
        if (o === undefined) edgeOpp.set(k, c);
        else if (F && F.creaseEdge.has(k)) {
          // Hinge: across a crease the two faces meet at the folded rest (the ply gap included),
          // as stiff as the paper itself — no ordinary bending there.
          const A = P.offset + o;
          const B = P.offset + c;
          const d2 = Math.hypot(
            P.mesh.pts[c][0] - P.mesh.pts[o][0],
            P.mesh.pts[c][1] - P.mesh.pts[o][1],
          );
          bi.push(A);
          bj.push(B);
          br.push(Math.hypot(d2, F.off[c] - F.off[o]));
          bk.push(1);
        } else {
          const A = P.offset + o;
          const B = P.offset + c;
          bi.push(A);
          bj.push(B);
          br.push(Math.hypot(fp[c][0] - fp[o][0], fp[c][1] - fp[o][1]));
          bk.push(0.03);
        }
      }
    }
    for (let r = 0; r < P.nb; r++) addD(r, (r + 1) % P.nb);
    // Long-range limits: each other vertex to the vertex ~4 h away in three directions, when the
    // straight line between them stays inside the piece.
    const cell = h;
    const grid = new Map<string, number[]>();
    for (let i = 0; i < P.count; i++) {
      const k = `${Math.floor(fp[i][0] / cell)},${Math.floor(fp[i][1] / cell)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k)!.push(i);
    }
    const ring = fp.slice(0, P.nb);
    const near = (x: number, y: number) => {
      let best = -1;
      let bd = (0.7 * h) ** 2;
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      for (let a = gx - 1; a <= gx + 1; a++)
        for (let b = gy - 1; b <= gy + 1; b++)
          for (const j of grid.get(`${a},${b}`) ?? []) {
            const d = (fp[j][0] - x) ** 2 + (fp[j][1] - y) ** 2;
            if (d < bd) [best, bd] = [j, d];
          }
      return best;
    };
    for (let i = 0; i < P.count; i += 2) {
      const [x, y] = fp[i];
      for (const deg of [0, 60, 120]) {
        const r = (deg * Math.PI) / 180;
        const D = 5 * h;
        const j = near(x + D * Math.cos(r), y + D * Math.sin(r));
        if (j < 0 || j === i) continue;
        const ok = [0.25, 0.5, 0.75].every((t) =>
          pointInPolygon([x + (fp[j][0] - x) * t, y + (fp[j][1] - y) * t], ring),
        );
        if (!ok) continue;
        li.push(P.offset + i);
        lj.push(P.offset + j);
        lr.push(Math.hypot(fp[j][0] - x, fp[j][1] - y));
      }
    }
    if (!F) return;
    // A placement that knows no plies (a sleeve, a cuff, a collar) placed every ply on one surface:
    // offset along the vertex normals, out of the garment by the triangle winding and the fold.
    if (!F.plyDone) {
      F.plyDone = true;
      const nrm = new Float64Array(3 * P.count);
      for (let t = 0; t < T.length; t += 3) {
        const a = T[t];
        const b = T[t + 1];
        const c = T[t + 2];
        const sgn = P.mirrored !== (F.triFlip[t / 3] === 1) ? -1 : 1;
        const A = getPos(P.offset + a);
        const n = cross3(sub3(getPos(P.offset + b), A), sub3(getPos(P.offset + c), A));
        for (const v of [a, b, c]) for (let d = 0; d < 3; d++) nrm[3 * v + d] += sgn * n[d];
      }
      for (let i = 0; i < P.count; i++) {
        const nl = Math.hypot(nrm[3 * i], nrm[3 * i + 1], nrm[3 * i + 2]);
        if (!(nl > 1e-9) || !placed[P.offset + i]) continue;
        for (let d = 0; d < 3; d++) pos[3 * (P.offset + i) + d] += (F.off[i] * nrm[3 * i + d]) / nl;
      }
    }
    // Fold contacts: every vertex over a triangle of another ply (in the folded footprint, past
    // the ramp at the crease) stays on its side of that ply, `gap` mm away. Static pairs. The
    // vertices inside the ramp are paired too, as probes: measured, never held (their offset is
    // still growing there, and the hinge holds the crease).
    const band = Math.max(0.5 * h, RAMP);
    const cellT = new Map<string, number[]>();
    for (let t = 0; t < T.length; t += 3) {
      const a = T[t];
      const b = T[t + 1];
      const c = T[t + 2];
      const xs = [P.mesh.pts[a][0], P.mesh.pts[b][0], P.mesh.pts[c][0]];
      const ys = [P.mesh.pts[a][1], P.mesh.pts[b][1], P.mesh.pts[c][1]];
      const gx0 = Math.floor(Math.min(...xs) / cell);
      const gx1 = Math.floor(Math.max(...xs) / cell);
      const gy0 = Math.floor(Math.min(...ys) / cell);
      const gy1 = Math.floor(Math.max(...ys) / cell);
      for (let gx = gx0; gx <= gx1; gx++)
        for (let gy = gy0; gy <= gy1; gy++) {
          const k = `${gx},${gy}`;
          if (!cellT.has(k)) cellT.set(k, []);
          cellT.get(k)!.push(t);
        }
    }
    type Pairs = {
      cv: number[];
      ca: number[];
      cb: number[];
      cc: number[];
      w0: number[];
      w1: number[];
      w2: number[];
      sg: number[];
      gp: number[];
    };
    const pairs = (): Pairs => ({
      cv: [],
      ca: [],
      cb: [],
      cc: [],
      w0: [],
      w1: [],
      w2: [],
      sg: [],
      gp: [],
    });
    const held = pairs();
    const probed = pairs();
    for (let i = 0; i < P.count; i++) {
      if (!(F.creaseD[i] > 1e-9)) continue;
      const { cv, ca, cb, cc, w0, w1, w2, sg, gp } = F.creaseD[i] >= band ? held : probed;
      const p = P.mesh.pts[i];
      const k = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`;
      // Every other ply over the vertex holds it, each on its own side: where three or four plies
      // stack (a placket in a turned-up hem) one pair would leave the vertex free of the face.
      const by = new Set<number>();
      for (const t of cellT.get(k) ?? []) {
        const a = T[t];
        const b = T[t + 1];
        const c = T[t + 2];
        const dp = F.ply[i] - F.triPly[t / 3];
        if (!dp || by.has(F.triPly[t / 3]) || a === i || b === i || c === i) continue;
        const A = P.mesh.pts[a];
        const B = P.mesh.pts[b];
        const C = P.mesh.pts[c];
        const det = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
        if (Math.abs(det) < 1e-9) continue;
        const u = ((B[1] - C[1]) * (p[0] - C[0]) + (C[0] - B[0]) * (p[1] - C[1])) / det;
        const v = ((C[1] - A[1]) * (p[0] - C[0]) + (A[0] - C[0]) * (p[1] - C[1])) / det;
        const w = 1 - u - v;
        if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
        const sgn = P.mirrored !== (F.triFlip[t / 3] === 1) ? -1 : 1;
        cv.push(P.offset + i);
        ca.push(P.offset + a);
        cb.push(P.offset + b);
        cc.push(P.offset + c);
        w0.push(u);
        w1.push(v);
        w2.push(w);
        sg.push(Math.sign(dp) * sgn);
        gp.push(0.6 * PLY * Math.abs(dp));
        by.add(F.triPly[t / 3]); // one triangle per ply holds the vertex
      }
    }
    for (const [list, into] of [
      [held, foldContacts],
      [probed, foldProbes],
    ] as const)
      if (list.cv.length)
        into.push({
          v: Int32Array.from(list.cv),
          a: Int32Array.from(list.ca),
          b: Int32Array.from(list.cb),
          c: Int32Array.from(list.cc),
          w0: Float64Array.from(list.w0),
          w1: Float64Array.from(list.w1),
          w2: Float64Array.from(list.w2),
          sgn: Int8Array.from(list.sg),
          gap: Float64Array.from(list.gp),
          panel: P.idx,
        });
  };

  let state: SolverState | null = null;
  const contacts: NonNullable<SolverState['contacts']> = [];
  const ties: Tie[] = [];
  const anchor = new Float64Array(3 * N);
  const anchorK = new Float32Array(N);
  const moving = new Uint8Array(N);
  const makeState = () => {
    const nS = di.length;
    state = {
      pos,
      di: Int32Array.from([...di, ...bi]),
      dj: Int32Array.from([...dj, ...bj]),
      rest: Float64Array.from([...dr, ...br]),
      dk: Float64Array.from([...dk, ...bk]),
      nStretch: nS,
      omega: 1.0,
      li: Int32Array.from(li),
      lj: Int32Array.from(lj),
      lrest: Float64Array.from(lr),
      seams: works.map((w) => w.solver),
      proxyOf,
      proxies,
      moving,
      pullK: 0,
      anchor,
      anchorK,
      contacts,
      ...(ties.length ? { ties } : {}),
      ...(foldContacts.length ? { foldContacts } : {}),
    };
    return state;
  };

  let passes = 0;
  const maxPasses = opt.maxPasses ?? 1800;
  // The settle loop may run past maxPasses (up to settlePasses more).
  let passCap = maxPasses;
  const run = (n: number) => {
    const S = makeState();
    for (let k = 0; k < n && passes < passCap; k++) {
      for (const w of works) {
        if (w.released || w.virtual) {
          w.solver.active = false;
          continue;
        }
        const r = Math.min(1, (passes - w.born + 1) / Math.max(1, w.ramp));
        w.solver.k = w.target * (0.05 + 0.95 * r);
      }
      pass(S, 1);
      passes++;
      if (opt.onFrame && passes % 20 === 0) {
        const frame = Float32Array.from(pos);
        // Unplaced panels have solver coordinates for diagnostics only. Collapse them to a point in
        // live frames so the canvas never shows a side pile while the final report is being built.
        for (let v = 0; v < N; v++)
          if (!placed[v] || hiddenFromView[v])
            frame[3 * v] = frame[3 * v + 1] = frame[3 * v + 2] = 0;
        opt.onFrame(frame, passes);
      }
    }
  };

  // ── release seams that could only close by tearing the paper ────────────────────────────
  const seamStretch = (w: Work, st: Float64Array, S0: SolverState) => {
    const nbr = new Map<number, number[]>();
    // The seam's own run, without its last 12 % at each end (corners belong to the next seam).
    const inner = (P: Path) =>
      [...P.v].filter((_, k) => P.len <= 0 || (P.s[k] >= 0.12 * P.len && P.s[k] <= 0.88 * P.len));
    const vs = new Set<number>([...inner(w.A), ...inner(w.B)]);
    for (let c = 0; c < S0.nStretch; c++) {
      for (const x of [S0.di[c], S0.dj[c]]) {
        if (!vs.has(x)) continue;
        if (!nbr.has(x)) nbr.set(x, []);
        nbr.get(x)!.push(c);
      }
    }
    const vals: number[] = [];
    for (const list of nbr.values()) for (const c of list) vals.push(st[c]);
    vals.sort((x, y) => x - y);
    return vals.length ? vals[Math.floor(0.9 * (vals.length - 1))] : 0;
  };
  const measure = (w: Work) => {
    const g = rowGaps(pos, w.rows);
    const mean = g.reduce((x, y) => x + y, 0) / Math.max(1, g.length);
    const max = g.length ? Math.max(...g) : 0;
    const srt = [...g].sort((x, y) => x - y);
    const p95 = srt.length ? srt[Math.floor(0.95 * (srt.length - 1))] : 0;
    return {
      mean: Math.max(0, mean - w.solver.gap),
      max: Math.max(0, max - w.solver.gap),
      p95: Math.max(0, p95 - w.solver.gap),
    };
  };
  const releaseRounds = (rounds: number, settle: number, gapMax: number, strainMax: number) => {
    for (let round = 0; round < rounds; round++) {
      const S0 = makeState();
      const st = strains(S0);
      let worst: Work | null = null;
      let ws = 0;
      let worstSp = 0;
      for (const w of works) {
        if (
          w.released ||
          w.origin !== 'graph' ||
          w.closure ||
          w.sleeveCap ||
          !w.solver.active ||
          w.confirmed ||
          w.crotch
        )
          continue;
        if (!w.A.v.every((v) => moving[v]) && !w.B.v.every((v) => moving[v])) continue;
        const m = measure(w);
        // Strain beyond the seam's own ease (paper cannot gather a sleeve cap or a pleat).
        const ease =
          w.aRange[1] - w.aRange[0] < 0.999 || w.bRange[1] - w.bRange[0] < 0.999
            ? 0
            : 1 - Math.min(w.A.len, w.B.len) / Math.max(w.A.len, w.B.len, 1e-9);
        const sp = Math.max(0, seamStretch(w, st, S0) * 100 - ease * 100);
        if (m.max < gapMax && sp < strainMax) continue;
        const score = m.mean + 3 * sp;
        if (score > ws) [worst, ws, worstSp] = [w, score, sp];
      }
      if (!worst || passes >= passCap) break;
      const m = measure(worst);
      worst.released = true;
      worst.note = `would close only by tearing the paper (gap ${m.max.toFixed(0)} mm, strain ${worstSp.toFixed(0)} %) — released so the rest can settle; a wrong pairing?`;
      run(Math.min(settle, passCap - passes));
    }
  };

  // ── phase 1: body (+ legs) with its own seams and the CF closure ────────────────────────
  const bodyLike = new Set<DollGroupId>(['BODY', 'LEG_L', 'LEG_R']);
  /** Every drawn part of a side lies in these groups (parts on laid pieces are not the solve's). */
  const inGroups = (ids: EdgeId[], set: Set<DollGroupId>) =>
    ids.some((id) => panelByKey.has(pk(id))) &&
    ids.every((id) => {
      const P = panelByKey.get(pk(id));
      return P ? set.has(P.group) : laidKeys.has(pk(id));
    });
  const edgeUsed = (id: EdgeId) =>
    works.some((w) => !w.released && (w.a.includes(id) || w.b.includes(id)));
  /**
   * A seam between the left and the right leg: the crotch (legs meet nowhere else). When the leg
   * panels are read from the drawing, only a seam carrying a rise edge on both sides (the rises,
   * or the rises running on up a unit) — not a short wrong pairing across the legs.
   */
  const crotchOf = (s: GroupedSeam) => {
    const ga = panelByKey.get(pk(s.a[0]))?.group;
    const gb = panelByKey.get(pk(s.b[0]))?.group;
    const across = (ga === 'LEG_L' && gb === 'LEG_R') || (ga === 'LEG_R' && gb === 'LEG_L');
    if (!across || !legPanelsOf.size) return across;
    const rise = (ids: EdgeId[]) => ids.some((id) => legPanelsOf.get(pk(id))?.rise.id === id);
    return rise(s.a) && rise(s.b);
  };
  /** Tube groups set onto the body by the graph's own seams (no free loop): their composite seams
   *  take their direction by the gap, not the mirrored flags. */
  const graphPlaced = new Set<DollGroupId>();
  const sleeveCapSeams = new Set<GroupedSeam>();
  const graphWork = (s: GroupedSeam, born: number, closure = false) => {
    const conf = isConf(s.seam);
    const proposedByDoll = !owner && dollNote.has(`${s.seam.a}~${s.seam.b}`);
    const completedFromOrder = !owner && orderNote.has(`${s.seam.a}~${s.seam.b}`);
    // Each side as sewn (sewnSide: parts walked in order, cut to their stretches) — the same path
    // the placement judged the seam by; the range of a one-piece partial stays a constraint.
    const A = sewnSide(s, 'a', false);
    const B = sewnSide(s, 'b', false);
    if (!A || !B) return null;
    const lenA = A.len;
    const lenB = B.len;
    // A side whose walk starts or ends on a laid piece is sewn over its drawn parts, onto the
    // share of the other side they take (which end, by the direction): the laid stretch is
    // measured once its piece is laid (below), never pulled.
    const shareA = conf ? laidEndsOf(s, 'a')?.share ?? null : null;
    const shareB = conf ? laidEndsOf(s, 'b')?.share ?? null : null;
    if (shareA && shareB) return null;
    const drawnOnly = (ids: EdgeId[]) => ids.filter((id) => panelByKey.has(pk(id)));
    const sa = drawnOnly(s.a);
    const sb = drawnOnly(s.b);
    // A partial that carries its sewn stretch (mm along each run — a stored row, or the engine's
    // own reading since assignment phase 4) is pulled together over that stretch only: no guessing
    // the aligned end.
    const rg = s.seam.range && s.a.length === 1 && s.b.length === 1 ? s.seam.range : null;
    const ranges = rg
      ? {
          aR: [rg.a[0] / Math.max(1e-9, lenA), rg.a[1] / Math.max(1e-9, lenA)].map((x) =>
            Math.max(0, Math.min(1, x)),
          ) as [number, number],
          bR: [rg.b[0] / Math.max(1e-9, lenB), rg.b[1] / Math.max(1e-9, lenB)].map((x) =>
            Math.max(0, Math.min(1, x)),
          ) as [number, number],
        }
      : undefined;
    // A composite side walked in order (a stored row, or the engine's onto a tube the graph itself
    // placed) has no direction of its own: by the smaller gap, not the mirrored flags.
    const multi =
      (conf ||
        graphPlaced.has(panelByKey.get(pk(sa[0]))?.group as DollGroupId) ||
        graphPlaced.has(panelByKey.get(pk(sb[0]))?.group as DollGroupId)) &&
      (s.a.length > 1 || s.b.length > 1);
    const share = shareA ?? shareB;
    const flip = (r: [number, number]): [number, number] => [1 - r[1], 1 - r[0]];
    const rangeOptions = share
      ? [false, true].map((same) =>
          shareA
            ? { same, aR: [0, 1] as [number, number], bR: same ? share : flip(share) }
            : { same, aR: same ? share : flip(share), bR: [0, 1] as [number, number] },
        )
      : undefined;
    const w0 = addWork(
      {
        id: `${s.seam.a}~${s.seam.b}`,
        a: sa,
        b: sb,
        kind: proposedByDoll ? 'proposed-composite' : s.seam.kind,
        origin: proposedByDoll ? 'doll-proposed' : 'graph',
        A,
        B,
        target: closure ? 0.5 : 1,
        note: closure
          ? suspectNote.get(`${s.seam.a}~${s.seam.b}`) ??
            'closure (buttons / zip) — drawn closed with a small gap'
          : (completedFromOrder ? orderNote.get(`${s.seam.a}~${s.seam.b}`) : undefined) ??
            dollNote.get(`${s.seam.a}~${s.seam.b}`) ??
            '',
        fromOrder: completedFromOrder,
        closure,
        // A confirmed seam is sewn as stored (whole, or its stored stretch) — never re-guessed.
        partial: conf
          ? false
          : s.seam.kind === 'partial' || Math.min(lenA, lenB) / Math.max(lenA, lenB) < 0.9,
        gap: closure ? 4 : 0,
        // A composite side spans pieces laid either way round: its direction by the smaller gap.
        forceSame: multi
          ? undefined
          : (panelByKey.get(pk(sa[0]))?.mirrored ?? false) !==
            (panelByKey.get(pk(sb[0]))?.mirrored ?? false),
        ...(ranges ? { ranges } : {}),
        ...(rangeOptions ? { rangeOptions } : {}),
      },
      born,
      closure
        ? 60
        : charts.get(panelByKey.get(pk(sa[0]))!.group)?.used.has(`${s.seam.a}~${s.seam.b}`) ||
            crotchOf(s)
          ? 40
          : 380,
    );
    if (conf) w0.confirmed = true;
    if (sleeveCapSeams.has(s)) w0.sleeveCap = true;
    if (share)
      w0.laidEnds = {
        a: s.a,
        b: s.b,
        off: [...new Set([...s.a, ...s.b].map(pk).filter((k) => !panelByKey.has(k)))],
      };
    if (owner && conf) w0.inStep = ownerInStepKeys.has(s.seam.provenance?.seamKey ?? '');
    if (owner && isGuess(s.seam))
      w0.guess = { step: guessStepOf.get(s.seam.provenance!.seamKey) ?? 0 };
    if (s.seam.partRange) {
      // (keys on the side's original edge ids → the grouped side's ids, position for position)
      const pr: Record<string, [number, number]> = {};
      for (const side of ['a', 'b'] as const) {
        const orig = (
          side === 'a' ? s.seam.aParts ?? edgeIdsOf(s.seam.a) : s.seam.bParts ?? edgeIdsOf(s.seam.b)
        ).flatMap((x) => edgeIdsOf(x));
        const ids = side === 'a' ? s.a : s.b;
        orig.forEach((o, i) => {
          const r = s.seam.partRange![o];
          if (r) pr[ids[i] ?? o] = r;
        });
      }
      w0.partRange = pr;
    }
    if (crotchOf(s)) {
      w0.crotch = true;
      for (const v of w0.A.v) midPlane.add(v);
      for (const v of w0.B.v) midPlane.add(v);
    }
    if (conf && multi && opt.debug)
      for (const [side, P] of [
        ['A', A],
        ['B', B],
      ] as const) {
        const jumps: string[] = [];
        for (let k = 1; k < P.v.length; k++)
          if (panelOf[P.v[k]] !== panelOf[P.v[k - 1]]) {
            const a = P.v[k - 1];
            const b = P.v[k];
            jumps.push(
              `${panels[panelOf[a]].key}→${panels[panelOf[b]].key} ${Math.hypot(pos[3 * a] - pos[3 * b], pos[3 * a + 1] - pos[3 * b + 1], pos[3 * a + 2] - pos[3 * b + 2]).toFixed(0)} mm`,
            );
          }
        warnings.push(
          `debug: ${w0.id} side ${side} ${P.len.toFixed(0)} mm, part joins at placement: ${jumps.join(' · ') || '—'}`,
        );
      }
    if (conf && multi && opt.debug) {
      const md = (same: boolean) => meanDist(A, B, same, [0, 1], [0, 1]).toFixed(0);
      // where the A-side part joins land on B (arc mm), under the chosen direction
      const lands: string[] = [];
      for (let k = 1; k < A.v.length; k++)
        if (panelOf[A.v[k]] !== panelOf[A.v[k - 1]]) {
          const t = A.s[k] / A.len;
          lands.push(
            `${panels[panelOf[A.v[k - 1]]].key}|${panels[panelOf[A.v[k]]].key} at ${(t * A.len).toFixed(0)} → B ${((w0.same ? t : 1 - t) * B.len).toFixed(0)}`,
          );
        }
      const low = (P: Path) => {
        let b = 0;
        for (let k = 0; k < P.v.length; k++) if (pos[3 * P.v[k] + 1] < pos[3 * P.v[b] + 1]) b = k;
        return P.s[b];
      };
      const la = low(A) / A.len;
      lands.push(
        `lowest A ${low(A).toFixed(0)} → B ${((w0.same ? la : 1 - la) * B.len).toFixed(0)} vs lowest B ${low(B).toFixed(0)}`,
      );
      warnings.push(
        `debug: ${w0.id} same=${w0.same} meanDist same ${md(true)} / opp ${md(false)} mm · ${lands.join(' · ')}`,
      );
    }
    return w0;
  };
  // ── L4 front closure: the two centre-front lines on top of each other (buttoned) ──────────
  const DEFAULT_CF_MM = 15;
  const segDist = (p: [number, number], a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  const edgePts = (ids: EdgeId[]) =>
    ids.flatMap((id) => edgeIdsOf(id)).flatMap((id) => edgeById.get(id)?.pts ?? []);
  const distToEdge = (q: [number, number], pts: [number, number][]) => {
    let d = Infinity;
    for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(q, pts[i - 1], pts[i]));
    return d;
  };
  /** The button line of a closure side: the nearest column of drill / buttonhole marks, mm in. */
  const buttonLine = (P: Panel, ids: EdgeId[]): number | null => {
    const pts = edgePts(ids);
    if (pts.length < 2) return null;
    const ds: number[] = [];
    for (const m of P.geom.marks ?? []) {
      if (m.kind !== 'drill' && m.kind !== 'buttonhole') continue;
      const d = distToEdge([m.bbox.cx, m.bbox.cy], pts);
      if (d <= 90 && d >= 3) ds.push(d);
    }
    if (!ds.length) return null;
    ds.sort((x, y) => x - y);
    const col = ds.filter((d) => d <= ds[0] + 6);
    return col[Math.floor(col.length / 2)];
  };
  /** Barycentric location of a pattern point in a panel's mesh (nearest triangle when outside). */
  const locate = (P: Panel, q: [number, number]) => {
    const T = P.mesh.tris;
    const X = P.mesh.pts;
    let best: { i: number[]; w: number[] } | null = null;
    let bd = Infinity;
    for (let t = 0; t < T.length; t += 3) {
      const a = X[T[t]];
      const b = X[T[t + 1]];
      const c = X[T[t + 2]];
      const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(den) < 1e-9) continue;
      const l1 = ((b[1] - c[1]) * (q[0] - c[0]) + (c[0] - b[0]) * (q[1] - c[1])) / den;
      const l2 = ((c[1] - a[1]) * (q[0] - c[0]) + (a[0] - c[0]) * (q[1] - c[1])) / den;
      const l3 = 1 - l1 - l2;
      const out = Math.max(0, -l1, -l2, -l3);
      if (out < bd) {
        bd = out;
        const cl = [Math.max(0, l1), Math.max(0, l2), Math.max(0, l3)];
        const sum = cl[0] + cl[1] + cl[2] || 1;
        best = {
          i: [P.offset + T[t], P.offset + T[t + 1], P.offset + T[t + 2]],
          w: cl.map((x) => x / sum),
        };
        if (out === 0) break;
      }
    }
    return best;
  };
  /** Point and inward normal (pattern) at arc s of a one-panel path. */
  const atArc = (A: Path, s0: number) => {
    const sArc = Math.max(0, Math.min(A.len, s0));
    let k = 1;
    while (k < A.v.length - 1 && A.s[k] < sArc) k++;
    const a = A.v[k - 1];
    const b = A.v[k];
    const t = A.s[k] > A.s[k - 1] ? (sArc - A.s[k - 1]) / (A.s[k] - A.s[k - 1]) : 0;
    const x = uv[2 * a] + (uv[2 * b] - uv[2 * a]) * t;
    const y = uv[2 * a + 1] + (uv[2 * b + 1] - uv[2 * a + 1]) * t;
    let dx = uv[2 * b] - uv[2 * a];
    let dy = uv[2 * b + 1] - uv[2 * a + 1];
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    // The contour runs CCW: the inside is on the left of the walk.
    return { p: [x, y] as [number, number], n: [-dy, dx] as [number, number] };
  };
  const overlapClosure = (s: GroupedSeam, w: Work) => {
    const PA = panelByKey.get(pk(s.a[0]));
    const PB = panelByKey.get(pk(s.b[0]));
    if (!PA || !PB || PA === PB || w.A.v.length < 2 || w.B.v.length < 2) return;
    if (new Set(s.a.map(pk)).size > 1 || new Set(s.b.map(pk)).size > 1) return;
    const meanX = (P: Panel) => {
      let t = 0;
      for (let i = 0; i < P.count; i++) t += pos[3 * (P.offset + i)];
      return t / Math.max(1, P.count);
    };
    // Men: the wearer's left front (the doll's left, +x) on top; women: the right.
    const women = opt.gender === 'FEMALE';
    const aTop = women ? meanX(PA) < meanX(PB) : meanX(PA) > meanX(PB);
    const [Pt, Pu, At, Au, idsT, idsU] = aTop
      ? [PA, PB, w.A, w.B, s.a, s.b]
      : [PB, PA, w.B, w.A, s.b, s.a];
    const mT = buttonLine(Pt, idsT);
    const mU = buttonLine(Pu, idsU);
    const offT = mT ?? mU ?? DEFAULT_CF_MM;
    const offU = mU ?? mT ?? DEFAULT_CF_MM;
    const how =
      mT !== null && mU !== null
        ? 'both sides by their button / buttonhole marks'
        : mT !== null || mU !== null
          ? `by the marks of ${mT !== null ? Pt.key : Pu.key} (the other side has none)`
          : `no marks — ${DEFAULT_CF_MM} mm assumed each side`;
    // Ends meet ends: the pairing whose ends lie nearer now.
    const d3 = (a: number, b: number) =>
      Math.hypot(
        pos[3 * a] - pos[3 * b],
        pos[3 * a + 1] - pos[3 * b + 1],
        pos[3 * a + 2] - pos[3 * b + 2],
      );
    const t0 = At.v[0];
    const t1 = At.v[At.v.length - 1];
    const u0 = Au.v[0];
    const u1 = Au.v[Au.v.length - 1];
    const same = d3(t0, u0) + d3(t1, u1) <= d3(t0, u1) + d3(t1, u0);
    const N = 24;
    const ia: number[] = [];
    const wa: number[] = [];
    const ib: number[] = [];
    const wb: number[] = [];
    for (let k = 0; k < N; k++) {
      const f = 0.03 + (0.94 * k) / (N - 1);
      const qt = atArc(At, f * At.len);
      const qu = atArc(Au, (same ? f : 1 - f) * Au.len);
      const lt = locate(Pt, [qt.p[0] + qt.n[0] * offT, qt.p[1] + qt.n[1] * offT]);
      const lu = locate(Pu, [qu.p[0] + qu.n[0] * offU, qu.p[1] + qu.n[1] * offU]);
      if (!lt || !lu) continue;
      ia.push(...lt.i);
      wa.push(...lt.w);
      ib.push(...lu.i);
      wb.push(...lu.w);
    }
    if (!ia.length) return;
    ties.push({
      ia: Int32Array.from(ia),
      wa: Float64Array.from(wa),
      ib: Int32Array.from(ib),
      wb: Float64Array.from(wb),
      k: 0.5,
      lift: 2.5,
      ax: 0,
      az: 0,
      active: true,
    });
    // The top's extension lies over the under piece: one-sided contacts, pattern-paired.
    const zone = offT + offU + 6;
    const ptsT = edgePts(idsT);
    const ptsU = edgePts(idsU);
    const ci: number[] = [];
    const cj: number[] = [];
    for (let i = 0; i < Pt.count; i++) {
      const v = Pt.offset + i;
      const q: [number, number] = [uv[2 * v], uv[2 * v + 1]];
      const d = distToEdge(q, ptsT);
      if (d > zone) continue;
      // Where along the edge, and the under point at the mirrored depth.
      let bestS = 0;
      let bd = Infinity;
      for (let k = 0; k < At.v.length; k++) {
        const a = At.v[k];
        const dd = Math.hypot(uv[2 * a] - q[0], uv[2 * a + 1] - q[1]);
        if (dd < bd) [bd, bestS] = [dd, At.s[k]];
      }
      const f = bestS / Math.max(1, At.len);
      const qu = atArc(Au, (same ? f : 1 - f) * Au.len);
      const depth = Math.max(0, offT + offU - d);
      const target: [number, number] = [qu.p[0] + qu.n[0] * depth, qu.p[1] + qu.n[1] * depth];
      let j = -1;
      let bj = Infinity;
      for (let m = 0; m < Pu.count; m++) {
        const u = Pu.offset + m;
        const dd = Math.hypot(uv[2 * u] - target[0], uv[2 * u + 1] - target[1]);
        if (dd < bj) [bj, j] = [dd, u];
      }
      if (j >= 0 && bj < 2 * h && distToEdge([uv[2 * j], uv[2 * j + 1]], ptsU) <= zone) {
        ci.push(v);
        cj.push(j);
      }
    }
    if (ci.length)
      contacts.push({ i: Int32Array.from(ci), j: Int32Array.from(cj), gap: 2, ax: 0, az: 0 });
    w.virtual = true;
    w.solver.active = false;
    w.overlap = {
      id: w.id,
      top: Pt.key,
      under: Pu.key,
      offTopMm: offT,
      offUnderMm: offU,
      how: `${women ? 'right over left (women)' : 'left over right (men' + (opt.gender ? ')' : ', the default)')} · centre-front lines ${offT.toFixed(0)} / ${offU.toFixed(0)} mm in — ${how}`,
      cfGapP95Mm: NaN,
      overlapMm: NaN,
      outsidePct: NaN,
      ok: false,
    };
    (w as Work & { contactIdx?: number; tieIdx?: number }).tieIdx = ties.length - 1;
    (w as Work & { contactIdx?: number }).contactIdx = ci.length ? contacts.length - 1 : -1;
  };

  for (const P of panels) if (bodyLike.has(P.group)) buildPanel(P);
  const crossing: { s: GroupedSeam; xa: number; xb: number; w: Work }[] = [];
  const refusedMirror: NonNullable<DollReport['notSewn']> = [];
  for (const s of G.seams) {
    if (!inGroups(s.a, bodyLike) || !inGroups(s.b, bodyLike)) continue;
    const w = graphWork(s, 0);
    if (!w || !groups.has('BODY')) continue;
    // A confirmed seam is sewn as a person said, however it lies now (an open end = contradiction).
    // The crotch joins the left leg to the right one by design: it crosses the doll's middle.
    // A bag has no left and right: its seams cross the shape's middle as the order says.
    if (bag || w.confirmed || w.crotch) continue;
    // A seam that crosses the doll from its left to its right (the back's left shoulder onto the
    // right front) cannot close without tearing paper: released, and the mirror reading proposed.
    const cx = (P: Path) => [...P.v].reduce((t, v) => t + pos[3 * v], 0) / P.v.length;
    const xa = cx(w.A);
    const xb = cx(w.B);
    const lim = 0.3 * (torsoAt(vArm)?.a ?? 150);
    if (!(Math.sign(xa) !== Math.sign(xb) && Math.abs(xa) > lim && Math.abs(xb) > lim)) continue;
    w.released = true;
    w.solver.active = false;
    const side = (x: number) => (x > 0 ? "the doll's left" : "the doll's right");
    // Mirror halves (or a piece and itself) across the doll: no reading of it is a seam.
    const Pa = panelByKey.get(pk(s.a[0]));
    const Pb = panelByKey.get(pk(s.b[0]));
    // (A centre seam of mirror halves — both edges running up the pieces — is a real seam the
    // placement got wrong: it stays, released, as before.)
    const upEdge = (id: string) => {
      const e = edgeById.get(id);
      if (!e || e.pts.length < 2) return true;
      const p = e.pts[0];
      const q = e.pts[e.pts.length - 1];
      return Math.atan2(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1])) <= Math.PI / 6;
    };
    // (The crotch: the left and the right leg meet at the rise — a real seam, kept, released.)
    const legPair =
      !!Pa &&
      !!Pb &&
      new Set([Pa.group, Pb.group]).size === 2 &&
      [Pa.group, Pb.group].every((g) => g === 'LEG_L' || g === 'LEG_R');
    if (
      Pa &&
      Pb &&
      !legPair &&
      (Pa.key === Pb.key ||
        (Pa.geom.twinOf.some((t) => t.key === Pb.key && t.kind === 'mirror') &&
          ![...s.a, ...s.b].every(upEdge)))
    ) {
      w.hidden = true;
      refusedMirror.push({
        id: w.id,
        a: s.a,
        b: s.b,
        note: `not sewn — the graph sews ${Pa.key === Pb.key ? `${Pa.key} to itself` : 'two mirror halves to each other'} across the doll (${s.a[0]} on ${side(xa)}, ${s.b[0]} on ${side(xb)}): mirror halves meet only on their centre line`,
      });
      continue;
    }
    w.note = `wrong reading (direction) — as drawn ${s.a[0]} sits on ${side(xa)} and ${s.b[0]} on ${side(xb)}, the seam would cross the doll (a cross-back by design?) — not sewn as drawn`;
    crossing.push({ s, xa, xb, w });
  }
  for (const { s, xa, xb, w: w0 } of crossing) {
    // Mirror reading: on the side without a hand, the edge mirrored across the piece's centre.
    for (const [mine, other, xm] of [
      [s.a, s.b, xa],
      [s.b, s.a, xb],
    ] as const) {
      const P = panelByKey.get(pk(mine[0]));
      const e = mine.length === 1 ? edgeById.get(mine[0]) : undefined;
      if (!P || !e || P.geom.hand) continue;
      let gx0 = Infinity;
      let gx1 = -Infinity;
      for (const q of P.geom.rs) {
        gx0 = Math.min(gx0, q[0]);
        gx1 = Math.max(gx1, q[0]);
      }
      const c = (gx0 + gx1) / 2;
      const mid = (ed: typeof e) => ed.pts[Math.floor(ed.pts.length / 2)];
      const twin = P.geom.edges.find(
        (x) =>
          x.id !== e.id &&
          Math.abs(x.lenMm - e.lenMm) < 4 &&
          Math.abs(mid(x)[0] + mid(e)[0] - 2 * c) < 20 &&
          Math.abs(mid(x)[1] - mid(e)[1]) < 20,
      );
      if (!twin || edgeUsed(twin.id) || other.includes(twin.id)) continue;
      const A2 = pathOf([twin.id]);
      const B2 = pathOf([...other]);
      if (!A2 || !B2) continue;
      void xm;
      // The same seam on the twin edge (a symmetric piece's two shoulders are one edge flat: the
      // graph cannot tell them apart, the doll's placement can) — the graph's seam, re-read, solved
      // and reported as such; the crossing reading is replaced, not listed beside it.
      addWork(
        {
          id: `${twin.id}~${other[0]}`,
          a: [twin.id],
          b: [...other],
          kind: s.seam.kind,
          origin: 'graph',
          fromOrder: w0.fromOrder,
          confirmed: w0.confirmed,
          inStep: w0.inStep,
          guess: w0.guess,
          A: A2,
          B: B2,
          target: 1,
          note: `the graph's seam ${s.seam.a} ↔ ${s.seam.b} read on the mirror twin edge ${twin.id} (${twin.lenMm.toFixed(0)} ≈ ${B2.len.toFixed(0)} mm): as drawn it crossed the doll — a symmetric piece's two sides are the same edge flat`,
          forceSame: false,
        },
        0,
        380,
      );
      w0.hidden = true;
      break;
    }
  }
  for (const s of G.closures)
    if (inGroups(s.a, bodyLike) && inGroups(s.b, bodyLike)) {
      const w = graphWork(s, 0, true);
      if (w && l4) overlapClosure(s, w);
    }

  // ── Buttons on their holes (buttons.ts): the closure a card's two steps declare, no row asked ──
  const fastened: Fastened[] = [];
  const notFastened: string[] = [];
  const pieceWord = (key: string) => graph.pieces.find((g) => g.pieceKey === key)?.name || key;
  const basePlyOf = (P: Panel) => {
    const on = new Uint8Array(P.count);
    const T = P.mesh.tris;
    for (let t = 0; t < T.length; t += 3)
      if (!P.fold || P.fold.triPly[t / 3] === 0) for (let j = 0; j < 3; j++) on[T[t + j]] = 1;
    return on;
  };
  /** A point of P's footprint on its base ply, or carried straight on past the footprint's edge. */
  const onFootprint = (P: Panel, p: Pt2): Located | null => {
    const fold = P.fold;
    const L = locateIn(
      P.mesh.pts,
      P.mesh.tris,
      p,
      fold ? (t: number) => fold.triPly[t] === 0 : undefined,
    );
    if (L && L.out < 1e-9) return L;
    const on = basePlyOf(P);
    return spreadPast(P.mesh.pts, on, p) ?? stencilPast(P.mesh.pts, on, p);
  };
  /**
   * Past the footprint across the closure (a placket over the host's folded edge) is carried on.
   * Past its end along the column (a hem turned under the placket, the neck) is not: nothing holds
   * that end there, it stays on the host's end as any surface part does.
   */
  const pastAcross = (P: Panel, free: { n: Pt2; off: number } | null, p: Pt2) => {
    if (!free) return false;
    const reach = 2 * Math.max(free.off, 1);
    for (let d = 2; d <= reach; d += 2) {
      const L = locateIn(P.mesh.pts, P.mesh.tris, [p[0] - free.n[0] * d, p[1] - free.n[1] * d]);
      if (L && L.out < 1e-9) return true;
    }
    return false;
  };
  const atNow = (P: Panel, L: Located): Vec3 => {
    const X: Vec3 = [0, 0, 0];
    L.i.forEach((v, j) => {
      for (let d = 0; d < 3; d++) X[d] += L.w[j] * pos[3 * (P.offset + v) + d];
    });
    return X;
  };
  const surfaceOfPart = (part: string) =>
    owner
      ? graph.chosen.find((c) => c.kind === 'surface' && c.surface?.part === part)?.surface
      : undefined;
  const fastenedSide = (s: FasteningSide): FastenedSide | string => {
    const name = pieceWord(s.piece);
    const own = panelByKey.get(s.piece);
    if (own) {
      if (!bodyLike.has(own.group)) return `${name} is not on the body`;
      const at: Located[] = [];
      for (const q of s.marks) {
        const L = locateIn(own.fold?.flat ?? own.mesh.pts, own.mesh.tris, q);
        if (!L) return `${name}: a mark is off the piece`;
        at.push(L);
      }
      // Located as cut: the same vertices are where the mark is on the finished, folded piece.
      const foot = at.map((L) => readAt(own.mesh.pts, L));
      return {
        P: own,
        part: s.piece,
        at,
        foot,
        shift: 0,
        free: freeSideOf(own.mesh.pts, foot),
      };
    }
    const surface = surfaceOfPart(s.piece);
    const H = surface && panelByKey.get(surface.host);
    if (!surface || !H || !G.skipped.some((x) => x.surface && x.pieceKey === s.piece))
      return `${name} is not one panel on the doll`;
    if (!bodyLike.has(H.group)) return `${name} lies on ${pieceWord(H.key)}, not on the body`;
    if (foldsOf(s.piece).length) return `${name} is folded itself, its marks are not mapped`;
    const geom = graph.pieces.find((g) => g.pieceKey === s.piece);
    const foot = s.marks.map((q) => apply(surface.T, q));
    const at: Located[] = [];
    for (const p of foot) {
      const L = onFootprint(H, p);
      if (!L) return `${name}: a mark is off ${pieceWord(H.key)}`;
      at.push(L);
    }
    // The drawn part lies this far from the host's face (the stack below, in the same order).
    let before = 0;
    for (const x of G.skipped) {
      if (!x.surface) continue;
      if (x.pieceKey === s.piece) break;
      if (surfaceOfPart(x.pieceKey)?.host === H.key) before++;
    }
    return {
      P: H,
      part: s.piece,
      at,
      foot,
      shift: (isUnder([H.key], [s.piece]) ? 1 : -1) * (2 + 2 * before),
      free: freeSideOf([...H.mesh.pts, ...(geom?.rs ?? []).map((q) => apply(surface.T, q))], foot),
    };
  };
  const fasten = (
    holes: FastenedSide,
    buttons: FastenedSide,
    id: string,
    unused: number,
    apart: string[] = [],
  ) => {
    // A step's own layer order is how a card can say which part lies over the other.
    const holeKeys = new Set([holes.P.key, holes.part]);
    const buttonKeys = new Set([buttons.P.key, buttons.part]);
    const says = (under: Set<string>, over: Set<string>) =>
      layerRelations.some(([a, b]) => under.has(a) && over.has(b));
    const buttonsOver = says(holeKeys, buttonKeys) && !says(buttonKeys, holeKeys);
    const [top, under] = buttonsOver ? [buttons, holes] : [holes, buttons];
    const n = top.at.length;
    // Ends meet ends: the order along the columns whose ends lie nearer now.
    const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const T = (k: number) => atNow(top.P, top.at[k]);
    const U = (k: number) => atNow(under.P, under.at[k]);
    const same =
      dist(T(0), U(0)) + dist(T(n - 1), U(n - 1)) <= dist(T(0), U(n - 1)) + dist(T(n - 1), U(0));
    const pairs = top.at.map((_, k) => (same ? k : n - 1 - k));
    const lift = Math.max(0.5, 2.5 + under.shift - top.shift);
    const tieOf = (rows: [Located, Located][], oneSided: boolean): Tie => {
      const ia: number[] = [];
      const wa: number[] = [];
      const ib: number[] = [];
      const wb: number[] = [];
      // Each point by as many vertices as the widest reads (a point past a footprint reads a
      // spread of them), the rest padded with weight 0.
      const stride = Math.max(3, ...rows.flatMap(([L, M]) => [L.i.length, M.i.length]));
      for (const [L, M] of rows)
        for (let j = 0; j < stride; j++) {
          ia.push(top.P.offset + L.i[Math.min(j, L.i.length - 1)]);
          wa.push(j < L.i.length ? L.w[j] : 0);
          ib.push(under.P.offset + M.i[Math.min(j, M.i.length - 1)]);
          wb.push(j < M.i.length ? M.w[j] : 0);
        }
      return {
        ...(stride !== 3 ? { stride } : {}),
        ia: Int32Array.from(ia),
        wa: Float64Array.from(wa),
        ib: Int32Array.from(ib),
        wb: Float64Array.from(wb),
        k: 0.5,
        lift: oneSided ? Math.max(0.5, lift - 0.5) : lift,
        ax: 0,
        az: 0,
        active: true,
        ...(oneSided ? { oneSided } : {}),
      };
    };
    const tieIdx = ties.length;
    ties.push(
      tieOf(
        top.at.map((L, k): [Located, Located] => [L, under.at[pairs[k]]]),
        false,
      ),
    );
    // Where the two pieces lie over each other the top stays outside: paired through the columns,
    // along with along, the top's way out with the under's way in.
    const ci: number[] = [];
    const cj: number[] = [];
    if (top.free && under.free && n >= 2) {
      const t0 = top.foot[0];
      const t1 = top.foot[n - 1];
      const u0 = under.foot[pairs[0]];
      const u1 = under.foot[pairs[n - 1]];
      const lt = Math.hypot(t1[0] - t0[0], t1[1] - t0[1]) || 1;
      const lu = Math.hypot(u1[0] - u0[0], u1[1] - u0[1]) || 1;
      const along: Pt2 = [(t1[0] - t0[0]) / lt, (t1[1] - t0[1]) / lt];
      const alongU: Pt2 = [(u1[0] - u0[0]) / lu, (u1[1] - u0[1]) / lu];
      const underOf = (p: Pt2): Pt2 => {
        const dx = p[0] - t0[0];
        const dy = p[1] - t0[1];
        const a = dx * along[0] + dy * along[1];
        const b = dx * top.free!.n[0] + dy * top.free!.n[1];
        return [
          u0[0] + alongU[0] * a - under.free!.n[0] * b,
          u0[1] + alongU[1] * a - under.free!.n[1] * b,
        ];
      };
      for (let i = 0; i < top.P.count; i++) {
        const v = top.P.offset + i;
        const q: Pt2 = [uv[2 * v], uv[2 * v + 1]];
        const b = (q[0] - t0[0]) * top.free.n[0] + (q[1] - t0[1]) * top.free.n[1];
        if (-b > under.free.off + h / 2) continue;
        const target = underOf(q);
        let j = -1;
        let bj = Infinity;
        for (let m = 0; m < under.P.count; m++) {
          const u = under.P.offset + m;
          const dd = Math.hypot(uv[2 * u] - target[0], uv[2 * u + 1] - target[1]);
          if (dd < bj) [bj, j] = [dd, u];
        }
        if (j >= 0 && bj < 2 * h) {
          ci.push(v);
          cj.push(j);
        }
      }
      if (ci.length)
        contacts.push({
          i: Int32Array.from(ci),
          j: Int32Array.from(cj),
          gap: Math.max(2, lift - 0.5),
          ax: 0,
          az: 0,
        });
      // A surface part overhanging its host is drawn, not solved: what holds it off the under
      // piece is the host, through the same vertices the drawing uses.
      const S = top.part === top.P.key ? null : graph.pieces.find((g) => g.pieceKey === top.part);
      const placement = S ? surfaceOfPart(S.pieceKey) : undefined;
      if (S && placement) {
        const rows: [Located, Located][] = [];
        const keep = [...S.edges.flatMap((e) => [e.s, e.e]), ...S.corners];
        const base = basePlyOf(top.P);
        const baseU = under.P.fold;
        for (const q of meshPiece(S.rs, keep, gridH).pts) {
          const p = apply(placement.T, q);
          const inHost = locateIn(top.P.mesh.pts, top.P.mesh.tris, p);
          if ((inHost && inHost.out < 1e-9) || !pastAcross(top.P, top.free, p)) continue;
          const L = spreadPast(top.P.mesh.pts, base, p) ?? stencilPast(top.P.mesh.pts, base, p);
          const M = locateIn(
            under.P.mesh.pts,
            under.P.mesh.tris,
            underOf(p),
            baseU ? (t: number) => baseU.triPly[t] === 0 : undefined,
          );
          if (L && M && M.out < 1e-9) rows.push([L, M]);
        }
        if (rows.length) ties.push(tieOf(rows, true));
      }
    }
    fastened.push({
      id,
      top,
      under,
      pairs,
      tieIdx,
      contactIdx: ci.length ? contacts.length - 1 : -1,
      how: [
        buttonsOver
          ? "button side over hole side: the card's layer order says so"
          : 'hole side over button side: the card does not say otherwise',
        ...(unused ? [`${unused} marks of the column left out, the step does not count them`] : []),
        ...apart,
      ].join(' · '),
    });
  };
  if (opt.fastenings?.length) {
    const read = pairFastenings(opt.fastenings, (key) =>
      graph.pieces.find((g) => g.pieceKey === key),
    );
    notFastened.push(...read.refused);
    for (const pair of read.pairs) {
      const id = `buttons: steps ${pair.holes.step} and ${pair.buttons.step}`;
      const holes = fastenedSide(pair.holes);
      const buttons = fastenedSide(pair.buttons);
      if (typeof holes === 'string' || typeof buttons === 'string') {
        notFastened.push(
          ...[holes, buttons].flatMap((x) => (typeof x === 'string' ? [`${id}: ${x}`] : [])),
        );
        continue;
      }
      const asOne = (a: string, b: string) =>
        (a === holes.P.key && b === buttons.P.key) || (a === buttons.P.key && b === holes.P.key);
      if (holes.P === buttons.P)
        notFastened.push(`${id}: both sides are one part (${pieceWord(holes.P.key)})`);
      else if (!l4) notFastened.push(`${id}: the card has no seam rows yet`);
      else if (G.closures.some((c) => asOne(pk(c.a[0]), pk(c.b[0]))))
        notFastened.push(`${id}: a stored closure row already joins these two parts`);
      else
        fasten(
          holes,
          buttons,
          id,
          pair.holes.unused + pair.buttons.unused,
          [pair.holes.apart, pair.buttons.apart].flatMap((x) => (x ? [x] : [])),
        );
    }
    for (const line of notFastened) warnings.push(`not fastened: ${line}`);
  }

  const freeEdges = (P: Panel) => P.geom.edges.filter((e) => !edgeUsed(e.id));
  // Proposed closures of open strips (CF of the body, underarm of a one-piece sleeve, outseam of a leg).
  const proposeStripClosure = (
    gid: DollGroupId,
    label: string,
    kind: Work['kind'],
    born: number,
  ) => {
    if (owner) return;
    const ch = charts.get(gid);
    const list = groups.get(gid);
    if (!ch || !list) return;
    const main = ch.components[0].keys.map((k) => panelByKey.get(k)!);
    if (G.closures.some((s) => list.some((P) => P.key === pk(s.a[0])))) return;
    // The ring's ends: the main strip's, or the far ends of the girth chains that continue it.
    const Llist = gid === 'BODY' && ringEnds.left ? ringEnds.left : main;
    const Rlist = gid === 'BODY' && ringEnds.right ? ringEnds.right : main;
    const endOf = (lst: Panel[], side: 0 | 1) => {
      const [lo, hi] = vRange(lst);
      const vm = lo + 0.45 * (hi - lo);
      const e = extent(crossings(lst, vm));
      return e ? endEdge(lst, e[side], vm) : null;
    };
    const endEdge = (lst: Panel[], u: number, vm: number) => {
      let best: { P: Panel; e: Edge; d: number } | null = null;
      for (const P of lst)
        for (const ed of freeEdges(P)) {
          const pl = ch.place.get(P.key)!;
          const pts = ed.pts.map((q) => toChart(pl, q));
          const dy = Math.abs(pts[pts.length - 1][1] - pts[0][1]);
          const dx = Math.abs(pts[pts.length - 1][0] - pts[0][0]);
          if (dy < 1.5 * dx || ed.lenMm < 100) continue;
          let d = Infinity;
          for (const q of pts) if (Math.abs(q[1] - vm) < 30) d = Math.min(d, Math.abs(q[0] - u));
          if (!Number.isFinite(d)) {
            const y0 = Math.min(pts[0][1], pts[pts.length - 1][1]);
            const y1 = Math.max(pts[0][1], pts[pts.length - 1][1]);
            if (vm < y0 || vm > y1) continue;
            d = Math.min(...pts.map((q) => Math.abs(q[0] - u)));
          }
          if (d < 25 && (!best || d < best.d)) best = { P, e: ed, d };
        }
      return best;
    };
    const L = endOf(Llist, 0);
    const R = endOf(Rlist, 1);
    if (!L || !R || L.e.id === R.e.id) return;
    const ratio = Math.min(L.e.lenMm, R.e.lenMm) / Math.max(L.e.lenMm, R.e.lenMm);
    if (ratio < 0.85) {
      warnings.push(
        `${label}: the strip's two ends ${L.e.id} (${L.e.lenMm.toFixed(0)} mm) and ${R.e.id} (${R.e.lenMm.toFixed(0)} mm) differ ${((1 - ratio) * 100).toFixed(0)} % — not closed`,
      );
      return;
    }
    const A = pathOf([L.e.id]);
    const B = pathOf([R.e.id]);
    if (!A || !B) return;
    addWork(
      {
        id: `${L.e.id}~${R.e.id}`,
        a: [L.e.id],
        b: [R.e.id],
        kind,
        origin: 'doll-proposed',
        A,
        B,
        target: kind === 'proposed-closure' ? 0.5 : 0.7,
        note: `${label} · ${L.e.lenMm.toFixed(0)} ≈ ${R.e.lenMm.toFixed(0)} mm · not in the pattern`,
        closure: kind === 'proposed-closure',
        partial: ratio < 0.97,
        gap: kind === 'proposed-closure' ? 4 : 0,
        // The strip's two ends run opposite ways round the contour: top meets top.
        forceSame: L.P.mirrored !== R.P.mirrored,
      },
      born,
      80,
    );
  };
  if (groups.has('BODY'))
    proposeStripClosure(
      'BODY',
      'front opening drawn closed (buttons / zip are not seams)',
      'proposed-closure',
      0,
    );
  for (const gid of ['LEG_L', 'LEG_R'] as DollGroupId[])
    if (groups.has(gid))
      proposeStripClosure(
        gid,
        'side seam of the leg proposed (closes the tube)',
        'proposed-composite',
        0,
      );

  // Free edges facing each other at placement (the yoke the pattern does not sew to the back, a
  // dropped side seam): reported OPEN and drawn red, never solved — but welded for the loops, so the
  // armholes are still found and the sleeves can be proposed onto them.
  const facingPairs = (gids: Set<DollGroupId>, maxGap: number, maxEase: number) => {
    const cand = panels
      .filter((P) => gids.has(P.group))
      .flatMap((P) =>
        freeEdges(P)
          .filter((e) => e.lenMm >= 60)
          .map((e) => ({ P, e })),
      );
    const out: {
      x: (typeof cand)[number];
      y: (typeof cand)[number];
      gap: number;
      same: boolean;
    }[] = [];
    for (let i = 0; i < cand.length; i++)
      for (let j = i + 1; j < cand.length; j++) {
        const x = cand[i];
        const y = cand[j];
        if (x.P === y.P) continue;
        if (Math.abs(x.e.lenMm - y.e.lenMm) / Math.max(x.e.lenMm, y.e.lenMm) > maxEase) continue;
        const A = pathOf([x.e.id]);
        const B = pathOf([y.e.id]);
        if (!A || !B) continue;
        const d0 = meanDist(A, B, false, [0, 1], [0, 1]);
        const d1 = meanDist(A, B, true, [0, 1], [0, 1]);
        const gap = Math.min(d0, d1);
        // Running alongside each other, not merely near (two parts of one armhole are near too).
        const g = rowGaps(pos, seamRows(A, B, d1 < d0));
        const gmax = g.length ? Math.max(...g) : Infinity;
        const gmin = g.length ? Math.min(...g) : 0;
        const len = Math.max(A.len, B.len);
        // Parallel (a slit, a gap): the gap is about even. Two arms of one opening (the front and
        // back halves of an armhole) touch at one end and part at the other.
        const even = gap < 8 || gmin >= 0.35 * gap;
        if (opt.debug && gap <= 2 * maxGap)
          warnings.push(
            `debug: facing? ${x.e.id}~${y.e.id} mean ${gap.toFixed(0)} min ${gmin.toFixed(0)} max ${gmax.toFixed(0)} len ${len.toFixed(0)}`,
          );
        if (gap <= maxGap && even && gmax <= Math.max(40, 0.25 * len))
          out.push({ x, y, gap, same: d1 < d0 });
      }
    out.sort((p, q) => p.gap - q.gap);
    const taken = new Set<string>();
    return out.filter((o) => {
      if (taken.has(o.x.e.id) || taken.has(o.y.e.id)) return false;
      taken.add(o.x.e.id);
      taken.add(o.y.e.id);
      return true;
    });
  };
  // Declared joins still without any seam between their two sides: when two free edges of those
  // pieces face each other once placed, that IS the declared seam (the order says these pieces are
  // sewn; the placement says along which edges).
  const declaredOpen = new Map<string, string>();
  {
    const linkedP = new Set<string>();
    for (const sc of graph.chosen)
      for (const a of (sc.aParts ?? [sc.a]).map(pk))
        for (const b of (sc.bParts ?? [sc.b]).map(pk)) linkedP.add(`${a}|${b}`).add(`${b}|${a}`);
    const geomMap = new Map(graph.pieces.map((g) => [g.pieceKey, g]));
    for (const J of declaredJoins ?? [])
      J.parts.forEach((X, i) =>
        J.parts.forEach((Y, j) => {
          if (j <= i) return;
          if (X.some((a) => Y.some((b) => linkedP.has(`${a}|${b}`)))) return;
          // Left and right units beside a third part both go onto that part, never onto each
          // other (joins.ts: the same rule for the order's edge search).
          if (J.parts.length >= 3 && twinUnits(X, Y, geomMap)) return;
          for (const a of X)
            for (const b of Y) declaredOpen.set(`${a}|${b}`, J.label).set(`${b}|${a}`, J.label);
        }),
      );
  }
  for (const f of owner ? [] : facingPairs(new Set(['BODY']), 100, 0.15)) {
    const A = pathOf([f.x.e.id])!;
    const B = pathOf([f.y.e.id])!;
    const Px = panelByKey.get(pk(f.x.e.id));
    const Py = panelByKey.get(pk(f.y.e.id));
    // Two strip ends facing (two plackets end to end): never the declared seam.
    const stripEnds = !!Px && !!Py && isStripEnd(Px.geom, f.x.e) && isStripEnd(Py.geom, f.y.e);
    const declared = stripEnds ? undefined : declaredOpen.get(`${pk(f.x.e.id)}|${pk(f.y.e.id)}`);
    // Two fronts facing each other: the front opening, never a declared seam.
    const frontPair =
      !!Px &&
      !!Py &&
      Px.role !== 'back' &&
      Py.role !== 'back' &&
      Px.geom.hand !== null &&
      Py.geom.hand !== null &&
      Px.geom.hand !== Py.geom.hand;
    if (declared && !frontPair) {
      addWork(
        {
          id: `${f.x.e.id}~${f.y.e.id}`,
          a: [f.x.e.id],
          b: [f.y.e.id],
          kind: 'proposed-composite',
          origin: 'doll-proposed',
          A,
          B,
          target: 0.8,
          note: `proposed (from the technologist's order «${declared}») · ${f.x.e.id} (${f.x.e.lenMm.toFixed(0)} mm) and ${f.y.e.id} (${f.y.e.lenMm.toFixed(0)} mm) face each other ${f.gap.toFixed(0)} mm apart once placed`,
          forceSame: f.same,
        },
        passes,
        200,
      );
      orderJoins.push({
        join: declared,
        seam: `${f.x.e.id}~${f.y.e.id}`,
        note: 'free edges facing each other once placed',
      });
      continue;
    }
    // Mirror halves facing on their centre lines (both running up the pieces): the opening of the
    // garment left free — a closure (buttons / zip), said as such, not «a seam the pattern has not
    // got» (11.10 corpus: SS26-006's two fronts, 544 mm, reported open).
    const upE = (e: Edge) => {
      const p = e.pts[0];
      const q = e.pts[e.pts.length - 1];
      return Math.atan2(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1])) <= Math.PI / 6;
    };
    const opening =
      frontPair &&
      !!Px &&
      !!Py &&
      // a front's opening runs the garment's length (never a yoke's or a back's short edge)
      ![Px.role, Py.role].some((r) => r === 'back' || r === 'yoke') &&
      Math.min(f.x.e.lenMm, f.y.e.lenMm) >= 300 &&
      Px.geom.twinOf.some((t) => t.key === Py.key && t.kind === 'mirror') &&
      upE(f.x.e) &&
      upE(f.y.e);
    if (opening) {
      const w = addWork(
        {
          id: `${f.x.e.id}~${f.y.e.id}`,
          a: [f.x.e.id],
          b: [f.y.e.id],
          kind: 'proposed-closure',
          origin: 'doll-proposed',
          A,
          B,
          target: 0,
          note: `the front opening — ${f.x.e.id} and ${f.y.e.id} (${f.x.e.lenMm.toFixed(0)} mm) are the mirror halves' centre lines, facing ${f.gap.toFixed(0)} mm apart, free: a closure (buttons / zip), drawn open — not a seam`,
          forceSame: f.same,
        },
        passes,
        1,
      );
      w.virtual = true;
      w.solver.active = false;
      continue;
    }
    const w = addWork(
      {
        id: `${f.x.e.id}~${f.y.e.id}`,
        a: [f.x.e.id],
        b: [f.y.e.id],
        kind: 'facing-free',
        origin: 'doll-proposed',
        A,
        B,
        target: 0,
        note: `open — ${f.x.e.id} (${f.x.e.lenMm.toFixed(0)} mm) and ${f.y.e.id} (${f.y.e.lenMm.toFixed(0)} mm) face each other ${f.gap.toFixed(0)} mm apart, both free: a seam the pattern has not got (not sewn by the doll)`,
        forceSame: f.same,
      },
      passes,
      1,
    );
    w.virtual = true;
    w.solver.active = false;
  }

  for (let v = 0; v < N; v++) moving[v] = bodyLike.has(groupOfV[v]) && placed[v] ? 1 : 0;
  run(Math.min(450, maxPasses));
  releaseRounds(3, 100, 30, 15);

  // ── loops of the body after phase 1 ─────────────────────────────────────────────────────
  const activeSeams = () =>
    works
      .filter((w) => !w.released)
      .map((w) => ({ A: w.A, B: w.B, same: w.same, aRange: w.aRange, bRange: w.bRange }));
  const loopsOf = (gids: Set<DollGroupId>) => {
    const set = new Set(panels.filter((P) => gids.has(P.group)).map((P) => P.idx));
    return findLoops({ panels, panelOf, ringOf, uv, seams: activeSeams() }, set);
  };
  const centroid = (vs: number[]): Vec3 => {
    const c: Vec3 = [0, 0, 0];
    for (const v of vs) {
      c[0] += pos[3 * v];
      c[1] += pos[3 * v + 1];
      c[2] += pos[3 * v + 2];
    }
    return [c[0] / vs.length, c[1] / vs.length, c[2] / vs.length];
  };
  const bodyLoops = loopsOf(new Set(['BODY']));
  let neckLoop: RawLoop | null = null;
  let hemLoop: RawLoop | null = null;
  const armLoop: Record<'L' | 'R', RawLoop | null> = { L: null, R: null };
  const aArmNow = torso.length ? torsoAt(vArm)!.a : 200;
  {
    const big = bodyLoops.filter((l) => l.len > 150);
    const cs = big.map((l) => ({ l, c: centroid(l.verts) }));
    const byY = [...cs].sort((x, y) => x.c[1] - y.c[1]);
    if (byY.length) hemLoop = byY[0].l;
    for (const s of ['L', 'R'] as const) {
      const cand = cs.filter(
        (x) => x.l !== hemLoop && (s === 'L' ? x.c[0] > 0.45 * aArmNow : x.c[0] < -0.45 * aArmNow),
      );
      cand.sort((x, y) => y.l.len - x.l.len);
      armLoop[s] = cand[0]?.l ?? null;
    }
    const necks = cs.filter(
      (x) =>
        x.l !== hemLoop &&
        x.l !== armLoop.L &&
        x.l !== armLoop.R &&
        Math.abs(x.c[0]) < 0.45 * aArmNow,
    );
    necks.sort((x, y) => y.c[1] - x.c[1]);
    neckLoop = necks[0]?.l ?? null;
  }

  if (opt.debug) {
    warnings.push(
      `debug: vArm ${vArm.toFixed(0)} vSh ${vSh.toFixed(0)} vLo ${vLo.toFixed(0)} torso a@arm ${aArmNow.toFixed(0)}`,
    );
    for (const l of bodyLoops) {
      const c = centroid(l.verts);
      warnings.push(
        `debug: body loop ${l.len.toFixed(0)} mm closed ${l.closed} c=${c.map((x) => x.toFixed(0)).join(',')} pieces ${[...l.panels].map((i) => panels[i].key).join(',')}`,
      );
    }
  }
  // ── place the rest on those loops ───────────────────────────────────────────────────────
  type Frame = { c: Vec3; up: Vec3; e0: Vec3; e90: Vec3 };
  const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [
    a[0] + b[0] * k,
    a[1] + b[1] * k,
    a[2] + b[2] * k,
  ];
  const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const inFrame = (F: Frame, p: Vec3) => {
    const d = sub(p, F.c);
    const hh = dot(d, F.up);
    const x0 = dot(d, F.e0);
    const x9 = dot(d, F.e90);
    return { h: hh, th: Math.atan2(x9, x0), r: Math.hypot(x0, x9) };
  };
  const fromFrame = (F: Frame, th: number, hh: number, r: number): Vec3 =>
    add(add(add(F.c, F.up, hh), F.e0, r * Math.cos(th)), F.e90, r * Math.sin(th));

  /** Base curve (a loop / run in 3D) sampled by azimuth around a frame: radius and height. */
  const baseOf = (F: Frame, verts: number[]) => {
    const B = 72;
    const r = new Array<number>(B).fill(NaN);
    const hh = new Array<number>(B).fill(NaN);
    for (const v of verts) {
      const q = inFrame(F, getPos(v));
      const k = Math.round(((((q.th % TAU) + TAU) % TAU) / TAU) * B) % B;
      r[k] = Number.isNaN(r[k]) ? q.r : (r[k] + q.r) / 2;
      hh[k] = Number.isNaN(hh[k]) ? q.h : (hh[k] + q.h) / 2;
    }
    for (const arr of [r, hh]) {
      const known = arr.map((x, i) => [x, i] as const).filter(([x]) => !Number.isNaN(x));
      if (!known.length) arr.fill(0);
      for (let i = 0; i < B; i++) {
        if (!Number.isNaN(arr[i])) continue;
        let best = known[0];
        let bd = Infinity;
        for (const kk of known) {
          const d = Math.min(Math.abs(kk[1] - i), B - Math.abs(kk[1] - i));
          if (d < bd) [best, bd] = [kk, d];
        }
        arr[i] = best[0];
      }
    }
    const at = (arr: number[], th: number) => {
      const f = ((((th % TAU) + TAU) % TAU) / TAU) * B;
      const i = Math.floor(f) % B;
      const w = f - Math.floor(f);
      return arr[i] * (1 - w) + arr[(i + 1) % B] * w;
    };
    return { r: (th: number) => at(r, th), h: (th: number) => at(hh, th) };
  };

  /** Split a strip's whole contour into its bottom and top runs (between the two u-extremes). */
  const stripRuns = (list: Panel[]) => {
    const loops = loopsOf(new Set([list[0].group]));
    const L = [...loops].sort((x, y) => y.len - x.len)[0];
    if (!L) return null;
    const vs = L.verts;
    let iMin = 0;
    let iMax = 0;
    for (let k = 0; k < vs.length; k++) {
      if (cuv[2 * vs[k]] < cuv[2 * vs[iMin]]) iMin = k;
      if (cuv[2 * vs[k]] > cuv[2 * vs[iMax]]) iMax = k;
    }
    const arc = (from: number, to: number) => {
      const out: number[] = [];
      for (let k = from; ; k = (k + 1) % vs.length) {
        out.push(vs[k]);
        if (k === to) break;
      }
      return out;
    };
    const r1 = arc(iMin, iMax);
    const r2 = arc(iMax, iMin);
    const mv = (r: number[]) => r.reduce((t, v) => t + cuv[2 * v + 1], 0) / r.length;
    return mv(r1) < mv(r2)
      ? { bottom: r1, top: r2, closed: L.closed }
      : { bottom: r2, top: r1, closed: L.closed };
  };

  /** Wrap a ring group (stand, collar, cuff, band) onto a base curve. */
  const placeRing = (
    gid: DollGroupId,
    F: Frame,
    base: number[] | null,
    rFallback: number,
    attach: 'bottom' | 'top',
    th0: number,
    layer: number,
    /** L4: the strip is laid turned 180° (its attach run is the chart's top; the rest goes up). */
    flip = false,
  ) => {
    const list = groups.get(gid);
    const ch = charts.get(gid);
    if (!list || !ch) return null;
    const runs = stripRuns(list);
    const bot = attach === 'bottom' ? runs?.bottom : runs?.top;
    // u → v of the attached run (chart), for the height above it.
    const runPts = (bot ?? [])
      .map((v) => [cuv[2 * v], cuv[2 * v + 1]] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const runV = (u: number) => {
      if (!runPts.length) return 0;
      if (u <= runPts[0][0]) return runPts[0][1];
      for (let k = 1; k < runPts.length; k++)
        if (runPts[k][0] >= u) {
          const a = runPts[k - 1];
          const b = runPts[k];
          const w = b[0] > a[0] ? (u - a[0]) / (b[0] - a[0]) : 0;
          return a[1] + (b[1] - a[1]) * w;
        }
      return runPts[runPts.length - 1][1];
    };
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const P of list)
      for (let r = 0; r < P.nb; r++) {
        x0 = Math.min(x0, cuv[2 * (P.offset + r)]);
        x1 = Math.max(x1, cuv[2 * (P.offset + r)]);
      }
    const uC = (x0 + x1) / 2;
    const B = base && base.length ? baseOf(F, base) : null;
    const rad = (th: number) => (B ? B.r(th) : rFallback) + layer;
    // Arc length along the base by azimuth, so the ring keeps its own width (paper).
    const KA = 360;
    const arc = new Float64Array(KA + 1);
    for (let k = 1; k <= KA; k++) arc[k] = arc[k - 1] + (rad((TAU * (k - 0.5)) / KA) * TAU) / KA;
    const arcAt = (th: number) => {
      const f = ((((th % TAU) + TAU) % TAU) / TAU) * KA;
      const i = Math.floor(f);
      return arc[i] + (arc[Math.min(KA, i + 1)] - arc[i]) * (f - i);
    };
    const thAt = (s: number) => {
      const tot = arc[KA];
      const q = ((s % tot) + tot) % tot;
      let lo = 0;
      let hi = KA;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (arc[m] <= q) lo = m;
        else hi = m;
      }
      return (TAU * (lo + (q - arc[lo]) / Math.max(1e-9, arc[hi] - arc[lo]))) / KA;
    };
    const s0 = arcAt(th0);
    const ringProxy: Proxy = {
      push(p, i) {
        const q = inFrame(F, [p[3 * i], p[3 * i + 1], p[3 * i + 2]]);
        const R = rad(q.th) * PROXY_K;
        if (q.r >= R || q.r < 1e-6) return;
        const np = fromFrame(F, q.th, q.h, R);
        p[3 * i] = np[0];
        p[3 * i + 1] = np[1];
        p[3 * i + 2] = np[2];
      },
      pull() {},
    };
    const pi = proxies.push(ringProxy) - 1;
    for (const P of list) {
      buildPanelLater.push(P);
      for (let i = 0; i < P.count; i++) {
        const v = P.offset + i;
        const u = cuv[2 * v];
        const vv = cuv[2 * v + 1];
        const th = thAt(s0 + (flip ? uC - u : u - uC));
        const above = flip ? runV(u) - vv : attach === 'bottom' ? vv - runV(u) : vv - runV(u);
        const hh = (B ? B.h(th) : 0) + above;
        setPos(v, fromFrame(F, th, hh, rad(th)));
        proxyOf[v] = pi;
        placed[v] = 1;
      }
    }
    proxyReport.push({
      group: gid,
      kind: 'ring',
      profile: [[0, rFallback, rFallback]],
      origin: F.c,
      axis: F.up,
    });
    return runs;
  };
  const buildPanelLater: Panel[] = [];

  /** Pattern edges a vertex path runs along (for the report's sides). */
  const edgesOn = (P: Path) => {
    const out = new Set<string>();
    for (const v of P.v) {
      const Pn = panels[panelOf[v]];
      const r = ringOf[v];
      if (r < 0) continue;
      const rsI = Pn.mesh.bRs[r];
      const n = Pn.geom.rs.length;
      for (const e of Pn.geom.edges) {
        const span = (((e.e - e.s) % n) + n) % n;
        const off = (((rsI - e.s) % n) + n) % n;
        if (off > 0 && off < span) out.add(e.id);
      }
    }
    return [...out];
  };
  const proposals: { gid: DollGroupId; label: string; ok: boolean; note: string }[] = [];
  /** Propose a join between two vertex runs / loops (cut closed loops at their lowest / front point). */
  const ringInfo = { ringOf, nbOf: (p: number) => panels[p].nb };
  const propose = (
    label: string,
    A0: { verts: number[]; closed: boolean },
    B0: { verts: number[]; closed: boolean },
    cutAt: 'lowest' | 'front' | 'nearest',
    gid: DollGroupId,
    maxEase = 0.25,
    /** Pull of the proposal (a band on the legs' top holds on, never drags the crotch round). */
    stiff = 0.7,
    /**
     * A band onto a pleated / darted edge: the intake marked on B (notch pairs, dart slits —
     * foldPlanFor) is folded closed before the lengths are compared, and the band is mapped by
     * anchored arc length so each fold lands on one point of it. Paper cannot gather: the fold
     * shows as strain on the body side, said in the words.
     */
    foldB = false,
  ) => {
    if (owner) return null;
    const cutIdx = (L: { verts: number[] }, ref?: Vec3) => {
      let best = 0;
      for (let k = 0; k < L.verts.length; k++) {
        const p = getPos(L.verts[k]);
        const q = getPos(L.verts[best]);
        if (cutAt === 'lowest' && p[1] < q[1]) best = k;
        if (cutAt === 'front' && p[2] > q[2]) best = k;
        if (cutAt === 'nearest' && ref && Math.hypot(...sub(p, ref)) < Math.hypot(...sub(q, ref)))
          best = k;
      }
      return best;
    };
    let A: Path;
    let B: Path;
    if (A0.closed && B0.closed) {
      A = loopPath(A0.verts, uv, panelOf, cutIdx(A0), true, ringInfo);
      B = loopPath(B0.verts, uv, panelOf, cutIdx(B0), true, ringInfo);
    } else if (!A0.closed && B0.closed) {
      A = loopPath(A0.verts, uv, panelOf, 0, false, ringInfo);
      const mid = getPos(A0.verts[0]);
      const end = getPos(A0.verts[A0.verts.length - 1]);
      const ref: Vec3 = [(mid[0] + end[0]) / 2, (mid[1] + end[1]) / 2, (mid[2] + end[2]) / 2];
      B = loopPath(
        B0.verts,
        uv,
        panelOf,
        cutAt === 'nearest' ? cutIdx(B0, ref) : cutIdx(B0),
        true,
        ringInfo,
      );
    } else {
      A = loopPath(A0.verts, uv, panelOf, 0, false, ringInfo);
      B = loopPath(B0.verts, uv, panelOf, 0, false, ringInfo);
    }
    // The raw lengths decide whether the pairing is proposed at all; folds (evidence on B: pleat
    // pairs, darts) only re-read the ease of a pairing already accepted — never rescue one.
    const rawEase = 1 - Math.min(A.len, B.len) / Math.max(A.len, B.len, 1e-9);
    const plan = foldB && rawEase <= maxEase ? foldEvidence(B) : null;
    const Le = plan ? plan.Le : B.len;
    const ratio = Math.min(A.len, Le) / Math.max(A.len, Le, 1e-9);
    const ease = plan ? 1 - ratio : rawEase;
    const foldWords = plan
      ? ` − ${(B.len - plan.Le).toFixed(0)} mm folded closed (${plan.folds.length} pleat${plan.folds.length > 1 ? 's' : ''} / dart${plan.folds.length > 1 ? 's' : ''} marked on it: ${plan.folds.map((f) => (f[1] - f[0]).toFixed(0)).join(' + ')} mm) = ${plan.Le.toFixed(0)}`
      : '';
    const words = `${A.len.toFixed(0)} ≈ ${B.len.toFixed(0)}${foldWords} mm, ${ease < 0.015 ? 'equal' : `${A.len > Le && plan ? 'the band longer, ' : ''}eased ${(ease * 100).toFixed(0)} %`}`;
    if (rawEase > maxEase) {
      proposals.push({
        gid,
        label,
        ok: false,
        note: `${label} not proposed — lengths ${A.len.toFixed(0)} vs ${B.len.toFixed(0)} mm differ ${(ease * 100).toFixed(0)} %`,
      });
      warnings.push(
        `${label}: not proposed — lengths ${A.len.toFixed(0)} vs ${B.len.toFixed(0)} mm differ ${(ease * 100).toFixed(0)} %`,
      );
      return null;
    }
    const note = `proposed by the doll · ${label} · ${words} · not in the pattern`;
    if (plan) {
      // Anchors (arc on the band, arc on the path): the folded path's arc scaled onto the band;
      // each fold's two ends meet at one point of the band (0.3 mm apart, strictly increasing).
      const anchorsFor = (Ap: Path): [number, number][] => {
        const eff = (sv: number) => {
          let out = sv;
          for (const [f0, f1] of plan.folds) {
            if (sv >= f1) out -= f1 - f0;
            else if (sv > f0) out -= sv - f0;
          }
          return out;
        };
        const sc = Ap.len / Math.max(1e-9, plan.Le);
        const an: [number, number][] = [[0, 0]];
        for (const [f0, f1] of plan.folds) {
          const x = eff(f0) * sc;
          an.push([x - 0.3, f0], [x + 0.3, f1]);
        }
        an.push([Ap.len, B.len]);
        const out: [number, number][] = [];
        for (const q of an)
          if (
            !out.length ||
            (q[0] > out[out.length - 1][0] + 0.1 && q[1] > out[out.length - 1][1] + 0.1)
          )
            out.push(q);
        return out;
      };
      // Which way round the band runs along the path: the way its points lie nearer now.
      const meanGap = (Ap: Path) => {
        const g = rowGaps(pos, anchoredRows(Ap, B, anchorsFor(Ap)));
        return g.reduce((x, y) => x + y, 0) / Math.max(1, g.length);
      };
      const Ar = revPath(A);
      const A1 = meanGap(Ar) < meanGap(A) ? Ar : A;
      const w = anchoredWork(label, A1, B, anchorsFor(A1), note, stiff, (sb) =>
        plan.folds.some(([f0, f1]) => sb > f0 + 0.5 && sb < f1 - 0.5),
      );
      w.foldedMm = B.len - plan.Le;
      if (l4 && isExcluded(w.a, w.b)) {
        w.rejectedByPerson = true;
        w.released = true;
        w.solver.active = false;
        warnings.push(`${w.id}: not proposed — a person rejected this pair`);
      }
      proposals.push({ gid, label, ok: true, note: w.note });
      return w;
    }
    const w = addWork(
      {
        id: label,
        a: edgesOn(A),
        b: edgesOn(B),
        kind: 'proposed-composite',
        origin: 'doll-proposed',
        A,
        B,
        target: stiff,
        note,
      },
      passes,
      120,
    );
    proposals.push({ gid, label, ok: true, note: w.note });
    return w;
  };

  // Graph seams between the body and another group (rare: the graph found a composite).
  const graphTouches = (g1: DollGroupId, g2: Set<DollGroupId>) =>
    G.seams.some((s) => {
      const ga = panelByKey.get(pk(s.a[0]))?.group;
      const gb = panelByKey.get(pk(s.b[0]))?.group;
      return (ga === g1 && gb && g2.has(gb)) || (gb === g1 && ga && g2.has(ga));
    });

  // A graph seam between a placed group and the body counts only when its two sides are near
  // each other once placed; one that spans the doll (a sleeve's underarm onto the yoke) is a wrong
  // pairing and is released at once instead of crumpling the sleeve on its way across.
  const FAR = 150;
  /**
   * The gap between a seam.s two sides as sewn (sewnSide: parts walked in order, cut to their
   * stretches and the row.s range) — a side of several parts concatenated in their own ring
   * directions zigzags, and its mean distance says nothing about the seam.
   */
  const gapOf = (sm: GroupedSeam) => {
    const A = sewnSide(sm, 'a');
    const B = sewnSide(sm, 'b');
    if (!A || !B) return Infinity;
    return Math.min(meanDist(A, B, true, [0, 1], [0, 1]), meanDist(A, B, false, [0, 1], [0, 1]));
  };
  const sewnNear = (g1: DollGroupId, g2: DollGroupId) =>
    G.seams.some((sm) => {
      const ga = panelByKey.get(pk(sm.a[0]))?.group;
      const gb = panelByKey.get(pk(sm.b[0]))?.group;
      return ((ga === g1 && gb === g2) || (gb === g1 && ga === g2)) && gapOf(sm) < FAR;
    });
  const a = (Math.PI / 180) * ARM_DEG;
  const sleeveFrames: Partial<Record<'L' | 'R', Frame>> = {};
  const sleeveRegistered = new Set<DollGroupId>();
  const sleeveProxyReport = new Map<DollGroupId, DollProxy>();
  const sleeveCapFloor = new Map<DollGroupId, number>();
  type RigidFit = {
    score: number;
    point: (p: Vec3) => Vec3;
    vector: (v: Vec3) => Vec3;
  };
  /** Least-squares rigid registration (Horn quaternion fit): no scale and no cloth deformation. */
  const rigidFit = (from: Vec3[], to: Vec3[]): RigidFit | null => {
    if (from.length !== to.length || from.length < 3) return null;
    const mean = (pts: Vec3[]): Vec3 => {
      const c: Vec3 = [0, 0, 0];
      for (const p of pts) for (let q = 0; q < 3; q++) c[q] += p[q];
      return [c[0] / pts.length, c[1] / pts.length, c[2] / pts.length];
    };
    const ca = mean(from);
    const cb = mean(to);
    const S = Array.from({ length: 3 }, () => [0, 0, 0]);
    for (let i = 0; i < from.length; i++) {
      const x = sub(from[i], ca);
      const y = sub(to[i], cb);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r][c] += x[r] * y[c];
    }
    const [xx, xy, xz] = S[0];
    const [yx, yy, yz] = S[1];
    const [zx, zy, zz] = S[2];
    const N = [
      [xx + yy + zz, yz - zy, zx - xz, xy - yx],
      [yz - zy, xx - yy - zz, xy + yx, zx + xz],
      [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
      [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
    ];
    // Shift the symmetric matrix so power iteration finds its largest algebraic eigenvalue.
    const shift = Math.max(...N.map((row) => row.reduce((t, x) => t + Math.abs(x), 0))) + 1;
    let q = [1, 0.5, -0.25, 0.75];
    for (let k = 0; k < 40; k++) {
      const z = N.map((row, r) => row.reduce((t, x, c) => t + x * q[c], shift * q[r]));
      const l = Math.hypot(...z) || 1;
      q = z.map((x) => x / l);
    }
    const [qw, qx, qy, qz] = q;
    const vector = (v: Vec3): Vec3 => [
      (1 - 2 * (qy * qy + qz * qz)) * v[0] +
        2 * (qx * qy - qw * qz) * v[1] +
        2 * (qx * qz + qw * qy) * v[2],
      2 * (qx * qy + qw * qz) * v[0] +
        (1 - 2 * (qx * qx + qz * qz)) * v[1] +
        2 * (qy * qz - qw * qx) * v[2],
      2 * (qx * qz - qw * qy) * v[0] +
        2 * (qy * qz + qw * qx) * v[1] +
        (1 - 2 * (qx * qx + qy * qy)) * v[2],
    ];
    const rca = vector(ca);
    const move = sub(cb, rca);
    const point = (p: Vec3): Vec3 => add(vector(p), move);
    const score = Math.sqrt(
      from.reduce((t, p, i) => {
        const d = sub(point(p), to[i]);
        return t + dot(d, d);
      }, 0) / from.length,
    );
    return { score, point, vector };
  };
  const samplePath = (P: Path, t: number): Vec3 => {
    const s = Math.max(0, Math.min(P.len, t * P.len));
    let lo = 0;
    let hi = P.s.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (P.s[m] <= s) lo = m;
      else hi = m;
    }
    const d = P.s[hi] - P.s[lo];
    const w = d > 1e-9 ? (s - P.s[lo]) / d : 0;
    const a0 = getPos(P.v[lo]);
    const a1 = getPos(P.v[hi]);
    return add(a0, sub(a1, a0), w);
  };
  const pathGap = (A: Path, B: Path) => {
    const toPath = (p: Vec3, Q: Path) => {
      let best = Infinity;
      for (let i = 1; i < Q.v.length; i++) {
        const a0 = getPos(Q.v[i - 1]);
        const d = sub(getPos(Q.v[i]), a0);
        const l2 = dot(d, d);
        const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a0), d) / l2)) : 0;
        best = Math.min(best, Math.hypot(...sub(p, add(a0, d, t))));
      }
      return best;
    };
    const gaps: number[] = [];
    for (let k = 0; k < 32; k++) {
      const t = k / 31;
      gaps.push(toPath(samplePath(A, t), B), toPath(samplePath(B, t), A));
    }
    gaps.sort((x, y) => x - y);
    return gaps[Math.floor(0.95 * (gaps.length - 1))] ?? Infinity;
  };
  const pathOfVerts = (verts: number[], closed: boolean): Path | null => {
    const v = [...verts];
    if (closed && v.length > 2 && v[0] !== v[v.length - 1]) v.push(v[0]);
    if (v.length < 2) return null;
    const s = [0];
    for (let i = 1; i < v.length; i++)
      s.push(s[i - 1] + Math.hypot(...sub(getPos(v[i]), getPos(v[i - 1]))));
    return { v: Int32Array.from(v), s: Float64Array.from(s), len: s[s.length - 1] };
  };
  // `arm`: the sleeve's direction down the arm as placed — its x says which side of the doll the
  // sleeve hangs on. A cap and an armhole are both near-flat rings, so a turn through the body
  // registers them as well as the true one; a fit that swings the arm to the other side is refused.
  const fitPaths = (
    pairs: { sleeve: Path; body: Path; bodyClosed?: boolean }[],
    arm?: Vec3,
  ): RigidFit | null => {
    let best: RigidFit | null = null;
    const phases = pairs.some((p) => p.bodyClosed)
      ? Array.from({ length: 24 }, (_, k) => k / 24)
      : [0];
    for (const reverse of [false, true])
      for (const phase of phases) {
        const from: Vec3[] = [];
        const to: Vec3[] = [];
        for (const pair of pairs)
          for (let k = 0; k < 32; k++) {
            const t = k / 31;
            const bt = pair.bodyClosed ? ((reverse ? -t : t) + phase + 2) % 1 : reverse ? 1 - t : t;
            from.push(samplePath(pair.sleeve, t));
            to.push(samplePath(pair.body, bt));
          }
        const fit = rigidFit(from, to);
        if (arm && fit && fit.vector(arm)[0] * Math.sign(arm[0]) <= 0) continue;
        if (fit && (!best || fit.score < best.score)) best = fit;
      }
    return best;
  };
  const applySleeveFit = (gid: DollGroupId, list: Panel[], F: Frame, fit: RigidFit | null) => {
    if (!fit) return;
    for (const P of list)
      for (let i = 0; i < P.count; i++) {
        const v = P.offset + i;
        setPos(v, fit.point(getPos(v)));
      }
    F.c = fit.point(F.c);
    F.up = fit.vector(F.up);
    F.e0 = fit.vector(F.e0);
    F.e90 = fit.vector(F.e90);
    const rep = sleeveProxyReport.get(gid);
    if (rep) {
      rep.origin = F.c;
      rep.axis = [-F.up[0], -F.up[1], -F.up[2]];
    }
    sleeveRegistered.add(gid);
  };
  // Which armhole a sleeve goes to: its hand, unless the graph sews it to body edges that sit on
  // the other side of the doll (sleeve hands swapped, or a back drawn as seen from the front) —
  // then the seams win and the swap is reported.
  const armSide: Record<'L' | 'R', 'L' | 'R'> = { L: 'L', R: 'R' };
  {
    const vote: Record<'L' | 'R', number> = { L: 0, R: 0 };
    for (const s of ['L', 'R'] as const) {
      const gid: DollGroupId = s === 'L' ? 'SLEEVE_L' : 'SLEEVE_R';
      for (const sm of G.seams) {
        const ga = panelByKey.get(pk(sm.a[0]))?.group;
        const gb = panelByKey.get(pk(sm.b[0]))?.group;
        const bodySide =
          ga === gid && gb === 'BODY' ? sm.b : gb === gid && ga === 'BODY' ? sm.a : null;
        if (!bodySide) continue;
        const B = pathOf(bodySide);
        if (!B) continue;
        const x = [...B.v].reduce((t, v) => t + pos[3 * v], 0) / B.v.length;
        vote[s] += Math.sign(x) * B.len;
      }
    }
    if (vote.L < 0 && vote.R > 0) {
      armSide.L = 'R';
      armSide.R = 'L';
      warnings.push(
        "the graph sews the left sleeve to the doll's right armhole and the right sleeve to the left — sleeve hands swapped, or the back is drawn as seen from the front; the sleeves are put where the seams say",
      );
    }
  }
  for (const s of ['L', 'R'] as const) {
    const gid: DollGroupId = s === 'L' ? 'SLEEVE_L' : 'SLEEVE_R';
    const list = groups.get(gid);
    const ch = charts.get(gid);
    if (!list || !ch) continue;
    const side = armSide[s];
    const sg = side === 'L' ? 1 : -1;
    const main = ch.components[0].keys.map((k) => panelByKey.get(k)!);
    const [lo, hi] = vRange(main);
    const Wv = widthTable(main, lo, hi, 250);
    let vW = lo;
    let wMax = 0;
    for (let v = lo + 5; v < hi - 5; v += 5) {
      const w = Wv(v);
      if (w > wMax) [vW, wMax] = [v, w];
    }
    const capH = Math.max(40, hi - vW);
    sleeveCapFloor.set(gid, vW);
    // Cap apex: the top-most chart point.
    let uApex = 0;
    let best = -Infinity;
    for (const P of main)
      for (let r = 0; r < P.nb; r++) {
        const v = P.offset + r;
        if (cuv[2 * v + 1] > best) [best, uApex] = [cuv[2 * v + 1], cuv[2 * v]];
      }
    // Where the tube goes: the body's free armhole loop; without one (open shoulders — SS26-008:
    // the front and back armholes never join into a loop) the graph's own seams from this
    // sleeve onto body pieces say where the opening is — the sleeve is set on their body side and
    // the seam judged after, instead of a guess 290 mm away that the far-apart rule then refuses.
    const graphSeams = G.seams.flatMap((sm) => {
      // A stored composite armhole can start with a surface piece and then continue around body
      // panels. The cap side must be wholly this sleeve; the target need only contain body edges.
      const touchesBody = (ids: EdgeId[]) =>
        ids.some((id) => panelByKey.get(pk(id))?.group === 'BODY');
      const sleeveSide = inGroups(sm.a, new Set([gid]))
        ? touchesBody(sm.b)
          ? ('a' as const)
          : null
        : inGroups(sm.b, new Set([gid])) && touchesBody(sm.a)
          ? ('b' as const)
          : null;
      if (!sleeveSide) return [];
      const sleeve = sewnSide(sm, sleeveSide);
      const bodySide = sleeveSide === 'a' ? 'b' : 'a';
      const targetIds = bodySide === 'a' ? sm.a : sm.b;
      const bodyIds = targetIds.filter((id) => panelByKey.get(pk(id))?.group === 'BODY');
      // Owner surface placement happens after the solve. If such a piece starts the stored
      // composite, its edge is not drawable yet; the remaining body run is still the armhole cue.
      const body = sewnSide(sm, bodySide) ?? pathOf(bodyIds);
      if (!sleeve || !body) return [];
      // A multi-part body run is the composite armhole. A lone cross-group pairing may instead be
      // the bad underarm-to-yoke reading that the far/release checks below must still be free to drop.
      if (targetIds.length > 1) sleeveCapSeams.add(sm);
      return [{ sleeve, body }];
    });
    // Confirmed rows that no operation names are not sewing work in owner mode, but they remain
    // exact placement topology. This is how an omitted cap row can register a sleeve without the
    // doll claiming that the operation sewed it.
    const cuesOf = (candidates: readonly SeamCandidate[]) =>
      candidates.flatMap((candidate) => {
        const ids = (side: 'a' | 'b') =>
          (side === 'a'
            ? candidate.aParts ?? edgeIdsOf(candidate.a)
            : candidate.bParts ?? edgeIdsOf(candidate.b)
          ).flatMap(edgeIdsOf);
        const aIds = ids('a');
        const bIds = ids('b');
        const allSleeve = (xs: EdgeId[]) =>
          xs.length > 0 && xs.every((id) => panelByKey.get(pk(id))?.group === gid);
        const bodyIds = (xs: EdgeId[]) =>
          xs.filter((id) => panelByKey.get(pk(id))?.group === 'BODY');
        const sleeveIds = allSleeve(aIds) ? aIds : allSleeve(bIds) ? bIds : [];
        const targetIds =
          sleeveIds === aIds ? bodyIds(bIds) : sleeveIds === bIds ? bodyIds(aIds) : [];
        const sleeve = pathOf(sleeveIds);
        const body = pathOf(targetIds);
        return sleeve && body ? [{ sleeve, body }] : [];
      });
    const selectedCues = cuesOf(resolvedRows?.forced ?? []);
    const confirmedCues = cuesOf(joinsNotSewn);
    const placementSeams = graphSeams.length
      ? graphSeams
      : selectedCues.length
        ? selectedCues
        : confirmedCues;
    const graphArm = placementSeams.flatMap(({ body }) => [...body.v]);
    if (!armLoop[side] && graphArm.length)
      warnings.push(
        `${s === 'L' ? 'left' : 'right'} sleeve: the body has no ${side === 'L' ? 'left' : 'right'} armhole loop — set on the body edges the graph sews it to`,
      );
    const J: Vec3 = armLoop[side]
      ? centroid(armLoop[side]!.verts)
      : graphArm.length
        ? centroid(graphArm)
        : [sg * aArmNow * 0.95, vArm + 0.5 * (vSh - vArm), 0];
    const d: Vec3 = [sg * Math.sin(a), -Math.cos(a), 0];
    const up: Vec3 = [-d[0], -d[1], -d[2]];
    const e0: Vec3 = [sg * Math.cos(a), Math.sin(a), 0];
    const e90 = cross(up, e0);
    const Rw = (wMax * (1 - EPS_WRAP)) / TAU;
    const F: Frame = { c: add(add(J, up, capH / 2), [sg, 0, 0], 25), up, e0, e90 };
    sleeveFrames[s] = F;
    const R = (v: number) => (Wv(Math.min(v, vW)) * (1 - EPS_WRAP)) / TAU;
    const armProxy: Proxy = {
      push(p, i) {
        const q = inFrame(F, [p[3 * i], p[3 * i + 1], p[3 * i + 2]]);
        const t = -q.h;
        if (t < 0.8 * capH || t > hi - lo + 20) return;
        const Rr = R(hi + q.h) * PROXY_K;
        if (q.r >= Rr || q.r < 1e-6) return;
        const np = fromFrame(F, q.th, q.h, Rr);
        p[3 * i] = np[0];
        p[3 * i + 1] = np[1];
        p[3 * i + 2] = np[2];
      },
      pull(p, i, k) {
        const q = inFrame(F, [p[3 * i], p[3 * i + 1], p[3 * i + 2]]);
        const t = -q.h;
        if (t < capH * 1.2) return;
        const Rr = R(hi + q.h) + CLEAR;
        if (q.r <= Rr) return;
        const np = fromFrame(F, q.th, q.h, q.r - (q.r - Rr) * k);
        p[3 * i] = np[0];
        p[3 * i + 1] = np[1];
        p[3 * i + 2] = np[2];
      },
    };
    const pi = proxies.push(armProxy) - 1;
    const proxyRep: DollProxy = {
      group: gid,
      kind: 'capsule',
      profile: [[0, Rw, Rw]],
      origin: F.c,
      axis: d,
    };
    proxyReport.push(proxyRep);
    sleeveProxyReport.set(gid, proxyRep);
    for (const P of list) buildPanelLater.push(P);
    const placeAt = (th0: number) => {
      for (const P of list) {
        const inMain = main.includes(P);
        for (let i = 0; i < P.count; i++) {
          const v = P.offset + i;
          const u = cuv[2 * v];
          const vv = cuv[2 * v + 1];
          const th = (TAU * (u - uApex)) / Wv(Math.min(vv, vW)) + th0;
          setPos(v, fromFrame(F, th, vv - hi, R(vv) + CLEAR + (inMain ? 0 : 3)));
          proxyOf[v] = pi;
          placed[v] = 1;
        }
      }
    };
    placeAt(0);
    // Register the existing cap seam onto its armhole path before solving. This is a rigid
    // placement cue only: it neither creates a seam nor changes either path's length. Stored owner
    // rows work here too, and a detected free armhole no longer suppresses the registration.
    if (placementSeams.length) {
      graphPlaced.add(gid);
      const gap = Math.max(...placementSeams.map(({ sleeve, body }) => pathGap(sleeve, body)));
      if (gap > 15) {
        const fit = fitPaths(placementSeams, [-F.up[0], -F.up[1], -F.up[2]]);
        applySleeveFit(gid, list, F, fit);
      } else sleeveRegistered.add(gid);
    }
  }
  // Sleeve tube closures, then cap ↔ armhole.
  for (const s of ['L', 'R'] as const) {
    const gid: DollGroupId = s === 'L' ? 'SLEEVE_L' : 'SLEEVE_R';
    if (!groups.has(gid)) continue;
    for (const P of groups.get(gid)!) buildPanel(P);
    for (const sm of G.seams)
      if (inGroups(sm.a, new Set([gid])) && inGroups(sm.b, new Set([gid]))) graphWork(sm, passes);
    proposeStripClosure(
      gid,
      'underarm seam proposed (closes the sleeve)',
      'proposed-composite',
      passes,
    );
    const loops = loopsOf(new Set([gid]));
    const F = sleeveFrames[s]!;
    const cap = loops
      .filter((l) => l.len > 150)
      .sort(
        (x, y) =>
          Math.max(...y.verts.map((v) => cuv[2 * v + 1])) -
          Math.max(...x.verts.map((v) => cuv[2 * v + 1])),
      )[0];
    const capArc = (() => {
      if (!cap) return [];
      const vs = cap.verts;
      const floor = sleeveCapFloor.get(gid) ?? -Infinity;
      let apex = 0;
      for (let i = 1; i < vs.length; i++) if (cuv[2 * vs[i] + 1] > cuv[2 * vs[apex] + 1]) apex = i;
      let start = apex;
      let end = apex;
      for (let n = 0; n < vs.length - 1; n++) {
        const prev = (start - 1 + vs.length) % vs.length;
        if (cuv[2 * vs[prev] + 1] < floor) break;
        start = prev;
      }
      for (let n = 0; n < vs.length - 1; n++) {
        const next = (end + 1) % vs.length;
        if (cuv[2 * vs[next] + 1] < floor) break;
        end = next;
      }
      // Include the crossing vertices immediately below the widest level: these are the two
      // underarm ends, while the highest point between them is the shoulder landmark.
      start = (start - 1 + vs.length) % vs.length;
      end = (end + 1) % vs.length;
      const out: number[] = [];
      for (let i = start, guard = 0; guard < vs.length; i = (i + 1) % vs.length, guard++) {
        out.push(vs[i]);
        if (i === end) break;
      }
      return out.length >= 3 ? out : [...vs];
    })();
    if (opt.debug)
      warnings.push(
        `debug: ${gid} loops ${loops.map((l) => `${l.len.toFixed(0)}${l.closed ? '' : '(open)'}`).join(' ')}`,
      );
    // With no drawable stored cap row, use the free cap and armhole arcs as placement topology.
    // Owner mode deliberately gets this registration too, but still gets no proposed seam below.
    if (!sleeveRegistered.has(gid) && cap && armLoop[armSide[s]]) {
      const sleeve = pathOfVerts(capArc, false);
      const body = pathOfVerts(armLoop[armSide[s]]!.verts, armLoop[armSide[s]]!.closed);
      if (sleeve && body)
        applySleeveFit(
          gid,
          groups.get(gid)!,
          F,
          fitPaths(
            [{ sleeve, body, bodyClosed: armLoop[armSide[s]]!.closed }],
            [-F.up[0], -F.up[1], -F.up[2]],
          ),
        );
    }
    if (sewnNear(gid, 'BODY') || !proposalsAllowed) continue;
    // L4: a sleeve a person sewed to the body by a confirmed seam is not proposed again.
    if (
      l4 &&
      G.seams.some(
        (sm) =>
          isConf(sm.seam) &&
          ((inGroups(sm.a, new Set([gid])) && inGroups(sm.b, new Set(['BODY']))) ||
            (inGroups(sm.b, new Set([gid])) && inGroups(sm.a, new Set(['BODY'])))),
      )
    )
      continue;
    if (!cap) continue;
    if (!armLoop[armSide[s]]) {
      warnings.push(
        `${s === 'L' ? 'left' : 'right'} sleeve: the body has no ${armSide[s] === 'L' ? 'left' : 'right'} armhole loop — not attached`,
      );
      continue;
    }
    propose(
      `${s === 'L' ? 'left' : 'right'} sleeve cap ↔ armhole`,
      { ...cap, verts: capArc, closed: false },
      armLoop[armSide[s]]!,
      'lowest',
      gid,
      0.3,
    );
  }

  // ── collar (04-COLLAR.md): neck path (K1) · stand on it by landmarks (K2) · fall on the stand
  //    top, turned down (K3) · collar units joined by the order stacked on one base (K4) ─────────
  const collarRep: DollCollarReport = { neck: null, units: [], notes: [] };
  type CollarPlan = {
    rep: DollCollarUnit;
    work: Work | null;
    unit: Panel[];
    /** Fall: the stand top run it hangs from and the anchored range on it; its own outer run. */
    standTop?: number[];
    topRange?: [number, number];
    outer?: number[];
    stand?: Panel[];
    /** The unit's sewn edge (fall: its neck edge on the stand top). */
    attach?: number[];
    /** One-piece collar rolled over: its standing part, its turned-down part, the roll line. */
    fold?: { stand: number[]; fall: number[]; line: number[] };
  };
  const collarPlans: CollarPlan[] = [];
  /** Panels drawn with their face on the other side (a one-piece collar rolled over). */
  const faceFlip = new Set<number>();
  const chestMm = torso.length
    ? (Math.max(...torso.map((L) => L.a)) * ellPerimFactor) / (1 - EPS_WRAP)
    : 0;
  let neck: NeckPath | null = null;
  const neckGroups = (['STAND', 'COLLAR'] as DollGroupId[]).filter((g) => groups.has(g));
  // L4: a CONFIRMED seam between a collar unit and the body says where the neckline is: its body
  // side IS the neck path (no walk along free loops).
  const handled = new Set<GroupedSeam>();
  let confNeck: { g: GroupedSeam; unit: 'a' | 'b'; N0: NeckPath; N1: NeckPath } | null = null;
  if (l4 && neckGroups.length && groups.has('BODY')) {
    const grp = (ids: EdgeId[]) => new Set(ids.map((id) => panelByKey.get(pk(id))?.group));
    for (const g of G.seams) {
      if (!isConf(g.seam)) continue;
      const ga = grp(g.a);
      const gb = grp(g.b);
      const ringA = [...ga].every((x) => x === 'STAND' || x === 'COLLAR');
      const ringB = [...gb].every((x) => x === 'STAND' || x === 'COLLAR');
      const unit =
        ringA && gb.size === 1 && gb.has('BODY')
          ? 'a'
          : ringB && ga.size === 1 && ga.has('BODY')
            ? 'b'
            : null;
      if (!unit) continue;
      // The stand sits on the neckline; a fall on a stand is K3's.
      const bp = sidePath(g, unit === 'a' ? 'b' : 'a');
      if (!bp || bp.v.length < 4) continue;
      const how = `the body side of the confirmed seam ${g.seam.a} ↔ ${g.seam.b}`;
      const N0 = neckFromRun(cctx, [...bp.v], vArm, false, how);
      const N1 = neckFromRun(cctx, [...bp.v], vArm, true, how);
      confNeck = { g, unit, N0, N1 };
      break;
    }
    if (confNeck) {
      neck = confNeck.N0;
      collarRep.neck = {
        lenMm: neck.path.len,
        closed: false,
        chestMm,
        ratio: chestMm > 0 ? neck.path.len / chestMm : NaN,
        extMm: [0, 0],
        ok: true,
        how: `${neck.how} (confirmed by a person)`,
      };
    }
  }
  if (!confNeck && neckGroups.length && groups.has('BODY') && proposalsAllowed) {
    const r = findNeckPath(cctx, neckLoop ? [neckLoop] : bodyLoops, vArm);
    if (opt.debug) warnings.push(`debug: neck walk ${r.debug}`);
    const ratioOf = (x: NeckPath) => (chestMm > 0 ? x.path.len / chestMm : NaN);
    let ok = false;
    if (r.neck && ratioOf(r.neck) >= 0.3 && ratioOf(r.neck) <= 0.55) {
      neck = r.neck;
      ok = true;
    } else {
      warnings.push(
        r.neck
          ? `neck path ${r.neck.path.len.toFixed(0)} mm is ${(ratioOf(r.neck) * 100).toFixed(0)} % of the girth ${chestMm.toFixed(0)} mm (a neckline is 30–55 %) — ${r.note}; the closed neck loop is used instead`
          : `neck path not found (${r.note}) — the closed neck loop is used instead`,
      );
      if (neckLoop)
        neck = closedNeckPath(cctx, neckLoop.verts, vArm, 'closed neck loop (fallback)');
    }
    if (neck)
      collarRep.neck = {
        lenMm: neck.path.len,
        closed: neck.closed,
        chestMm,
        ratio: ratioOf(neck),
        extMm: neck.ext,
        ok,
        how: neck.how,
      };
    else warnings.push('the body has no neck path — the stand / collar is not attached');
    if (opt.debug && neck)
      warnings.push(
        `debug: neck path ${neck.path.len.toFixed(0)} mm ${neck.closed ? 'closed' : 'open'} · cb ${neck.cb.toFixed(0)} · snp ${neck.snp?.map((x) => x.toFixed(0)).join('/') ?? '-'} · ${neck.how}`,
      );
  }
  // The neck axis: vertical, through the middle of the neck path.
  const F: Frame = (() => {
    const vs = neck ? [...neck.path.v] : neckLoop ? neckLoop.verts : [];
    if (!vs.length) return { c: [0, vSh, 0], up: [0, 1, 0], e0: [0, 0, 1], e90: [1, 0, 0] };
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    let ys = 0;
    for (const v of vs) {
      const p = getPos(v);
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
      z0 = Math.min(z0, p[2]);
      z1 = Math.max(z1, p[2]);
      ys += p[1];
    }
    return {
      c: [(x0 + x1) / 2, ys / vs.length, (z0 + z1) / 2],
      up: [0, 1, 0],
      e0: [0, 0, 1],
      e90: [1, 0, 0],
    };
  })();
  const outward = (p: Vec3): Vec3 => {
    const dx = p[0] - F.c[0];
    const dz = p[2] - F.c[2];
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, 0, dz / l];
  };
  type Unit = {
    gid: DollGroupId;
    list: Panel[];
    keys: Set<string>;
    /** The edge sewn to the base (u ascending) and the opposite edge (the outer / top edge). */
    attach: number[];
    other: number[];
    /** +1: the piece lies above its attach run in the chart. */
    sign: 1 | -1;
    area: number;
  };
  const uAsc = (vs: number[]) =>
    vs.length > 1 && cuv[2 * vs[0]] > cuv[2 * vs[vs.length - 1]] ? [...vs].reverse() : vs;
  const runsOfPanels = (list: Panel[]) => {
    const set = new Set(list.map((P) => P.idx));
    const loops = findLoops({ panels, panelOf, ringOf, uv, seams: activeSeams() }, set);
    const L = [...loops].sort((x, y) => y.len - x.len)[0];
    if (!L) return null;
    const vs = L.verts;
    let iMin = 0;
    let iMax = 0;
    for (let k = 0; k < vs.length; k++) {
      if (cuv[2 * vs[k]] < cuv[2 * vs[iMin]]) iMin = k;
      if (cuv[2 * vs[k]] > cuv[2 * vs[iMax]]) iMax = k;
    }
    const arcOf = (from: number, to: number) => {
      const out: number[] = [];
      for (let k = from; ; k = (k + 1) % vs.length) {
        out.push(vs[k]);
        if (k === to) break;
      }
      return out;
    };
    const r1 = arcOf(iMin, iMax);
    const r2 = arcOf(iMax, iMin);
    const mv = (r: number[]) => r.reduce((t, v) => t + cuv[2 * v + 1], 0) / r.length;
    return mv(r1) < mv(r2) ? { bottom: r1, top: r2 } : { bottom: r2, top: r1 };
  };
  const unitsOf = (gid: DollGroupId): Unit[] => {
    const ch = charts.get(gid);
    if (!ch) return [];
    const out: Unit[] = [];
    for (const comp of ch.components) {
      const list = comp.keys.map((k) => panelByKey.get(k)!).filter((P) => P && P.group === gid);
      if (!list.length) continue;
      const runs = runsOfPanels(list);
      if (!runs) continue;
      const bot = uAsc(runs.bottom);
      const top = uAsc(runs.top);
      // The neck edge is the bottom run unless the top carries the landmark notches.
      const nb = bot.filter(cctx.isNotch).length;
      const nt = top.filter(cctx.isNotch).length;
      const useTop = nt >= nb + 2;
      out.push({
        gid,
        list,
        keys: new Set(list.flatMap((P) => [P.key, ...P.layers])),
        attach: smoothest(cctx, useTop ? top : bot),
        other: smoothest(cctx, useTop ? bot : top),
        sign: useTop ? -1 : 1,
        area: list.reduce((t, P) => t + Math.abs(P.geom.areaMm2), 0),
      });
    }
    return out;
  };
  /** Lay a unit along its base: attach run → base by the anchored map, the rest up (stand) or turned
   *  down and out (fall); extensions beyond the sewn marks overlap (left over right). */
  const placeUnit = (
    U: Unit,
    base: ReturnType<typeof baseCurve>,
    map: (s: number) => number,
    sewn: [number, number],
    mode: 'up' | 'down',
    layer: number,
    alpha: number,
    proxyIdx: number,
    /** One-piece collar: folded this high over its neck edge, mm, the part above turned down. */
    roll?: { height: number; alpha: number },
  ) => {
    const A = restPath(cctx, U.attach);
    const fold = { stand: [] as number[], fall: [] as number[], line: [] as number[] };
    const tab = U.attach
      .map((v, k) => [cuv[2 * v], A.s[k], cuv[2 * v + 1]] as const)
      .sort((x, y) => x[0] - y[0]);
    // s runs with u, or against it (a fall is laid rotated 180°: its attach run reversed).
    const dir = tab[tab.length - 1][1] >= tab[0][1] ? 1 : -1;
    const look = (u: number) => {
      const n = tab.length;
      if (u <= tab[0][0]) return { s: tab[0][1] - dir * (tab[0][0] - u), v: tab[0][2] };
      if (u >= tab[n - 1][0])
        return { s: tab[n - 1][1] + dir * (u - tab[n - 1][0]), v: tab[n - 1][2] };
      let lo = 0;
      let hi = n - 1;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (tab[m][0] <= u) lo = m;
        else hi = m;
      }
      const w = tab[hi][0] > tab[lo][0] ? (u - tab[lo][0]) / (tab[hi][0] - tab[lo][0]) : 0;
      return {
        s: tab[lo][1] + (tab[hi][1] - tab[lo][1]) * w,
        v: tab[lo][2] + (tab[hi][2] - tab[lo][2]) * w,
      };
    };
    const lean = STAND_LEAN;
    // The sewn edge itself by its own arc (u need not run monotonically along a curved edge).
    const onEdge = new Map<number, number>(U.attach.map((v, k) => [v, A.s[k]]));
    for (const P of U.list) {
      buildPanelLater.push(P);
      for (let i = 0; i < P.count; i++) {
        const v = P.offset + i;
        const q = look(cuv[2 * v]);
        const se = onEdge.get(v);
        if (se !== undefined) {
          q.s = se;
          q.v = cuv[2 * v + 1];
        }
        const h = U.sign * (cuv[2 * v + 1] - q.v);
        const B = base.at(map(q.s));
        const n = outward(B);
        const extra = q.s < sewn[0] - 1 ? 4 : q.s > sewn[1] + 1 ? 2 : 0;
        // The roll line runs at one height over the neck edge, as a pressed collar turns: a part
        // lower than that (a band's end past the fall) stands whole.
        const hr = roll ? roll.height : Infinity;
        let p: Vec3;
        if (mode === 'up' && h > hr) {
          // Above the roll line: turned down and out over the standing part.
          const R = add(
            add(add(B, F.up, hr * Math.cos(lean)), n, -hr * Math.sin(lean)),
            n,
            layer + extra,
          );
          const d = h - hr;
          p = add(add(R, n, 3 + d * Math.sin(roll!.alpha)), F.up, -d * Math.cos(roll!.alpha));
        } else
          p =
            mode === 'up'
              ? add(add(add(B, F.up, h * Math.cos(lean)), n, -h * Math.sin(lean)), n, layer + extra)
              : add(
                  add(B, n, 3 + layer + extra + Math.max(0, h) * Math.sin(alpha)),
                  F.up,
                  -h * Math.cos(alpha),
                );
        if (roll) {
          if (Math.abs(h - hr) < 5) fold.line.push(v);
          if (h > hr + 4) fold.fall.push(v);
          else if (h < hr - 4) fold.stand.push(v);
        }
        setPos(v, p);
        proxyOf[v] = proxyIdx;
        placed[v] = 1;
      }
    }
    return fold;
  };
  /** One-sided contact: each vertex of `outer` stays outside its nearest `inner` vertex (dynamic). */
  const contactOf = (outerV: number[], innerV: number[], gap: number) => {
    const ci: number[] = [];
    const cj: number[] = [];
    for (const v of outerV) {
      const p = getPos(v);
      let best = -1;
      let bd = Infinity;
      for (const w of innerV) {
        const d =
          (pos[3 * w] - p[0]) ** 2 + (pos[3 * w + 1] - p[1]) ** 2 + (pos[3 * w + 2] - p[2]) ** 2;
        if (d < bd) [best, bd] = [w, d];
      }
      if (best >= 0 && bd < 60 * 60) {
        ci.push(v);
        cj.push(best);
      }
    }
    if (ci.length)
      contacts.push({
        i: Int32Array.from(ci),
        j: Int32Array.from(cj),
        gap,
        ax: F.c[0],
        az: F.c[2],
      });
  };
  /** Share of `outerV` outside the surface of `innerV` (nearest inner vertex, outward normal). */
  const outsideShare = (outerV: number[], innerV: number[]) => {
    let out = 0;
    for (const v of outerV) {
      const p = getPos(v);
      let best = innerV[0];
      let bd = Infinity;
      for (const w of innerV) {
        const d =
          (pos[3 * w] - p[0]) ** 2 + (pos[3 * w + 1] - p[1]) ** 2 + (pos[3 * w + 2] - p[2]) ** 2;
        if (d < bd) [best, bd] = [w, d];
      }
      const q = getPos(best);
      if (dot(sub(p, q), outward(q)) >= -1) out++;
    }
    return outerV.length ? (100 * out) / outerV.length : 0;
  };
  /** A seam by anchored arc length (K2): only A between its first and last anchor is sewn. */
  const anchoredWork = (
    label: string,
    A: Path,
    B: Path,
    anchors: [number, number][],
    note: string,
    target: number,
    /** Arcs of B not sewn to A (the inside of a fold: a dart's legs run down, not along the seam). */
    skipB?: (s: number) => boolean,
  ) => {
    const rows = anchoredRows(A, B, anchors);
    if (skipB) {
      const sOfB = new Map<number, number>();
      B.v.forEach((v, k) => sOfB.set(v, B.s[k]));
      const keep: number[] = [];
      for (let q = 0; q < rows.v.length; q++) {
        const sb = sOfB.get(rows.v[q]);
        if (sb === undefined || !skipB(sb)) keep.push(q);
      }
      if (keep.length < rows.v.length)
        for (const key of ['v', 'b0', 'b1', 'w'] as const)
          rows[key] = keep.map((q) => rows[key][q]) as number[];
    }
    const solver: SolverSeam = { rows, k: 0, active: true, gap: 0 };
    const a0 = anchors[0][0];
    const a1 = anchors[anchors.length - 1][0];
    const b0 = anchors[0][1];
    const b1 = anchors[anchors.length - 1][1];
    const item: Work = {
      id: label,
      a: edgesOn(A),
      b: edgesOn(B),
      kind: 'proposed-composite',
      origin: 'doll-proposed',
      A,
      B,
      same: true,
      aRange: [a0 / Math.max(1e-9, A.len), a1 / Math.max(1e-9, A.len)],
      bRange: [b0 / Math.max(1e-9, B.len), b1 / Math.max(1e-9, B.len)],
      rows,
      solver,
      target,
      born: passes,
      ramp: 120,
      note,
    };
    works.push(item);
    return item;
  };
  const increasing = (an: [number, number][]) =>
    an.every((x, i) => i === 0 || (x[0] > an[i - 1][0] + 1 && x[1] > an[i - 1][1] + 1));
  /** K2: a unit's attach run onto the neck path by landmarks. */
  const neckAnchors = (U: Unit, N: NeckPath) => {
    const m = runMarks(cctx, U.attach);
    const Lb = N.path.len;
    const cf = symmetricPair(m, Lb, 0.8, 1.25);
    const lo = cf ? cf[0] : 0;
    const hi = cf ? cf[1] : m.path.len;
    let snp = N.snp ? symmetricPair(m, N.snp[1] - N.snp[0], 0.75, 1.3, cf) : null;
    if (snp && (snp[0] <= lo + 5 || snp[1] >= hi - 5)) snp = null;
    const with_ = (useSnp: boolean): [number, number][] => [
      [lo, 0],
      ...(useSnp && snp && N.snp ? [[snp[0], N.snp[0]] as [number, number]] : []),
      [m.cb, N.cb],
      ...(useSnp && snp && N.snp ? [[snp[1], N.snp[1]] as [number, number]] : []),
      [hi, Lb],
    ];
    let anchors = with_(true);
    if (!increasing(anchors)) {
      snp = null;
      anchors = with_(false);
    }
    if (!increasing(anchors))
      anchors = [
        [lo, 0],
        [hi, Lb],
      ];
    const words = `CB ${m.cbByNotch ? 'notch' : 'middle'} ↔ CB · SNP ${snp ? 'notches ↔ shoulder points' : 'proportional'} · CF ${cf ? 'notches' : 'run ends'} ↔ ${N.closed ? 'the centre front' : 'the CF marks'}`;
    return { m, anchors, sewn: [lo, hi] as [number, number], words };
  };
  /** K3: a fall's neck edge onto the stand top (the notch pair that matches, centred at CB). */
  const topAnchors = (U: Unit, top: number[]) => {
    const mf = runMarks(cctx, U.attach);
    const mt = runMarks(cctx, top);
    const Lf = mf.path.len;
    const Lt = mt.path.len;
    const pair = symmetricPair(mt, Lf, 0.85, 1.15);
    const tA = pair ? pair[0] : Math.max(0, mt.cb - mf.cb);
    const tB = pair ? pair[1] : Math.min(Lt, mt.cb + (Lf - mf.cb));
    let anchors: [number, number][] = [
      [0, tA],
      [mf.cb, mt.cb],
      [Lf, tB],
    ];
    if (!increasing(anchors))
      anchors = [
        [0, tA],
        [Lf, tB],
      ];
    const words = `CB ${mf.cbByNotch ? 'notch' : 'middle'} ↔ stand CB · ends ↔ ${pair ? 'the stand-top notches' : 'centred on the stand top'}`;
    return { mf, mt, anchors, range: [tA, tB] as [number, number], words };
  };
  const joinedUnits = (a: Unit, b: Unit) =>
    G.seams.some(
      (sm) =>
        (a.keys.has(pk(sm.a[0])) && b.keys.has(pk(sm.b[0]))) ||
        (b.keys.has(pk(sm.a[0])) && a.keys.has(pk(sm.b[0]))),
    ) ||
    (declaredJoins ?? []).some((J) =>
      J.parts.some(
        (X, i) =>
          X.some((k) => a.keys.has(k)) &&
          J.parts.some((Y, j) => j !== i && Y.some((k) => b.keys.has(k))),
      ),
    );
  // Ring proxy of units standing on the neck path: never inside the neck path's radius.
  const neckBase = neck ? baseOf(F, [...neck.path.v]) : null;
  const ringProxyAt = (layer: number, finished = 1) =>
    proxies.push({
      push(p, i) {
        if (!neckBase) return;
        const q = inFrame(F, [p[3 * i], p[3 * i + 1], p[3 * i + 2]]);
        const R = (neckBase.r(q.th) * finished + layer) * PROXY_K;
        if (q.r >= R || q.r < 1e-6) return;
        const np = fromFrame(F, q.th, q.h, R);
        p[3 * i] = np[0];
        p[3 * i + 1] = np[1];
        p[3 * i + 2] = np[2];
      },
      pull() {},
    }) - 1;
  let standTop: number[] | null = null;
  let standList: Panel[] | null = null;
  /**
   * L4 (04-COLLAR K2 + intake): tucks and pleats ON the neck path folded closed before the unit is
   * mapped. WHICH folds is the path's own evidence (foldEvidence: pleat pairs, dart runs — the one
   * rule for every band; 12.10 review: no subset of its notches picked by how the unit then fits).
   * Whether the path is cut at its CF notches and which notch pair of the unit is sewn: the
   * reading whose length ratio is nearest 1 within 0.90–1.15. None → the mismatch is reported,
   * never crammed.
   */
  const foldedPlan = (U: Unit, cn: NonNullable<typeof confNeck>) => {
    const m = runMarks(cctx, U.attach);
    type Opt = {
      N: NeckPath;
      folds: [number, number][];
      lo: number;
      hi: number;
      Le: number;
      score: number;
      cut: boolean;
    };
    let best: Opt | null = null;
    const tried: string[] = [];
    for (const [N, cut] of [
      [cn.N0, false],
      [cn.N1, true],
    ] as const) {
      const ev = foldEvidence(N.path);
      const sets: [number, number][][] = ev ? [[], ev.folds] : [[]];
      sets.forEach((F, si) => {
        const Fs = [...F].sort((x, y) => x[0] - y[0]);
        const Le = N.path.len - Fs.reduce((t, x) => t + x[1] - x[0], 0);
        const spans: [number, number][] = [[0, m.path.len]];
        for (const a of m.notches)
          for (const b of m.notches)
            if (
              a < m.cb - 5 &&
              b > m.cb + 5 &&
              Math.abs((a + b) / 2 - m.cb) <= Math.max(4, 0.015 * m.path.len)
            )
              spans.push([a, b]);
        for (const [lo, hi] of spans) {
          const r = (hi - lo) / Math.max(1, Le);
          const score = Math.abs(Math.log(r)) + (cut ? 0.01 : 0) + 0.003 * si;
          if (r < 0.9 || r > 1.15) continue;
          if (!best || score < best.score) best = { N, folds: Fs, lo, hi, Le, score, cut };
        }
        tried.push(
          `${cut ? 'cut at CF notches' : 'whole'} ${N.path.len.toFixed(0)} − ${(N.path.len - Le).toFixed(0)} folded = ${Le.toFixed(0)}`,
        );
      });
    }
    if (!best) return { m, tried, ok: false as const };
    const B = best as Opt;
    const eff = (sv: number) => {
      let out = sv;
      for (const [f0, f1] of B.folds) {
        if (sv >= f1) out -= f1 - f0;
        else if (sv > f0) out -= sv - f0;
      }
      return out;
    };
    const real = (e: number) => {
      let sv = e;
      for (const [f0, f1] of B.folds) if (sv >= f0) sv += f1 - f0;
      return sv;
    };
    // The unit's [lo, hi] onto the folded path [0, Le], its CB onto the path's CB.
    const effA: [number, number][] = [[B.lo, 0]];
    const cbE = eff(B.N.cb);
    if (m.cb > B.lo + 5 && m.cb < B.hi - 5 && cbE > 5 && cbE < B.Le - 5) effA.push([m.cb, cbE]);
    effA.push([B.hi, B.Le]);
    const xOfE = makeMap(effA.map(([x, e]) => [e, x] as [number, number]));
    let an: [number, number][] = effA.map(([x, e]) => [x, real(e)]);
    for (const [f0, f1] of B.folds) {
      const xf = xOfE(eff(f0));
      an = an.filter(([x]) => Math.abs(x - xf) > 1);
      an.push([xf - 0.3, f0], [xf + 0.3, f1]);
    }
    an.sort((x, y) => x[0] - y[0]);
    const anchors: [number, number][] = [];
    for (const a of an)
      if (
        !anchors.length ||
        (a[0] > anchors[anchors.length - 1][0] + 0.1 && a[1] > anchors[anchors.length - 1][1] + 0.1)
      )
        anchors.push(a);
    const words = `${B.cut ? 'cut at its CF notches' : 'whole'} (${B.N.path.len.toFixed(0)} mm)${B.folds.length ? ` · ${B.folds.length} tuck${B.folds.length > 1 ? 's' : ''} / pleat${B.folds.length > 1 ? 's' : ''} folded closed (${B.folds.map((f) => (f[1] - f[0]).toFixed(0)).join(' + ')} mm) → ${B.Le.toFixed(0)} mm` : ''} · the unit sewn ${B.lo.toFixed(0)}–${B.hi.toFixed(0)} of its ${m.path.len.toFixed(0)} mm (${B.lo > 1 || B.hi < m.path.len - 1 ? 'between its CF notches' : 'whole'}) · CB ${m.cbByNotch ? 'notch' : 'middle'} ↔ CB`;
    return {
      ok: true as const,
      m,
      N: B.N,
      anchors,
      sewn: [B.lo, B.hi] as [number, number],
      Le: B.Le,
      folds: B.folds.map((f) => Math.round(f[1] - f[0])),
      words,
      tried,
    };
  };
  /**
   * The neck as finished at the unit's step, from the rows themselves (stored folds applied, pleat
   * rows). A stored row wins over the notches: `null` only when no row touches the neck, and then
   * `foldedPlan` reads it as ever. A mismatch stays a mismatch, with the real numbers.
   */
  const finishedPlan = (U: Unit, cn: NonNullable<typeof confNeck>) => {
    const rowsOf = (pn: number): NeckRows | undefined => {
      const P = panels[pn];
      return {
        turns: (P.fold?.creases ?? [])
          .filter((c) => c.kind === 'inward' || c.kind === 'outward')
          .map((c) => ({ a: c.a, b: c.b })),
        pleatLines: neckPleatLines.get(P.key) ?? [],
      };
    };
    const walkOf = (P: Path): NeckWalk => {
      const verts = [...P.v];
      return {
        panel: verts.map((v) => panelOf[v]),
        cut: verts.map((v) => {
          const Q = panels[panelOf[v]];
          return (Q.fold?.flat ?? Q.mesh.pts)[v - Q.offset];
        }),
        s: [...P.s],
      };
    };
    const verts = [...cn.N0.path.v];
    const back = cbIndex(cctx, verts, vArm);
    const open = openWalkAt(walkOf(cn.N0.path), rowsOf, back >= 0 ? cn.N0.path.s[back] : NaN);
    const N = open
      ? neckFromRun(
          cctx,
          [...verts.slice(open), ...verts.slice(0, open)],
          vArm,
          false,
          `${cn.N0.how}; opened where the stored folds meet`,
        )
      : cn.N0;
    const r = readFinishedNeck(walkOf(N.path), rowsOf);
    if (!r) return null;
    const m = runMarks(cctx, U.attach);
    const folds = r.cutMm - r.finishedMm;
    const read = `stored folds and pleats ${r.cutMm.toFixed(0)} − ${folds.toFixed(0)} folded = ${r.finishedMm.toFixed(0)}${r.unread.length ? `, ${r.unread.length} crease${r.unread.length > 1 ? 's' : ''} with no end of the neck beyond ${r.unread.length > 1 ? 'them' : 'it'}` : ''}`;
    const ratio = m.path.len / Math.max(1, r.finishedMm);
    if (ratio < 0.9 || ratio > 1.15) return { m, tried: [read], ok: false as const };
    const anchors = finishedAnchors(r, { len: m.path.len, cb: m.cb }, N.cb);
    return {
      ok: true as const,
      m,
      N,
      anchors,
      sewn: [0, m.path.len] as [number, number],
      Le: r.finishedMm,
      folds: [
        ...(r.from > 1 ? [Math.round(r.from)] : []),
        ...r.closed.map((f) => Math.round(f[1] - f[0])),
        ...(N.path.len - r.to > 1 ? [Math.round(N.path.len - r.to)] : []),
      ],
      words: `${read} · the unit sewn whole, ${m.path.len.toFixed(0)} mm · CB ${m.cbByNotch ? 'notch' : 'middle'} ↔ CB at ${finishedArc(r, N.cb).toFixed(0)} of the finished neck`,
      tried: [read],
      finished: r,
    };
  };
  const placeOnNeck = (units: Unit[], role: 'stand' | 'collar', label: string) => {
    if (!neck) return;
    const N0n = neck;
    const ordered = [...units].sort((x, y) =>
      isUnder(x.keys, y.keys) ? 1 : isUnder(y.keys, x.keys) ? -1 : y.area - x.area,
    );
    ordered.forEach((U, idx) => {
      const layer = claimedLayer(U.keys, 3 * (ordered.length - 1 - idx));
      // L4: the unit the confirmed neck seam names is mapped by the folded plan on ITS base.
      const cn =
        confNeck && U.keys.has(pk((confNeck.unit === 'a' ? confNeck.g.a : confNeck.g.b)[0]))
          ? confNeck
          : null;
      const fin = cn ? finishedPlan(U, cn) : null;
      const fp = cn ? fin ?? foldedPlan(U, cn) : null;
      const N = fp && fp.ok ? fp.N : N0n;
      const base = baseCurve(cctx, N.path);
      const plan =
        fp && fp.ok
          ? { m: fp.m, anchors: fp.anchors, sewn: fp.sewn, words: fp.words }
          : neckAnchors(U, N);
      // The stored rows take length off the neck; both body guides stand at what is left of it,
      // or the seam can only close by stretching. The collar itself is never touched.
      if (fin?.ok) neckGirthR = fin.finished.finishedMm / (2 * Math.PI);
      const pi = ringProxyAt(layer, fin?.ok ? fin.finished.finishedMm / fin.finished.cutMm : 1);
      const sewnMm = plan.sewn[1] - plan.sewn[0];
      const ext = plan.m.path.len - sewnMm;
      // A base far off the unit's length (a neck path that is not a neckline): placed at its own
      // length centred on the CB, not sewn — never crammed.
      const off = fp ? !fp.ok : sewnMm / N.path.len < 0.6 || sewnMm / N.path.len > 1.4;
      if (fp && !fp.ok) {
        const wds = `${cn!.g.seam.a}~${cn!.g.seam.b}: confirmed by a person, but the unit (${fp.m.path.len.toFixed(0)} mm) does not fit its neck path with any reading of the tucks / CF notches (${fp.tried.join('; ')}) — the intake is not identified: placed at its own length, not crammed`;
        preContradictions.push(wds);
        warnings.push(`contradiction: ${wds}`);
      } else if (off)
        warnings.push(
          `${label}: not proposed — ${sewnMm.toFixed(0)} mm between the marks vs a neck path of ${N.path.len.toFixed(0)} mm (${((100 * sewnMm) / N.path.len).toFixed(0)} %); placed at its own length, centred at the CB`,
        );
      // A one-piece collar (no stand) rolls over: ROLL_FRAC of its depth at the CB stands, the
      // rest turns down and out, leaning out enough for its longer outer edge and no less than
      // just past the stand's own lean, so the ends lie down on the chest rather than standing
      // off it (no roll-line mark in the pattern — a stated prior).
      let roll: { height: number; alpha: number } | undefined;
      if (role === 'collar') {
        const La = plan.m.path.len;
        const Lo = restPath(cctx, U.other).len;
        let rN = 0;
        for (const v of N.path.v) rN += inFrame(F, getPos(v)).r;
        rN /= Math.max(1, N.path.v.length);
        const mid = U.attach[Math.floor(U.attach.length / 2)];
        const depth = Math.max(
          20,
          Math.min(
            ...U.other.map((v) =>
              Math.hypot(cuv[2 * v] - cuv[2 * mid], cuv[2 * v + 1] - cuv[2 * mid + 1]),
            ),
          ),
        );
        const H = (1 - ROLL_FRAC) * depth;
        const dR = rN * Math.max(0, Lo / Math.max(1, La) - 1) + 3 + layer;
        roll = {
          height: ROLL_FRAC * depth,
          alpha: Math.max(
            STAND_LEAN + (2 * Math.PI) / 180,
            Math.min((70 * Math.PI) / 180, Math.asin(Math.min(1, dR / H))),
          ),
        };
      }
      const fold = placeUnit(
        U,
        base,
        off
          ? makeMap([
              [plan.m.cb, N.cb],
              [plan.m.cb + 1, N.cb + 1],
            ])
          : makeMap(plan.anchors),
        plan.sewn,
        'up',
        layer,
        0,
        pi,
        roll,
      );
      for (const P of U.list) buildPanel(P);
      if (roll) {
        contactOf(fold.fall, fold.stand, 1.5);
        // Rolled over, the drawn face shows on the turned-down part (the standing part, hidden
        // under it, shows its back).
        for (const P of U.list) faceFlip.add(P.idx);
      }
      const graphSewn = graphTouches(U.gid, new Set(['BODY']));
      const id = idx === 0 ? label : `${label} (layer ${idx + 1})`;
      let confWork: Work | null = null;
      if (cn) {
        handled.add(cn.g);
        if (fp && fp.ok) {
          confWork = anchoredWork(
            `${cn.g.seam.a}~${cn.g.seam.b}`,
            plan.m.path,
            N.path,
            plan.anchors,
            `${label} · ${sewnMm.toFixed(0)} mm of the unit onto the neck path ${fp.Le.toFixed(0)} mm (ease ${(sewnMm / fp.Le).toFixed(3)}) · ${plan.words}`,
            0.8,
          );
          confWork.origin = 'graph';
          confWork.confirmed = true;
          if (fin?.ok) {
            const r = fin.finished;
            confWork.rows = finishedRows(plan.m.path, N.path, r, plan.anchors);
            confWork.solver.rows = confWork.rows;
            if (r.closed.length)
              formFolds(N.path, {
                folds: r.closed,
                kinds: r.closed.map(() => 'pleat'),
                Le: r.finishedMm,
              });
          }
        }
      }
      const work = cn
        ? confWork
        : graphSewn || off || owner
          ? null
          : anchoredWork(
              id,
              plan.m.path,
              N.path,
              plan.anchors,
              `proposed by the doll · ${label} · ${sewnMm.toFixed(0)} mm between the marks onto the ${N.closed ? 'closed' : 'open'} neck path ${N.path.len.toFixed(0)} mm (${sewnMm / N.path.len < 0.985 || sewnMm / N.path.len > 1.015 ? `eased ${(Math.abs(1 - sewnMm / N.path.len) * 100).toFixed(0)} %` : 'equal'})${ext > 2 ? ` · ${ext.toFixed(0)} mm beyond the CF marks left free (extensions, overlapping)` : ''} · ${plan.words} · not in the pattern`,
              0.8,
            );
      collarPlans.push({
        rep: {
          keys: U.list.map((P) => P.key),
          role,
          base: 'neck path',
          seam: work?.id ?? null,
          attached: cn
            ? work
              ? 'confirmed'
              : 'not sewn'
            : work
              ? 'proposed'
              : graphSewn
                ? 'graph'
                : 'not sewn',
          sewnMm,
          baseMm: fp && fp.ok ? fp.Le : N.path.len,
          ease: sewnMm / (fp && fp.ok ? fp.Le : N.path.len),
          ...(fp && fp.ok ? { folds: fp.folds } : {}),
          extMm: ext,
          anchors: plan.words,
          layer,
        },
        work,
        unit: U.list,
        ...(roll ? { fold, outer: U.other } : {}),
      });
      if (idx === 0) {
        standTop = U.other;
        standList = U.list;
      }
    });
  };
  if (groups.has('STAND')) {
    const units = unitsOf('STAND');
    placeOnNeck(units, 'stand', 'collar stand ↔ neckline');
    for (const sm of G.seams)
      if (inGroups(sm.a, new Set(['STAND'])) && inGroups(sm.b, new Set(['STAND'])))
        graphWork(sm, passes);
  }
  if (groups.has('COLLAR')) {
    const units = unitsOf('COLLAR');
    const ordered = [...units].sort((x, y) =>
      isUnder(x.keys, y.keys) ? 1 : isUnder(y.keys, x.keys) ? -1 : y.area - x.area,
    );
    for (let i = 1; i < ordered.length; i++)
      if (!joinedUnits(ordered[i], ordered[0]))
        warnings.push(
          `${ordered[i].list.map((P) => P.key).join('+')}: a second collar unit not joined to ${ordered[0].list.map((P) => P.key).join('+')} by a seam or the order — stacked on the same base anyway`,
        );
    // A later unit sewn by the graph onto an earlier unit's attach edge attaches by that edge.
    const stackOn = new Map<Unit, { V: Unit; pair: Map<number, number> }>();
    for (let i = 1; i < ordered.length; i++) {
      const U = ordered[i];
      for (const sm of G.seams) {
        const mineA = U.keys.has(pk(sm.a[0]));
        const mineB = U.keys.has(pk(sm.b[0]));
        if (mineA === mineB) continue;
        const [mine, theirs] = mineA ? [sm.a, sm.b] : [sm.b, sm.a];
        const V = ordered.slice(0, i).find((W) => W.keys.has(pk(theirs[0])));
        const Pm = pathOf(mine);
        const Pt = pathOf(theirs);
        if (!V || !Pm || !Pt) continue;
        const on = new Set(V.attach);
        if ([...Pt.v].filter((v) => on.has(v)).length < 0.5 * Pt.v.length) continue;
        // The sewn edge is the unit's other run (the chart drew it the other way up): swap.
        const onOther = new Set(U.other);
        if ([...Pm.v].filter((v) => onOther.has(v)).length >= 0.5 * Pm.v.length) {
          U.other = U.attach;
          U.sign = U.sign === 1 ? -1 : 1;
        }
        U.attach = uAsc([...Pm.v]);
        // Sewn edge to edge: it lies where its partner's stretch of edge lies (K4), end to end the
        // way the graph pairs them (layers sewn face to face run against each other's contour).
        const same =
          (panelByKey.get(pk(mine[0]))?.mirrored ?? false) !==
          (panelByKey.get(pk(theirs[0]))?.mirrored ?? false);
        const m0 = Pm.v[0];
        const m1 = Pm.v[Pm.v.length - 1];
        const t0 = Pt.v[0];
        const t1 = Pt.v[Pt.v.length - 1];
        stackOn.set(U, {
          V,
          pair: new Map([
            [m0, same ? t0 : t1],
            [m1, same ? t1 : t0],
          ]),
        });
        break;
      }
    }
    if (standTop && standList) {
      // K3: falls on the stand top, turned down and out; stacked outward in area order (K4).
      const top = standTop as number[];
      const stand = standList as Panel[];
      const base = baseCurve(cctx, restPath(cctx, top));
      const standV: number[] = [];
      for (const P of stand) for (let i = 0; i < P.count; i++) standV.push(P.offset + i);
      const planOf = new Map<Unit, ReturnType<typeof topAnchors>>();
      ordered.forEach((U0, idx) => {
        const layer = claimedLayer(U0.keys, 3 * (ordered.length - 1 - idx));
        // Turned down = the drawn piece rotated 180° (u and v both reversed): its face shows.
        const U: Unit = { ...U0, attach: [...U0.attach].reverse(), other: [...U0.other].reverse() };
        const plan = topAnchors(U, top);
        // A unit sewn edge to edge onto an earlier one takes that unit's map (scaled to its own
        // length), so the seam between the layers starts closed instead of fighting two maps.
        const st = stackOn.get(U0);
        const pp = st ? planOf.get(st.V) : undefined;
        const pv = pp ? [...pp.mf.path.v] : [];
        const kA = pp ? pv.indexOf(st!.pair.get(U.attach[0]) ?? -1) : -1;
        const kB = pp ? pv.indexOf(st!.pair.get(U.attach[U.attach.length - 1]) ?? -1) : -1;
        if (pp && kA >= 0 && kB >= 0 && kA !== kB) {
          // The partner's stretch sA → sB of its neck edge (this unit's start → end, as the graph
          // pairs them — possibly running backwards: the layer then lies mirrored, face to face),
          // through the partner's map onto the stand top.
          const sA = pp.mf.path.s[kA];
          const sB = pp.mf.path.s[kB];
          const mapP = makeMap(pp.anchors);
          const Lm = plan.mf.path.len;
          const an: [number, number][] = [[0, mapP(sA)]];
          for (const [sp] of pp.anchors) {
            const x = ((sp - sA) / (sB - sA)) * Lm;
            if (x > 5 && x < Lm - 5) an.push([x, mapP(sp)]);
          }
          an.push([Lm, mapP(sB)]);
          an.sort((x, y) => x[0] - y[0]);
          plan.anchors = an;
          plan.range = [Math.min(mapP(sA), mapP(sB)), Math.max(mapP(sA), mapP(sB))];
          plan.words = `stacked on ${st!.V.list.map((P) => P.key).join('+')} (${Math.round(sB - sA)} of its ${Math.round(pp.mf.path.len)} mm neck edge): placed by its marks on the stand top`;
        }
        planOf.set(U0, plan);
        // Turned down: the outer edge sits on a larger circle than the neck edge — lean the fall
        // out so its outer edge needs no stretch.
        const outer = restPath(cctx, U.other);
        let rTop = 0;
        for (const p of base.pts) rTop += inFrame(F, p).r;
        rTop /= Math.max(1, base.pts.length);
        const hs = U.other.map((v) => {
          const q = U.attach.length ? cuv[2 * v + 1] : 0;
          return Math.abs(q - cuv[2 * U.attach[Math.floor(U.attach.length / 2)] + 1]);
        });
        const H = hs.length ? hs.sort((x, y) => x - y)[Math.floor(hs.length / 2)] : 50;
        const dR = rTop * Math.max(0, outer.len / Math.max(1, plan.mf.path.len) - 1) + layer + 3;
        const alpha = Math.max(
          (15 * Math.PI) / 180,
          Math.min((75 * Math.PI) / 180, Math.asin(Math.min(1, dR / Math.max(1, H)))),
        );
        // No proxy push of its own: the contact below keeps it outside the stand (the torso's neck
        // cylinder, wider than a collar, would hold it off the stand top).
        const pi = proxies.push({ push() {}, pull() {} }) - 1;
        placeUnit(U, base, makeMap(plan.anchors), [0, plan.mf.path.len], 'down', layer, alpha, pi);
        for (const P of U.list) buildPanel(P);
        // One-sided contact: every vertex of the fall but its sewn neck edge stays outside the
        // stand point nearest to it at placement (dynamic — it follows the stand as both move).
        {
          const edge = new Set(U.attach);
          const fv: number[] = [];
          for (const P of U.list)
            for (let i = 0; i < P.count; i++) if (!edge.has(P.offset + i)) fv.push(P.offset + i);
          contactOf(fv, standV, 1.5 + layer);
        }
        const graphSewn =
          graphTouches(U.gid, new Set(['STAND'])) ||
          ordered.slice(0, idx).some((W) =>
            G.seams.some((sm) => {
              const ka = pk(sm.a[0]);
              const kb = pk(sm.b[0]);
              return (U.keys.has(ka) && W.keys.has(kb)) || (U.keys.has(kb) && W.keys.has(ka));
            }),
          );
        const sewnMm = plan.mf.path.len;
        const baseMm = plan.range[1] - plan.range[0];
        const label = idx === 0 ? 'collar ↔ stand top' : `collar ↔ stand top (layer ${idx + 1})`;
        // L4: a confirmed seam of this unit onto the stand — sewn by the K3 map, as the person's seam.
        const confFall = l4
          ? G.seams.find(
              (sm) =>
                isConf(sm.seam) &&
                !handled.has(sm) &&
                ((U.keys.has(pk(sm.a[0])) && stand.some((P) => P.key === pk(sm.b[0]))) ||
                  (U.keys.has(pk(sm.b[0])) && stand.some((P) => P.key === pk(sm.a[0])))),
            )
          : undefined;
        let confW: Work | null = null;
        if (confFall) {
          handled.add(confFall);
          confW = anchoredWork(
            `${confFall.seam.a}~${confFall.seam.b}`,
            plan.mf.path,
            plan.mt.path,
            plan.anchors,
            `collar ↔ stand top · ${plan.mf.path.len.toFixed(0)} ≈ ${(plan.range[1] - plan.range[0]).toFixed(0)} mm of the stand top · turned down over the stand · ${plan.words}`,
            0.7,
          );
          confW.origin = 'graph';
          confW.confirmed = true;
        }
        const work = confFall
          ? confW
          : graphSewn || owner
            ? null
            : anchoredWork(
                label,
                plan.mf.path,
                plan.mt.path,
                plan.anchors,
                `proposed by the doll · collar ↔ stand top · ${sewnMm.toFixed(0)} ≈ ${baseMm.toFixed(0)} mm of the stand top (${Math.abs(1 - sewnMm / Math.max(1, baseMm)) < 0.015 ? 'equal' : `eased ${(Math.abs(1 - sewnMm / Math.max(1, baseMm)) * 100).toFixed(0)} %`}) · turned down over the stand · ${plan.words} · not in the pattern`,
                0.7,
              );
        collarPlans.push({
          rep: {
            keys: U.list.map((P) => P.key),
            role: 'fall',
            base: 'stand top',
            seam: work?.id ?? null,
            attached: confFall
              ? 'confirmed'
              : work
                ? 'proposed'
                : graphTouches(U.gid, new Set(['STAND']))
                  ? 'graph'
                  : 'stacked',
            sewnMm,
            baseMm,
            ease: sewnMm / Math.max(1, baseMm),
            extMm: 0,
            anchors: plan.words,
            layer,
          },
          work,
          unit: U.list,
          standTop: top,
          topRange: plan.range,
          outer: U.other,
          stand,
          attach: U.attach,
        });
      });
    } else if (neck) {
      // No separate stand: a one-piece collar on the neck path, standing (roll line not modelled).
      placeOnNeck(ordered, 'collar', 'collar ↔ neckline');
      collarRep.notes.push(
        `one-piece collar (no separate stand): rolled over at ${Math.round(ROLL_FRAC * 100)} % of its depth — the pattern has no roll-line mark, so where it turns down is a prior, not read from the pattern`,
      );
    }
    // Seams inside the group (between stacked units too: placed above by the graph's own pairing).
    for (const sm of G.seams)
      if (inGroups(sm.a, new Set(['COLLAR'])) && inGroups(sm.b, new Set(['COLLAR'])))
        graphWork(sm, passes);
  }
  const ringLen = (gid: DollGroupId) => {
    const runs = groups.has(gid) ? stripRuns(groups.get(gid)!) : null;
    return runs ? loopPath(runs.bottom, uv, panelOf, 0, false, ringInfo).len : 400;
  };
  // Cuffs at the wrists.
  for (const s of ['L', 'R'] as const) {
    const gid: DollGroupId = s === 'L' ? 'CUFF_L' : 'CUFF_R';
    const sl: DollGroupId = s === 'L' ? 'SLEEVE_L' : 'SLEEVE_R';
    if (!groups.has(gid)) continue;
    const F0 = sleeveFrames[s];
    const loops = groups.has(sl) ? loopsOf(new Set([sl])) : [];
    const capTop = F0 ? fromFrame(F0, 0, 0, 0) : ([0, 0, 0] as Vec3);
    const big = loops.filter((l) => l.len > 100).map((l) => ({ l, c: centroid(l.verts) }));
    big.sort((x, y) => Math.hypot(...sub(y.c, capTop)) - Math.hypot(...sub(x.c, capTop)));
    const wrist = big[0]?.l ?? null;
    const F: Frame =
      F0 && wrist
        ? { ...F0, c: centroid(wrist.verts) }
        : { c: [s === 'L' ? 400 : -400, 0, 0], up: [0, 1, 0], e0: [0, 0, 1], e90: [1, 0, 0] };
    const runs = placeRing(gid, F, wrist?.verts ?? null, ringLen(gid) / TAU, 'top', 0, 2);
    for (const P of groups.get(gid)!) buildPanel(P);
    for (const sm of G.seams)
      if (inGroups(sm.a, new Set([gid])) && inGroups(sm.b, new Set([gid]))) graphWork(sm, passes);
    if (runs && wrist && !graphTouches(gid, new Set([sl])) && proposalsAllowed)
      propose(
        `${s === 'L' ? 'left' : 'right'} cuff ↔ wrist`,
        { verts: runs.top, closed: false },
        { verts: wrist.verts, closed: wrist.closed },
        'nearest',
        gid,
        0.3,
      );
  }
  /**
   * L4: a band piece laid along the stretch of the body its confirmed seam names — its sewn run on
   * that path (over the share the row's drawn parts take; a run carried on to a laid piece goes on
   * past the path's end), the piece standing `dir` (+1 up, −1 down) from it, its face out. Halves
   * of a band that are not sewn to each other share no ring order: each goes where its own row
   * says. Null when the band side is not one piece or a path cannot be drawn.
   */
  const layAlongRow = (
    sm: GroupedSeam,
    bandSide: 'a' | 'b',
    dir: 1 | -1,
    axis: Vec3,
  ): Panel | null => {
    const bodySide = bandSide === 'a' ? 'b' : 'a';
    const bandIds = bandSide === 'a' ? sm.a : sm.b;
    if (new Set(bandIds.map(pk)).size !== 1) return null;
    const P = panelByKey.get(pk(bandIds[0]));
    const Pb = sidePath(sm, bandSide);
    const Bp = sidePath(sm, bodySide);
    if (!P || !Pb || !Bp || Pb.v.length < 2 || Bp.v.length < 2 || Pb.len < 1 || Bp.len < 1)
      return null;
    if ([...Pb.v].some((v) => panelOf[v] !== P.idx)) return null;
    const share = laidEndsOf(sm, bodySide)?.share ?? [0, 1];
    const run = [...Pb.v].map((v) => [uv[2 * v], uv[2 * v + 1]] as Pt2);
    // Each vertex of the piece: where along its sewn run it lies (rest arc) and how far off it.
    const footOf = (q: Pt2) => {
      let best = { d: Infinity, s: 0, h: 0 };
      for (let k = 1; k < run.length; k++) {
        const a = run[k - 1];
        const b = run[k];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const l2 = dx * dx + dy * dy;
        if (l2 < 1e-12) continue;
        const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2));
        const fx = a[0] + t * dx;
        const fy = a[1] + t * dy;
        const d = Math.hypot(q[0] - fx, q[1] - fy);
        if (d < best.d) {
          // Past the run's ends the arc runs on (the band's end beyond its sewn run).
          const l = Math.sqrt(l2);
          const tt =
            k === 1 || k === run.length - 1
              ? ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2
              : t;
          const ext = k === 1 ? Math.min(tt, t) : k === run.length - 1 ? Math.max(tt, t) : t;
          best = {
            d,
            s: Pb.s[k - 1] + ext * l,
            h: (dx * (q[1] - a[1]) - dy * (q[0] - a[0])) / l,
          };
        }
      }
      return best;
    };
    const vs: number[] = [];
    for (let i = 0; i < P.count; i++) vs.push(P.offset + i);
    const feet = vs.map((v) => footOf([uv[2 * v], uv[2 * v + 1]]));
    // The piece lies on one side of its run: that side stands off the body.
    const side = feet.reduce((t, f) => t + f.h, 0) >= 0 ? 1 : -1;
    const B3 = [...Bp.v].map(getPos);
    const unitOf = (d: Vec3): Vec3 => {
      const l = Math.hypot(d[0], d[1], d[2]);
      return l > 1e-9 ? [d[0] / l, d[1] / l, d[2] / l] : [0, 0, 0];
    };
    const bodyAt = (t: number): Vec3 => {
      const s = t * Bp.len;
      const n = B3.length;
      // Past the path's end the run goes on round the body, at the end's height and radius.
      const roundOn = (E: Vec3, D: Vec3, e: number): Vec3 => {
        const rx = E[0] - axis[0];
        const rz = E[2] - axis[2];
        const r = Math.hypot(rx, rz);
        if (r < 1) return add(E, unitOf(D), e);
        const turn = rx * D[2] - rz * D[0] >= 0 ? 1 : -1;
        const th = Math.atan2(rz, rx) + (turn * e) / r;
        return [axis[0] + r * Math.cos(th), E[1], axis[2] + r * Math.sin(th)];
      };
      if (s <= 0) return roundOn(B3[0], sub(B3[0], B3[1]), -s);
      if (s >= Bp.len) return roundOn(B3[n - 1], sub(B3[n - 1], B3[n - 2]), s - Bp.len);
      let lo = 0;
      let hi = n - 1;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (Bp.s[m] <= s) lo = m;
        else hi = m;
      }
      const w = Bp.s[hi] > Bp.s[lo] ? (s - Bp.s[lo]) / (Bp.s[hi] - Bp.s[lo]) : 0;
      return add(B3[lo], sub(B3[hi], B3[lo]), w);
    };
    const span = Math.max(1e-6, share[1] - share[0]);
    const layOut = (same: boolean) =>
      feet.map((f) => {
        const r = f.s / Pb.len;
        const B = bodyAt(((same ? r : 1 - r) - share[0]) / span);
        const out = unitOf([B[0] - axis[0], 0, B[2] - axis[2]]);
        return add(add(B, [0, dir, 0], side * f.h), out, 2);
      });
    const outShare = (ps: Vec3[]) => {
      let good = 0;
      let all = 0;
      const t = P.mesh.tris;
      for (let k = 0; k + 2 < t.length; k += 3) {
        const A = ps[t[k]];
        const nrm = cross(sub(ps[t[k + 1]], A), sub(ps[t[k + 2]], A));
        const c = A;
        const out: Vec3 = [c[0] - axis[0], 0, c[2] - axis[2]];
        const d = dot(nrm, out);
        if (Math.abs(d) < 1e-9) continue;
        all++;
        if (d > 0) good++;
      }
      return all ? good / all : 0;
    };
    const lo = layOut(false);
    const hi = layOut(true);
    const ps = outShare(hi) > outShare(lo) ? hi : lo;
    vs.forEach((v, i) => {
      setPos(v, ps[i]);
      placed[v] = 1;
    });
    return P;
  };
  // Waistband / hem band.
  for (const gid of ['WAISTBAND', 'HEMBAND'] as DollGroupId[]) {
    if (!groups.has(gid)) continue;
    // L4: a band a confirmed seam sews onto the body / legs sits on THAT path (the body side of the
    // seam), attached by the run the seam names.
    if (l4) {
      const band = new Set([gid]);
      const conf = G.seams
        .filter((sm) => isConf(sm.seam))
        .map((sm) =>
          inGroups(sm.a, band) && inGroups(sm.b, bodyLike)
            ? { sm, bandSide: 'a' as const }
            : inGroups(sm.b, band) && inGroups(sm.a, bodyLike)
              ? { sm, bandSide: 'b' as const }
              : null,
        )
        .filter((x): x is NonNullable<typeof x> => !!x);
      const runs0 = conf.length ? stripRuns(groups.get(gid)!) : null;
      if (conf.length && runs0) {
        const baseV: number[] = [];
        const bandV = new Set<number>();
        for (const { sm, bandSide } of conf) {
          const bp = sidePath(sm, bandSide === 'a' ? 'b' : 'a');
          const up = sidePath(sm, bandSide);
          if (bp) baseV.push(...bp.v);
          if (up) for (const v of up.v) bandV.add(v);
        }
        const onTop =
          runs0.top.filter((v) => bandV.has(v)).length >
          runs0.bottom.filter((v) => bandV.has(v)).length;
        const F: Frame = {
          c: baseV.length ? centroid(baseV) : [0, 0, 0],
          up: [0, 1, 0],
          e0: [0, 0, 1],
          e90: [1, 0, 0],
        };
        placeRing(gid, F, baseV, ringLen(gid) / TAU, onTop ? 'top' : 'bottom', Math.PI, 2, onTop);
        // A band in pieces each sewn by a row of its own: each piece on its own stretch.
        const own = new Map<string, number>();
        for (const { sm, bandSide } of conf) {
          const k = pk((bandSide === 'a' ? sm.a : sm.b)[0]);
          own.set(k, (own.get(k) ?? 0) + 1);
        }
        const alongRow: string[] = [];
        if (conf.length > 1 || groups.get(gid)!.length > 1)
          for (const { sm, bandSide } of conf) {
            const k = pk((bandSide === 'a' ? sm.a : sm.b)[0]);
            if (own.get(k) !== 1) continue;
            const P = layAlongRow(sm, bandSide, gid === 'HEMBAND' ? -1 : 1, F.c);
            if (P) alongRow.push(P.key);
          }
        for (const P of groups.get(gid)!) buildPanel(P);
        for (const sm of G.seams)
          if (inGroups(sm.a, band) && inGroups(sm.b, band)) graphWork(sm, passes);
        warnings.push(
          `${gid === 'WAISTBAND' ? 'waistband' : 'hem band'}: on the path its confirmed seam${conf.length > 1 ? 's' : ''} name${conf.length > 1 ? '' : 's'} (${conf.map((x) => `${x.sm.seam.a}~${x.sm.seam.b}`).join(', ')}), by its ${onTop ? 'top' : 'bottom'} run${alongRow.length ? ` · ${alongRow.join(', ')} each along its own row` : ''}`,
        );
        continue;
      }
    }
    const host = loopsOf(bodyLike)
      .filter((l) => l.len > 200)
      .map((l) => ({ l, c: centroid(l.verts) }));
    host.sort((x, y) => (gid === 'WAISTBAND' ? y.c[1] - x.c[1] : x.c[1] - y.c[1]));
    const target = gid === 'WAISTBAND' ? host[0]?.l : hemLoop ?? host[0]?.l;
    const c = target ? centroid(target.verts) : ([0, 0, 0] as Vec3);
    const F: Frame = { c, up: [0, 1, 0], e0: [0, 0, 1], e90: [1, 0, 0] };
    // The band's own seams first (the halves joined at the centre back): its ring is their loop.
    for (const sm of G.seams)
      if (inGroups(sm.a, new Set([gid])) && inGroups(sm.b, new Set([gid]))) graphWork(sm, passes);
    const runs = placeRing(
      gid,
      F,
      target?.verts ?? null,
      ringLen(gid) / TAU,
      gid === 'WAISTBAND' ? 'bottom' : 'top',
      Math.PI,
      2,
    );
    for (const P of groups.get(gid)!) buildPanel(P);
    if (runs && target && proposalsAllowed) {
      let run = gid === 'WAISTBAND' ? runs.bottom : runs.top;
      // Halves joined end to end: the run is their long edges, not the short ends it turns into.
      if (gid === 'WAISTBAND' && dollNote.size) {
        const endIds = new Set<string>();
        for (const P of groups.get(gid)!) {
          const longest = Math.max(...P.geom.edges.map((e) => e.lenMm));
          for (const e of P.geom.edges) if (e.lenMm < 0.3 * longest) endIds.add(e.id);
        }
        const onEnd = (v: number) => {
          const Pn = panels[panelOf[v]];
          const r = ringOf[v];
          if (r < 0) return false;
          const rsI = Pn.mesh.bRs[r];
          const n = Pn.geom.rs.length;
          return Pn.geom.edges.some((e) => {
            if (!endIds.has(e.id)) return false;
            const span = (((e.e - e.s) % n) + n) % n;
            const off = (((rsI - e.s) % n) + n) % n;
            return off > 0 && off < span;
          });
        };
        let i0 = 0;
        let i1 = run.length - 1;
        // (a corner vertex followed by one on the end edge is the end's far corner: trimmed too)
        while (i0 < i1 && (onEnd(run[i0]) || onEnd(run[i0 + 1]))) i0++;
        while (i1 > i0 && (onEnd(run[i1]) || onEnd(run[i1 - 1]))) i1--;
        if (i1 - i0 >= 2) run = run.slice(i0, i1 + 1);
      }
      // The fly extension (the longer half's extra at the centre front) is not sewn to the top.
      const ext = gid === 'WAISTBAND' ? bandExt : null;
      const Pl = ext ? panelByKey.get(ext.key) : undefined;
      if (ext && Pl && run.length > 2) {
        const atStart = panelOf[run[0]] === Pl.idx;
        const atEnd = panelOf[run[run.length - 1]] === Pl.idx;
        if (atStart !== atEnd) {
          const seq = atStart ? run : [...run].reverse();
          let acc = 0;
          let k = 0;
          while (k + 1 < seq.length && acc < ext.mm) {
            const p = seq[k];
            const q = seq[k + 1];
            acc +=
              panelOf[p] === panelOf[q]
                ? Math.hypot(uv[2 * q] - uv[2 * p], uv[2 * q + 1] - uv[2 * p + 1])
                : 0;
            k++;
          }
          const kept = seq.slice(k);
          run = atStart ? kept : kept.reverse();
        }
      }
      propose(
        gid === 'WAISTBAND' ? 'waistband ↔ top of the body' : 'hem band ↔ hem',
        { verts: run, closed: false },
        { verts: target.verts, closed: target.closed },
        'front',
        gid,
        0.25,
        legInfo.length ? 0.3 : 0.7,
        // The body's edge may carry pleats / darts the band is sewn over (fold them closed).
        true,
      );
    }
  }
  // Graph seams between groups (whatever the graph found across them).
  for (const sm of G.seams) {
    if (handled.has(sm)) continue;
    const drawnOf = (ids: EdgeId[]) => ids.find((id) => panelByKey.has(pk(id))) ?? ids[0];
    const ga = panelByKey.get(pk(drawnOf(sm.a)))?.group;
    const gb = panelByKey.get(pk(drawnOf(sm.b)))?.group;
    if (!ga || !gb || ga === gb || ga === 'FLOAT' || gb === 'FLOAT') continue;
    if (bodyLike.has(ga) && bodyLike.has(gb)) continue;
    const far = gapOf(sm);
    const w = graphWork(sm, passes);
    if (w && far >= FAR && !w.confirmed && !w.sleeveCap) {
      w.released = true;
      w.solver.active = false;
      w.note = `its two edges are ${far.toFixed(0)} mm apart once the pieces are placed (${ga} ↔ ${gb}) — a wrong pairing? not sewn`;
    }
  }
  // A ply pair drawn as one panel (a double yoke: the plies are sewn to each other) that nothing
  // else holds: said as the pair, and what the order wants it sewn to — never «no seam found».
  const plyWords = (P: { key: string; layers: string[] }): string | null => {
    if (!P.layers.length) return null;
    const keys = new Set([P.key, ...P.layers]);
    const want = new Set<string>();
    for (const J of declaredJoins ?? [])
      if (J.parts.some((X) => X.some((k) => keys.has(k))))
        for (const X of J.parts) for (const k of X) if (!keys.has(k)) want.add(k);
    const others = [...want].slice(0, 4);
    return `layer pair ${[P.key, ...P.layers].join(' + ')} — the plies are sewn to each other, but the pair is not attached to the rest yet (${others.length ? `no seam to ${others.join(', ')}${want.size > others.length ? ', …' : ''}` : 'no seam to any other piece'}) — drawn apart`;
  };

  // Unplaceable pieces retain flat diagnostic geometry, but are omitted from garment frames and
  // from the final mesh. Their `floating` rows below remain the report of what was not placed.
  let xMax = 0;
  let yLow = Infinity;
  for (let v = 0; v < N; v++)
    if (placed[v]) {
      xMax = Math.max(xMax, pos[3 * v]);
      yLow = Math.min(yLow, pos[3 * v + 1]);
    }
  let xCursor = xMax + 200;
  // (a bag has no hem line vLo: its pieces stand level with its bottom)
  const yBase = bag && Number.isFinite(yLow) ? yLow : vLo + 200;
  const floating: DollReport['floating'] = [];
  // Pieces a chart laid together that no seam carries to the placed doll (a front whose side seam
  // no step names, with its yoke and the placket sewn onto it) float as ONE lot: laid as the chart
  // laid them, mirror included, so the seams among them are drawn from where they lie (a lot never
  // moves; they close as far as the chart matched them). A lone piece lies as cut, face up.
  const lotOf = (P: Panel): Panel[] => {
    for (const ch of charts.values())
      for (const c of ch.components)
        if (c.keys.includes(P.key)) {
          const lot = c.keys
            .map((k) => panelByKey.get(k))
            .filter((Q): Q is Panel => !!Q && (Q.group === 'FLOAT' || !placed[Q.offset]));
          return lot.length > 1 ? lot : [P];
        }
    return [P];
  };
  const lots: Panel[][] = [];
  const lotted = new Set<number>();
  for (const P of panels) {
    if ((P.group !== 'FLOAT' && placed[P.offset]) || lotted.has(P.idx)) continue;
    const lot = lotOf(P);
    for (const Q of lot) lotted.add(Q.idx);
    lots.push(lot);
  }
  for (const lot of lots) {
    const asChart = lot.length > 1;
    const at = asChart ? cuv : uv;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    for (const P of lot)
      for (let i = 0; i < P.count; i++) {
        x0 = Math.min(x0, at[2 * (P.offset + i)]);
        x1 = Math.max(x1, at[2 * (P.offset + i)]);
        y0 = Math.min(y0, at[2 * (P.offset + i) + 1]);
      }
    for (const P of lot) {
      for (let i = 0; i < P.count; i++) {
        const v = P.offset + i;
        setPos(v, [
          xCursor + at[2 * v] - x0,
          yBase + at[2 * v + 1] - y0,
          P.fold ? P.fold.off[i] : 0,
        ]);
        placed[v] = 1;
        hiddenFromView[v] = 1;
      }
      // Laid as cut, it is face up whatever the chart decided: its fold's plies are measured by it.
      if (!asChart) P.mirrored = false;
      if (P.fold) P.fold.plyDone = true;
      const has = G.seams.some((s) => pk(s.a[0]) === P.key || pk(s.b[0]) === P.key);
      floating.push({
        pieceKey: P.key,
        reason:
          plyWords(P) ??
          (asChart
            ? `drawn apart with ${lot
                .filter((Q) => Q !== P)
                .map((Q) => Q.key)
                .join(', ')} — sewn to each other, no seam reaches the placed pieces`
            : has
              ? 'sewn only to pieces outside any wrap group — drawn apart'
              : 'no seam found for any of its edges — drawn apart'),
      });
    }
    xCursor += x1 - x0 + 60;
    if (!asChart) continue;
    // The seams inside the lot: drawn from where the chart laid them.
    const keys = new Set(lot.map((P) => P.key));
    for (const sm of G.seams) {
      if (handled.has(sm) || ![...sm.a, ...sm.b].every((id) => keys.has(pk(id)))) continue;
      handled.add(sm);
      graphWork(sm, passes);
    }
  }

  // ── phase 2: everything ─────────────────────────────────────────────────────────────────
  for (let v = 0; v < N; v++) {
    anchor[3 * v] = pos[3 * v];
    anchor[3 * v + 1] = pos[3 * v + 1];
    anchor[3 * v + 2] = pos[3 * v + 2];
    // (a bag has nothing to hold it upright but a whisper of its placement)
    anchorK[v] = bag ? 0.001 : bodyLike.has(groupOfV[v]) || groupOfV[v] === 'FLOAT' ? 0 : 0.002;
  }
  for (const P of buildPanelLater) buildPanel(P);
  // A folded piece drawn apart never moves, but its fold contacts are paired all the same: the
  // report measures its ply gaps from them.
  for (const P of panels) if (P.fold && !built.has(P.idx)) buildPanel(P);
  for (let v = 0; v < N; v++) moving[v] = groupOfV[v] !== 'FLOAT' && proxyOf[v] >= 0 ? 1 : 0;
  const tSolve = now();
  // Probe switch: the pose as placed, before phase 2 (debugging placement priors).
  const frozen = !!(globalThis as { __DOLL_PLACED_ONLY?: boolean }).__DOLL_PLACED_ONLY;
  if (frozen) passCap = passes;
  const p2 = Math.max(300, maxPasses - passes - 400);
  run(p2);
  // Releases get their own budget past maxPasses (the settle loop follows).
  passCap = Math.max(passCap, passes + 3 * 120);
  releaseRounds(3, 120, 20, 12);

  // Settled? Max vertex travel over 20 passes; keep relaxing until it is below 1.5 mm, within a
  // fixed pass budget (no clock: the result must not depend on the machine).
  let travel = Infinity;
  let travelV = 0;
  let travelP99 = 0;
  const settleCap = frozen ? passes : passes + (opt.settlePasses ?? 2400);
  passCap = settleCap;
  while (passes < settleCap) {
    run(60);
    const snap = Float64Array.from(pos);
    const before = passes;
    run(20);
    if (passes === before) break;
    travel = 0;
    const ds: number[] = [];
    for (let i = 0; i < pos.length; i += 3) {
      const d = Math.hypot(pos[i] - snap[i], pos[i + 1] - snap[i + 1], pos[i + 2] - snap[i + 2]);
      ds.push(d);
      if (d > travel) [travel, travelV] = [d, i / 3];
    }
    ds.sort((x, y) => x - y);
    travelP99 = ds.length ? ds[Math.floor(0.99 * (ds.length - 1))] : 0;
    // Settled when the slowest point stops (max < 1.5 mm) — or when 99 % of the cloth moves under
    // three quarters of the «converged» bar and only a corner still creeps (11.10 corpus: SS26-005 ran its
    // whole 2400-pass budget for a 2.7 mm corner with p99 at 0.19 mm — the hot spot of the solve).
    if (travel < 1.5 || travelP99 <= 0.75) break;
  }
  if (!Number.isFinite(travel)) travel = 0;
  if (opt.debug)
    warnings.push(
      `debug: travel p99 ${travelP99.toFixed(2)} mm · max ${travel.toFixed(1)} mm at ${panels[panelOf[travelV]]?.key ?? '-'} (ring ${ringOf[travelV]})`,
    );
  // Settled: 99 % of the points move ≤ 1 mm per 20 passes (the max is reported too).
  const converged = travelP99 <= 1.0;
  if (!converged)
    warnings.push(
      `the doll did not settle — 1 % of the points still move more than ${travelP99.toFixed(1)} mm per 20 passes (max ${travel.toFixed(1)} mm); the shape shown is the last frame`,
    );
  const msSolve = now() - tSolve;

  // ── report ──────────────────────────────────────────────────────────────────────────────
  const SF = makeState();
  const st = strains(SF);
  const sorted = [...st].sort((x, y) => x - y);
  if (opt.debug) {
    const per = new Map<string, number[]>();
    for (let c = 0; c < SF.nStretch; c++) {
      const k = panels[panelOf[SF.di[c]]].key;
      if (!per.has(k)) per.set(k, []);
      per.get(k)!.push(st[c]);
    }
    const rows = [...per].map(([k, v]) => {
      v.sort((x, y) => x - y);
      return [k, v[Math.floor(0.9 * (v.length - 1))], v[v.length - 1]] as const;
    });
    rows.sort((x, y) => y[1] - x[1]);
    const worstK = rows[0]?.[0];
    let shown = 0;
    for (let c = 0; c < SF.nStretch && shown < 4; c++) {
      if (panels[panelOf[SF.di[c]]].key !== worstK || st[c] < 0.4) continue;
      shown++;
      const [i, j] = [SF.di[c], SF.dj[c]];
      warnings.push(
        `debug: ${worstK} edge ${i}-${j} rest ${SF.rest[c].toFixed(1)} uv ${uv[2 * i].toFixed(0)},${uv[2 * i + 1].toFixed(0)}→${uv[2 * j].toFixed(0)},${uv[2 * j + 1].toFixed(0)} chart ${cuv[2 * i].toFixed(0)},${cuv[2 * i + 1].toFixed(0)}→${cuv[2 * j].toFixed(0)},${cuv[2 * j + 1].toFixed(0)} pos ${getPos(i).map((x) => x.toFixed(0))}→${getPos(j).map((x) => x.toFixed(0))} ring ${ringOf[i]},${ringOf[j]}`,
      );
    }
    warnings.push(
      `debug: strain p90/max by panel: ${rows
        .slice(0, 10)
        .map(([k, a, b]) => `${k} ${(a * 100).toFixed(0)}/${(b * 100).toFixed(0)}`)
        .join(' · ')}`,
    );
  }
  const p99 = sorted.length ? sorted[Math.floor(0.99 * (sorted.length - 1))] : 0;
  const smax = sorted.length ? sorted[sorted.length - 1] : 0;
  let nan = 0;
  for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) nan++;

  /** Length mismatch the seam must absorb (a partial seam's short side lies on part of the long one). */
  const easeOf = (w: Work) => {
    const a = w.A.len * (w.aRange[1] - w.aRange[0]);
    const b = (w.B.len - (w.foldedMm ?? 0)) * (w.bRange[1] - w.bRange[0]);
    return Math.abs(a - b) / Math.max(a, b, 1e-9);
  };
  const seams: DollSeamReport[] = [];
  const contradictions: string[] = [];
  const closureReps: DollClosureReport[] = [];
  /** Share of a closure's contact pairs with the top piece outside the under piece, %. */
  const closureOutsidePct = (C: { i: Int32Array; j: Int32Array }) => {
    let out = 0;
    for (let q = 0; q < C.i.length; q++) {
      const i = C.i[q];
      const j = C.j[q];
      let nx = pos[3 * j];
      let nz = pos[3 * j + 2];
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl;
      nz /= nl;
      if ((pos[3 * i] - pos[3 * j]) * nx + (pos[3 * i + 2] - pos[3 * j + 2]) * nz >= -1) out++;
    }
    return (100 * out) / Math.max(1, C.i.length);
  };
  // L4 closures drawn overlapped: how close the centre-front lines are, how far the edges cross.
  for (const w of works) {
    const ov = w.overlap;
    if (!ov) continue;
    const ti = (w as Work & { tieIdx?: number }).tieIdx ?? -1;
    const T = ties[ti];
    const gaps: number[] = [];
    if (T)
      for (let q = 0; q < T.ia.length / (T.stride ?? 3); q++)
        gaps.push(Math.hypot(...tieGap(pos, T, q)));
    gaps.sort((x, y) => x - y);
    ov.cfGapP95Mm = gaps.length ? gaps[Math.floor(0.95 * (gaps.length - 1))] : NaN;
    // The two closure edges: mean distance between paired points (≈ offTop + offUnder).
    const At = ov.top === pk(w.a[0]) ? w.A : w.B;
    const Au = At === w.A ? w.B : w.A;
    const dd: number[] = [];
    const d3 = (a: number, b: number) =>
      Math.hypot(
        pos[3 * a] - pos[3 * b],
        pos[3 * a + 1] - pos[3 * b + 1],
        pos[3 * a + 2] - pos[3 * b + 2],
      );
    const same =
      d3(At.v[0], Au.v[0]) + d3(At.v[At.v.length - 1], Au.v[Au.v.length - 1]) <=
      d3(At.v[0], Au.v[Au.v.length - 1]) + d3(At.v[At.v.length - 1], Au.v[0]);
    for (let k = 2; k <= 18; k++) {
      const f = k / 20;
      const ia = At.v[Math.min(At.v.length - 1, Math.round(f * (At.v.length - 1)))];
      const ib =
        Au.v[Math.min(Au.v.length - 1, Math.round((same ? f : 1 - f) * (Au.v.length - 1)))];
      dd.push(d3(ia, ib));
    }
    ov.overlapMm = dd.length ? dd.reduce((x, y) => x + y, 0) / dd.length : NaN;
    const ci = (w as Work & { contactIdx?: number }).contactIdx ?? -1;
    const C = ci >= 0 ? contacts[ci] : undefined;
    if (C) ov.outsidePct = closureOutsidePct(C);
    const expect = ov.offTopMm + ov.offUnderMm;
    ov.ok =
      ov.cfGapP95Mm <= 4 &&
      Math.abs(ov.overlapMm - expect) <= Math.max(8, 0.35 * expect) &&
      (Number.isNaN(ov.outsidePct) || ov.outsidePct >= 90);
    closureReps.push(ov);
  }
  for (const w of works) {
    if (w.rejectedByPerson || w.hidden) continue;
    const m = measure(w);
    const sp = seamStretch(w, st, SF) * 100;
    if (opt.debug && w.origin === 'doll-proposed' && !w.released) {
      // Where along side A the proposal stays open: 10 bins, max gap in each.
      const g = rowGaps(pos, w.rows);
      const idx = new Map<number, number>();
      w.A.v.forEach((v, k) => idx.set(v, k));
      const bins = new Array(10).fill(0);
      for (let q = 0; q < w.rows.v.length; q++) {
        const k = idx.get(w.rows.v[q]);
        if (k === undefined) continue;
        const b = Math.min(9, Math.floor((10 * w.A.s[k]) / Math.max(1, w.A.len)));
        bins[b] = Math.max(bins[b], g[q]);
      }
      warnings.push(
        `debug: ${w.id} gaps along A (10 bins, max mm): ${bins.map((x) => x.toFixed(0)).join(' ')} · p95 ${m.p95.toFixed(1)} max ${m.max.toFixed(1)}`,
      );
    }
    // Twist: the other direction would fit the solved shape much better.
    const alt = seamRows(w.A, w.B, !w.same, w.aRange, w.bRange);
    const ag = rowGaps(pos, alt);
    const altMean = ag.reduce((x, y) => x + y, 0) / Math.max(1, ag.length);
    const twisted = w.origin === 'graph' && !w.closure && m.mean > 5 && altMean < 0.5 * m.mean;
    const lenA = w.A.len;
    const lenB = w.B.len;
    let state: DollSeamState;
    if (w.overlap) state = w.overlap.ok ? 'closed' : 'open';
    else if (w.virtual && w.kind === 'proposed-closure') state = 'proposed';
    else if (w.released || w.virtual) state = 'open';
    else if (w.origin === 'doll-proposed' || w.fromOrder) state = 'proposed';
    else if (twisted) state = 'twisted';
    // Open = a stretch of the seam stays apart (p95), not one corner point that lags.
    else if (m.p95 > 4 || m.max > 15) state = 'open';
    else if (sp > 3 && !(easeOf(w) > 0.03 && sp <= easeOf(w) * 100 + 2) && !w.crotch)
      state = 'stretched';
    else if (easeOf(w) > 0.015) state = 'eased';
    else state = 'closed';
    let note = w.note;
    if (!note) {
      if (state === 'closed')
        note =
          w.kind === 'partial' || Math.abs(lenA - lenB) > 0.03 * Math.max(lenA, lenB)
            ? `closed · partial: ${Math.min(lenA, lenB).toFixed(0)} mm onto ${Math.max(lenA, lenB).toFixed(0)} mm`
            : `closed · ${lenA.toFixed(0)} = ${lenB.toFixed(0)} mm`;
      else if (state === 'eased')
        note = `closed, eased ${(easeOf(w) * 100).toFixed(0)} % · ${lenA.toFixed(0)} vs ${lenB.toFixed(0)} mm${sp > 3 ? ' — paper cannot gather, so the ease shows as stretch' : ''}`;
      else if (state === 'stretched')
        note = `closes only if the paper stretches ${sp.toFixed(0)} % — a wrong edge or missing ease`;
      else if (state === 'open')
        note = `left open ${m.max.toFixed(0)} mm · lengths ${lenA.toFixed(0)} vs ${lenB.toFixed(0)} mm`;
      else note = `twisted — ends crossed; sewn the other way round?`;
      if (w.kind === 'partial' && state !== 'closed')
        note += ` · partial (${Math.min(lenA, lenB).toFixed(0)} onto ${Math.max(lenA, lenB).toFixed(0)} mm)`;
      // The crotch is a saddle under the body: paper strains there however right the seam is.
      if (w.crotch && (state === 'closed' || state === 'eased') && sp > 3)
        note += ` · the crotch: the paper strains ${sp.toFixed(0)} % in the saddle under the body (a doubly curved spot paper cannot take) — not a wrong seam`;
      // A seam the order's units gave the graph (units.ts): say where it came from.
      const unit = unitNotes.get(w.id);
      if (unit) note += ` · ${unit}`;
    } else if (w.origin === 'doll-proposed' || w.fromOrder)
      note += ` · gap after solving ${m.max.toFixed(0)} mm`;
    if (w.overlap) {
      const o = w.overlap;
      note = `closure, buttoned: ${o.top} over ${o.under} · ${o.how} · centre-front lines meet within ${o.cfGapP95Mm.toFixed(1)} mm (p95) · the edges cross ${o.overlapMm.toFixed(0)} mm (expected ${(o.offTopMm + o.offUnderMm).toFixed(0)}) · ${Number.isNaN(o.outsidePct) ? 'no overlap zone' : `${o.outsidePct.toFixed(0)} % of the top's overlap outside`}`;
    }
    // L4: a confirmed seam that does not close is a contradiction — said, never dropped.
    if (w.confirmed && !w.overlap) {
      if (state === 'open' || state === 'twisted') {
        const words = `${w.id}: confirmed by a person but it does not close — ${state}, gap p95 ${m.p95.toFixed(0)} / max ${m.max.toFixed(0)} mm, strain ${sp.toFixed(0)} %, lengths ${lenA.toFixed(0)} vs ${lenB.toFixed(0)} mm: the row contradicts the pattern (or the rest of the rows)`;
        contradictions.push(words);
        note = `CONTRADICTION — ${words}`;
      } else note = `confirmed by a person · ${note}`;
    } else if (w.confirmed && w.overlap) note = `confirmed by a person · ${note}`;
    else if (w.guess)
      note = `step ${w.guess.step} names no row — the step picture's guess · ${note}`;
    // Sewn over its drawn stretch only: the stretch on a piece not drawn is said, never dropped
    // (measured below where that piece is laid; unchecked where it is not).
    if (w.laidEnds)
      note += ` · measured over its stretch on drawn pieces only — its stretch on ${w.laidEnds.off.join(', ')} (not drawn) is not checked here`;
    seams.push({
      id: w.id,
      a: w.laidEnds?.a ?? w.a,
      b: w.laidEnds?.b ?? w.b,
      kind: w.fromOrder ? 'from-order' : w.kind,
      origin: w.fromOrder ? 'doll-proposed' : w.origin,
      lenA,
      lenB,
      residualMeanMm: m.mean,
      residualMaxMm: m.max,
      residualP95Mm: m.p95,
      stretchPct: sp,
      twisted,
      state,
      released: w.released,
      note,
      // As sewn: a side pulled together over a stretch of its edge is drawn over that stretch.
      pathA: Uint32Array.from(sewnStretch(w.A, w.aRange)),
      pathB: Uint32Array.from(sewnStretch(w.B, w.bRange)),
      ...(w.partRange ? { partRange: w.partRange } : {}),
      ...(w.foldedMm ? { foldedMm: w.foldedMm } : {}),
      ...(l4
        ? {
            decidedBy: w.confirmed
              ? ('person' as const)
              : w.origin === 'graph' && !w.fromOrder && !w.guess
                ? ('engine' as const)
                : ('doll' as const),
          }
        : {}),
      ...(owner && w.confirmed ? { inStep: w.inStep ?? false } : {}),
      ...(w.guess ? { guessed: true } : {}),
    });
  }
  // A contradiction next to a confirmed seam stretched > 20 % on the same pieces: that seam is the
  // likely culprit (it pulls the pieces away from where the contradicted seam wants them).
  if (l4) {
    const piecesOf = (s: { a: string[]; b: string[] }) => new Set([...s.a, ...s.b].map(pk));
    const pulled = seams.filter(
      (s) => s.decidedBy === 'person' && s.state === 'stretched' && s.stretchPct > 20,
    );
    for (const s of seams) {
      if (!s.note.startsWith('CONTRADICTION — ')) continue;
      const P = piecesOf(s);
      const c = pulled.find((x) => x !== s && [...piecesOf(x)].some((k) => P.has(k)));
      if (!c) continue;
      const add = ` · most likely culprit: the confirmed seam ${c.id} closes only by stretching ${c.stretchPct.toFixed(0)} % and pulls ${[...piecesOf(c)].join(' and ')} together`;
      const i = contradictions.findIndex((w) => s.note.endsWith(w));
      if (i >= 0) contradictions[i] += add;
      s.note += add;
    }
  }
  for (const s of G.layerSeams)
    seams.push({
      id: `${s.a}~${s.b}`,
      a: edgeIdsOf(s.a),
      b: edgeIdsOf(s.b),
      kind: s.kind,
      origin: 'layer',
      lenA: s.evidence.aLenMm ?? 0,
      lenB: s.evidence.bLenMm ?? 0,
      residualMeanMm: 0,
      residualMaxMm: 0,
      residualP95Mm: 0,
      stretchPct: 0,
      twisted: false,
      state: 'closed',
      note:
        owner && isConf(s)
          ? 'confirmed by a person · layer seam — the layers are drawn as one piece'
          : owner && isGuess(s)
            ? `step ${guessStepOf.get(s.provenance!.seamKey)} names no row — the step picture's guess · layer seam — the layers are drawn as one piece`
            : 'layer seam — the layers are drawn as one piece',
      pathA: new Uint32Array(0),
      pathB: new Uint32Array(0),
      ...(owner
        ? {
            decidedBy: isConf(s)
              ? ('person' as const)
              : isGuess(s)
                ? ('doll' as const)
                : ('engine' as const),
          }
        : {}),
      ...(owner && isConf(s) ? { inStep: ownerInStepKeys.has(s.provenance?.seamKey ?? '') } : {}),
      ...(owner && isGuess(s) ? { guessed: true } : {}),
    });
  const undrawnGuesses: NonNullable<DollReport['notSewn']> = [];
  // ── SURFACE PIECES BY ROWS (owner): the panel and the place each one is laid on come from the
  // confirmed row that sews it (surface-rows.ts), never from its name. Rows that touch a laid piece
  // are measured once the pieces are laid (below), not called undrawable.
  const ownerSurface = new Map(
    graph.chosen.flatMap((candidate) =>
      owner && candidate.kind === 'surface' && candidate.surface
        ? [[candidate.surface.part, candidate.surface] as const]
        : [],
    ),
  );
  const geomOfKey = new Map(graph.pieces.map((g) => [g.pieceKey, g]));
  const shellHosts = new Set(
    panels
      .filter((P) => P.group === 'LEG_L' || P.group === 'LEG_R' || P.group === 'BODY')
      .map((P) => P.key),
  );
  const rowLays: Map<string, RowLay> = owner
    ? planSurfaceByRows({
        parts: G.skipped.filter((x) => x.surface).map((x) => x.pieceKey),
        fixed: new Map(
          [...ownerSurface].flatMap(([part, s]) =>
            shellHosts.has(s.host) ? [[part, { host: s.host, T: s.T }] as const] : [],
          ),
        ),
        hosts: shellHosts,
        geoms: geomOfKey,
        rows: graphIn.chosen.filter(
          (c) => isConf(c) && c.kind !== 'surface' && c.kind !== 'closure-not-seam',
        ),
      })
    : new Map();
  /** Rows measured on the laid pieces: every stretch on a drawn panel or a laid piece. */
  const laidRows: SeamCandidate[] = [];
  const leadPart = <T extends { id: EdgeId; piece: string }>(p: T): T => {
    const id = G.leadEdge?.(p.id) ?? p.id;
    return id === p.id ? p : { ...p, id, piece: pk(id) };
  };
  if (owner && (rowLays.size || ownerSurface.size)) {
    const reported = new Set(seams.map((seam) => seam.id));
    // (a row sewn over its drawn parts is reported over the whole row once its laid end is laid)
    const sewnShort = new Set(
      works.filter((w) => w.laidEnds && !w.hidden && !w.rejectedByPerson).map((w) => w.id),
    );
    const laid = (k: string) => rowLays.has(k) || ownerSurface.has(k);
    for (const c of graphIn.chosen) {
      if (!isConf(c) || c.kind === 'surface' || c.kind === 'closure-not-seam') continue;
      if (reported.has(`${c.a}~${c.b}`) && !sewnShort.has(`${c.a}~${c.b}`)) continue;
      const parts = [...rowParts(c, 'a'), ...rowParts(c, 'b')].map(leadPart);
      if (
        parts.some((p) => laid(p.piece)) &&
        parts.every((p) => laid(p.piece) || panelByKey.has(p.piece))
      )
        laidRows.push(c);
    }
  }
  const laidRowIds = new Set(laidRows.map((c) => `${c.a}~${c.b}`));
  if (owner) {
    const reported = new Set(seams.map((seam) => seam.id));
    for (const candidate of graphIn.chosen) {
      if (
        candidate.provenance?.status !== 'confirmed' ||
        candidate.kind === 'surface' ||
        candidate.kind === 'closure-not-seam'
      )
        continue;
      const id = `${candidate.a}~${candidate.b}`;
      if (reported.has(id) || laidRowIds.has(id)) continue;
      if (isGuess(candidate)) {
        // A guess the doll could not draw is no contradiction: said, not counted open.
        undrawnGuesses.push({
          id,
          a: (candidate.aParts ?? edgeIdsOf(candidate.a)).flatMap(edgeIdsOf),
          b: (candidate.bParts ?? edgeIdsOf(candidate.b)).flatMap(edgeIdsOf),
          note: `step ${guessStepOf.get(candidate.provenance.seamKey)} names no row — the step picture's guess could not be drawn on the current pieces`,
        });
        reported.add(id);
        continue;
      }
      const existing = preContradictions.find((words) => words.startsWith(`${id}:`));
      const words =
        existing ??
        `${id}: confirmed by a person but its named path cannot be drawn on the current pieces — the row contradicts the pattern`;
      if (!existing) contradictions.push(words);
      seams.push({
        id,
        a: (candidate.aParts ?? edgeIdsOf(candidate.a)).flatMap(edgeIdsOf),
        b: (candidate.bParts ?? edgeIdsOf(candidate.b)).flatMap(edgeIdsOf),
        kind: candidate.kind,
        origin: 'graph',
        lenA: candidate.evidence.aLenMm ?? 0,
        lenB: candidate.evidence.bLenMm ?? 0,
        residualMeanMm: 0,
        residualMaxMm: 0,
        residualP95Mm: 0,
        stretchPct: 0,
        twisted: false,
        state: 'open',
        decidedBy: 'person',
        inStep: ownerInStepKeys.has(candidate.provenance?.seamKey ?? ''),
        note: `CONTRADICTION — ${words}`,
        pathA: new Uint32Array(0),
        pathB: new Uint32Array(0),
      });
      reported.add(id);
    }
  }

  // Graph pairings the doll will not sew: words, not seams (never counted open).
  const notSewn: NonNullable<DollReport['notSewn']> = [
    ...undrawnGuesses,
    ...suspects.map(({ s: sm, note }) => ({
      id: `${sm.seam.a}~${sm.seam.b}`,
      a: sm.a,
      b: sm.b,
      note,
    })),
    ...refusedMirror,
    ...unitDropped,
    ...ringNotSewn,
  ];
  // Pocket bags (joins.ts): the two bag pieces sewn round the bag — a seam of the order, drawn on
  // the panel they are sewn onto, never solved (surface pieces have no mesh in the solve).
  for (const x of bagSeams)
    seams.push({
      id: `${x.seam.a}~${x.seam.b}`,
      a: edgeIdsOf(x.seam.a),
      b: edgeIdsOf(x.seam.b),
      kind: 'from-order',
      origin: 'doll-proposed',
      lenA: x.seam.evidence.aLenMm ?? 0,
      lenB: x.seam.evidence.bLenMm ?? 0,
      residualMeanMm: 0,
      residualMaxMm: 0,
      residualP95Mm: 0,
      stretchPct: 0,
      twisted: false,
      state: 'proposed',
      note: x.note,
      pathA: new Uint32Array(0),
      pathB: new Uint32Array(0),
      ...(l4 ? { decidedBy: 'doll' as const } : {}),
    });
  // Free edges facing each other (a seam the pattern has not got): reported open, never solved.
  const freeAll = (owner ? [] : panels)
    .filter((P) => P.group !== 'FLOAT')
    .flatMap((P) =>
      freeEdges(P)
        .filter((e) => e.lenMm >= 60)
        .map((e) => ({ P, e })),
    );
  const taken = new Set<string>();
  for (let i = 0; i < freeAll.length; i++)
    for (let j = i + 1; j < freeAll.length; j++) {
      const x = freeAll[i];
      const y = freeAll[j];
      if (x.P === y.P || x.P.group !== y.P.group || taken.has(x.e.id) || taken.has(y.e.id))
        continue;
      if (Math.abs(x.e.lenMm - y.e.lenMm) / Math.max(x.e.lenMm, y.e.lenMm) > 0.08) continue;
      // The same two edges as a seam already reported open (released): said once, not twice.
      const pairKey = [x.e.id, y.e.id].sort().join('~');
      if (
        works.some(
          (w) =>
            w.released &&
            !w.hidden &&
            w.a.length === 1 &&
            w.b.length === 1 &&
            [w.a[0], w.b[0]].sort().join('~') === pairKey,
        )
      )
        continue;
      const A = pathOf([x.e.id]);
      const B = pathOf([y.e.id]);
      if (!A || !B) continue;
      const gap = Math.min(
        meanDist(A, B, false, [0, 1], [0, 1]),
        meanDist(A, B, true, [0, 1], [0, 1]),
      );
      if (gap > 40) continue;
      taken.add(x.e.id);
      taken.add(y.e.id);
      // Mirror halves facing on their centre line (both edges running up the pieces): the centre
      // opening left free — a closure (buttons / zip), not a seam the pattern forgot.
      const upE = (e: Edge) => {
        const p = e.pts[0];
        const q = e.pts[e.pts.length - 1];
        return Math.atan2(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1])) <= Math.PI / 6;
      };
      const handOfP = (P: Panel) => P.geom.hand ?? readName(P.geom.name).hand;
      const centre =
        !bag &&
        x.P.group === 'BODY' &&
        y.P.group === 'BODY' &&
        Math.min(x.e.lenMm, y.e.lenMm) >= 300 &&
        ![x.P.role, y.P.role].some((r) => r === 'back' || r === 'yoke') &&
        (x.P.geom.twinOf.some((t) => t.key === y.P.key && t.kind === 'mirror') ||
          (!!handOfP(x.P) && !!handOfP(y.P) && handOfP(x.P) !== handOfP(y.P))) &&
        upE(x.e) &&
        upE(y.e);
      if (centre) {
        seams.push({
          id: `${x.e.id}~${y.e.id}`,
          a: [x.e.id],
          b: [y.e.id],
          kind: 'proposed-closure',
          origin: 'doll-proposed',
          lenA: A.len,
          lenB: B.len,
          residualMeanMm: gap,
          residualMaxMm: gap,
          residualP95Mm: gap,
          stretchPct: 0,
          twisted: false,
          state: 'proposed',
          note: `the centre opening — ${x.e.id} and ${y.e.id} (${x.e.lenMm.toFixed(0)} mm) are the mirror halves' centre lines, left free ${gap.toFixed(0)} mm apart: a closure (buttons / zip), not a seam`,
          pathA: Uint32Array.from(A.v),
          pathB: Uint32Array.from(B.v),
        });
        continue;
      }
      seams.push({
        id: `${x.e.id}~${y.e.id}`,
        a: [x.e.id],
        b: [y.e.id],
        kind: 'facing-free',
        origin: 'doll-proposed',
        lenA: A.len,
        lenB: B.len,
        residualMeanMm: gap,
        residualMaxMm: gap,
        residualP95Mm: gap,
        stretchPct: 0,
        twisted: false,
        state: 'open',
        note: `open — ${x.e.id} (${x.e.lenMm.toFixed(0)} mm) and ${y.e.id} (${y.e.lenMm.toFixed(0)} mm) lie ${gap.toFixed(0)} mm apart, free, about equal: a seam the pattern has not got?`,
        pathA: Uint32Array.from(A.v),
        pathB: Uint32Array.from(B.v),
      });
    }

  // Loops for the report.
  const loopsOut: DollLoop[] = [];
  const labelOf = (l: RawLoop) =>
    l === neckLoop
      ? 'neck'
      : l === hemLoop
        ? 'hem'
        : l === armLoop.L
          ? 'armhole-L'
          : l === armLoop.R
            ? 'armhole-R'
            : 'other';
  for (const l of bodyLoops)
    loopsOut.push({
      group: 'BODY',
      label: labelOf(l),
      lenMm: l.len,
      closed: l.closed,
      path: Uint32Array.from(l.verts),
    });

  for (const p of proposals) if (!p.ok) void p;
  // ── SURFACE PIECES on their host panel (surface.ts): laid on the solved panel, not solved ──
  const surfaceRep: NonNullable<DollReport['surface']> = [...bagSurfaceRows];
  const surfacePanels: DollReport['panels'] = [];
  const surfacePos: number[] = [];
  /** A laid piece's point (its pattern frame) on the doll, `liftQ` mm off its host's face. */
  const layAt = new Map<
    string,
    { at: (q: Pt2, liftQ: number) => Vec3; offset: number; mesh: PieceMesh }
  >();
  {
    // (trousers for now: a top's pockets / facings stay listed as before — except the two pieces
    // of a pocket bag the order sews round, and a piece a confirmed row lays: drawn on any garment)
    const bagPieces = new Set(bagSeams.flatMap((x) => [pk(x.seam.a), pk(x.seam.b)]));
    const depthOf = (k: string) => rowLays.get(k)?.depth ?? 0;
    const surf = G.skipped
      .filter(
        (x) =>
          x.surface &&
          (ownerSurface.has(x.pieceKey) ||
            rowLays.has(x.pieceKey) ||
            legsCat0 ||
            bagPieces.has(x.pieceKey)),
      )
      .map((x) => x.pieceKey)
      // A part laid over another is laid after it (it stacks a layer further from the face).
      .sort((x, y) => depthOf(x) - depthOf(y));
    // Hosts are the garment's panels (a leg, the body) — never a band, a collar or a cuff.
    const drawnArea = new Map(
      panels
        .filter((P) => P.group === 'LEG_L' || P.group === 'LEG_R' || P.group === 'BODY')
        .map((P) => [P.key, Math.abs(P.geom.areaMm2)]),
    );
    const hosts = surfaceHosts(surf, declaredJoins ?? [], drawnArea);
    for (const [part, surface] of ownerSurface)
      hosts.set(part, { host: surface.host, join: 'owner row' });
    for (const [part, l] of rowLays)
      if (!ownerSurface.has(part)) hosts.set(part, { host: l.host, join: `owner row ${l.row}` });
    /** Footprints already laid on each host (host frame), for the layer a new one lies in. */
    const footprints = new Map<string, Pt2[][]>();
    let M = N;
    for (const k of surf) {
      const S = geomOfKey.get(k);
      const hk = hosts.get(k);
      const H = hk ? panelByKey.get(hk.host) : undefined;
      if (!S || !hk || !H) {
        surfaceRep.push({
          pieceKey: k,
          host: null,
          join: null,
          placed: false,
          note: declaredJoins?.length
            ? 'no join of the order sews it to a drawn panel — not placed'
            : "no technologist's order to say which panel carries it — not placed",
        });
        continue;
      }
      const ownerPlacement = ownerSurface.get(k);
      const rowLay = ownerPlacement ? undefined : rowLays.get(k);
      const fit = ownerPlacement
        ? {
            map: (point: Pt2) => apply(ownerPlacement.T, point),
            flip: det(ownerPlacement.T) < 0,
            cover: 1,
            past: 0,
            how: 'owner placement',
          }
        : rowLay
          ? {
              map: (point: Pt2) => apply(rowLay.T, foldPt(rowLay.fold, point)),
              flip: det(rowLay.T) < 0,
              cover: rowLay.cover,
              past: 0,
              // The half turned over lies a layer further from the face.
              ...(rowLay.fold ? { under: (point: Pt2) => foldedUnder(rowLay.fold, point) } : {}),
              how: rowLay.how,
            }
          : surfaceFit(S, H.geom);
      if (!fit) {
        surfaceRep.push({
          pieceKey: k,
          host: H.key,
          join: hk.join,
          placed: false,
          note: `sewn onto ${H.key} (order «${hk.join}»), but no mark on that panel and no corner of it takes the piece face up — not placed`,
        });
        continue;
      }
      const flipH = H.mirrored !== faceFlip.has(H.idx);
      // Host vertex normals, out of the garment (the report's winding, a folded part turned).
      const nrm = new Float64Array(3 * H.count);
      const T = H.mesh.tris;
      for (let t = 0; t < T.length; t += 3) {
        const flipT = flipH !== (H.fold?.triFlip[t / 3] === 1);
        const a = T[t];
        const b = flipT ? T[t + 2] : T[t + 1];
        const c = flipT ? T[t + 1] : T[t + 2];
        const A = getPos(H.offset + a);
        const n = cross(sub(getPos(H.offset + b), A), sub(getPos(H.offset + c), A));
        for (const v of [a, b, c]) for (let d = 0; d < 3; d++) nrm[3 * v + d] += n[d];
      }
      // A layer further from the face for each piece laid before it that it overlaps.
      const foot = S.rs.filter((_, i) => i % 6 === 0).map((q) => fit.map(q));
      const below = footprints.get(H.key) ?? [];
      const overlaps = below.filter(
        (F) => foot.some((p) => pointInPolygon(p, F)) || F.some((p) => pointInPolygon(p, foot)),
      ).length;
      const lift = 2 + 2 * overlaps;
      footprints.set(H.key, [...below, foot]);
      const layerDirection = isUnder([H.key], [k]) ? 1 : -1;
      const hp = H.mesh.pts;
      // A part that carries a closure's marks keeps what overhangs the host: its holes are there.
      const carried = fastened.flatMap((f) =>
        [f.top, f.under].filter((x) => x.part === k && x.P === H),
      );
      const baseOfHost = carried.length ? basePlyOf(H) : null;
      const onBase = (t: number) => !H.fold || H.fold.triPly[t / 3] === 0;
      const ON_EDGE = 0.05; // past a triangle by its own weights: about a millimetre
      /**
       * The host triangle under p, on the base ply where there is one (a ply turned under or over
       * it would lift the part by a ply here and there), or the nearest, the point clamped onto it.
       * A point a hair past the base ply's edge (a part laid along the host's folded edge) stays on
       * the base ply: the plies turned under that edge lie deeper, not on the face.
       */
      const locate = (p: Pt2) => {
        let bt = 0;
        let bw: [number, number, number] = [1, 0, 0];
        let bd = Infinity;
        for (const anyPly of [false, true]) {
          for (let t = 0; t < T.length; t += 3) {
            if (!anyPly && !onBase(t)) continue;
            const A = hp[T[t]];
            const B = hp[T[t + 1]];
            const C = hp[T[t + 2]];
            const det = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
            if (Math.abs(det) < 1e-9) continue;
            let u = ((B[1] - C[1]) * (p[0] - C[0]) + (C[0] - B[0]) * (p[1] - C[1])) / det;
            let v = ((C[1] - A[1]) * (p[0] - C[0]) + (A[0] - C[0]) * (p[1] - C[1])) / det;
            let w = 1 - u - v;
            const out = Math.max(0, -u) + Math.max(0, -v) + Math.max(0, -w);
            if (out < bd) {
              u = Math.max(0, u);
              v = Math.max(0, v);
              w = Math.max(0, w);
              const sw = u + v + w || 1;
              bd = out;
              bt = t;
              bw = [u / sw, v / sw, w / sw];
              if (out === 0) break;
            }
          }
          if (bd < ON_EDGE) break;
        }
        return { bt, bw, bd };
      };
      const across = (p: Pt2) => !!baseOfHost && carried.some((x) => pastAcross(H, x.free, p));
      // The host's turns as cut, the last made first. A part past the host's footprint over a
      // region the host turned away (a placket's end over the hem allowance: sewn on after the hem,
      // its end is turned under at the finished edge) turns under on the same crease.
      const turns = (H.fold?.creases ?? []).flatMap((c) => {
        const L = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
        if (L < 1e-6) return [];
        const n: Pt2 = [-(c.b[1] - c.a[1]) / L, (c.b[0] - c.a[0]) / L];
        const s = (c.flipAt[0] - c.a[0]) * n[0] + (c.flipAt[1] - c.a[1]) * n[1];
        return Math.abs(s) > 1e-6 ? [{ a: c.a, b: c.b, n, s: Math.sign(s) }] : [];
      });
      turns.reverse();
      // Past the footprint across the closure, looked for along the crease (beside it the
      // footprint's end runs with the crease, not square to the closure's free side).
      const acrossAlong = (q: Pt2, c: (typeof turns)[number]) =>
        !!baseOfHost &&
        carried.some(({ free }) => {
          if (!free) return false;
          const L = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
          const k = -((c.b[0] - c.a[0]) * free.n[0] + (c.b[1] - c.a[1]) * free.n[1]) / L;
          if (Math.abs(k) < 0.5) return false;
          const tx = (Math.sign(k) * (c.b[0] - c.a[0])) / L;
          const ty = (Math.sign(k) * (c.b[1] - c.a[1])) / L;
          const reach = (2 * Math.max(free.off, 1)) / Math.abs(k);
          for (let d = 2; d <= reach; d += 2)
            if (locate([q[0] + tx * d, q[1] + ty * d]).bd <= 1e-9) return true;
          return false;
        });
      // A part carrying a closure turns its end up along its own column: its edges along the
      // closure stay over each other, as a strip's are when its end is pressed up, where a mirror
      // in a crease sloping across the strip would swing the turned edge out past the face.
      const column = carried.find((x) => x.free)?.free?.n;
      const turnUnder = (p: Pt2) => {
        for (const c of turns) {
          // How far p lies on the turned side (a point on the crease belongs to both).
          const dd = ((p[0] - c.a[0]) * c.n[0] + (p[1] - c.a[1]) * c.n[1]) * c.s;
          if (dd < -0.5) continue;
          const k = column ? (-column[1] * c.n[0] + column[0] * c.n[1]) * c.s : 0;
          const r = 2 * Math.max(dd, 0);
          const q: Pt2 =
            column && Math.abs(k) > 0.5
              ? [p[0] + (r / k) * column[1], p[1] - (r / k) * column[0]]
              : [p[0] - r * c.s * c.n[0], p[1] - r * c.s * c.n[1]];
          // Tested half a millimetre in from the crease: on it lies the footprint's own end.
          const qt: Pt2 = [q[0] - 0.5 * c.s * c.n[0], q[1] - 0.5 * c.s * c.n[1]];
          const L = locate(q);
          const inside = L.bd <= 1e-9 || locate(qt).bd <= 1e-9;
          if (inside || across(qt) || acrossAlong(qt, c)) return { q, L, turn: c, past: !inside };
        }
        return null;
      };
      // A crease the part turns under on is a line of its mesh: the turned end is cut clean.
      const Tinv = ownerPlacement
        ? invertAffine(ownerPlacement.T)
        : rowLay && !rowLay.fold
          ? invertAffine(rowLay.T)
          : null;
      const turnedOn = new Set<(typeof turns)[number]>();
      if (Tinv && turns.length)
        for (let i = 0; i < S.rs.length; i += 2) {
          const p = fit.map(S.rs[i]);
          if (locate(p).bd <= 1e-9 || across(p)) continue;
          const u = turnUnder(p);
          if (u) turnedOn.add(u.turn);
        }
      const meshCreases: MeshCrease[] = Tinv
        ? [...turnedOn].flatMap((c) => chordMm(S.rs, apply(Tinv, c.a), apply(Tinv, c.b)) ?? [])
        : [];
      // A part folded on itself is cut clean along its fold.
      if (rowLay?.fold) {
        const { a, n } = rowLay.fold;
        const c = chordMm(
          S.rs,
          [a[0] - 1e4 * n[1], a[1] + 1e4 * n[0]],
          [a[0] + 1e4 * n[1], a[1] - 1e4 * n[0]],
        );
        if (c) meshCreases.push(c);
      }
      const mesh = meshPiece(
        S.rs,
        [...S.edges.flatMap((e) => [e.s, e.e]), ...S.corners],
        gridH,
        meshCreases,
      );
      /** Where on the host a point of the part lies: its own place, or turned under. */
      const placeOf = (p0: Pt2) => {
        let p = p0;
        let { bt, bw, bd } = locate(p);
        let isPast = bd > 1e-9 && across(p);
        let turned = false;
        if (bd > 1e-9 && !isPast) {
          const u = turnUnder(p);
          if (u) {
            p = u.q;
            ({ bt, bw, bd } = u.L);
            isPast = bd > 1e-9 && u.past;
            turned = true;
          }
        }
        return { p, bt, bw, bd, isPast, turned };
      };
      const lay = (p0: Pt2, liftQ: number): Vec3 => {
        const { p, bt, bw, isPast, turned } = placeOf(p0);
        // Out of the garment, mm, a part over its host out of it, one under it in. Turned under:
        // a layer on the part's wrong side, toward the body whichever side of the host the part
        // lies (over it: between the two; under it: deeper in).
        const shift = layerDirection * liftQ - (turned ? 2 : 0);
        const X: Vec3 = [0, 0, 0];
        const Nn: Vec3 = [0, 0, 0];
        // Past the footprint: the host's surface carried on as the solver holds it (spreadPast);
        // its way out is the host's normals round the point, nearest the most.
        const past =
          baseOfHost && isPast
            ? spreadPast(hp, baseOfHost, p) ?? stencilPast(hp, baseOfHost, p)
            : null;
        const L = past ?? { i: [T[bt], T[bt + 1], T[bt + 2]], w: bw };
        const g = L.i.map((v, j) =>
          past
            ? Math.exp(
                -((hp[v][0] - p[0]) ** 2 + (hp[v][1] - p[1]) ** 2) / (2 * PAST_SIGMA_MM ** 2),
              )
            : L.w[j],
        );
        L.i.forEach((v, j) => {
          const P3 = getPos(H.offset + v);
          for (let d = 0; d < 3; d++) {
            X[d] += L.w[j] * P3[d];
            Nn[d] += g[j] * nrm[3 * v + d];
          }
        });
        const nl = Math.hypot(Nn[0], Nn[1], Nn[2]) || 1;
        // Inside the panel: a fly shield, a pocket bag, a facing lie under the face they are sewn
        // to (a patch pocket would lie over it — the drawing does not tell which).
        const out: Vec3 = [0, 0, 0];
        for (let d = 0; d < 3; d++) out[d] = X[d] + (shift * Nn[d]) / nl;
        return out;
      };
      for (const q of mesh.pts) {
        const p = fit.map(q);
        // The part folded under the host's edge lies a layer deeper than the rest.
        surfacePos.push(...lay(p, fit.under?.(q) ? lift + 2 : lift));
      }
      for (const x of carried) x.laid = x.foot.map((p) => lay(p, lift));
      const tris = new Uint32Array(mesh.tris.length);
      for (let t = 0; t < tris.length; t += 3) {
        const [A, B, C] = [
          mesh.pts[mesh.tris[t]],
          mesh.pts[mesh.tris[t + 1]],
          mesh.pts[mesh.tris[t + 2]],
        ];
        // An end turned under is wound the other way, as a host's turned ply is.
        const turned = placeOf(
          fit.map([(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3]),
        ).turned;
        const flip = (flipH !== fit.flip) !== turned;
        tris[t] = mesh.tris[t];
        tris[t + 1] = flip ? mesh.tris[t + 2] : mesh.tris[t + 1];
        tris[t + 2] = flip ? mesh.tris[t + 1] : mesh.tris[t + 2];
      }
      surfacePanels.push({
        pieceKey: k,
        instance: 0,
        mirrored: H.mirrored,
        group: H.group,
        offset: M,
        count: mesh.pts.length,
        tris,
        uv: Float32Array.from(mesh.pts.flat()),
        boundary: Uint32Array.from(mesh.bVert),
        layers: [],
      });
      layAt.set(k, { at: (q, liftQ) => lay(fit.map(q), liftQ), offset: M, mesh });
      M += mesh.pts.length;
      const side = layerDirection > 0 ? 'over' : 'under';
      const note = owner
        ? `sewn onto ${H.key} (${hk.join}) — ${fit.how}; drawn ${lift} mm ${side} its face, not solved`
        : `sewn onto ${H.key} (order «${hk.join}») — ${fit.how}; drawn ${lift} mm under its face (inside the garment), not solved`;
      surfaceRep.push({
        pieceKey: k,
        host: H.key,
        join: hk.join,
        placed: true,
        note,
        pastEdgePct: Math.round(100 * Math.max(0, 1 - fit.cover)),
      });
      warnings.push(`surface piece ${k}: ${note}`);
    }
  }
  // Rows on laid pieces, measured where the pieces lie — on the host's face, the drawing's layer
  // offset left out: closed when the stretches meet, a contradiction when they stay apart.
  for (const c of laidRows) {
    const id = `${c.a}~${c.b}`;
    const shellWork = works.find(
      (w) => w.id === id && w.laidEnds && !w.hidden && !w.rejectedByPerson,
    );
    const sleeveShell = shellWork?.sleeveCap === true;
    // A row the solve sewed over its drawn parts: its report is this one, over the whole row.
    const sewnPart = seams.findIndex((x) => x.id === id);
    // A sleeve-cap composite that begins or ends on a laid surface piece has two honest readings:
    // the drawable shell stretch is the armhole seam, while the surface stretch is checked where
    // that piece is laid. Keep the shell path for geometry instead of turning the pocket into the
    // armhole; the laid reading is appended to that same owner row below.
    if (sewnPart >= 0 && !sleeveShell) {
      seams.splice(sewnPart, 1);
      const said = contradictions.findIndex((x) =>
        x.startsWith(`${id}: confirmed by a person but it does not close — `),
      );
      if (said >= 0) contradictions.splice(said, 1);
    }
    type Run = { pts: Vec3[]; v: number[]; len: number };
    const runOf = (p: { id: string; piece: string; range?: [number, number] }): Run | null => {
      const L = layAt.get(p.piece);
      if (L) {
        const e = geomOfKey.get(p.piece)?.edges.find((x) => x.id === p.id);
        if (!e || e.pts.length < 2) return null;
        const q = resample(arcCrop(e.pts, p.range), 24);
        const v: number[] = [];
        for (const x of q) {
          let bi = L.mesh.bVert[0];
          let bd = Infinity;
          for (const b of L.mesh.bVert) {
            const d = Math.hypot(L.mesh.pts[b][0] - x[0], L.mesh.pts[b][1] - x[1]);
            if (d < bd) [bi, bd] = [b, d];
          }
          if (v[v.length - 1] !== L.offset + bi) v.push(L.offset + bi);
        }
        let len = 0;
        for (let i = 1; i < q.length; i++)
          len += Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
        return { pts: q.map((x) => L.at(x, 0)), v, len };
      }
      const P0 = pathOf([p.id]);
      if (!P0) return null;
      const P = p.range ? cropPath(P0, p.range) : P0;
      return { pts: [...P.v].map((v) => getPos(v)), v: [...P.v], len: P.len };
    };
    // A ply drawn as a layer of another: its stretch is the drawn ply's.
    const sideA = rowParts(c, 'a').map(leadPart).map(runOf);
    const sideB = rowParts(c, 'b').map(leadPart).map(runOf);
    const inStep = ownerInStepKeys.has(c.provenance?.seamKey ?? '');
    const partsA = rowParts(c, 'a').map((p) => p.id);
    const partsB = rowParts(c, 'b').map((p) => p.id);
    if (sideA.some((r) => !r) || sideB.some((r) => !r)) {
      const words = `${id}: confirmed by a person but its named path cannot be drawn on the current pieces — the row contradicts the pattern`;
      contradictions.push(words);
      seams.push({
        id,
        a: partsA,
        b: partsB,
        kind: c.kind,
        origin: 'graph',
        lenA: c.evidence.aLenMm ?? 0,
        lenB: c.evidence.bLenMm ?? 0,
        residualMeanMm: 0,
        residualMaxMm: 0,
        residualP95Mm: 0,
        stretchPct: 0,
        twisted: false,
        state: 'open',
        decidedBy: 'person',
        inStep,
        note: `CONTRADICTION — ${words}`,
        pathA: new Uint32Array(0),
        pathB: new Uint32Array(0),
      });
      continue;
    }
    const runsA = sideA as Run[];
    const runsB = sideB as Run[];
    // Each point of one side to the nearest point of the other (both ways): no walk order needed,
    // and a strip folded onto one edge (both its edges on it) reads as met.
    const segD = (p: Vec3, a: Vec3, b: Vec3) => {
      const d = sub(b, a);
      const l2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
      const t =
        l2 > 0
          ? Math.max(
              0,
              Math.min(
                1,
                ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / l2,
              ),
            )
          : 0;
      return Math.hypot(a[0] + t * d[0] - p[0], a[1] + t * d[1] - p[1], a[2] + t * d[2] - p[2]);
    };
    const toRuns = (p: Vec3, runs: Run[]) => {
      let best = Infinity;
      for (const r of runs)
        for (let i = 1; i < r.pts.length; i++)
          best = Math.min(best, segD(p, r.pts[i - 1], r.pts[i]));
      return best;
    };
    const gaps = [
      ...runsA.flatMap((r) => r.pts.map((p) => toRuns(p, runsB))),
      ...runsB.flatMap((r) => r.pts.map((p) => toRuns(p, runsA))),
    ].sort((x, y) => x - y);
    const mean = gaps.reduce((x, y) => x + y, 0) / Math.max(1, gaps.length);
    const p95 = gaps[Math.min(gaps.length - 1, Math.floor(0.95 * gaps.length))] ?? 0;
    const max = gaps[gaps.length - 1] ?? 0;
    const lenA = runsA.reduce((x, r) => x + r.len, 0);
    const lenB = runsB.reduce((x, r) => x + r.len, 0);
    const closed = p95 <= 4 && max <= 15;
    const laidHere = [...new Set([...rowParts(c, 'a'), ...rowParts(c, 'b')].map((p) => p.piece))]
      .filter((k) => layAt.has(k))
      .join(', ');
    let note: string;
    if (closed)
      note = `confirmed by a person · closed on the laid ${laidHere} (a surface piece drawn on its panel, not solved) · gap p95 ${p95.toFixed(1)} mm`;
    else {
      const words = `${id}: confirmed by a person but it does not close where ${laidHere} lies on its panel — gap p95 ${p95.toFixed(0)} / max ${max.toFixed(0)} mm, lengths ${lenA.toFixed(0)} vs ${lenB.toFixed(0)} mm: the row contradicts the pattern (or the rows that lay the piece)`;
      contradictions.push(words);
      note = `CONTRADICTION — ${words}`;
    }
    if (sleeveShell && sewnPart >= 0) {
      const shell = seams[sewnPart];
      const unchecked = ` · measured over its stretch on drawn pieces only — its stretch on ${shellWork!.laidEnds!.off.join(', ')} (not drawn) is not checked here`;
      const shellNote = shell.note.endsWith(unchecked)
        ? shell.note.slice(0, -unchecked.length)
        : shell.note;
      shell.note = `${shellNote} · surface stretch on ${laidHere} measured where laid: gap p95 ${p95.toFixed(1)} / max ${max.toFixed(1)} mm${closed ? '' : ' — does not close'}`;
      continue;
    }
    seams.push({
      id,
      a: partsA,
      b: partsB,
      kind: c.kind,
      origin: 'graph',
      lenA,
      lenB,
      residualMeanMm: mean,
      residualMaxMm: max,
      residualP95Mm: p95,
      stretchPct: 0,
      twisted: false,
      state: closed ? 'closed' : 'open',
      decidedBy: 'person',
      inStep,
      note,
      pathA: Uint32Array.from(runsA.flatMap((r) => r.v)),
      pathB: Uint32Array.from(runsB.flatMap((r) => r.v)),
    });
  }
  // Closures by marks, measured now that their surface parts are laid: hole to button, as drawn.
  for (const F of fastened) {
    const { top, under, pairs } = F;
    const tie = ties[F.tieIdx];
    const placedAt = (x: FastenedSide, k: number) => x.laid?.[k] ?? atNow(x.P, x.at[k]);
    const gaps = pairs.map((_, q) => Math.hypot(...tieGap(pos, tie, q)));
    const buttons = pairs.map((m, k) => {
      const a = placedAt(top, k);
      const b = placedAt(under, m);
      return {
        k: k + 1,
        distMm: Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
        gapMm: gaps[k],
      };
    });
    const sorted = [...gaps].sort((x, y) => x - y);
    const gapP95 = sorted[Math.floor(0.95 * (sorted.length - 1))];
    // The two free edges at the tied rows: how far they cross, against what the marks leave.
    const edgeAt = (x: FastenedSide, k: number) => {
      if (!x.free) return null;
      const L = onFootprint(x.P, [
        x.foot[k][0] + x.free.n[0] * x.free.off,
        x.foot[k][1] + x.free.n[1] * x.free.off,
      ]);
      return L ? atNow(x.P, L) : null;
    };
    const crossed = pairs.flatMap((m, k) => {
      const a = edgeAt(top, k);
      const b = edgeAt(under, m);
      return a && b ? [Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])] : [];
    });
    const overlapMm = crossed.length
      ? crossed.reduce((x, y) => x + y, 0) / crossed.length
      : Number.NaN;
    const offTopMm = top.free?.off ?? Number.NaN;
    const offUnderMm = under.free?.off ?? Number.NaN;
    const expect = offTopMm + offUnderMm;
    const C = F.contactIdx >= 0 ? contacts[F.contactIdx] : undefined;
    const outsidePct = C ? closureOutsidePct(C) : Number.NaN;
    const ok =
      gapP95 <= 4 &&
      (Number.isNaN(overlapMm) || Math.abs(overlapMm - expect) <= Math.max(8, 0.35 * expect)) &&
      (Number.isNaN(outsidePct) || outsidePct >= 90);
    closureReps.push({
      id: F.id,
      top: top.part,
      under: under.part,
      offTopMm,
      offUnderMm,
      how: F.how,
      cfGapP95Mm: gapP95,
      overlapMm,
      outsidePct,
      ok,
      buttons,
    });
    const worst = Math.max(...buttons.map((x) => x.distMm));
    warnings.push(
      `${F.id}: ${pieceWord(top.part)} over ${pieceWord(under.part)} · ${pairs.length} fastened, the farthest ${worst.toFixed(1)} mm from its hole · the edges cross ${overlapMm.toFixed(0)} mm (the marks leave ${expect.toFixed(0)}) · ${F.how}`,
    );
  }
  const placedSurface = new Set(surfaceRep.filter((x) => x.placed).map((x) => x.pieceKey));
  const NV = N + surfacePos.length / 3;
  const positions = new Float32Array(3 * NV);
  for (let i = 0; i < 3 * N; i++) positions[i] = Number.isFinite(pos[i]) ? pos[i] : 0;
  for (let i = 0; i < surfacePos.length; i++)
    positions[3 * N + i] = Number.isFinite(surfacePos[i]) ? surfacePos[i] : 0;
  const outPanels: DollReport['panels'] = panels
    .filter((P) => !hiddenFromView[P.offset])
    .map((P) => {
      const tris = new Uint32Array(P.mesh.tris.length);
      const flipP = P.mirrored !== faceFlip.has(P.idx);
      for (let t = 0; t < tris.length; t += 3) {
        tris[t] = P.mesh.tris[t];
        // A part a fold turned over is wound the other way (its face now looks in).
        const flip = flipP !== (P.fold?.triFlip[t / 3] === 1);
        tris[t + 1] = flip ? P.mesh.tris[t + 2] : P.mesh.tris[t + 1];
        tris[t + 2] = flip ? P.mesh.tris[t + 1] : P.mesh.tris[t + 2];
      }
      const uvf = new Float32Array(2 * P.count);
      if (P.fold)
        for (let i = 0; i < P.count; i++) {
          uvf[2 * i] = P.fold.flat[i][0];
          uvf[2 * i + 1] = P.fold.flat[i][1];
        }
      else for (let i = 0; i < 2 * P.count; i++) uvf[i] = uv[2 * P.offset + i];
      return {
        pieceKey: P.key,
        instance: 0 as const,
        mirrored: P.mirrored,
        group: P.group,
        offset: P.offset,
        count: P.count,
        tris,
        uv: uvf,
        boundary: Uint32Array.from(P.mesh.bVert),
        layers: P.layers,
      };
    });
  outPanels.push(...surfacePanels);
  // Pieces that end up in no closed/proposed seam at all are floating too (a bag's strap laid on
  // its panel by a reading of the order is said as a surface row instead).
  const onBag = new Set(bagSurfaceRows.filter((x) => x.placed).map((x) => x.pieceKey));
  for (const P of panels) {
    if (P.group === 'FLOAT' || onBag.has(P.key)) continue;
    const any = seams.some(
      (s) =>
        s.state !== 'open' &&
        s.origin !== 'layer' &&
        [...s.a, ...s.b].some((id) => pk(id) === P.key),
    );
    if (!any)
      floating.push({
        pieceKey: P.key,
        reason: plyWords(P) ?? 'in its group but no seam of it closed or was proposed',
      });
  }
  // Seams stay in the written report, including their measured state and words, but a seam that
  // touches an omitted panel has no drawable path in the garment view.
  for (const seam of seams)
    if ([...seam.pathA, ...seam.pathB].some((v) => hiddenFromView[v])) {
      seam.pathA = new Uint32Array(0);
      seam.pathB = new Uint32Array(0);
    }
  // Collar units: gaps after solving; a fall's outer edge vs the stand top it hangs from, and how
  // much of it stays outside the stand's surface.
  if (opt.debug)
    for (const cp of collarPlans) {
      const ys: number[] = [];
      const rs: number[] = [];
      for (const P of cp.unit)
        for (let i = 0; i < P.count; i++) {
          const q = inFrame(F, getPos(P.offset + i));
          ys.push(q.h);
          rs.push(q.r);
        }
      ys.sort((x, y) => x - y);
      rs.sort((x, y) => x - y);
      const pc = (a: number[], f: number) => a[Math.floor(f * (a.length - 1))]?.toFixed(0);
      warnings.push(
        `debug: unit ${cp.rep.keys.join('+')} (${cp.rep.role}) height above the neck axis p5/p50/p95 ${pc(ys, 0.05)}/${pc(ys, 0.5)}/${pc(ys, 0.95)} · radius ${pc(rs, 0.05)}/${pc(rs, 0.5)}/${pc(rs, 0.95)}`,
      );
    }
  for (const cp of collarPlans) {
    if (cp.fold && cp.outer) {
      const meanY = (vs: number[]) =>
        vs.reduce((t, v) => t + pos[3 * v + 1], 0) / Math.max(1, vs.length);
      cp.rep.outerYMm = meanY(cp.outer);
      cp.rep.baseYMm = meanY(cp.fold.line);
      cp.rep.outsidePct = outsideShare(cp.fold.fall, cp.fold.stand);
    }
    if (opt.debug && cp.work) {
      const w = cp.work;
      const g = rowGaps(pos, w.rows);
      const nA = w.rows.v.length - [...w.rows.v].filter((v) => !w.A.v.includes(v)).length;
      const bins = new Array(10).fill(0);
      const cnt = new Array(10).fill(0);
      for (let q = 0; q < nA; q++) {
        const k = [...w.A.v].indexOf(w.rows.v[q]);
        const b = Math.min(9, Math.floor((10 * w.A.s[k]) / Math.max(1, w.A.len)));
        bins[b] = Math.max(bins[b], g[q]);
        cnt[b]++;
      }
      const len3 = (P: Path) => {
        let t = 0;
        for (let k = 1; k < P.v.length; k++)
          t += Math.hypot(...sub(getPos(P.v[k]), getPos(P.v[k - 1])));
        return t;
      };
      const jumps: string[] = [];
      for (let k = 1; k < w.B.v.length; k++) {
        const d3 = Math.hypot(...sub(getPos(w.B.v[k]), getPos(w.B.v[k - 1])));
        const dr = w.B.s[k] - w.B.s[k - 1];
        if (d3 - dr > 8)
          jumps.push(
            `${panels[panelOf[w.B.v[k - 1]]].key}→${panels[panelOf[w.B.v[k]]].key} rest ${dr.toFixed(0)} 3D ${d3.toFixed(0)}`,
          );
      }
      if (jumps.length) warnings.push(`debug: ${w.id} base jumps: ${jumps.join(' · ')}`);
      warnings.push(
        `debug: ${w.id} gaps along the unit (10 bins, max mm): ${bins.map((x, i) => (cnt[i] ? x.toFixed(0) : '·')).join(' ')} · A rest ${w.A.len.toFixed(0)} 3D ${len3(w.A).toFixed(0)} · B rest ${w.B.len.toFixed(0)} 3D ${len3(w.B).toFixed(0)}`,
      );
    }
    if (cp.standTop && cp.outer && cp.stand && cp.topRange) {
      const meanY = (vs: number[]) =>
        vs.reduce((t, v) => t + pos[3 * v + 1], 0) / Math.max(1, vs.length);
      const Pt = restPath(cctx, cp.standTop);
      const onRange = cp.standTop.filter(
        (_, k) => Pt.s[k] >= cp.topRange![0] - 1 && Pt.s[k] <= cp.topRange![1] + 1,
      );
      cp.rep.outerYMm = meanY(cp.outer);
      cp.rep.baseYMm = meanY(onRange.length ? onRange : cp.standTop);
      const sv: number[] = [];
      for (const P of cp.stand) for (let i = 0; i < P.count; i++) sv.push(P.offset + i);
      // The sewn neck edge lies ON the stand top (within the seam's gap): not counted.
      const sewn = new Set(cp.attach ?? []);
      const fv: number[] = [];
      for (const P of cp.unit)
        for (let i = 0; i < P.count; i++) if (!sewn.has(P.offset + i)) fv.push(P.offset + i);
      cp.rep.outsidePct = outsideShare(fv, sv);
    }
    collarRep.units.push(cp.rep);
  }
  const tris = panels.reduce((t, P) => t + P.mesh.tris.length / 3, 0);
  const ownerWords = owner
    ? (() => {
        const confirmed =
          opt.seams?.selection?.confirmed ??
          opt.seams?.rows.filter((row) => row.status === 'confirmed').length ??
          0;
        const inSteps =
          opt.seams?.selection?.inSteps ??
          opt.seams?.candidates?.filter((candidate) => candidate.inStep && !candidate.guess)
            .length ??
          0;
        const rejected =
          opt.seams?.selection?.rejected ??
          opt.seams?.rows.filter((row) => row.status === 'rejected').length ??
          0;
        const guessed = opt.seams?.selection?.guessed ?? guessStepOf.size;
        // A confirmed row no step names: not sewn, named by its pieces and edges (never by key).
        const nameOfPiece = new Map(
          input.facts.pieces.map((piece) => [piece.pieceKey, piece.name.trim() || piece.pieceKey]),
        );
        const sideWords = (side: readonly { piece: string; edgeHint: string }[]) =>
          side
            .map((anchor) => {
              const at = anchor.edgeHint.lastIndexOf('#');
              const edge = at >= 0 ? anchor.edgeHint.slice(at) : anchor.edgeHint;
              return `${nameOfPiece.get(anchor.piece) ?? anchor.piece} ${edge}`.trim();
            })
            .join(' + ');
        const unbound = (opt.seams?.inStepKeys ? opt.seams.rows : [])
          .filter((row) => row.status === 'confirmed' && !ownerInStepKeys.has(row.seamKey))
          .map(
            (row) =>
              `not sewn, no step names it: ${sideWords(row.sideA)} ↔ ${sideWords(row.sideB)}${row.kind === 'closure' ? ' (closure)' : ''}`,
          );
        return [
          `rows: confirmed ${confirmed} · sewn by steps ${inSteps} · no step ${Math.max(0, confirmed - inSteps)} (not sewn) · rejected ${rejected} (not sewn) · guessed ${guessed} (steps without a row, dashed)`,
          ...unbound,
          ...input.facts.pieces
            .filter((piece) => !ownerSeamPieces?.has(piece.pieceKey))
            .map((piece) => `no seam: ${piece.name.trim() || '(unnamed piece)'}`),
        ];
      })()
    : [];
  // ── folds: the numbers as drawn ──
  if (foldReports.length) {
    const gapOf = (C: FoldContact, q: number): number => {
      const a = C.a[q];
      const b = C.b[q];
      const c = C.c[q];
      const A = getPos(a);
      const n = cross3(sub3(getPos(b), A), sub3(getPos(c), A));
      const nl = Math.hypot(n[0], n[1], n[2]);
      if (!(nl > 1e-9)) return NaN;
      const Q: Vec3 = [0, 0, 0];
      for (let d = 0; d < 3; d++)
        Q[d] = C.w0[q] * pos[3 * a + d] + C.w1[q] * pos[3 * b + d] + C.w2[q] * pos[3 * c + d];
      const Pv = getPos(C.v[q]);
      return (
        (C.sgn[q] * ((Pv[0] - Q[0]) * n[0] + (Pv[1] - Q[1]) * n[1] + (Pv[2] - Q[2]) * n[2])) / nl
      );
    };
    for (const P of panels) {
      const F = P.fold;
      if (!F) continue;
      const T = P.mesh.tris;
      const byEdge = new Map<number, number[]>();
      const key = (a: number, b: number) => (a < b ? a * 1e6 + b : b * 1e6 + a);
      for (let t = 0; t < T.length; t += 3)
        for (let e = 0; e < 3; e++) {
          const k = key(T[t + e], T[t + ((e + 1) % 3)]);
          if (!byEdge.has(k)) byEdge.set(k, []);
          byEdge.get(k)!.push(t);
        }
      const faceN = (t: number): Vec3 => {
        const A = getPos(P.offset + T[t]);
        const n = cross3(
          sub3(getPos(P.offset + T[t + 1]), A),
          sub3(getPos(P.offset + T[t + 2]), A),
        );
        const nl = Math.hypot(n[0], n[1], n[2]) || 1;
        return [n[0] / nl, n[1] / nl, n[2] / nl];
      };
      // Ply gaps at this piece's fold contacts and probes (shared by its folds).
      const gaps: number[] = [];
      for (const C of [...foldContacts, ...foldProbes]) {
        if (C.panel !== P.idx) continue;
        for (let q = 0; q < C.v.length; q++) {
          const g = gapOf(C, q);
          if (Number.isFinite(g)) gaps.push(g);
        }
      }
      gaps.sort((x, y) => x - y);
      const plyGap = gaps.length
        ? {
            min: gaps[0],
            median: gaps[Math.floor(gaps.length / 2)],
            max: gaps[gaps.length - 1],
            pairs: gaps.length,
          }
        : null;
      const through = gaps.filter((g) => g < -0.05).length;
      for (const c of F.creases) {
        const r = c.report;
        const e0 = getPos(P.offset + c.verts[0]);
        const e1 = getPos(P.offset + c.verts[c.verts.length - 1]);
        const dir = sub3(e1, e0);
        const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
        const du: Vec3 = [dir[0] / dl, dir[1] / dl, dir[2] / dl];
        // The crease's kink: each vertex against the chord of its two neighbours. A crease that
        // follows the body's curve stays near 0; a wrinkled or wandering one does not.
        let dev = 0;
        for (let k = 1; k + 1 < c.verts.length; k++) {
          // A crossing is where the other fold turns this crease over: a corner, not a wrinkle.
          if (F.creases.some((o) => o !== c && o.verts.includes(c.verts[k]))) continue;
          const A = getPos(P.offset + c.verts[k - 1]);
          const B = getPos(P.offset + c.verts[k + 1]);
          const q = sub3(getPos(P.offset + c.verts[k]), A);
          const ab = sub3(B, A);
          const al = Math.hypot(ab[0], ab[1], ab[2]) || 1;
          const t = Math.max(0, Math.min(al, (q[0] * ab[0] + q[1] * ab[1] + q[2] * ab[2]) / al));
          dev = Math.max(
            dev,
            Math.hypot(q[0] - (t * ab[0]) / al, q[1] - (t * ab[1]) / al, q[2] - (t * ab[2]) / al),
          );
        }
        r.creaseDevMm = dev;
        let dMin = Infinity;
        let dSum = 0;
        let dN = 0;
        for (let k = 0; k + 1 < c.verts.length; k++) {
          const ts = byEdge.get(key(c.verts[k], c.verts[k + 1])) ?? [];
          if (ts.length !== 2) continue;
          const n0 = faceN(ts[0]);
          const n1 = faceN(ts[1]);
          const cosA = Math.max(-1, Math.min(1, n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]));
          const deg = (Math.acos(cosA) * 180) / Math.PI;
          dMin = Math.min(dMin, deg);
          dSum += deg;
          dN++;
        }
        r.dihedralMinDeg = dN ? dMin : NaN;
        r.dihedralMeanDeg = dN ? dSum / dN : NaN;
        r.plyGapMm = plyGap;
        r.interpenetrating = through;
        // Width across the fold line: as cut (both sides), folded flat, and as drawn in 3D (the
        // farthest vertex from the crease line).
        const L2 = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]) || 1;
        const nx = -(c.b[1] - c.a[1]) / L2;
        const ny = (c.b[0] - c.a[0]) / L2;
        let lo = Infinity;
        let hi = -Infinity;
        let flo = Infinity;
        let fhi = -Infinity;
        let drawn = 0;
        for (let i = 0; i < P.count; i++) {
          const d = (F.flat[i][0] - c.a[0]) * nx + (F.flat[i][1] - c.a[1]) * ny;
          lo = Math.min(lo, d);
          hi = Math.max(hi, d);
          const fd = (P.mesh.pts[i][0] - c.a[0]) * nx + (P.mesh.pts[i][1] - c.a[1]) * ny;
          flo = Math.min(flo, fd);
          fhi = Math.max(fhi, fd);
          const q = sub3(getPos(P.offset + i), e0);
          const along = q[0] * du[0] + q[1] * du[1] + q[2] * du[2];
          drawn = Math.max(
            drawn,
            Math.hypot(q[0] - along * du[0], q[1] - along * du[1], q[2] - along * du[2]),
          );
        }
        r.cutWidthMm = hi - lo;
        r.finishedWidthMm = fhi - flo;
        r.drawnWidthMm = drawn;
      }
    }
  }
  return {
    collar: collarRep,
    panels: outPanels,
    positions,
    seams,
    loops: loopsOut,
    floating,
    skipped: G.skipped
      .filter((x) => !placedSurface.has(x.pieceKey))
      .map((x) => {
        const why = surfaceRep.find((r) => r.pieceKey === x.pieceKey);
        return { pieceKey: x.pieceKey, reason: why ? `${x.reason} · ${why.note}` : x.reason };
      }),
    ...(surfaceRep.length ? { surface: surfaceRep } : {}),
    ...(foldReports.length ? { folds: foldReports } : {}),
    proxies: proxyReport,
    stats: {
      vertices: NV,
      triangles: tris,
      passes,
      ms: now() - t0,
      msMesh,
      msSolve,
      converged,
      nan,
      stretchP99Pct: p99 * 100,
      stretchMaxPct: smax * 100,
    },
    warnings,
    orderJoins,
    orderSurface,
    honesty: HONESTY,
    ...(notSewn.length ? { notSewn } : {}),
    ...(notFastened.length ? { notFastened } : {}),
    ...(notGarment ? { notGarment } : {}),
    ...(allLining ? { liningAsShell: true } : {}),
    ...(l4
      ? {
          contradictions: [...preContradictions, ...contradictions],
          closures: closureReps,
          rows: {
            applied: resolvedRows?.applied.length ?? 0,
            confirmed: (resolvedRows?.forced ?? []).filter((c) => !isGuess(c)).length,
            rejected: excludedPairs.length,
            closures: resolvedRows?.closures.length ?? 0,
            words: [
              ...ownerWords,
              ...(resolvedRows?.stale ?? []).map((x) => x.words),
              ...(resolvedRows?.orphan ?? []).map((x) => x.words),
            ],
          },
        }
      : {}),
  };
}

export type { SeamCandidate, PieceGeom };
