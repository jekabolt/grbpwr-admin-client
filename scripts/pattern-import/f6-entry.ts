// F6 probe: writer + gate on synthetic PieceSpecs (no dependency on unfinished lanes).
//   T1  golden structure — K2's golden-min.dxf rebuilt from PieceSpecs, compared tag by tag
//   T2  main scope: BP (unfolded, fold line, dart, drill) · FP_L/FP_R pair · SL (seam meaning,
//       cut derived by offset, concave cap) · PCK (UNI) × S/M/L → write → gate passes
//   T3  lining scope (distinct names)            T4  `_R` derived by the writer from `_L`
//   T5  R12 dialect                              T6  file framing, merge, manifest round trip
//   N*  negative controls: every mutation must turn its check red and fail the gate
import fs from 'node:fs';
import path from 'node:path';
import * as blockCode from 'components/managers/tech-card/components/nesting/block-code';
import { mergeDxfSheets } from 'lib/nesting/dxf/merge';
import type {
  DraftScopeTarget,
  FoldFeature,
  GateCheckId,
  GateReport,
  GrainFeature,
  InternalFeature,
  ManifestSize,
  ManifestSource,
  NotchFeature,
  OffsetReport,
  PieceSizeSpec,
  PieceSpec,
  PtMm,
  WriteJob,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { writeDxfDetailed, writeScopes } from 'lib/pattern-import/write';
import {
  areaOf,
  bboxOf,
  convexHull,
  hullRatio,
  reflection,
  applyAffine,
} from 'lib/pattern-import/write/geom';
import { embedManifestLocal, readManifestLocal } from 'lib/pattern-import/write/manifest-local';
import {
  type CardBlockRules,
  createRunGate,
  readRawDxf,
  roundTrip,
  writeAndGate,
} from 'lib/pattern-import/gate';

const rules: CardBlockRules = blockCode;

// ── tiny test harness ──────────────────────────────────────────────────────────────────────

type Row = { section: string; what: string; ok: boolean; detail: string };
const rows: Row[] = [];
let section = '';
const ck = (ok: boolean, what: string, detail = '') => {
  rows.push({ section, what, ok, detail });
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};
const head = (s: string) => {
  section = s;
  console.log(`\n${s}`);
};
const failing = (r: GateReport) =>
  r.checks.filter((c) => !c.ok && c.severity === 'block').map((c) => c.id);
const checkOf = (r: GateReport, id: GateCheckId) => r.checks.filter((c) => c.id === id);
const summary = (r: GateReport) =>
  r.checks.map((c) => `${c.id}${c.ok ? '✓' : c.severity === 'block' ? '✗' : '!'}`).join(' ');

// ── geometry helpers for fixtures ──────────────────────────────────────────────────────────

const ccw = (p: PtMm[]) => (areaSigned(p) < 0 ? [...p].reverse() : p);
function areaSigned(p: PtMm[]) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i];
    const r = p[(i + 1) % p.length];
    a += q.x * r.y - r.x * q.y;
  }
  return a / 2;
}
/** Miter offset of a CCW polygon; d > 0 = inward. */
function offsetPoly(poly: PtMm[], d: number): PtMm[] {
  const n = poly.length;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    return { p: { x: a.x + (-dy / L) * d, y: a.y + (dx / L) * d }, v: { x: dx, y: dy } };
  });
  return poly.map((_, i) => {
    const l1 = lines[(i - 1 + n) % n];
    const l2 = lines[i];
    const den = l1.v.x * l2.v.y - l1.v.y * l2.v.x;
    const t = ((l2.p.x - l1.p.x) * l2.v.y - (l2.p.y - l1.p.y) * l2.v.x) / den;
    return { x: l1.p.x + l1.v.x * t, y: l1.p.y + l1.v.y * t };
  });
}
const scaleAbout = (pts: PtMm[], o: PtMm, k: number) =>
  pts.map((p) => ({ x: o.x + (p.x - o.x) * k, y: o.y + (p.y - o.y) * k }));
const mirrorX = (pts: PtMm[]) => pts.map((p) => ({ x: -p.x, y: p.y }));
const translate = (pts: PtMm[], dx: number, dy: number) =>
  pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));

const grainF = (a: PtMm, b: PtMm): GrainFeature => ({
  kind: 'grain',
  a,
  b,
  angleDeg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
  origin: 'detected',
  ranges: [],
  confidence: 1,
});
function notchOn(poly: PtMm[], i: number, t: number, depth = 5): NotchFeature {
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  const at = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
  return {
    kind: 'notch',
    at,
    seg: [at, { x: at.x + n.x * depth, y: at.y + n.y * depth }],
    depthMm: depth,
    origin: 'detected',
    ranges: [],
    confidence: 1,
  };
}
const internalF = (pts: PtMm[], closed = false): InternalFeature => ({
  kind: 'internal',
  pts,
  closed,
  origin: 'detected',
  ranges: [],
  confidence: 1,
});
const foldF = (a: PtMm, b: PtMm): FoldFeature => ({
  kind: 'fold',
  a,
  b,
  origin: 'detected',
  ranges: [],
  confidence: 1,
});
const offsetReport = (derived: PtMm[]): OffsetReport => ({
  ok: true,
  loops: 1,
  selfIntersects: false,
  hullRatio: hullRatio(derived),
  maxDeviationMm: 0.01,
});

