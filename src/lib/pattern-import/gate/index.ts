// gate/ — the export self-check (08-CONTRACT §5). `runGate(dxfText, expect)` = G1–G13 + G15 against
// the card's own parser, the gate's tag reader, the source walls and the manifest.
//
//   createRunGate(rules)   → RunGateFn   (card block-name rules injected: see rules.ts)
//   roundTrip(text)        → card parser view (G1)
//   squareProbe()          → G2 unit probe (100 mm square → write → parse), memoised per process
//   writeAndGate(job, ctx) → write → embed → gate → embed WITH the report → re-read → G13
//
// `expect.pieces` must be the WRITTEN-frame specs (`WriteDetail.plan.specs`) and
// `expect.wallsByBlock` the source walls mapped through `WriteDetail.transforms[block]`
// (`wallsByBlockFor` does that) — the writer lays identities out on a shelf and derives mirrors.
// Walls are SOURCE chains only; the outline's derived edges travel apart in `expect.derivedByBlock`
// (`derivedByBlockFor`) and are judged by G15, never measured against (F14b, Codex C1).

import type {
  DerivedEdge,
  EmbedManifestFn,
  GateCheck,
  GateExpectation,
  GateReport,
  PieceSpec,
  PtMm,
  ReadManifestFn,
  RunGateFn,
  WriteJob,
} from '../types';
import { PATIMPORT } from '../types';
import { applyAffine, bboxOf } from '../write/geom';
import { type WriteDetail, writeDxfDetailed } from '../write';
import {
  embedManifest as embedManifestLocal,
  manifestPrologueBytes,
  readManifest as readManifestLocal,
} from '../manifest';
import { LAYERS } from '../write/manifest-build';
import {
  buildCtx,
  g1,
  g10,
  g11,
  g12,
  g13,
  g15,
  g2From,
  g3g4,
  g5,
  g6,
  g7,
  g8,
  g9,
  sameManifest,
} from './checks';
import { readRawDxf } from './reader';
import { contourMm, roundTrip } from './roundtrip';
import type { CardBlockRules } from './rules';

export { roundTrip } from './roundtrip';
export type { CardBlockRules } from './rules';
export { readRawDxf } from './reader';
export { identityGrammarProblem, identityProblem } from '../manifest/identity';

export const passedOf = (checks: readonly GateCheck[]) =>
  checks.every((c) => c.ok || c.severity === 'warn');

// ── G2: the 100 mm square ──────────────────────────────────────────────────────────────────

const SQUARE_SIZE = { token: 'M', sizeId: 1, name: 'm', sourceLabel: 'M', rank: 0 };

export function squareSpec(): PieceSpec {
  const sq = (o: number, s: number): PtMm[] => [
    { x: o, y: o },
    { x: o + s, y: o },
    { x: o + s, y: o + s },
    { x: o, y: o + s },
  ];
  return {
    identity: 'SQ',
    code: 'SQ',
    mods: [],
    displayName: 'test square',
    nameOrigin: 'operator',
    seed: 0,
    variant: null,
    pairHand: null,
    pairOf: null,
    unfoldedFold: false,
    piecesPerGarment: 1,
    allowance: { meaning: 'cut', allowanceMm: 10, origin: 'operator', evidence: [] },
    fabrics: ['probe'],
    fused: false,
    ungraded: true,
    sizes: [
      {
        rank: 0,
        sizeToken: 'M',
        sizeId: 1,
        cut: sq(0, 100),
        seam: sq(10, 80),
        grain: {
          kind: 'grain',
          a: { x: 50, y: 10 },
          b: { x: 50, y: 90 },
          angleDeg: 90,
          origin: 'operator',
          ranges: [],
          confidence: 1,
        },
        notches: [],
        drills: [],
        internal: [],
        fold: null,
        offset: null,
        walls: [],
        bbox: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
        areaMm2: 10000,
      },
    ],
  };
}

let squareMemo: Promise<GateCheck> | null = null;

