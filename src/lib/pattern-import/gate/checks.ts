// G1–G13 (08-CONTRACT §5). Each check is a pure function of the gate context and returns one
// (rarely two) GateCheck naming the blocks it failed.

import type { PieceDTO } from 'lib/nesting/types';
import type {
  ConversionManifest,
  GateCheck,
  GateCheckId,
  GateExpectation,
  ManifestBlock,
  PieceSizeSpec,
  PieceSpec,
  PtMm,
  ReadManifestFn,
  RoundTrip,
} from '../types';
import { PATIMPORT } from '../types';
import {
  SegmentIndex,
  applyAffine,
  areaOf,
  bboxOf,
  closestOnPolyline,
  dist,
  hullRatio,
  quantile,
  reflection,
  sampleAlong,
} from '../write/geom';
import { LAYERS } from '../write/manifest-build';
import {
  GRAIN_BARB_BACK_MM,
  GRAIN_BARB_SIDE_MM,
  GRAIN_SHAFT_MM,
  UNI_TOKEN,
  blockNameOf,
} from '../write/plan';
import { identityProblem } from '../manifest/identity';
import type { RawDxf, RawEntity } from './reader';
import { contourMm } from './roundtrip';
import type { CardBlockRules } from './rules';

export type BlockInfo = {
  block: string;
  mb: ManifestBlock;
  spec: PieceSpec | null;
  size: PieceSizeSpec | null;
};

export type GateCtx = {
  text: string;
  expect: GateExpectation;
  rules: CardBlockRules;
  read: ReadManifestFn;
  rt: RoundTrip | null;
  rtError: string | null;
  raw: RawDxf | null;
  rawError: string | null;
  m: ConversionManifest;
  sizeBare: Set<string>;
  isSize: (t: string) => boolean;
  specById: Map<string, PieceSpec>;
  blocks: BlockInfo[];
  /** Card-parser contours per block (mm, absolute) by layer. */
  contours: Map<string, Map<string, PtMm[]>>;
  rtByBlock: Map<string, PieceDTO[]>;
};

const ci = (s: string) => s.trim().toLowerCase();
const fmt = (v: number, d = 3) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

function check(
  id: GateCheckId,
  failed: string[],
  severity: GateCheck['severity'],
  note: string,
  value: GateCheck['value'] = null,
  threshold: GateCheck['threshold'] = null,
): GateCheck {
  return {
    id,
    ok: failed.length === 0,
    severity,
    value,
    threshold,
    blocks: [...new Set(failed)].sort(),
    note,
  };
}

export function buildCtx(
  base: Omit<
    GateCtx,
    'sizeBare' | 'isSize' | 'specById' | 'blocks' | 'contours' | 'rtByBlock' | 'm'
  >,
): GateCtx {
  const { expect, rules, rt } = base;
  const sizeBare = new Set([...expect.sizeTokens].map((t) => rules.bareToken(t)));
  const isSize = (t: string) => sizeBare.has(rules.bareToken(t));
  const specById = new Map(expect.pieces.map((p) => [p.identity, p]));
  const m = expect.manifest;
  const blocks: BlockInfo[] = m.blocks.map((mb) => {
    const spec = specById.get(mb.identity) ?? null;
    let size: PieceSizeSpec | null = null;
    if (spec) {
      const sizes = spec.ungraded
        ? [...spec.sizes].sort((a, b) => a.rank - b.rank).slice(0, 1)
        : spec.sizes;
      size = sizes.find((s) => blockNameOf(spec, s) === mb.block) ?? null;
    }
    return { block: mb.block, mb, spec, size };
  });
  const contours = new Map<string, Map<string, PtMm[]>>();
  const rtByBlock = new Map<string, PieceDTO[]>();
  for (const p of rt?.pieces ?? []) {
    const b = p.blockName ?? '';
    const list = rtByBlock.get(b) ?? [];
    list.push(p);
    rtByBlock.set(b, list);
    const byLayer = contours.get(b) ?? new Map<string, PtMm[]>();
    if (p.layer && !byLayer.has(p.layer)) byLayer.set(p.layer, contourMm(p));
    contours.set(b, byLayer);
  }
  return { ...base, m, sizeBare, isSize, specById, blocks, contours, rtByBlock };
}

