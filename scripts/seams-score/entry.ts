// yarn seams:score — node half (bundled by scripts/seams-score/score.mjs). MEASUREMENT, not product
// code: for every prod card the corpus stand captured (yarn doll:corpus → beta-all/<tag>/req/<id>.json,
// the facts the live app hands the doll at the read size) and for beta card 49, run
//   (a) the seam graph alone (readSeamGraph, the path the screen uses) and
//   (b) the doll's final seam set (solveDoll with the card's joins: graph + order joins + proposals,
//       «not sewn» pairs excluded),
// each twice — with the GREEDY assignment as shipped and with the operation-driven GLOBAL solver
// (lib/assembly-skeleton/assignment, VITE_SEAM_ASSIGNMENT=global) — and score all four against the
// TRUTH seam list (scripts/seams-score/truth/<id>.seams.json, built from
// truth/specs.ts) by edge identity, tolerant to segmentation:
//   · a seam is a pair of SEWN STRETCHES on the pieces' contours (mm along the resampled ring);
//   · a prediction is SOUND when ≥ 70 % of each of its sides lies on stretches the truth sews (any
//     row, closures included — a buttoned opening drawn shut is not a wrong seam);
//   · a truth row is FOUND when the sound predictions touching both its sides cover ≥ 70 % of each
//     (one composite may be read as several seams, two halves may be read as one);
//   · rows of one `anyOf` group are readings of one physical seam (a sandwich: the yoke OR its ply
//     onto the back) — one found is enough;
//   · `pattern` rows name interchangeable identical panels (a bag's 16 triangles) by regex, with a
//     count: TP = min(count, matching predictions);
//   · buckets: main (the garment's seams — precision / recall), ply (bagging of two-ply parts and
//     sandwich plies — the doll draws plies as layers, so counted apart), lining (the card reads the
//     shell only), closures (neutral), not-sewn (a prediction on them is a wrong seam with that name).
// Truth rows are StoredSeam anchors (lib/seams), so a new segmentation still resolves them (stale
// rows are listed, never silently dropped).
//
//   edges [ids]   dump pieces / edges / notches / marks + the card's joins + engine and doll seams
//   sheet [ids]   flat pieces with numbered edges and the truth rows drawn on them (SVG; the runner
//                 screenshots it to <metrics>/truth/<id>-flat-edges.png)
//   build [ids]   truth/specs.ts → truth/<id>.seams.json
//   score [ids]   per-card + total TP / FP / FN, precision, recall (all rows and «sure» rows), FP /
//                 FN in words; JSON to scripts/seams-score/out/latest.json

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { readSeamGraph, segmentAll } from '../../src/lib/assembly-skeleton/pipeline';
import { edgeIdsOf } from '../../src/lib/assembly-skeleton/geometry';
import type {
  Edge,
  PieceGeom,
  SeamCandidate,
  SeamGraph,
  SkeletonFacts,
} from '../../src/lib/assembly-skeleton/types';
import {
  grainDegOf,
  resolveSeamDecisions,
  seamFromCandidate,
  type AppliedRow,
  type StoredSeam,
} from '../../src/lib/seams';
import {
  joinsFromOps,
  solveDoll,
  type DeclaredOp,
  type DollOptions,
  type DollReport,
} from '../../src/lib/doll';
// hardwareFromOps arrived after 17038f74 — read through the namespace so the scorer still bundles
// on the baseline commits (the card's hardware is then simply not handed to the doll).
import * as DollLib from '../../src/lib/doll';
import { loadFacts } from '../assembly-skeleton/seams-entry';
import { TRUTH, type Bucket, type Confidence, type TruthSeam } from './truth/specs';

type CardSpec = {
  id: string;
  label: string;
  /** A captured doll request (facts + options as the live app posts them). */
  req?: string;
  /** Else: a DXF + a beta card JSON (ops by piece name). */
  dxf?: string;
  betaCard?: string;
  size?: string;
  category?: SkeletonFacts['category'];
  bom?: Partial<SkeletonFacts['bom']>;
  gender?: 'MALE' | 'FEMALE';
};
type Spec = {
  mode: string;
  cards: CardSpec[];
  outDir: string;
  truthDir: string;
  sha: string;
  reqTag: string;
};

const [specPath] = process.argv.slice(2);
const spec = JSON.parse(await readFile(specPath, 'utf8')) as Spec;
const { mode, truthDir, outDir } = spec;

const quiet = async <T>(f: () => Promise<T> | T): Promise<T> => {
  const l = console.log;
  const w = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return await f();
  } finally {
    console.log = l;
    console.warn = w;
  }
};
const pk = (id: string) => id.slice(0, id.lastIndexOf('#'));
const kOf = (id: string) => id.slice(id.lastIndexOf('#') + 1);
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const truthKey = (card: string, i: number) => {
  const h = createHash('sha256').update(`truth:${card}:${i}`).digest();
  let s = '';
  for (let k = 0; k < 26; k++) s += CROCKFORD[h[k] % 32];
  return s;
};
const pct = (x: number) => `${Math.round(100 * x)} %`;

// ── a card: facts + doll options, as the live app posts them ──────────────────────────────────
type Loaded = {
  facts: SkeletonFacts;
  options: DollOptions;
  anchors: { size: string; facts: SkeletonFacts }[];
  size: string;
};
async function loadCard(c: CardSpec): Promise<Loaded | null> {
  if (c.req) {
    if (!existsSync(c.req)) return null;
    const reqs = JSON.parse(await readFile(c.req, 'utf8')) as {
      facts: SkeletonFacts;
      options?: DollOptions;
      anchors?: { size: string; facts: SkeletonFacts }[];
    }[];
    const input = reqs[reqs.length - 1];
    if (!input) return null;
    return {
      facts: input.facts,
      options: input.options ?? {},
      anchors: input.anchors ?? [],
      size: c.size ?? '?',
    };
  }
  if (!c.dxf || !existsSync(c.dxf)) return null;
  const buf = await readFile(c.dxf);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const { facts } = await quiet(() =>
    loadFacts(bytes, c.size ?? 'M', c.category ?? 'shirt', c.bom ?? {}),
  );
  const options: DollOptions = { gender: c.gender ?? null };
  if (c.betaCard) {
    const beta = JSON.parse(await readFile(c.betaCard, 'utf8')) as {
      ops: [number, string, string, string, string, string][];
    };
    const names = new Set(facts.pieces.map((p) => p.pieceKey));
    const pieceOf = (k: string) => (names.has(k) ? k : null);
    const ops: DeclaredOp[] = beta.ops.map(([, type, , inputs, output]) => ({
      inputs: inputs.split('+'),
      output,
      type,
    }));
    options.joins = joinsFromOps(ops, pieceOf);
    const hardwareFromOps = (DollLib as { hardwareFromOps?: typeof DollLib.hardwareFromOps })
      .hardwareFromOps;
    const hw = hardwareFromOps ? hardwareFromOps(ops, pieceOf) : [];
    if (hw.length) options.hardware = hw;
  }
  return { facts, options, anchors: [], size: c.size ?? 'M' };
}

// ── names ↔ keys (the truth is written in DXF names; the live app keys pieces by line_key) ──
type Names = { nameOf: (key: string) => string; keyOf: (name: string) => string | undefined };
function namesOf(facts: SkeletonFacts): Names {
  const n = new Map(facts.pieces.map((p) => [p.pieceKey, p.name]));
  const k = new Map<string, string>();
  for (const p of facts.pieces) {
    if (k.has(p.name)) k.set(p.name, '!dup');
    else k.set(p.name, p.pieceKey);
  }
  return {
    nameOf: (key) => n.get(key) ?? key,
    keyOf: (name) => {
      const v = k.get(name);
      return v === '!dup' ? undefined : v;
    },
  };
}
/** 'BP#3+4' in names → '<key>#3+4'. */
const toKeyId = (N: Names, id: string, card: string) => {
  const at = id.lastIndexOf('#');
  const key = N.keyOf(id.slice(0, at));
  if (!key) throw new Error(`${card}: no (unique) piece named «${id.slice(0, at)}»`);
  return `${key}${id.slice(at)}`;
};
const nmId = (N: Names, id: string) => `${N.nameOf(pk(id))}#${kOf(id)}`;

// ── truth spec rows → StoredSeam rows (the gold format) ────────────────────────────────────────
const sideParts = (x: string | string[]) =>
  (Array.isArray(x) ? x : [x]).map((p) => {
    const [id, r] = p.split('@');
    const m = r ? /^([\d.]+)-([\d.]+)$/.exec(r) : null;
    return { id, range: m ? ([Number(m[1]), Number(m[2])] as [number, number]) : null };
  });

