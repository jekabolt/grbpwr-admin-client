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
import { chainView, partAt, sheetView } from '../assemble/composite';
import { parseQuantity, saysFold } from '../ai/evidence';
import { readPieceText } from '../dictionary';
import { identitiesOf, sizeTokenTest } from '../manifest/identity';
import type {
  Affine,
  AllowanceDecision,
  BlockReason,
  BlockedName,
  BoxMm,
  BuildPieceSpecsFn,
  CardSize,
  Chain,
  ChainId,
  ContinuityGeometry,
  ContinuityRecord,
  ChainSet,
  DerivedEdge,
  DrillFeature,
  Feature,
  FoldAsk,
  FoldFeature,
  FoldHalfOffer,
  FoldMiss,
  GrainFeature,
  IdentityGeometry,
  InternalFeature,
  IRText,
  LineClass,
  NotchFeature,
  OffsetReport,
  PairHand,
  GradeEvidence,
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
  GradeAsk,
  GradeCountFeature,
  KinkRecord,
  ShapeFixRecord,
} from '../types';
import { PATIMPORT, shapeFixKey } from '../types';
import {
  describePen,
  type Pen,
  onePieceProblems,
  onPen,
  penLines,
  rankLooks,
  sharedEdges,
} from '../pieces/identity';
import { wallModel } from '../pieces/walls';
import { hausdorffMm } from '../pieces/fill';
import { silentRead, type SilentRead } from '../pieces/gfit/silent-inputs';
import { silentOff } from '../pieces/gfit/silent';
import { type Excursion, stripSpikes } from '../spikes';
import { featuresOf, innerSeamLines, measuredAllowance } from './allowance';
import { readNotchMarks, type MarkRead } from '../pieces/notch-marks';
import { classifyFeatures } from './features';
import { gradeP1Off, gradeShape } from './grade-shape';
import {
  chordAcross,
  notchBumpSeries,
  type NotchBump,
  type NotchChord,
} from '../pieces/gfit/notch-bumps';
import { facingFolds, type FoldChord } from './facing';
import { oneSizeRead } from './one-size';
import { drawnProposal, proposeGrain } from './grain-propose';
import { fitGrainInside, grainOutsideMm, vetProposal } from './grain-inside';
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
  FOLD_MATCH_ANGLE_DEG,
  type FoldBracket,
  bindFoldText,
  bracketEdges,
  foldBracket,
  halfFoldLine,
  halfFoldReason,
  looseFoldEdge,
  matchFoldEdge,
  saysCutOnFold,
  sideOf,
  straightRuns,
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
import {
  cleanTracedOutline,
  familyCornerKinds,
  offsetAcrossFold,
  offsetContour,
  snapOntoFold,
} from './offset';
import { repairMinorityKinks, kinkRepairOff, ownLineOn, type KinkDone } from './kink-repair';
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
  /** P1 (G21): the continuity stretches of a size closed through them, and their chains. */
  continuityOf: (identity: string, rank: number) => ContinuityGeometry | undefined;
  /**
   * MOOD Ф0 (G22): on an identity-encoded run, the lines of the rank's own pen near the piece and
   * the common edges its outline may run on, in the identity's frame. undefined = no identity run.
   */
  identityOf: (identity: string, rank: number) => IdentityGeometry | undefined;
  /** MOOD Ф0 (G24): why this identity × rank's outline may hold two pieces (else undefined). */
  onePieceOf: (identity: string, rank: number) => string | undefined;
  /**
   * SILENT (G26 / G8): the grade model's verdict on this identity × rank (a neighbour line holds,
   * other disagreements warn) and whether the size draws its own line beside its outline.
   */
  gradeOf: (identity: string, rank: number) => GradeEvidence | undefined;
  /**
   * GRADE P1: the notches drawn AS the outline (a graded bump / dip) this identity × rank's line
   * crosses by its chord, with the drawn bump — G3/G4 do not hold the chord against the bump's
   * walls (same frame as `wallsOf`). undefined = none.
   */
  notchChordsOf: (identity: string, rank: number) => NotchChord[] | undefined;
  /** Per piece: the offset reports and measured numbers the probe and the wizard show. */
  notes: Record<PieceKey, string[]>;
};

/** A1: per-size grains closer than this agree, degrees. */
const GRAIN_AGREE_DEG = 2;
/** A size borrows the family's grain only if the drawn line lies within this of its outline, mm
 *  (palto «23»: the arrow ends 0.3–1.9 mm outside 72–84). */
const FAMILY_GRAIN_MM = 2;
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

/**
 * CODE lane: the source's own words for a piece whose name is refused — the DXF block name as the
 * file spells it when the name came from the block, else the name read (a printed title, the
 * operator's or the AI's display name).
 */
function sourceNameOf(
  name: { displayName: string; nameOrigin: PieceSpec['nameOrigin']; notes: string[] },
  c: (PieceCandidate & DxfExtra) | undefined,
): string | null {
  const dxf = c?.dxf?.identity?.trim();
  const fromBlock = name.notes.some((n) => n.startsWith('name from the DXF block'));
  return (fromBlock && dxf ? dxf : name.displayName.trim()) || null;
}

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
    within: (p, r) =>
      lines
        .filter(
          ({ ch, b }) =>
            !(b.minX > p.x + r || b.maxX < p.x - r || b.minY > p.y + r || b.maxY < p.y - r) &&
            closestOnPolyline(p, ch.pts, ch.closed).d <= r,
        )
        .map(({ ch }) => ({ pts: ch.pts, closed: ch.closed })),
  };
}

/**
 * L13: the straight edge(s) of one size's outline the sheet points at for a half on fold — the
 * runs a fold bracket aims at (`bracketEdges`), else the runs a «cut on fold» text lies along
 * (`bindFoldText`, over every straight run: no convex-hull filter). Null when nothing points.
 */
function halfPointerOf(
  outer: readonly PtMm[],
  brackets: readonly FoldBracket[],
  words: readonly FoldText[],
  lines: OtherLines,
): { edges: FoldEdge[]; how: 'bracket' | 'text'; by: string[] } | null {
  const runs = straightRuns(outer);
  const uniq = (es: FoldEdge[]) =>
    es.filter((e, i) => es.findIndex((x) => x.a === e.a && x.b === e.b) === i);
  const fromBr = brackets
    .map((br) => ({ br, es: bracketEdges(br, outer, runs) }))
    .filter((x) => x.es.length);
  if (fromBr.length)
    return {
      edges: uniq(fromBr.flatMap((x) => x.es)),
      how: 'bracket',
      by: [...new Set(fromBr.map((x) => x.br.text))],
    };
  const fromText = words
    .map((t) => ({ t, e: bindFoldText(t, runs, lines.nearer)?.edge ?? null }))
    .filter((x): x is { t: FoldText; e: FoldEdge } => !!x.e);
  if (fromText.length)
    return {
      edges: uniq(fromText.map((x) => x.e)),
      how: 'text',
      by: [...new Set(fromText.map((x) => x.t.text))],
    };
  return null;
}

const lineDeg = (a: PtMm, b: PtMm) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
/** Smallest angle between two undirected lines, degrees. */
const lineAngleOf = (e: FoldLine, f: FoldLine) => {
  const x = (((lineDeg(e.a, e.b) - lineDeg(f.a, f.b)) % 180) + 180) % 180;
  return Math.min(x, 180 - x);
};

/**
 * L13 (owner decision 19.10 a): the «export the half with a fold line» offer of a fold question,
 * or null. Offered when the sheet prints «cut on fold» for the piece (`claims`, never an AI hint)
 * and, on the question's size (the last of `sizes`), the sheet points at one straight edge across
 * which the unfold fails for an overlap or a slot. `auto` (D3) when, in EVERY size, a bracket or
 * the claim text points at exactly one straight edge, parallel to the question's, and the unfold
 * across it fails for an overlap or a slot — anything else is named in `missing`.
 */
