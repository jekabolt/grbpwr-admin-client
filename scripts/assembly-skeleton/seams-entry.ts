// A5 — seam-graph probe entry, bundled by scripts/assembly-skeleton/seams.mjs and run in node.
//
// Walks the product path end to end: the nesting parser (parseSheets, the same one the worker runs)
// → one PieceDTO per block of the base size (seamPieceOf) → buildSeamGraph. The truth files were
// written against the 09.10 probe's own edge numbering, so each truth label is carried over by
// GEOMETRY (the probe edge's midpoint in drawing coordinates → the product edge passing through it),
// never by trusting that two segmentations number edges alike.

import type { PieceDTO } from '../../src/lib/nesting/types';
import { parseSheets } from '../../src/lib/nesting/worker/parse-files';
import {
  buildSeamGraph,
  compositeSeams,
  edgeIdsOf,
  matchSeams,
  runsOf,
  scoreRuns,
  seamPieceOf,
  segmentPiece,
  twins,
  type MatchRules,
  unprovenCopies,
} from '../../src/lib/assembly-skeleton/geometry';
import {
  surfaceSeams,
  type SurfaceOptions,
} from '../../src/lib/assembly-skeleton/geometry/surface';
import { pieceMultiplicity } from '../../src/lib/assembly-skeleton/cut';
import { unionLayout } from '../../src/lib/assembly-skeleton/union/layout';
import { groupUnits, orderTemplate } from '../../src/lib/assembly-skeleton/skeleton';
import type {
  PieceGeom,
  SeamCandidate,
  SeamGraph,
  SkeletonBomFacts,
  SkeletonCategory,
  SkeletonFacts,
} from '../../src/lib/assembly-skeleton/types';

export { ALL_RULES, PROBE_RULES, compositeSeams } from '../../src/lib/assembly-skeleton/geometry';
export { buildSkeleton, groupUnits, orderTemplate } from '../../src/lib/assembly-skeleton/skeleton';
export { skeletonDeps } from '../../src/components/managers/tech-card/components/assembly-skeleton-deps';

/**
 * Why each truth pair was (not) taken: its own score as a single-edge pair and which chosen seam
 * took each of its edges instead. Diagnostic output only.
 */
export function explainTruth(
  graph: SeamGraph,
  truth: Truth,
  map: (l: string) => string[],
  rules: MatchRules,
): string[] {
  const runOf = (id: string) => {
    const piece = graph.pieces.find((p) => p.edges.some((e) => e.id === id));
    return piece ? runsOf(piece, false).find((r) => r.id === id) : undefined;
  };
  const takenBy = (id: string) =>
    graph.chosen.find((c) => [...edgeIdsOf(c.a), ...edgeIdsOf(c.b)].includes(id));
  return truth.pairs.map(([ta, tb]) => {
    const a = map(ta)[0];
    const b = map(tb)[0];
    const u = a ? runOf(a) : undefined;
    const v = b ? runOf(b) : undefined;
    if (!u || !v) return `${ta}~${tb}: unmapped`;
    const r = scoreRuns(u, v, rules);
    const took = [a, b].map((id) => {
      const c = takenBy(id);
      return c ? `${id}→${c.a}~${c.b} ${c.score.toFixed(2)}` : `${id} free`;
    });
    const p = r?.parts;
    return `${ta}~${tb} = ${a}~${b}: ${
      r && p
        ? `${r.score.toFixed(2)} len ${p.lenScore} notch ${p.notch} shape ${p.shapeRmsMm.toFixed(1)}mm ends ${p.endsErrDeg.toFixed(0)}° ${p.meeting}${r.evidence.rule ? ` [${r.evidence.rule}]` : ''}`
        : 'no candidate'
    } · ${took.join(' · ')}`;
  });
}

const NO_BOM: SkeletonBomFacts = {
  zipper: 0,
  buttons: 0,
  snaps: 0,
  tape: 0,
  elastic: 0,
  drawcord: 0,
  interlining: 0,
};

export type Loaded = { facts: SkeletonFacts; origin: Map<string, [number, number]> };