const rawOf = (ctx: GateCtx, block: string): RawEntity[] => ctx.raw?.blocks.get(block) ?? [];
const onLayer = (ents: RawEntity[], layer: string) => ents.filter((e) => e.layer === layer);
const rawCut = (ctx: GateCtx, block: string): PtMm[] | null =>
  onLayer(rawOf(ctx, block), LAYERS.cut).find(
    (e) => (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.closed,
  )?.pts ?? null;
const isDrill = (e: RawEntity) => {
  if (!e.closed || e.pts.length !== 4) return false;
  const b = bboxOf(e.pts);
  return Math.abs(b.maxX - b.minX - 10) <= 0.05 && Math.abs(b.maxY - b.minY - 10) <= 0.05;
};
const isPoly = (e: RawEntity) => e.type === 'LWPOLYLINE' || e.type === 'POLYLINE';

// ── G1 ─────────────────────────────────────────────────────────────────────────────────────

export function g1(ctx: GateCtx): GateCheck {
  const failed: string[] = [];
  const notes: string[] = [];
  if (!ctx.rt) {
    return check(
      'G1-roundtrip',
      ['*'],
      'block',
      `card parser threw: ${ctx.rtError}`,
      null,
      'exact',
    );
  }
  if (ctx.rt.failedFiles) notes.push(`failedFiles ${ctx.rt.failedFiles}`);
  if (ctx.rt.skippedBlocks) notes.push(`skippedBlocks ${ctx.rt.skippedBlocks}`);
  if (ctx.rt.failedFiles || ctx.rt.skippedBlocks) failed.push('*');
  const want = new Set(ctx.m.blocks.map((b) => ci(b.block)));
  const got = new Set(ctx.rt.blockNames.map(ci));
  const missing = ctx.m.blocks.filter((b) => !got.has(ci(b.block))).map((b) => b.block);
  const extra = ctx.rt.blockNames.filter((b) => !want.has(ci(b)));
  if (missing.length) notes.push(`not in file: ${missing.join(', ')}`);
  if (extra.length) notes.push(`not in manifest: ${extra.join(', ')}`);
  failed.push(...missing, ...extra);
  for (const { block, mb } of ctx.blocks) {
    const layers = ctx.contours.get(block);
    if (!layers?.has(LAYERS.cut)) {
      failed.push(block);
      notes.push(`${block}: no closed contour on layer 1`);
    }
    // K1 obligation 13: layers 14 and 1 always as a pair (no seam = the card adds allowance again).
    if (!mb.hasSeam) {
      failed.push(block);
      notes.push(`${block}: manifest has no seam line (layers 1+14 must be a pair)`);
    } else if (!layers?.has(LAYERS.seam)) {
      failed.push(block);
      notes.push(`${block}: no closed contour on layer 14`);
    }
  }
  if (ctx.rt.warnings.length) notes.push(`parser: ${ctx.rt.warnings.join(' | ')}`);
  return check(
    'G1-roundtrip',
    failed,
    'block',
    notes.join('; ') || 'parser reads every block with layers 1 and 14',
    ctx.rt.pieces.length,
    'exact',
  );
}

// ── G2 (unit probe, computed once per process by index.ts) ─────────────────────────────────

export function g2From(errMm: number | null, note: string): GateCheck {
  const ok = errMm != null && errMm <= PATIMPORT.squareTolMm;
  return {
    id: 'G2-square',
    ok,
    severity: 'block',
    value: errMm == null ? null : fmt(errMm, 4),
    threshold: PATIMPORT.squareTolMm,
    blocks: ok ? [] : ['SQ_UNI'],
    note,
  };
}

// ── G3 / G4 ────────────────────────────────────────────────────────────────────────────────

/** Which written line the walls describe: the drawn line (seam meaning → layer 14). */
function linesFor(ctx: GateCtx, b: BlockInfo): { line: PtMm[] | null; layer: string } {
  const layer = b.spec?.allowance.meaning === 'seam' ? LAYERS.seam : LAYERS.cut;
  return { line: ctx.contours.get(b.block)?.get(layer) ?? null, layer };
}

export function g3g4(ctx: GateCtx): [GateCheck, GateCheck] {
  const snap = PATIMPORT.snapMm;
  const p95Max = ctx.expect.hausdorffP95Mm;
  const hard: string[] = [];
  const soft: string[] = [];
  const unverified: string[] = [];
  const hd: string[] = [];
  let worstCov = 1;
  let worstP95 = 0;
  let worstMax = 0;
  const notes3: string[] = [];
  const notes4: string[] = [];
  for (const b of ctx.blocks) {
    const walls = ctx.expect.wallsByBlock[b.block];
    const { line, layer } = linesFor(ctx, b);
    if (!walls?.length) {
      unverified.push(b.block);
      continue;
    }
    if (!line) {
      hard.push(b.block);
      hd.push(b.block);
      notes3.push(`${b.block}: no written line on layer ${layer}`);
      continue;
    }
    const lineIdx = new SegmentIndex([{ pts: line, closed: true }], 5);
    let total = 0;
    let near = 0;
    for (const w of walls) {
      const s = sampleAlong(w, false, 0.5);
      for (const p of s) {
        total++;
        if (lineIdx.nearest(p, snap) <= snap) near++;
      }
    }
    const cov = total ? near / total : 0;
    worstCov = Math.min(worstCov, cov);
    if (cov < PATIMPORT.coverageBlock) hard.push(b.block);
    else if (cov < PATIMPORT.coverageWarn) soft.push(b.block);
    if (cov < PATIMPORT.coverageWarn) notes3.push(`${b.block}: ${(cov * 100).toFixed(1)} %`);

    const wallIdx = new SegmentIndex(
      walls.map((w) => ({ pts: w, closed: false })),
      5,
    );
    const d = sampleAlong(line, true, 0.5).map((p) => wallIdx.nearest(p, 20));
    const p95 = quantile(d, 0.95);
    const mx = Math.max(...d);
    worstP95 = Math.max(worstP95, p95);
    worstMax = Math.max(worstMax, mx);
    if (!(p95 <= p95Max) || !(mx <= PATIMPORT.hausdorffMaxMm)) {
      hd.push(b.block);
      notes4.push(
        `${b.block}: p95 ${p95.toFixed(3)} max ${Number.isFinite(mx) ? mx.toFixed(3) : '∞'} mm`,
      );
    }
  }
  if (unverified.length) {
    notes3.push(`no source walls for ${unverified.length} block(s) — not verified`);
    notes4.push(`no source walls for ${unverified.length} block(s) — not verified`);
  }
  // Any hard miss blocks; soft misses and unverified blocks only warn.
  const c3 = check(
    'G3-coverage',
    [...hard, ...soft, ...unverified],
    hard.length ? 'block' : soft.length || unverified.length ? 'warn' : 'block',
    notes3.join('; ') || 'every wall is on the written line',
    fmt(worstCov, 4),
    `≥ ${PATIMPORT.coverageWarn} (block < ${PATIMPORT.coverageBlock})`,
  );
  const c4 = check(
    'G4-hausdorff',
    unverified.length && !hd.length ? unverified : hd,
    hd.length ? 'block' : unverified.length ? 'warn' : 'block',
    notes4.join('; ') || `p95 ≤ ${p95Max} mm, max ≤ ${PATIMPORT.hausdorffMaxMm} mm`,
    `p95 ${fmt(worstP95)} / max ${fmt(worstMax)}`,
    `p95 ≤ ${p95Max}; max ≤ ${PATIMPORT.hausdorffMaxMm}`,
  );
  return [c3, c4];
}

// ── G5 ─────────────────────────────────────────────────────────────────────────────────────

export function g5(ctx: GateCtx): GateCheck {
  const failed: string[] = [];
  const notes: string[] = [];
  const r12 = ctx.raw?.acadver === 'AC1009';
  if (!ctx.raw) return check('G5-features', ['*'], 'block', `own reader failed: ${ctx.rawError}`);
  for (const b of ctx.blocks) {
    const ents = rawOf(ctx, b.block);
    const bad = (why: string) => {
      failed.push(b.block);
      notes.push(`${b.block}: ${why}`);
    };
    const s = b.size;
    if (!s || !b.spec) {
      bad('no spec for this block');
      continue;
    }
    const cut = rawCut(ctx, b.block);
    // notches
    const notches = onLayer(ents, LAYERS.notch).filter((e) =>
      r12 ? e.type === 'POINT' : e.type === 'LINE',
    );
    if (notches.length !== s.notches.length)
      bad(`notches ${notches.length} ≠ source ${s.notches.length}`);
    if (b.mb.notches !== notches.length)
      bad(`manifest notches ${b.mb.notches} ≠ file ${notches.length}`);
    for (const n of notches) {
      if (cut) {
        const d = closestOnPolyline(n.pts[0], cut, true).d;
        if (d > PATIMPORT.snapMm) bad(`notch ${d.toFixed(2)} mm off the cut line`);
      }
      const depth = r12 ? n.z ?? 0 : n.pts.length === 2 ? dist(n.pts[0], n.pts[1]) : 0;
      if (!(depth > 0 && depth < 10)) bad(`notch depth ${depth.toFixed(2)} mm (must be < 1 cm)`);
    }
    // grain: exactly one L7 entity; R2000 = CLO 3-vertex arrow, R12 = 2-point LINE, 180 mm shaft
    const grains = onLayer(ents, LAYERS.grain);
    if (grains.length !== 1) bad(`${grains.length} grain entities on layer 7 (exactly 1)`);
    else {
      const g = grains[0];
      const shapeOk = r12
        ? g.type === 'LINE' && g.pts.length === 2
        : g.type === 'LWPOLYLINE' && !g.closed && g.pts.length === 3;
      if (!shapeOk)
        bad(
          `grain is ${g.type}/${g.pts.length} pts, not the ${r12 ? 'R12 LINE' : 'CLO 3-vertex arrow'}`,
        );
      else {
        const [p0, p1] = g.pts;
        if (Math.abs(dist(p0, p1) - GRAIN_SHAFT_MM) > 0.01)
          bad(`grain shaft ${dist(p0, p1).toFixed(2)} mm ≠ 180`);
        if (!r12) {
          const u = { x: (p1.x - p0.x) / GRAIN_SHAFT_MM, y: (p1.y - p0.y) / GRAIN_SHAFT_MM };
          const want = {
            x: p1.x - GRAIN_BARB_BACK_MM * u.x - GRAIN_BARB_SIDE_MM * u.y,
            y: p1.y - GRAIN_BARB_BACK_MM * u.y + GRAIN_BARB_SIDE_MM * u.x,
          };
          if (dist(want, g.pts[2]) > 0.01) bad('grain barb is not the CLO barb (P1 − 27u + 13.5n)');
        }
        if (s.grain) {
          const a0 = Math.atan2(p1.y - p0.y, p1.x - p0.x);
          const a1 = Math.atan2(s.grain.b.y - s.grain.a.y, s.grain.b.x - s.grain.a.x);
          let dd = Math.abs(a0 - a1) % (2 * Math.PI);
          if (dd > Math.PI) dd = 2 * Math.PI - dd;
          if ((dd * 180) / Math.PI > 0.5)
            bad(`grain direction off by ${((dd * 180) / Math.PI).toFixed(2)}°`);
        }
      }
    }
    if (!s.grain) bad('source has no grain (export blocked)');
    if (!b.mb.hasGrain) bad('manifest hasGrain = false');
    // drills / internal (layer 8)
    const l8 = onLayer(ents, LAYERS.internal).filter(isPoly);
    const drills = l8.filter(isDrill);
    const internal = l8.filter((e) => !isDrill(e));
    if (drills.length !== s.drills.length)
      bad(`drills ${drills.length} ≠ source ${s.drills.length}`);
    const wantInternal = s.internal.length + (s.fold ? 1 : 0);
    if (internal.length !== wantInternal)
      bad(`internal lines ${internal.length} ≠ source ${wantInternal}`);
    if (b.mb.drills !== drills.length || b.mb.internal !== internal.length)
      bad('manifest drill/internal counts ≠ file');
    // K1 obligation 14: no 2-point open line ≥ 1 cm off layer 7 — the card takes it for the grain
    for (const e of internal)
      if (!e.closed && e.pts.length === 2) bad('2-point open line on layer 8');
    const cand = (ctx.rtByBlock.get(b.block)?.[0]?.grain ?? []).filter(
      (g) => g.layer !== LAYERS.grain,
    );
    if (cand.length)
      bad(
        `card parser sees grain candidates on layer(s) ${[...new Set(cand.map((g) => g.layer))].join(',')}`,
      );
    // What the CARD carries onto the marker: its layer-1 piece's inner geometry (4000-point
    // budget in pieces.ts) must still hold every notch and drill. R12 POINT notches are dropped by
    // the parser by design (K2 pitfall 2) — counted only for R2000.
    const l1 = ctx.rtByBlock.get(b.block)?.find((p) => p.layer === LAYERS.cut);
    if (l1 && !r12) {
      const inner = l1.inner ?? [];
      const n4 = inner.filter((p) => p.layer === LAYERS.notch).length;
      const n8 = inner.filter((p) => p.layer === LAYERS.internal).length;
      if (n4 !== s.notches.length) bad(`card parser keeps ${n4} of ${s.notches.length} notches`);
      if (n8 !== s.drills.length + wantInternal)
        bad(`card parser keeps ${n8} of ${s.drills.length + wantInternal} layer-8 paths`);
    }
  }
  return check(
    'G5-features',
    failed,
    'block',
    (notes.length ? notes.join('; ') + '; ' : '') +
      'grain verified by the gate reader + manifest: the card parser does not read the CLO 3-vertex arrow yet (K2 pitfall 1, task F15)',
    null,
    'exact',
  );
}

// ── G6 ─────────────────────────────────────────────────────────────────────────────────────

export const OFFSET_HULL_RATIO = 0.995;
export const OFFSET_MAX_DEV_MM = 0.2;

export function g6(ctx: GateCtx): GateCheck {
  const failed: string[] = [];
  const notes: string[] = [];
  let worstDev = 0;
  for (const b of ctx.blocks) {
    const s = b.size;
    const spec = b.spec;
    if (!s || !spec) continue;
    const bad = (why: string) => {
      failed.push(b.block);
      notes.push(`${b.block}: ${why}`);
    };
    const cut = ctx.contours.get(b.block)?.get(LAYERS.cut) ?? null;
    const seam = ctx.contours.get(b.block)?.get(LAYERS.seam) ?? null;
    // owner decision 8 + "fold edge offset 0": fold pieces are exported unfolded; the fold line
    // then spans the piece from cut line to cut line.
    if (s.fold) {
      if (!spec.unfoldedFold) bad('fold piece not unfolded');
      else if (cut) {
        const da = closestOnPolyline(s.fold.a, cut, true).d;
        const db = closestOnPolyline(s.fold.b, cut, true).d;
        if (Math.max(da, db) > PATIMPORT.snapMm)
          bad(`fold line ends ${da.toFixed(2)}/${db.toFixed(2)} mm off the cut line`);
      }
    }
    const derived = s.offset != null || spec.allowance.meaning === 'seam';
    if (!derived) continue;
    const r = s.offset;
    if (!r) {
      bad('cut line derived from the seam line without an OffsetReport');
      continue;
    }
    if (!r.ok) bad(`offset not ok${r.reason ? ` (${r.reason})` : ''}`);
    if (r.loops !== 1) bad(`offset gave ${r.loops} loops`);
    if (r.selfIntersects) bad('offset self-intersects');
    if (r.maxDeviationMm > OFFSET_MAX_DEV_MM)
      bad(`offset deviation ${r.maxDeviationMm.toFixed(3)} mm (semantics report)`);
    if (!cut || !seam) {
      bad('cut/seam pair missing — offset not verifiable');
      continue;
    }
    // Hull collapse: the derived line is (nearly) convex while the line it came from is not.
    const baseLine = spec.allowance.meaning === 'seam' ? seam : cut;
    const derivedLine = spec.allowance.meaning === 'seam' ? cut : seam;
    const hrBase = hullRatio(baseLine);
    const hrDerived = hullRatio(derivedLine);
    if (
      hrBase < OFFSET_HULL_RATIO &&
      (hrDerived >= OFFSET_HULL_RATIO || r.hullRatio >= OFFSET_HULL_RATIO)
    ) {
      bad(
        `offset collapsed to the convex hull (hull ratio ${hrDerived.toFixed(4)} vs source ${hrBase.toFixed(4)})`,
      );
    }
    // Independent parallel-curve check on the FILE: every point of the DERIVED line sits exactly
    // `allowance` from the line it came from. Upper bound only where the nearest foot is inside a
    // base edge — at base vertices the join style (round / miter / square) legitimately decides how
    // far the corner reaches; the lower bound holds everywhere (closer than the allowance = wrong).
    const allowance = spec.allowance.allowanceMm;
    const idx = new SegmentIndex([{ pts: baseLine, closed: true }], 5);
    let dev = 0;
    for (const p of sampleAlong(derivedLine, true, 1)) {
      const f = idx.nearestFoot(p, allowance * 3 + 5);
      const interior = f.t > 1e-6 && f.t < 1 - 1e-6;
      const e = interior ? Math.abs(f.d - allowance) : Math.max(0, allowance - f.d);
      dev = Math.max(dev, e);
    }
    worstDev = Math.max(worstDev, dev);
    if (dev > OFFSET_MAX_DEV_MM)
      bad(`derived line deviates ${dev.toFixed(3)} mm from a ${allowance} mm parallel`);
  }
  return check(
    'G6-offset',
    failed,
    'block',
    notes.join('; ') || 'derived lines are true parallel curves (1 loop, no hull collapse)',
    fmt(worstDev),
    `1 loop, no self-intersection, hull < ${OFFSET_HULL_RATIO}, dev ≤ ${OFFSET_MAX_DEV_MM} mm`,
  );
}

// ── G7 ─────────────────────────────────────────────────────────────────────────────────────

export function g7(ctx: GateCtx): GateCheck {
  const ov = ctx.expect.overview;
  if (!ov || !Object.keys(ov).length) {
    return check('G7-overview', [], 'warn', 'no overview sheet — not evaluated');
  }
  const failed: string[] = [];
  const notes: string[] = [];
  for (const [identity, box] of Object.entries(ov)) {
    const bs = ctx.blocks.filter((b) => b.mb.identity === identity);
    if (!bs.length) continue;
    const W = box.maxX - box.minX;
    const H = box.maxY - box.minY;
    let best = Infinity;
    let bestBlock = '';
    for (const b of bs) {
      const c = ctx.contours.get(b.block)?.get(LAYERS.cut);
      if (!c) continue;
      const bb = bboxOf(c);
      const e = Math.max(
        Math.abs(bb.maxX - bb.minX - W) -
          Math.max(PATIMPORT.overviewBboxTolMm, W * PATIMPORT.overviewBboxTolRatio),
        Math.abs(bb.maxY - bb.minY - H) -
          Math.max(PATIMPORT.overviewBboxTolMm, H * PATIMPORT.overviewBboxTolRatio),
      );
      if (e < best) {
        best = e;
        bestBlock = b.block;
      }
    }
    if (best > 0) {
      failed.push(...bs.map((b) => b.block));
      notes.push(
        `${identity}: closest size ${bestBlock} off by ${best.toFixed(2)} mm beyond tolerance`,
      );
    }
  }
  return check(
    'G7-overview',
    failed,
    'warn',
    notes.join('; ') || 'overview bbox matches',
    null,
    '±1 mm or ±1 %',
  );
}

// ── G8 ─────────────────────────────────────────────────────────────────────────────────────

export function g8(ctx: GateCtx): GateCheck {
  const failed: string[] = [];
  const notes: string[] = [];
  let worstSizes = 0;
  const rankOf = new Map(ctx.m.sizes.map((s) => [s.token, s.rank]));
  const byId = new Map<string, BlockInfo[]>();
  for (const b of ctx.blocks) {
    if (b.mb.sizeToken === UNI_TOKEN) continue;
    const list = byId.get(b.mb.identity) ?? [];
    list.push(b);
    byId.set(b.mb.identity, list);
  }
  for (const [identity, bs] of byId) {
    if (bs.length < 2) continue;
    const rows = bs
      .map((b) => {
        const c = ctx.contours.get(b.block)?.get(LAYERS.cut);
        return {
          b,
          rank: rankOf.get(b.mb.sizeToken) ?? b.size?.rank ?? 0,
          area: c ? areaOf(c) : NaN,
        };
      })
      .sort((x, y) => x.rank - y.rank);
    for (let i = 1; i < rows.length; i++) {
      if (!(rows[i].area > rows[i - 1].area)) {
        failed.push(...rows.map((r) => r.b.block));
        notes.push(
          `${identity}: ${rows[i - 1].b.mb.sizeToken} ${(rows[i - 1].area / 100).toFixed(1)} cm² ≥ ${rows[i].b.mb.sizeToken} ${(rows[i].area / 100).toFixed(1)} cm²`,
        );
        worstSizes = Math.max(worstSizes, rows.length);
        break;
      }
    }
  }
  return check(
    'G8-monotone',
    failed,
    worstSizes > 2 ? 'block' : failed.length ? 'warn' : 'block',
    notes.join('; ') || 'area grows with size rank for every identity',
    null,
    'strictly increasing (block when > 2 sizes)',
  );
}

// ── G9 ─────────────────────────────────────────────────────────────────────────────────────

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => deepEqual(v, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) if (!deepEqual(ao[k], bo[k])) return false;
  return true;
}

