// buildPieceSpecs — piece families (F4 / DXF fast path) → PieceSpec[] the writer (F6) accepts,
// plus the blocked list the wizard shows (08-CONTRACT §4.2 step 6).
//
// Per family, in this order (every step can block the piece with a BlockReason; nothing is
// dropped silently):
//   1. sizes   — source rank → card size through the SizeMap; unmapped ranks are not exported,
//                no mapped rank → 'size-unmapped'; leak/merged/tiny fills block as such;
//   2. name    — override (operator/AI) > DXF block identity > printed text; G11 grammar with the
//                pair exemption; size tokens never in the identity; ungraded → `<ID>_UNI`;
//   3. fold    — a fold line (feature / "on fold" text + a straight hull edge) → unfold FIRST, so
//                the fold edge gets 0 allowance; fold line kept for layer 8;
//   4. lines   — seam meaning: cut = seam + allowance (clipper offset, report → G6); cut meaning:
//                seam = drawn seam, else cut − allowance; any offset failure BLOCKS (hull,
//                self-intersection, topology — Codex C4);
//   5. grain   — detected/declared, else the operator's two clicks, else 'no-grain';
//   6. pairs   — a drawn L/R twin keeps its hand; "cut 2" of an asymmetric piece / "pair" →
//                `_L` drawn + `_R` = its mirror across the grain (G12), ppg per hand;
//   7. growth  — cut area must grow with size (G8) → 'non-monotone' when > 2 sizes.

import { isMirrorSymmetric } from '../ai/geom';
import { parseQuantity, saysFold } from '../ai/evidence';
import { readPieceText } from '../dictionary';
import { identitiesOf, sizeTokenTest } from '../manifest/identity';
import type {
  Affine,
  AllowanceDecision,
  BlockReason,
  BoxMm,
  BuildPieceSpecsFn,
  CardSize,
  Chain,
  ChainId,
  ChainSet,
  DerivedEdge,
  DrillFeature,
  Feature,
  FoldAsk,
  FoldFeature,
  GrainFeature,
  InternalFeature,
  IRText,
  LineClass,
  NotchFeature,
  OffsetReport,
  PairHand,
  PieceCandidate,
  PieceFamily,
  PieceKey,
  PieceSizeSpec,
  PieceSpec,
  Progress,
  PtMm,
  SeedGrainProposal,
  SeedId,
  SemanticsInput,
  Sheet,
  SemanticsOutput,
  SizeRun,
  Unproven,
} from '../types';
import { PATIMPORT } from '../types';
import { type Excursion, stripSpikes } from '../spikes';
import { featuresOf, innerSeamLines, measuredAllowance } from './allowance';
import { classifyFeatures } from './features';
import { drawnProposal, proposeGrain } from './grain-propose';
import {
  FOLD_TEXT_MAX_MM,
  FOLD_TOL_MM,
  type FoldEdge,
  type FoldLine,
  type FoldText,
  type OtherLines,
  foldWordRole,
  foldEdges,
  foldLineOnCut,
  bindFoldListEntry,
  bindListEntry,
  quantityListEntries,
  foldListEntries,
  normFoldLine,
  foldShapeProblem,
  FOLD_LOOSE_TOL_MM,
  looseFoldEdge,
  matchFoldEdge,
  sideOf,
  unfold,
} from './fold';
import {
  IDENTITY,
  SegIndex,
  applyAffine,
  areaOf,
  bboxOf,
  ccw,
  closestOnPolyline,
  compose,
  dist,
  reflection,
} from './geom';
import { identityCheck, isTitleLabel, readName } from './names';
import { cleanTracedOutline, offsetContour } from './offset';
import { PAIR_WORDS, mirrorSizeAcrossGrain, planPair } from './pairs';

type DxfExtra = {
  dxf?: {
    identity?: string;
    outerIsSeam?: boolean;
    features?: Feature[];
    instances?: number;
    /** The block's own QUANTITY label (AAMA/CLO), if it carries one. */
    quantity?: number | null;
  };
};
type Blocked = SemanticsOutput['blocked'][number];

/** How a written size relates to its source candidate, for the walls the gate compares (G3/G4). */
type WallMap = {
  seed: SeedId;
  rank: number;
  fold: FoldLine | null;
  /** The fold's on-line tolerance (E4 loose match: 3 mm), for clipping the fold edge's walls. */
  foldTol?: number;
  t: Affine;
};

export type SemanticsDetail = {
  output: SemanticsOutput;
  /**
   * Source walls per written identity × rank, in the identity's own (source) frame: unfolded
   * pieces get the mirrored half, a derived `_R` the mirrored walls, the fold edge is dropped.
   * The write stage passes this as `wallsOf` to `writeAndGate` (G3/G4).
   */
  wallsOf: (identity: string, rank: number) => PtMm[][] | undefined;
  /**
   * The outline's derived edges (F4b bridges, operator bridges, band cuts) in the same frame — never
   * walls (F14b, Codex C1): the write stage passes this as `derivedOf` to `writeAndGate` (G15).
   */
  derivedOf: (identity: string, rank: number) => DerivedEdge[] | undefined;
  /** Per piece: the offset reports and measured numbers the probe and the wizard show. */
  notes: Record<PieceKey, string[]>;
};

/** A1: per-size grains closer than this agree, degrees. */
const GRAIN_AGREE_DEG = 2;
/** Smallest angle between two line directions, degrees, 0..90. */
const lineAngleDiff = (a: number, b: number) => {
  const d = (((a - b) % 180) + 180) % 180;
  return Math.min(d, 180 - d);
};

/** Two segments are the same line (either direction, ends within 2 mm). */
const sameLine = (g: { a: PtMm; b: PtMm }, h: { a: PtMm; b: PtMm }) => {
  const d = (p: PtMm, q: PtMm) => Math.hypot(p.x - q.x, p.y - q.y);
  return (d(g.a, h.a) <= 2 && d(g.b, h.b) <= 2) || (d(g.a, h.b) <= 2 && d(g.b, h.a) <= 2);
};

const blockOffset = (r: OffsetReport): BlockReason =>
  r.loops !== 1 ? 'offset-topology' : r.selfIntersects ? 'offset-self-intersection' : 'offset-hull';

function textsOf(c: PieceCandidate, byId: Map<number, IRText>): string[] {
  const out: string[] = [];
  for (const id of c.textsInside) {
    const t = byId.get(id);
    if (t && !out.includes(t.text)) out.push(t.text);
  }
  return out;
}

/**
 * D3: which texts inside the candidate are its title label (`isTitleLabel`), by text. Lazy: only a
 * piece named from its printed text pays for it (a DXF block or an override never asks).
 */
function titleTest(c: PieceCandidate, byId: Map<number, IRText>): (text: string) => boolean {
  let titles: Set<string> | null = null;
  return (text) => {
    if (!titles) {
      const inside = c.textsInside.flatMap((id) => byId.get(id) ?? []);
      titles = new Set(inside.filter((t) => isTitleLabel(t, inside, c.bbox)).map((t) => t.text));
    }
    return titles.has(text);
  };
}