/** Parse a DXF and keep one piece per block of `size` (block name `<identity>_<size>`). */
export async function loadFacts(
  bytes: ArrayBuffer,
  size: string,
  category: SkeletonCategory,
  bom: Partial<SkeletonBomFacts> = {},
): Promise<Loaded> {
  const parsed = await parseSheets([{ name: 'probe.dxf', open: async () => bytes }], {
    unit: 'auto',
    tol: 0.05,
    tolChain: 0.05,
  });
  const byBlock = new Map<string, PieceDTO[]>();
  for (const p of parsed.pieces) {
    const b = p.blockName ?? '';
    const at = b.lastIndexOf('_');
    if (at < 0 || b.slice(at + 1).replace(/^<|>$/g, '') !== size) continue;
    byBlock.set(b, [...(byBlock.get(b) ?? []), p]);
  }
  const origin = new Map<string, [number, number]>();
  const pieces: SkeletonFacts['pieces'] = [];
  for (const [block, cands] of byBlock) {
    const piece = seamPieceOf(cands);
    if (!piece) continue;
    const key = block.slice(0, block.lastIndexOf('_'));
    origin.set(key, [(piece.originX ?? 0) * 10, (piece.originY ?? 0) * 10]);
    pieces.push({
      pieceKey: key,
      name: key,
      piece,
      piecesPerGarment: 1,
      cutSymmetry: null,
      cloth: null,
      fused: false,
    });
  }
  return {
    facts: { pieces, category, bom: { ...NO_BOM, ...bom }, defaultMachineType: null },
    origin,
  };
}

/**
 * A3 alone, or (`a4`) the product pipeline: A3 → lane B's units → A4 composite second pass — the
 * same order the tech card's provider runs.
 */
export function run(
  facts: SkeletonFacts,
  rules: MatchRules,
  a4 = false,
): { graph: SeamGraph; ms: number } {
  const t0 = performance.now();
  const graph = buildSeamGraph(facts, rules);
  if (!a4) return { graph, ms: performance.now() - t0 };
  const units = groupUnits(graph, facts, orderTemplate(facts.category));
  return { graph: compositeSeams(graph, units), ms: performance.now() - t0 };
}

/** Both sides of a seam as edge-id sets (a composite side is all its parts). */
const sidesOf = (c: SeamCandidate) => [
  new Set(c.aParts ?? edgeIdsOf(c.a)),
  new Set(c.bParts ?? edgeIdsOf(c.b)),
];

// ── truth ────────────────────────────────────────────────────────────────────────────────────

const MAP_TOL_MM = 12;

type ProbeOut = {
  pieces: { id: string; rs: [number, number][] }[];
  edgeIdx: { piece: string; k: number; s: number; e: number }[];
};
/**
 * A composite truth as pieces: the two sides of a composite join, each a set of piece keys
 * (the truth files carry them as prose, `composite: [...]`; the probe restates them).
 */
export type CompositeTruth = { label: string; a: string[]; b: string[] };

export type Truth = {
  pairs: [string, string][];
  compositePairs?: CompositeTruth[];
  acceptable?: [string, string][];
  wrong_by_design_knowledge?: string[];
};

/** probe label `P#k` (or `P#k1+k2`) → product edge ids, via the probe edge's midpoint. */
export function labelMapper(
  probe: ProbeOut,
  graphPieces: readonly PieceGeom[],
  origin: Map<string, [number, number]>,
): { map: (label: string) => string[]; unmapped: string[]; offset: string[] } {
  const rsOf = new Map(probe.pieces.map((p) => [p.id, p.rs]));
  const unmapped: string[] = [];
  const offset: string[] = [];
  const cache = new Map<string, string | null>();
  const one = (piece: string, k: number): string | null => {
    const key = `${piece}#${k}`;
    if (cache.has(key)) return cache.get(key) ?? null;
    let out: string | null = null;
    const ei = probe.edgeIdx.find((e) => e.piece === piece && e.k === k);
    const rs = rsOf.get(piece);
    const g = graphPieces.find((p) => p.pieceKey === piece);
    const o = origin.get(piece);
    if (ei && rs && g && o) {
      const n = rs.length;
      const span = ei.e > ei.s ? ei.e - ei.s : n - ei.s + ei.e;
      const mid = rs[(ei.s + Math.floor(span / 2)) % n];
      let best = Infinity;
      for (const e of g.edges) {
        for (const p of e.pts) {
          const d = Math.hypot(p[0] + o[0] - mid[0], p[1] + o[1] - mid[1]);
          if (d < best) {
            best = d;
            out = e.id;
          }
        }
      }
      // One seam allowance: the 09.10 probe read a few mode-B pieces off a contour 10 mm outside
      // the sewing line (Allsizes BP / BP_2); the edge is still the same edge.
      if (best > MAP_TOL_MM) out = null;
      else if (best > 3) offset.push(`${key} ${best.toFixed(0)} mm`);
    }
    if (!out) unmapped.push(key);
    cache.set(key, out);
    return out;
  };
  return {
    map: (label) => {
      const at = label.lastIndexOf('#');
      const piece = label.slice(0, at);
      return label
        .slice(at + 1)
        .split('+')
        .map((k) => one(piece, Number(k)))
        .filter((x): x is string => !!x);
    },
    unmapped,
    offset,
  };
}

