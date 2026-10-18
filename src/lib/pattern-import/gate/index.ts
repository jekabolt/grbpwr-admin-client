// gate/ — the export self-check (08-CONTRACT §5). `runGate(dxfText, expect)` = G1–G13 + G15–G18
// against the card's own parser, the gate's tag reader, the source walls and the manifest.
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
  ChromeLine,
  ContinuityGeometry,
  IdentityGeometry,
  GradeEvidence,
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
  g16,
  g18,
  g19,
  g20,
  g21,
  g22,
  g23,
  g24,
  g2From,
  g3g4,
  g5,
  g6,
  g7,
  g8,
  g9,
  sameManifest,
} from './checks';
import { g5Shape } from './shape';
import { withShapeNotes } from '../passport/digest';
import { countNotesOfBlocks, shapeFixNotes } from '../semantics/shape-check';
import { UNI_TOKEN } from '../write/plan';
import { readRawDxf } from './reader';
import { contourMm, roundTrip } from './roundtrip';
import type { CardBlockRules } from './rules';

export { roundTrip } from './roundtrip';
export type { CardBlockRules } from './rules';
export { readRawDxf } from './reader';
export { chromeProblems, glyphProblem, glyphStats } from './checks';
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
      ...g5Shape(ctx),
      g6(ctx),
      g7(ctx),
      g8(ctx),
      ...g9(ctx),
      g10(ctx),
      g11(ctx),
      g12(ctx),
      g13(expect.manifest, false),
      derived.check,
      g16(ctx),
      g18(ctx),
      g19(ctx),
      g20(ctx),
      g21(ctx),
      g22(ctx),
      g24(ctx),
      ...(expect.sheets ? [g23(ctx)] : []),
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

/** GRADE P1: the notch bumps crossed by their chord (source frame) → written frame (G3/G4). */
export function notchChordsByBlockFor(
  detail: WriteDetail,
  chordsOf: (
    sourceIdentity: string,
    rank: number,
  ) => { chord: [PtMm, PtMm]; bump: PtMm[] }[] | undefined,
): Record<string, { chord: [PtMm, PtMm]; bump: PtMm[] }[]> {
  const out: Record<string, { chord: [PtMm, PtMm]; bump: PtMm[] }[]> = {};
  for (const b of detail.plan.blocks) {
    const cs = chordsOf(b.derivedFrom ?? b.identity, b.rank);
    if (!cs?.length) continue;
    const T = detail.transforms[b.name];
    out[b.name] = cs.map((c) => ({
      chord: [applyAffine(T, c.chord[0]), applyAffine(T, c.chord[1])],
      bump: c.bump.map((p) => applyAffine(T, p)),
    }));
  }
  return out;
}

/** P1: the continuity stretches (source frame) → `continuityByBlock` in the written frame (G21). */
export function continuityByBlockFor(
  detail: WriteDetail,
  continuityOf: (sourceIdentity: string, rank: number) => ContinuityGeometry | undefined,
): Record<string, ContinuityGeometry> {
  const out: Record<string, ContinuityGeometry> = {};
  for (const b of detail.plan.blocks) {
    const g = continuityOf(b.derivedFrom ?? b.identity, b.rank);
    if (!g) continue;
    const T = detail.transforms[b.name];
    const map = (ls: PtMm[][]) => ls.map((l) => l.map((p) => applyAffine(T, p)));
    out[b.name] = {
      edges: g.edges.map((e) => ({ pts: map(e.pts), chainLines: map(e.chainLines) })),
    };
  }
  return out;
}

/** MOOD Ф0 (G22): the rank's pen lines and common edges (source frame) → written frame, per block. */
export function identityByBlockFor(
  detail: WriteDetail,
  identityOf: (sourceIdentity: string, rank: number) => IdentityGeometry | undefined,
): Record<string, IdentityGeometry> {
  const out: Record<string, IdentityGeometry> = {};
  for (const b of detail.plan.blocks) {
    const g = identityOf(b.derivedFrom ?? b.identity, b.rank);
    if (!g) continue;
    const T = detail.transforms[b.name];
    const map = (ls: PtMm[][]) => ls.map((l) => l.map((p) => applyAffine(T, p)));
    out[b.name] = {
      pen: g.pen,
      own: map(g.own),
      excused: map(g.excused),
      ...(g.shared?.length ? { shared: map(g.shared) } : {}),
      ...(g.foreign?.length ? { foreign: map(g.foreign) } : {}),
      ...(g.ownStrict ? { ownStrict: map(g.ownStrict) } : {}),
      ...(g.keyed ? { keyed: true } : {}),
      ...(g.exact ? { exact: true } : {}),
    };
  }
  return out;
}