/** Points of the fold edge removed from a wall polyline (they are interior once unfolded). */
function clipFold(line: PtMm[], fold: FoldLine, tol = FOLD_TOL_MM): PtMm[][] {
  const out: PtMm[][] = [];
  let cur: PtMm[] = [];
  for (let i = 0; i < line.length; i++) {
    const p = line[i];
    const onP = Math.abs(sideOf(fold, p)) <= tol;
    const prev = line[i - 1];
    const onPrev = prev ? Math.abs(sideOf(fold, prev)) <= tol : false;
    if (onP && onPrev) {
      if (cur.length > 1) out.push(cur);
      cur = [p];
      continue;
    }
    cur.push(p);
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/**
 * The chains (closed ones closed) that carry a derived edge (F14e, Codex R1): each chain `may`
 * accept, kept only when it runs along THIS edge in one contiguous stretch within `snapMm` of at
 * least `derivedAlongMinShare` of the edge's length (sampled every 0.25 mm). A chain that merely
 * touches, crosses, or follows the edge for part of its length carries nothing. Exported for the
 * F6 probe (Codex R1 controls); the gate re-checks the same continuity per edge (G15).
 */
export function supportOf(
  edge: PtMm[],
  chains: readonly (Chain | undefined)[],
  may: (ch: Chain) => boolean,
): PtMm[][] {
  const snap = PATIMPORT.snapMm;
  const s: PtMm[] = [];
  const arc: number[] = [];
  let len = 0;
  for (let i = 1; i < edge.length; i++) {
    const a = edge[i - 1];
    const b = edge[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    const k = Math.max(1, Math.ceil(l / 0.25));
    for (let j = i === 1 ? 0 : 1; j <= k; j++) {
      s.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k });
      arc.push(len + (l * j) / k);
    }
    len += l;
  }
  if (!(len > 0)) return [];
  const eb = bboxOf(edge);
  const out: PtMm[][] = [];
  for (const ch of chains) {
    if (!ch || ch.pts.length < 2 || !may(ch)) continue;
    const cb = bboxOf(ch.pts);
    if (
      cb.minX > eb.maxX + snap ||
      cb.maxX < eb.minX - snap ||
      cb.minY > eb.maxY + snap ||
      cb.maxY < eb.minY - snap
    )
      continue;
    let best = 0;
    let from = -1;
    for (let i = 0; i < s.length; i++) {
      if (closestOnPolyline(s[i], ch.pts, ch.closed).d <= snap) {
        if (from < 0) from = i;
        best = Math.max(best, arc[i] - arc[from]);
      } else from = -1;
    }
    if (best >= PATIMPORT.derivedAlongMinShare * len)
      out.push(ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts);
  }
  return out;
}

/**
 * The drawn chains that carry a derived BAND CUT of source rank `rank` (F14e, Codex R1 + S1): only
 * the cut's own provenance — the ladder rung(s) it was carried from (`derived[].chains`), never a
 * line found by searching the sheet — and of those only a chain that may be a cut line of that
 * rank (the rank's own size class or a common line; never a grain, notch, internal, seam, ignored
 * or unclassified one, nor another size's), where it runs along THIS edge continuously
 * (`supportOf`). No provenance → nothing carries it. Bridges carry nothing: an
 * automatic or operator bridge is a chord the pipeline drew, bounded by its length alone (G15).
 */
export function bandCutSupport(
  set: ChainSet,
  run: SizeRun,
): (edge: PtMm[], rank: number, provenance: readonly ChainId[] | undefined) => PtMm[][] {
  const clsOf = new Map<ChainId, LineClass>();
  for (const c of set.classes) for (const id of c.chains) clsOf.set(id, c);
  return (edge, rank, provenance) => {
    // S1 (Codex round 3): never a global search — only the rung(s) this cut was carried from
    // (`derived[].chains`, set by pieces/walls bandTicks), so another piece's same-rank line
    // running beside the edge carries nothing
    if (!provenance?.length) return [];
    const own = run.sizes[rank]?.classId ?? null;
    const mine = provenance
      .map((id) => set.chains[id])
      .filter((ch): ch is Chain => !!ch && provenance.includes(ch.id));
    return supportOf(edge, mine, (ch) => {
      const k = clsOf.get(ch.id);
      return !!k && (k.role === 'common' || (k.role === 'size' && own != null && k.id === own));
    });
  };
}

/** Fold words in or beside a family's outlines (E1a). `inside` = within its largest outline. */
function foldWordsOf(fam: PieceFamily, sheet: Sheet): { t: FoldText; inside: boolean }[] {
  const big = fam.candidates.reduce((a, c) => (c.areaMm2 > a.areaMm2 ? c : a), fam.candidates[0]);
  if (!big) return [];
  const insideIds = new Set(fam.candidates.flatMap((c) => c.textsInside));
  const bb = big.bbox;
  const R = FOLD_TEXT_MAX_MM;
  const out: { t: FoldText; inside: boolean }[] = [];
  for (const t of sheet.texts) {
    if (!saysFold(t.text)) continue;
    const at = { x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 };
    const inside = insideIds.has(t.id);
    if (!inside) {
      if (at.x < bb.minX - R || at.x > bb.maxX + R || at.y < bb.minY - R || at.y > bb.maxY + R)
        continue;
      if (closestOnPolyline(at, big.outer, true).d > R) continue;
    }
    out.push({
      t: { text: t.text.trim(), at, dirDeg: t.rotationDeg, sizeMm: t.fontSizeMm },
      inside,
    });
  }
  return out;
}

/**
 * The drawn chains near a family that are not one of its own walls (any size): another piece's
 * line, an internal, grain or symbol line — what a fold word may be labelling instead of an edge.
 */
function otherLinesNear(fam: PieceFamily, set: ChainSet): OtherLines {
  const own = new Set(fam.candidates.flatMap((c) => c.walls));
  const bb = bboxOf(
    fam.candidates.flatMap((c) => [
      { x: c.bbox.minX, y: c.bbox.minY },
      { x: c.bbox.maxX, y: c.bbox.maxY },
    ]),
  );
  const R = FOLD_TEXT_MAX_MM * 2;
  const lines = set.chains
    .filter((ch): ch is Chain => !!ch && !own.has(ch.id) && ch.pts.length >= 2)
    .map((ch) => ({ ch, b: bboxOf(ch.pts) }))
    .filter(
      ({ b }) =>
        !(
          b.minX > bb.maxX + R ||
          b.maxX < bb.minX - R ||
          b.minY > bb.maxY + R ||
          b.maxY < bb.minY - R
        ),
    );
  const idx = new SegIndex(
    lines.map((l) => l.ch),
    10,
  );
  return {
    nearer: (p, d, edge) => {
      const f = idx.nearestFoot(p, Math.max(0, d - 1));
      if (!f.q) return false;
      // a line drawn ON the edge (a fold line over the cut line) is the edge itself
      const L = Math.hypot(edge.b.x - edge.a.x, edge.b.y - edge.a.y);
      const t =
        ((f.q.x - edge.a.x) * (edge.b.x - edge.a.x) + (f.q.y - edge.a.y) * (edge.b.y - edge.a.y)) /
        L;
      return !(Math.abs(sideOf(edge, f.q)) <= 1 && t >= -1 && t <= L + 1);
    },
    nearest: (p, maxD) => {
      let best: { pts: PtMm[]; closed: boolean; d: number; dirDeg: number } | null = null;
      for (const { ch, b } of lines) {
        if (
          b.minX > p.x + maxD ||
          b.maxX < p.x - maxD ||
          b.minY > p.y + maxD ||
          b.maxY < p.y - maxD
        )
          continue;
        const f = closestOnPolyline(p, ch.pts, ch.closed);
        if (f.d > maxD || (best && f.d >= best.d)) continue;
        const a = ch.pts[f.seg];
        const q = ch.pts[(f.seg + 1) % ch.pts.length];
        best = {
          pts: ch.pts,
          closed: ch.closed,
          d: f.d,
          dirDeg: (Math.atan2(q.y - a.y, q.x - a.x) * 180) / Math.PI,
        };
      }
      return best;
    },
  };
}

/**
 * The question shown for a piece (on its largest exported size): its straight edges, and as the
 * suggestion the one that unfolds cleanly — along the grainline first (a CB / CF fold is cut on
 * the lengthwise grain: "нить основы, середина, сгиб"), then nearest to a fold word, then longest.
 */
function foldAskOf(
  seed: SeedId,
  c: PieceCandidate,
  words: { t: FoldText; inside: boolean }[],
  evidence: string[],
  why: string,
  grain: { a: PtMm; b: PtMm } | null,
): FoldAsk {
  const outer = ccw(c.outer);
  const edges = foldEdges(outer);
  const deg = (a: PtMm, b: PtMm) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const offGrain = (e: FoldEdge) => {
    if (!grain) return 0;
    const x = (((deg(e.a, e.b) - deg(grain.a, grain.b)) % 180) + 180) % 180;
    return Math.min(x, 180 - x) <= 5 ? 0 : 1;
  };
  let suggested: number | null = null;
  let best: [number, number, number] | null = null;
  edges.forEach((e, i) => {
    if (!tryUnfold(outer, e, e.lenMm).u) return;
    const d = words.length
      ? Math.min(...words.map((w) => closestOnPolyline(w.t.at, [e.a, e.b], false).d))
      : 0;
    const key: [number, number, number] = [offGrain(e), d, i];
    if (
      !best ||
      key[0] < best[0] ||
      (key[0] === best[0] && (key[1] < best[1] || (key[1] === best[1] && key[2] < best[2])))
    ) {
      best = key;
      suggested = i;
    }
  });
  return {
    seed,
    rank: c.rank,
    evidence,
    edges: edges.map((e) => ({ a: e.a, b: e.b, lenMm: e.lenMm })),
    suggested,
    why,
  };
}

/**
 * E4: the straight edge that could make this outline the half of a fold piece — the longest edge
 * ≥ 30 % of the perimeter whose unfold passes `foldShapeProblem`. Null when there is none.
 */
function foldAlternative(outline: readonly PtMm[]): FoldEdge | null {
  const outer = ccw([...outline]);
  const per = outer.reduce((s, p, i) => s + dist(p, outer[(i + 1) % outer.length]), 0);
  for (const e of foldEdges(outer)) {
    if (e.lenMm < 0.3 * per) break;
    if (tryUnfold(outer, e, e.lenMm).u) return e;
  }
  return null;
}

/** Unfold `outer` across `fold`, or say why that does not give a believable whole piece. */
function tryUnfold(
  outer: PtMm[],
  fold: FoldLine,
  edgeLen: number | null,
  tol?: number,
): { u: NonNullable<ReturnType<typeof unfold>>; problem: null } | { u: null; problem: string } {
  const u = unfold(outer, fold, tol);
  if (!u) return { u: null, problem: 'the fold line is not an edge of the outline' };
  const run = Math.hypot(u.edge[1].x - u.edge[0].x, u.edge[1].y - u.edge[0].y);
  if (edgeLen != null && run < 0.8 * edgeLen)
    return {
      u: null,
      problem: `the outline follows only ${run.toFixed(0)} of the ${edgeLen.toFixed(0)} mm edge`,
    };
  const problem = foldShapeProblem(u.pts, u.edge, outer);
  return problem ? { u: null, problem } : { u, problem: null };
}

/**
 * The excursions `stripSpikes` took off a candidate outline that are SLIT NOTCHES (Codex, r5a): the
 * drawing itself goes in and out there — every 0.25 mm of the removed stretch lies (≥ 90 %) within
 * `snapMm` of one of this candidate's own wall chains whose class is a cut line of its rank (its
 * size class, or a common line; never internal, grain, notch, seam or ignored) — and it is at least
 * `PATIMPORT.notchMinMm` deep (a corner overshoot of 0.57 mm is not a notch). Those come back as
 * notches at the point they leave the ring; the rest (a fill that wandered up a bundle of internal
 * lines, a micro overshoot) are only dropped.
 */
export function slitNotches(
  excursions: readonly Excursion[],
  cand: PieceCandidate,
  set: ChainSet,
  run: SizeRun,
): { notches: NotchFeature[]; dropped: Excursion[] } {
  const clsOf = new Map<ChainId, LineClass>();
  for (const k of set.classes) for (const id of k.chains) clsOf.set(id, k);
  const own = run.sizes[cand.rank]?.classId ?? null;
  const multi = run.sizes.length > 1;
  const cutLines = cand.walls
    .map((id) => set.chains[id])
    .filter((ch): ch is Chain => {
      if (!ch || ch.pts.length < 2) return false;
      const k = clsOf.get(ch.id);
      if (!k) return !multi;
      if (k.role === 'common') return true;
      if (k.role === 'size') return !multi || (own != null && k.id === own);
      return false;
    });
  const notches: NotchFeature[] = [];
  const dropped: Excursion[] = [];
  for (const e of excursions) {
    let on = 0;
    let all = 0;
    for (let i = 1; i < e.path.length; i++) {
      const a = e.path[i - 1];
      const b = e.path[i];
      const k = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.25));
      for (let j = i === 1 ? 0 : 1; j <= k; j++) {
        const q = { x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k };
        all++;
        if (cutLines.some((ch) => closestOnPolyline(q, ch.pts, ch.closed).d <= PATIMPORT.snapMm))
          on++;
      }
    }
    const drawn = all > 0 && on / all >= 0.9;
    if (drawn && e.depthMm >= PATIMPORT.notchMinMm)
      notches.push({
        kind: 'notch',
        origin: 'detected',
        ranges: [],
        confidence: 1,
        at: e.base,
        seg: [e.base, e.tip],
        depthMm: e.depthMm,
      });
    else dropped.push(e);
  }
  return { notches, dropped };
}