export type Score = {
  truth: number;
  chosen: number;
  /** Composite seams that meet a composite truth / partial and composite seams chosen. */
  composite: number;
  partial: number;
  compositeChosen: number;
  recovered: number;
  acceptable: number;
  wrong: number;
  ambiguous: number;
  /** Seams whose only rivals are the same edge on an unproven same-shape copy (asked in words). */
  copyOnly: number;
  recall: number;
  precision: number;
  ambiguousShare: number;
  missed: string[];
  wrongPairs: string[];
};

export function score(whole: SeamGraph, truth: Truth, map: (l: string) => string[]): Score {
  // Surface joins (P2 lane S) take no edge and are not in the edge truth: scored apart (surface()).
  const graph = { ...whole, chosen: whole.chosen.filter((c) => c.kind !== 'surface') };
  const sets = graph.chosen.map(sidesOf);
  const covers = ([ta, tb]: [string, string], [x, y]: Set<string>[]) => {
    const A = map(ta);
    const B = map(tb);
    return (
      (A.some((e) => x.has(e)) && B.some((e) => y.has(e))) ||
      (A.some((e) => y.has(e)) && B.some((e) => x.has(e)))
    );
  };
  const missed: string[] = [];
  let recovered = 0;
  for (const t of truth.pairs) {
    if (sets.some((s) => covers(t, s))) recovered++;
    else missed.push(`${t[0]}~${t[1]}`);
  }
  let acceptable = 0;
  const wrongPairs: string[] = [];
  // A composite seam is right when its two sides' pieces meet a composite truth's two sides.
  const piecesOf = (ids: Set<string>) =>
    new Set([...ids].map((id) => id.slice(0, id.lastIndexOf('#'))));
  const meets = (x: Set<string>, ks: string[]) => ks.some((k) => x.has(k));
  let composite = 0;
  graph.chosen.forEach((c, i) => {
    if (c.kind === 'composite') {
      const [pa, pb] = sets[i].map(piecesOf);
      const ok = (truth.compositePairs ?? []).some(
        (t) => (meets(pa, t.a) && meets(pb, t.b)) || (meets(pa, t.b) && meets(pb, t.a)),
      );
      if (ok) {
        composite++;
        return;
      }
    }
    if (truth.pairs.some((t) => covers(t, sets[i]))) return;
    if ((truth.acceptable ?? []).some((t) => covers(t, sets[i]))) acceptable++;
    else wrongPairs.push(`${c.a}~${c.b}`);
  });
  const chosen = graph.chosen.length;
  // A rival that is the same seam onto an unproven same-shape copy (shell or its lining twin, no
  // cloth to tell) is not a seam choice: the proposal asks «layer, lining or a copy?» about the
  // pair in words. The gate measures the seam choices; the copy-only ones are reported apart.
  const copyPairs = new Set(
    unprovenCopies(graph.pieces).flatMap(([a, b]) => [
      `${a.pieceKey}|${b.pieceKey}`,
      `${b.pieceKey}|${a.pieceKey}`,
    ]),
  );
  const pk = (id: string) => id.slice(0, id.lastIndexOf('#'));
  const copyRival = (c: SeamCandidate, q: SeamCandidate) =>
    (q.a === c.a && copyPairs.has(`${pk(q.b)}|${pk(c.b)}`)) ||
    (q.b === c.b && copyPairs.has(`${pk(q.a)}|${pk(c.a)}`)) ||
    (q.a === c.b && copyPairs.has(`${pk(q.b)}|${pk(c.a)}`)) ||
    (q.b === c.a && copyPairs.has(`${pk(q.a)}|${pk(c.b)}`));
  const withRivals = graph.chosen.filter((c) => (c.ambiguousWith ?? []).length > 0);
  const copyOnly = withRivals.filter((c) => (c.ambiguousWith ?? []).every((q) => copyRival(c, q)));
  const ambiguous = withRivals.length - copyOnly.length;
  return {
    truth: truth.pairs.length,
    chosen,
    composite,
    partial: graph.chosen.filter((c) => c.kind === 'partial').length,
    compositeChosen: graph.chosen.filter((c) => c.kind === 'composite').length,
    recovered,
    acceptable,
    wrong: wrongPairs.length,
    ambiguous,
    copyOnly: copyOnly.length,
    recall: recovered / Math.max(1, truth.pairs.length),
    precision: (chosen - wrongPairs.length) / Math.max(1, chosen),
    ambiguousShare: ambiguous / Math.max(1, chosen),
    missed,
    wrongPairs,
  };
}