/** JSON-normalised (drops `undefined`, the way the embedding does). */
export const sameManifest = (a: unknown, b: unknown) =>
  deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));

export function g9(ctx: GateCtx): GateCheck[] {
  const failed: string[] = [];
  const silent: string[] = [];
  const notes: string[] = [];
  const names = ctx.rt?.blockNames ?? ctx.m.blocks.map((b) => b.block);
  const derived = ctx.rules.deriveBlockSizes(names, (t) => ctx.sizeBare.has(t));
  const bare = ctx.rules.bareToken;
  for (const b of ctx.blocks) {
    const d = derived.get(b.block);
    if (b.mb.sizeToken === UNI_TOKEN) {
      if (d !== undefined) {
        failed.push(b.block);
        notes.push(`${b.block}: card derives size ${d} for a UNI block`);
      }
      continue;
    }
    if (d === undefined) {
      silent.push(b.block);
      continue;
    }
    if (bare(d) !== bare(b.mb.sizeToken)) {
      failed.push(b.block);
      notes.push(`${b.block}: card derives ${d}, manifest says ${b.mb.sizeToken}`);
    } else if (ci(b.block.slice(0, b.block.length - d.length - 1)) !== ci(b.mb.identity)) {
      failed.push(b.block);
      notes.push(`${b.block}: card identity ≠ manifest ${b.mb.identity}`);
    }
  }
  try {
    const got = ctx.read(ctx.text);
    if (!got) {
      failed.push('*');
      notes.push('no manifest embedded');
    } else if (!sameManifest(got, ctx.m)) {
      failed.push('*');
      notes.push('embedded manifest ≠ expected manifest');
    }
  } catch (e) {
    failed.push('*');
    notes.push(`manifest unreadable: ${e instanceof Error ? e.message : e}`);
  }
  const out: GateCheck[] = [
    check(
      'G9-sizes',
      failed,
      'block',
      notes.join('; ') || 'card size derivation and embedded manifest agree',
      derived.size,
      'exact',
    ),
  ];
  if (silent.length) {
    out.push(
      check(
        'G9-sizes',
        silent,
        'warn',
        `without the manifest the card derives no size for ${silent.length} block(s) (single-size file or rare size, Codex C2) — the card relies on the manifest path (F6b) for them`,
        silent.length,
        null,
      ),
    );
  }
  return out;
}