type SizeDef = { token: string; sizeId: number; rank: number; k: number };
const SIZES: SizeDef[] = [
  { token: 'S', sizeId: 11, rank: 0, k: 0.96 },
  { token: 'M', sizeId: 12, rank: 1, k: 1.0 },
  { token: 'L', sizeId: 13, rank: 2, k: 1.04 },
];
const MANIFEST_SIZES: ManifestSize[] = SIZES.map((s) => ({
  token: s.token,
  sizeId: s.sizeId,
  name: `${s.token.toLowerCase()}_eu`,
  sourceLabel: String(44 + s.rank * 2),
  rank: s.rank,
}));
const CARD_TOKENS = new Set(SIZES.map((s) => s.token));
const SOURCE: ManifestSource = {
  files: [{ name: 'synthetic.pdf', sha256: '0'.repeat(64), bytes: 0, kind: 'pdf', pages: 1 }],
  scale: { method: 'test-square', factor: 1, measuredMm: 100, declaredMm: 100 },
  sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
  sizeEncoding: 'ocg',
  variant: null,
};
const MAIN: DraftScopeTarget = {
  scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
  fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
  bomLineKey: '',
  label: 'main',
  isInterlining: false,
};
const LINING: DraftScopeTarget = {
  scopeKey: 'TECH_CARD_BOM_PURPOSE_LINING',
  fabricPurpose: 'TECH_CARD_BOM_PURPOSE_LINING',
  bomLineKey: '',
  label: 'lining',
  isInterlining: false,
};

function sizeSpec(
  s: SizeDef,
  g: {
    cut: PtMm[];
    seam: PtMm[] | null;
    grain: GrainFeature | null;
    notches?: NotchFeature[];
    drills?: PtMm[];
    internal?: InternalFeature[];
    fold?: FoldFeature | null;
    offset?: OffsetReport | null;
  },
): PieceSizeSpec {
  return {
    rank: s.rank,
    sizeToken: s.token,
    sizeId: s.sizeId,
    cut: g.cut,
    seam: g.seam,
    grain: g.grain,
    notches: g.notches ?? [],
    drills: (g.drills ?? []).map((at) => ({
      kind: 'drill',
      at,
      origin: 'detected',
      ranges: [],
      confidence: 1,
    })),
    internal: g.internal ?? [],
    fold: g.fold ?? null,
    offset: g.offset ?? null,
    walls: [],
    bbox: bboxOf(g.cut),
    areaMm2: areaOf(g.cut),
  };
}

function piece(
  identity: string,
  code: string,
  mods: string[],
  over: Partial<PieceSpec> & { sizes: PieceSizeSpec[] },
): PieceSpec {
  return {
    identity,
    code,
    mods,
    displayName: identity.toLowerCase().replace(/_/g, ' '),
    nameOrigin: 'operator',
    seed: 0,
    variant: null,
    pairHand: null,
    pairOf: null,
    unfoldedFold: false,
    piecesPerGarment: 1,
    allowance: { meaning: 'cut', allowanceMm: 10, origin: 'text', evidence: [] },
    fabrics: [MAIN.fabricPurpose],
    fused: false,
    ungraded: false,
    ...over,
  };
}

// ── T2 fixtures ────────────────────────────────────────────────────────────────────────────

const BP_M = ccw([
  { x: -250, y: 0 },
  { x: 250, y: 0 },
  { x: 260, y: 520 },
  { x: 120, y: 600 },
  { x: 0, y: 570 },
  { x: -120, y: 600 },
  { x: -260, y: 520 },
]);
function bpSpec(identity = 'BP', fabric = MAIN.fabricPurpose, shrink = 1): PieceSpec {
  const anchor = { x: 0, y: 1 };
  return piece(identity, identity === 'BP' ? 'BP' : 'LIN_BP', [], {
    unfoldedFold: true,
    fabrics: [fabric],
    sizes: SIZES.map((s) => {
      const cut = ccw(scaleAbout(BP_M, anchor, s.k * shrink));
      const seam = offsetPoly(cut, 10);
      const yb = anchor.y + (0 - anchor.y) * s.k * shrink;
      const yt = anchor.y + (570 - anchor.y) * s.k * shrink;
      return sizeSpec(s, {
        cut,
        seam,
        offset: offsetReport(seam),
        grain: grainF({ x: 0, y: 100 }, { x: 0, y: 300 }),
        notches: [notchOn(cut, 1, 0.5), notchOn(cut, 6, 0.5)],
        drills: scaleAbout([{ x: -70, y: 175 }], anchor, s.k * shrink),
        internal: [
          internalF(
            scaleAbout(
              [
                { x: -80, y: 10 },
                { x: -70, y: 160 },
                { x: -60, y: 10 },
              ],
              anchor,
              s.k * shrink,
            ),
          ),
        ],
        fold: foldF({ x: 0, y: yb }, { x: 0, y: yt }),
      });
    }),
  });
}