export function buildPieceSpecsDetailed(
  input: SemanticsInput,
  progress?: Progress,
): SemanticsDetail {
  const { sheet, set, run, sizeMap, families, fileAllowance, pieceOverrides, operatorGrain } =
    input;
  const traced = !!input.traced;
  const operatorFold = input.operatorFold ?? {};
  const foldHints = new Set(input.foldHints ?? []);
  const foldAsks: FoldAsk[] = [];
  /** A1: per seed blocked 'no-grain', what the drawing or the outline proposes (D3: a click). */
  const grainProposals: SeedGrainProposal[] = [];
  const warnings: string[] = [];
  const blocked: Blocked[] = [];
  /** D3: what the drawing does not prove, per seed — see `Unproven`. */
  const unproven: Unproven[] = [];
  const notes: Record<PieceKey, string[]> = {};
  const textById = new Map(sheet.texts.map((t) => [t.id, t]));

  // ── sizes ───────────────────────────────────────────────────────────────────────────────
  const cardOfRank = new Map<number, CardSize | null>();
  for (const e of sizeMap.entries) cardOfRank.set(e.source.rank, e.card);
  const cardTokens = [
    ...sizeMap.entries.flatMap((e) => (e.card ? [e.card.token] : [])),
    ...sizeMap.unmapped.map((c) => c.token),
  ];
  const isSizeToken = sizeTokenTest(cardTokens);
  const multiSize = run.sizes.length > 1;

  // ── pass 1: names + candidates per family ───────────────────────────────────────────────
  type Prep = {
    fam: PieceFamily;
    seed: SeedId;
    cands: { c: PieceCandidate & DxfExtra; card: CardSize }[];
    texts: string[];
    name: NonNullable<ReturnType<typeof readName>>;
    ungraded: boolean;
  };
  const preps: Prep[] = [];
  const block = (seed: SeedId, reason: BlockReason, detail: string) => {
    blocked.push({ seed, reason, detail });
  };

  for (const fam of families) {
    const seed = fam.seed;
    const ov = pieceOverrides[seed] ?? {};
    const sorted = [...fam.candidates].sort((a, b) => a.rank - b.rank) as (PieceCandidate &
      DxfExtra)[];
    const mapped = sorted.flatMap((c) => {
      const card = cardOfRank.get(c.rank);
      return card ? [{ c, card }] : [];
    });
    if (!mapped.length) {
      block(
        seed,
        'size-unmapped',
        `none of the ${sorted.length} size(s) of this piece is mapped to a card size`,
      );
      continue;
    }
    const bad = mapped.find((m) => m.c.outcome !== 'closed');
    if (bad) {
      // H1: a refused size names its own reason (sizes not told apart / count / ambiguous)
      const r: BlockReason =
        bad.c.outcome === 'refused'
          ? bad.c.gradeRefusal ?? 'sizes-not-distinguished'
          : (bad.c.outcome as BlockReason);
      block(
        seed,
        r,
        bad.c.outcome === 'refused'
          ? `size ${bad.card.token}: ${bad.c.gradeDetail ?? 'its outline could not be told apart from the other sizes'}`
          : r === 'leak'
            ? `outline of size ${bad.card.token} is not closed${bad.c.leakAt ? ` near (${bad.c.leakAt.x.toFixed(0)}, ${bad.c.leakAt.y.toFixed(0)}) mm` : ''}`
            : r === 'merged'
              ? 'two seeds share one region — split them'
              : `area ${(bad.c.areaMm2 / 100).toFixed(1)} cm² is below ${PATIMPORT.minPieceAreaMm2 / 100} cm²`,
      );
      continue;
    }
    const texts = textsOf(sorted[sorted.length - 1], textById);
    const name = readName({
      override: ov,
      dxfIdentity: sorted[0].dxf?.identity ?? null,
      texts,
      isSizeToken,
      isTitle: titleTest(sorted[sorted.length - 1], textById),
    });
    if (!name) {
      block(
        seed,
        'grammar',
        'no name: neither the operator, the AI, the DXF block nor the printed text gives a code',
      );
      continue;
    }
    // ungraded: declared UNI, one contour in a multi-size run, or the same contour in every size
    let ungraded = name.uni || (multiSize && sorted.length === 1);
    if (!ungraded && mapped.length >= 2) {
      const a0 = mapped[0].c.areaMm2;
      const b0 = mapped[0].c.bbox;
      ungraded = mapped.every(
        (m) =>
          Math.abs(m.c.areaMm2 - a0) <= a0 * 5e-4 &&
          Math.abs(m.c.bbox.maxX - m.c.bbox.minX - (b0.maxX - b0.minX)) <= 0.1 &&
          Math.abs(m.c.bbox.maxY - m.c.bbox.minY - (b0.maxY - b0.minY)) <= 0.1,
      );
      if (ungraded) name.notes.push('same outline in every size: ungraded');
    }
    preps.push({ fam, seed, cands: ungraded ? [mapped[0]] : mapped, texts, name, ungraded });
  }

  // drawn twins (FP_L next to FP_R): same code + mods, opposite hands, mirror-equal areas
  const twinOf = new Map<SeedId, SeedId>();
  for (const a of preps) {
    if (!a.name.hand || twinOf.has(a.seed)) continue;
    const b = preps.find(
      (x) =>
        x !== a &&
        !twinOf.has(x.seed) &&
        x.name.hand &&
        x.name.hand !== a.name.hand &&
        x.name.code === a.name.code &&
        x.name.mods.join('_') === a.name.mods.join('_'),
    );
    if (!b) continue;
    const ca = a.cands[0].c;
    const cb = b.cands.find((m) => m.c.rank === ca.rank)?.c ?? b.cands[0].c;
    const ok =
      Math.abs(ca.areaMm2 - cb.areaMm2) <= Math.max(ca.areaMm2, cb.areaMm2) * PATIMPORT.pairAreaTol;
    if (ok) {
      twinOf.set(a.seed, b.seed);
      twinOf.set(b.seed, a.seed);
    } else {
      warnings.push(
        `${a.name.code}_${a.name.hand} / _${b.name.hand}: named as a pair but the areas differ ${((Math.abs(ca.areaMm2 - cb.areaMm2) / Math.max(ca.areaMm2, cb.areaMm2)) * 100).toFixed(2)} % — not paired`,
      );
    }
  }

  // ── the cutting list's fold pieces (S5): each entry bound to ONE piece by its printed number or
  // title — never counted against the unfolds of other pieces. A bound entry is that piece's fold
  // evidence (asked unless unfolded); an unbound one stays a file-level question.
  // R5: a fold line no piece took as its own evidence (edge, internal line, label) and the list
  // grammar cannot read is never dropped: it becomes an unbound file-level entry
  const consumedFold = new Set(
    families.flatMap((f) => foldWordsOf(f, sheet).map((w) => normFoldLine(w.t.text))),
  );
  const listEntries = foldListEntries(input.docTexts ?? [], consumedFold);
  const listBound: { entry: string; seed: SeedId }[] = [];
  const listUnbound: string[] = [];
  // N3: the cutting list's printed counts ("69. Ærme, 4 gange"), bound to their pieces the same way
  const qtyEntries = quantityListEntries(input.docTexts ?? []);
  const listQty = new Map<SeedId, { qty: number; entry: string; by: 'no' | 'name' }>();
  if (listEntries.length || qtyEntries.length) {
    // every piece on the sheet, including one blocked before naming (no code yet): its label is
    // still on the sheet, and a list entry it names must not fall back to the file level
    const pieceLabels = families.map((f) => {
      const c = f.candidates.reduce((a, x) => (x.rank > a.rank ? x : a), f.candidates[0]);
      const isTitle = titleTest(c, textById);
      return {
        seed: f.seed,
        labels: [
          ...(input.seedLabels?.[f.seed] ? [input.seedLabels[f.seed]!] : []),
          ...textsOf(c, textById).filter(isTitle),
        ],
      };
    });
    for (const e of listEntries) {
      const seed = bindFoldListEntry(e, pieceLabels);
      if (seed != null) listBound.push({ entry: e.text, seed });
      else listUnbound.push(e.text);
    }
    // two entries landing on one piece (a number and another line's name) prove nothing: dropped
    const twice = new Set<SeedId>();
    for (const e of qtyEntries) {
      const b = bindListEntry(e, pieceLabels);
      if (!b) continue;
      const was = listQty.get(b.seed);
      if (was && was.qty !== e.qty) twice.add(b.seed);
      else if (!was || (was.by === 'name' && b.by === 'no'))
        listQty.set(b.seed, { qty: e.qty, entry: e.text, by: b.by });
    }
    for (const sd of twice) listQty.delete(sd);
  }
  // N3 (r4454 «7 - Карман - 2 дет.»): pieces whose number is drawn as curves (no text label) are
  // named by the operator or the AI. An entry no label took is bound by its name read as a code
  // (Карман → PCK) to the ONLY piece of that code — a weak link: the count is the answer shown,
  // still asked. Two entries reading the same code with different counts bind nothing.
  if (qtyEntries.length) {
    const byNo = new Set([...listQty.values()].filter((q) => q.by === 'no').map((q) => q.entry));
    const keyed = new Map<string, { e: (typeof qtyEntries)[number]; side: string | null }[]>();
    for (const e of qtyEntries) {
      if (byNo.has(e.text)) continue;
      const r = readPieceText(e.words.join(' '));
      if (!r.code) continue;
      const k = `${r.code}|${r.side ?? ''}`;
      keyed.set(k, [...(keyed.get(k) ?? []), { e, side: r.side }]);
    }
    for (const [k, es] of keyed) {
      if (new Set(es.map((x) => x.e.qty)).size !== 1) continue;
      const [code, side] = k.split('|');
      let fit = preps.filter((p) => p.name.code === code && !listQty.has(p.seed));
      if (fit.length > 1 && side) fit = fit.filter((p) => p.name.mods.includes(side));
      if (fit.length !== 1) continue;
      listQty.set(fit[0].seed, { qty: es[0].e.qty, entry: es[0].e.text, by: 'name' });
    }
  }

  // ── pass 2: geometry per family ─────────────────────────────────────────────────────────
  const pieces: PieceSpec[] = [];
  const walls = new Map<string, WallMap[]>(); // identity → per rank
  let done = 0;
  for (const p of preps) {
    progress?.(done++, preps.length, p.name.code);
    const { seed, name } = p;
    const ov = pieceOverrides[seed] ?? {};
    const pieceNotes: string[] = [...name.notes];
    const largest = p.cands[p.cands.length - 1].c;
    const symmetric = isMirrorSymmetric(largest.outer);

    // allowance decision for this piece
    const measured = !ov.allowance ? measuredAllowance(largest, set) : null;
    const dxfSeamOuter = !!largest.dxf?.outerIsSeam;
    let A: AllowanceDecision = ov.allowance ?? fileAllowance;
    if (!ov.allowance && dxfSeamOuter && A.meaning !== 'seam')
      A = {
        ...A,
        meaning: 'seam',
        evidence: [...A.evidence, 'the drawn outline is the graded seam line (DXF layer 14)'],
      };
    if (!ov.allowance && measured && !dxfSeamOuter) {
      A = {
        meaning: 'both',
        allowanceMm: Math.round(measured.mm * 10) / 10,
        origin: 'measured',
        evidence: [
          `seam line drawn ${measured.mm.toFixed(1)} mm inside (spread ${measured.spreadMm.toFixed(2)} mm)`,
        ],
      };
    }
    let allowMm = A.allowanceMm > 0 ? A.allowanceMm : PATIMPORT.defaultAllowanceMm;
    if (!(A.allowanceMm > 0))
      pieceNotes.push(`no allowance known: the other line is ${allowMm} mm (default)`);
    // D3: the sheet's word (text), two drawn lines (measured), the operator, or a DXF layer 14
    // outline (a seam line by the format; decision 7 gives its amount). Else the run asks.
    const allowanceProven = A.origin !== 'default' || dxfSeamOuter;

    // ── fold (E1a, D3): a fold word unfolds the piece only when it is bound to a straight edge of
    // THIS outline and the result is a believable whole; otherwise the operator is asked.
    const wantFold = ov.unfoldedFold ?? null;
    const opFold = wantFold === false ? null : operatorFold[seed] ?? null;
    const foldWords = wantFold === false ? [] : foldWordsOf(p.fam, sheet);
    let refEdge: FoldLine | null = opFold;
    // the box of the outline the operator's pick lies on (the fold question's size): only a PICK
    // is carried to the other sizes by place (file per size) or loosely (a wandering edge) — a fold
    // word's edge must match strictly, else the piece is asked
    const refBox: BoxMm | null = opFold ? largest.bbox : null;
    let refWhy: string | null = opFold ? 'picked by you' : null;
    const internalWords = new Set<string>();
    if (!refEdge && foldWords.length) {
      const lines = otherLinesNear(p.fam, set);
      for (const { c } of [...p.cands].reverse()) {
        const edges = foldEdges(c.outer);
        let best: { edge: FoldEdge; d: number; text: string; how: string } | null = null;
        for (const w of foldWords) {
          const r = foldWordRole(w.t, edges, c.outer, lines);
          if (r.kind === 'internal') internalWords.add(w.t.text);
          else if (r.kind === 'edge' && (!best || r.d < best.d))
            best = { edge: r.edge, d: r.d, text: w.t.text, how: r.how };
        }
        if (best) {
          refEdge = best.edge;
          refWhy = `«${best.text}» ${best.how === 'symbol' ? 'on a line along' : `${best.d.toFixed(0)} mm from`} a ${best.edge.lenMm.toFixed(0)} mm straight edge`;
          break;
        }
      }
    }
    if (internalWords.size)
      pieceNotes.push(
        `${[...internalWords].map((w) => `«${w}»`).join(', ')}: a fold line across the piece — kept as an internal line`,
      );
    const foldEvidence = [
      ...listBound.filter((l) => l.seed === seed).map((l) => `cutting list: ${l.entry}`),
      ...new Set(
        foldWords.filter((w) => w.inside && !internalWords.has(w.t.text)).map((w) => w.t.text),
      ),
      ...(foldHints.has(seed) ? ['AI: cut on fold'] : []),
    ];
    // fold words inside the piece, the AI's reading of the drawing, or the operator's "unfold"
    // without an edge: nothing proves which edge — ask
    const askFold =
      wantFold !== false && !refEdge && (foldEvidence.length > 0 || wantFold === true);
    let askWhy: string | null = null;

    // quantity / pair
    const qtyText = p.texts.map(parseQuantity).find((q) => q != null) ?? null;
    const saysPair = p.texts.some((t) => PAIR_WORDS.test(t) && parseQuantity(t) != null);

    const sizes: PieceSizeSpec[] = [];
    const wallMaps: WallMap[] = [];
    let blockedHere: { reason: BlockReason; detail: string } | null = null;
    let anyFold = false;
    let lastGrain: GrainFeature | null = null;
    const opGrain = operatorGrain[seed];
    // A1: the family's box (the ungraded-line test looks for the size copies inside it)
    const famBox = bboxOf(
      p.cands.flatMap(({ c }) => [
        { x: c.bbox.minX, y: c.bbox.minY },
        { x: c.bbox.maxX, y: c.bbox.maxY },
      ]),
    );
    const featOpts = { sizeCount: run.sizes.length, region: famBox };

    for (const { c, card } of p.cands) {
      const feats = classifyFeatures(c, set, sheet, featOpts);
      // A1: a drawn line with ONE evidence is a proposal, never this size's grain by itself
      const found = feats.find((f): f is GrainFeature => f.kind === 'grain') ?? null;
      const proposedLine = found?.origin === 'proposed' ? found : null;
      let outer = ccw(c.outer);
      // Every candidate outline (F4 fill, operator refill, DXF fast path) passes here before fold
      // and offset: a stretch that runs out and back along itself — a corner overshot and retraced
      // (reef HB_4XL, 0.57 mm), the fill wandering up a bundle of lines and back (kombinezon, 12
      // mm) — is a zero-width needle on the cutting line; it goes now (spikes.ts). A traced (scan)
      // outline is made simple below instead (its union drops such spurs, and more).
      // A stretch the DRAWING itself runs in and out along (its legs on this piece's own cut-line
      // chains, ≥ notchMinMm deep) is a slit notch drawn into the cut line: it leaves the ring and
      // comes back as a notch at that point (layer 4), never silently lost (Codex, r5a).
      if (!traced) {
        const st = stripSpikes(outer);
        if (st.spikes) {
          outer = st.ring;
          const sl = slitNotches(st.excursions, c, set, run);
          feats.push(...sl.notches);
          pieceNotes.push(
            `${card.token}: ${st.spikes} zero-width spike(s) removed from the outline${sl.notches.length ? ` — ${sl.notches.length} drawn slit(s) kept as notch(es)` : ''}${sl.dropped.length ? ` — ${sl.dropped.length} not drawn by the cut line (${sl.dropped.map((e) => `${e.depthMm.toFixed(1)} mm at ${e.base.x.toFixed(0)}, ${e.base.y.toFixed(0)}`).join('; ')}) dropped` : ''}`,
          );
          if (sl.dropped.some((e) => e.depthMm >= PATIMPORT.notchMinMm))
            warnings.push(
              `${card.token}: a ${Math.max(...sl.dropped.map((e) => e.depthMm)).toFixed(1)} mm needle on the outline that the cut line does not draw was removed`,
            );
        }
      }
      // A traced (scan) outline zig-zags between twin traces and runs out and back along ticks: a
      // simple polygon first, or no offset of it is a parallel curve (offset.ts, E3).
      if (traced) {
        const t = cleanTracedOutline(outer);
        outer = t.pts;
        const r = t.report;
        pieceNotes.push(
          r.cleaned
            ? `${card.token}: traced outline cleaned (${r.vertices[0]} → ${r.vertices[1]} vertices${r.selfIntersected ? ', crossed itself' : ''}; moved ≤ ${r.movedMm.toFixed(2)} mm, spurs to ${r.removedMm.toFixed(1)} mm removed)`
            : `${card.token}: traced outline kept as traced — ${r.reason}`,
        );
      }
      // ── fold
      let fold: FoldLine | null = null;
      let foldFeat: FoldFeature | null = null;
      let edgeLen: number | null = null;
      let foldTol: number | undefined;
      if (wantFold !== false) {
        foldFeat = (feats.find((f) => f.kind === 'fold') as FoldFeature | undefined) ?? null;
        if (foldFeat) fold = { a: foldFeat.a, b: foldFeat.b };
        else if (refEdge) {
          let e = matchFoldEdge(foldEdges(outer), refEdge, refBox, c.bbox);
          // E4: no clean straight edge in this size (a notch bump, a drift): the loose match
          if (!e && refBox) {
            e = looseFoldEdge(outer, refEdge, refBox, c.bbox);
            if (e) foldTol = FOLD_LOOSE_TOL_MM;
          }
          if (!e) {
            if (opFold) {
              blockedHere = {
                reason: 'fold-unresolved',
                detail: `${card.token}: no straight edge of this size matches the fold edge you picked`,
              };
              break;
            }
            askWhy = `${card.token}: ${refWhy}, but this size has no such edge`;
            blockedHere = { reason: 'fold-question', detail: askWhy };
            break;
          }
          fold = e;
          edgeLen = e.lenMm;
        } else if (askFold) {
          askWhy = foldEvidence.length
            ? `«${foldEvidence[0]}» on the piece, but no edge is marked as the fold`
            : 'unfold: pick the fold edge';
          blockedHere = { reason: 'fold-question', detail: askWhy };
          break;
        }
      }
      let foldEdge: [PtMm, PtMm] | null = null;
      const seamFeat = featuresOf(c).find((f) => f.kind === 'seam') as
        | Extract<Feature, { kind: 'seam' }>
        | undefined;
      let drawnSeam: PtMm[] | null = dxfSeamOuter ? null : seamFeat ? ccw(seamFeat.pts) : null;
      if (!drawnSeam && !dxfSeamOuter && measured) {
        const lines = innerSeamLines(c, set).filter((l) => l.length >= 3);
        // a single closed inner loop is used as drawn; dashes are re-derived by offset
        const loop = lines.find(
          (l) =>
            l.length > 8 && Math.hypot(l[0].x - l[l.length - 1].x, l[0].y - l[l.length - 1].y) < 1,
        );
        if (loop) drawnSeam = ccw(loop);
      }
      if (traced && drawnSeam) drawnSeam = cleanTracedOutline(drawnSeam).pts;
      let notches = feats.filter((f): f is NotchFeature => f.kind === 'notch');
      let drills = feats.filter((f): f is DrillFeature => f.kind === 'drill');
      let internal = feats.filter((f): f is InternalFeature => f.kind === 'internal');
      // A1: a proposed line the operator did not take as the grain stays an internal line
      if (proposedLine && opGrain && !sameLine(proposedLine, opGrain))
        internal.push({
          kind: 'internal',
          pts: [proposedLine.a, proposedLine.b],
          closed: false,
          origin: 'detected',
          ranges: proposedLine.ranges,
          confidence: 0.5,
        });
      if (fold) {
        const half = outer;
        const t = tryUnfold(half, fold, edgeLen, foldTol);
        if (!t.u) {
          if (foldFeat || opFold) {
            blockedHere = {
              reason: 'fold-unresolved',
              detail: `${card.token}: cannot unfold — ${t.problem}`,
            };
            break;
          }
          // a fold word bound to an edge, but the unfold is not a believable piece: ask
          askWhy = `${card.token}: ${refWhy}, but unfolding there fails — ${t.problem}`;
          blockedHere = { reason: 'fold-question', detail: askWhy };
          break;
        } else {
          const u = t.u;
          if (c === p.cands[p.cands.length - 1].c)
            pieceNotes.push(`unfolded: ${foldFeat ? 'fold line in the source' : refWhy}`);
          outer = u.pts;
          foldEdge = u.edge;
          anyFold = true;
          if (drawnSeam) {
            const us = unfold(drawnSeam, fold, foldTol);
            drawnSeam = us ? us.pts : null;
            if (!us)
              pieceNotes.push('seam line has no fold edge — re-derived from the unfolded cut');
          }
          const M = reflection(fold.a, fold.b);
          const onFold = (q: PtMm) => Math.abs(sideOf(fold!, q)) <= (foldTol ?? FOLD_TOL_MM);
          notches = [
            ...notches,
            ...notches
              .filter((n) => !onFold(n.at))
              .map((n) => ({
                ...n,
                at: applyAffine(M, n.at),
                seg: [applyAffine(M, n.seg[0]), applyAffine(M, n.seg[1])] as [PtMm, PtMm],
                origin: 'derived' as const,
              })),
          ];
          drills = [
            ...drills,
            ...drills
              .filter((d) => !onFold(d.at))
              .map((d) => ({ ...d, at: applyAffine(M, d.at), origin: 'derived' as const })),
          ];
          internal = [
            ...internal,
            ...internal
              .filter((f) => !f.pts.every(onFold))
              .map((f) => ({
                ...f,
                pts: f.pts.map((q) => applyAffine(M, q)),
                origin: 'derived' as const,
              })),
          ];
        }
      }

      // ── lines
      const meaning = dxfSeamOuter || A.meaning === 'seam' ? 'seam' : 'cut';
      let cut: PtMm[];
      let seam: PtMm[] | null;
      let offset: OffsetReport | null = null;
      if (meaning === 'seam') {
        seam = outer;
        const r = offsetContour(seam, allowMm);
        cut = r.pts;
        offset = r.report;
        pieceNotes.push(
          `${card.token}: cut = seam + ${allowMm} mm, deviation ${r.report.maxDeviationMm.toFixed(3)} mm, hull ${r.report.hullRatio.toFixed(4)} (source ${r.sourceHullRatio.toFixed(4)})`,
        );
        if (!r.report.ok) {
          blockedHere = {
            reason: blockOffset(r.report),
            detail: `${card.token}: ${r.report.reason}`,
          };
          break;
        }
      } else {
        cut = outer;
        if (drawnSeam) seam = drawnSeam;
        else {
          const r = offsetContour(cut, -allowMm);
          seam = r.pts;
          offset = r.report;
          pieceNotes.push(
            `${card.token}: seam = cut − ${allowMm} mm, deviation ${r.report.maxDeviationMm.toFixed(3)} mm`,
          );
          if (!r.report.ok) {
            blockedHere = {
              reason: blockOffset(r.report),
              detail: `${card.token}: ${r.report.reason}`,
            };
            break;
          }
        }
      }

      // ── notches must sit on the cut line (or the drawn line it was measured on)
      const lineIdx = new SegIndex(
        [{ pts: cut, closed: true }, ...(seam ? [{ pts: seam, closed: true }] : [])],
        5,
      );
      const kept = notches.filter((n) => lineIdx.nearest(n.at, 2) <= 1.5);
      if (kept.length !== notches.length)
        pieceNotes.push(
          `${card.token}: ${notches.length - kept.length} notch(es) on the fold edge dropped (interior once unfolded)`,
        );
      // dedupe notches that coincide (mirrored copies of a notch at the fold end)
      const notchesOut: NotchFeature[] = [];
      for (const n of kept)
        if (!notchesOut.some((m) => Math.hypot(m.at.x - n.at.x, m.at.y - n.at.y) < 0.5))
          notchesOut.push(n);

      // ── grain
      // the operator's two clicks win over a found grain (the details step shows theirs, and a
      // found grain the gate refuses — G18, lettering — has no other way out)
      let grain: GrainFeature | null = null;
      if (opGrain)
        grain = {
          kind: 'grain',
          a: opGrain.a,
          b: opGrain.b,
          angleDeg:
            (Math.atan2(opGrain.b.y - opGrain.a.y, opGrain.b.x - opGrain.a.x) * 180) / Math.PI,
          origin: 'operator',
          ranges: [],
          confidence: 1,
          // A1: an accepted proposal is the operator's word, with what it was proposed on
          evidence: opGrain.accepted
            ? [...new Set(['operator' as const, 'accepted' as const, ...opGrain.accepted])]
            : ['operator'],
        };
      grain ??= found && !proposedLine ? found : null;
      const borrowed = lastGrain as GrainFeature | null;
      if (!grain && borrowed)
        grain = {
          ...borrowed,
          origin: 'derived',
          confidence: borrowed.confidence * 0.9,
          evidence: [...new Set([...(borrowed.evidence ?? []), 'borrowed' as const])],
        };
      if (!grain) {
        const pr = proposedLine
          ? drawnProposal(proposedLine)
          : proposeGrain(outer, { fold: foldEdge });
        if (pr) grainProposals.push({ seed, ...pr });
        blockedHere = {
          reason: 'no-grain',
          detail: pr
            ? `${card.token}: grainline proposed (${pr.why}) — accept it or click two points`
            : `${card.token}: no grainline found — click two points on the piece`,
        };
        break;
      }
      lastGrain = grain;

      const fold2 = foldEdge
        ? ({
            kind: 'fold',
            a: foldLineOnCut(foldEdge, cut)[0],
            b: foldLineOnCut(foldEdge, cut)[1],
            label: foldFeat?.label ?? 'fold (unfolded)',
            origin: foldFeat ? foldFeat.origin : 'derived',
            ranges: foldFeat?.ranges ?? [],
            confidence: foldFeat ? foldFeat.confidence : 0.6,
          } satisfies FoldFeature)
        : null;
      sizes.push({
        // SOURCE rank (SizeRun.sizes[rank]): the write stage looks walls up by candidate rank
        rank: c.rank,
        sizeToken: card.token,
        sizeId: card.sizeId,
        cut,
        seam,
        grain,
        notches: notchesOut,
        drills,
        internal,
        fold: fold2,
        offset,
        walls: c.walls,
        bbox: bboxOf(cut),
        areaMm2: areaOf(cut),
      });
      wallMaps.push({
        seed,
        rank: c.rank,
        fold: fold && foldEdge ? fold : null,
        ...(fold && foldEdge && foldTol ? { foldTol } : {}),
        t: IDENTITY,
      });
    }
    // A1: grains found per size, each on its own evidence, must agree (±2°) — S vertical and M
    // horizontal from a placement line would export a piece whose sizes lie crosswise in the
    // marker. Disagreement demotes them all: the majority's strongest is proposed, else none.
    if (!blockedHere && !opGrain) {
      const found = sizes.filter((s) => s.grain?.origin === 'detected');
      const agree = (x: PieceSizeSpec, y: PieceSizeSpec) =>
        lineAngleDiff(x.grain!.angleDeg, y.grain!.angleDeg) <= GRAIN_AGREE_DEG;
      if (found.some((s) => !agree(s, found[0]))) {
        let group: PieceSizeSpec[] = [];
        for (const s of found) {
          const g = found.filter((o) => agree(o, s));
          if (g.length > group.length) group = g;
        }
        const top =
          group.length * 2 > found.length
            ? [...group].sort(
                (x, y) => (y.grain!.evidence?.length ?? 0) - (x.grain!.evidence?.length ?? 0),
              )[0].grain!
            : null;
        if (top)
          grainProposals.push({
            seed,
            a: top.a,
            b: top.b,
            why: 'most sizes agree',
            evidence: [...(top.evidence ?? [])],
          });
        blockedHere = {
          reason: 'no-grain',
          detail: `grainlines found per size disagree (${found.map((s) => `${s.sizeToken} ${s.grain!.angleDeg.toFixed(0)}°`).join(', ')})${top ? ' — the majority is proposed' : ''}`,
        };
      }
    }
    if (blockedHere) {
      block(seed, blockedHere.reason, blockedHere.detail);
      if (blockedHere.reason === 'fold-question')
        foldAsks.push(
          foldAskOf(
            seed,
            largest,
            foldWords,
            foldEvidence,
            askWhy ?? blockedHere.detail,
            opGrain ??
              (classifyFeatures(largest, set, sheet).find((f) => f.kind === 'grain') as
                | GrainFeature
                | undefined) ??
              null,
          ),
        );
      continue;
    }
    // operator grain given after a size already borrowed nothing: fine. Monotone growth (G8).
    if (!p.ungraded && sizes.length > 1) {
      const grows = sizes.every((s, i) => i === 0 || s.areaMm2 > sizes[i - 1].areaMm2);
      if (!grows) {
        if (sizes.length > 2) {
          block(
            seed,
            'non-monotone',
            `cut area does not grow with size (${sizes.map((s) => `${s.sizeToken} ${(s.areaMm2 / 100).toFixed(1)}`).join(', ')} cm²)`,
          );
          continue;
        }
        warnings.push(`${name.code}: area does not grow between its two sizes`);
      }
    }
    // ── pair / quantity
    const twin = twinOf.get(seed);
    const twinPrep = twin != null ? preps.find((x) => x.seed === twin) : undefined;
    // F14 R5: a block inserted n times (identical copies, collapsed by the DXF reader) is cut n
    // times per WRITTEN identity — what our writer emits for × per garment n and what the card
    // counts. That count is the drawing's own statement, so it is not re-read as a pair.
    const drawnCopies = Math.max(1, ...p.cands.map(({ c }) => c.dxf?.instances ?? 1));
    // D3: a count the sheet proves — printed "cut n" / "pair", else the DXF block's QUANTITY label
    // (a CAD file draws every cut piece, so an unlabelled block is cut once), else an AI name
    // auto-accepted on printed "cut n" evidence. Nothing → the shape suggests, the operator says.
    const isDxf = !!largest.dxf;
    // N3 (robe 69 "4 gange"): the cutting list's count of THIS piece. Bound by its printed number
    // it is a printed count like "cut n" on the piece; bound by name only, or disagreeing with the
    // piece's own text, it is the answer shown — still asked (D3)
    const lq = !isDxf ? listQty.get(seed) : undefined;
    const listConflict = lq != null && qtyText != null && qtyText !== lq.qty;
    const listAsk = lq != null && (lq.by === 'name' || listConflict);
    const aiQ = qtyText == null && !saysPair && !lq ? input.aiQuantity?.[seed] : undefined;
    const qty =
      qtyText ?? lq?.qty ?? (isDxf ? largest.dxf?.quantity ?? 1 : null) ?? aiQ?.qty ?? null;
    const pp =
      drawnCopies >= 2
        ? {
            pair: false,
            perIdentity: drawnCopies,
            why: `block inserted ${drawnCopies} times — cut ${drawnCopies}`,
            proven: true,
          }
        : planPair({
            qty,
            saysPair: saysPair || !!aiQ?.pair,
            symmetric,
            onFold: anyFold,
            namedHand: !!name.hand,
          });
    if (lq && !listAsk && qtyText == null) pp.why = `cutting list «${lq.entry}»: ${pp.why}`;
    if (listConflict)
      pp.why = `the piece says ×${qtyText}, the cutting list «${lq!.entry}» ×${lq!.qty}: which?`;
    else if (lq && listAsk)
      pp.why = `${pp.why} — the cutting list «${lq.entry}» names it by title only`;
    if (listAsk) pp.proven = false;
    pieceNotes.push(`quantity: ${pp.why}`);
    // pairHand override: undefined = no answer, null = "not a pair", L/R = the DRAWN hand of a pair
    let hand: PairHand | null = name.hand;
    let mode: 'single' | 'drawn' | 'derived';
    if (ov.pairHand === null) mode = 'single';
    else if (ov.pairHand) {
      hand = ov.pairHand;
      mode = twinPrep ? 'drawn' : 'derived';
    } else if (name.hand) mode = twinPrep ? 'drawn' : 'single';
    else if (pp.pair) {
      hand = 'L';
      mode = 'derived';
    } else mode = 'single';
    const ppg = ov.piecesPerGarment ?? pp.perIdentity;
    const unprovenHere: Unproven[] = [];
    if (!allowanceProven)
      unprovenHere.push({
        seed,
        kind: 'allowance',
        shown: `${A.meaning}+${allowMm}`,
        detail: A.evidence.some((e) => /only for some pieces/.test(e))
          ? `${A.evidence.find((e) => /only for some pieces/.test(e))}: is the outline the cut or the seam line?`
          : 'no allowance text and no second drawn line: is the outline the cut or the seam line?',
      });
    // E4: the operator's "cut on fold" (an unfold they asked for) answers the count too — one
    // whole piece per garment unless the sheet prints otherwise
    const qtyProven =
      pp.proven ||
      mode === 'drawn' ||
      ov.pairHand !== undefined ||
      ov.piecesPerGarment != null ||
      (ov.unfoldedFold === true && anyFold);
    // E4 (redcafe спинка): a pair suggested only because the outline is not symmetric, while one
    // long straight edge (≥ 30 % of the perimeter) would unfold it into a believable whole — the
    // same outline may be the half of a piece cut on fold. Offered as the alternative, never applied.
    const foldAlt =
      !qtyProven && mode === 'derived' && !anyFold && wantFold !== false && !saysPair
        ? foldAlternative(largest.outer)
        : null;
    if (!qtyProven)
      unprovenHere.push({
        seed,
        kind: 'quantity',
        shown: mode === 'derived' ? `pair×${ppg}` : `×${ppg}`,
        detail: foldAlt
          ? `${pp.why} · or cut on fold along its ${foldAlt.lenMm.toFixed(0)} mm straight edge?`
          : pp.why,
        ...(foldAlt ? { foldAlt: true } : {}),
      });
    if (name.fromNote)
      unprovenHere.push({
        seed,
        kind: 'name',
        shown: [name.code, ...name.mods].join('_'),
        detail: `read from the note «${name.fromNote}», not a title label`,
      });

    const base = {
      code: name.code,
      displayName: name.displayName,
      nameOrigin: name.nameOrigin,
      ...(name.aiConfidence != null ? { aiConfidence: name.aiConfidence } : {}),
      seed,
      variant: null,
      unfoldedFold: anyFold,
      // per WRITTEN identity: both hands of a pair count for one hand each (contract §3)
      piecesPerGarment: ppg,
      allowance: { ...A, allowanceMm: allowMm },
      // fabrics/ (F7) assigns the fabric purposes; semantics does not guess them
      fabrics: [] as string[],
      fused: ov.fused ?? false,
      ungraded: p.ungraded,
    };
    const out: PieceSpec[] = [];
    if (mode === 'derived') {
      const [L, R] = identitiesOf(name.code, name.mods, 'L');
      const drawn = hand === 'R' ? R : L;
      const other = hand === 'R' ? L : R;
      const mirrored: PieceSizeSpec[] = [];
      for (const s of sizes) {
        const m = mirrorSizeAcrossGrain(s);
        if (m) mirrored.push(m.size);
      }
      if (mirrored.length !== sizes.length) {
        block(seed, 'no-grain', 'no grain to mirror the other hand across');
        continue;
      }
      out.push({
        ...base,
        identity: drawn.identity,
        mods: drawn.mods,
        pairHand: drawn.pairHand,
        pairOf: drawn.pairOf,
        sizes,
      });
      out.push({
        ...base,
        identity: other.identity,
        mods: other.mods,
        pairHand: other.pairHand,
        pairOf: other.pairOf,
        sizes: mirrored,
      });
      walls.set(drawn.identity, wallMaps);
      walls.set(
        other.identity,
        wallMaps.map((w, i) => ({
          ...w,
          t: compose(reflection(sizes[i].grain!.a, sizes[i].grain!.b), w.t),
        })),
      );
    } else if (mode === 'drawn' && hand) {
      const [L, R] = identitiesOf(name.code, name.mods, 'L');
      const me = hand === 'L' ? L : R;
      out.push({
        ...base,
        identity: me.identity,
        mods: me.mods,
        pairHand: me.pairHand,
        pairOf: me.pairOf,
        sizes,
      });
      walls.set(me.identity, wallMaps);
    } else {
      if (name.hand && ov.pairHand === undefined)
        pieceNotes.push(
          `hand ${name.hand} in the name but no ${name.hand === 'L' ? 'R' : 'L'} twin on the sheet`,
        );
      const mods = [...(hand ? [hand] : []), ...name.mods];
      const [one] = identitiesOf(name.code, mods, null);
      out.push({
        ...base,
        identity: one.identity,
        mods: one.mods,
        pairHand: null,
        pairOf: null,
        sizes,
      });
      walls.set(one.identity, wallMaps);
    }
    // grammar (G11) with the pair exemption; size tokens never in the identity
    let gram: string | null = null;
    for (const s of out) {
      const why = identityCheck(
        s.identity,
        s.nameOrigin,
        { hand: s.pairHand, of: s.pairOf },
        isSizeToken,
      );
      if (why) gram = `${s.identity}: ${why}`;
    }
    if (gram) {
      block(seed, 'grammar', gram);
      for (const s of out) walls.delete(s.identity);
      continue;
    }
    for (const s of out) {
      notes[s.identity] = pieceNotes;
      pieces.push(s);
    }
    unproven.push(...unprovenHere);
  }
  progress?.(preps.length, preps.length);

  // ── unique identities (the card's alias index is case-insensitive) ─────────────────────
  const seen = new Map<string, SeedId>();
  const unique: PieceSpec[] = [];
  const dupSeeds = new Set<SeedId>();
  for (const s of pieces) {
    const k = s.identity.toLowerCase();
    const prev = seen.get(k);
    if (prev != null && prev !== s.seed) {
      dupSeeds.add(s.seed);
      block(
        s.seed,
        'duplicate-identity',
        `${s.identity} is already the name of another piece — rename one`,
      );
      continue;
    }
    seen.set(k, s.seed);
  }
  for (const s of pieces) if (!dupSeeds.has(s.seed)) unique.push(s);
  // a drawn hand whose twin was blocked must not be written alone (G12: sibling not in the file)
  for (let changed = true; changed; ) {
    changed = false;
    const ids = new Set(unique.map((s) => s.identity));
    for (let i = unique.length - 1; i >= 0; i--) {
      const s = unique[i];
      if (!s.pairOf || ids.has(s.pairOf)) continue;
      const why = blocked.find((b) => b.seed === twinOf.get(s.seed));
      block(
        s.seed,
        why?.reason ?? 'grammar',
        `its other hand ${s.pairOf} is blocked${why ? `: ${why.detail}` : ''}`,
      );
      unique.splice(i, 1);
      changed = true;
    }
  }

  // ── walls for the gate ──────────────────────────────────────────────────────────────────
  const famBySeed = new Map(families.map((f) => [f.seed, f]));
  /** The source candidate behind a written identity × rank and the map into its frame. */
  const sourceOf = (identity: string, rank: number) => {
    const maps = walls.get(identity);
    if (!maps) return undefined;
    const spec = unique.find((s) => s.identity === identity);
    if (!spec) return undefined;
    const w = maps.find((m) => m.rank === rank) ?? (spec.ungraded ? maps[0] : undefined);
    if (!w) return undefined;
    const cand = famBySeed.get(w.seed)?.candidates.find((c) => c.rank === w.rank);
    return cand ? { w, cand } : undefined;
  };
  /** Source-frame lines → the identity's frame: the fold edge dropped and mirrored, then `t`. */
  const toFrame = (w: WallMap, lines: PtMm[][]): PtMm[][] => {
    if (w.fold) {
      const M = reflection(w.fold.a, w.fold.b);
      const clipped = lines.flatMap((l) => clipFold(l, w.fold!, w.foldTol));
      lines = [...clipped, ...clipped.map((l) => l.map((q) => applyAffine(M, q)))];
    }
    return lines.map((l) => l.map((q) => applyAffine(w.t, q)));
  };
  const wallsOf = (identity: string, rank: number): PtMm[][] | undefined => {
    const src = sourceOf(identity, rank);
    if (!src) return undefined;
    // a closed chain's polyline does not repeat its first vertex: close it, or the gate's walls
    // (open polylines) miss the closing edge
    const lines = src.cand.walls
      .map((id) => set.chains[id])
      .filter((ch) => !!ch && ch.pts.length > 1)
      .map((ch) => (ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts));
    // Source chains ONLY (F14b, Codex C1): the outline's derived stretches (an auto or operator
    // bridge, a band cut) are never walls — measured against them, G3/G4 certified edges the
    // pipeline itself drew. They go to the gate separately (`derivedOf` → G15).
    if (!lines.length) return undefined;
    return toFrame(src.w, lines);
  };
  const alongOf = bandCutSupport(set, run);
  const derivedOf = (identity: string, rank: number): DerivedEdge[] | undefined => {
    const src = sourceOf(identity, rank);
    if (!src) return undefined;
    const out: DerivedEdge[] = [];
    for (const d of src.cand.derived ?? []) {
      if (d.kind === 'shared-rank' || d.pts.length < 2) continue;
      // per edge, never pooled: each edge carries only the chains that run along it
      const along =
        d.kind === 'band-cut' ? toFrame(src.w, alongOf(d.pts, src.cand.rank, d.chains)) : [];
      for (const pts of toFrame(src.w, [d.pts]))
        if (pts.length > 1) out.push({ kind: d.kind, pts, ...(along.length ? { along } : {}) });
    }
    return out.length ? out : undefined;
  };

  // a blocked piece is not exported: its open questions wait until it is
  const written = new Set(unique.map((s) => s.seed));
  // unbound cutting-list entries: a file-level question until the operator has seen them named
  const checked = input.foldListChecked;
  const listSeen = (e: string) =>
    checked === true || (Array.isArray(checked) && checked.includes(e));
  const unfoldedSeeds = new Set(unique.filter((s) => s.unfoldedFold).map((s) => s.seed)).size;
  const foldList = listUnbound.some((e) => !listSeen(e))
    ? { entries: listUnbound, unfolded: unfoldedSeeds, bound: listBound }
    : undefined;
  return {
    output: {
      pieces: unique,
      blocked,
      warnings,
      unproven: unproven.filter((u) => written.has(u.seed)),
      ...(foldAsks.length ? { folds: foldAsks } : {}),
      ...(foldList ? { foldList } : {}),
      ...(grainProposals.length
        ? {
            grainProposals: grainProposals.filter((g) =>
              blocked.some((b) => b.seed === g.seed && b.reason === 'no-grain'),
            ),
          }
        : {}),
    },
    wallsOf,
    derivedOf,
    notes,
  };
}

export const buildPieceSpecs: BuildPieceSpecsFn = (input, progress) =>
  buildPieceSpecsDetailed(input, progress).output;

/** Closest point helper re-exported for the probe (notch-on-cut checks). */
export { closestOnPolyline };