function halfOfferOf(
  sizes: readonly { outer: PtMm[]; token: string }[],
  claims: readonly string[],
  brackets: readonly FoldBracket[],
  words: readonly FoldText[],
  lines: OtherLines | null,
): FoldHalfOffer | null {
  if (!claims.length || !sizes.length || !lines) return null;
  const per = sizes.map((z) => {
    const ptr = halfPointerOf(z.outer, brackets, words, lines);
    const edge = ptr && ptr.edges.length === 1 ? ptr.edges[0] : null;
    return { z, ptr, edge, why: edge ? halfFoldReason(z.outer, edge) : null };
  });
  const big = per[per.length - 1];
  const isHalf = (w: (typeof per)[number]['why']) =>
    !!w && (w.kind === 'overlap' || w.kind === 'slot');
  if (!big.edge || !isHalf(big.why)) return null;
  const problems: FoldHalfOffer['problems'] = [];
  for (const x of per)
    if (x.why && (x.why.kind === 'overlap' || x.why.kind === 'slot'))
      problems.push({ size: x.z.token, kind: x.why.kind, detail: x.why.detail });
  let missing: string | undefined;
  for (const x of per) {
    const tok = x.z.token;
    if (!x.ptr) missing = `size ${tok}: no bracket or fold text points at a straight edge`;
    else if (!x.edge)
      missing = `size ${tok}: the ${x.ptr.how === 'bracket' ? 'bracket' : 'fold text'} points at ${x.ptr.edges.length} edges`;
    else if (lineAngleOf(x.edge, big.edge) > FOLD_MATCH_ANGLE_DEG)
      missing = `size ${tok}: the edge pointed at is not the same edge`;
    else if (x.why?.kind === 'unfolds') missing = `size ${tok}: it unfolds across that edge`;
    else if (x.why?.kind === 'other') missing = `size ${tok}: ${x.why.detail}`;
    if (missing) break;
  }
  const by = [...new Set(per.flatMap((x) => x.ptr?.by ?? []))];
  const how = per.every((x) => x.ptr?.how === 'bracket') ? 'a fold bracket beside' : 'the text';
  const evidence = [
    ...claims.map((c) => `printed «${c.slice(0, 60)}»`),
    `${how} ${by.map((t) => `«${t.slice(0, 40)}»`).join(', ')} points at the ${big.edge.lenMm.toFixed(0)} mm straight edge${missing ? '' : ' in every size'}`,
    `unfolding there fails: ${problems.map((x) => `${x.size} ${x.kind}`).join(', ')}`,
  ];
  return {
    edge: { a: big.edge.a, b: big.edge.b, lenMm: big.edge.lenMm },
    problems,
    evidence,
    auto: !missing,
    ...(missing ? { missing } : {}),
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

/** Probe switch (node only): MOOD_F5_OFF reads one outline in every size as before (ungraded). */
/** MOOD Ф5: two contours within this (symmetric Hausdorff) are one outline, mm. */
const ONE_OUTLINE_MM = 1;

function f5Off(): boolean {
  return typeof process !== 'undefined' && !!process.env?.MOOD_F5_OFF;
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
  /** Per seed blocked 'fold-unresolved': the size the answered fold fails in, and the edges to ask again on. */
  const foldMisses: FoldMiss[] = [];
  /** A1: per seed blocked 'no-grain', what the drawing or the outline proposes (D3: a click). */
  const grainProposals: SeedGrainProposal[] = [];
  const warnings: string[] = [];
  const blocked: Blocked[] = [];
  /** D3: what the drawing does not prove, per seed — see `Unproven`. */
  const unproven: Unproven[] = [];
  /** GRADE P1: one shape across sizes — the operator's questions (never blocking). */
  const gradeAsks: GradeAsk[] = [];
  const gradeRefusals: Record<string, string> = {};
  const refusedSeed = new Map<string, SeedId>();
  /** GRADE P1: per `${seed}:${rank}`, the notch bumps crossed by their chord (source frame). */
  const notchChords = new Map<string, NotchChord[]>();
  const notes: Record<PieceKey, string[]> = {};
  const textById = new Map(sheet.texts.map((t) => [t.id, t]));

  // ── sizes ───────────────────────────────────────────────────────────────────────────────
  const cardOfRank = new Map<number, CardSize | null>();
  for (const e of sizeMap.entries) cardOfRank.set(e.source.rank, e.card);
  /** GRADE P2: a source rank's card token (the anchors a repaired size came from). */
  const tokOfRank = (r: number) => cardOfRank.get(r)?.token ?? run.sizes[r]?.label ?? `#${r}`;
  const cardTokens = [
    ...sizeMap.entries.flatMap((e) => (e.card ? [e.card.token] : [])),
    ...sizeMap.unmapped.map((c) => c.token),
  ];
  const isSizeToken = sizeTokenTest(cardTokens);
  const multiSize = run.sizes.length > 1;
  // SILENT: one grade reading of the sheet (every family: the sheet's grade breaks), on demand
  let silent: SilentRead | null = null;
  const silentOf = () =>
    (silent ??= silentRead(
      families,
      set,
      multiSize
        ? wallModel(set, run, sheet.texts, new Map(sheet.styles.map((st) => [st.id, st])))
        : null,
    ));

  // ── pass 1: names + candidates per family ───────────────────────────────────────────────
  type Prep = {
    fam: PieceFamily;
    seed: SeedId;
    cands: { c: PieceCandidate & DxfExtra; card: CardSize }[];
    /** Every size's candidate (an ungraded piece writes one of them: `cands`). */
    all: { c: PieceCandidate & DxfExtra; card: CardSize }[];
    texts: string[];
    name: NonNullable<ReturnType<typeof readName>>;
    ungraded: boolean;
  };
  const preps: Prep[] = [];
  const block = (seed: SeedId, reason: BlockReason, detail: string, name?: BlockedName) => {
    blocked.push({ seed, reason, detail, ...(name ? { name } : {}) });
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
    /** One outline: every candidate's area (± 0.05 %) and box size (± 0.1 mm) alike. */
    const sameOutline = (ms: typeof mapped) => {
      const a0 = ms[0].c.areaMm2;
      const b0 = ms[0].c.bbox;
      return ms.every(
        (m) =>
          Math.abs(m.c.areaMm2 - a0) <= a0 * 5e-4 &&
          Math.abs(m.c.bbox.maxX - m.c.bbox.minX - (b0.maxX - b0.minX)) <= 0.1 &&
          Math.abs(m.c.bbox.maxY - m.c.bbox.minY - (b0.maxY - b0.minY)) <= 0.1,
      );
    };
    /** MOOD Ф5: one outline point by point — every contour within 1 mm of the first, in place. */
    const alike = (ms: typeof mapped) =>
      ms.every((m) => m === ms[0] || hausdorffMm(m.c.outer, ms[0].c.outer) <= ONE_OUTLINE_MM);
    let bad = mapped.find((m) => m.c.outcome !== 'closed');
    // MOOD Ф5: some sizes do not close (a motif whose beads are not read), the ones that do all
    // close on ONE outline and stand on both sides of every one that does not — grading is
    // monotone, so equal sizes bracket equal sizes. With the drawing and the label (one-size.ts)
    // the piece is one piece for all sizes, written once from a size that closed; one evidence asks
    let oneFromClosed: { use: typeof mapped; note: string } | null = null;
    if (bad && !traced && !f5Off() && ov.ungraded !== false) {
      const closed = mapped.filter((m) => m.c.outcome === 'closed');
      const open = mapped.filter((m) => m.c.outcome !== 'closed');
      const bracketed = open.every(
        (m) =>
          m.c.outcome === 'leak' &&
          closed.some((x) => x.c.rank < m.c.rank) &&
          closed.some((x) => x.c.rank > m.c.rank),
      );
      if (
        closed.length >= 3 &&
        bracketed &&
        !closed[0].c.dxf &&
        sameOutline(closed) &&
        alike(closed)
      ) {
        const one =
          ov.ungraded === true ? null : oneSizeRead(closed[closed.length - 1].c, set, sheet, run);
        const sizesOpen = open.map((m) => m.card.token).join(', ');
        if (ov.ungraded === true || one?.kind === 'proven') {
          oneFromClosed = {
            use: closed,
            note: `one piece for all sizes: ${ov.ungraded === true ? 'the operator' : (one as { evidence: string[] }).evidence.join('; ')}; ${closed.length} sizes close on it, ${sizesOpen} (between them) not on their own lines`,
          };
          bad = undefined;
        } else if (one?.kind === 'ask') {
          block(
            seed,
            'one-size-question',
            `${one.why}; ${sizesOpen} (between them) do not close on their own lines — one piece for all sizes?`,
          );
          continue;
        }
      }
    }
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
    // the largest size that closed (Ф5: a size that did not close has no texts inside)
    const top = oneFromClosed
      ? oneFromClosed.use[oneFromClosed.use.length - 1].c
      : sorted[sorted.length - 1];
    const texts = textsOf(top, textById);
    const name = readName({
      override: ov,
      dxfIdentity: sorted[0].dxf?.identity ?? null,
      texts,
      isSizeToken,
      isTitle: titleTest(top, textById),
    });
    if (!name) {
      block(
        seed,
        'grammar',
        'no name: neither the operator, the AI, the DXF block nor the printed text gives a code',
        // CODE lane: the DXF block's own name ("3", "PIECE 12") is kept as the display name
        { source: sorted[0].dxf?.identity?.trim() || null, hand: null, twin: null },
      );
      // N3 (SVG smoke): its grainline is proposed NOW, beside the named pieces' — one "review N
      // proposed grainlines" covers every piece, not a second round after a code is typed. Only
      // when the drawing proves none (a detected grain needs no click once the piece is named).
      if (!operatorGrain[seed]) {
        const ms = oneFromClosed?.use ?? mapped;
        const c0 = ms[0].c;
        const famBox = bboxOf(
          ms.flatMap(({ c }) => [
            { x: c.bbox.minX, y: c.bbox.minY },
            { x: c.bbox.maxX, y: c.bbox.maxY },
          ]),
        );
        const g = classifyFeatures(c0, set, sheet, {
          sizeCount: run.sizes.length,
          region: famBox,
        }).find((f): f is GrainFeature => f.kind === 'grain');
        if (!g || g.origin === 'proposed') {
          const raw = g ? drawnProposal(g) : proposeGrain(c0.outer);
          // GRAIN: on every size's outline it will be applied to, or not offered
          const v = raw
            ? vetProposal(
                raw,
                ms.map(({ c }) => c.outer),
                !g,
              )
            : null;
          if (v && 'ok' in v) grainProposals.push({ seed, ...v.ok });
          else if (v) warnings.push(`seed ${seed}: ${v.dropped}`);
        }
      }
      continue;
    }
    // ungraded: declared UNI, one contour in a multi-size run, or the same contour in every size
    let ungraded = name.uni || (multiSize && sorted.length === 1);
    if (oneFromClosed) {
      ungraded = true;
      name.notes.push(oneFromClosed.note);
    } else if (!ungraded && mapped.length >= 2) {
      ungraded = sameOutline(mapped);
      // MOOD Ф5: under a size key, one outline in every size is ONE evidence — the drawing (drawn
      // once / by every pen in one place) and the label (no size named) make it one piece for all
      // sizes; one of them alone asks; a size's own line beside it makes it graded (semantics/
      // one-size.ts). The operator's word stands over both.
      let one =
        ungraded && !traced && !mapped[0].c.dxf && !f5Off()
          ? oneSizeRead(mapped[mapped.length - 1].c, set, sheet, run)
          : null;
      // equal areas and boxes, but contours apart: not one outline
      if (one && !alike(mapped))
        one = { kind: 'graded', why: 'the sizes close on outlines of one area and box, apart' };
      if (ungraded && ov.ungraded === false) ungraded = false;
      else if (ungraded && ov.ungraded === true)
        name.notes.push('one piece for all sizes: the operator');
      else if (one?.kind === 'proven')
        name.notes.push(`one piece for all sizes: ${one.evidence.join('; ')}`);
      else if (one?.kind === 'ask') {
        block(seed, 'one-size-question', `${one.why} — one piece for all sizes?`);
        continue;
      } else if (one) {
        ungraded = false;
        if (one.kind === 'graded') name.notes.push(`one outline in every size, but ${one.why}`);
      } else if (
        ungraded &&
        !traced &&
        !mapped[0].c.dxf &&
        !silentOff() &&
        mapped.some((m) => silentOf().drawsOwn(seed, m.c.rank))
      ) {
        // SILENT: one outline in every size with no reading of the key (no identity run, or too few
        // sizes) — but a size draws its own line beside it: the drawing grades the piece and the
        // sizes took one line (Albuca, Belladonna). One evidence each way: the operator says
        const own = mapped.find((m) => silentOf().drawsOwn(seed, m.c.rank))!;
        block(
          seed,
          'one-size-question',
          `every size closes on one outline, but size ${own.card.token} draws its own line beside it — one piece for all sizes?`,
        );
        continue;
      } else if (ungraded) name.notes.push('same outline in every size: ungraded');
    }
    const use = oneFromClosed?.use ?? mapped;
    preps.push({ fam, seed, cands: ungraded ? [use[0]] : use, all: use, texts, name, ungraded });
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
  type ListQty = {
    qty: number;
    entry: string;
    by: 'no' | 'name';
    /** Codex N3: why the count is only the answer shown (asked), null = it answers by itself. */
    ask: string | null;
  };
  const listQty = new Map<SeedId, ListQty>();
  /** Lists that print different counts for one piece: quoted, no count taken. */
  const listSplit = new Map<SeedId, string[]>();
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
    // Codex N3: a count answers by itself only from a cutting-list line (its section), bound by
    // the piece's printed number, whose words name THIS piece (its code or title), whose number is
    // no size token, with no other list printing another count. Anything else is the answer shown.
    const prepOf = new Map(preps.map((p) => [p.seed, p]));
    const titlesOf = new Map(pieceLabels.map((p) => [p.seed, p.labels]));
    // Codex N3: EVERY word beside the cut vocabulary is the piece's own name — its code read from
    // the word, or a word of its title; a verb («sy», «pres», «nähen») or a fabric asks
    const namesPiece = (seed: SeedId, words: readonly string[]) => {
      const pr = prepOf.get(seed);
      const ws = (titlesOf.get(seed) ?? []).flatMap((l) => l.toLowerCase().split(/[^\p{L}]+/u));
      return (
        words.length > 0 &&
        words.every((w) => {
          const code = readPieceText(w).code;
          if (code && pr && pr.name.code === code) return true;
          return ws.some(
            (x) => x.length >= 3 && w.length >= 3 && (x.startsWith(w) || w.startsWith(x)),
          );
        })
      );
    };
    // two entries landing on one piece (a number and another line's name) prove nothing: dropped
    const twice = new Set<SeedId>();
    for (const e of qtyEntries) {
      const b = bindListEntry(e, pieceLabels);
      if (!b) continue;
      if (e.conflict) {
        listSplit.set(b.seed, [e.text, ...e.conflict]);
        continue;
      }
      const ask =
        b.by === 'name'
          ? 'bound by title only'
          : !e.section
            ? 'is not in a cutting list (no cutting header, no list of counts around it)'
            : isSizeToken(e.no)
              ? `its number ${e.no} is a size`
              : !namesPiece(b.seed, e.rest)
                ? `«${e.rest.join(' ')}» is not this piece's name (nor cut vocabulary)`
                : null;
      const was = listQty.get(b.seed);
      if (was && was.qty !== e.qty) twice.add(b.seed);
      else if (!was || (was.by === 'name' && b.by === 'no'))
        listQty.set(b.seed, { qty: e.qty, entry: e.text, by: b.by, ask });
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
      if (byNo.has(e.text) || e.conflict) continue;
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
      listQty.set(fit[0].seed, {
        qty: es[0].e.qty,
        entry: es[0].e.text,
        by: 'name',
        ask: 'bound by its name (read as a code) only',
      });
    }
  }

  // P1 (G21): a continuity closure's provenance — roles as read, never a line of its own size
  const roleOfChain = new Map<ChainId, string>();
  for (const k of set.classes) for (const id of k.chains) roleOfChain.set(id, k.role);
  const continuityRecord = (c: PieceCandidate): ContinuityRecord => {
    const cls = set.classes.find((k) => k.id === run.sizes[c.rank]?.classId);
    const own = new Set(cls?.role === 'size' ? cls.chains : []);
    return {
      rank: c.rank,
      edges: (c.continuity ?? []).map((e) => ({
        rule: e.rule,
        chains: [...e.chains],
        roles: e.chains.map((id) => roleOfChain.get(id) ?? 'unclassified'),
        ...(e.bracket ? { bracket: true } : {}),
        ownRank: e.chains.some((id) => own.has(id)),
      })),
      verdict: c.continuityVerdict ?? null,
    };
  };

  // ── pass 2: geometry per family ─────────────────────────────────────────────────────────
  const pieces: PieceSpec[] = [];
  const walls = new Map<string, WallMap[]>(); // identity → per rank
  let done = 0;
  for (const p of preps) {
    progress?.(done++, preps.length, p.name.code);
    const { seed, name } = p;
    const ov = pieceOverrides[seed] ?? {};
    const pieceNotes: string[] = [...name.notes];
    /** MOOD Ф3.3: the facing fold per size, once every size of the family shows it */
    const facingOf = new Map<PieceCandidate, FoldChord[]>();
    const largest = p.cands[p.cands.length - 1].c;
    const symmetric = isMirrorSymmetric(largest.outer);

    // allowance decision for this piece
    const measured = !ov.allowance ? measuredAllowance(largest, set) : null;
    const dxfSeamOuter = !!largest.dxf?.outerIsSeam;
    let A: AllowanceDecision = ov.allowance ?? fileAllowance;
    // the geometry below derives the cut from a DXF layer-14 outline whatever meaning was given:
    // the record says so too (SILENT-TAIL, Codex: G3/G4/G8 read the drawn line by this meaning)
    if (dxfSeamOuter && A.meaning !== 'seam')
      A = {
        ...A,
        meaning: 'seam',
        evidence: [
          ...A.evidence,
          ov.allowance
            ? `the drawn outline is the graded seam line (DXF layer 14) — read as the seam over the given "${ov.allowance.meaning}"`
            : 'the drawn outline is the graded seam line (DXF layer 14)',
        ],
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
    let famLinesMemo: OtherLines | null = null;
    const famLines = () => (famLinesMemo ??= otherLinesNear(p.fam, set));
    if (!refEdge && foldWords.length) {
      const lines = famLines();
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
    // L13 (owner decision 19.10 a): a half the sheet says is cut on fold but that cannot be
    // unfolded is exported as drawn with its fold line marked. The printed claims (never the AI's
    // hint), the «cut on fold» words that may point at the edge, and the brackets beside them.
    const halfPick = opFold?.half ? opFold : null;
    const cofWords = foldWords
      .filter((w) => saysCutOnFold(w.t.text) && !internalWords.has(w.t.text))
      .map((w) => w.t);
    const claims = [
      ...listBound.filter((l) => l.seed === seed).map((l) => l.entry),
      ...new Set(
        foldWords
          .filter((w) => w.inside && saysCutOnFold(w.t.text) && !internalWords.has(w.t.text))
          .map((w) => w.t.text),
      ),
    ];
    let bracketsMemo: FoldBracket[] | null = null;
    const brackets = () =>
      (bracketsMemo ??= cofWords
        .map((t) => foldBracket(t, famLines()))
        .filter((b): b is FoldBracket => !!b));
    if (halfPick) refWhy = 'a half on fold (answered)';
    // MOOD Ф3.3 (R11): a facing fold line across the piece (semantics/facing.ts) — every size
    // shows it, or none does; an outline that stops at it while the size goes on beyond it has lost
    // its facing. Never either silently. "Not a fold" (the operator's) exports the outline as drawn.
    if (wantFold !== false) {
      // every size, also of a piece written once (UNI): a fold one size shows and another does not
      // is no fold of the piece
      const reads = p.all.map(({ c, card }) => ({ c, card, r: facingFolds(c, set, sheet) }));
      const cut = reads.find((x) => x.r.cutOff.length);
      const folded = reads.filter((x) => x.r.interior.length);
      if (cut) {
        block(
          seed,
          'facing-fold',
          `size ${cut.card.token}: the outline stops at «${cut.r.cutOff[0].text}» while the size's own lines go on beyond it — its facing is not closed`,
        );
        continue;
      }
      if (folded.length && folded.length < reads.length) {
        const miss = reads.filter((x) => !x.r.interior.length).map((x) => x.card.token);
        block(
          seed,
          'facing-fold',
          `«${folded[0].r.interior[0].text}» crosses the piece in size ${folded.map((x) => x.card.token).join(', ')} but no such line is read in ${miss.join(', ')} — every size folds its facing, or none`,
        );
        continue;
      }
      if (folded.length) {
        for (const x of reads) facingOf.set(x.c, x.r.interior);
        pieceNotes.push(
          `«${folded[0].r.interior[0].text}»: each size's own line across the piece — its facing fold, kept as an internal line`,
        );
      }
    }
    // fold words inside the piece, the AI's reading of the drawing, or the operator's "unfold"
    // without an edge: nothing proves which edge — ask
    const askFold =
      wantFold !== false && !refEdge && (foldEvidence.length > 0 || wantFold === true);
    let askWhy: string | null = null;

    // quantity / pair
    const qtyText = p.texts.map(parseQuantity).find((q) => q != null) ?? null;
    const saysPair = p.texts.some((t) => PAIR_WORDS.test(t) && parseQuantity(t) != null);

    const sizes: PieceSizeSpec[] = [];
    /** SILENT-TAIL: the drawn line each derived line was offset from, and by how much (±mm). */
    const derivedFrom = new Map<PieceSizeSpec, { base: PtMm[]; mm: number }>();
    const wallMaps: WallMap[] = [];
    let blockedHere: { reason: BlockReason; detail: string } | null = null;
    /** 'fold-unresolved': where the answered fold fails (the details step asks again from it). */
    let missHere: Pick<FoldMiss, 'size' | 'kind' | 'problem' | 'picked'> | null = null;
    let anyFold = false;
    /** L13: the sizes exported as a half on fold, each with why it cannot be unfolded. */
    const halfSizes: string[] = [];
    let lastGrain: GrainFeature | null = null;
    const opGrain = operatorGrain[seed];
    // A1: the family's box (the ungraded-line test looks for the size copies inside it)
    const famBox = bboxOf(
      p.cands.flatMap(({ c }) => [
        { x: c.bbox.minX, y: c.bbox.minY },
        { x: c.bbox.maxX, y: c.bbox.maxY },
      ]),
    );
    // DARTS: the darts proven of this piece — each size writes its own legs on layer 8
    const darts = (input.darts ?? []).filter((d) => d.seed === seed);
    const featOpts = {
      sizeCount: run.sizes.length,
      region: famBox,
      ...(darts.length ? { darts } : {}),
    };
    // NOTCH: compact closed marks are cleaned off the outline, then classified across the family:
    // numeric balloons are size tags (never layer 4); proven filled triangles / other marks are
    // notches. Read every size at once so repeated graded copies are independent evidence.
    const markReads =
      traced || p.all.some(({ c }) => featuresOf(c).length)
        ? new Map<number, MarkRead>()
        : readNotchMarks(
            p.all.map(({ c }) => c),
            set,
            undefined,
            { paths: sheet.paths, styles: sheet.styles, texts: sheet.texts, run },
          );

    // GRADE P1: a notch drawn AS the outline (a bump / dip of notch shape) at a grade-consistent
    // place in ≥ 2 sizes is a notch — each size's line crosses it by the chord (pieces/gfit/notch-bumps)
    const bumpsByRank = new Map<number, NotchBump[]>();
    if (
      !traced &&
      !gradeP1Off() &&
      !p.ungraded &&
      p.cands.length > 1 &&
      !p.cands.some(({ c }) => c.dxf)
    ) {
      const lines = p.cands.map(({ c, card }) => {
        const mr = markReads.get(c.rank);
        return {
          rank: c.rank,
          token: card.token,
          outer: ccw(mr?.cleaned.length ? mr.outer : c.outer),
        };
      });
      for (const [k, bs] of notchBumpSeries(lines)) bumpsByRank.set(lines[k].rank, bs);
    }

    // SHAPE-KINK: the operator's one-shape moves on this piece (api.fixShape / api.dropSize)
    const fixOf = (token: string) => input.shapeFixes?.[shapeFixKey(seed, token)];
    const shapeFixes: ShapeFixRecord[] = [];
    const featsOf = new Map<PieceCandidate, ReturnType<typeof classifyFeatures>>();
    const featsFor = (c: PieceCandidate) => {
      let f = featsOf.get(c);
      if (!f) {
        f = classifyFeatures(c, set, sheet, {
          ...featOpts,
          folds: facingOf.get(c),
          ownClass: run.sizes[c.rank]?.classId ?? null,
        });
        featsOf.set(c, f);
      }
      return f;
    };
    // SHAPE-KINK: a size (or a strict minority) whose outline turns where a strict majority of the
    // family does not — straightened by the chord onto the family's structure when the stretch is
    // jitter (≤ 2 mm over ≤ 20 mm) or the size's own drawn line runs on the chord (≤ 6 mm), or
    // the operator asked (api.fixShape, ≤ 6 mm); never at a notch (semantics/kink-repair.ts, D3)
    const kinkByRank = new Map<number, { outer: PtMm[]; kinks: KinkDone[] }>();
    const kept = p.cands.filter(({ card }) => fixOf(card.token) !== 'drop');
    // GRAIN: one grainline is drawn for the whole nest and may end on the LARGEST size's edge, a
    // millimetre or two outside the smaller ones (palto «23»: the 752 mm arrow ends on 88's
    // armhole, 0.3–1.9 mm out of 72–84, so only 88 holds it inside and the piece asked for a
    // click). A size with no grain of its own borrows the line another size of the family
    // detected, fitted onto every size's outline as a proposal is; a grain found per size wins.
    // Only a size whose outline the drawn line lies on, within FAMILY_GRAIN_MM, borrows it.
    const familyGrain = ((): { g: GrainFeature; a: PtMm; b: PtMm } | null => {
      if (opGrain) return null;
      let g: GrainFeature | null = null;
      for (const { c } of kept) {
        const f = featsFor(c).find((x): x is GrainFeature => x.kind === 'grain');
        if (
          f?.origin === 'detected' &&
          (!g || (f.evidence?.length ?? 0) > (g.evidence?.length ?? 0))
        )
          g = f;
      }
      const fit = g
        ? fitGrainInside(
            g.a,
            g.b,
            kept.map(({ c }) => c.outer),
          )
        : null;
      return g && fit ? { g: { ...g, a: fit[0], b: fit[1] }, a: g.a, b: g.b } : null;
    })();
    if (
      !traced &&
      !p.ungraded &&
      kept.length >= 3 &&
      !kept.some(({ c }) => c.dxf || c.features?.length)
    ) {
      const lines = kept.map(({ c, card }) => {
        const mr = markReads.get(c.rank);
        let o = ccw(mr?.cleaned.length ? mr.outer : c.outer);
        const nb = bumpsByRank.get(c.rank);
        if (nb?.length) o = chordAcross(o, nb);
        return { rank: c.rank, token: card.token, outer: o };
      });
      // every notch any size carries (ticks, marks, bumps): no straightening there (GRADE P1's)
      const notchAts: PtMm[] = [];
      for (const { c } of kept) {
        for (const f of featsFor(c)) if (f.kind === 'notch') notchAts.push(f.at);
        for (const n of markReads.get(c.rank)?.notches ?? []) notchAts.push(n.at);
        for (const b of bumpsByRank.get(c.rank) ?? []) notchAts.push(b.at);
      }
      const operator = new Set(
        kept.filter(({ card }) => fixOf(card.token) === 'straighten').map(({ c }) => c.rank),
      );
      const res = repairMinorityKinks(lines, {
        notches: notchAts,
        ownLine: (rank, a, b) => {
          const c = kept.find((x) => x.c.rank === rank)?.c;
          return !!c && ownLineOn(c, set, run.sizes[rank]?.classId ?? null, a, b);
        },
        operator,
        autoOff: kinkRepairOff(),
      });
      for (const [r, x] of res.byRank) kinkByRank.set(r, x);
      for (const { c, card } of kept)
        if (operator.has(c.rank)) {
          // a size the operator asked for: every straightening of it is the operator's (D5)
          const kk = kinkByRank.get(c.rank);
          if (kk) kk.kinks = kk.kinks.map((x) => ({ ...x, rule: 'operator' as const }));
          const k = kk?.kinks ?? [];
          // the operator's move is recorded even when it straightened nothing (the gate still asks)
          shapeFixes.push({
            size: card.token,
            action: 'straighten',
            ...(k.length ? { mm: Math.max(...k.map((x) => x.mm)) } : {}),
          });
          if (!kinkByRank.has(c.rank))
            warnings.push(
              `${name.code} ${card.token}: fix shape asked, nothing straightened — ${res.why || 'the size already has the family shape'}`,
            );
        }
    }

    for (const { c, card } of p.cands) {
      // SHAPE-KINK: the operator's "drop this size" — the piece is exported without it (recorded)
      if (fixOf(card.token) === 'drop') {
        shapeFixes.push({ size: card.token, action: 'drop' });
        pieceNotes.push(
          `${card.token}: left out of the export by the operator (one piece, one shape across sizes — api.dropSize)`,
        );
        continue;
      }
      const feats = featsFor(c);
      const mr = markReads.get(c.rank);
      if (mr) {
        feats.push(...mr.notches);
        if (mr.cleaned.length || mr.notches.length || mr.refused.length)
          pieceNotes.push(
            `${card.token}: ${mr.notches.length} notch mark(s) read as notches${mr.cleaned.length ? `, outline straightened across ${mr.cleaned.length}` : ''}${mr.refused.length ? `, ${mr.refused.length} on the line without a second evidence (not used)` : ''}`,
          );
      }
      // A1: a drawn line with ONE evidence is a proposal, never this size's grain by itself
      const found = feats.find((f): f is GrainFeature => f.kind === 'grain') ?? null;
      const proposedLine = found?.origin === 'proposed' ? found : null;
      let outer = ccw(mr?.cleaned.length ? mr.outer : c.outer);
      // SHAPE-KINK (pieces/notch-marks.ts): a placement mark this size ran around, kept on its line
      const sizeKinks: KinkRecord[] = (c.placeMarks ?? []).map((m) => ({
        at: m.at,
        mm: m.mm,
        spanMm: m.spanMm,
        rule: 'mark-wall' as const,
      }));
      if (c.placeMarks?.length)
        pieceNotes.push(
          `${card.token}: outline kept on its own drawn line under ${c.placeMarks.length} placement mark(s) the fill had taken as its wall (${c.placeMarks.map((m) => `${m.mm} mm over ${m.spanMm} mm`).join(', ')}; the other sizes run straight there) — D5`,
        );
      const nb = bumpsByRank.get(c.rank);
      if (nb?.length) {
        outer = chordAcross(outer, nb);
        for (const b of nb) {
          const d = Math.min(
            PATIMPORT.notchMaxMm,
            Math.max(PATIMPORT.notchMinMm, Math.abs(b.depth)),
          );
          // a tick drawn across the same place is the same notch — marked as crossed by the chord
          const same = feats.find(
            (f): f is NotchFeature =>
              f.kind === 'notch' &&
              Math.hypot(f.at.x - b.at.x, f.at.y - b.at.y) <= Math.abs(b.depth) + 2,
          );
          if (same) {
            same.chord = true;
            continue;
          }
          feats.push({
            kind: 'notch',
            origin: 'detected',
            ranges: [],
            confidence: 0.9,
            at: b.at,
            seg: [b.at, { x: b.at.x + b.inward.x * d, y: b.at.y + b.inward.y * d }],
            depthMm: d,
            chord: true,
          });
        }
        notchChords.set(
          `${seed}:${c.rank}`,
          nb.map((b) => ({ chord: [b.p, b.q] as [PtMm, PtMm], bump: b.bump })),
        );
        pieceNotes.push(
          `${card.token}: ${nb.length} notch(es) drawn as the outline (${nb.map((b) => `${b.depth > 0 ? 'bump' : 'dip'} ${Math.abs(b.depth).toFixed(1)} mm`).join(', ')}; the same place in other sizes) — the line crosses by the chord, the notch on layer 4`,
        );
      }
      const kk = kinkByRank.get(c.rank);
      if (kk) {
        // the removed stretch is no longer the line: G3 does not count its walls, G4 does not hold
        // the chord to them (the GRADE P1 chord record, same audit)
        const removed = kk.kinks.map((k) => {
          const P = k.chord[0];
          const Q = k.chord[1];
          return { chord: [P, Q] as [PtMm, PtMm], bump: k.removed };
        });
        const key = `${seed}:${c.rank}`;
        notchChords.set(key, [...(notchChords.get(key) ?? []), ...removed]);
        outer = kk.outer;
        sizeKinks.push(...kk.kinks.map(({ chord: _c, removed: _r, ...k }) => k));
        pieceNotes.push(
          `${card.token}: outline straightened onto the family's shape at ${kk.kinks.length} place(s) (${kk.kinks.map((k) => `${k.rule} ${k.mm} mm over ${k.spanMm} mm`).join(', ')}; a strict majority of sizes does not turn there) — D5`,
        );
      }
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
      /** L13: the half's fold edge (exported as drawn, the fold line marked), or null. */
      let halfEdge: FoldEdge | null = null;
      if (wantFold !== false) {
        foldFeat = (feats.find((f) => f.kind === 'fold') as FoldFeature | undefined) ?? null;
        if (foldFeat) fold = { a: foldFeat.a, b: foldFeat.b };
        else if (halfPick) {
          // L13: the edge the sheet points at in THIS size (parallel to the answer), else the
          // straight run matching the answered edge — no convex-hull filter (a half whose tips
          // cross the fold line has no hull edge there)
          const ptr = halfPointerOf(outer, brackets(), cofWords, famLines());
          const along = (ptr?.edges ?? []).filter(
            (e) => lineAngleOf(e, halfPick) <= FOLD_MATCH_ANGLE_DEG,
          );
          const e =
            along.length === 1
              ? along[0]
              : matchFoldEdge(straightRuns(outer), halfPick, refBox, c.bbox);
          if (!e) {
            blockedHere = {
              reason: 'fold-unresolved',
              detail: `${card.token}: no straight edge of this size matches the fold edge you picked`,
            };
            missHere = { size: card.token, kind: 'no-edge', problem: null, picked: halfPick };
            break;
          }
          const why = halfFoldReason(outer, e);
          if (why.kind === 'other') {
            blockedHere = {
              reason: 'fold-unresolved',
              detail: `${card.token}: cannot export the half on fold — ${why.detail}`,
            };
            missHere = { size: card.token, kind: 'unfold', problem: why.detail, picked: halfPick };
            break;
          }
          halfEdge = e;
          // its fold edge exactly straight (a drawn wobble ≤ 0.5 mm), as an unfold's fold line is
          outer = snapOntoFold(outer, e, FOLD_TOL_MM);
          if (c === p.cands[p.cands.length - 1].c)
            pieceNotes.push(
              `half on fold: the ${e.lenMm.toFixed(0)} mm straight edge — exported as drawn, its fold line on the mirror layer (the cutter folds the fabric)`,
            );
          halfSizes.push(
            why.kind === 'unfolds' ? `${card.token} would unfold` : `${card.token} ${why.kind}`,
          );
        } else if (refEdge) {
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
              missHere = { size: card.token, kind: 'no-edge', problem: null, picked: opFold };
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
      // L13: the fold bracket the half was read by is the sheet's «cut on fold» mark, not an
      // internal line of the piece (its ticks are another class, already left out)
      if (halfEdge && brackets().length) {
        const brs = brackets();
        internal = internal.filter(
          (f) =>
            f.closed ||
            !brs.some((br) => f.pts.every((q) => closestOnPolyline(q, [br.a, br.b], false).d <= 1)),
        );
      }
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
            // a fold line drawn in the source wins over any pick (see `fold` above)
            missHere = {
              size: card.token,
              kind: 'unfold',
              problem: t.problem,
              picked: foldFeat ? null : opFold,
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
      let derived: { base: PtMm[]; mm: number } | null = null;
      if (meaning === 'seam') {
        seam = outer;
        // L13: a half on fold keeps no allowance across its fold line
        const r = halfEdge
          ? offsetAcrossFold(seam, allowMm, halfEdge)
          : offsetContour(seam, allowMm);
        cut = r.pts;
        offset = r.report;
        derived = { base: seam, mm: allowMm };
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
          const r = halfEdge
            ? offsetAcrossFold(cut, -allowMm, halfEdge)
            : offsetContour(cut, -allowMm);
          seam = r.pts;
          offset = r.report;
          derived = { base: cut, mm: -allowMm };
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
      const familyHere =
        familyGrain &&
        grainOutsideMm(familyGrain.a, familyGrain.b, [c.outer], FAMILY_GRAIN_MM) === 0
          ? familyGrain.g
          : null;
      const borrowed = (lastGrain ?? familyHere) as GrainFeature | null;
      if (!grain && borrowed)
        grain = {
          ...borrowed,
          origin: 'derived',
          confidence: borrowed.confidence * 0.9,
          evidence: [...new Set([...(borrowed.evidence ?? []), 'borrowed' as const])],
        };
      if (!grain) {
        const raw = proposedLine
          ? drawnProposal(proposedLine)
          : proposeGrain(outer, { fold: foldEdge });
        // GRAIN: proposed in this size's cut frame (an unfolded piece's runs past the drawn half),
        // applied as drawn to every size — so fitted onto every size's drawn outline, or not offered
        const v = raw
          ? vetProposal(
              raw,
              p.cands.map(({ c: x }) => x.outer),
              !proposedLine,
            )
          : null;
        const pr = v && 'ok' in v ? v.ok : null;
        if (pr) grainProposals.push({ seed, ...pr });
        blockedHere = {
          reason: 'no-grain',
          detail: pr
            ? `${card.token}: grainline proposed (${pr.why}) — accept it or click two points`
            : `${card.token}: no grainline found${v && 'dropped' in v ? ` (${v.dropped})` : ''} — click two points on the piece`,
        };
        break;
      }
      lastGrain = grain;

      // L13: the half's fold line — the cut line's own run along the fold edge
      const halfLine = halfEdge ? halfFoldLine(halfEdge, cut) : null;
      if (halfEdge && !halfLine) {
        blockedHere = {
          reason: 'fold-unresolved',
          detail: `${card.token}: the cut line does not run along the ${halfEdge.lenMm.toFixed(0)} mm fold edge`,
        };
        missHere = {
          size: card.token,
          kind: 'unfold',
          problem: 'the cut line does not run along the fold edge',
          picked: halfPick,
        };
        break;
      }
      const fold2 = halfLine
        ? ({
            kind: 'fold',
            a: halfLine[0],
            b: halfLine[1],
            label: 'cut on fold — half shown',
            origin: 'derived',
            ranges: [],
            confidence: 0.6,
          } satisfies FoldFeature)
        : foldEdge
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
      const spec: PieceSizeSpec = {
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
        walls: mr?.cleaned.length ? c.walls.filter((w) => !mr.cleaned.includes(w)) : c.walls,
        bbox: bboxOf(cut),
        areaMm2: areaOf(cut),
        ...(c.rankFrom === 'continuity' ? { continuity: continuityRecord(c) } : {}),
        ...(sizeKinks.length ? { kinks: sizeKinks } : {}),
        ...(c.rankFrom === 'repair' && c.repair
          ? {
              // the pre-repair outline (sheet frame, audit pictures) stays on the candidate
              repair: {
                ...{ ...c.repair, was: undefined },
                fromTokens: [tokOfRank(c.repair.from[0]), tokOfRank(c.repair.from[1])],
              },
            }
          : {}),
      };
      sizes.push(spec);
      // GRADE P2 (D5): a size repaired from the grade is recorded, never presented as drawn
      if (c.rankFrom === 'repair' && c.repair) {
        const tok = tokOfRank;
        const rp = c.repair;
        pieceNotes.push(
          `size ${card.token} repaired from the grade of ${tok(rp.from[0])} and ${tok(rp.from[1])} on its own lines (${Math.round(rp.cover * 100)} %)${
            rp.kind === 'neighbour' ? " — it had closed on another size's line" : ''
          }${rp.holes ? ` — ${rp.holesMm} mm in ${rp.holes} hole${rp.holes > 1 ? 's' : ''} not drawn, filled from the grade (D5)` : ''}`,
        );
      }
      if (derived) derivedFrom.set(spec, derived);
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
        // GRAIN: one size's line applied to every size — on all of them, or not offered
        const v = top
          ? vetProposal(
              { a: top.a, b: top.b, why: 'most sizes agree' },
              p.cands.map(({ c: x }) => x.outer),
              false,
            )
          : null;
        const offered = v && 'ok' in v ? v.ok : null;
        if (offered)
          grainProposals.push({ seed, ...offered, evidence: [...(top!.evidence ?? [])] });
        blockedHere = {
          reason: 'no-grain',
          detail: `grainlines found per size disagree (${found.map((s) => `${s.sizeToken} ${s.grain!.angleDeg.toFixed(0)}°`).join(', ')})${offered ? ' — the majority is proposed' : v && 'dropped' in v ? ` — ${v.dropped}` : ''}`,
        };
      }
    }
    if (blockedHere) {
      block(seed, blockedHere.reason, blockedHere.detail);
      if (blockedHere.reason === 'fold-unresolved' && missHere)
        foldMisses.push({
          seed,
          rank: largest.rank,
          refSize: p.cands[p.cands.length - 1].card.token,
          ...missHere,
          picked: missHere.picked ? { a: missHere.picked.a, b: missHere.picked.b } : null,
          edges: foldEdges(ccw(largest.outer)).map((e) => ({ a: e.a, b: e.b, lenMm: e.lenMm })),
        });
      if (blockedHere.reason === 'fold-question') {
        const ask = foldAskOf(
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
        );
        // L13: printed «cut on fold» and the sheet points at an edge the unfold fails across —
        // offer the half with a fold line (auto when every size agrees, D3)
        const offer = claims.length
          ? halfOfferOf(
              p.cands.map(({ c: x, card: k }) => ({ outer: x.outer, token: k.token })),
              claims,
              brackets(),
              cofWords,
              famLines(),
            )
          : null;
        // another edge unfolds cleanly (the question's suggestion): the sheet's pointer and the
        // geometry disagree — offered, never auto (D3)
        const sug = ask.suggested != null ? ask.edges[ask.suggested] : null;
        // the sheet points along the very line that unfolds cleanly (a stretch of it): the
        // ordinary unfold across that line, no half (review R1 #3)
        const sameLine =
          !!offer &&
          !!sug &&
          lineAngleOf(offer.edge, sug) <= FOLD_MATCH_ANGLE_DEG &&
          [offer.edge.a, offer.edge.b].every(
            (q) => closestOnPolyline(q, [sug.a, sug.b], false).d <= 2 * FOLD_TOL_MM,
          );
        const half = sameLine
          ? null
          : offer?.auto && sug
            ? {
                ...offer,
                auto: false,
                missing: `the ${sug.lenMm.toFixed(0)} mm edge unfolds cleanly`,
              }
            : offer;
        foldAsks.push(half ? { ...ask, half } : ask);
      }
      continue;
    }
    // SILENT-TAIL: one corner, one treatment in every size — the derived lines are cut again with
    // the family's most conservative treatment of each matched corner (offset.ts
    // familyCornerKinds; demotion only, inside each size's own mitre). Not on a piece with a fold
    // (its fold line is laid on the cut) or one whose sizes were not all derived the same way.
    if (
      sizes.length > 1 &&
      sizes.every(
        (s) =>
          !s.fold && derivedFrom.has(s) && derivedFrom.get(s)!.mm === derivedFrom.get(sizes[0])!.mm,
      )
    ) {
      const from = sizes.map((s) => derivedFrom.get(s)!);
      const kinds = familyCornerKinds(
        from.map((f) => f.base),
        from[0].mm,
      );
      // all sizes or none (Codex): a size whose re-cut fails would keep a corner its neighbours cut
      // another way — then every size keeps its own cut, as before the family pass
      const redo = sizes.map((_, i) => {
        const kindOf = kinds[i];
        return kindOf ? offsetContour(from[i].base, from[i].mm, { cornerKinds: kindOf }) : null;
      });
      if (redo.every((r) => !r || r.report.ok))
        sizes.forEach((s, i) => {
          const r = redo[i];
          if (!r) return;
          if (from[i].mm > 0) {
            s.cut = r.pts;
            s.bbox = bboxOf(r.pts);
            s.areaMm2 = areaOf(r.pts);
          } else s.seam = r.pts;
          s.offset = r.report;
          pieceNotes.push(
            `${s.sizeToken}: allowance corners cut as in the other sizes (one corner, one treatment)`,
          );
        });
      else
        pieceNotes.push(
          'allowance corners: the family treatment did not offset cleanly in every size — each size keeps its own',
        );
    }
    // GRADE P1: notches across sizes on the piece's canonical topology (a notch drawn in ≥ 2 sizes
    // is placed where it is missing, flagged graded), and the explicit count question
    let asksHere: GradeAsk[] = [];
    let intendedHere: GradeCountFeature[] = [];
    if (!p.ungraded && !traced && sizes.length > 1) {
      const meaningHere = dxfSeamOuter || A.meaning === 'seam' ? 'seam' : 'cut';
      const gs = gradeShape(seed, sizes, meaningHere, input.gradeAnswers ?? {});
      sizes.splice(0, sizes.length, ...gs.sizes);
      pieceNotes.push(...gs.notes);
      asksHere = gs.asks;
      for (const [k, why] of Object.entries(gs.refusals)) {
        gradeRefusals[k] = why;
        refusedSeed.set(k, seed);
      }
      intendedHere = gs.intended;
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
    const listAsk = lq != null && (lq.ask != null || listConflict);
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
            // L13: a half on fold is cut once, on the fold — one whole piece, never a pair
            onFold: anyFold || halfSizes.length > 0,
            namedHand: !!name.hand,
          });
    if (lq && !listAsk && qtyText == null) pp.why = `cutting list «${lq.entry}»: ${pp.why}`;
    if (listConflict)
      pp.why = `the piece says ×${qtyText}, the cutting list «${lq!.entry}» ×${lq!.qty}: which?`;
    else if (lq && listAsk) pp.why = `${pp.why} — «${lq.entry}»: ${lq.ask}`;
    const split = !isDxf ? listSplit.get(seed) : undefined;
    if (split)
      pp.why = `${pp.why} — the cutting lists disagree: ${split.map((x) => `«${x}»`).join(' / ')}`;
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
      // a drawn L/R twin proves the pair, not a count the list gave by title only or split
      (mode === 'drawn' && !listAsk && !split) ||
      ov.pairHand !== undefined ||
      ov.piecesPerGarment != null ||
      (ov.unfoldedFold === true && anyFold);
    // E4 (redcafe спинка): a pair suggested only because the outline is not symmetric, while one
    // long straight edge (≥ 30 % of the perimeter) would unfold it into a believable whole — the
    // same outline may be the half of a piece cut on fold. Offered as the alternative, never applied.
    const foldAlt =
      !qtyProven &&
      mode === 'derived' &&
      !anyFold &&
      !halfSizes.length &&
      wantFold !== false &&
      !saysPair
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
      ...(halfSizes.length
        ? { halfFold: { evidence: ['answered: export the half with a fold line', ...halfSizes] } }
        : {}),
      // per WRITTEN identity: both hands of a pair count for one hand each (contract §3)
      piecesPerGarment: ppg,
      allowance: { ...A, allowanceMm: allowMm },
      // fabrics/ (F7) assigns the fabric purposes; semantics does not guess them
      fabrics: [] as string[],
      fused: ov.fused ?? false,
      ungraded: p.ungraded,
      ...(intendedHere.length ? { gradeIntended: intendedHere } : {}),
      ...(shapeFixes.length ? { shapeFixes } : {}),
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
      block(seed, 'grammar', gram, {
        source: sourceNameOf(name, p.cands[0]?.c),
        // a drawn pair keeps its hand: the twin is blocked with it ("its other hand is blocked")
        hand: mode === 'drawn' && twin != null ? hand : null,
        twin: mode === 'drawn' && twin != null ? twin : null,
      });
      for (const s of out) walls.delete(s.identity);
      continue;
    }
    for (const s of out) {
      notes[s.identity] = pieceNotes;
      pieces.push(s);
    }
    unproven.push(...unprovenHere);
    gradeAsks.push(...asksHere.map((a) => ({ ...a, identity: out[0]?.identity ?? null })));
  }
  progress?.(preps.length, preps.length);

  // ── unique identities (the card's alias index is case-insensitive) ─────────────────────
  const seen = new Map<string, SeedId>();
  // Codex N3: the two sides of a drawn pair must agree on the count (a left ×2 / right ×1 export
  // would cut a garment wrong silently) — else both are asked
  for (const [a, b] of twinOf) {
    if (a > b) continue;
    const pa = pieces.find((p) => p.seed === a);
    const pb = pieces.find((p) => p.seed === b);
    if (!pa || !pb || pa.piecesPerGarment === pb.piecesPerGarment) continue;
    if (pieceOverrides[a]?.piecesPerGarment != null && pieceOverrides[b]?.piecesPerGarment != null)
      continue;
    for (const p of [pa, pb])
      if (!unproven.some((u) => u.seed === p.seed && u.kind === 'quantity'))
        unproven.push({
          seed: p.seed,
          kind: 'quantity',
          shown: `×${p.piecesPerGarment}`,
          detail: `the drawn pair disagrees: ${pa.identity} ×${pa.piecesPerGarment}, ${pb.identity} ×${pb.piecesPerGarment}`,
        });
  }
  /** CODE lane: what a blocked written piece was called, its drawn hand and twin (BlockedName). */
  const blockedNameOf = (sp: PieceSpec): BlockedName => {
    const pr = preps.find((x) => x.seed === sp.seed);
    const twin = twinOf.get(sp.seed) ?? null;
    return {
      source: pr ? sourceNameOf(pr.name, pr.cands[0]?.c) : sp.displayName || null,
      hand: twin != null ? sp.pairHand : null,
      twin,
    };
  };
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
        blockedNameOf(s),
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
        blockedNameOf(s),
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
  /** P1 (G21): the continuity stretches of an identity × rank and their chains, its own frame. */
  const continuityOf = (identity: string, rank: number): ContinuityGeometry | undefined => {
    const src = sourceOf(identity, rank);
    if (!src || src.cand.rankFrom !== 'continuity' || !src.cand.continuity?.length)
      return undefined;
    return {
      edges: src.cand.continuity.map((e) => ({
        pts: toFrame(src.w, [e.pts]).filter((l) => l.length > 1),
        chainLines: toFrame(
          src.w,
          e.chains
            .map((id) => set.chains[id])
            .filter((ch) => !!ch && ch.pts.length > 1)
            .map((ch) => (ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts)),
        ),
      })),
    };
  };
  // MOOD Ф0 (G22): the pen each rank is drawn with, and the common edges every rank may use
  const styles = new Map(sheet.styles.map((st) => [st.id, st]));
  const idLooks = rankLooks(set, run, styles);
  let commonIds: Set<ChainId> | null = null;
  // D6: on a composite drawing each tile sheet's common edges are its own wall model's (the model
  // the fill ranked that sheet's walls with — pieces/fill.ts), never one read across two sheets
  const parts = sheet.parts && sheet.parts.length > 1 ? sheet.parts : null;
  const commonOf = () =>
    (commonIds ??= new Set([
      ...(parts
        ? parts.flatMap(
            (part) =>
              wallModel(
                chainView(set, parts, part.sheet),
                run,
                sheetView(sheet, part).texts,
                styles,
              ).common,
          )
        : wallModel(set, run, sheet.texts, styles).common),
      ...set.classes.filter((c) => c.role === 'common').flatMap((c) => c.chains),
    ]));
  // D6: a rank's pen measured off the drawing (no declared look) is read on the piece's own tile
  // sheet — two sheets may draw one size label with two pens (the identity verdict stays the file's)
  const looksBySheet = new Map<number, Pen[]>();
  const looksOn = (box: BoxMm): Pen[] => {
    if (!parts) return idLooks.looks;
    const k = partAt(parts, { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 })?.sheet;
    if (k == null) return idLooks.looks;
    let l = looksBySheet.get(k);
    if (!l) {
      const own = rankLooks(chainView(set, parts, k), run, styles).looks;
      l = idLooks.looks.map((d, r) => (idLooks.absent[r] ? [] : own[r]?.length ? own[r] : d));
      looksBySheet.set(k, l);
    }
    return l;
  };
  const linesOfIds = (ids: Iterable<ChainId>) =>
    [...ids]
      .map((id) => set.chains[id])
      .filter((ch) => !!ch && ch.pts.length > 1)
      .map((ch) => (ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts));
  const identityOf = (identity: string, rank: number): IdentityGeometry | undefined => {
    if (!idLooks.identity) return undefined;
    const src = sourceOf(identity, rank);
    if (!src || src.cand.rank >= idLooks.looks.length) return undefined;
    const allLooks = looksOn(src.cand.bbox);
    const look = allLooks[src.cand.rank] ?? [];
    const common = commonOf();
    // SILENT: an exact pen (declared dash, plain stroke) another size is drawn with too tells the two
    // sizes nothing apart — no own-pen evidence (a key read with two rows alike, a drawing that reuses
    // a dash): held like an absent one. A measured rhythm may read alike for two sizes (Mood's S and
    // L motifs): KINKS' ownStrict handles those.
    const penShared =
      !silentOff() &&
      look.length > 0 &&
      look.every((l) => l.kind !== 'motif') &&
      // every look of it another size's: no look left that is this size's alone (Codex)
      look.every((l) => allLooks.some((p, k) => k !== src.cand.rank && p.length && onPen(l, p)));
    if (idLooks.absent[src.cand.rank] || penShared)
      return {
        pen: null,
        own: [],
        excused: toFrame(src.w, linesOfIds(src.cand.walls.filter((id) => common.has(id)))),
      };
    const cls = set.classes.find((c) => c.id === run.sizes[src.cand.rank]?.classId);
    const others = new Set(
      run.sizes.flatMap((z, r) =>
        r === src.cand.rank ? [] : set.classes.find((c) => c.id === z.classId)?.chains ?? [],
      ),
    );
    const { own, foreign } = penLines(
      set,
      look,
      styles,
      src.cand.bbox,
      new Set(cls?.chains ?? []),
      others,
    );
    const ownSet = new Set(own);
    // a line drawn in another size's exact pen is provably that size's (penLines' `foreign`), even
    // where F3 put it in a common class by nesting order (chamonix: a stretch of 18-20's dash read
    // as common): never an edge every size uses — at most an edge this size shares (≤ half, below)
    const foreignSet = new Set(foreign);
    const isCommon = (id: ChainId) => common.has(id) && !foreignSet.has(id);
    const excused = toFrame(src.w, linesOfIds(src.cand.walls.filter(isCommon)));
    const walls = src.cand.walls.filter((id) => !isCommon(id) && !ownSet.has(id));
    // an edge this size shares with another size of the same piece — drawn once (viola, zhaket:
    // one line where two sizes coincide) or landed on (robe: the sizes end on 46's line). The gate
    // excuses at most half the written line this way: an outline that IS another size's (Mood
    // Paris "26" = 20's line) stays mostly on lines provably another size's.
    const coincident = new Set<ChainId>();
    for (const c2 of famBySeed.get(src.cand.seed)?.candidates ?? [])
      if (c2.rank !== src.cand.rank && c2.outcome === 'closed')
        for (const id of c2.walls) coincident.add(id);
    const shared = [
      ...new Set([
        ...sharedEdges(set, walls, own, look, styles, others),
        ...walls.filter((id) => coincident.has(id)),
      ]),
    ];
    const map = (ids: ChainId[]) => toFrame(src.w, linesOfIds(ids));
    const exact = look.length > 0 && look.every((l) => l.kind !== 'motif');
    // KINKS (G25): a measured look may be two sizes' (Mood's S and L motifs): a line another
    // size's class holds is not this size's line to bend along
    const strict = exact ? own : own.filter((id) => !others.has(id));
    return {
      // keyed by the drawing but no one look: the rank's own lines as F3 read them
      pen: look.length ? describePen(look) : 'its own size lines',
      ...(exact ? { exact: true } : {}),
      own: map(own),
      ...(strict.length !== own.length ? { ownStrict: map(strict) } : {}),
      ...(cls?.evidence.some((e) => e.kind === 'legend-sample') ? { keyed: true } : {}),
      excused,
      ...(shared.length ? { shared: map(shared) } : {}),
      ...(foreign.length ? { foreign: map(foreign) } : {}),
    };
  };
  let onePiece: Map<string, string> | null = null;
  const onePieceOf = (identity: string, rank: number): string | undefined => {
    const src = sourceOf(identity, rank);
    if (!src) return undefined;
    onePiece ??= onePieceProblems(
      families,
      Object.fromEntries(
        Object.entries(input.seedTexts ?? {}).filter((e): e is [string, number] => e[1] != null),
      ),
      Object.fromEntries(
        Object.entries(input.seedAts ?? {}).filter((e): e is [string, PtMm] => !!e[1]),
      ),
    );
    return onePiece.get(`${src.cand.seed}:${src.cand.rank}`);
  };
  const gradeOf = (identity: string, rank: number): GradeEvidence | undefined => {
    const src = sourceOf(identity, rank);
    if (!src || traced) return undefined;
    // a DXF's blocks are no drawing of nested size lines: nothing to read
    if ((src.cand as PieceCandidate & DxfExtra).dxf) return undefined;
    return silentOf().evidence(src.cand.seed, src.cand.rank);
  };
  const alongOf = bandCutSupport(set, run);
  const notchChordsOf = (identity: string, rank: number): NotchChord[] | undefined => {
    const src = sourceOf(identity, rank);
    if (!src) return undefined;
    const cs = notchChords.get(`${src.cand.seed}:${src.cand.rank}`);
    if (!cs?.length) return undefined;
    const out: NotchChord[] = [];
    for (const c of cs) {
      const ch = toFrame(src.w, [[...c.chord]]);
      const bu = toFrame(src.w, [c.bump]);
      ch.forEach((l, i) => {
        if (l.length === 2 && bu[i]?.length) out.push({ chord: [l[0], l[1]], bump: bu[i] });
      });
    }
    return out.length ? out : undefined;
  };
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
      ...(gradeAsks.some((a) => written.has(a.seed))
        ? { gradeAsks: gradeAsks.filter((a) => written.has(a.seed)) }
        : {}),
      ...([...refusedSeed].some(([, sd]) => written.has(sd))
        ? {
            gradeRefusals: Object.fromEntries(
              Object.entries(gradeRefusals).filter(([k]) => written.has(refusedSeed.get(k)!)),
            ),
          }
        : {}),
      ...(foldAsks.length ? { folds: foldAsks } : {}),
      ...(foldMisses.some((m) =>
        blocked.some((b) => b.seed === m.seed && b.reason === 'fold-unresolved'),
      )
        ? {
            foldMisses: foldMisses.filter((m) =>
              blocked.some((b) => b.seed === m.seed && b.reason === 'fold-unresolved'),
            ),
          }
        : {}),
      ...(foldList ? { foldList } : {}),
      ...(grainProposals.length
        ? {
            grainProposals: grainProposals.filter((g) =>
              blocked.some(
                (b) => b.seed === g.seed && (b.reason === 'no-grain' || b.reason === 'grammar'),
              ),
            ),
          }
        : {}),
    },
    wallsOf,
    derivedOf,
    continuityOf,
    identityOf,
    onePieceOf,
    gradeOf,
    notchChordsOf,
    notes,
  };
}

export const buildPieceSpecs: BuildPieceSpecsFn = (input, progress) =>
  buildPieceSpecsDetailed(input, progress).output;

/** Closest point helper re-exported for the probe (notch-on-cut checks). */
export { closestOnPolyline };