/** MOOD Ф0 (G24): the pieces stage's "two pieces in one outline" evidence, per written block. */
export function onePieceByBlockFor(
  detail: WriteDetail,
  onePieceOf: (sourceIdentity: string, rank: number) => string | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of detail.plan.blocks) {
    const why = onePieceOf(b.derivedFrom ?? b.identity, b.rank);
    if (why) out[b.name] = why;
  }
  return out;
}

/** SILENT (G26 / G8): the pieces stage's grade evidence, per written block. */
export function gradeByBlockFor(
  detail: WriteDetail,
  gradeOf: (sourceIdentity: string, rank: number) => GradeEvidence | undefined,
): Record<string, GradeEvidence> {
  const out: Record<string, GradeEvidence> = {};
  for (const b of detail.plan.blocks) {
    const e = gradeOf(b.derivedFrom ?? b.identity, b.rank);
    if (e) out[b.name] = e;
  }
  return out;
}

/**
 * Tile chrome (sheet frame) near each block → `chromeByBlock` in the written frame (G19): the
 * lines within 5 mm of the box of the block's source walls.
 */
export function chromeByBlockFor(
  detail: WriteDetail,
  wallsOf: (sourceIdentity: string, rank: number) => PtMm[][] | undefined,
  chrome: readonly ChromeLine[],
): Record<string, ChromeLine[]> {
  const out: Record<string, ChromeLine[]> = {};
  if (!chrome.length) return out;
  const boxes = chrome.map((l) => bboxOf(l.pts));
  for (const b of detail.plan.blocks) {
    const w = wallsOf(b.derivedFrom ?? b.identity, b.rank);
    if (!w?.length) continue;
    const wb = bboxOf(w.flat());
    const near = chrome.filter((_, i) => {
      const c = boxes[i];
      return (
        c.minX <= wb.maxX + 5 &&
        c.maxX >= wb.minX - 5 &&
        c.minY <= wb.maxY + 5 &&
        c.maxY >= wb.minY - 5
      );
    });
    if (!near.length) continue;
    const T = detail.transforms[b.name];
    out[b.name] = near.map((l) => ({ mark: l.mark, pts: l.pts.map((p) => applyAffine(T, p)) }));
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
  /** GRADE P1: the notch bumps a size's line crosses by the chord (same frame as `wallsOf`). */
  notchChordsOf?: (
    sourceIdentity: string,
    rank: number,
  ) => { chord: [PtMm, PtMm]; bump: PtMm[] }[] | undefined;
  /** P1 (G21): the continuity stretches of a size closed through them (same frame). */
  continuityOf?: (sourceIdentity: string, rank: number) => ContinuityGeometry | undefined;
  /** A8b (G19): the tile chrome of the sheet (same frame as `wallsOf`), masked or offered. */
  chrome?: readonly ChromeLine[];
  /** MOOD Ф0 (G22): the rank's pen lines and the common edges (same frame as `wallsOf`). */
  identityOf?: (sourceIdentity: string, rank: number) => IdentityGeometry | undefined;
  /** MOOD Ф0 (G24): why an identity × rank's outline may hold two pieces. */
  onePieceOf?: (sourceIdentity: string, rank: number) => string | undefined;
  /** SILENT (G26 / G8): the grade model's verdict and the drawing's own lines per identity × rank. */
  gradeOf?: (sourceIdentity: string, rank: number) => GradeEvidence | undefined;
  overview?: GateExpectation['overview'];
  /**
   * Fold questions still open in this run (E1a, D3): a piece the sheet says is cut on fold, with no
   * proven edge, or the cutting list's fold pieces unchecked. Non-empty = G6 blocks every block of
   * the file until the operator answers in Details.
   */
  openFolds?: readonly string[];
  /** Vector 0.3 (default) / raster 0.5. */
  hausdorffP95Mm?: number;
  /** D6 (G23): the garment's tile sheets as the run read them (absent = one sheet). */
  sheets?: GateExpectation['sheets'];
  embed?: EmbedManifestFn;
  read?: ReadManifestFn;
  now?: () => Date;
};

/**
 * write → embed(gate: null) → runGate → embed(gate: report) → re-read → G13 (gate filled).
 * The returned text carries the final report; `report.passed` false = the scope must not be applied.
 */
/**
 * SHAPE-KINK (Codex r1): the report as the manifest carries it — the check step's working fields
 * (`shapeIssues`, `door`: the operator's one-click moves) stay in the session's report only; the
 * file's copy is the plain check (its note names the sizes), so it reads back equal.
 */
const CHANGE_NOTE =
  /^(operator: |outline straightened|sizes repaired|notches drawn as the outline)/;
const changesFirst = (ns: { identity: string; note: string }[]) => [
  ...ns.filter((n) => CHANGE_NOTE.test(n.note)),
  ...ns.filter((n) => !CHANGE_NOTE.test(n.note)),
];

function embeddable(r: GateReport): GateReport {
  if (!r.checks.some((c) => c.shapeIssues || c.door)) return r;
  return {
    ...r,
    checks: r.checks.map((c) => {
      if (!c.shapeIssues && !c.door) return c;
      const { shapeIssues: _i, door: _d, ...plain } = c;
      return plain;
    }),
  };
}

export async function writeAndGate(
  job: WriteJob,
  ctx: WriteAndGateCtx,
): Promise<{ detail: WriteDetail; dxfText: string; report: GateReport; expect: GateExpectation }> {
  const embed = ctx.embed ?? embedManifestLocal;
  const read = ctx.read ?? readManifestLocal;
  const detail0 = writeDxfDetailed(job, { embed: null, now: ctx.now });
  // SHAPE soft rule: the passport digest records the pieces whose WRITTEN sizes carry different
  // notch / drill counts (from the manifest's blocks, i.e. what the file holds)
  const detail = detail0.manifest.passport
    ? {
        ...detail0,
        manifest: {
          ...detail0.manifest,
          // SHAPE-KINK (D5, Codex r1): the geometry changes first — the digest drops from the tail
          passport: withShapeNotes(
            detail0.manifest.passport,
            changesFirst([
              ...shapeFixNotes(detail0.manifest.pieces),
              ...countNotesOfBlocks(
                detail0.manifest.blocks,
                UNI_TOKEN,
                (id) => detail0.manifest.pieces.find((p) => p.identity === id)?.gradeIntended,
              ),
            ]),
          ),
        },
      }
    : detail0;
  const m0 = detail.manifest;
  const text0 = embed(detail.bareText, m0);
  const expect: GateExpectation = {
    pieces: detail.plan.specs,
    manifest: m0,
    sizeTokens: ctx.sizeTokens,
    wallsByBlock: ctx.wallsOf ? wallsByBlockFor(detail, ctx.wallsOf) : {},
    coverageWallsByBlock: ctx.wallsUsedOf ? wallsByBlockFor(detail, ctx.wallsUsedOf) : undefined,
    derivedByBlock: ctx.derivedOf ? derivedByBlockFor(detail, ctx.derivedOf) : undefined,
    ...(ctx.notchChordsOf
      ? { notchChordsByBlock: notchChordsByBlockFor(detail, ctx.notchChordsOf) }
      : {}),
    continuityByBlock: ctx.continuityOf
      ? continuityByBlockFor(detail, ctx.continuityOf)
      : undefined,
    chromeByBlock:
      ctx.chrome?.length && ctx.wallsOf
        ? chromeByBlockFor(detail, ctx.wallsOf, ctx.chrome)
        : undefined,
    identityByBlock: ctx.identityOf ? identityByBlockFor(detail, ctx.identityOf) : undefined,
    onePieceByBlock: ctx.onePieceOf ? onePieceByBlockFor(detail, ctx.onePieceOf) : undefined,
    gradeByBlock: ctx.gradeOf ? gradeByBlockFor(detail, ctx.gradeOf) : undefined,
    overview: ctx.overview,
    hausdorffP95Mm: ctx.hausdorffP95Mm ?? PATIMPORT.hausdorffP95VectorMm,
    ...(ctx.openFolds?.length ? { openFolds: ctx.openFolds } : {}),
    ...(ctx.sheets ? { sheets: ctx.sheets } : {}),
  };
  const report = await createRunGate(ctx.rules, { read })(text0, expect);
  let m1 = { ...m0, gate: embeddable(report) };
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
    m1 = { ...m0, gate: embeddable(report) };
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
    m1 = { ...m0, gate: embeddable(report) };
    text1 = embed(detail.bareText, m1);
  }
  return {
    detail: { ...detail, dxfText: text1, manifest: m1 },
    dxfText: text1,
    report,
    expect,
  };
}
