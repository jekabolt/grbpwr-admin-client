// F6 probe: writer + gate on synthetic PieceSpecs (no dependency on unfinished lanes).
//   T1  golden structure — K2's golden-min.dxf rebuilt from PieceSpecs, compared tag by tag
//   T2  main scope: BP (unfolded, fold line, dart, drill) · FP_L/FP_R pair · SL (seam meaning,
//       cut derived by offset, concave cap) · PCK (UNI) × S/M/L → write → gate passes
//   T3  lining scope (distinct names)            T4  `_R` derived by the writer from `_L`
//   T5  R12 dialect                              T6  file framing, merge, manifest round trip
//   N*  negative controls: every mutation must turn its check red and fail the gate
//   D   F14b: G3/G4 on source walls only, derived edges audited by G15; G12 outline mirror
//       F14e (Codex R1): `along` carries only a band cut — its own, continuous, from a cut line
import fs from 'node:fs';
import path from 'node:path';
import * as blockCode from 'components/managers/tech-card/components/nesting/block-code';
import { mergeDxfSheets } from 'lib/nesting/dxf/merge';
import type {
  CardSize,
  Chain,
  ChainRole,
  ChainSet,
  DerivedEdge,
  DraftScopeTarget,
  FoldFeature,
  GateCheckId,
  GateExpectation,
  GateReport,
  GrainFeature,
  InternalFeature,
  LineClass,
  PieceCandidate,
  ManifestSize,
  ManifestSource,
  NotchFeature,
  OffsetReport,
  PieceSizeSpec,
  PieceSpec,
  PtMm,
  SizeRun,
  WriteJob,
} from 'lib/pattern-import/types';
import { bandCutSupport, slitNotches } from 'lib/pattern-import/semantics/build';
import { findSpikes, stripSpikes } from 'lib/pattern-import/spikes';
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
import {
  embedManifest as embedManifestLocal,
  embedManifestAs,
  manifestPrologueBytes,
  readManifest as readManifestLocal,
} from 'lib/pattern-import/manifest';
import { wallsUsedBy } from 'lib/pattern-import/worker/walls-used';
import {
  type CardBlockRules,
  createRunGate,
  readRawDxf,
  roundTrip,
  writeAndGate,
} from 'lib/pattern-import/gate';
import {
  type GateCtx,
  g12,
  glyphProblem,
  glyphStats,
  sameManifest,
} from 'lib/pattern-import/gate/checks';
import { identitiesOf, identityProblem, sizeTokenTest } from 'lib/pattern-import/manifest';
import * as fx from 'components/managers/tech-card/components/pattern-import/fixture';

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