function candidateOf(
  g: TruthSeam,
  N: Names,
  card: string,
  pieces: readonly PieceGeom[],
): SeamCandidate {
  const A = sideParts(g.a!).map((p) => toKeyId(N, p.id, card));
  const B = sideParts(g.b!).map((p) => toKeyId(N, p.id, card));
  const lenOf = (id: string) =>
    edgeIdsOf(id).reduce(
      (t, e) =>
        t + (pieces.find((p) => p.pieceKey === pk(e))?.edges.find((x) => x.id === e)?.lenMm ?? NaN),
      0,
    );
  const la = A.reduce((t, id) => t + lenOf(id), 0);
  const lb = B.reduce((t, id) => t + lenOf(id), 0);
  const kind: SeamCandidate['kind'] =
    g.kind === 'closure'
      ? 'closure-not-seam'
      : A.length > 1 || B.length > 1
        ? 'composite'
        : g.kind ?? 'edge';
  return {
    a: A[0],
    b: B[0],
    ...(A.length > 1 ? { aParts: A } : {}),
    ...(B.length > 1 ? { bParts: B } : {}),
    score: 1,
    kind,
    evidence: {
      dLenMm: Math.abs(la - lb),
      relLen: Math.abs(la - lb) / Math.max(la, lb, 1),
      notchScore: null,
      curvature: 'flat',
      hand: 'neutral',
      twin: 'none',
      self: false,
      rule: 'truth fixture',
      aLenMm: la,
      bLenMm: lb,
    },
    ...(g.rangeMm ? { range: g.rangeMm } : {}),
  };
}

type PatternRow = { a: string; b: string; count: number; self?: boolean };
type TruthRow = {
  derivation: string;
  confidence: Confidence;
  cls: string;
  bucket: Bucket;
  anyOf?: string;
  /** An anchored row (edges of the segmentation it was written on). */
  row?: StoredSeam;
  /** Else a pattern over `name#k` edge ids of interchangeable identical panels. */
  pattern?: PatternRow;
  /** Pattern rows: the status (rows are sewn unless rejected). */
  status: 'confirmed' | 'rejected';
  kind: 'seam' | 'closure';
};
type TruthFile = {
  _note: string;
  card: string;
  size: string;
  summary: string;
  rows: TruthRow[];
};

function buildTruth(card: string, L: Loaded, graph: SeamGraph, N: Names): TruthFile {
  const T = TRUTH[card];
  if (!T) throw new Error(`${card}: no truth spec`);
  const grain = grainDegOf(L.facts);
  const rows: TruthRow[] = [];
  const allEdgeNames = graph.pieces.flatMap((p) => p.edges.map((e) => `${p.name}#${e.k}`));
  T.seams.forEach((g, i) => {
    const base = {
      derivation: g.why,
      confidence: g.confidence ?? 'sure',
      cls: g.cls,
      bucket: g.bucket ?? 'main',
      ...(g.anyOf ? { anyOf: g.anyOf } : {}),
      status: g.status ?? 'confirmed',
      kind: g.kind === 'closure' ? 'closure' : 'seam',
    } as const;
    if (g.pattern) {
      const ra = new RegExp(g.pattern.a);
      const rb = new RegExp(g.pattern.b);
      const na = allEdgeNames.filter((e) => ra.test(e)).length;
      const nb = allEdgeNames.filter((e) => rb.test(e)).length;
      if (na < g.pattern.count || nb < g.pattern.count)
        throw new Error(
          `${card} truth row ${i + 1}: pattern matches ${na} / ${nb} edges, needs ${g.pattern.count}`,
        );
      rows.push({ ...base, pattern: g.pattern });
      return;
    }
    if (!g.a || !g.b) throw new Error(`${card} truth row ${i + 1}: no sides and no pattern`);
    for (const p of [...sideParts(g.a), ...sideParts(g.b)]) {
      const id = toKeyId(N, p.id, card);
      for (const e of edgeIdsOf(id))
        if (!graph.pieces.some((q) => q.edges.some((x) => x.id === e)))
          throw new Error(
            `${card} truth row ${i + 1}: edge ${p.id} is not on today's segmentation`,
          );
    }
    const c = candidateOf(g, N, card, graph.pieces);
    const row = seamFromCandidate(c, graph.pieces, {
      seamKey: truthKey(card, i),
      status: g.status ?? 'confirmed',
      source: 'manual',
      anchoredSize: L.size,
      note: g.why,
      by: 'truth fixture (metrics)',
      at: '2026-10-11T00:00:00Z',
      grainDeg: grain,
    });
    if (!row) throw new Error(`${card} truth row ${i + 1}: no anchor for ${g.a} ↔ ${g.b}`);
    // A closure over part of an edge (the fly): seamFromCandidate keeps ranges for partials only.
    if (g.rangeMm && g.kind !== 'partial') {
      row.sideA[0].range = [
        Math.round((g.rangeMm.a[0] / row.sideA[0].lenMm) * 10000) / 10000,
        Math.round((g.rangeMm.a[1] / row.sideA[0].lenMm) * 10000) / 10000,
      ];
      row.sideB[0].range = [
        Math.round((g.rangeMm.b[0] / row.sideB[0].lenMm) * 10000) / 10000,
        Math.round((g.rangeMm.b[1] / row.sideB[0].lenMm) * 10000) / 10000,
      ];
    }
    for (const [side, sp] of [
      [row.sideA, g.a],
      [row.sideB, g.b],
    ] as const)
      sideParts(sp).forEach((p, k) => {
        if (!p.range) return;
        const an = side[k];
        an.range = [
          Math.round((p.range[0] / an.lenMm) * 10000) / 10000,
          Math.round((p.range[1] / an.lenMm) * 10000) / 10000,
        ];
      });
    rows.push({ ...base, row });
  });
  const anchored = rows.filter((r) => r.row).map((r) => r.row!);
  const r = resolveSeamDecisions(anchored, graph.pieces, { grainDeg: grain, nameOf: N.nameOf });
  if (r.stale.length || r.orphan.length)
    throw new Error(
      `${card}: truth rows do not resolve back: ${[...r.stale, ...r.orphan].map((x) => x.words).join(' | ')}`,
    );
  return {
    _note:
      'TRUTH seam list for the seam-inference MEASUREMENT (yarn seams:score) — TEST DATA, not product data. Every seam physically sewn on this card at the size the live app reads, as StoredSeam rows (lib/seams anchors; resolvable on a new segmentation) or as patterns over interchangeable identical panels; rejected rows = pairs the engine tends to sew that are NOT sewn; closures = openings. `derivation` says how each row was found (the technologist’s order + the geometry + the notches), `confidence` sure / likely / unsure, `cls` the seam class the error tables are grouped by, `bucket` main / ply / lining, `anyOf` groups alternative readings of one seam. Built by `yarn seams:score build` from scripts/seams-score/truth/specs.ts; checked by eye on <metrics>/truth/<id>-flat-edges.png.',
    card,
    size: L.size,
    summary: T.summary,
    rows,
  };
}