// FP_L is the base hand (D1: write `_L` and its explicit mirror `_R`); grain at x = −465.
const FPL_M = ccw(
  mirrorX([
    { x: 330, y: 0 },
    { x: 600, y: 0 },
    { x: 610, y: 560 },
    { x: 470, y: 640 },
    { x: 330, y: 600 },
  ]),
);
function fpLSpec(): PieceSpec {
  const anchor = { x: -465, y: 1 };
  return piece('FP_L', 'FP', ['L'], {
    pairHand: 'L',
    pairOf: 'FP_R',
    sizes: SIZES.map((s) => {
      const cut = ccw(scaleAbout(FPL_M, anchor, s.k));
      const seam = offsetPoly(cut, 10);
      return sizeSpec(s, {
        cut,
        seam,
        offset: offsetReport(seam),
        grain: grainF({ x: -465, y: 100 }, { x: -465, y: 300 }),
        notches: [notchOn(cut, 0, 0.5), notchOn(cut, 2, 0.3)],
      });
    }),
  });
}
/** The explicit mirror of FP_L across each size's grain (what semantics' mirrorAcross yields). */
function fpRFrom(L: PieceSpec, broken?: 'translate'): PieceSpec {
  return {
    ...L,
    identity: 'FP_R',
    mods: ['R'],
    pairHand: 'R',
    pairOf: 'FP_L',
    sizes: L.sizes.map((s) => {
      const T = reflection(s.grain!.a, s.grain!.b);
      const M = (p: PtMm) =>
        broken === 'translate' ? { x: p.x + 400, y: p.y } : applyAffine(T, p);
      const cut = s.cut.map(M);
      return {
        ...s,
        cut,
        seam: s.seam!.map(M),
        grain: grainF(M(s.grain!.a), M(s.grain!.b)),
        notches: s.notches.map((n) => ({
          ...n,
          at: M(n.at),
          seg: [M(n.seg[0]), M(n.seg[1])] as [PtMm, PtMm],
        })),
        bbox: bboxOf(cut),
      };
    }),
  };
}

// Sleeve: SEAM drawn (concave cap dip), cut = outward offset by 10 mm.
const SL_M = ccw([
  { x: 0, y: 0 },
  { x: 260, y: 0 },
  { x: 300, y: 420 },
  { x: 210, y: 500 },
  { x: 150, y: 465 },
  { x: 90, y: 500 },
  { x: -40, y: 420 },
]);
function slSpec(identity = 'SL', fabric = MAIN.fabricPurpose): PieceSpec {
  const anchor = { x: 130, y: 1 };
  return piece(identity, identity, [], {
    fabrics: [fabric],
    piecesPerGarment: 2,
    allowance: {
      meaning: 'seam',
      allowanceMm: 10,
      origin: 'text',
      evidence: ['seam allowance not included'],
    },
    sizes: SIZES.map((s) => {
      const seam = ccw(scaleAbout(SL_M, anchor, s.k));
      const cut = offsetPoly(seam, -10);
      return sizeSpec(s, {
        cut,
        seam,
        offset: offsetReport(cut),
        grain: grainF({ x: 130, y: 100 }, { x: 130, y: 300 }),
        notches: [notchOn(seam, 2, 0.5), notchOn(seam, 3, 0.5), notchOn(seam, 5, 0.5)],
      });
    }),
  });
}

function pckSpec(identity = 'PCK'): PieceSpec {
  const cut = ccw([
    { x: 0, y: 0 },
    { x: 160, y: 0 },
    { x: 160, y: 180 },
    { x: 0, y: 180 },
  ]);
  const seam = offsetPoly(cut, 10);
  return piece(identity, identity, [], {
    ungraded: true,
    piecesPerGarment: 2,
    sizes: [
      sizeSpec(SIZES[1], {
        cut,
        seam,
        offset: offsetReport(seam),
        grain: grainF({ x: 80, y: 40 }, { x: 80, y: 140 }),
        notches: [notchOn(cut, 2, 0.5)],
      }),
    ],
  });
}

const drawnWalls = (p: PieceSpec) => {
  const m = new Map<string, PtMm[][]>();
  for (const s of p.sizes) {
    const line = p.allowance.meaning === 'seam' ? s.seam! : s.cut;
    const h = Math.floor(line.length / 2);
    // as two open chains, the way F3 hands walls over
    m.set(`${p.identity}|${s.rank}`, [line.slice(0, h + 1), [...line.slice(h), line[0]]]);
  }
  return m;
};
function wallsOfFor(specs: PieceSpec[]) {
  const all = new Map<string, PtMm[][]>();
  for (const p of specs) for (const [k, v] of drawnWalls(p)) all.set(k, v);
  return (id: string, rank: number) => all.get(`${id}|${rank}`);
}

const job = (
  scope: DraftScopeTarget,
  pieces: PieceSpec[],
  dialect: WriteJob['dialect'] = 'r2000',
  sizes = MANIFEST_SIZES,
): WriteJob => ({
  techCardId: 4242,
  scope,
  pieces,
  sizes,
  source: SOURCE,
  generator: 'grbpwr pattern-import F6 probe',
  dialect,
});
const NOW = () => new Date('2026-10-09T12:00:00Z');
const gateCtx = (specs: PieceSpec[], extra: { shiftWalls?: number } = {}) => ({
  rules,
  sizeTokens: CARD_TOKENS,
  wallsOf: (id: string, rank: number) => {
    const w = wallsOfFor(specs)(id, rank);
    const s = extra.shiftWalls ?? 0;
    return s ? w?.map((l) => translate(l, s, 0)) : w;
  },
  now: NOW,
});

// ── text mutations (tag level) ─────────────────────────────────────────────────────────────