// ── G10 ────────────────────────────────────────────────────────────────────────────────────

export function g10(ctx: GateCtx): GateCheck {
  const failed: string[] = [];
  const notes: string[] = [];
  const has = { has: (t: string) => ctx.sizeBare.has(t) };
  const uni: { raw: string; uniBase: string }[] = [];
  const graded = new Set<string>();
  for (const b of ctx.blocks) {
    const code = ctx.rules.splitBlockSize(b.block, has);
    const declared = b.mb.sizeToken === UNI_TOKEN;
    if (code.uni !== declared) {
      failed.push(b.block);
      notes.push(
        `${b.block}: ${declared ? 'ungraded piece' : 'graded block'} but the card reads uni=${code.uni}`,
      );
    }
    if (code.uni) uni.push({ raw: b.block, uniBase: code.uniBase });
    else graded.add(ci(b.mb.identity));
  }
  const groups = ctx.rules.uniGroupsOf(uni);
  const conflicts = [
    ...ctx.rules.uniDuplicateConflicts(groups),
    ...ctx.rules.uniGradedConflicts(groups, graded),
  ];
  for (const c of conflicts) {
    failed.push(...c.blocks);
    notes.push(`${c.kind}: ${c.subject} (${c.blocks.join(', ')})`);
  }
  return check(
    'G10-uni',
    failed,
    'block',
    notes.join('; ') || 'no UNI conflicts',
    conflicts.length,
    0,
  );
}