// ── sewn stretches on the contour ──────────────────────────────────────────────────────────────
/** [piece, from, to] in mm along the piece's resampled ring (to may exceed the perimeter: wraps). */
type Stretch = { piece: string; from: number; to: number };
type Ring = { cum: number[]; perim: number };
function ringOf(p: PieceGeom): Ring {
  const cum: number[] = [0];
  for (let i = 1; i <= p.rs.length; i++) {
    const a = p.rs[i - 1];
    const b = p.rs[i % p.rs.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return { cum, perim: cum[p.rs.length] };
}
class Geo {
  rings = new Map<string, Ring>();
  edges = new Map<string, Edge>();
  pieces = new Map<string, PieceGeom>();
  constructor(pieces: readonly PieceGeom[]) {
    for (const p of pieces) {
      this.pieces.set(p.pieceKey, p);
      this.rings.set(p.pieceKey, ringOf(p));
      for (const e of p.edges) this.edges.set(e.id, e);
    }
  }
  edgeStretch(id: string): Stretch | null {
    const e = this.edges.get(id);
    const r = e && this.rings.get(e.pieceKey);
    if (!e || !r) return null;
    const n = r.cum.length - 1;
    const from = r.cum[((e.s % n) + n) % n];
    let to = r.cum[((e.e % n) + n) % n];
    if (to <= from) to += r.perim;
    return { piece: e.pieceKey, from, to };
  }
  /** A run (edge ids in walk order) with a sewn share range → stretches. */
  run(ids: string[], range: [number, number] = [0, 1]): Stretch[] {
    const parts = ids.map((id) => this.edgeStretch(id)).filter((x): x is Stretch => !!x);
    const total = parts.reduce((t, s) => t + (s.to - s.from), 0);
    if (!total) return [];
    const lo = range[0] * total;
    const hi = range[1] * total;
    const out: Stretch[] = [];
    let at = 0;
    for (const s of parts) {
      const len = s.to - s.from;
      const a = Math.max(lo, at);
      const b = Math.min(hi, at + len);
      if (b > a + 1e-6)
        out.push({ piece: s.piece, from: s.from + (a - at), to: s.from + (b - at) });
      at += len;
    }
    return out;
  }
  /** Split wrapped stretches into plain [from, to] within [0, perim). */
  flat(ss: Stretch[]): Stretch[] {
    const out: Stretch[] = [];
    for (const s of ss) {
      const P = this.rings.get(s.piece)?.perim ?? Infinity;
      let { from, to } = s;
      while (from >= P) {
        from -= P;
        to -= P;
      }
      if (to <= P) out.push({ piece: s.piece, from, to });
      else out.push({ piece: s.piece, from, to: P }, { piece: s.piece, from: 0, to: to - P });
    }
    return out;
  }
}
const lenOf = (ss: Stretch[]) => ss.reduce((t, s) => t + (s.to - s.from), 0);
/** Union of stretches: merged, disjoint, per piece. */
function merge(ss: Stretch[]): Stretch[] {
  const byPiece = new Map<string, Stretch[]>();
  for (const c of ss) byPiece.set(c.piece, [...(byPiece.get(c.piece) ?? []), c]);
  const out: Stretch[] = [];
  for (const list of byPiece.values()) {
    list.sort((u, v) => u.from - v.from);
    let cur: Stretch | null = null;
    for (const s of list) {
      if (cur && s.from <= cur.to + 1e-6) cur.to = Math.max(cur.to, s.to);
      else {
        if (cur) out.push(cur);
        cur = { ...s };
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}
/** Overlap length of A with B (B disjoint for exact numbers). */
function overlap(A: Stretch[], B: Stretch[]): number {
  let t = 0;
  for (const a of A)
    for (const b of B) {
      if (a.piece !== b.piece) continue;
      const o = Math.min(a.to, b.to) - Math.max(a.from, b.from);
      if (o > 0) t += o;
    }
  return t;
}
const clip = (A: Stretch[], B: Stretch[]): Stretch[] => {
  const out: Stretch[] = [];
  for (const a of A)
    for (const b of B) {
      if (a.piece !== b.piece) continue;
      const from = Math.max(a.from, b.from);
      const to = Math.min(a.to, b.to);
      if (to > from) out.push({ piece: a.piece, from, to });
    }
  return out;
};

/** A seam as two sets of sewn stretches, with words. */
type Sewn = {
  id: string;
  a: Stretch[];
  b: Stretch[];
  words: string;
  aIds: string[];
  bIds: string[];
  state?: string;
  origin?: string;
  kind: string;
  note?: string;
};

function candidateSewn(c: SeamCandidate, G: Geo, N: Names): Sewn {
  const A = (c.aParts ?? [c.a]).flatMap(edgeIdsOf);
  const B = (c.bParts ?? [c.b]).flatMap(edgeIdsOf);
  const side = (ids: string[], rng?: [number, number]) => {
    // A stored partial: `range` is mm along the run from its start.
    if (rng && ids.length) {
      const total = ids.reduce((t, id) => t + (G.edges.get(id)?.lenMm ?? 0), 0);
      return G.flat(G.run(ids, [rng[0] / total, rng[1] / total]));
    }
    const parts = ids.flatMap((id) => {
      const pr = c.partRange?.[id];
      if (pr) {
        const L = G.edges.get(id)?.lenMm ?? 1;
        return G.run([id], [pr[0] / L, pr[1] / L]);
      }
      return G.run([id]);
    });
    return G.flat(parts);
  };
  return {
    id: `${c.a}~${c.b}`,
    a: side(A, c.range?.a),
    b: side(B, c.range?.b),
    aIds: A,
    bIds: B,
    kind: c.kind,
    words: `${A.map((x) => nmId(N, x)).join('+')} ↔ ${B.map((x) => nmId(N, x)).join('+')}`,
  };
}
function dollSewn(s: DollReport['seams'][number], G: Geo, N: Names): Sewn {
  const A = s.a.flatMap(edgeIdsOf);
  const B = s.b.flatMap(edgeIdsOf);
  // (a composite whose end parts are sewn over a stretch: that stretch, as candidateSewn reads it)
  const run = (id: string) => {
    const pr = s.partRange?.[id];
    if (!pr) return G.run([id]);
    const L = G.edges.get(id)?.lenMm ?? 1;
    return G.run([id], [pr[0] / L, pr[1] / L]);
  };
  return {
    id: s.id,
    a: G.flat(A.flatMap(run)),
    b: G.flat(B.flatMap(run)),
    aIds: A,
    bIds: B,
    kind: String(s.kind),
    state: s.state,
    origin: s.origin,
    note: s.note,
    words: `${A.map((x) => nmId(N, x)).join('+') || '∅'} ↔ ${B.map((x) => nmId(N, x)).join('+') || '∅'}`,
  };
}
function appliedSewn(
  ap: AppliedRow,
  G: Geo,
): { a: Stretch[]; b: Stretch[]; aIds: string[]; bIds: string[] } {
  const side = (hits: AppliedRow['a']) =>
    G.flat(hits.flatMap((h) => G.run(h.edges, h.anchor.range)));
  return {
    a: side(ap.a),
    b: side(ap.b),
    aIds: ap.a.flatMap((h) => h.edges),
    bIds: ap.b.flatMap((h) => h.edges),
  };
}

// ── scoring ───────────────────────────────────────────────────────────────────────────────────
const COVER = 0.7;
type TruthSewn = {
  i: number;
  row: TruthRow;
  a: Stretch[];
  b: Stretch[];
  aIds: string[];
  bIds: string[];
  words: string;
};
type TruthPattern = { i: number; row: TruthRow; ra: RegExp; rb: RegExp; words: string };

type Verdict = {
  /** Truth groups (anyOf collapsed, patterns by count) of the main bucket. */
  rows: number;
  found: number;
  /** Predictions matched to main rows / not matched to anything (wrong seams). */
  tpPreds: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  sure: { rows: number; found: number; recall: number };
  ply: { rows: number; found: number; preds: number };
  lining: { rows: number; found: number; preds: number };
  closuresDrawn: number;
  fps: { words: string; cls: string; detail: string }[];
  fns: { words: string; cls: string; confidence: Confidence; detail: string }[];
  tps: { words: string; by: string[] }[];
};

/** How much of P lies inside T (per side, best orientation) and the overlaps. */
function fit(P: { a: Stretch[]; b: Stretch[] }, T: { a: Stretch[]; b: Stretch[] }) {
  const o = (x: Stretch[], y: Stretch[]) => overlap(x, merge(y));
  const straight = [o(P.a, T.a), o(P.b, T.b)];
  const swapped = [o(P.a, T.b), o(P.b, T.a)];
  const s1 = straight[0] + straight[1];
  const s2 = swapped[0] + swapped[1];
  const [oa, ob] = s1 >= s2 ? straight : swapped;
  const la = lenOf(P.a) || 1;
  const lb = lenOf(P.b) || 1;
  return { insideA: oa / la, insideB: ob / lb, swapped: s2 > s1, oa, ob };
}

type Group = {
  key: string;
  rows: (TruthSewn | TruthPattern)[];
  bucket: Bucket;
  confidence: Confidence;
  cls: string;
  words: string;
  derivation: string;
  /** Pattern groups count `count` seams; others 1. */
  count: number;
};

function score(
  preds: Sewn[],
  layerPreds: Sewn[],
  truths: TruthSewn[],
  patterns: TruthPattern[],
  G: Geo,
  N: Names,
): Verdict {
  const sewnT = truths.filter((t) => t.row.status === 'confirmed' && t.row.kind !== 'closure');
  const notSewnT = truths.filter((t) => t.row.status === 'rejected');
  const closureT = truths.filter((t) => t.row.status === 'confirmed' && t.row.kind === 'closure');
  // everything the truth sews or closes, one disjoint set
  const U = merge([...sewnT, ...closureT].flatMap((t) => [...t.a, ...t.b]));
  const soundOf = (p: Sewn) => {
    const ia = lenOf(p.a) ? overlap(p.a, U) / lenOf(p.a) : 0;
    const ib = lenOf(p.b) ? overlap(p.b, U) / lenOf(p.b) : 0;
    return ia >= COVER && ib >= COVER;
  };
  const sound = new Set(preds.filter(soundOf));
  const matched = new Map<Sewn, Bucket | 'closure'>();

  // ── anchored rows: contributors → coverage ──
  const foundRow = new Set<TruthSewn | TruthPattern>();
  const contributorsOf = new Map<TruthSewn, Sewn[]>();
  for (const t of sewnT) {
    const pool = t.row.bucket === 'ply' ? [...preds, ...layerPreds] : preds;
    const ps = pool.filter((p) => {
      if (!(sound.has(p) || layerPreds.includes(p))) return false;
      const f = fit(p, t);
      const minA = Math.min(10, 0.3 * lenOf(t.a));
      const minB = Math.min(10, 0.3 * lenOf(t.b));
      return f.oa >= minA && f.ob >= minB;
    });
    contributorsOf.set(t, ps);
    if (!ps.length) continue;
    const covA = lenOf(
      merge(
        clip(
          ps.flatMap((p) => [...p.a, ...p.b]),
          t.a,
        ),
      ),
    );
    const covB = lenOf(
      merge(
        clip(
          ps.flatMap((p) => [...p.a, ...p.b]),
          t.b,
        ),
      ),
    );
    if (covA / lenOf(t.a) >= COVER && covB / lenOf(t.b) >= COVER) {
      foundRow.add(t);
      for (const p of ps) if (!matched.has(p)) matched.set(p, t.row.bucket);
    }
  }
  // ── closures: a prediction drawn shut on an opening is neutral ──
  for (const p of preds) {
    if (matched.has(p)) continue;
    for (const t of closureT) {
      const f = fit(p, t);
      if (f.insideA >= COVER && f.insideB >= COVER) {
        matched.set(p, 'closure');
        break;
      }
    }
  }
  // ── pattern rows: interchangeable identical panels, by count ──
  const patternHits = new Map<TruthPattern, Sewn[]>();
  for (const t of patterns) {
    const hits: Sewn[] = [];
    for (const p of preds) {
      if (matched.has(p) || hits.includes(p)) continue;
      if (!p.aIds.length || !p.bIds.length) continue;
      const na = p.aIds.map((x) => nmId(N, x));
      const nb = p.bIds.map((x) => nmId(N, x));
      const m =
        (na.every((x) => t.ra.test(x)) && nb.every((x) => t.rb.test(x))) ||
        (na.every((x) => t.rb.test(x)) && nb.every((x) => t.ra.test(x)));
      if (!m) continue;
      const pa = new Set(p.aIds.map(pk));
      const pb = new Set(p.bIds.map(pk));
      const selfPair = [...pa].some((k) => pb.has(k));
      if (selfPair && !t.row.pattern!.self) continue;
      hits.push(p);
    }
    const take = hits.slice(0, t.row.pattern!.count);
    for (const p of take) matched.set(p, t.row.bucket);
    patternHits.set(t, take);
    if (take.length) foundRow.add(t);
  }

  // ── groups ──
  const groups = new Map<string, Group>();
  for (const t of [...sewnT, ...patterns]) {
    const key = t.row.anyOf ? `anyOf:${t.row.anyOf}` : `row:${t.i}`;
    const g = groups.get(key);
    if (g) g.rows.push(t);
    else
      groups.set(key, {
        key,
        rows: [t],
        bucket: t.row.bucket,
        confidence: t.row.confidence,
        cls: t.row.cls,
        words: t.words,
        derivation: t.row.derivation,
        count: t.row.pattern?.count ?? 1,
      });
  }
  const groupFound = (g: Group) => {
    if (g.rows[0].row.pattern) {
      const t = g.rows[0] as TruthPattern;
      return patternHits.get(t)?.length ?? 0;
    }
    return g.rows.some((r) => foundRow.has(r)) ? 1 : 0;
  };
  const tps: Verdict['tps'] = [];
  const fns: Verdict['fns'] = [];
  const bucketCount = { main: [0, 0], ply: [0, 0], lining: [0, 0] } as Record<
    Bucket,
    [number, number]
  >;
  let sureRows = 0;
  let sureFound = 0;
  for (const g of groups.values()) {
    const f = groupFound(g);
    bucketCount[g.bucket][0] += g.count;
    bucketCount[g.bucket][1] += f;
    if (g.bucket !== 'main') continue;
    if (g.confidence === 'sure') {
      sureRows += g.count;
      sureFound += f;
    }
    if (f >= g.count) {
      const by = g.rows.flatMap((r) =>
        r.row.pattern
          ? (patternHits.get(r as TruthPattern) ?? []).map((p) => p.words)
          : (contributorsOf.get(r as TruthSewn) ?? []).map((p) => p.words),
      );
      tps.push({ words: g.words, by });
      continue;
    }
    // missed (or partly, for patterns)
    const main = g.rows[0];
    let detail = g.derivation.slice(0, 160);
    if (main.row.pattern) detail += ` — ${f} of ${g.count} found`;
    else {
      const t = main as TruthSewn;
      const ps = contributorsOf.get(t) ?? [];
      if (ps.length) {
        const covA =
          lenOf(
            merge(
              clip(
                ps.flatMap((p) => [...p.a, ...p.b]),
                t.a,
              ),
            ),
          ) / lenOf(t.a);
        const covB =
          lenOf(
            merge(
              clip(
                ps.flatMap((p) => [...p.a, ...p.b]),
                t.b,
              ),
            ),
          ) / lenOf(t.b);
        detail += ` — only ${pct(Math.min(covA, covB))} covered by ${ps.map((p) => p.words).join(', ')}`;
      }
      const near = preds
        .filter((p) => !ps.includes(p))
        .map((p) => ({ p, f: fit(p, t) }))
        .filter((x) => x.f.oa + x.f.ob > 0)
        .sort((x, y) => y.f.oa + y.f.ob - (x.f.oa + x.f.ob))
        .slice(0, 2)
        .map((x) => x.p.words);
      if (near.length) detail += ` · instead: ${near.join('; ')}`;
    }
    fns.push({ words: g.words, cls: g.cls, confidence: g.confidence, detail });
    if (main.row.pattern) {
      // a partly found pattern still counts the found part as TP rows
    }
  }
  // ── the rest are wrong seams, classified ──
  const fps: Verdict['fps'] = [];
  for (const p of preds) {
    if (matched.has(p)) continue;
    fps.push({ words: p.words, ...classify(p, sewnT, notSewnT, closureT, G, N) });
  }
  const tpPreds = [...matched.entries()].filter(([, b]) => b === 'main').length;
  const fp = fps.length;
  const [rows, found] = bucketCount.main;
  const fn = rows - found;
  return {
    rows,
    found,
    tpPreds,
    fp,
    fn,
    precision: tpPreds + fp ? tpPreds / (tpPreds + fp) : 1,
    recall: rows ? found / rows : 1,
    sure: { rows: sureRows, found: sureFound, recall: sureRows ? sureFound / sureRows : 1 },
    ply: {
      rows: bucketCount.ply[0],
      found: bucketCount.ply[1],
      preds: [...matched.values()].filter((b) => b === 'ply').length,
    },
    lining: {
      rows: bucketCount.lining[0],
      found: bucketCount.lining[1],
      preds: [...matched.values()].filter((b) => b === 'lining').length,
    },
    closuresDrawn: [...matched.values()].filter((b) => b === 'closure').length,
    fps,
    fns,
    tps,
  };
}

const POCKETISH = /pck|pocket|ins_|locker|flap|flp|_fl\b|^fl(_|$)/i;
const STRAPISH = /^blt|belt|brdr/i;
function classify(
  p: Sewn,
  sewn: TruthSewn[],
  notSewn: TruthSewn[],
  closures: TruthSewn[],
  G: Geo,
  N: Names,
): { cls: string; detail: string } {
  const inside = (t: TruthSewn) => {
    const f = fit(p, t);
    return Math.min(f.insideA, f.insideB);
  };
  for (const t of notSewn)
    if (inside(t) >= COVER)
      return { cls: `not sewn: ${t.row.cls}`, detail: t.row.derivation.slice(0, 140) };
  for (const t of closures)
    if (inside(t) >= COVER)
      return { cls: 'closure sewn as a seam', detail: t.row.derivation.slice(0, 140) };
  const pa = [...new Set(p.aIds.map(pk))];
  const pb = [...new Set(p.bIds.map(pk))];
  if (pa.length === 1 && pb.length === 1 && pa[0] === pb[0])
    return { cls: 'self pairing', detail: 'both sides on one piece, not a truth seam' };
  const piece = (k: string) => G.pieces.get(k);
  const twins = (x: string, y: string) =>
    piece(x)?.twinOf.some((t) => t.key === y) || piece(y)?.twinOf.some((t) => t.key === x);
  const twinKind = (x: string, y: string) =>
    piece(x)?.twinOf.find((t) => t.key === y)?.kind ??
    piece(y)?.twinOf.find((t) => t.key === x)?.kind;
  const mirrorPair = pa.every((x) => pb.some((y) => twins(x, y)));
  const identicalPair =
    mirrorPair && pa.every((x) => pb.some((y) => twinKind(x, y) === 'identical'));
  // one side right, the other on the twin of the true partner (a crossed shoulder)
  for (const t of sewn) {
    const f = fit(p, t);
    const sideOk = f.insideA >= COVER || f.insideB >= COVER;
    if (!sideOk) continue;
    const okIsA = f.insideA >= f.insideB;
    const wrongPieces = okIsA ? pb : pa;
    const truePartner = [
      ...new Set((f.swapped ? (okIsA ? t.aIds : t.bIds) : okIsA ? t.bIds : t.aIds).map(pk)),
    ];
    const onTwin =
      wrongPieces.length && wrongPieces.every((w) => truePartner.some((q) => twins(w, q)));
    if (onTwin)
      return {
        cls: `twin swap: ${t.row.cls}`,
        detail: `one side is the true ${t.row.cls} edge; its partner sits on the MIRROR / twin piece of the true one — truth ${t.words}`,
      };
    const samePieces = wrongPieces.every((w) => truePartner.includes(w));
    if (samePieces)
      return {
        cls: `wrong edge: ${t.row.cls}`,
        detail: `right pieces, wrong edge on ${wrongPieces.map((w) => N.nameOf(w)).join('+')} — truth ${t.words}`,
      };
    return {
      cls: `wrong partner: ${t.row.cls}`,
      detail: `one side is the true ${t.row.cls} edge, sewn to ${wrongPieces.map((w) => N.nameOf(w)).join('+')} instead — truth ${t.words}`,
    };
  }
  const names = [...pa, ...pb].map((k) => N.nameOf(k));
  if (identicalPair)
    return {
      cls: 'identical panels paired outside the truth',
      detail:
        'two identical cut pieces sewn to each other where the truth has no such seam (a ply to its ply off the bagging edges, a panel of one ring to the other ring)',
    };
  if (mirrorPair)
    return {
      cls: 'mirror pairing L↔R',
      detail: 'a piece sewn to its mirror twin, no truth row on either edge',
    };
  let bestT: TruthSewn | null = null;
  let bestO = 0;
  for (const t of sewn) {
    const f = fit(p, t);
    if (f.oa + f.ob > bestO) {
      bestO = f.oa + f.ob;
      bestT = t;
    }
  }
  if (bestT && bestO > 0) {
    const f = fit(p, bestT);
    return {
      cls: `overreach: ${bestT.row.cls}`,
      detail: `touches truth ${bestT.words} but runs past it (inside ${pct(f.insideA)} / ${pct(f.insideB)})`,
    };
  }
  if (names.every((n) => STRAPISH.test(n)))
    return { cls: 'spurious: strap ↔ strap', detail: 'belt / strap pieces paired, no truth row' };
  if (names.some((n) => POCKETISH.test(n)))
    return {
      cls: 'spurious: pocket / flap / fly piece',
      detail: 'a pocket, flap or fly part paired edge to edge, no truth row',
    };
  return { cls: 'spurious: other', detail: 'neither side is on a sewn truth stretch' };
}

// ── per card ──────────────────────────────────────────────────────────────────────────────────
type CardOut = {
  id: string;
  label: string;
  size: string;
  pieces: number;
  truth: {
    rows: number;
    main: number;
    sure: number;
    likely: number;
    unsure: number;
    ply: number;
    lining: number;
    notSewn: number;
    closures: number;
    unresolved: string[];
  };
  graph: Verdict;
  doll: Verdict;
  /** The same two readings with the operation-driven global assignment. */
  graphG: Verdict;
  dollG: Verdict;
  dollStates: Record<string, number>;
  notSewnByDoll: string[];
  ms: { graph: number; doll: number; graphG: number; dollG: number; assign: number };
  assignment?: SeamGraph['assignment'];
};

const outCards: CardOut[] = [];
for (const c of spec.cards) {
  const L = await loadCard(c);
  if (!L) {
    console.log(`${c.id}: no input (${c.req ?? c.dxf})`);
    continue;
  }
  const N = namesOf(L.facts);
  const t0 = performance.now();
  const graph = await quiet(() => readSeamGraph(L.facts));
  const msGraph = performance.now() - t0;
  const G = new Geo(graph.pieces);
  const grain = grainDegOf(L.facts);
  // The same facts assigned by the global solver over the card's order (SCORE_NO_ORDER=1: without
  // the order — the proposal's case, a card whose steps are not written yet).
  const noOrder = process.env.SCORE_NO_ORDER === '1';
  const assign = {
    mode: 'global' as const,
    joins: noOrder ? [] : L.options.joins ?? [],
    ...(L.options.hardware && !noOrder ? { hardware: L.options.hardware } : {}),
  };
  const tg0 = performance.now();
  const graphG = await quiet(() =>
    readSeamGraph(L.facts, undefined, undefined, undefined, undefined, assign),
  );
  const msGraphG = performance.now() - tg0;
  const msAssign = graphG.assignment?.ms ?? 0;

  if (mode === 'build') {
    if (!TRUTH[c.id]) {
      console.log(`${c.id}: no truth spec`);
      continue;
    }
    let file: TruthFile;
    try {
      file = buildTruth(c.id, L, graph, N);
    } catch (e) {
      console.log(`${c.id}: BUILD FAILED — ${(e as Error).message}`);
      process.exitCode = 1;
      continue;
    }
    await writeFile(`${truthDir}/${c.id}.seams.json`, JSON.stringify(file, null, 1) + '\n');
    const n = (f: (r: TruthRow) => boolean) => file.rows.filter(f).length;
    console.log(
      `${c.id}: ${file.rows.length} truth rows (main ${n((r) => r.bucket === 'main' && r.status === 'confirmed' && r.kind === 'seam')}, ply ${n((r) => r.bucket === 'ply')}, lining ${n((r) => r.bucket === 'lining')}, not-sewn ${n((r) => r.status === 'rejected')}, closures ${n((r) => r.kind === 'closure')}; sure ${n((r) => r.confidence === 'sure')} / likely ${n((r) => r.confidence === 'likely')} / unsure ${n((r) => r.confidence === 'unsure')}) → ${truthDir}/${c.id}.seams.json`,
    );
    continue;
  }

  // the doll (b)
  const anchors = L.anchors.map((a) => ({
    size: a.size,
    pieces: segmentAll(a.facts),
    grainDeg: grainDegOf(a.facts),
  }));
  const seamsOpt = L.options.seams;
  const t1 = performance.now();
  const report = await quiet(() =>
    solveDoll({
      graph,
      facts: L.facts,
      options: {
        ...L.options,
        onFrame: undefined,
        onMesh: undefined,
        ...(seamsOpt
          ? { seams: { ...seamsOpt, sizes: [...(seamsOpt.sizes ?? []), ...anchors] } }
          : {}),
      },
    }),
  );
  const msDoll = performance.now() - t1;
  const t2 = performance.now();
  const reportG = await quiet(() =>
    solveDoll({
      graph: graphG,
      facts: L.facts,
      options: {
        ...L.options,
        onFrame: undefined,
        onMesh: undefined,
        assignment: assign,
        ...(seamsOpt
          ? { seams: { ...seamsOpt, sizes: [...(seamsOpt.sizes ?? []), ...anchors] } }
          : {}),
      },
    }),
  );
  const msDollG = performance.now() - t2;
  const seamsOfReport = (rep: DollReport) => {
    const notSewnIds = new Set((rep.notSewn ?? []).map((x) => x.id));
    const isSeam = (s: DollReport['seams'][number]) =>
      !notSewnIds.has(s.id) &&
      s.kind !== 'facing-free' &&
      s.kind !== 'closure-not-seam' &&
      s.kind !== 'proposed-closure' &&
      s.kind !== 'surface' &&
      (s.a.length || s.b.length);
    return {
      seams: rep.seams.filter((s) => s.origin !== 'layer' && isSeam(s)),
      layer: rep.seams.filter((s) => s.origin === 'layer' && isSeam(s)),
    };
  };
  const { seams: dollSeams, layer: dollLayer } = seamsOfReport(report);
  const { seams: dollSeamsG, layer: dollLayerG } = seamsOfReport(reportG);
  const graphPreds = graph.chosen
    .filter((x) => x.kind !== 'surface')
    .map((x) => candidateSewn(x, G, N));
  const graphPredsG = graphG.chosen
    .filter((x) => x.kind !== 'surface')
    .map((x) => candidateSewn(x, G, N));
  const dollPreds = dollSeams.map((s) => dollSewn(s, G, N));
  const dollLayerPreds = dollLayer.map((s) => dollSewn(s, G, N));
  const dollPredsG = dollSeamsG.map((s) => dollSewn(s, G, N));
  const dollLayerPredsG = dollLayerG.map((s) => dollSewn(s, G, N));

  if (mode === 'edges') {
    console.log(
      `=== ${c.id} · ${c.label} · size ${L.size} · category ${L.facts.category} · ${graph.pieces.length} pieces`,
    );
    const fact = new Map(L.facts.pieces.map((p) => [p.pieceKey, p]));
    for (const p of [...graph.pieces].sort((a, b) => a.name.localeCompare(b.name))) {
      const xs = p.rs.map((q) => q[0]);
      const ys = p.rs.map((q) => q[1]);
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      const w = Math.max(...xs) - x0;
      const h = Math.max(...ys) - y0;
      const uv = (q: [number, number]) =>
        `${((q[0] - x0) / (w || 1)).toFixed(2)},${((q[1] - y0) / (h || 1)).toFixed(2)}`;
      const marks = (p.marks ?? []).filter((m) => m.kind === 'drill' || m.kind === 'buttonhole');
      const mk = (id: string) => {
        const on = marks.filter((m) => m.nearEdge?.edge === id);
        return on.length
          ? ` marks ${on.length}@${on.map((m) => m.nearEdge!.offsetMm.toFixed(0)).join('/')}mm`
          : '';
      };
      const vees = (p.marks ?? []).filter((m) => m.kind === 'vee');
      const f = fact.get(p.pieceKey);
      console.log(
        `${p.name} hand=${p.hand ?? '-'} ×${f?.piecesPerGarment ?? '?'} ${String(f?.cutSymmetry ?? '').replace(/^TECH_CARD_PIECE_CUT_SYMMETRY_/, '')} cloth=${p.cloth ?? '-'} ${w.toFixed(0)}x${h.toFixed(0)} perim ${p.perimMm.toFixed(0)} twins=${p.twinOf.map((t) => `${N.nameOf(t.key)}/${t.kind}`).join(',') || '-'}${vees.length ? ` vees ${vees.map((v) => `${v.vee?.edge ? nmId(N, v.vee.edge) : '?'}:${v.vee?.intakeMm.toFixed(0)}`).join(',')}` : ''}`,
      );
      for (const e of p.edges)
        console.log(
          `  #${String(e.k).padEnd(3)} ${e.lenMm.toFixed(0).padStart(5)} n${e.notchesMm.length}${e.notchesMm.length ? `[${e.notchesMm.map((x) => x.toFixed(0)).join(',')}]` : ''} ${uv(e.pts[0])} → ${uv(e.pts[e.pts.length - 1])} turn ${e.turnDeg.toFixed(0)}${mk(e.id)}`,
        );
    }
    console.log('--- joins (the technologist’s order):');
    for (const j of L.options.joins ?? [])
      console.log(
        `  «${j.label}»: ${j.parts.map((x) => x.map((k) => N.nameOf(k)).join('+')).join(' | ')}`,
      );
    if (L.options.hardware?.length)
      console.log(
        `  hardware: ${L.options.hardware.map((h) => `${h.label} (${h.pieces.map((k) => N.nameOf(k)).join('+')})`).join('; ')}`,
      );
    console.log('--- engine seams (graph.chosen):');
    for (const p of graphPreds) console.log(`  ${p.kind.padEnd(9)} ${p.words}`);
    for (const x of graph.rejected.filter((q) => q.kind === 'closure-not-seam'))
      console.log(`  CLOSURE   ${nmId(N, x.a)} ↔ ${nmId(N, x.b)}`);
    console.log('--- engine seams, GLOBAL assignment (graph.chosen):');
    for (const c of graphG.chosen.filter((x) => x.kind !== 'surface'))
      console.log(
        `  ${c.kind.padEnd(9)} ${candidateSewn(c, G, N).words}${c.operationId ? ` · ${c.operationId}` : ''}${c.assignment ? ` · ${c.assignment.confidence} (margin ${c.assignment.margin})` : ''}`,
      );
    for (const w of graphG.assignment?.words ?? []) console.log(`  · ${w}`);
    for (const w of graphG.warnings.filter((x) => x.startsWith('debug '))) console.log(`  ${w}`);
    for (const o of graphG.assignment?.operations ?? [])
      console.log(
        `  op ${o.id} «${o.label.slice(0, 50)}»: ${o.inputs} inputs · ${o.seams} seams · ${o.connected ? 'joined' : 'APART'} · ${o.exact ? 'exact' : 'budget'} · ${o.nodes} nodes · ${o.ms} ms`,
      );
    console.log('--- doll seams:');
    // (DOLL_WARN=1: the doll's own words — the shape it chose, what it placed where)
    if (process.env.DOLL_WARN) {
      for (const w of report.warnings ?? []) console.log(`  warn ${String(w).slice(0, 300)}`);
      const P = report.positions;
      for (const pn of report.panels) {
        const lo = [Infinity, Infinity, Infinity];
        const hi = [-Infinity, -Infinity, -Infinity];
        for (let v = pn.offset; v < pn.offset + pn.count; v++)
          for (let k = 0; k < 3; k++) {
            lo[k] = Math.min(lo[k], P[3 * v + k]);
            hi[k] = Math.max(hi[k], P[3 * v + k]);
          }
        console.log(
          `  panel ${N.nameOf(pn.pieceKey)} ${pn.group} x ${lo[0].toFixed(0)}..${hi[0].toFixed(0)} y ${lo[1].toFixed(0)}..${hi[1].toFixed(0)} z ${lo[2].toFixed(0)}..${hi[2].toFixed(0)}`,
        );
      }
    }
    for (const s of [...dollSeams, ...dollLayer])
      console.log(
        `  ${(s.state ?? '').padEnd(9)} ${String(s.kind).padEnd(18)} ${s.origin.padEnd(13)} ${dollSewn(s, G, N).words} · ${s.note.slice(0, 100)}`,
      );
    for (const x of report.notSewn ?? [])
      console.log(
        `  NOT SEWN  ${x.a.map((q) => nmId(N, q)).join('+')} ↔ ${x.b.map((q) => nmId(N, q)).join('+')} · ${x.note.slice(0, 100)}`,
      );
    for (const f of report.floating)
      console.log(`  floating ${N.nameOf(f.pieceKey)} · ${f.reason.slice(0, 100)}`);
    if (report.notGarment) console.log(`  NOT GARMENT: ${report.notGarment.slice(0, 160)}`);
    console.log('--- doll seams, GLOBAL assignment:');
    for (const s of [...dollSeamsG, ...dollLayerG])
      console.log(
        `  ${(s.state ?? '').padEnd(9)} ${String(s.kind).padEnd(18)} ${s.origin.padEnd(13)} ${dollSewn(s, G, N).words} · ${s.note.slice(0, 100)}`,
      );
    for (const x of reportG.notSewn ?? [])
      console.log(
        `  NOT SEWN  ${x.a.map((q) => nmId(N, q)).join('+')} ↔ ${x.b.map((q) => nmId(N, q)).join('+')} · ${x.note.slice(0, 100)}`,
      );
    for (const f of reportG.floating)
      console.log(`  floating ${N.nameOf(f.pieceKey)} · ${f.reason.slice(0, 100)}`);
    continue;
  }

  // truth
  const truthPath = `${truthDir}/${c.id}.seams.json`;
  let truthFile: TruthFile | null = null;
  if (existsSync(truthPath)) truthFile = JSON.parse(await readFile(truthPath, 'utf8')) as TruthFile;
  const truthRows = truthFile?.rows ?? [];
  const anchoredRows = truthRows.filter((r) => r.row);
  const res = anchoredRows.length
    ? resolveSeamDecisions(
        anchoredRows.map((r) => r.row!),
        graph.pieces,
        { grainDeg: grain, nameOf: N.nameOf },
      )
    : null;
  const truths: TruthSewn[] = [];
  const unresolved: string[] = [];
  if (res) {
    for (const ap of res.applied) {
      const i = truthRows.findIndex((r) => r.row === ap.seam);
      const s = appliedSewn(ap, G);
      truths.push({
        i,
        row: truthRows[i],
        ...s,
        words: `${s.aIds.map((x) => nmId(N, x)).join('+')} ↔ ${s.bIds.map((x) => nmId(N, x)).join('+')}`,
      });
    }
    for (const x of [...res.stale, ...res.orphan]) unresolved.push(x.words);
  }
  const patterns: TruthPattern[] = truthRows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.pattern)
    .map(({ r, i }) => ({
      i,
      row: r,
      ra: new RegExp(r.pattern!.a),
      rb: new RegExp(r.pattern!.b),
      words: `${r.pattern!.a} ↔ ${r.pattern!.b} ×${r.pattern!.count}`,
    }));

  if (mode === 'sheet') {
    await writeSheet(c, L, graph, N, truths, patterns, graphPreds, dollPreds, outDir);
    continue;
  }

  // score
  const vg = score(graphPreds, [], truths, patterns, G, N);
  const vd = score(dollPreds, dollLayerPreds, truths, patterns, G, N);
  const vgG = score(graphPredsG, [], truths, patterns, G, N);
  const vdG = score(dollPredsG, dollLayerPredsG, truths, patterns, G, N);
  const states: Record<string, number> = {};
  for (const s of dollSeams) states[s.state] = (states[s.state] ?? 0) + 1;
  const mainRows = truthRows.filter(
    (r) => r.bucket === 'main' && r.status === 'confirmed' && r.kind === 'seam',
  );
  const out: CardOut = {
    id: c.id,
    label: c.label,
    size: L.size,
    pieces: graph.pieces.length,
    truth: {
      rows: truthRows.length,
      main: vg.rows,
      sure: vg.sure.rows,
      likely: mainRows.filter((r) => r.confidence === 'likely' && !r.anyOf).length,
      unsure: mainRows.filter((r) => r.confidence === 'unsure' && !r.anyOf).length,
      ply: vg.ply.rows,
      lining: vg.lining.rows,
      notSewn: truthRows.filter((r) => r.status === 'rejected').length,
      closures: truthRows.filter((r) => r.kind === 'closure' && r.status === 'confirmed').length,
      unresolved,
    },
    graph: vg,
    doll: vd,
    graphG: vgG,
    dollG: vdG,
    dollStates: states,
    notSewnByDoll: (report.notSewn ?? []).map(
      (x) => `${x.a.map((q) => nmId(N, q)).join('+')} ↔ ${x.b.map((q) => nmId(N, q)).join('+')}`,
    ),
    ms: {
      graph: Math.round(msGraph),
      doll: Math.round(msDoll),
      graphG: Math.round(msGraphG),
      dollG: Math.round(msDollG),
      assign: Math.round(msAssign),
    },
    assignment: graphG.assignment,
  };
  outCards.push(out);
  console.log(
    `\n══ ${c.id} · ${c.label} · size ${L.size} · ${graph.pieces.length} pieces · truth: main ${out.truth.main} (sure ${out.truth.sure}) · ply ${out.truth.ply} · lining ${out.truth.lining} · not-sewn ${out.truth.notSewn} · closures ${out.truth.closures}${unresolved.length ? ` · UNRESOLVED ${unresolved.length}` : ''}`,
  );
  if (!truthRows.length) console.log('  (no truth yet)');
  for (const [name, v] of [
    ['graph        ', vg],
    ['graph GLOBAL ', vgG],
    ['doll         ', vd],
    ['doll GLOBAL  ', vdG],
  ] as const)
    console.log(
      `  ${name}: found ${v.found}/${v.rows} · TP ${v.tpPreds} FP ${v.fp} FN ${v.fn} · precision ${pct(v.precision)} · recall ${pct(v.recall)} · sure ${v.sure.found}/${v.sure.rows} ${pct(v.sure.recall)} · ply ${v.ply.found}/${v.ply.rows} · lining ${v.lining.found}/${v.lining.rows} · closures drawn ${v.closuresDrawn}`,
    );
  console.log(
    `  assignment: ${out.ms.assign} ms · ${graphG.assignment?.operations.length ?? 0} operations${graphG.assignment?.unconnected.length ? ` · apart: ${graphG.assignment.unconnected.map((x) => `«${x.slice(0, 40)}»`).join(' ')}` : ''}${graphG.assignment?.operations.some((o) => !o.exact) ? ' · BUDGET HIT' : ''}`,
  );
  for (const x of vdG.fps)
    console.log(
      `    dollG FP  ${x.words} — ${x.cls}${x.detail ? ` · ${x.detail.slice(0, 120)}` : ''}`,
    );
  for (const x of vdG.fns)
    console.log(`    dollG FN  ${x.words} [${x.cls}, ${x.confidence}] — ${x.detail.slice(0, 170)}`);
  const onlyGraphG = vgG.fps.filter((x) => !vdG.fps.some((y) => y.words === x.words));
  for (const x of onlyGraphG) console.log(`    graphG-only FP ${x.words} — ${x.cls}`);
  const onlyGraphGFn = vgG.fns.filter((x) => !vdG.fns.some((y) => y.words === x.words));
  for (const x of onlyGraphGFn) console.log(`    graphG-only FN ${x.words} [${x.cls}]`);
  // what changed against the greedy, in words
  const diff = (a: Verdict, b: Verdict, tag: string) => {
    for (const x of b.fps.filter((x) => !a.fps.some((y) => y.words === x.words)))
      console.log(`    ${tag} NEW FP ${x.words} — ${x.cls}`);
    for (const x of a.fps.filter((x) => !b.fps.some((y) => y.words === x.words)))
      console.log(`    ${tag} FIXED FP ${x.words} — ${x.cls}`);
    for (const x of b.fns.filter((x) => !a.fns.some((y) => y.words === x.words)))
      console.log(`    ${tag} NEW FN ${x.words} [${x.cls}]`);
    for (const x of a.fns.filter((x) => !b.fns.some((y) => y.words === x.words)))
      console.log(`    ${tag} FIXED FN ${x.words} [${x.cls}]`);
  };
  diff(vg, vgG, 'graph→global');
  diff(vd, vdG, 'doll→global');
  for (const u of unresolved) console.log(`    UNRESOLVED truth: ${u}`);
}

if (mode === 'score') {
  const sum = (k: 'graph' | 'doll' | 'graphG' | 'dollG') => {
    const tp = outCards.reduce((t, c) => t + c[k].tpPreds, 0);
    const fp = outCards.reduce((t, c) => t + c[k].fp, 0);
    const rows = outCards.reduce((t, c) => t + c[k].rows, 0);
    const found = outCards.reduce((t, c) => t + c[k].found, 0);
    const sr = outCards.reduce((t, c) => t + c[k].sure.rows, 0);
    const sf = outCards.reduce((t, c) => t + c[k].sure.found, 0);
    const classes: Record<string, number> = {};
    for (const c of outCards) {
      for (const x of c[k].fps) classes[`FP ${x.cls}`] = (classes[`FP ${x.cls}`] ?? 0) + 1;
      for (const x of c[k].fns) classes[`FN ${x.cls}`] = (classes[`FN ${x.cls}`] ?? 0) + 1;
    }
    return {
      rows,
      found,
      tpPreds: tp,
      fp,
      fn: rows - found,
      precision: tp + fp ? tp / (tp + fp) : 1,
      recall: rows ? found / rows : 1,
      sure: { rows: sr, found: sf, recall: sr ? sf / sr : 1 },
      ply: {
        rows: outCards.reduce((t, c) => t + c[k].ply.rows, 0),
        found: outCards.reduce((t, c) => t + c[k].ply.found, 0),
      },
      lining: {
        rows: outCards.reduce((t, c) => t + c[k].lining.rows, 0),
        found: outCards.reduce((t, c) => t + c[k].lining.found, 0),
      },
      classes: Object.fromEntries(Object.entries(classes).sort((a, b) => b[1] - a[1])),
    };
  };
  const total = {
    graph: sum('graph'),
    doll: sum('doll'),
    graphG: sum('graphG'),
    dollG: sum('dollG'),
  };
  console.log(
    `\n══ TOTAL (${outCards.length} cards · main truth rows ${total.graph.rows}, sure ${total.graph.sure.rows}, unsure ${outCards.reduce((t, c) => t + c.truth.unsure, 0)} · ply ${total.graph.ply.rows} · lining ${total.graph.lining.rows})`,
  );
  for (const k of ['graph', 'graphG', 'doll', 'dollG'] as const)
    console.log(
      `  ${k.padEnd(6)}: found ${total[k].found}/${total[k].rows} · TP ${total[k].tpPreds} FP ${total[k].fp} FN ${total[k].fn} · precision ${pct(total[k].precision)} · recall ${pct(total[k].recall)} · sure recall ${pct(total[k].sure.recall)} · ply ${total[k].ply.found}/${total[k].ply.rows}`,
    );
  for (const k of ['graph', 'graphG', 'doll', 'dollG'] as const) {
    console.log(`  ${k} error classes:`);
    for (const [cls, v] of Object.entries(total[k].classes).slice(0, 18))
      console.log(`    ${String(v).padStart(3)}  ${cls}`);
  }
  // ── greedy vs global, per card and by kind of card ──
  const BAGS = new Set(['1', '12', '13', '14', '15']);
  const TROUSERS = new Set(['7', '11']);
  const kindOf = (id: string) => (BAGS.has(id) ? 'bags' : TROUSERS.has(id) ? 'trousers' : 'shirts');
  const P = (v: Verdict) => `${String(Math.round(100 * v.precision)).padStart(3)}`;
  const R = (v: Verdict) => `${String(Math.round(100 * v.recall)).padStart(3)}`;
  console.log('\n══ GREEDY vs GLOBAL (main bucket, precision / recall %)');
  console.log(
    `  ${'card'.padEnd(46)} ${'graph'.padEnd(9)} ${'global'.padEnd(9)} ${'doll'.padEnd(9)} ${'global'.padEnd(9)} assign ms`,
  );
  for (const c of outCards)
    console.log(
      `  ${`${c.id} ${c.label}`.slice(0, 45).padEnd(46)} ${P(c.graph)}/${R(c.graph)}   ${P(c.graphG)}/${R(c.graphG)}   ${P(c.doll)}/${R(c.doll)}   ${P(c.dollG)}/${R(c.dollG)}   ${String(c.ms.assign).padStart(5)}${c.assignment?.operations.some((o) => !o.exact) ? ' budget' : ''}`,
    );
  const agg = (cards: CardOut[], k: 'graph' | 'doll' | 'graphG' | 'dollG') => {
    const tp = cards.reduce((t, c) => t + c[k].tpPreds, 0);
    const fp = cards.reduce((t, c) => t + c[k].fp, 0);
    const rows = cards.reduce((t, c) => t + c[k].rows, 0);
    const found = cards.reduce((t, c) => t + c[k].found, 0);
    return `${String(Math.round((100 * tp) / Math.max(1, tp + fp))).padStart(3)}/${String(Math.round((100 * found) / Math.max(1, rows))).padStart(3)}`;
  };
  for (const kind of ['shirts', 'trousers', 'bags'] as const) {
    const cs = outCards.filter((c) => kindOf(c.id) === kind);
    if (!cs.length) continue;
    console.log(
      `  ${`${kind} (${cs.length})`.padEnd(46)} ${agg(cs, 'graph')}   ${agg(cs, 'graphG')}   ${agg(cs, 'doll')}   ${agg(cs, 'dollG')}`,
    );
  }
  console.log(
    `  ${'ALL'.padEnd(46)} ${agg(outCards, 'graph')}   ${agg(outCards, 'graphG')}   ${agg(outCards, 'doll')}   ${agg(outCards, 'dollG')}`,
  );
  const ms = outCards.map((c) => c.ms.assign).sort((a, b) => a - b);
  const p95 = ms[Math.min(ms.length - 1, Math.floor(0.95 * (ms.length - 1)))] ?? 0;
  const worse = outCards
    .filter((c) => kindOf(c.id) !== 'bags')
    .filter(
      (c) =>
        c.dollG.precision < c.doll.precision - 0.02 + 1e-9 ||
        c.dollG.recall < c.doll.recall - 0.02 + 1e-9,
    )
    .map((c) => c.id);
  const okTotals =
    total.dollG.precision >= total.doll.precision - 1e-9 &&
    total.dollG.recall >= total.doll.recall - 1e-9;
  console.log(
    `  ACCEPTANCE (flip the default to global): totals ${okTotals ? 'OK' : 'NOT MET'} (doll P ${pct(total.doll.precision)} → ${pct(total.dollG.precision)}, R ${pct(total.doll.recall)} → ${pct(total.dollG.recall)}) · garment cards worse by > 2 pp: ${worse.length ? worse.join(', ') : 'none'} · assignment p95 ${p95} ms (≤ 750 ${p95 <= 750 ? 'OK' : 'NOT MET'})`,
  );
  await mkdir(outDir, { recursive: true });
  const json = {
    sha: spec.sha,
    at: new Date().toISOString(),
    reqTag: spec.reqTag,
    cover: COVER,
    total,
    cards: outCards.map((c) => ({
      ...c,
      graph: { ...c.graph, tps: undefined },
      doll: { ...c.doll, tps: undefined },
      graphG: { ...c.graphG, tps: undefined },
      dollG: { ...c.dollG, tps: undefined },
    })),
  };
  await writeFile(resolve(outDir, 'latest.json'), JSON.stringify(json, null, 1) + '\n');
  console.log(`→ ${resolve(outDir, 'latest.json')}`);
}

// ── the sheet: flat pieces, numbered edges, truth rows on them ─────────────────────────────────
async function writeSheet(
  c: CardSpec,
  L: Loaded,
  graph: SeamGraph,
  N: Names,
  truths: TruthSewn[],
  patterns: TruthPattern[],
  graphPreds: Sewn[],
  dollPreds: Sewn[],
  dir: string,
) {
  const pieces = [...graph.pieces].sort((a, b) => a.name.localeCompare(b.name));
  const S = 0.45;
  const PAD = 70;
  const W = 2600;
  let x = PAD;
  let y = PAD + 40;
  let rowH = 0;
  const at = new Map<string, { ox: number; oy: number; y1: number; x0: number }>();
  for (const p of pieces) {
    const xs = p.rs.map((q) => q[0]);
    const ys = p.rs.map((q) => q[1]);
    const w = (Math.max(...xs) - Math.min(...xs)) * S;
    const h = (Math.max(...ys) - Math.min(...ys)) * S;
    if (x + w > W - PAD) {
      x = PAD;
      y += rowH + PAD + 30;
      rowH = 0;
    }
    at.set(p.pieceKey, { ox: x, oy: y, y1: Math.max(...ys), x0: Math.min(...xs) });
    x += w + PAD + 40;
    rowH = Math.max(rowH, h);
  }
  const H = Math.ceil(y + rowH + PAD + 40);
  const tx = (k: string, q: [number, number]) => {
    const a = at.get(k)!;
    return [a.ox + (q[0] - a.x0) * S, a.oy + (a.y1 - q[1]) * S] as const;
  };
  const COLORS = [
    '#1f6feb',
    '#d1242f',
    '#1a7f37',
    '#9a6700',
    '#8250df',
    '#bf3989',
    '#0b7285',
    '#57606a',
  ];
  const out: string[] = [];
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const onEdge = new Map<string, string[]>();
  const colOf = new Map<string, { n: number; status: string; kind: string; bucket: Bucket }>();
  const tagOf = (r: TruthRow, n: number) =>
    r.status === 'rejected'
      ? `x${n}`
      : r.kind === 'closure'
        ? `C${n}`
        : r.bucket === 'ply'
          ? `P${n}`
          : r.bucket === 'lining'
            ? `L${n}`
            : `S${n}`;
  for (const t of truths) {
    const n = t.i + 1;
    const tag = tagOf(t.row, n);
    for (const e of [...t.aIds, ...t.bIds]) {
      onEdge.set(e, [...(onEdge.get(e) ?? []), tag]);
      if (t.row.status !== 'rejected' && t.row.bucket === 'main')
        colOf.set(e, { n, status: t.row.status, kind: t.row.kind, bucket: t.row.bucket });
    }
  }
  for (const t of patterns)
    for (const p of graph.pieces)
      for (const e of p.edges) {
        const nm = `${p.name}#${e.k}`;
        if (t.ra.test(nm) || t.rb.test(nm))
          onEdge.set(e.id, [...(onEdge.get(e.id) ?? []), `${tagOf(t.row, t.i + 1)}*`]);
      }
  for (const p of pieces) {
    const pts = p.rs.map((q) => tx(p.pieceKey, q));
    out.push(
      `<polygon points="${pts.map((q) => q.join(',')).join(' ')}" fill="#f6f5f2" stroke="#999" stroke-width="0.6"/>`,
    );
    const cx = pts.reduce((t, q) => t + q[0], 0) / pts.length;
    const cy = pts.reduce((t, q) => t + q[1], 0) / pts.length;
    p.edges.forEach((e: Edge, i) => {
      const ep = e.pts.map((q) => tx(p.pieceKey, q));
      const g = colOf.get(e.id);
      const col = g
        ? g.kind === 'closure'
          ? '#e8590c'
          : COLORS[g.n % COLORS.length]
        : COLORS[i % COLORS.length];
      out.push(
        `<polyline points="${ep.map((q) => q.join(',')).join(' ')}" fill="none" stroke="${col}" stroke-width="${g ? 5 : 2}" stroke-linecap="round" opacity="${g ? 0.75 : 1}"/>`,
      );
      const m = ep[Math.floor(ep.length / 2)];
      const dx = cx - m[0];
      const dy = cy - m[1];
      const d = Math.hypot(dx, dy) || 1;
      const lx = m[0] + (dx / d) * 16;
      const ly = m[1] + (dy / d) * 16;
      out.push(
        `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="11" text-anchor="middle" fill="${col}" font-family="monospace">#${e.k} ${e.lenMm.toFixed(0)}${e.notchesMm.length ? ` n${e.notchesMm.length}` : ''}</text>`,
      );
      const tags = onEdge.get(e.id);
      if (tags)
        out.push(
          `<text x="${lx.toFixed(1)}" y="${(ly + 13).toFixed(1)}" font-size="13" font-weight="bold" text-anchor="middle" fill="#000" font-family="sans-serif">${tags.join(' ')}</text>`,
        );
      out.push(
        `<circle cx="${ep[0][0].toFixed(1)}" cy="${ep[0][1].toFixed(1)}" r="2.2" fill="${col}"/>`,
      );
    });
    for (const ni of p.notchIdx) {
      const q = tx(p.pieceKey, p.rs[((ni % p.rs.length) + p.rs.length) % p.rs.length]);
      out.push(
        `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="3" fill="none" stroke="#000" stroke-width="1"/>`,
      );
    }
    for (const mk of p.marks ?? []) {
      if (mk.kind !== 'drill' && mk.kind !== 'buttonhole' && mk.kind !== 'vee') continue;
      const q = tx(p.pieceKey, [mk.bbox.cx, mk.bbox.cy]);
      out.push(
        mk.kind === 'vee'
          ? `<polyline points="${mk.pts.map((pp) => tx(p.pieceKey, pp).join(',')).join(' ')}" fill="none" stroke="#c00" stroke-width="1"/>`
          : `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="2.5" fill="#c00"/>`,
      );
    }
    const a = at.get(p.pieceKey)!;
    out.push(
      `<text x="${a.ox}" y="${a.oy - 10}" font-size="15" font-weight="bold" font-family="sans-serif">${esc(p.name)}${p.hand ? ` (${p.hand})` : ''}</text>`,
    );
  }
  const lines = [
    `${c.label} — size ${L.size} · edges as segmented today (#k length mm, nN = notches; dot = edge start, CCW walk; ring = notch; red = drill/buttonhole/V mark)`,
    `engine seams: ${graphPreds.map((p) => p.words).join('  ')}`,
    `doll seams: ${dollPreds.map((p) => `${p.words}${p.state && p.state !== 'closed' ? ` (${p.state})` : ''}`).join('  ')}`,
  ];
  const all = [...truths, ...patterns].sort((u, v) => u.i - v.i);
  if (all.length) {
    lines.push(
      `TRUTH rows (${all.length}; S = seam, P = ply / sandwich, L = lining, C = closure, x = not sewn, * = pattern over identical panels):`,
    );
    for (const t of all)
      lines.push(
        `  ${tagOf(t.row, t.i + 1)}${t.row.confidence !== 'sure' ? ` (${t.row.confidence})` : ''}${t.row.anyOf ? ` {${t.row.anyOf}}` : ''} [${t.row.cls}]: ${t.words} — ${t.row.derivation.slice(0, 190)}`,
      );
  } else lines.push('(no truth rows yet)');
  const textH = 16 * (lines.length + 1) + 20;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + textH}" viewBox="0 0 ${W} ${H + textH}"><rect width="100%" height="100%" fill="#fff"/>${out.join('')}${lines
    .map(
      (l, i) =>
        `<text x="20" y="${H + 20 + 16 * i}" font-size="12" font-family="monospace">${esc(l)}</text>`,
    )
    .join('')}</svg>`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/${c.id}-flat-edges.svg`, svg);
  await writeFile(`${dir}/${c.id}-flat-edges.size`, JSON.stringify({ w: W, h: H + textH }));
  console.log(`${c.id}: sheet ${W}×${H + textH}`);
}