type Pair = [string, string];
const pairsOf = (t: string): Pair[] => {
  const l = t.split('\r\n');
  const out: Pair[] = [];
  for (let i = 0; i + 1 < l.length; i += 2) out.push([l[i], l[i + 1]]);
  return out;
};
const textOf = (p: Pair[]) => p.map(([c, v]) => `${c}\r\n${v}\r\n`).join('');
/** Remove entities (in BLOCKS) matching pred(type, layer, blockName); keep everything else. */
function dropEntities(
  text: string,
  pred: (type: string, layer: string, block: string) => boolean,
  max = Infinity,
): string {
  const p = pairsOf(text);
  const out: Pair[] = [];
  let block = '';
  let dropped = 0;
  for (let i = 0; i < p.length; ) {
    if (p[i][0].trim() === '0') {
      const type = p[i][1];
      let j = i + 1;
      let layer = '';
      let name = '';
      for (; j < p.length && p[j][0].trim() !== '0'; j++) {
        if (p[j][0].trim() === '8') layer = p[j][1];
        if (p[j][0].trim() === '2') name = p[j][1];
      }
      if (type === 'BLOCK') block = name;
      if (type !== 'BLOCK' && block && dropped < max && pred(type, layer, block)) {
        dropped++;
        i = j;
        continue;
      }
      if (type === 'ENDBLK') block = '';
      out.push(...p.slice(i, j));
      i = j;
    } else {
      out.push(p[i]);
      i++;
    }
  }
  return textOf(out);
}
/** Insert raw tags right before the ENDBLK of `block`. */
function injectIntoBlock(text: string, block: string, tags: Pair[]): string {
  const p = pairsOf(text);
  let cur = '';
  for (let i = 0; i < p.length; i++) {
    if (p[i][0].trim() === '0' && p[i][1] === 'BLOCK') {
      for (let j = i + 1; j < p.length && p[j][0].trim() !== '0'; j++)
        if (p[j][0].trim() === '2') cur = p[j][1];
    }
    if (p[i][0].trim() === '0' && p[i][1] === 'ENDBLK' && cur === block) {
      return textOf([...p.slice(0, i), ...tags, ...p.slice(i)]);
    }
  }
  throw new Error(`block ${block} not found`);
}

// ── T1 golden ──────────────────────────────────────────────────────────────────────────────

function goldenSpecs(): PieceSpec[] {
  // Literal transcription of k2-work/write-golden.mjs geometry (M, L).
  const G_SIZES: SizeDef[] = [
    { token: 'M', sizeId: 2, rank: 0, k: 1.0 },
    { token: 'L', sizeId: 3, rank: 1, k: 1.04 },
  ];
  const BP0 = ccw([
    { x: -250, y: 0 },
    { x: 250, y: 0 },
    { x: 260, y: 520 },
    { x: 120, y: 600 },
    { x: -120, y: 600 },
    { x: -260, y: 520 },
  ]);
  const FPR0 = ccw([
    { x: 330, y: 0 },
    { x: 600, y: 0 },
    { x: 610, y: 560 },
    { x: 470, y: 640 },
    { x: 330, y: 600 },
  ]);
  const g3 = (p0: PtMm) => grainF(p0, { x: p0.x, y: p0.y + 180 });
  const shell = (o: Partial<PieceSpec> & { sizes: PieceSizeSpec[] }) => ({
    ...o,
    fabrics: ['shell'],
  });
  const bp = piece(
    'BP',
    'BP',
    [],
    shell({
      sizes: G_SIZES.map((s) => {
        const anchor = { x: 0, y: 1 };
        const cut = ccw(scaleAbout(BP0, anchor, s.k));
        return sizeSpec(s, {
          cut,
          seam: offsetPoly(cut, 10),
          grain: g3(anchor),
          notches: [notchOn(cut, 1, 0.5), notchOn(cut, 5, 0.5)],
          drills: scaleAbout([{ x: -70, y: 175 }], anchor, s.k),
          internal: [
            internalF(
              scaleAbout(
                [
                  { x: -80, y: 10 },
                  { x: -70, y: 160 },
                  { x: -60, y: 10 },
                ],
                anchor,
                s.k,
              ),
            ),
          ],
        });
      }),
    }),
  );
  const fpr = piece(
    'FP_R',
    'FP',
    ['R'],
    shell({
      pairHand: 'R',
      pairOf: 'FP_L',
      sizes: G_SIZES.map((s) => {
        const anchor = { x: 465, y: 1 };
        const cut = ccw(scaleAbout(FPR0, anchor, s.k));
        return sizeSpec(s, {
          cut,
          seam: offsetPoly(cut, 10),
          grain: g3(anchor),
          notches: [notchOn(cut, 2, 0.5), notchOn(cut, 4, 0.3)],
        });
      }),
    }),
  );
  const fpl = piece(
    'FP_L',
    'FP',
    ['L'],
    shell({
      pairHand: 'L',
      pairOf: 'FP_R',
      sizes: G_SIZES.map((s) => {
        const cutR = ccw(scaleAbout(FPR0, { x: 465, y: 1 }, s.k));
        const cut = ccw(mirrorX(cutR));
        return sizeSpec(s, {
          cut,
          seam: offsetPoly(cut, 10),
          grain: g3({ x: -465, y: 1 }),
          notches: [notchOn(cut, 0, 0.5), notchOn(cut, 4, 0.7)],
        });
      }),
    }),
  );
  return [bp, fpr, fpl];
}