// ── G11 ────────────────────────────────────────────────────────────────────────────────────

export function g11(ctx: GateCtx): GateCheck {
  const failed: string[] = [];
  const notes: string[] = [];
  const seenBlocks = new Map<string, string>();
  const seenIds = new Map<string, string>();
  for (const p of ctx.m.pieces) {
    const k = ci(p.identity);
    if (seenIds.has(k)) {
      failed.push(p.identity);
      notes.push(`identity ${p.identity} not unique`);
    }
    seenIds.set(k, p.identity);
    // Grammar + "last token is not a size of the run" with the ONE exemption, the declared hand
    // of a pair (owner decision 9) — the same function the wizard's code cell runs
    // (manifest/identity.ts). G9 proves the card still splits FP_L_L right.
    const problem = identityProblem(p.identity, {
      isSizeToken: ctx.isSize,
      pair: { hand: p.pairHand, of: p.pairOf },
      isKnownCode: ctx.rules.isKnownCode,
    });
    if (problem) {
      failed.push(p.identity);
      notes.push(`${p.identity}: ${problem}`);
    }
    if ([p.code, ...p.mods].join('_') !== p.identity) {
      failed.push(p.identity);
      notes.push(`${p.identity}: ≠ code+mods ${[p.code, ...p.mods].join('_')}`);
    }
  }
  for (const b of ctx.m.blocks) {
    const want = `${b.identity}_${b.sizeToken}`;
    if (b.block !== want) {
      failed.push(b.block);
      notes.push(`${b.block}: not IDENTITY_SIZE (${want})`);
    }
    if (b.sizeToken !== UNI_TOKEN && !ctx.isSize(b.sizeToken)) {
      failed.push(b.block);
      notes.push(`${b.block}: size ${b.sizeToken} not in the card's run`);
    }
    if (/[^\x20-\x7e]/.test(b.block)) {
      failed.push(b.block);
      notes.push(`${b.block}: non-ASCII`);
    }
    const k = ci(b.block);
    if (seenBlocks.has(k)) {
      failed.push(b.block);
      notes.push(`block ${b.block} not unique`);
    }
    seenBlocks.set(k, b.block);
  }
  return check(
    'G11-grammar',
    failed,
    'block',
    notes.join('; ') || 'every block is IDENTITY_SIZE with a valid identity',
  );
}