// FP_L is the base hand (D1': both hands drawn, `_R` = explicit mirror of `_L`); grain at x = −465.
const FPL_M = ccw(
  mirrorX([
    { x: 330, y: 0 },
    { x: 600, y: 0 },
    { x: 610, y: 560 },
    { x: 470, y: 640 },
    { x: 330, y: 600 },
  ]),
);
function fpLSpec(sizes: SizeDef[] = SIZES): PieceSpec {
  const anchor = { x: -465, y: 1 };
  return piece('FP_L', 'FP', ['L'], {
    pairHand: 'L',
    pairOf: 'FP_R',
    sizes: sizes.map((s) => {
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
function slSpec(identity = 'SL', fabric = MAIN.fabricPurpose, sizes: SizeDef[] = SIZES): PieceSpec {
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
    sizes: sizes.map((s) => {
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
const gateCtx = (
  specs: PieceSpec[],
  extra: { shiftWalls?: number; sizeTokens?: ReadonlySet<string> } = {},
) => ({
  rules,
  sizeTokens: extra.sizeTokens ?? CARD_TOKENS,
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
  // Every VALID job's final text must re-read through the shared, strict manifest/ validator
  // (the writer may never emit a manifest that readManifest rejects). Checked in section R.
  const valid: { label: string; text: string; manifest: unknown }[] = [];
  const keep = <T extends { dxfText: string; detail: { manifest: unknown } }>(
    label: string,
    r: T,
  ) => {
    valid.push({ label, text: r.dxfText, manifest: r.detail.manifest });
    return r;
  };

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
  const main = keep('T2 main', await writeAndGate(job(MAIN, mainSpecs), gateCtx(mainSpecs)));
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
    ck(fp.pairHand === 'L' && fp.pairOf === 'FP_R', "manifest pairHand/pairOf (D1')");
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
    const r = keep(
      'T3 lining',
      await writeAndGate(
        job(
          LINING,
          all.filter((p) => p.fabrics.includes(LINING.fabricPurpose)),
        ),
        gateCtx(all),
      ),
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
    for (const f of fan)
      keep(`T3 writeScopes ${f.scope.label}`, { dxfText: f.detail.dxfText, detail: f.detail });
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
    const r = keep('T4 derived _R', await writeAndGate(job(MAIN, specs), gateCtx(specs)));
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
    const r = keep('T5 r12', await writeAndGate(job(MAIN, mainSpecs, 'r12'), gateCtx(mainSpecs)));
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
      lines[0] === '999' && lines[1].startsWith('GRBPWR-MANIFEST v1z 1/'),
      'manifest 999 lines first (compact form v1z)',
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
        .every((l) => l.length <= 'GRBPWR-MANIFEST v1z 99/99 '.length + PATIMPORT.manifestLineMax),
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
          /GRBPWR-MANIFEST v1z 1\/(\d+) ([A-Za-z0-9+/=]{8})/,
          'GRBPWR-MANIFEST v1z 1/$1 !!!!!!!!',
        ),
      );
    } catch {
      threw = true;
    }
    ck(threw, 'corrupt manifest → readManifest throws');
  }

  // C ──────────────────────────────────────────────────────────────────────────────────────
  // G11 vs pairs (I1): F13 read G11 as "every FP_L on a card with size L blocks"; F6 exempts the
  // declared hand of a real pair. Settled here through the actual gate on a run S M L XL.
  const S4: SizeDef[] = [...SIZES, { token: 'XL', sizeId: 14, rank: 3, k: 1.08 }];
  const M4: ManifestSize[] = S4.map((s) => ({
    token: s.token,
    sizeId: s.sizeId,
    name: `${s.token.toLowerCase()}_eu`,
    sourceLabel: String(44 + s.rank * 2),
    rank: s.rank,
  }));
  const T4 = new Set(S4.map((s) => s.token));
  head('C · G11 vs declared pairs on a run S M L XL (FP_L vs size L)');
  {
    const Lp = fpLSpec(S4);
    const pair = [Lp, fpRFrom(Lp)];
    const r = keep(
      'C pair on S M L XL',
      await writeAndGate(job(MAIN, pair, 'r2000', M4), gateCtx(pair, { sizeTokens: T4 })),
    );
    const g11 = checkOf(r.report, 'G11-grammar')[0];
    ck(
      r.report.passed && g11.ok,
      'declared FP_L/FP_R pair on S M L XL → G11 green, gate passes',
      summary(r.report),
    );
    const names = r.detail.plan.blocks.map((b) => b.name);
    const derived = blockCode.deriveBlockSizes(names, (t) => T4.has(t.toUpperCase()));
    ck(
      derived.get('FP_L_L') === 'L' && derived.get('FP_R_XL') === 'XL',
      'card derives FP_L_L → L and FP_R_XL → XL',
      names.join(' '),
    );
    const sl = slSpec('SL_L', MAIN.fabricPurpose, S4);
    sl.code = 'SL';
    sl.mods = ['L'];
    const r2 = await writeAndGate(job(MAIN, [sl], 'r2000', M4), gateCtx([sl], { sizeTokens: T4 }));
    ck(
      !r2.report.passed && failing(r2.report).includes('G11-grammar'),
      'non-pair SL_L on S M L XL → G11 red, gate fails',
      checkOf(r2.report, 'G11-grammar')[0].note,
    );
    const isSizeToken = sizeTokenTest(T4);
    ck(
      identityProblem('FP_L', { isSizeToken, pair: { hand: 'L', of: 'FP_R' } }) === null &&
        identityProblem('FP_L', { isSizeToken }) !== null &&
        identityProblem('FP_L', { isSizeToken, pair: { hand: 'L', of: null } }) !== null &&
        identityProblem('FP_R', { isSizeToken, pair: { hand: 'L', of: 'FP_R' } }) === null,
      'shared identityProblem: exemption only for a DECLARED pair hand (hand + pairOf)',
    );
    ck(
      identitiesOf('LIN_FP', ['1'], 'R')
        .map((w) => `${w.identity}/${w.pairOf}`)
        .join(' ') === 'LIN_FP_L_1/LIN_FP_R_1 LIN_FP_R_1/LIN_FP_L_1',
      'identitiesOf writes both hands, hand first among the mods',
    );
  }

  // W ──────────────────────────────────────────────────────────────────────────────────────
  head(
    'W · wizard (F13 fixture): pairs declared before gating; overrides reach PieceSpec + manifest',
  );
  {
    const card: CardSize[] = S4.map((s) => ({
      sizeId: s.sizeId,
      name: `${s.token.toLowerCase()}_eu`,
      token: s.token,
      rank: s.rank,
    }));
    const tokens = new Set(card.map((c) => c.token.toLowerCase()));
    const sz = fx.fixtureSizes(card, undefined, fx.fixtureChains([]).classes);
    const pc = fx.fixturePieces(
      {
        edits: [],
        opts: { cellMm: PATIMPORT.fillCellMm, snapMm: PATIMPORT.snapMm, variant: null },
      },
      sz.map.entries.length,
    );
    const base = { fileAllowance: fx.DEFAULT_ALLOWANCE, pieceOverrides: {}, operatorGrain: {} };
    const semOf = (pieceOverrides: typeof base.pieceOverrides) =>
      fx.fixtureSemantics({
        input: { ...base, pieceOverrides } as never,
        seeds: pc.seeds,
        families: pc.families,
        map: sz.map,
        sizeTokens: tokens,
      });
    const sem0 = semOf({});
    const fp = sem0.pieces.filter((p) => p.code === 'FP');
    ck(
      sz.map.entries.some((e) => e.card?.token === 'L') &&
        fp.length === 2 &&
        fp.every((p) => p.pairHand && p.pairOf),
      'run maps to S M L XL; FP is written as a declared pair FP_L + FP_R',
      fp.map((p) => `${p.identity}→${p.pairOf}`).join(' '),
    );
    ck(
      !sem0.blocked.some((b) => b.reason === 'grammar'),
      'no grammar block on a run with size L (declared pair hands are exempt)',
      sem0.blocked.map((b) => `${b.seed}:${b.reason}`).join(' '),
    );
    ck(
      sem0.blocked.some((b) => b.reason === 'merged') &&
        !sem0.blocked.some((b) => b.reason === 'leak' && /share one region/.test(b.detail)),
      "a merged region is blocked as 'merged' (not 'leak')",
    );
    const bpSeed = sem0.pieces.find((p) => p.code === 'BP')!.seed;
    const sem1 = semOf({ [bpSeed]: { code: 'BP', mods: ['L'], pairHand: null } });
    ck(
      sem1.blocked.some((b) => b.seed === bpSeed && b.reason === 'grammar'),
      'BP_L that is not a pair → blocked (grammar) before gating',
      sem1.blocked.find((b) => b.seed === bpSeed)?.detail,
    );
    const sem2 = semOf({
      [bpSeed]: {
        displayName: 'back body',
        nameOrigin: 'ai-auto',
        aiConfidence: 0.91,
        piecesPerGarment: 1,
        fused: true,
      },
    });
    const bp = sem2.pieces.find((p) => p.seed === bpSeed)!;
    ck(
      bp.displayName === 'back body' &&
        bp.nameOrigin === 'ai-auto' &&
        bp.aiConfidence === 0.91 &&
        bp.piecesPerGarment === 1 &&
        bp.fused,
      'pieceOverrides displayName/nameOrigin/aiConfidence/piecesPerGarment/fused → PieceSpec',
    );
    // …and through the REAL writer into the embedded manifest.
    const d = writeDxfDetailed(
      { ...job(MAIN, [bp], 'r2000', fx.manifestSizes(sz.map)) },
      { now: NOW },
    );
    const mp = readManifestLocal(d.dxfText)?.pieces.find((p) => p.identity === bp.identity);
    ck(
      !!mp &&
        mp.displayName === 'back body' &&
        mp.nameOrigin === 'ai-auto' &&
        mp.aiConfidence === 0.91 &&
        mp.fused === true,
      'write/ → manifest piece carries displayName, ai-auto flag, aiConfidence, fused',
      JSON.stringify(
        mp && { n: mp.displayName, o: mp.nameOrigin, c: mp.aiConfidence, f: mp.fused },
      ),
    );
  }

  // R ──────────────────────────────────────────────────────────────────────────────────────
  head('R · every valid fixture round-trips through the shared readManifest');
  {
    const gold = goldenSpecs();
    const goldScope: DraftScopeTarget = {
      scopeKey: 'shell',
      fabricPurpose: 'shell',
      bomLineKey: '',
      label: 'shell',
      isInterlining: false,
    };
    keep(
      'T1 golden',
      await writeAndGate(
        job(goldScope, gold, 'r2000', [
          { token: 'M', sizeId: 2, name: 'm', sourceLabel: 'M', rank: 0 },
          { token: 'L', sizeId: 3, name: 'l', sourceLabel: 'L', rank: 1 },
        ]),
        { ...gateCtx(gold), sizeTokens: new Set(['M', 'L']), wallsOf: undefined },
      ),
    );
    for (const v of valid) {
      let note = '';
      let ok = false;
      try {
        const back = readManifestLocal(v.text);
        ok = !!back && sameManifest(back, v.manifest);
        if (!ok) note = back ? 'read back differs from the written manifest' : 'no manifest';
      } catch (e) {
        note = String(e);
      }
      ck(ok, `${v.label}: readManifest accepts the written manifest and it deep-equals`, note);
    }
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
      /GRBPWR-MANIFEST v1z 1\/(\d+) ([A-Za-z0-9+/=]{8})/,
      'GRBPWR-MANIFEST v1z 1/$1 AAAAAAAA',
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
    // Since the shared manifest/ module landed (F6b), a duplicate identity inside one file is
    // refused already when the manifest is embedded — earlier than G10. Either refusal is correct.
    try {
      const r = (await writeAndGate(job(MAIN, specs), gateCtx(specs))).report;
      await neg('PCK graded + PCK_UNI in one file', 'G10-uni', r);
    } catch (e) {
      const code = (e as { code?: string }).code;
      ck(
        code === 'shape',
        'PCK graded + PCK_UNI in one file → manifest refuses the duplicate identity',
        String(e),
      );
    }
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
    // Same pattern as the PCK duplicate: the shared manifest/ validator refuses `sizeId: 0` when
    // the manifest is embedded, before G13 runs. Either refusal keeps the file off the card.
    try {
      const r = (await writeAndGate(job(MAIN, mainSpecs, 'r2000', sizes), gateCtx(mainSpecs)))
        .report;
      await neg('a size without a card sizeId', 'G13-manifest', r);
    } catch (e) {
      const code = (e as { code?: string }).code;
      ck(
        code === 'shape' && /sizeId/.test(String(e)),
        'a size without a card sizeId → manifest refuses it (before G13)',
        String(e),
      );
    }
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

  // D ──────────────────────────────────────────────────────────────────────────────────────
  head('D · F14b: derived edges never walls (G3/G4 source only, G15 audits them) · G12 outline');
  {
    // PCK (160 × 180, cut meaning, UNI): its drawn wall is ONE open chain round the outline with a
    // gap on the right side (x = 160) from y = 90 − g/2 to 90 + g/2. The written cut runs straight
    // across the gap — exactly what a fill closed by a bridge writes.
    const pck = pckSpec();
    const rank = pck.sizes[0].rank;
    const gapWalls = (g: number): PtMm[][] => [
      [
        { x: 160, y: 90 + g / 2 },
        { x: 160, y: 180 },
        { x: 0, y: 180 },
        { x: 0, y: 0 },
        { x: 160, y: 0 },
        { x: 160, y: 90 - g / 2 },
      ],
    ];
    /** A bridge over the gap as F4b draws it: snapped to both ends, operator ones 0.6 mm past. */
    const bridge = (
      g: number,
      kind: DerivedEdge['kind'],
      over = kind === 'operator-bridge' ? 0.6 : 0,
    ) => ({
      kind,
      pts: [
        { x: 160, y: 90 - g / 2 - over },
        { x: 160, y: 90 + g / 2 + over },
      ],
    });
    const ctxOf = (g: number, derived: DerivedEdge[] | undefined) => ({
      ...gateCtx([pck]),
      wallsOf: (_id: string, r: number) => (r === rank ? gapWalls(g) : undefined),
      derivedOf: derived
        ? (_id: string, r: number) => (r === rank ? derived : undefined)
        : undefined,
    });
    const gateOf = async (g: number, derived?: DerivedEdge[]) =>
      writeAndGate(job(MAIN, [pck]), ctxOf(g, derived));
    const one = (r: GateReport, id: GateCheckId) => checkOf(r, id)[0];

    // source-only, no gap: passes, G15 has nothing to audit
    {
      const r = await gateOf(0);
      ck(
        r.report.passed &&
          one(r.report, 'G15-derived')?.ok &&
          one(r.report, 'G4-hausdorff').ok &&
          !r.report.derived,
        'source-only correct piece passes (G4 ✓, G15 ✓ no derived edges, nothing audited)',
        `${summary(r.report)} · ${one(r.report, 'G15-derived')?.note}`,
      );
    }
    // the gap with NO derived edge: G4 is source-only, the 2.35 mm mid-gap distance blocks
    await neg(
      '4.7 mm gap in the drawn wall, no bridge declared',
      'G4-hausdorff',
      (await gateOf(4.7)).report,
    );
    // palto's case: a 4.7 mm operator bridge — G15 audits it, G4 leaves exactly that stretch out
    {
      const r = await gateOf(4.7, [bridge(4.7, 'operator-bridge')]);
      const back = readManifestLocal(r.dxfText);
      const audit = back?.gate?.derived ?? [];
      ck(
        r.report.passed &&
          one(r.report, 'G15-derived').ok &&
          one(r.report, 'G4-hausdorff').ok &&
          audit.length === 1 &&
          audit[0].kind === 'operator-bridge' &&
          audit[0].block === 'PCK_UNI',
        '4.7 mm operator bridge: passes; the manifest in the file lists it (audited)',
        `${summary(r.report)} · audit ${JSON.stringify(audit)} · G4 ${one(r.report, 'G4-hausdorff').note}`,
      );
    }
    // a 2.5 mm automatic bridge passes too (≤ 3 mm, as F4b draws them)
    {
      const r = await gateOf(2.5, [bridge(2.5, 'bridge')]);
      ck(
        r.report.passed && one(r.report, 'G15-derived').ok,
        '2.5 mm automatic bridge passes',
        summary(r.report),
      );
    }
    // fabricated long bridges across a leak: blocked, and G4 does not excuse them
    {
      const r = (await gateOf(40, [bridge(40, 'operator-bridge')])).report;
      await neg('40 mm operator bridge across a leak', 'G15-derived', r);
      ck(
        failing(r).includes('G4-hausdorff'),
        '… and G4 measures it against the drawn walls (red)',
        failing(r).join(','),
      );
    }
    await neg(
      '8 mm "automatic" bridge (> 3 mm)',
      'G15-derived',
      (await gateOf(8, [bridge(8, 'bridge')])).report,
    );
    await neg('40 mm band cut', 'G15-derived', (await gateOf(40, [bridge(40, 'band-cut')])).report);
    // an end that lands nowhere (2 mm inside the piece)
    await neg(
      'bridge end 2 mm off any drawn wall',
      'G15-derived',
      (
        await gateOf(4.7, [
          {
            kind: 'operator-bridge',
            pts: [
              { x: 160, y: 90 - 2.35 },
              { x: 158, y: 90 + 2.35 },
            ],
          },
        ])
      ).report,
    );
    // per-piece aggregate: seven short bridges (each fine on its own) are too many
    await neg(
      'seven derived edges on one piece',
      'G15-derived',
      (
        await gateOf(
          2,
          Array.from({ length: 7 }, (_, i) => ({
            kind: 'bridge' as const,
            pts: [
              { x: 160, y: 89 - i * 0.1 },
              { x: 160, y: 91 + i * 0.1 },
            ],
          })),
        )
      ).report,
    );
    // per-piece aggregate: off-wall share of the line — 25 mm of a 680 mm line is 3.7 % (ok);
    // two such gaps = 7.4 % (> 5 %)
    {
      const walls2: PtMm[][] = [
        [
          { x: 160, y: 50 + 12.5 },
          { x: 160, y: 130 - 12.5 },
        ],
        [
          { x: 160, y: 130 + 12.5 },
          { x: 160, y: 180 },
          { x: 0, y: 180 },
          { x: 0, y: 0 },
          { x: 160, y: 0 },
          { x: 160, y: 50 - 12.5 },
        ],
      ];
      const br = (y: number): DerivedEdge => ({
        kind: 'operator-bridge',
        pts: [
          { x: 160, y: y - 13.1 },
          { x: 160, y: y + 13.1 },
        ],
      });
      const r = (
        await writeAndGate(job(MAIN, [pck]), {
          ...gateCtx([pck]),
          wallsOf: (_id: string, rr: number) => (rr === rank ? walls2 : undefined),
          derivedOf: (_id: string, rr: number) => (rr === rank ? [br(50), br(130)] : undefined),
        })
      ).report;
      await neg(
        'two 25 mm operator bridges = 7.4 % of the line off the drawn walls',
        'G15-derived',
        r,
      );
    }

    // ── F14e (Codex R1): `along` carries only a band cut, only its own, only continuously ──────
    // On PCK's right side: the drawn walls stop at y = 90 ∓ g/2; a derived edge spans the gap.
    const span = (g: number, kind: DerivedEdge['kind'], along?: PtMm[][]): DerivedEdge => ({
      kind,
      pts: [
        { x: 160, y: 90 - g / 2 },
        { x: 160, y: 90 + g / 2 },
      ],
      ...(along ? { along } : {}),
    });
    /** A straight drawn line beside the gap: `dx` off the cut, from y0 to y1. */
    const line = (dx: number, y0: number, y1: number): PtMm[] => [
      { x: 160 + dx, y: y0 },
      { x: 160 + dx, y: y1 },
    ];
    const g15of = (r: GateReport) => one(r, 'G15-derived');
    // Codex's exploit (real walls end at the gap's two ends, an unrelated grain / internal line runs
    // 0.2 mm beside it, a 100 mm operator "bridge" closes it and carries that line as `along`)
    {
      const r = (await gateOf(100, [span(100, 'operator-bridge', [line(0.2, 40, 140)])])).report;
      await neg(
        'Codex R1: 100 mm operator bridge carrying a line 0.2 mm beside it as `along`',
        'G15-derived',
        r,
      );
      ck(
        failing(r).includes('G4-hausdorff'),
        '… and G4 measures it against the drawn walls (red)',
        `${failing(r).join(',')} · G15 ${g15of(r).note.slice(0, 160)}`,
      );
    }
    // the same carried as a "band cut" is NOT carried by a grain line: the semantics filter
    // (`bandCutSupport`) hands the gate only the rank's own size line or a common line, and only
    // where it runs along THIS edge in one stretch ≥ derivedAlongMinShare
    {
      const RANK = 1;
      const OWN = 11;
      const chainOf = (id: number, pts: PtMm[]): Chain => ({
        id,
        pts,
        closed: false,
        ranges: [],
        motif: null,
        style: 1,
        lengthMm: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
      });
      const clsOf = (id: number, role: ChainRole, rank: number | null): LineClass => ({
        id,
        role,
        sizeLabel: role === 'size' ? `R${rank}` : null,
        chains: [0],
        totalLengthMm: 0,
        evidence: rank != null ? [{ kind: 'nesting-order', rank }] : [],
        confidence: 1,
      });
      const runOf: SizeRun = {
        encoding: 'declared-dash',
        sizes: [
          { label: 'R0', rank: 0, classId: 10, file: null },
          { label: 'R1', rank: RANK, classId: OWN, file: null },
        ],
        evidence: [],
      };
      /** What `bandCutSupport` hands the gate for a 100 mm band cut beside ONE drawn line — the
       * cut's own rung (provenance [0]) unless `provenance` says otherwise. */
      const supportFor = (
        pts: PtMm[],
        cls: LineClass | null,
        g = 100,
        provenance: number[] = [0],
      ) =>
        bandCutSupport(
          {
            chains: [chainOf(0, pts)],
            classes: cls ? [cls] : [],
            bundles: [],
            orphans: cls ? [] : [0],
            warnings: [],
          },
          runOf,
        )(span(g, 'band-cut').pts, RANK, provenance);
      const full = line(0.2, 40, 140);
      const cases: [string, PtMm[], LineClass | null, boolean][] = [
        ['grain line 0.2 mm beside, full length', full, clsOf(1, 'grain', null), false],
        ['internal line 0.2 mm beside, full length', full, clsOf(1, 'internal', null), false],
        ['notch-class line beside', full, clsOf(1, 'notch', null), false],
        ['unclassified (orphan) line beside', full, null, false],
        ["another size's line beside", full, clsOf(10, 'size', 0), false],
        [
          'own size, 50 % of the cut (one stretch)',
          line(0.1, 40, 90),
          clsOf(OWN, 'size', RANK),
          false,
        ],
        ['own size, the whole cut', full, clsOf(OWN, 'size', RANK), true],
        ['common line, the whole cut', full, clsOf(2, 'common', null), true],
      ];
      for (const [what, pts, cls, want] of cases) {
        const got = supportFor(pts, cls);
        ck(
          got.length === (want ? 1 : 0),
          `bandCutSupport: ${what} → ${want ? 'carries' : 'carries nothing'}`,
          `${got.length} chain(s)`,
        );
      }
      // S1 (Codex round 3): the same own-size line, 0.2 mm beside the whole cut, but NOT the rung
      // the cut was carried from (another piece's segment) — the search is never global
      {
        const own = clsOf(OWN, 'size', RANK);
        const notMine = supportFor(full, own, 100, [7]);
        const none = supportFor(full, own, 100, []);
        ck(
          notMine.length === 0 && none.length === 0,
          "bandCutSupport: another piece's own-size line beside the whole cut (not the cut's rung) → carries nothing",
          `foreign ${notMine.length} chain(s) · no provenance ${none.length} chain(s)`,
        );
        const r = (await gateOf(100, [span(100, 'band-cut', notMine.length ? notMine : undefined)]))
          .report;
        await neg(
          "S1: 100 mm band edge beside another piece's same-rank line (0.2 mm, full length)",
          'G15-derived',
          r,
        );
        ck(failing(r).includes('G4-hausdorff'), '… and G4 red', failing(r).join(','));
      }
      // the grain line's (empty) support → the 100 mm band cut is uncarried → G15 red, G4 red
      {
        const along = supportFor(full, clsOf(1, 'grain', null));
        const r = (await gateOf(100, [span(100, 'band-cut', along.length ? along : undefined)]))
          .report;
        await neg('100 mm band cut beside a grain line (semantics: no support)', 'G15-derived', r);
        ck(failing(r).includes('G4-hausdorff'), '… and G4 red', failing(r).join(','));
      }
      // reef's L: a 95.25 mm cut on its own size's tick that stops 8.5 mm short (91.1 %) — carried
      {
        const g = 95.25;
        const tick = line(0.1, 90 - g / 2 + 8.5, 90 + g / 2);
        const along = supportFor(tick, clsOf(OWN, 'size', RANK), g);
        const r = await gateOf(g, [span(g, 'band-cut', along)]);
        const audit = readManifestLocal(r.dxfText)?.gate?.derived ?? [];
        ck(
          along.length === 1 &&
            r.report.passed &&
            g15of(r.report).ok &&
            one(r.report, 'G4-hausdorff').ok &&
            audit.length === 1 &&
            // 8.5 mm less the snap at each end of the stretch (reef: 8.0)
            Math.abs(audit[0].offSourceMm - 8.5) <= 1,
          "reef's L band cut (95.25 mm, own tick 91.1 % of it) passes; ≈ 8 mm audited off the drawing",
          `${summary(r.report)} · audit ${JSON.stringify(audit)}`,
        );
      }
    }
    // gate level, whatever the semantics hand over: an `along` beside only HALF of a 50 mm band
    // cut does not carry it (one stretch < derivedAlongMinShare) — before F14e the 25 mm left off
    // was under the 30 mm bound and it passed
    await neg(
      '50 mm band cut, `along` beside 25 mm of it',
      'G15-derived',
      (await gateOf(50, [span(50, 'band-cut', [line(0.1, 65, 90)])])).report,
    );
    // … nor does a dotted contact (five 5 mm touches, half the cut in all)
    await neg(
      '50 mm band cut, `along` touching it in five 5 mm pieces',
      'G15-derived',
      (
        await gateOf(50, [
          span(
            50,
            'band-cut',
            Array.from({ length: 5 }, (_, i) => line(0.1, 65 + i * 10, 70 + i * 10)),
          ),
        ])
      ).report,
    );
    // never pooled: two 50 mm band cuts on two gaps; the line beside both rides on B only — A is
    // judged on its own (no support → longer than an uncarried cut may be)
    {
      const wallsAB: PtMm[][] = [
        [
          { x: 160, y: 70 },
          { x: 160, y: 100 },
        ],
        [
          { x: 160, y: 150 },
          { x: 160, y: 180 },
          { x: 0, y: 180 },
          { x: 0, y: 0 },
          { x: 160, y: 0 },
          { x: 160, y: 20 },
        ],
      ];
      const edge = (y0: number, y1: number, along?: PtMm[][]): DerivedEdge => ({
        kind: 'band-cut',
        pts: [
          { x: 160, y: y0 },
          { x: 160, y: y1 },
        ],
        ...(along ? { along } : {}),
      });
      const r = (
        await writeAndGate(job(MAIN, [pck]), {
          ...gateCtx([pck]),
          wallsOf: (_id: string, rr: number) => (rr === rank ? wallsAB : undefined),
          derivedOf: (_id: string, rr: number) =>
            rr === rank ? [edge(20, 70), edge(100, 150, [line(0.1, 20, 150)])] : undefined,
        })
      ).report;
      await neg("band cut A carried only by band cut B's `along` (pooling)", 'G15-derived', r);
      ck(
        /band-cut 50\.0 mm: longer than/.test(g15of(r).note) &&
          (g15of(r).note.match(/band-cut/g) ?? []).length === 1,
        '… exactly A is named (B, carried by its own line, is fine)',
        g15of(r).note.slice(0, 220),
      );
    }
  }
  {
    // G12: an `_R` with `_L`'s area and box but another outline. One vertex of each R size slides
    // 5 mm along the chord of its neighbours — the triangle on that chord keeps its height, so the
    // area is EXACTLY equal; the vertex is picked so the bbox does not move.
    const Lx = fpLSpec();
    const R = fpRFrom(Lx);
    const slid = (cut: PtMm[]): PtMm[] | null => {
      const b0 = bboxOf(cut);
      for (let i = 0; i < cut.length; i++) {
        const a = cut[(i + cut.length - 1) % cut.length];
        const c = cut[(i + 1) % cut.length];
        const L = Math.hypot(c.x - a.x, c.y - a.y);
        for (const sg of [5, -5]) {
          const out = cut.map((p, k) =>
            k === i ? { x: p.x + ((c.x - a.x) / L) * sg, y: p.y + ((c.y - a.y) / L) * sg } : p,
          );
          const b1 = bboxOf(out);
          if (
            Math.max(
              Math.abs(b1.minX - b0.minX),
              Math.abs(b1.minY - b0.minY),
              Math.abs(b1.maxX - b0.maxX),
              Math.abs(b1.maxY - b0.maxY),
            ) < 1e-9
          )
            return out;
        }
      }
      return null;
    };
    let made = true;
    R.sizes = R.sizes.map((s) => {
      const cut = slid(s.cut);
      if (!cut) made = false;
      return cut ? { ...s, cut, bbox: bboxOf(cut) } : s;
    });
    const dArea = Math.max(
      ...R.sizes.map((s, i) => Math.abs(areaOf(s.cut) - areaOf(fpRFrom(Lx).sizes[i].cut))),
    );
    ck(
      made && dArea < 1e-6,
      'tampered _R: same area, same bbox as the true mirror',
      `Δarea ${dArea.toExponential(1)} mm²`,
    );
    const specs = [Lx, R];
    const r = (await writeAndGate(job(MAIN, specs), gateCtx(specs))).report;
    await neg('_R with equal area / bbox / notches but another outline', 'G12-pair', r);
    const n12 = checkOf(r, 'G12-pair')[0].note;
    ck(
      /off the mirror of L/.test(n12) && !/area differs|bbox off/.test(n12),
      '… caught by the outline Hausdorff alone (area and bbox agree)',
      n12.slice(0, 200),
    );
  }
  {
    // G12 on a zero-area pair: the ratio was 0/0 = NaN and NaN passed. Straight on g12 — the writer
    // would not lay out a degenerate piece.
    const flat = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 0 },
    ];
    const grain = [
      { x: 0, y: -10 },
      { x: 0, y: 10 },
    ];
    const raw = new Map(
      ['FP_L_M', 'FP_R_M'].map((b) => [
        b,
        [
          { type: 'LWPOLYLINE', layer: '1', closed: true, pts: flat },
          { type: 'LWPOLYLINE', layer: '7', closed: false, pts: grain },
        ],
      ]),
    );
    const piece = (identity: string, hand: 'L' | 'R', of: string) => ({
      identity,
      pairHand: hand,
      pairOf: of,
    });
    const block = (b: string, identity: string) => ({
      block: b,
      identity,
      sizeToken: 'M',
      notches: 0,
    });
    const ctx = {
      m: {
        pieces: [piece('FP_L', 'L', 'FP_R'), piece('FP_R', 'R', 'FP_L')],
        blocks: [block('FP_L_M', 'FP_L'), block('FP_R_M', 'FP_R')],
      },
      raw: { blocks: raw },
    } as unknown as GateCtx;
    const c = g12(ctx);
    ck(
      !c.ok && c.severity === 'block' && /area not a positive number/.test(c.note),
      'zero-area L/R pair → G12 red (not NaN-green)',
      c.note,
    );
  }

  // S ──────────────────────────────────────────────────────────────────────────────────────
  head(
    'S · zero-width out-and-back spikes: stripped at the outline and the writer, G4 blocks any left',
  );
  {
    const SQ: PtMm[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    /** SQ with `spike` spliced in after (x, 0) on its bottom edge: out and back to (x, 0). */
    const withSpike = (x: number, spike: PtMm[]): PtMm[] => [
      SQ[0],
      { x, y: 0 },
      ...spike,
      { x, y: 0 },
      ...SQ.slice(1),
    ];
    /** Largest distance of a vertex from the square's boundary (0 = nothing sticks out). */
    const offSquare = (r: PtMm[]) =>
      Math.max(
        ...r.map(
          (p) =>
            Math.min(Math.abs(p.x), Math.abs(p.y), Math.abs(100 - p.x), Math.abs(100 - p.y)) +
            (p.x < 0 || p.y < 0 || p.x > 100 || p.y > 100 ? 1000 : 0),
        ),
      );
    const stripCase = (what: string, ring: PtMm[], want: 'stripped' | 'kept') => {
      const s = stripSpikes(ring);
      const left = findSpikes(s.ring);
      const ok =
        want === 'stripped'
          ? s.spikes > 0 && offSquare(s.ring) <= 1e-9 && !left.length
          : s.spikes === 0 && s.ring.length === ring.length && !findSpikes(ring).length;
      ck(
        ok,
        `stripSpikes: ${what} → ${want}`,
        `${s.spikes} tip(s), ${ring.length} → ${s.ring.length} vertices, off the square ${offSquare(s.ring).toFixed(3)} mm, gate finds ${left.length} · area ${areaOf(s.ring).toFixed(3)} vs ${areaOf(ring).toFixed(3)} mm²`,
      );
      return s;
    };
    // kombinezon seed 0's case: 12 mm out along a line and back, the two legs at different vertices
    stripCase(
      '12 mm spike, legs with different vertices',
      withSpike(40, [
        { x: 40, y: -3 },
        { x: 40, y: -7.5 },
        { x: 40, y: -12 },
        { x: 40, y: -9 },
        { x: 40, y: -4.2 },
        { x: 40, y: -1 },
      ]),
      'stripped',
    );
    // reef HB_4XL's case: a corner overshot by 0.57 mm and retraced (p, tip, p)
    stripCase(
      '0.57 mm corner overshoot',
      [SQ[0], SQ[1], { x: 100.57, y: 0 }, ...SQ.slice(1)],
      'stripped',
    );
    // a curved needle: out along an arc, back along the same arc at other vertices; flat tip
    {
      const arc = (t: number) => ({ x: 60 + 8 * Math.sin(t), y: -8 * (1 - Math.cos(t)) - 6 * t });
      const out = Array.from({ length: 9 }, (_, k) => arc(((k + 1) / 9) * 1.2));
      const back = Array.from({ length: 6 }, (_, k) => arc(((5.5 - k) / 6.2) * 1.2));
      const tip = out[out.length - 1];
      stripCase(
        'curved 15 mm needle, flat tip (two vertices 0.02 mm apart)',
        withSpike(60, [...out, { x: tip.x + 0.02, y: tip.y }, ...back]),
        'stripped',
      );
    }
    // genuine narrow features are kept: a 5 mm deep V 0.5 mm wide (a notch), a zig-zag edge
    stripCase(
      'notch-like V 5 mm deep, 0.5 mm wide',
      [SQ[0], { x: 49.75, y: 0 }, { x: 50, y: 5 }, { x: 50.25, y: 0 }, ...SQ.slice(1)],
      'kept',
    );
    stripCase(
      "zig-zag edge (polupalto's cuff: 1.3 mm teeth, 0.43 mm)",
      [
        SQ[0],
        ...Array.from({ length: 20 }, (_, k) => ({ x: 10 + k * 1.2, y: k % 2 ? 0.43 : 0 })),
        ...SQ.slice(1),
      ],
      'kept',
    );

    // the writer (last defence, Codex r5a): what it strips is never silently lost — a stretch that
    // goes in and out ≥ notchMinMm is written as a notch at that point (warned), a smaller one is
    // only removed (warned)
    const clean = pckSpec();
    const notchesOf = (r: {
      detail: { plan: { blocks: { identity: string; notches: unknown[] }[] } };
    }) => r.detail.plan.blocks.find((x) => x.identity === 'PCK')?.notches.length ?? -1;
    const n0 = notchesOf(await writeAndGate(job(MAIN, [clean]), gateCtx([clean])));
    const writeWith = async (tipY: number[]) => {
      const sp = pckSpec();
      const c0 = sp.sizes[0].cut;
      const i0 = c0.findIndex((p, k) => {
        const q = c0[(k + 1) % c0.length];
        return Math.abs(p.y) < 1e-9 && Math.abs(q.y) < 1e-9;
      });
      const mx = (c0[i0].x + c0[(i0 + 1) % c0.length].x) / 2;
      sp.sizes[0] = {
        ...sp.sizes[0],
        cut: [
          ...c0.slice(0, i0 + 1),
          { x: mx, y: 0 },
          ...tipY.map((y) => ({ x: mx, y })),
          { x: mx, y: 0 },
          ...c0.slice(i0 + 1),
        ],
      };
      const w = await writeAndGate(job(MAIN, [sp]), gateCtx([clean]));
      const blk = w.detail.plan.blocks.find((x) => x.identity === 'PCK');
      return { w, blk };
    };
    {
      // a 3 mm slit drawn into the cut line (in and out, along the inward normal)
      const { w, blk } = await writeWith([1.5, 3, 1.2]);
      const g5 = checkOf(w.report, 'G5-features')[0];
      ck(
        !!blk &&
          !findSpikes(blk.cut).length &&
          blk.notches.length === n0 + 1 &&
          blk.notches.some((n) => Math.abs(n.depthMm - 3) < 1e-6) &&
          g5.ok &&
          w.report.passed &&
          w.detail.warnings.some((x) => /written as notch/.test(x)),
        'writer: a 3 mm slit in the cut line → no needle, one more layer-4 notch (3 mm) there, G5 + gate pass',
        `${blk?.cut.length} vertices · notches ${n0} → ${blk?.notches.length} · ${w.detail.warnings.filter((x) => /spike/.test(x)).join(' | ')} · ${summary(w.report)}`,
      );
    }
    {
      // a 12 mm needle: a notch too (clamped to notchMaxMm, warned), never silently gone
      const { w, blk } = await writeWith([-5, -12, -6.5]);
      ck(
        !!blk &&
          !findSpikes(blk.cut).length &&
          blk.notches.length === n0 + 1 &&
          w.detail.warnings.some((x) => /written as notch/.test(x)) &&
          w.detail.warnings.some((x) => /clamped/.test(x)) &&
          w.report.passed,
        'writer: a 12 mm needle → stripped, written as a notch (clamped, warned), gate passes',
        `notches ${n0} → ${blk?.notches.length} · ${w.detail.warnings.filter((x) => /spike|clamp/.test(x)).join(' | ')}`,
      );
    }
    {
      // a 1 mm overshoot-like needle: under notchMinMm → removed, warned, no notch
      const { w, blk } = await writeWith([-1]);
      ck(
        !!blk &&
          !findSpikes(blk.cut).length &&
          blk.notches.length === n0 &&
          w.detail.warnings.some((x) => /zero-width spike/.test(x) && !/notch/.test(x)) &&
          w.report.passed,
        'writer: a 1 mm needle (< notchMinMm) → removed and warned, no notch',
        `notches ${n0} → ${blk?.notches.length} · ${w.detail.warnings.filter((x) => /spike/.test(x)).join(' | ')}`,
      );
    }
    // semantics: a slit is a notch only when THIS piece's own cut-line chain draws it
    {
      const SQS: PtMm[] = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 3 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      const chainOf = (id: number, pts: PtMm[], closed = false): Chain => ({
        id,
        pts,
        closed,
        ranges: [],
        motif: null,
        style: 1,
        lengthMm: 0,
      });
      const clsOf = (id: number, role: ChainRole, chains: number[]): LineClass => ({
        id,
        role,
        sizeLabel: role === 'size' ? 'M' : null,
        chains,
        totalLengthMm: 0,
        evidence: [],
        confidence: 1,
      });
      const runOf: SizeRun = {
        encoding: 'declared-dash',
        sizes: [
          { label: 'S', rank: 0, classId: 10, file: null },
          { label: 'M', rank: 1, classId: 11, file: null },
        ],
        evidence: [],
      };
      const cand = (walls: number[]) => ({ rank: 1, walls }) as unknown as PieceCandidate;
      // the cut line itself goes in and out: one chain of size M, the whole outline with its slit
      {
        const st = stripSpikes(SQS);
        const set: ChainSet = {
          chains: [chainOf(0, SQS, true)],
          classes: [clsOf(11, 'size', [0])],
          bundles: [],
          orphans: [],
          warnings: [],
        };
        const r = slitNotches(st.excursions, cand([0]), set, runOf);
        ck(
          st.spikes > 0 &&
            !findSpikes(st.ring).length &&
            r.notches.length === 1 &&
            Math.hypot(r.notches[0].at.x - 50, r.notches[0].at.y) < 1e-6 &&
            Math.abs(r.notches[0].depthMm - 3) < 1e-6,
          "semantics: a 3 mm slit drawn by the piece's own cut line → a 3 mm notch at (50, 0)",
          JSON.stringify(r.notches.map((n) => ({ at: n.at, depth: n.depthMm }))),
        );
      }
      // the outline ran up a bundle of INTERNAL lines and back: stripped, no notch
      {
        const st = stripSpikes(SQS);
        const set: ChainSet = {
          chains: [
            chainOf(0, [SQS[0], SQS[1], SQS[4], SQS[5], SQS[6]], true),
            chainOf(1, [
              { x: 50, y: -1 },
              { x: 50, y: 4 },
            ]),
            chainOf(2, [
              { x: 50.1, y: -1 },
              { x: 50.1, y: 4 },
            ]),
          ],
          classes: [clsOf(11, 'size', [0]), clsOf(12, 'internal', [1, 2])],
          bundles: [],
          orphans: [],
          warnings: [],
        };
        const r = slitNotches(st.excursions, cand([0, 1, 2]), set, runOf);
        ck(
          st.spikes > 0 && r.notches.length === 0 && r.dropped.length === 1,
          'semantics: a spike along a bundle of internal lines → stripped, no notch',
          `${r.notches.length} notch(es), ${r.dropped.length} dropped`,
        );
      }
      // another size's line draws it: not this piece's cut line → no notch
      {
        const st = stripSpikes(SQS);
        const set: ChainSet = {
          chains: [chainOf(0, SQS, true)],
          classes: [clsOf(10, 'size', [0])],
          bundles: [],
          orphans: [],
          warnings: [],
        };
        const r = slitNotches(st.excursions, cand([0]), set, runOf);
        ck(
          r.notches.length === 0,
          "semantics: another size's line draws the slit → no notch",
          `${r.notches.length}`,
        );
      }
    }

    // the gate: a needle put back into the written file (after the writer) blocks on G4
    const g = await writeAndGate(job(MAIN, [clean]), gateCtx([clean]));
    ck(g.report.passed, 'control: the clean PCK passes', summary(g.report));
    const p = pairsOf(g.detail.bareText);
    let inBlock = false;
    let poly = false;
    let done = false;
    let seen = 0;
    const out: Pair[] = [];
    for (let k = 0; k < p.length; k++) {
      const [code, val] = p[k];
      const c = code.trim();
      if (c === '0') {
        if (val === 'BLOCK') inBlock = false;
        poly = val === 'LWPOLYLINE';
        seen = 0;
      }
      if (c === '2' && /^PCK/.test(val)) inBlock = true;
      if (poly && c === '8' && val !== '1') poly = false;
      if (inBlock && poly && !done && c === '90') {
        out.push([code, String(Number(val) + 2)]);
        continue;
      }
      out.push(p[k]);
      if (inBlock && poly && !done && c === '20') {
        seen++;
        if (seen === 1) {
          const x = Number(p[k - 1][1]);
          const y = Number(val);
          // a 12 mm needle straight out of the first vertex, and back
          out.push(['10', String(x)], ['20', String(y - 12)], ['10', String(x)], ['20', String(y)]);
          done = true;
        }
      }
    }
    const bad = await runGate(embedManifestLocal(textOf(out), g.expect.manifest), g.expect);
    const n4 = checkOf(bad, 'G4-hausdorff')[0];
    ck(done, 'mutation: a needle injected into the written PCK cut line', `${done}`);
    ck(
      !bad.passed && !n4.ok && n4.severity === 'block' && /zero-width spike/.test(n4.note),
      'gate: a written cut line with a zero-width needle → G4-hausdorff red',
      `${failing(bad).join(',')} · ${n4.note.slice(0, 200)}`,
    );
  }

  // M1 ─────────────────────────────────────────────────────────────────────────────────────
  head('M1 · compact manifest: a polupalto-size sheet (23 pieces × 6 sizes = 138 blocks)');
  {
    const S6: SizeDef[] = [44, 46, 48, 50, 52, 54].map((n, i) => ({
      token: String(n),
      sizeId: 40 + i,
      rank: i,
      k: 0.94 + i * 0.024,
    }));
    const M6: ManifestSize[] = S6.map((x) => ({
      token: x.token,
      sizeId: x.sizeId,
      name: `${x.token}_eu`,
      sourceLabel: x.token,
      rank: x.rank,
    }));
    const specs = Array.from({ length: 23 }, (_, i) => {
      const p = slSpec(`SL_${i + 1}`, MAIN.fabricPurpose, S6);
      p.code = 'SL';
      p.mods = [String(i + 1)];
      return p;
    });
    const big = await writeAndGate(job(MAIN, specs, 'r2000', M6), {
      ...gateCtx(specs, { sizeTokens: new Set(S6.map((x) => x.token)) }),
    });
    const zBytes = manifestPrologueBytes(big.dxfText);
    const plainBytes = manifestPrologueBytes(
      embedManifestAs(big.detail.bareText, big.detail.manifest, 'v1'),
    );
    ck(
      big.detail.manifest.blocks.length === 138,
      '138 blocks written',
      String(big.detail.manifest.blocks.length),
    );
    ck(
      zBytes <= 16 * 1024,
      'v1z prologue ≤ 16 KB',
      `v1z ${(zBytes / 1024).toFixed(1)} KB vs plain v1 ${(plainBytes / 1024).toFixed(1)} KB (gate ${big.report.passed ? 'passed' : 'blocked'}, ${big.report.checks.length} checks)`,
    );
    ck(
      !big.report.checks.some((c) => c.id === 'G14-prologue'),
      'no G14 warning on the compact file',
    );
    const back = readManifestLocal(big.dxfText);
    ck(
      !!back && sameManifest(back, big.detail.manifest),
      'the 138-block manifest reads back and deep-equals',
    );
    // Preflight: a prologue past 48 KB (here: a 50 KB foreign comment block in front) warns,
    // never blocks.
    const pad = (t: string) =>
      `${Array.from({ length: 250 }, () => `999\r\n${'x'.repeat(200)}\r\n`).join('')}${t}`;
    const fat = await writeAndGate(job(MAIN, mainSpecs), {
      ...gateCtx(mainSpecs),
      embed: (t, m) => embedManifestLocal(pad(t), m),
    });
    const g14 = checkOf(fat.report, 'G14-prologue')[0];
    ck(
      !!g14 && !g14.ok && g14.severity === 'warn' && fat.report.passed === main.report.passed,
      'prologue > 48 KB → G14 warning, the gate verdict unchanged',
      g14?.note ?? 'no G14',
    );
  }

  // M7 ─────────────────────────────────────────────────────────────────────────────────────
  head('M7 · G3 from source topology: PDF-like walls (overshooting corners, a grazing neighbour)');
  {
    // A 100 × 60 mm piece whose four walls are open chains running 15 mm past each corner (the
    // way PDF size lines continue into the next piece) plus a neighbouring size line 0.6 mm under
    // the bottom edge that the fill grazed. `cut` meaning: the written line is layer 1.
    const W = 100;
    const H = 60;
    const rect = (k: number): PtMm[] =>
      ccw([
        { x: 0, y: 0 },
        { x: W * k, y: 0 },
        { x: W * k, y: H * k },
        { x: 0, y: H * k },
      ]);
    const wallsAt = (k: number): PtMm[][] => {
      const w = W * k;
      const h = H * k;
      return [
        [
          { x: -15, y: 0 },
          { x: w + 15, y: 0 },
        ],
        [
          { x: w, y: -15 },
          { x: w, y: h + 15 },
        ],
        [
          { x: w + 15, y: h },
          { x: -15, y: h },
        ],
        [
          { x: 0, y: h + 15 },
          { x: 0, y: -15 },
        ],
        [
          { x: -15, y: -0.6 },
          { x: w + 15, y: -0.6 },
        ],
      ];
    };
    // the output skips a 20 mm notch-free stretch of the top wall: it runs 1.5 mm inside it
    const skip = (k: number): PtMm[] => {
      const w = W * k;
      const h = H * k;
      return ccw([
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: w / 2 + 10, y: h },
        { x: w / 2 + 10, y: h - 1.5 },
        { x: w / 2 - 10, y: h - 1.5 },
        { x: w / 2 - 10, y: h },
        { x: 0, y: h },
      ]);
    };
    const spec = (skipAt: number | null) =>
      piece('PKT', 'PKT', [], {
        sizes: SIZES.map((sz) => {
          const cut = sz.rank === skipAt ? skip(sz.k) : rect(sz.k);
          const seam = offsetPoly(cut, 10);
          return sizeSpec(sz, {
            cut,
            seam,
            offset: offsetReport(seam),
            grain: grainF({ x: 50 * sz.k, y: 15 }, { x: 50 * sz.k, y: 45 }),
          });
        }),
      });
    const kOf = (rank: number) => SIZES.find((x) => x.rank === rank)!.k;
    const run = async (p: PieceSpec, vote: 'source' | 'written') =>
      (
        await writeAndGate(job(MAIN, [p]), {
          rules,
          sizeTokens: CARD_TOKENS,
          now: NOW,
          wallsOf: (_id, rank) => wallsAt(kOf(rank)),
          wallsUsedOf: (_id, rank) =>
            wallsUsedBy(
              wallsAt(kOf(rank)),
              vote === 'source' ? rect(kOf(rank)) : p.sizes.find((z) => z.rank === rank)!.cut,
            ),
        })
      ).report;
    const g3 = (r: GateReport) => checkOf(r, 'G3-coverage')[0];
    const ok = await run(spec(null), 'source');
    ck(
      g3(ok).ok,
      'positive control: overshooting walls + a grazing neighbour line → G3 passes',
      `${g3(ok).value} · ${g3(ok).note}`,
    );
    const used = wallsUsedBy(wallsAt(1), rect(1));
    const usedLen = used.reduce(
      (a, l) => a + l.slice(1).reduce((b, q, i) => b + Math.hypot(q.x - l[i].x, q.y - l[i].y), 0),
      0,
    );
    ck(
      Math.abs(usedLen - 2 * (W + H)) < 1,
      'denominator = the perimeter between the junctions (tails and the neighbour dropped)',
      `${usedLen.toFixed(1)} mm of ${2 * (W + H)}`,
    );
    {
      // I2: a variant's cutting line drawn once per size layer (two coincident copies) ends on the
      // side of a longer loop (the other variant's outline, 50 mm further down). The copy must not
      // steal the junction from the loop: the stretch past the cut leaves the denominator.
      const len = (ls: { x: number; y: number }[][]) =>
        ls.reduce(
          (a, l) =>
            a + l.slice(1).reduce((b, q, i) => b + Math.hypot(q.x - l[i].x, q.y - l[i].y), 0),
          0,
        );
      const loop = [
        { x: 0, y: -50 },
        { x: 0, y: 200 },
        { x: 100, y: 200 },
        { x: 100, y: -50 },
        { x: 0, y: -50 },
      ];
      // the cut stops 0.1 mm short of the sides (as drawn): the coincident copy is nearer
      const knife = [
        { x: 99.9, y: 0 },
        { x: 0.1, y: 0 },
      ];
      const vote = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 200 },
        { x: 0, y: 200 },
      ];
      const one = len(wallsUsedBy([loop, knife], vote));
      const two = len(wallsUsedBy([loop, knife, knife.map((q) => ({ ...q }))], vote));
      ck(
        Math.abs(one - 600) < 1 && Math.abs(two - 700) < 1.5,
        'a cutting line drawn twice still splits the loop it ends on (the duplicate does not steal the junction)',
        `one copy ${one.toFixed(1)} mm (600 = perimeter) · two copies ${two.toFixed(1)} mm (700 = perimeter + the second copy)`,
      );
    }
    for (const vote of ['source', 'written'] as const) {
      const r = await run(spec(1), vote);
      const c = g3(r);
      ck(
        !c.ok &&
          c.severity === 'block' &&
          c.blocks.includes('PKT_M') &&
          Number(c.value) < PATIMPORT.coverageBlock &&
          !r.passed,
        `negative control (${vote} line votes): output skips 20 mm of the top wall → G3 < ${PATIMPORT.coverageBlock} and blocks`,
        `${c.value} · ${c.note}`,
      );
    }
    {
      // The F13c denominator (walls trimmed to the runs within 1 mm of the OUTPUT) on the same
      // skip: the skipped stretch leaves the denominator, G3 reads ~100 % — the tautology M7 fixes.
      const p = spec(1);
      const trimmedByOutput = (rank: number): PtMm[][] => {
        const out = p.sizes.find((z) => z.rank === rank)!.cut;
        const d = (q: PtMm) =>
          Math.min(
            ...out.map((a, i) => {
              const b = out[(i + 1) % out.length];
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const t = Math.max(
                0,
                Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy)),
              );
              return Math.hypot(a.x + t * dx - q.x, a.y + t * dy - q.y);
            }),
          );
        const runs: PtMm[][] = [];
        for (const w of wallsAt(kOf(rank))) {
          let run: PtMm[] = [];
          const n = Math.ceil(Math.hypot(w[1].x - w[0].x, w[1].y - w[0].y) / 0.5);
          for (let i = 0; i <= n; i++) {
            const q = {
              x: w[0].x + ((w[1].x - w[0].x) * i) / n,
              y: w[0].y + ((w[1].y - w[0].y) * i) / n,
            };
            if (d(q) <= 0.3) run.push(q);
            else if (d(q) > 1) {
              if (run.length > 1) runs.push(run);
              run = [];
            }
          }
          if (run.length > 1) runs.push(run);
        }
        return runs;
      };
      const r = (
        await writeAndGate(job(MAIN, [p]), {
          rules,
          sizeTokens: CARD_TOKENS,
          now: NOW,
          wallsOf: (_id, rank) => wallsAt(kOf(rank)),
          wallsUsedOf: (_id, rank) => trimmedByOutput(rank),
        })
      ).report;
      ck(
        g3(r).ok,
        'control of the control: the old output-trimmed denominator lets the same skip pass G3',
        `${g3(r).value}`,
      );
    }
    // the same skip on a long piece: the share stays above 0.95, the contiguous-run rule blocks
    const long = spec(1);
    long.sizes = long.sizes.map((z) => {
      const k = 4;
      const cut = z.rank === 1 ? skip(k) : rect(k * (0.96 + 0.04 * z.rank));
      const seam = offsetPoly(cut, 10);
      return {
        ...z,
        cut,
        seam,
        offset: offsetReport(seam),
        bbox: bboxOf(cut),
        areaMm2: areaOf(cut),
      };
    });
    const r = (
      await writeAndGate(job(MAIN, [long]), {
        rules,
        sizeTokens: CARD_TOKENS,
        now: NOW,
        wallsOf: (_id, rank) => wallsAt(rank === 1 ? 4 : 4 * (0.96 + 0.04 * rank)),
        wallsUsedOf: (_id, rank) => {
          const k = rank === 1 ? 4 : 4 * (0.96 + 0.04 * rank);
          return wallsUsedBy(wallsAt(k), rect(k));
        },
      })
    ).report;
    const c = g3(r);
    ck(
      !c.ok && c.severity === 'block' && Number(c.value) >= PATIMPORT.coverageBlock,
      `400 × 240 mm piece: share ${c.value} ≥ ${PATIMPORT.coverageBlock}, but the 20 mm run off the line blocks`,
      c.note,
    );
  }

  // A8 ─────────────────────────────────────────────────────────────────────────────────────
  head('A8 · G16 lettering inside pieces · G18 grain provenance');
  {
    const one = (r: GateReport, id: GateCheckId) => checkOf(r, id)[0];
    const c0 = main.report;
    ck(
      one(c0, 'G16-glyphs').ok && one(c0, 'G18-grain-source').ok,
      'control: the T2 main scope passes G16, G18',
      `${one(c0, 'G16-glyphs').value} · ${one(c0, 'G18-grain-source').value}`,
    );
    const mb = main.detail.manifest.blocks;
    ck(
      mb.every((b) => !b.hasGrain || (b.grain && b.grain.origin === 'detected')),
      'manifest: every block with a grain records its origin (+ evidence)',
      JSON.stringify(mb.find((b) => b.block === 'BP_M')?.grain),
    );
    const bpM = main.expect.pieces
      .find((p) => p.identity === 'BP')!
      .sizes.find((z) => z.sizeToken === 'M')!;
    const ga = bpM.grain!.a;
    const gb = bpM.grain!.b;
    // a 3-vertex 8 mm stroke on layer 8 (3 vertices: the card never takes it for a grain candidate)
    const stroke = (x: number, y: number, dx = 8, dy = 0): PtMm[] => [
      { x, y },
      { x: x + dx / 2, y: y + dy / 2 + 0.5 },
      { x: x + dx, y: y + dy },
    ];
    const polyTags = (pts: PtMm[]): Pair[] => [
      ['  0', 'LWPOLYLINE'],
      ['  8', '8'],
      ['100', 'AcDbPolyline'],
      [' 90', String(pts.length)],
      [' 70', '0'],
      ...pts.flatMap((q): Pair[] => [
        [' 10', q.x.toFixed(3)],
        [' 20', q.y.toFixed(3)],
      ]),
    ];
    const C = PATIMPORT.glyphCellMm;
    const cellOf = (p: PtMm) => ({ x: Math.floor(p.x / C) * C, y: Math.floor(p.y / C) * C });
    // the manifest and the spec count the injected lines too, so only the A8 checks see them
    type Injected = { text: string; m: GateExpectation['manifest']; lines: PtMm[][] };
    const inject = (lines: PtMm[][]): Injected => {
      const m = {
        ...main.expect.manifest,
        blocks: main.expect.manifest.blocks.map((b) =>
          b.block === 'BP_M' ? { ...b, internal: b.internal + lines.length } : b,
        ),
      };
      const tags = lines.flatMap(polyTags);
      return {
        text: embedManifestLocal(injectIntoBlock(main.detail.bareText, 'BP_M', tags), m),
        m,
        lines,
      };
    };
    const gateOn = (
      t: Injected,
      origin?: GrainFeature['origin'],
      evidence?: GrainFeature['evidence'],
    ) => {
      const e = withGrain(origin, evidence);
      return runGate(t.text, {
        ...e,
        manifest: t.m,
        pieces: e.pieces.map((p) =>
          p.identity !== 'BP'
            ? p
            : {
                ...p,
                sizes: p.sizes.map((z) =>
                  z.sizeToken !== 'M'
                    ? z
                    : {
                        ...z,
                        internal: [
                          ...z.internal,
                          ...t.lines.map((pts) => ({ ...z.internal[0], pts, closed: false })),
                        ],
                      },
                ),
              },
        ),
      });
    };
    const withGrain = (origin?: GrainFeature['origin'], evidence?: GrainFeature['evidence']) => ({
      ...main.expect,
      pieces: main.expect.pieces.map((p) =>
        p.identity !== 'BP'
          ? p
          : {
              ...p,
              sizes: p.sizes.map((z) =>
                z.grain && origin ? { ...z, grain: { ...z.grain, origin, evidence } } : z,
              ),
            },
      ),
    });
    // 12 strokes in the cell of the grain's end (one of them touching it): a lettering cluster
    const c = cellOf(ga);
    const cluster: PtMm[][] = [stroke(ga.x + 0.5, ga.y + 0.5, 6, 6)];
    for (let i = 0; i < PATIMPORT.glyphMaxShortPerCell + 1; i++)
      // lettering strokes run every which way (a straight row of equal strokes is a dashed line)
      cluster.push(
        stroke(c.x + 2 + (i % 4) * 12, c.y + 4 + Math.floor(i / 4) * 15, 6, ((i * 5) % 9) - 4),
      );
    const lettered = inject(cluster);
    const rA = await gateOn(lettered, 'detected', ['arrowheads']);
    await neg('12 short strokes in one 60 mm cell (fewer than 40 in the block)', 'G16-glyphs', rA);
    ck(
      one(rA, 'G16-glyphs').blocks.includes('BP_M') &&
        one(rA, 'G16-glyphs').note.startsWith('lines inside the piece look like lettering'),
      'G16 names the block and says why in plain words',
      one(rA, 'G16-glyphs').note,
    );
    await neg('found grain (arrowheads) ending in that cluster', 'G18-grain-source', rA);
    const rA0 = await gateOn(lettered, 'detected');
    await neg(
      'found grain with no recorded evidence ending in that cluster',
      'G18-grain-source',
      rA0,
    );
    const rOp = await gateOn(lettered, 'operator', ['operator']);
    ck(
      one(rOp, 'G18-grain-source').ok && !one(rOp, 'G16-glyphs').ok,
      'operator-drawn grain in the same cluster: G18 ok (G16 still blocks the junk)',
      summary(rOp),
    );
    // 45 strokes spread 5 per cell: the per-block count blocks, no cell is dense
    const spread: PtMm[][] = [];
    for (let i = 0; i < PATIMPORT.glyphMaxShortPerBlock + 5; i++) {
      const k = Math.floor(i / 5);
      spread.push(stroke(c.x - 400 + k * C + 5 + (i % 5) * 10, c.y - 300, 6, ((i * 5) % 9) - 4));
    }
    const rB = await gateOn(inject(spread), 'detected', ['arrowheads']);
    await neg('45 short strokes in one block, ≤ 5 per cell', 'G16-glyphs', rB);
    ck(
      one(rB, 'G18-grain-source').ok,
      'grain away from them: G18 ok',
      one(rB, 'G18-grain-source').note,
    );
    // Codex (G16 review): a dashed construction line — 40 dashes of 6 mm every 10 mm — is not
    // lettering: G16 passes
    const dashes: PtMm[][] = [];
    for (let i = 0; i < PATIMPORT.glyphMaxShortPerBlock + 5; i++)
      dashes.push(stroke(c.x - 400 + i * 10, c.y - 200, 6, 0));
    const rDash = await gateOn(inject(dashes));
    ck(
      one(rDash, 'G16-glyphs').ok,
      `${dashes.length} dashes of one dashed line inside BP_M: G16 ok (a dashed line is not lettering)`,
      one(rDash, 'G16-glyphs').note,
    );
    // one short stroke across the middle of the grain line: G18 warns, the gate passes
    const mid = { x: (ga.x + gb.x) / 2, y: (ga.y + gb.y) / 2 };
    const rC = await gateOn(inject([stroke(mid.x - 4, mid.y)]), 'detected', ['word']);
    const g18c = one(rC, 'G18-grain-source');
    ck(
      rC.passed && !g18c.ok && g18c.severity === 'warn' && one(rC, 'G16-glyphs').ok,
      'one short stroke touching a found grain: G18 warns, gate passes',
      g18c.note,
    );
    // real files ─ the owner's beta DXF (wm M, 10.10) must block on G16; the corpus must not
    const blockedOf = (text: string) => {
      const raw = readRawDxf(text);
      const out: string[] = [];
      for (const [name, ents] of raw.blocks) {
        if (name.startsWith('*')) continue;
        const why = glyphProblem(glyphStats(ents));
        if (why) out.push(`${name}: ${why}`);
      }
      return { n: [...raw.blocks.keys()].filter((b) => !b.startsWith('*')).length, out };
    };
    const ownerPath =
      process.env.PATIMPORT_OWNER_DXF ??
      '/Users/jekabolt/Downloads/fw26-fw26-001-main-3ebedec0.dxf';
    let positives = 0;
    if (fs.existsSync(ownerPath)) {
      const b = blockedOf(fs.readFileSync(ownerPath, 'latin1'));
      ck(
        b.n > 0 && b.out.length === b.n,
        `owner's wm M DXF (passed on beta): G16 blocks every block (${b.out.length}/${b.n})`,
        b.out.slice(0, 2).join(' | '),
      );
      positives++;
    } else console.log(`  skip owner's DXF (${ownerPath} not here)`);
    const e2eOut = process.env.E2E_OUT ?? path.join(opts.plans, 'reports/E2E-out');
    const dxfsIn = (dir: string) =>
      fs.existsSync(path.join(e2eOut, dir))
        ? fs
            .readdirSync(path.join(e2eOut, dir))
            .filter((f) => f.endsWith('.dxf'))
            .map((f) => path.join(e2eOut, dir, f))
        : [];
    const embedded = (file: string) => readManifestLocal(fs.readFileSync(file, 'latin1'))?.gate;
    // wm M alone (an earlier e2e run) and the wm 7-file case: the lettering is in the written file
    for (const d of ['wm-M', 'wm']) {
      const files = dxfsIn(d);
      if (!files.length) {
        console.log(`  skip e2e ${d} (no ${e2eOut}/${d} — run yarn patimport:e2e first)`);
        continue;
      }
      for (const f of files) {
        const g = embedded(f);
        const c16 = g?.checks.find((x) => x.id === 'G16-glyphs');
        const b = blockedOf(fs.readFileSync(f, 'latin1'));
        // a file written before G16 carries no G16 in its gate: then only the recount speaks
        ck(
          b.out.length > 0 && (!c16 || (!g!.passed && !c16.ok && c16.severity === 'block')),
          `e2e ${d}/${path.basename(f)}: G16 blocks (${b.out.length}/${b.n} blocks lettered${c16 ? ', written gate blocked' : ', file older than G16'})`,
          c16
            ? `${c16.value}; G18 ${g?.checks.find((x) => x.id === 'G18-grain-source')?.value}`
            : b.out[0],
        );
      }
      positives++;
    }
    ck(positives > 0, 'at least one real wm M file was checked', `${positives}`);
    const negDirs = fs.existsSync(e2eOut)
      ? fs
          .readdirSync(e2eOut)
          .filter((d) => /^(dxf_|robe$|reef$|leonie)/.test(d))
          .sort()
      : [];
    for (const d of negDirs)
      for (const f of dxfsIn(d)) {
        const g = embedded(f);
        const red = (g?.checks ?? []).filter(
          (x) =>
            (x.id === 'G16-glyphs' || x.id === 'G18-grain-source') &&
            !x.ok &&
            x.severity === 'block',
        );
        const b = blockedOf(fs.readFileSync(f, 'latin1'));
        const has16 = !!g?.checks.some((x) => x.id === 'G16-glyphs');
        ck(
          !red.length && !b.out.length,
          `e2e ${d}/${path.basename(f)}: G16/G18 do not block (${b.n} blocks${has16 ? '' : ', file older than G16: recount only'})`,
          [...red.map((x) => x.note), ...b.out.slice(0, 2)].join(' | '),
        );
      }
    ck(
      negDirs.length >= 5,
      'e2e negatives present (CLO DXF, robe, reef, leonie)',
      negDirs.join(' '),
    );
    const corpus = process.env.PATIMPORT_CORPUS ?? path.join(opts.plans, 'corpus');
    const clo = path.join(corpus, 'dxf-clo');
    if (fs.existsSync(clo))
      for (const f of fs.readdirSync(clo).filter((x) => x.endsWith('.dxf'))) {
        let b: ReturnType<typeof blockedOf> | null = null;
        try {
          b = blockedOf(fs.readFileSync(path.join(clo, f), 'latin1'));
        } catch (e) {
          console.log(`  skip corpus ${f}: ${e instanceof Error ? e.message : e}`);
        }
        if (b)
          ck(
            !b.out.length,
            `corpus CLO ${f}: no block reads as lettering (${b.n} blocks)`,
            b.out.slice(0, 2).join(' | '),
          );
      }
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