function compareGolden(
  mine: string,
  golden: string,
  offsets: Record<string, { dx: number; dy: number }>,
  idOf: (block: string) => string,
  annotationLayer = '19',
  allowValue: (golden: string) => boolean = () => false,
) {
  // Golden: drop the manifest 999 preamble and BP's annotation TEXT (PieceSpec carries none).
  const g = pairsOf(
    dropEntities(golden, (type, layer) => type === 'TEXT' && layer === annotationLayer),
  ).filter(([c]) => c.trim() !== '999');
  const m = pairsOf(mine);
  const problems: string[] = [];
  if (g.length !== m.length) problems.push(`tag count ${m.length} vs golden ${g.length}`);
  let entity = '';
  let block = '';
  let inBlocks = false;
  let section = '';
  const n = Math.min(g.length, m.length);
  for (let i = 0; i < n && problems.length < 10; i++) {
    const [gc, gv] = g[i];
    const [mc, mv] = m[i];
    if (gc !== mc) {
      problems.push(`#${i}: code ${mc} vs ${gc}`);
      continue;
    }
    const code = Number(gc);
    if (code === 0) entity = gv;
    if (code === 2 && entity === 'SECTION') {
      section = gv;
      inBlocks = gv === 'BLOCKS';
    }
    if (code === 2 && entity === 'BLOCK') block = gv;
    if (code === 5 || code === 105) continue; // running handles shift by the dropped L19 TEXT
    const coordX = code === 10 || code === 11;
    const coordY = code === 20 || code === 21;
    if (
      inBlocks &&
      section === 'BLOCKS' &&
      (coordX || coordY) &&
      entity !== 'BLOCK' &&
      block &&
      !block.startsWith('*')
    ) {
      const off = offsets[idOf(block)];
      const want = Number(gv) + (coordX ? off.dx : off.dy);
      if (Math.abs(Number(mv) - want) > 1e-5)
        problems.push(`#${i} ${block} ${entity} ${gc}: ${mv} vs golden ${gv}+offset`);
      continue;
    }
    if (mv !== gv && !allowValue(gv))
      problems.push(`#${i} ${section}/${entity} code ${gc}: "${mv}" vs "${gv}"`);
  }
  return problems;
}

// ── main ───────────────────────────────────────────────────────────────────────────────────