// ── G12 ────────────────────────────────────────────────────────────────────────────────────

function grainOf(ctx: GateCtx, block: string): [PtMm, PtMm] | null {
  const g = onLayer(rawOf(ctx, block), LAYERS.grain)[0];
  return g && g.pts.length >= 2 ? [g.pts[0], g.pts[1]] : null;
}

export function g12(ctx: GateCtx): GateCheck {
  const failed: string[] = [];
  const notes: string[] = [];
  const pieces = new Map(ctx.m.pieces.map((p) => [p.identity, p]));
  let worstArea = 0;
  let worstBox = 0;
  for (const L of ctx.m.pieces) {
    if (!L.pairHand) continue;
    const R = L.pairOf ? pieces.get(L.pairOf) : undefined;
    if (!R) {
      failed.push(L.identity);
      notes.push(`${L.identity}: pair sibling ${L.pairOf ?? '∅'} not in this file`);
      continue;
    }
    if (R.pairOf !== L.identity || R.pairHand === L.pairHand || !R.pairHand) {
      failed.push(L.identity, R.identity);
      notes.push(`${L.identity}/${R.identity}: pairOf/pairHand not reciprocal`);
      continue;
    }
    if (L.pairHand !== 'L') continue; // each pair once, from the left hand
    const lb = ctx.m.blocks.filter((b) => b.identity === L.identity);
    const rb = new Map(
      ctx.m.blocks.filter((b) => b.identity === R.identity).map((b) => [b.sizeToken, b]),
    );
    if (lb.length !== rb.size) {
      failed.push(L.identity, R.identity);
      notes.push(`${L.identity}/${R.identity}: size sets differ`);
    }
    for (const l of lb) {
      const r = rb.get(l.sizeToken);
      if (!r) continue;
      const lc = rawCut(ctx, l.block);
      const rc = rawCut(ctx, r.block);
      if (!lc || !rc) {
        failed.push(l.block, r.block);
        notes.push(`${l.block}/${r.block}: cut line missing`);
        continue;
      }
      const la = areaOf(lc);
      const ra = areaOf(rc);
      const dA = Math.abs(la - ra) / Math.max(la, ra);
      worstArea = Math.max(worstArea, dA);
      if (dA > PATIMPORT.pairAreaTol) {
        failed.push(l.block, r.block);
        notes.push(`${l.block}/${r.block}: area differs ${(dA * 100).toFixed(3)} %`);
      }
      if (l.notches !== r.notches) {
        failed.push(l.block, r.block);
        notes.push(`${l.block}/${r.block}: notches ${l.notches} ≠ ${r.notches}`);
      }
      const lg = grainOf(ctx, l.block);
      const rg = grainOf(ctx, r.block);
      let box: number;
      if (lg && rg) {
        // Mirror L across its own grain, then align the grain tails (layout translates hands apart).
        const T = reflection(lg[0], lg[1]);
        const dx = rg[0].x - lg[0].x;
        const dy = rg[0].y - lg[0].y;
        const M = lc.map((p) => {
          const q = applyAffine(T, p);
          return { x: q.x + dx, y: q.y + dy };
        });
        const bm = bboxOf(M);
        const br = bboxOf(rc);
        box = Math.max(
          Math.abs(bm.minX - br.minX),
          Math.abs(bm.minY - br.minY),
          Math.abs(bm.maxX - br.maxX),
          Math.abs(bm.maxY - br.maxY),
        );
        const ang = (g: [PtMm, PtMm]) => Math.atan2(g[1].y - g[0].y, g[1].x - g[0].x);
        let dd = Math.abs(ang(lg) - ang(rg)) % (2 * Math.PI);
        if (dd > Math.PI) dd = 2 * Math.PI - dd;
        if ((dd * 180) / Math.PI > 0.5) {
          failed.push(l.block, r.block);
          notes.push(`${l.block}/${r.block}: grain directions differ`);
        }
      } else {
        const bl = bboxOf(lc);
        const brr = bboxOf(rc);
        box = Math.max(
          Math.abs(bl.maxX - bl.minX - (brr.maxX - brr.minX)),
          Math.abs(bl.maxY - bl.minY - (brr.maxY - brr.minY)),
        );
        notes.push(`${l.block}/${r.block}: no grain axis — compared bbox sizes only`);
      }
      worstBox = Math.max(worstBox, box);
      if (box > PATIMPORT.pairBboxTolMm) {
        failed.push(l.block, r.block);
        notes.push(
          `${l.block}/${r.block}: R is not the mirror of L across the grain (bbox off ${box.toFixed(3)} mm)`,
        );
      }
    }
  }
  return check(
    'G12-pair',
    failed,
    'block',
    notes.join('; ') || 'every _R is the mirror of its _L',
    `area ${fmt(worstArea * 100, 4)} % / bbox ${fmt(worstBox)} mm`,
    `area ±${PATIMPORT.pairAreaTol * 100} %, bbox ±${PATIMPORT.pairBboxTolMm} mm`,
  );
}