export function squareProbe(): Promise<GateCheck> {
  squareMemo ??= (async () => {
    try {
      const d = writeDxfDetailed(
        {
          techCardId: 0,
          scope: {
            scopeKey: 'probe',
            fabricPurpose: 'probe',
            bomLineKey: '',
            label: 'probe',
            isInterlining: false,
          },
          pieces: [squareSpec()],
          sizes: [SQUARE_SIZE],
          source: {
            files: [],
            scale: { method: 'none', factor: 1, measuredMm: null, declaredMm: null },
            sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
            sizeEncoding: 'single',
            variant: null,
          },
          generator: 'gate/G2',
          dialect: 'r2000',
        },
        { embed: null, now: () => new Date(0) },
      );
      const rt = await roundTrip(d.dxfText, 'g2-square.dxf');
      const p = rt.pieces.find((x) => x.layer === LAYERS.cut);
      if (!p) return g2From(null, 'square not read back on layer 1');
      const b = bboxOf(contourMm(p));
      const err = Math.max(Math.abs(b.maxX - b.minX - 100), Math.abs(b.maxY - b.minY - 100));
      return g2From(
        err,
        `100 mm square reads back ${(b.maxX - b.minX).toFixed(4)} × ${(b.maxY - b.minY).toFixed(4)} mm`,
      );
    } catch (e) {
      return g2From(null, `square probe failed: ${e instanceof Error ? e.message : e}`);
    }
  })();
  return squareMemo;
}

// ── runGate ────────────────────────────────────────────────────────────────────────────────

export function createRunGate(
  rules: CardBlockRules,
  opts: { read?: ReadManifestFn } = {},
): RunGateFn {
  const read = opts.read ?? readManifestLocal;
  return async (dxfText: string, expect: GateExpectation): Promise<GateReport> => {
    const t0 = Date.now();
    let rt = null;
    let rtError: string | null = null;
    try {
      rt = await roundTrip(dxfText);
    } catch (e) {
      rtError = e instanceof Error ? e.message : String(e);
    }
    let raw = null;
    let rawError: string | null = null;
    try {
      raw = readRawDxf(dxfText);
    } catch (e) {
      rawError = e instanceof Error ? e.message : String(e);
    }
    const ctx = buildCtx({ text: dxfText, expect, rules, read, rt, rtError, raw, rawError });
    const derived = g15(ctx);
    const checks: GateCheck[] = [
      g1(ctx),
      await squareProbe(),
      ...g3g4(ctx, derived.ok),
      g5(ctx),
      g6(ctx),
      g7(ctx),
      g8(ctx),
      ...g9(ctx),
      g10(ctx),
      g11(ctx),
      g12(ctx),
      g13(expect.manifest, false),
      derived.check,
    ];
    return {
      passed: passedOf(checks),
      checks,
      durationMs: Date.now() - t0,
      // the audited list rides in the manifest with the report (absent when there is nothing)
      ...(derived.audit.length ? { derived: derived.audit } : {}),
    };
  };
}

// ── the write stage's pipeline ─────────────────────────────────────────────────────────────

/** Source walls (source frame, per identity × rank) → `wallsByBlock` in the written frame. */
export function wallsByBlockFor(
  detail: WriteDetail,
  wallsOf: (sourceIdentity: string, rank: number) => PtMm[][] | undefined,
): Record<string, PtMm[][]> {
  const out: Record<string, PtMm[][]> = {};
  for (const b of detail.plan.blocks) {
    const w = wallsOf(b.derivedFrom ?? b.identity, b.rank);
    if (!w?.length) continue;
    const T = detail.transforms[b.name];
    out[b.name] = w.map((line) => line.map((p) => applyAffine(T, p)));
  }
  return out;
}

/** The outline's derived edges (source frame) → `derivedByBlock` in the written frame (G15). */
export function derivedByBlockFor(
  detail: WriteDetail,
  derivedOf: (sourceIdentity: string, rank: number) => DerivedEdge[] | undefined,
): Record<string, DerivedEdge[]> {
  const out: Record<string, DerivedEdge[]> = {};
  for (const b of detail.plan.blocks) {
    const d = derivedOf(b.derivedFrom ?? b.identity, b.rank);
    if (!d?.length) continue;
    const T = detail.transforms[b.name];
    const map = (l: PtMm[]) => l.map((p) => applyAffine(T, p));
    out[b.name] = d.map((e) => ({
      kind: e.kind,
      pts: map(e.pts),
      ...(e.along ? { along: e.along.map(map) } : {}),
    }));
  }
  return out;
}