export async function main(opts: { plans: string }): Promise<number> {
  const outDir = path.join(opts.plans, 'reports');
  const sampleDir = path.join(outDir, 'f6-samples');
  fs.mkdirSync(sampleDir, { recursive: true });
  const runGate = createRunGate(rules);

  // T1 ─────────────────────────────────────────────────────────────────────────────────────
  head('T1 · golden structure (k2-work/golden-min.dxf)');
  {
    const specs = goldenSpecs();
    const scope: DraftScopeTarget = {
      scopeKey: 'shell',
      fabricPurpose: 'shell',
      bomLineKey: '',
      label: 'shell',
      isInterlining: false,
    };
    const d = writeDxfDetailed(
      job(scope, specs, 'r2000', [
        { token: 'M', sizeId: 2, name: 'm', sourceLabel: 'M', rank: 0 },
        { token: 'L', sizeId: 3, name: 'l', sourceLabel: 'L', rank: 1 },
      ]),
      { embed: null, now: NOW },
    );
    const golden = fs.readFileSync(path.join(opts.plans, 'k2-work/golden-min.dxf'), 'latin1');
    const idOf = (block: string) => d.plan.blocks.find((b) => b.name === block)!.identity;
    const problems = compareGolden(d.bareText, golden, d.plan.offsets, idOf);
    ck(
      problems.length === 0,
      'tag-by-tag equal to golden-min.dxf (handles skipped, coordinates = golden + shelf offset)',
      problems.join(' | '),
    );
    const zero = Object.fromEntries(Object.keys(d.plan.offsets).map((k) => [k, { dx: 0, dy: 0 }]));
    ck(
      compareGolden(d.bareText, golden, zero, idOf).length > 0,
      'control: the comparison is not vacuous (no offset → differences)',
    );
    const names = d.plan.blocks.map((b) => b.name).join(' ');
    ck(
      names === 'BP_M FP_R_M FP_L_M BP_L FP_R_L FP_L_L',
      'block order = golden (size-major)',
      names,
    );
    const handles = pairsOf(d.bareText)
      .filter(([c]) => c.trim() === '5' || c.trim() === '105')
      .map(([, v]) => v);
    ck(new Set(handles).size === handles.length, 'handles unique', `${handles.length} handles`);
    fs.writeFileSync(path.join(sampleDir, 'golden-rebuilt.dxf'), d.bareText, 'latin1');
    const d12 = writeDxfDetailed(
      {
        ...job(scope, specs, 'r12', [
          { token: 'M', sizeId: 2, name: 'm', sourceLabel: 'M', rank: 0 },
          { token: 'L', sizeId: 3, name: 'l', sourceLabel: 'L', rank: 1 },
        ]),
      },
      { embed: null, now: NOW },
    );
    const golden12 = fs.readFileSync(path.join(opts.plans, 'k2-work/golden-min-r12.dxf'), 'latin1');
    const p12 = compareGolden(d12.bareText, golden12, d12.plan.offsets, idOf, '15', (v) =>
      v.startsWith('STYLE NAME:'),
    );
    ck(
      p12.length === 0,
      'R12: tag-by-tag equal to golden-min-r12.dxf (STYLE NAME aside)',
      p12.join(' | '),
    );
  }

  // T2 ─────────────────────────────────────────────────────────────────────────────────────
  head('T2 · main scope: BP unfolded · FP_L/FP_R · SL (seam meaning) · PCK UNI × S/M/L');
  const L = fpLSpec();
  const mainSpecs = [bpSpec(), L, fpRFrom(L), slSpec(), pckSpec()];
  const main = await writeAndGate(job(MAIN, mainSpecs), gateCtx(mainSpecs));
  fs.writeFileSync(path.join(sampleDir, 'main.dxf'), main.dxfText, 'latin1');
  {
    const r = main.report;
    ck(r.passed, 'gate passes', summary(r));
    for (const c of r.checks) if (!c.ok) console.log(`        ${c.id} [${c.severity}] ${c.note}`);
    const names = main.detail.plan.blocks.map((b) => b.name);
    ck(names.length === 4 * 3 + 1, '13 blocks (4 graded × 3 + PCK_UNI)', names.join(' '));
    ck(
      names.includes('PCK_UNI') && !names.some((n) => /^PCK_UNI_/.test(n)),
      'ungraded piece written as PREFIX_UNI (no size tail)',
    );
    const raw = readRawDxf(main.dxfText);
    const bpM = raw.blocks.get('BP_M')!;
    const l8 = bpM.filter((e) => e.layer === '8');
    ck(
      l8.every((e) => e.closed || e.pts.length >= 3),
      'every open L8 line has ≥ 3 vertices (fold + dart)',
      l8.map((e) => e.pts.length).join(','),
    );
    const g = bpM.filter((e) => e.layer === '7');
    ck(
      g.length === 1 && g[0].pts.length === 3 && g[0].type === 'LWPOLYLINE',
      'grain = one CLO 3-vertex arrow on L7',
    );
    const slM = raw.blocks.get('SL_M')!;
    const n = slM.filter((e) => e.layer === '4');
    ck(
      n.length === 3 && n.every((e) => e.type === 'LINE'),
      'SL notches (drawn on the seam) written as 3 LINEs on L4',
    );
    const back = readManifestLocal(main.dxfText)!;
    ck(
      !!back.gate && back.gate.passed === true,
      'embedded manifest carries the passed gate report',
    );
    const fp = back.pieces.find((p) => p.identity === 'FP_L')!;
    ck(fp.pairHand === 'L' && fp.pairOf === 'FP_R', 'manifest pairHand/pairOf (D1)');
    ck(back.pieces.find((p) => p.identity === 'BP')!.unfoldedFold, 'manifest unfoldedFold on BP');
    ck(
      back.blocks.find((b) => b.block === 'PCK_UNI')!.sizeToken === 'UNI',
      'manifest block PCK_UNI sizeToken = UNI',
    );
    // the card's own reading of the file
    const rt = await roundTrip(main.dxfText);
    ck(
      !rt.warnings.some((w) => /units are not set/.test(w)),
      '$INSUNITS survives the leading 999 (unit not guessed)',
      rt.warnings.join(' | '),
    );
    const derived = blockCode.deriveBlockSizes(rt.blockNames, (t) =>
      CARD_TOKENS.has(t.toUpperCase()),
    );
    ck(
      derived.get('FP_L_L') === 'L' && derived.get('FP_L_M') === 'M',
      'card derives FP_L_L → FP_L / L (left-vs-size-L trap)',
    );
    // timing
    console.log(`        gate ${r.durationMs} ms, ${main.dxfText.length} bytes`);
  }

  // T3 ─────────────────────────────────────────────────────────────────────────────────────
  head('T3 · lining scope (own DXF, distinct names)');
  {
    const lin = [
      bpSpec('LIN_BP', LINING.fabricPurpose, 0.97),
      slSpec('LIN_SL', LINING.fabricPurpose),
    ];
    const all = [...mainSpecs, ...lin];
    const r = await writeAndGate(
      job(
        LINING,
        all.filter((p) => p.fabrics.includes(LINING.fabricPurpose)),
      ),
      gateCtx(all),
    );
    fs.writeFileSync(path.join(sampleDir, 'lining.dxf'), r.dxfText, 'latin1');
    ck(r.report.passed, 'lining gate passes', summary(r.report));
    const names = r.detail.plan.blocks.map((b) => b.name);
    ck(
      names.every((n) => n.startsWith('LIN_')),
      'lining blocks are LIN_* (never collide with main aliases)',
      names.join(' '),
    );
    ck(r.detail.manifest.scope.fabricPurpose === LINING.fabricPurpose, 'manifest scope = lining');
    // writer skips pieces of another scope when handed everything
    const d = writeDxfDetailed(job(LINING, all), { embed: null, now: NOW });
    ck(
      d.plan.blocks.length === 6 &&
        d.warnings.filter((w) => /not cut from/.test(w)).length === mainSpecs.length,
      'main pieces skipped from the lining file',
    );
    const fan = writeScopes(
      {
        techCardId: 4242,
        scopes: [MAIN, LINING],
        pieces: all,
        sizes: MANIFEST_SIZES,
        source: SOURCE,
        generator: 'probe',
        dialect: 'r2000',
      },
      { now: NOW },
    );
    ck(
      fan.length === 2 &&
        fan[0].detail.plan.blocks.length === 13 &&
        fan[1].detail.plan.blocks.length === 6,
      'writeScopes: one DXF per fabric-purpose scope (13 main / 6 lining blocks)',
    );
  }

  // T4 ─────────────────────────────────────────────────────────────────────────────────────
  head('T4 · `_R` derived by the writer from `_L` (explicit mirror across the grain)');
  {
    const specs = [fpLSpec()];
    const r = await writeAndGate(job(MAIN, specs), gateCtx(specs));
    ck(r.report.passed, 'gate passes', summary(r.report));
    const names = r.detail.plan.blocks.map((b) => b.name).join(' ');
    ck(names === 'FP_L_S FP_R_S FP_L_M FP_R_M FP_L_L FP_R_L', 'both hands written', names);
    ck(
      r.detail.warnings.some((w) => /FP_R: derived as the mirror/.test(w)),
      'derivation is reported',
    );
    ck(
      checkOf(r.report, 'G12-pair')[0].ok,
      'G12 pair check green',
      checkOf(r.report, 'G12-pair')[0].value as string,
    );
    ck(
      checkOf(r.report, 'G4-hausdorff')[0].ok,
      'derived R walls (mirrored source) within Hausdorff',
    );
  }

  // T5 ─────────────────────────────────────────────────────────────────────────────────────
  head('T5 · R12 dialect (opt-in)');
  {
    const r = await writeAndGate(job(MAIN, mainSpecs, 'r12'), gateCtx(mainSpecs));
    fs.writeFileSync(path.join(sampleDir, 'main-r12.dxf'), r.dxfText, 'latin1');
    ck(r.report.passed, 'R12 gate passes', summary(r.report));
    for (const c of r.report.checks)
      if (!c.ok) console.log(`        ${c.id} [${c.severity}] ${c.note}`);
    let refused = false;
    try {
      mergeDxfSheets([{ name: 'r12', text: r.dxfText }], new Map());
    } catch {
      refused = true;
    }
    ck(refused, 'mergeDxfSheets refuses R12 (expected — card path is R2000)');
  }

  // T6 ─────────────────────────────────────────────────────────────────────────────────────
  head('T6 · file framing, merge, manifest');
  {
    const t = main.dxfText;
    ck(/^[\x20-\x7e\r\n]*$/.test(t), 'ASCII-only bytes');
    ck(!/[^\r]\n/.test(t), 'CRLF line endings only');
    const lines = t.split('\r\n');
    ck(
      lines[0] === '999' && lines[1].startsWith('GRBPWR-MANIFEST v1 1/'),
      'manifest 999 lines first',
    );
    const firstSection = lines.findIndex((l, i) => l === 'SECTION' && lines[i - 1] === '  0');
    ck(
      lines
        .slice(0, firstSection - 1)
        .every((l, i) => (i % 2 === 0 ? l === '999' : l.startsWith('GRBPWR-MANIFEST'))),
      'only manifest comments before the first SECTION',
    );
    ck(
      lines.filter((l) => l === '999').length ===
        lines.slice(0, firstSection).filter((l) => l === '999').length,
      'no 999 anywhere else',
    );
    ck(
      lines
        .slice(1, firstSection)
        .filter((_, i) => i % 2 === 0)
        .every((l) => l.length <= 'GRBPWR-MANIFEST v1 99/99 '.length + PATIMPORT.manifestLineMax),
      `manifest chunks ≤ ${PATIMPORT.manifestLineMax} chars`,
    );
    let merged = '';
    try {
      const mr = mergeDxfSheets([{ name: 'main', text: t }], new Map());
      merged = `ok blocks=${mr.blocks.length} insunits=${mr.insunits}`;
    } catch (e) {
      merged = `REFUSED ${(e as Error).message}`;
    }
    ck(merged.startsWith('ok blocks=13'), 'mergeDxfSheets accepts the R2000 output', merged);
    ck(
      readManifestLocal(
        writeDxfDetailed(job(MAIN, mainSpecs), { embed: null, now: NOW }).dxfText,
      ) === null,
      'bare DXF → readManifest null',
    );
    let threw = false;
    try {
      readManifestLocal(
        t.replace(
          /GRBPWR-MANIFEST v1 1\/(\d+) ([A-Za-z0-9+/=]{8})/,
          'GRBPWR-MANIFEST v1 1/$1 !!!!!!!!',
        ),
      );
    } catch {
      threw = true;
    }
    ck(threw, 'corrupt manifest → readManifest throws');
  }

  // N ──────────────────────────────────────────────────────────────────────────────────────
  head('N · negative controls (each must fail its check and the gate)');
  const neg = async (what: string, expectId: GateCheckId, report: GateReport) => {
    const red = failing(report);
    ck(!report.passed && red.includes(expectId), `${what} → ${expectId} red`, red.join(','));
  };
  const reGate = (text: string) => runGate(text, main.expect);
  const reEmbed = (text: string) => embedManifestLocal(text, main.expect.manifest);

  await neg(
    'drop layer 14',
    'G1-roundtrip',
    await reGate(
      reEmbed(dropEntities(main.detail.bareText, (ty, la) => ty === 'LWPOLYLINE' && la === '14')),
    ),
  );
  await neg(
    'drop one notch LINE',
    'G5-features',
    await reGate(
      reEmbed(
        dropEntities(
          main.detail.bareText,
          (ty, la, b) => ty === 'LINE' && la === '4' && b === 'SL_M',
          1,
        ),
      ),
    ),
  );
  await neg(
    'drop the grain arrow',
    'G5-features',
    await reGate(
      reEmbed(dropEntities(main.detail.bareText, (_, la, b) => la === '7' && b === 'BP_M')),
    ),
  );
  await neg(
    'inject a 2-point line on layer 8 (would be read as grain)',
    'G5-features',
    await reGate(
      reEmbed(
        injectIntoBlock(main.detail.bareText, 'BP_M', [
          ['  0', 'LINE'],
          ['  5', 'FFF0'],
          ['330', '14'],
          ['100', 'AcDbEntity'],
          ['  8', '8'],
          ['100', 'AcDbLine'],
          [' 10', '100.000000'],
          [' 20', '100.000000'],
          [' 30', '0.000000'],
          [' 11', '100.000000'],
          [' 21', '200.000000'],
          [' 31', '0.000000'],
        ]),
      ),
    ),
  );
  {
    const tampered = embedManifestLocal(main.detail.bareText, {
      ...main.expect.manifest,
      sizes: main.expect.manifest.sizes.map((s, i) => (i ? s : { ...s, sizeId: 99 })),
    });
    await neg('manifest tampered after writing', 'G9-sizes', await reGate(tampered));
    const corrupt = main.dxfText.replace(
      /GRBPWR-MANIFEST v1 1\/(\d+) ([A-Za-z0-9+/=]{8})/,
      'GRBPWR-MANIFEST v1 1/$1 AAAAAAAA',
    );
    await neg('manifest corrupt', 'G9-sizes', await reGate(corrupt));
    await neg('no manifest at all', 'G9-sizes', await reGate(main.detail.bareText));
  }
  {
    const Lx = fpLSpec();
    const specs = [Lx, fpRFrom(Lx, 'translate')];
    await neg(
      '_R is a translated copy, not the mirror',
      'G12-pair',
      (await writeAndGate(job(MAIN, specs), gateCtx(specs))).report,
    );
  }
  {
    const sl = slSpec();
    sl.sizes = sl.sizes.map((s) => ({ ...s, cut: convexHull(s.cut) })); // offset collapsed; report still claims ok
    await neg(
      'cut line collapsed to the convex hull (report lies)',
      'G6-offset',
      (await writeAndGate(job(MAIN, [sl]), gateCtx([slSpec()]))).report,
    );
    const sl2 = slSpec();
    sl2.sizes = sl2.sizes.map((s) => ({
      ...s,
      offset: { ...s.offset!, hullRatio: 1, ok: false, reason: 'hull' },
    }));
    await neg(
      'semantics flags the hull (ok:false, hullRatio 1)',
      'G6-offset',
      (await writeAndGate(job(MAIN, [sl2]), gateCtx([sl2]))).report,
    );
  }
  {
    const bp = bpSpec();
    bp.unfoldedFold = false;
    await neg(
      'fold piece not unfolded',
      'G6-offset',
      (await writeAndGate(job(MAIN, [bp]), gateCtx([bp]))).report,
    );
  }
  {
    const sl = slSpec();
    const [s0, s1, s2] = sl.sizes;
    sl.sizes = [
      { ...s2, rank: 0, sizeToken: 'S', sizeId: 11 },
      s1,
      { ...s0, rank: 2, sizeToken: 'L', sizeId: 13 },
    ];
    await neg(
      'sizes swapped (area shrinks with rank, 3 sizes)',
      'G8-monotone',
      (await writeAndGate(job(MAIN, [sl]), gateCtx([sl]))).report,
    );
  }
  {
    const graded = {
      ...bpSpec(),
      identity: 'PCK',
      code: 'PCK',
      unfoldedFold: false,
      sizes: bpSpec().sizes.map((s) => ({ ...s, fold: null })),
    };
    const specs = [graded, pckSpec()];
    const r = (await writeAndGate(job(MAIN, specs), gateCtx(specs))).report;
    await neg('PCK graded + PCK_UNI in one file', 'G10-uni', r);
  }
  {
    const sl = slSpec('SL_L'); // looks like a left hand but is no pair: "L" is a size of the run
    sl.code = 'SL';
    sl.mods = ['L'];
    await neg(
      'identity ending in a size token (SL_L, not a pair)',
      'G11-grammar',
      (await writeAndGate(job(MAIN, [sl]), gateCtx([sl]))).report,
    );
    const lc = slSpec('sl');
    lc.code = 'sl';
    await neg(
      'lower-case identity',
      'G11-grammar',
      (await writeAndGate(job(MAIN, [lc]), gateCtx([lc]))).report,
    );
  }
  {
    const sl = slSpec();
    sl.sizes = sl.sizes.map((s) => (s.rank === 1 ? { ...s, grain: null } : s));
    await neg(
      'no grain in one size',
      'G5-features',
      (await writeAndGate(job(MAIN, [sl]), gateCtx([sl]))).report,
    );
  }
  {
    const p = pckSpec();
    p.sizes = p.sizes.map((s) => ({ ...s, seam: null, offset: null }));
    await neg(
      'piece without a seam line (layers 1+14 must be a pair)',
      'G1-roundtrip',
      (await writeAndGate(job(MAIN, [p]), gateCtx([p]))).report,
    );
  }
  {
    const r = (await writeAndGate(job(MAIN, mainSpecs), gateCtx(mainSpecs, { shiftWalls: 2 })))
      .report;
    await neg('source walls 2 mm away from the written line', 'G4-hausdorff', r);
    ck(failing(r).includes('G3-coverage'), '… and G3 coverage blocks', failing(r).join(','));
  }
  {
    const sizes = MANIFEST_SIZES.map((s, i) => (i === 0 ? { ...s, sizeId: 0 } : s));
    await neg(
      'a size without a card sizeId',
      'G13-manifest',
      (await writeAndGate(job(MAIN, mainSpecs, 'r2000', sizes), gateCtx(mainSpecs))).report,
    );
  }
  {
    const r = (
      await writeAndGate(job(MAIN, mainSpecs), { ...gateCtx(mainSpecs), wallsOf: undefined })
    ).report;
    const c3 = checkOf(r, 'G3-coverage')[0];
    ck(
      r.passed && !c3.ok && c3.severity === 'warn',
      'no source walls → G3/G4 WARN (not verified), gate still passes',
      c3.note,
    );
  }

  // report ─────────────────────────────────────────────────────────────────────────────────
  const bad = rows.filter((r) => !r.ok).length;
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const json = {
    task: 'F6',
    date: new Date().toISOString(),
    passed: rows.length - bad,
    failed: bad,
    rows,
    mainGate: main.report,
  };
  fs.writeFileSync(path.join(outDir, `F6-${stamp}.json`), JSON.stringify(json, null, 2));
  console.log(bad ? `\n${bad} FAILED of ${rows.length}` : `\nall ${rows.length} ok`);
  return bad;
}