/** Chosen seams touching any of `left` on one side and any of `right` on the other. */
export function pairsBetween(
  graph: Pick<SeamGraph, 'chosen'>,
  left: string[],
  right: string[],
): string[] {
  const L = new Set(left);
  const R = new Set(right);
  return graph.chosen
    .filter((c) => {
      const a = c.aParts ?? edgeIdsOf(c.a);
      const b = c.bParts ?? edgeIdsOf(c.b);
      return (
        (a.some((e) => L.has(e)) && b.some((e) => R.has(e))) ||
        (a.some((e) => R.has(e)) && b.some((e) => L.has(e)))
      );
    })
    .map((c) => `${c.a}~${c.b}`);
}

// ── P2 lane S: surface joins ──────────────────────────────────────────────────────────────────

/** A surface join as `part>host` (piece keys). */
export const surfacePairs = (graph: Pick<SeamGraph, 'chosen'>): string[] =>
  graph.chosen
    .filter((c) => c.kind === 'surface' && c.surface)
    .map((c) => `${c.surface!.part}>${c.surface!.host}`)
    .sort();

/** The surface pass alone over the product geometry, with its guards switched by `opts`. */
export function surfaceOnly(facts: SkeletonFacts, opts: SurfaceOptions): string[] {
  const pieces = twins(facts.pieces.map(segmentPiece));
  const copies = new Map(facts.pieces.map((p) => [p.pieceKey, pieceMultiplicity(p)]));
  return surfacePairs(surfaceSeams(pieces, copies, opts));
}

/** NEGATIVE CONTROL: the whole A3 pass on pieces whose marks were never read. */
export function withoutMarks(facts: SkeletonFacts): SeamGraph {
  const pieces = twins(facts.pieces.map(segmentPiece)).map((p) => ({ ...p, marks: [] }));
  return matchSeams(pieces, facts);
}

/** Every chosen surface join with its evidence, for the listing. */
export function surfaceLines(graph: SeamGraph): string[] {
  return graph.chosen
    .filter((c) => c.kind === 'surface' && c.surface)
    .map(
      (c) =>
        `${c.surface!.part} on ${c.surface!.host} (mark ${c.surface!.mark}, fit ${c.surface!.fit}, score ${c.score}, entry ${c.b}) — ${c.evidence.rule}${c.ambiguousWith?.length ? ` · rivals ${c.ambiguousWith.map((q) => q.surface?.part).join(', ')}` : ''}`,
    );
}

/**
 * The pictogram of host + part (union/layout.ts): how far, in mm, the drawn part lies from the
 * host's placement mark as drawn (mean over the mark), and whether it is drawn as a surface piece
 * and not as a guess. The old placement (lower-right quadrant) misses by tens of mm.
 */
export function surfaceDrawn(
  graph: SeamGraph,
  host: string,
  part: string,
): { offMm: number; surface: boolean; approx: boolean } | null {
  const c = graph.chosen.find((x) => x.surface?.host === host && x.surface.part === part);
  const G = new Map(graph.pieces.map((p) => [p.pieceKey, p]));
  const mark = G.get(host)?.marks?.find((m) => m.id === c?.surface?.mark);
  if (!c || !mark) return null;
  const L = unionLayout([host, part], graph.chosen, G);
  const at = (k: string) => L.placements.find((p) => p.pieceKey === k);
  const h = at(host);
  const q = at(part);
  if (!h || !q) return null;
  const ap = (T: number[], p: [number, number]): [number, number] => [
    T[0] * p[0] + T[2] * p[1] + T[4],
    T[1] * p[0] + T[3] * p[1] + T[5],
  ];
  const drawn = G.get(part)!.rs.map((p) => ap(q.T, p));
  let sum = 0;
  for (const m of mark.pts) {
    const w = ap(h.T, m);
    let best = Infinity;
    for (const d of drawn) best = Math.min(best, Math.hypot(d[0] - w[0], d[1] - w[1]));
    sum += best;
  }
  return {
    offMm: sum / mark.pts.length,
    surface: (L.surface ?? []).includes(part),
    approx: !!q.approx,
  };
}