// ── G13 ────────────────────────────────────────────────────────────────────────────────────

export function g13(m: ConversionManifest, requireGate: boolean): GateCheck {
  const failed: string[] = [];
  const notes: string[] = [];
  if (m.cutLayerIsFinal !== true) notes.push('cutLayerIsFinal is not true');
  if (m.units !== 'mm') notes.push(`units ${m.units}`);
  if (JSON.stringify(m.layers) !== JSON.stringify(LAYERS))
    notes.push('layer map differs from 1/14/7/4/8');
  for (const s of m.sizes) {
    if (!(s.sizeId > 0)) {
      failed.push(s.token);
      notes.push(`size ${s.token} has no card sizeId`);
    }
  }
  const ids = new Set(m.pieces.map((p) => p.identity));
  for (const p of m.pieces) {
    if (!p.fabrics.length) {
      failed.push(p.identity);
      notes.push(`${p.identity}: no fabric`);
    }
  }
  for (const b of m.blocks) {
    if (!ids.has(b.identity)) {
      failed.push(b.block);
      notes.push(`${b.block}: identity ${b.identity} not in pieces`);
    }
    if (!(b.sizeId > 0)) {
      failed.push(b.block);
      notes.push(`${b.block}: no card sizeId`);
    }
  }
  if (requireGate && !m.gate) notes.push('gate report not embedded');
  if (notes.length && !failed.length) failed.push('*');
  return check('G13-manifest', failed, 'block', notes.join('; ') || 'manifest invariants hold');
}