export type WriteAndGateCtx = {
  rules: CardBlockRules;
  sizeTokens: ReadonlySet<string>;
  /** Source walls (whole chains are fine): G4 measures the written line against them. */
  wallsOf?: (sourceIdentity: string, rank: number) => PtMm[][] | undefined;
  /**
   * The stretches of those walls the piece uses (G3's denominator, M7 — cut by source topology,
   * see worker/walls-used.ts). Absent = `wallsOf`.
   */
  wallsUsedOf?: (sourceIdentity: string, rank: number) => PtMm[][] | undefined;
  /**
   * The outline's derived edges (F4b bridges, operator bridges, band cuts), same frame as
   * `wallsOf` — G15 checks them; G3/G4 never use them as walls (F14b, Codex C1).
   */
  derivedOf?: (sourceIdentity: string, rank: number) => DerivedEdge[] | undefined;
  overview?: GateExpectation['overview'];
  /** Vector 0.3 (default) / raster 0.5. */
  hausdorffP95Mm?: number;
  embed?: EmbedManifestFn;
  read?: ReadManifestFn;
  now?: () => Date;
};

/**
 * write → embed(gate: null) → runGate → embed(gate: report) → re-read → G13 (gate filled).
 * The returned text carries the final report; `report.passed` false = the scope must not be applied.
 */
export async function writeAndGate(
  job: WriteJob,
  ctx: WriteAndGateCtx,
): Promise<{ detail: WriteDetail; dxfText: string; report: GateReport; expect: GateExpectation }> {
  const embed = ctx.embed ?? embedManifestLocal;
  const read = ctx.read ?? readManifestLocal;
  const detail = writeDxfDetailed(job, { embed: null, now: ctx.now });
  const m0 = detail.manifest;
  const text0 = embed(detail.bareText, m0);
  const expect: GateExpectation = {
    pieces: detail.plan.specs,
    manifest: m0,
    sizeTokens: ctx.sizeTokens,
    wallsByBlock: ctx.wallsOf ? wallsByBlockFor(detail, ctx.wallsOf) : {},
    coverageWallsByBlock: ctx.wallsUsedOf ? wallsByBlockFor(detail, ctx.wallsUsedOf) : undefined,
    derivedByBlock: ctx.derivedOf ? derivedByBlockFor(detail, ctx.derivedOf) : undefined,
    overview: ctx.overview,
    hausdorffP95Mm: ctx.hausdorffP95Mm ?? PATIMPORT.hausdorffP95VectorMm,
  };
  const report = await createRunGate(ctx.rules, { read })(text0, expect);
  let m1 = { ...m0, gate: report };
  let text1 = embed(detail.bareText, m1);
  // Preflight (M1): the manifest rides in front of `0 / SECTION`; a sniffer with a bounded head
  // window (the backend's was 64 KB) would refuse the upload as "not a DXF". Compressed manifests
  // keep even a 138-block sheet near 10 KB; a prologue past the limit is reported, never blocked —
  // the file is still a valid DXF, the warning names the risk.
  const prologue = manifestPrologueBytes(text1);
  if (prologue > PATIMPORT.manifestPrologueWarnBytes) {
    report.checks.push({
      id: 'G14-prologue',
      ok: false,
      severity: 'warn',
      value: prologue,
      threshold: `≤ ${PATIMPORT.manifestPrologueWarnBytes} bytes`,
      blocks: [],
      note: `the manifest in front of the drawing is ${(prologue / 1024).toFixed(1)} KB (limit ${PATIMPORT.manifestPrologueWarnBytes / 1024} KB); an upload sniffer with a short head window may refuse the file`,
    });
    report.passed = passedOf(report.checks);
    m1 = { ...m0, gate: report };
    text1 = embed(detail.bareText, m1);
  }
  // Re-read what will actually be uploaded: the report must be IN the file (G13 "gate filled").
  // The other G13 invariants already ran inside runGate; this adds only the post-embed half.
  let final: GateCheck = {
    id: 'G13-manifest',
    ok: true,
    severity: 'block',
    value: null,
    threshold: null,
    blocks: [],
    note: 'gate report embedded and read back',
  };
  try {
    const back = read(text1);
    if (!back || !back.gate || !sameManifest(back, m1)) {
      final = {
        ...final,
        ok: false,
        blocks: ['*'],
        note: 'embedded manifest does not carry the gate report',
      };
    }
  } catch (e) {
    final = {
      ...final,
      ok: false,
      blocks: ['*'],
      note: `manifest unreadable after embedding: ${e instanceof Error ? e.message : e}`,
    };
  }
  if (!final.ok) {
    report.checks.push(final);
    report.passed = passedOf(report.checks);
    m1 = { ...m0, gate: report };
    text1 = embed(detail.bareText, m1);
  }
  return {
    detail: { ...detail, dxfText: text1, manifest: m1 },
    dxfText: text1,
    report,
    expect,
  };
}
